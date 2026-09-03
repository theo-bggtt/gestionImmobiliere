// app/lib/recherche/recherche.server.ts
// La requête de recherche, écrite en SQL brut : elle mêle tsvector pondéré,
// ts_rank, un LATERAL pour la vignette et un count fenêtré. Le constructeur
// de requêtes de Drizzle n'apporterait rien ici, sinon du bruit.
import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import type {
  FacettesActives,
  FacettesDisponibles,
  Motif,
  ReponseRecherche,
  ResultatRecherche,
  TypeProche,
  ZoneVignette,
} from "./types";
import { FACETTES_VIDES } from "./types";

// Configuration de recherche plein texte créée par la migration 0005 :
// `french` plus le dictionnaire `unaccent`, sans quoi « eclairage » tapé sans
// accent ne remonte pas « Éclairage ». Le nom est dupliqué dans le SQL de la
// migration (qui définit le déclencheur) — c'est la seule duplication.
const CONFIG = sql.raw("'french_sans_accent'");

export const LIMITE_DEFAUT = 30;
const LIMITE_MAX = 100;

/**
 * Le filtre de visibilité de l'étape 3, écrit dès maintenant (règle non
 * négociable #3 du prompt d'étape). Le propriétaire passe toujours
 * `PORTEE_PROPRIETAIRE` ; un lien de partage passera son `niveauMax` et sa
 * portée, et la requête n'aura pas à changer.
 */
export type Portee = {
  /** 0 public · 1 usage · 2 technique · 3 privé. */
  niveauMax: number;
  /** null = portée vide, c'est-à-dire aucune restriction de zone/système. */
  zones: number[] | null;
  systemes: number[] | null;
};

export const PORTEE_PROPRIETAIRE: Portee = { niveauMax: 3, zones: null, systemes: null };

/**
 * Une portée qui mord, c'est-à-dire tout sauf celle du propriétaire. Deux
 * surfaces décrivent le *fonds* et non les résultats — la grille de zones et
 * les suggestions de types de l'état vide — et toutes deux divulguent par leur
 * seule présence : une tuile « Local technique · 0 objet » dit qu'il existe un
 * local technique, un type perso proposé dit comment le propriétaire nomme ses
 * affaires. Elles se coupent d'après la portée, jamais d'après un paramètre
 * que le prochain écran de partage pourrait oublier de passer.
 */
export const porteeRestreinte = (portee: Portee) =>
  portee.niveauMax < PORTEE_PROPRIETAIRE.niveauMax || portee.zones !== null || portee.systemes !== null;

/**
 * `niveau <= :niveauMax AND (:porteeVide OR zone ∈ portée OR système ∈ portée)`.
 *
 * Exportée : la fiche et l'image d'un partage sont deux surfaces de plus à
 * filtrer, et elles doivent l'être par cette clause-ci, pas par une seconde
 * écriture de la même idée qui dériverait au premier changement.
 */
export function clausePortee(portee: Portee) {
  const vide = portee.zones === null && portee.systemes === null;
  return sql`e.niveau <= ${portee.niveauMax}
    AND (${vide}::boolean
         OR e.zone_id = ANY(${sql.param(portee.zones ?? [])}::int[])
         OR e.systeme_id = ANY(${sql.param(portee.systemes ?? [])}::int[]))`;
}

/** Une dimension de facette : liste vide = pas de restriction. */
function clauseFacette(colonne: ReturnType<typeof sql.raw>, ids: number[]) {
  return sql`(${ids.length === 0}::boolean OR ${colonne} = ANY(${sql.param(ids)}::int[]))`;
}

type LigneResultat = {
  id: number;
  nom: string;
  zoneId: number;
  zoneNom: string;
  batimentNom: string | null;
  niveauNom: string | null;
  typeId: number;
  typeNom: string;
  systemeId: number | null;
  systemeNom: string | null;
  fichierId: number | null;
  motif: Motif | null;
  total: number;
};

// Le chemin sert à distinguer deux zones homonymes dans deux bâtiments.
// Une zone sans niveau est extérieure — c'est le seul cas où niveauId est nul.
export const cheminZone = (l: { batimentNom: string | null; niveauNom: string | null }) =>
  l.niveauNom ? [l.batimentNom, l.niveauNom].filter(Boolean).join(" · ") : "Extérieur";

export async function rechercher(options: {
  proprieteId: number;
  q: string;
  portee?: Portee;
  facettes?: FacettesActives;
  limite?: number;
  decalage?: number;
}): Promise<ReponseRecherche> {
  const { proprieteId } = options;
  const q = options.q.trim();
  const portee = options.portee ?? PORTEE_PROPRIETAIRE;
  const facettes = options.facettes ?? FACETTES_VIDES;
  const limite = Math.min(Math.max(options.limite ?? LIMITE_DEFAUT, 1), LIMITE_MAX);
  const decalage = Math.max(options.decalage ?? 0, 0);
  const texteVide = q.length === 0;
  const restreinte = porteeRestreinte(portee);

  // `element.recherche` indexe TOUTES les valeurs de `details`, en poids D, y
  // compris celles des champs dont le `niveauMin` dépasse le plafond d'un
  // partage. Les rendre cherchables serait un oracle : le porteur du lien ne
  // voit pas le numéro de série, mais il pourrait le confirmer en le tapant,
  // et l'étiquette « détails » le lui dirait. Sous portée restreinte, le
  // poids D est donc retiré du vecteur avant la comparaison.
  //
  // C'est plus large que nécessaire — un champ de niveau « public » devient
  // lui aussi introuvable par sa valeur — mais l'index ne sait pas de quel
  // champ vient un lexème, et se tromper du côté large est le seul sens
  // acceptable de l'erreur. Corollaire mesuré : `ts_filter` interdit l'index
  // GIN, la requête d'un partage parcourt les fiches de la propriété.
  const vecteur = restreinte ? sql`ts_filter(e.recherche, '{a,b,c}')` : sql`e.recherche`;

  const depart = performance.now();

  // `tsq_ou` est la même requête, ses termes en OU plutôt qu'en ET. Elle ne
  // sert QU'À étiqueter le motif : avec le ET de plainto_tsquery, « vanne
  // cuisine » matche la fiche entière sans qu'aucun champ pris isolément ne
  // matche, et l'étiquette resterait vide. La dériver du texte de la requête
  // déjà produite par PostgreSQL évite d'assainir la saisie nous-mêmes.
  const lignes = await db.execute<LigneResultat>(sql`
    WITH q AS (
      SELECT plainto_tsquery(${CONFIG}, ${q}) AS tsq,
             replace(plainto_tsquery(${CONFIG}, ${q})::text, ' & ', ' | ')::tsquery AS tsq_ou
    )
    SELECT
      e.id,
      e.nom,
      z.id  AS "zoneId",
      z.nom AS "zoneNom",
      b.nom AS "batimentNom",
      n.nom AS "niveauNom",
      t.id  AS "typeId",
      t.nom AS "typeNom",
      s.id  AS "systemeId",
      s.nom AS "systemeNom",
      ph.id AS "fichierId",
      (count(*) OVER ())::int AS "total",
      CASE
        WHEN to_tsvector(${CONFIG}, e.nom) @@ q.tsq_ou THEN 'nom'
        WHEN to_tsvector(${CONFIG}, concat_ws(' ', array_to_string(e.alias, ' '), array_to_string(t.alias, ' '))) @@ q.tsq_ou THEN 'alias'
        WHEN to_tsvector(${CONFIG}, t.nom) @@ q.tsq_ou THEN 'type'
        WHEN to_tsvector(${CONFIG}, z.nom) @@ q.tsq_ou THEN 'zone'
        WHEN to_tsvector(${CONFIG}, coalesce(s.nom, '')) @@ q.tsq_ou THEN 'systeme'
        WHEN ${!restreinte}::boolean
         AND to_tsvector(${CONFIG}, coalesce((SELECT string_agg(value, ' ') FROM jsonb_each_text(e.details)), '')) @@ q.tsq_ou THEN 'details'
      END AS motif
    FROM element e
    CROSS JOIN q
    JOIN zone z ON z.id = e.zone_id
    JOIN type_element t ON t.id = e.type_id
    LEFT JOIN niveau n ON n.id = z.niveau_id
    LEFT JOIN batiment b ON b.id = n.batiment_id
    LEFT JOIN systeme s ON s.id = e.systeme_id
    LEFT JOIN LATERAL (
      SELECT f.id
      FROM fichier_lien fl
      JOIN fichier f ON f.id = fl.fichier_id
      WHERE fl.cible_type = 'element' AND fl.cible_id = e.id
      ORDER BY f.date_prise DESC NULLS LAST, f.id DESC
      LIMIT 1
    ) ph ON true
    WHERE e.propriete_id = ${proprieteId}
      AND ${clausePortee(portee)}
      AND (${texteVide}::boolean OR ${vecteur} @@ q.tsq)
      AND ${clauseFacette(sql.raw("e.zone_id"), facettes.zones)}
      AND ${clauseFacette(sql.raw("e.systeme_id"), facettes.systemes)}
      AND ${clauseFacette(sql.raw("e.type_id"), facettes.types)}
    ORDER BY ts_rank(${vecteur}, q.tsq) DESC, e.nom ASC
    LIMIT ${limite} OFFSET ${decalage}
  `);

  const resultats: ResultatRecherche[] = lignes.rows.map((l) => ({
    id: l.id,
    nom: l.nom,
    zoneId: l.zoneId,
    zoneNom: l.zoneNom,
    zoneChemin: cheminZone(l),
    typeId: l.typeId,
    typeNom: l.typeNom,
    systemeId: l.systemeId,
    systemeNom: l.systemeNom,
    fichierId: l.fichierId,
    motif: l.motif,
  }));

  const total = lignes.rows[0]?.total ?? 0;
  // Sous portée restreinte, aucune suggestion : le catalogue système ne dit
  // rien de la propriété, mais les types perso, si.
  const typesProches =
    resultats.length === 0 && !texteVide && !porteeRestreinte(portee)
      ? await chercherTypesProches(proprieteId, q)
      : [];

  return {
    q,
    resultats,
    total,
    limite,
    decalage,
    typesProches,
    ms: Math.round((performance.now() - depart) * 10) / 10,
  };
}

/**
 * État vide utile : plutôt qu'une page blanche, dire quel type du catalogue
 * porte ce mot. Deux filets : la correspondance plein texte (qui gère accents
 * et pluriels), puis une sous-chaîne sans accent pour les saisies partielles
 * (« robi » ne produit aucun lexème utile mais désigne bien « robinet »).
 */
async function chercherTypesProches(proprieteId: number, q: string): Promise<TypeProche[]> {
  const lignes = await db.execute<TypeProche>(sql`
    SELECT id, nom, alias
    FROM type_element
    WHERE (propriete_id IS NULL OR propriete_id = ${proprieteId})
      AND (
        to_tsvector(${CONFIG}, concat_ws(' ', nom, array_to_string(alias, ' ')))
          @@ replace(plainto_tsquery(${CONFIG}, ${q})::text, ' & ', ' | ')::tsquery
        OR unaccent(lower(concat_ws(' ', nom, array_to_string(alias, ' '))))
          LIKE '%' || unaccent(lower(${q})) || '%'
      )
    ORDER BY nom
    LIMIT 5
  `);
  return lignes.rows;
}

/**
 * Les facettes proposées décrivent la propriété entière (sous filtre de
 * visibilité), pas le résultat courant : une pastille qui disparaît dès qu'on
 * tape ne se décoche plus. Le compte porté par la pastille est donc celui du
 * fonds, et c'est le compte de résultats qui suit la recherche.
 */
export async function chargerFacettes(
  proprieteId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<FacettesDisponibles> {
  const lignes = await db.execute<{ dimension: string; id: number; nom: string; nombre: number }>(sql`
      SELECT 'zone' AS dimension, z.id, z.nom, count(*)::int AS nombre
      FROM element e JOIN zone z ON z.id = e.zone_id
      WHERE e.propriete_id = ${proprieteId} AND ${clausePortee(portee)}
      GROUP BY z.id, z.nom
    UNION ALL
      SELECT 'systeme', s.id, s.nom, count(*)::int
      FROM element e JOIN systeme s ON s.id = e.systeme_id
      WHERE e.propriete_id = ${proprieteId} AND ${clausePortee(portee)}
      GROUP BY s.id, s.nom
    UNION ALL
      SELECT 'type', t.id, t.nom, count(*)::int
      FROM element e JOIN type_element t ON t.id = e.type_id
      WHERE e.propriete_id = ${proprieteId} AND ${clausePortee(portee)}
      GROUP BY t.id, t.nom
    ORDER BY 4 DESC, 3 ASC
  `);

  const par = (dimension: string) =>
    lignes.rows.filter((l) => l.dimension === dimension).map(({ id, nom, nombre }) => ({ id, nom, nombre }));

  return { zones: par("zone"), systemes: par("systeme"), types: par("type") };
}

/**
 * La grille de l'accueil. Toutes les zones de la propriété, extérieures en
 * fin de liste, avec leur nombre d'objets et la photo la plus récente
 * rattachée à l'un d'eux. Pas de photo n'est pas un cas d'erreur : la case
 * affiche alors un aplat, jamais une image cassée.
 *
 * Le propriétaire garde ses zones vides — c'est un fait de structure, pas un
 * score de complétude, et il doit pouvoir y capturer. Sous portée restreinte,
 * une zone sans objet visible disparaît : l'afficher divulguerait qu'elle
 * existe (« compter, c'est divulguer », étape 3).
 */
export async function chargerZonesVignettes(
  proprieteId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<ZoneVignette[]> {
  const lignes = await db.execute<{
    id: number;
    nom: string;
    exterieure: boolean;
    batimentNom: string | null;
    niveauNom: string | null;
    nombre: number;
    fichierId: number | null;
  }>(sql`
    SELECT
      z.id,
      z.nom,
      (z.niveau_id IS NULL) AS "exterieure",
      b.nom AS "batimentNom",
      n.nom AS "niveauNom",
      coalesce(c.nombre, 0) AS "nombre",
      ph.id AS "fichierId"
    FROM zone z
    LEFT JOIN niveau n ON n.id = z.niveau_id
    LEFT JOIN batiment b ON b.id = n.batiment_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS nombre
      FROM element e
      WHERE e.zone_id = z.id AND ${clausePortee(portee)}
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT f.id
      FROM element e
      JOIN fichier_lien fl ON fl.cible_type = 'element' AND fl.cible_id = e.id
      JOIN fichier f ON f.id = fl.fichier_id
      WHERE e.zone_id = z.id AND ${clausePortee(portee)}
      ORDER BY f.date_prise DESC NULLS LAST, f.id DESC
      LIMIT 1
    ) ph ON true
    WHERE z.propriete_id = ${proprieteId}
      AND (${!porteeRestreinte(portee)}::boolean OR coalesce(c.nombre, 0) > 0)
    ORDER BY (z.niveau_id IS NULL), b.ordre NULLS FIRST, n.ordinal, z.ordre, z.nom
  `);

  return lignes.rows.map((l) => ({
    id: l.id,
    nom: l.nom,
    exterieure: l.exterieure,
    chemin: cheminZone(l),
    nombre: l.nombre,
    fichierId: l.fichierId,
  }));
}
