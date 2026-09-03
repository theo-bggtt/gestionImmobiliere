// app/lib/plans/plans.server.ts
// Le plan et ses points. Deux idées portent tout le fichier :
//
// 1. Un point EST un élément. Aucune requête sur `point` qui ne joigne
//    `element` et ne passe la `Portee` : sans ça, un lien de partage
//    montrerait sur le plan ce qu'il masque dans la liste.
// 2. Une géométrie divulgue autant qu'un compte. Le sélecteur de niveau d'un
//    partage ne liste que les plans dont une zone est visible — dire
//    « Sous-sol » à un jardinier lui apprend qu'il y a un sous-sol.
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/client";
import { element, fichier, plan, point } from "../../db/schema/index";
import { chargerRessourceOu404 } from "../db/scopedResource.server";
import {
  clausePortee,
  porteeRestreinte,
  PORTEE_PROPRIETAIRE,
  type Portee,
} from "../recherche/recherche.server";
import { traiterImage, type Recadrage } from "../images/traitement.server";
import { cheminVignette, sauvegarder, supprimer } from "../stockage/fichiers.server";
import {
  LARGEUR_MAX_PLAN,
  QUALITE_PLAN,
  type PlanEtiquete,
  type PlanListe,
  type PointPlan,
  type PolygoneZone,
  type TypePlan,
} from "./types";

export type Geometrie = { rotation: number; recadrage?: Recadrage };

const borner = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const nombre = (v: unknown, defaut: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : defaut;
};

/**
 * La géométrie voyage en cinq nombres, pas en pixels déjà découpés : le
 * navigateur envoie les octets d'origine et dit ce qu'il faut en faire.
 * Un seul encodage, et le résultat se vérifie sans navigateur.
 *
 * Un rectangle plein écran ne vaut pas la peine d'un recadrage : `undefined`
 * évite alors la passe de géométrie, donc un ré-encodage inutile.
 */
export function lireGeometrie(form: FormData): Geometrie {
  const rotation = borner(nombre(form.get("rotation"), 0), -360, 360);

  let brut: unknown = null;
  try {
    brut = JSON.parse(String(form.get("recadrage") ?? "null"));
  } catch {
    brut = null;
  }
  if (brut === null || typeof brut !== "object") return { rotation };

  const r = brut as Record<string, unknown>;
  const x = borner(nombre(r.x, 0), 0, 99);
  const y = borner(nombre(r.y, 0), 0, 99);
  const largeur = borner(nombre(r.largeur, 100), 1, 100 - x);
  const hauteur = borner(nombre(r.hauteur, 100), 1, 100 - y);
  const entier = x === 0 && y === 0 && largeur === 100 && hauteur === 100;

  return { rotation, recadrage: entier ? undefined : { x, y, largeur, hauteur } };
}

/**
 * Un plan est visible d'un partage si au moins une zone de son niveau porte
 * un objet visible — le plan de situation couvrant les zones extérieures,
 * celles dont `niveau_id` est nul. C'est exactement la règle de la grille de
 * zones : une tuile « Local technique · 0 objet » et une entrée « Sous-sol »
 * dans un sélecteur divulguent la même chose.
 *
 * Corollaire assumé : un point visible posé sur un plan dont aucune zone ne
 * l'est reste inatteignable (le cas d'une colonne de chute qui traverse un
 * niveau interdit). C'est une perte, pas une fuite.
 *
 * Exportée : la route à jeton doit autoriser l'image d'un plan par ce même
 * prédicat, pas par une seconde écriture de la même idée.
 */
export function clausePlanVisible(portee: Portee, aliasPlan = sql.raw("p")) {
  if (!porteeRestreinte(portee)) return sql`true`;
  return sql`EXISTS (
    SELECT 1
    FROM element e
    JOIN zone z ON z.id = e.zone_id
    WHERE z.propriete_id = ${aliasPlan}.propriete_id
      AND (CASE WHEN ${aliasPlan}.type = 'situation'
                THEN z.niveau_id IS NULL
                ELSE z.niveau_id = ${aliasPlan}.niveau_id END)
      AND ${clausePortee(portee)}
  )`;
}

/**
 * Le sélecteur de niveau. Trié par `niveau.ordinal` — l'entier signé, jamais
 * le nom (« combles » avant « rez » en alphabétique) ni l'identifiant — et le
 * plan de situation en fin de liste, à part, comme les zones extérieures le
 * sont déjà dans la grille.
 */
export async function chargerPlans(
  proprieteId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<PlanListe[]> {
  const lignes = await db.execute<PlanListe>(sql`
    SELECT
      p.id,
      p.type,
      p.nom,
      p.niveau_id         AS "niveauId",
      n.nom               AS "niveauNom",
      b.nom               AS "batimentNom",
      n.ordinal           AS "ordinal",
      p.ordre,
      p.image_fichier_id  AS "imageFichierId",
      row_number() OVER (PARTITION BY p.type, p.niveau_id ORDER BY p.ordre, p.id)::int AS "rang"
    FROM plan p
    LEFT JOIN niveau n ON n.id = p.niveau_id
    LEFT JOIN batiment b ON b.id = n.batiment_id
    WHERE p.propriete_id = ${proprieteId}
      AND ${clausePlanVisible(portee)}
    ORDER BY (p.type = 'situation'), b.ordre NULLS FIRST, n.ordinal, p.ordre, p.id
  `);
  return lignes.rows;
}

/**
 * L'étiquette servie à un porteur de lien. `plan.nom` est saisi librement par
 * le propriétaire, qui peut y avoir écrit l'adresse ou l'EGID (règle non
 * négociable #7) : il ne sort pas de ses écrans, comme `partage.nom`.
 *
 * Le repli est `niveau.nom`, déjà rendu sur la page de partage par le chemin
 * d'une zone et déjà listé comme non filtré dans la revue de fuite. On
 * n'ouvre donc pas une classe de fuite, on en réutilise une documentée.
 */
export const etiquettePlan = (p: PlanListe): string => {
  if (p.type === "situation") return p.rang > 1 ? `Situation ${p.rang}` : "Situation";
  const base = p.niveauNom ?? "Niveau";
  return p.rang > 1 ? `${base} · plan ${p.rang}` : base;
};

export const etiqueter = (plans: PlanListe[]): PlanEtiquete[] =>
  plans.map((p) => ({ id: p.id, etiquette: etiquettePlan(p), situation: p.type === "situation" }));

/** Règle non négociable #1 de l'étape : jamais `point` sans `element` ni portée. */
export async function chargerPointsDuPlan(
  proprieteId: number,
  planId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<PointPlan[]> {
  const lignes = await db.execute<PointPlan>(sql`
    SELECT
      pt.id,
      pt.x,
      pt.y,
      e.id  AS "elementId",
      e.nom AS "nom",
      t.nom AS "typeNom",
      z.nom AS "zoneNom"
    FROM point pt
    JOIN element e ON e.id = pt.element_id
    JOIN zone z ON z.id = e.zone_id
    JOIN type_element t ON t.id = e.type_id
    WHERE pt.plan_id = ${planId}
      AND e.propriete_id = ${proprieteId}
      AND ${clausePortee(portee)}
    ORDER BY e.nom, pt.id
  `);
  return lignes.rows;
}

/**
 * `zone_geom` n'est alimentée par rien à cette étape (l'éditeur de tracé est
 * l'étape 6) : cette requête lit une table vide. Elle est écrite filtrée
 * maintenant plutôt que plus tard — un polygone est le contour d'une zone,
 * donc sa surface, sa position et son existence. La règle est celle de la
 * grille : sous portée restreinte, une zone sans objet visible n'est pas
 * servie.
 */
export async function chargerPolygonesDuPlan(
  proprieteId: number,
  planId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<PolygoneZone[]> {
  const lignes = await db.execute<{ zoneId: number; nom: string; polygone: unknown }>(sql`
    SELECT g.zone_id AS "zoneId", z.nom, g.polygone
    FROM zone_geom g
    JOIN zone z ON z.id = g.zone_id
    WHERE g.plan_id = ${planId}
      AND z.propriete_id = ${proprieteId}
      AND (${!porteeRestreinte(portee)}::boolean
           OR EXISTS (SELECT 1 FROM element e WHERE e.zone_id = z.id AND ${clausePortee(portee)}))
    ORDER BY z.nom
  `);

  return lignes.rows.map((l) => ({
    zoneId: l.zoneId,
    nom: l.nom,
    sommets: Array.isArray(l.polygone)
      ? (l.polygone as { x: number; y: number }[]).filter((s) => typeof s?.x === "number" && typeof s?.y === "number")
      : [],
  }));
}

export const chargerPlanOu404 = (proprieteId: number, planIdBrut: string | number | undefined) =>
  chargerRessourceOu404(
    plan,
    and(eq(plan.id, Number(planIdBrut)), eq(plan.proprieteId, proprieteId)),
    "Plan introuvable",
  );

/** Les plans sur lesquels une fiche est déjà posée : « déjà sur Sous-sol ». */
export async function chargerPlansDeLElement(proprieteId: number, elementId: number) {
  const lignes = await db.execute<{ planId: number; pointId: number }>(sql`
    SELECT pt.plan_id AS "planId", pt.id AS "pointId"
    FROM point pt
    JOIN plan p ON p.id = pt.plan_id
    JOIN element e ON e.id = pt.element_id
    WHERE pt.element_id = ${elementId}
      AND p.propriete_id = ${proprieteId}
      AND e.propriete_id = ${proprieteId}
  `);
  return lignes.rows;
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/**
 * L'image d'un plan est un `fichier` comme un autre : même stockage, même
 * effacement EXIF, mais une résolution et une qualité qui lui sont propres —
 * du trait fin et du texte, pas une photo d'objet.
 */
async function enregistrerImage(proprieteId: number, image: Buffer, geometrie: Geometrie) {
  const traitee = await traiterImage(image, {
    largeurMax: LARGEUR_MAX_PLAN,
    qualite: QUALITE_PLAN,
    rotation: geometrie.rotation,
    recadrage: geometrie.recadrage,
  });

  const chemin = `propriete-${proprieteId}/plans/${randomUUID()}.jpg`;
  await sauvegarder(chemin, traitee.original);
  await sauvegarder(cheminVignette(chemin), traitee.vignette);

  try {
    const [f] = await db
      .insert(fichier)
      .values({
        proprieteId,
        chemin,
        typeMime: "image/jpeg",
        taille: traitee.original.byteLength,
        // `fichier.niveau` vaut 3 partout depuis la capture, et la route à
        // jeton l'ignore délibérément (décision #55) : c'est le plan qui
        // porte la permission de lire son image, comme la fiche porte celle
        // de lire ses photos.
        niveau: 3,
        exifEfface: true,
      })
      .returning({ id: fichier.id });
    return f.id;
  } catch (e) {
    // Ne pas laisser d'image orpheline sur le volume si la base a refusé.
    await supprimer(chemin);
    await supprimer(cheminVignette(chemin));
    throw e;
  }
}

async function effacerImage(fichierId: number | null) {
  if (fichierId === null) return;
  const [f] = await db.select({ chemin: fichier.chemin }).from(fichier).where(eq(fichier.id, fichierId));
  await db.delete(fichier).where(eq(fichier.id, fichierId));
  if (f) {
    await supprimer(f.chemin);
    await supprimer(cheminVignette(f.chemin));
  }
}

export async function creerPlan(opts: {
  proprieteId: number;
  type: TypePlan;
  niveauId: number | null;
  nom: string;
  ordre: number;
  image: Buffer;
  geometrie: Geometrie;
}) {
  const imageFichierId = await enregistrerImage(opts.proprieteId, opts.image, opts.geometrie);
  const [cree] = await db
    .insert(plan)
    .values({
      proprieteId: opts.proprieteId,
      type: opts.type,
      // La contrainte `plan_type_niveau_coherent` refuse le couple incohérent
      // en base : la route n'a pas à être le seul garde-fou.
      niveauId: opts.type === "situation" ? null : opts.niveauId,
      nom: opts.nom,
      imageFichierId,
      ordre: opts.ordre,
    })
    .returning({ id: plan.id });
  return cree.id;
}

/**
 * Remplacer l'image ne touche à aucun point : c'est tout l'intérêt des
 * pourcentages. Le relevé de l'électricien scanné de travers peut être
 * remplacé par le plan propre de l'architecte, dans d'autres dimensions,
 * sans repositionner quoi que ce soit.
 */
export async function remplacerImagePlan(
  proprieteId: number,
  planId: number,
  image: Buffer,
  geometrie: Geometrie,
) {
  const existant = await chargerPlanOu404(proprieteId, planId);
  const imageFichierId = await enregistrerImage(proprieteId, image, geometrie);
  await db.update(plan).set({ imageFichierId }).where(eq(plan.id, existant.id));
  await effacerImage(existant.imageFichierId);
}

export async function supprimerPlan(proprieteId: number, planId: number) {
  const existant = await chargerPlanOu404(proprieteId, planId);
  // Les points du plan tombent par cascade : ils n'ont de sens que sur lui.
  await db.delete(plan).where(eq(plan.id, existant.id));
  await effacerImage(existant.imageFichierId);
}

/**
 * `point` ne porte pas `proprieteId` : il l'atteint par `plan`, comme
 * `niveau` l'atteint par `batiment` (`zoneTree.ts`). Vérifié à la main,
 * jamais supposé — et 404 sans distinguer « n'existe pas » de « n'est pas à
 * vous ».
 */
async function pointOu404(proprieteId: number, pointId: number) {
  const [ligne] = await db
    .select({ id: point.id, planId: point.planId })
    .from(point)
    .innerJoin(plan, eq(plan.id, point.planId))
    .where(and(eq(point.id, pointId), eq(plan.proprieteId, proprieteId)));
  if (!ligne) throw new Response("Point introuvable", { status: 404 });
  return ligne;
}

/**
 * Poser ou déplacer, c'est la même opération. Un élément déjà placé sur ce
 * plan voit son point bougé plutôt que doublé ; sur un AUTRE plan il en
 * gagne un second, et c'est le cas d'usage (une gaine technique traverse les
 * niveaux, un seul objet en base, un point par plan traversé).
 */
export async function poserPoint(
  proprieteId: number,
  planId: number,
  elementId: number,
  x: number,
  y: number,
) {
  await chargerPlanOu404(proprieteId, planId);
  const [cible] = await db
    .select({ id: element.id })
    .from(element)
    .where(and(eq(element.id, elementId), eq(element.proprieteId, proprieteId)));
  if (!cible) throw new Response("Fiche introuvable", { status: 404 });

  const [deja] = await db
    .select({ id: point.id })
    .from(point)
    .where(and(eq(point.planId, planId), eq(point.elementId, elementId)));

  if (deja) {
    await db.update(point).set({ x, y }).where(eq(point.id, deja.id));
    return deja.id;
  }

  const [cree] = await db.insert(point).values({ planId, elementId, x, y }).returning({ id: point.id });
  return cree.id;
}

export async function deplacerPoint(proprieteId: number, pointId: number, x: number, y: number) {
  const p = await pointOu404(proprieteId, pointId);
  await db.update(point).set({ x, y }).where(eq(point.id, p.id));
}

export async function retirerPoint(proprieteId: number, pointId: number) {
  const p = await pointOu404(proprieteId, pointId);
  await db.delete(point).where(eq(point.id, p.id));
}
