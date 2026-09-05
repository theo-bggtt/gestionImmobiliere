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
import { element, fichier, plan, point, zone, zoneGeom } from "../../db/schema/index";
import { chargerRessourceOu404 } from "../db/scopedResource.server";
import {
  clausePortee,
  porteeRestreinte,
  PORTEE_PROPRIETAIRE,
  type Portee,
} from "../recherche/recherche.server";
import { traiterImage, type Recadrage } from "../images/traitement.server";
import { cheminMoyenne, cheminVignette, sauvegarder, supprimer } from "../stockage/fichiers.server";
import {
  LARGEUR_MAX_PLAN,
  LARGEUR_MOYENNE_PLAN,
  QUALITE_PLAN,
  type PlanEtiquete,
  type PlanListe,
  type PointPlan,
  type PolygoneZone,
  type Sommet,
  type TypePlan,
  type ZoneTracable,
} from "./types";
import { zoneDuPoint } from "./geometrie";

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
 * La couverture d'un plan : quelles zones il porte. Un plan d'étage porte les
 * zones de son niveau, un plan de situation les zones extérieures — c'est le
 * couple que `plan_type_niveau_coherent` (migration 0006) rend cohérent.
 *
 * Exportée et appelée par les DEUX endroits qui en dépendent : ce qu'un plan
 * SERT (`clausePlanVisible`) et ce qu'on peut y TRACER
 * (`chargerZonesTracables`). Les laisser diverger voudrait dire tracer un
 * contour sur un plan qui ne sert pas la zone, ou l'inverse — et un contour
 * sert à proposer d'écrire `element.zone_id`.
 */
export function clauseCouverturePlan(aliasPlan = sql.raw("p"), aliasZone = sql.raw("z")) {
  return sql`(CASE WHEN ${aliasPlan}.type = 'situation'
                   THEN ${aliasZone}.niveau_id IS NULL
                   ELSE ${aliasZone}.niveau_id = ${aliasPlan}.niveau_id END)`;
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
      AND ${clauseCouverturePlan(aliasPlan)}
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
 * `batiment.nom` est dans le même cas : `cheminZone` le joint déjà à
 * `niveau.nom` et le rend sur la même page.
 *
 * `avecBatiment` n'est pas déduit du plan mais de la liste où il figure —
 * l'ambiguïté est une propriété de la liste, pas du plan. C'est `etiqueter`
 * qui la connaît, et lui seul.
 */
export const etiquettePlan = (p: PlanListe, avecBatiment = false): string => {
  if (p.type === "situation") return p.rang > 1 ? `Situation ${p.rang}` : "Situation";
  const niveau = p.niveauNom ?? "Niveau";
  const base = avecBatiment && p.batimentNom ? `${p.batimentNom} · ${niveau}` : niveau;
  return p.rang > 1 ? `${base} · plan ${p.rang}` : base;
};

/**
 * Le bâtiment n'entre dans l'étiquette que s'il y a de quoi désambiguïser :
 * deux bâtiments portant chacun un rez donnaient deux « Rez » côte à côte
 * dans le sélecteur. Sur une propriété à un seul bâtiment — le cas courant —
 * « Rez » reste « Rez », l'étiquette ne s'alourdit pas pour rien.
 *
 * Le critère est le nombre de bâtiments, pas la collision de noms de niveaux :
 * sous deux bâtiments, un « Combles » seul ne dit toujours pas lequel des deux.
 */
export const etiqueter = (plans: PlanListe[]): PlanEtiquete[] => {
  const batiments = new Set(plans.map((p) => p.batimentNom).filter((nom): nom is string => nom !== null));
  const avecBatiment = batiments.size > 1;
  return plans.map((p) => ({
    id: p.id,
    etiquette: etiquettePlan(p, avecBatiment),
    situation: p.type === "situation",
  }));
};

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
 * Les contours des zones de ce plan. Écrite filtrée à l'étape 4, alors que la
 * table était vide et qu'aucun écran ne l'alimentait ; l'étape 6 l'alimente et
 * ne la réécrit pas — le filtre a été relu plutôt que supposé, et il tient.
 *
 * Un contour est la surface, la position et l'existence d'une zone : la règle
 * est donc celle de la grille de zones et du sélecteur de plans. Sous portée
 * restreinte, une zone sans objet visible n'a pas de contour, comme elle n'a
 * pas de tuile. La condition passe par `EXISTS` sur `element` et par la même
 * `clausePortee` que tout le reste — un objet visible par son SYSTÈME suffit
 * donc à servir le contour de sa zone, et c'est le comportement voulu : c'est
 * exactement ce que la tuile de cette zone montre déjà.
 */
export async function chargerPolygonesDuPlan(
  proprieteId: number,
  planId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<PolygoneZone[]> {
  const lignes = await db.execute<{ zoneId: number; nom: string; polygone: Sommet[] }>(sql`
    SELECT g.zone_id AS "zoneId", z.nom, g.polygone
    FROM zone_geom g
    JOIN zone z ON z.id = g.zone_id
    WHERE g.plan_id = ${planId}
      AND z.propriete_id = ${proprieteId}
      AND (${!porteeRestreinte(portee)}::boolean
           OR EXISTS (SELECT 1 FROM element e WHERE e.zone_id = z.id AND ${clausePortee(portee)}))
    ORDER BY z.nom
  `);

  // Pas de filtrage de forme ici : `zone_geom_contour_valide` (migration 0009)
  // refuse à l'écriture ce qui n'est pas un tableau de 3 à 40 sommets dont les
  // `x` et `y` sont des nombres de [0, 100]. C'est une contrainte de base, pas
  // une propriété de cette requête : elle vaut pour ce qui est entré APRÈS
  // elle, et un tri de plus ici ferait croire qu'elle ne suffit pas tout en
  // masquant le jour où elle serait retirée.
  return lignes.rows.map((l) => ({ zoneId: l.zoneId, nom: l.nom, sommets: l.polygone }));
}

/**
 * Les zones qu'un plan peut porter, avec l'état de leur contour. Écran du
 * propriétaire uniquement — un partage n'a rien à tracer, et cette liste dit
 * quelles zones existent, y compris celles sans objet visible.
 *
 * La couverture n'applique pas « la même règle » que `clausePlanVisible` :
 * c'est LA MÊME EXPRESSION, `clauseCouverturePlan`, que les deux appellent.
 * C'est ce qui empêche de tracer la cuisine du rez sur le plan du sous-sol, et
 * donc de proposer ensuite une zone qui n'a rien à faire là.
 */
export async function chargerZonesTracables(proprieteId: number, planId: number): Promise<ZoneTracable[]> {
  const lignes = await db.execute<ZoneTracable>(sql`
    SELECT z.id, z.nom, jsonb_array_length(g.polygone)::int AS "sommets"
    FROM plan p
    JOIN zone z ON z.propriete_id = p.propriete_id
      AND ${clauseCouverturePlan()}
    LEFT JOIN zone_geom g ON g.zone_id = z.id AND g.plan_id = p.id
    WHERE p.id = ${planId} AND p.propriete_id = ${proprieteId}
    ORDER BY z.ordre, z.nom
  `);
  return lignes.rows;
}

/**
 * Tracer, ou retracer. La clé primaire `(zone_id, plan_id)` dit qu'il n'y a
 * qu'un contour par zone et par plan : retracer REMPLACE, comme reposer un
 * objet déplace son point. Poser et déplacer sont la même opération, à
 * l'étape 4 comme ici.
 *
 * `source` vaut `trace` : la valeur `importe` attend un import IFC/DXF qui est
 * en attente d'un besoin réel, et laisser la colonne mentir serait pire que de
 * ne pas l'avoir.
 */
export async function enregistrerContour(
  proprieteId: number,
  planId: number,
  zoneId: number,
  sommets: Sommet[],
) {
  const p = await chargerPlanOu404(proprieteId, planId);
  // La zone doit être à la propriété ET couverte par ce plan. Vérifié par une
  // requête plutôt que déduit de la liste que l'écran a affichée : la route
  // est atteignable sans elle.
  const couvertes = await chargerZonesTracables(proprieteId, p.id);
  if (!couvertes.some((z) => z.id === zoneId)) throw new Response("Zone introuvable", { status: 404 });

  await db
    .insert(zoneGeom)
    .values({ zoneId, planId: p.id, polygone: sommets, source: "trace" })
    .onConflictDoUpdate({
      target: [zoneGeom.zoneId, zoneGeom.planId],
      set: { polygone: sommets, source: "trace" },
    });
}

export async function effacerContour(proprieteId: number, planId: number, zoneId: number) {
  const p = await chargerPlanOu404(proprieteId, planId);
  // `zone_geom` n'atteint `propriete_id` que par ses deux références : le plan
  // est déjà vérifié, la zone se vérifie ici. Même forme que `pointOu404`.
  const [z] = await db
    .select({ id: zone.id })
    .from(zone)
    .where(and(eq(zone.id, zoneId), eq(zone.proprieteId, proprieteId)));
  if (!z) throw new Response("Zone introuvable", { status: 404 });

  await db.delete(zoneGeom).where(and(eq(zoneGeom.zoneId, z.id), eq(zoneGeom.planId, p.id)));
}

/**
 * Ce que la géométrie PROPOSE pour un point, et rien de plus.
 *
 * Décision de conception de l'étape, écrite ici parce que c'est le seul
 * endroit d'où elle pourrait déraper : **la géométrie propose, elle ne décide
 * pas.** `element.zone_id` est ce que le filtre de partage lit (règle non
 * négociable #1) ; la réécrire au passage d'un glissement ferait entrer ou
 * sortir un objet de la portée d'un locataire sans que personne l'ait décidé,
 * dans une requête qui ne navigue même pas. La fonction rend donc une
 * proposition, `rangerElementDansZone` est un second geste, et rien ne les
 * enchaîne.
 *
 * `null` dès que la géométrie n'a rien à dire : aucun contour ne contient le
 * point, plusieurs le contiennent (voir `zoneDuPoint`), ou la zone déduite est
 * déjà celle de l'objet — proposer ce qui est déjà vrai est du bruit.
 */
export async function deduireZonePourPoint(
  proprieteId: number,
  planId: number,
  elementId: number,
  x: number,
  y: number,
): Promise<{ elementId: number; elementNom: string; zoneId: number; zoneNom: string; zoneActuelleNom: string } | null> {
  const contours = await chargerPolygonesDuPlan(proprieteId, planId);
  const zoneId = zoneDuPoint({ x, y }, contours);
  if (zoneId === null) return null;

  const lignes = await db.execute<{ elementNom: string; zoneActuelleId: number; zoneActuelleNom: string }>(sql`
    SELECT e.nom AS "elementNom", z.id AS "zoneActuelleId", z.nom AS "zoneActuelleNom"
    FROM element e
    JOIN zone z ON z.id = e.zone_id
    WHERE e.id = ${elementId} AND e.propriete_id = ${proprieteId}
  `);
  const courant = lignes.rows[0];
  if (!courant || courant.zoneActuelleId === zoneId) return null;

  return {
    elementId,
    elementNom: courant.elementNom,
    zoneId,
    zoneNom: contours.find((c) => c.zoneId === zoneId)!.nom,
    zoneActuelleNom: courant.zoneActuelleNom,
  };
}

/**
 * L'acceptation d'une proposition, et la seule écriture de `element.zone_id`
 * que l'étape 6 ajoute. Elle demande un geste : c'est tout l'écart entre
 * « propose » et « décide ».
 *
 * Le déclencheur `maj_recherche_element` se charge de réécrire `recherche` —
 * la zone y pèse le poids C — sans que ce code ait à le savoir (migration
 * 0003, et le nom de la zone y arrive par la même voie qu'un renommage).
 */
export async function rangerElementDansZone(proprieteId: number, elementId: number, zoneId: number) {
  const [z] = await db
    .select({ id: zone.id })
    .from(zone)
    .where(and(eq(zone.id, zoneId), eq(zone.proprieteId, proprieteId)));
  if (!z) throw new Response("Zone introuvable", { status: 404 });

  const modifiees = await db
    .update(element)
    .set({ zoneId: z.id, majLe: new Date() })
    .where(and(eq(element.id, elementId), eq(element.proprieteId, proprieteId)))
    .returning({ id: element.id });
  if (modifiees.length === 0) throw new Response("Fiche introuvable", { status: 404 });
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
    // La dérivée que reçoit un porteur de lien. Le plan est la seule image
    // qu'on sert en pleine résolution hors des écrans du propriétaire.
    largeurMoyenne: LARGEUR_MOYENNE_PLAN,
  });

  const chemin = `propriete-${proprieteId}/plans/${randomUUID()}.jpg`;
  await sauvegarder(chemin, traitee.original);
  await sauvegarder(cheminVignette(chemin), traitee.vignette);
  if (traitee.moyenne) await sauvegarder(cheminMoyenne(chemin), traitee.moyenne);

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
    await supprimer(cheminMoyenne(chemin));
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
    // Absente pour les plans enregistrés avant qu'elle existe : `supprimer`
    // tient déjà l'effacement de ce qui n'est plus là pour le résultat voulu.
    await supprimer(cheminMoyenne(f.chemin));
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
    .select({ id: point.id, planId: point.planId, elementId: point.elementId })
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

/**
 * Rend le plan et la fiche du point déplacé : l'appelant en a besoin pour
 * demander à la géométrie ce qu'elle propose, et la route de ressource ne les
 * a pas — un glissement n'envoie qu'un identifiant de point.
 */
export async function deplacerPoint(proprieteId: number, pointId: number, x: number, y: number) {
  const p = await pointOu404(proprieteId, pointId);
  await db.update(point).set({ x, y }).where(eq(point.id, p.id));
  return { planId: p.planId, elementId: p.elementId };
}

export async function retirerPoint(proprieteId: number, pointId: number) {
  const p = await pointOu404(proprieteId, pointId);
  await db.delete(point).where(eq(point.id, p.id));
}
