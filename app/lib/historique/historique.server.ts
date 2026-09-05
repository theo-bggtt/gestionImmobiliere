// app/lib/historique/historique.server.ts
// L'historique et sa visibilité. Une seule idée porte tout le fichier :
//
//   un événement n'est pas un objet, c'est un RÉCIT, et il ne pend à aucune
//   zone. Sa visibilité se dérive donc de ses objets liés, et il faut qu'ils
//   passent TOUS.
//
// Le quantificateur universel n'est pas un excès de prudence. « Rénovation du
// sous-sol et de la cuisine, remplacement du tableau » se lie légitimement à
// un objet de chaque zone ; sous un `EXISTS`, l'objet de la cuisine suffirait
// à rendre l'événement entier au locataire, `titre` et `description` compris,
// c'est-à-dire la charge utile. Le seul rempart restant serait que le
// propriétaire pense à monter `evenement.niveau` sur tout événement qui
// mentionne une zone restreinte : de la validation de formulaire dans la tête
// d'un humain, ce que le projet refuse depuis la règle non négociable #1.
//
// Les deux bords échouent fermés : l'événement sans lien est invisible, celui
// qui déborde aussi. Le levier du propriétaire est de découper l'événement, et
// deux chantiers dans deux zones distinctes étaient deux événements.
import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  clausePortee,
  porteeRestreinte,
  PORTEE_PROPRIETAIRE,
  type Portee,
} from "../recherche/recherche.server";
import type {
  EvenementDetail,
  EvenementListe,
  FacetteType,
  IntervenantRendu,
  ObjetLie,
  PhotoEvenement,
  TypeEvenement,
} from "./types";

export const LIMITE_DEFAUT = 50;
const LIMITE_MAX = 200;

/**
 * Le prédicat de visibilité d'un événement, exporté parce que trois surfaces
 * s'en servent — la chronologie, la page d'un événement, et le droit de lire
 * l'octet d'une photo d'événement — et qu'aucune ne doit réécrire la règle.
 * Même montage que `clausePlanVisible`.
 *
 * « Tous les éléments liés passent » s'écrit `NOT EXISTS (… WHERE NOT (…))`,
 * et cette négation est précisément ce qui a obligé `clausePortee` à ne plus
 * jamais rendre NULL : `NOT NULL` vaut NULL, la ligne fautive disparaîtrait de
 * la sous-requête, le `NOT EXISTS` deviendrait vrai et l'événement passerait.
 * Vérifié en base, tenu par `tests/historique/portee.test.ts`.
 *
 * L'alias `e` de la sous-requête masque volontairement un éventuel `e` de la
 * requête englobante : `clausePortee` écrit `e.`, et c'est l'élément lié qu'on
 * veut ici. Aucune des trois surfaces n'expose un `e` extérieur.
 *
 * L'appartenance est DANS la négation, et ce n'est pas un filtre ordinaire.
 * `clausePortee` ne dit rien de `propriete_id` : un élément d'une autre
 * propriété lié par erreur passe la clause dès que sa zone figure dans la
 * portée, et il rendait alors l'événement entier, nom de l'objet et nom de sa
 * zone compris. Le sens compte, et l'écrire à l'envers est silencieux :
 * `AND e.propriete_id = ev.propriete_id` posé comme filtre de la sous-requête
 * ferait SORTIR l'élément étranger, donc laisserait le `NOT EXISTS` vrai et
 * l'événement visible — exactement le bug. Il doit rester dans la sous-requête
 * et faire échouer le conjoint nié.
 *
 * La garde d'écriture (`verifierAppartenance`) rend déjà ce lien impossible,
 * et la portée d'un partage est validée contre les zones de la propriété à sa
 * création : l'invariant a donc trois attaches, et celle-ci est la seule qui
 * tienne encore si les deux autres tombent. Tenu par `tests/historique/portee.test.ts`.
 */
export function clauseEvenementVisible(portee: Portee, aliasEvenement = sql.raw("ev")) {
  const plafond = sql`${aliasEvenement}.niveau <= ${portee.niveauMax}`;
  // Portée du propriétaire : le plafond vaut 3, il est vrai partout, et un
  // événement sans lien reste visible — c'est son écran, pas un partage.
  if (!porteeRestreinte(portee)) return plafond;

  return sql`${plafond}
    AND EXISTS (
      SELECT 1 FROM evenement_element ee WHERE ee.evenement_id = ${aliasEvenement}.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM evenement_element ee
      JOIN element e ON e.id = ee.element_id
      WHERE ee.evenement_id = ${aliasEvenement}.id
        AND NOT (e.propriete_id = ${aliasEvenement}.propriete_id AND (${clausePortee(portee)}))
    )`;
}

/**
 * Les objets liés à un événement, agrégés en JSON dans la même requête.
 *
 * Ils ne sont PAS refiltrés par la portée, et ce n'est pas un oubli : un
 * événement servi a déjà vu tous ses objets passer. C'est le cadeau du
 * quantificateur universel — le rendu partiel n'existe pas ici, donc il n'y a
 * pas de seconde clause de portée à tenir à jour.
 *
 * Le filtre sur `propriete_id` est autre chose, et lui est un filtre ordinaire
 * : `clauseEvenementVisible` refuse déjà l'événement qui porte un lien
 * étranger, mais l'écran du propriétaire ne passe pas par elle, et le nom d'un
 * objet d'une autre propriété n'a rien à faire dans sa liste non plus.
 */
const OBJETS_LIES = (alias = sql.raw("ev")) => sql`
  coalesce((
    SELECT json_agg(json_build_object('id', e.id, 'nom', e.nom, 'zoneNom', z.nom) ORDER BY e.nom, e.id)
    FROM evenement_element ee
    JOIN element e ON e.id = ee.element_id
    JOIN zone z ON z.id = e.zone_id
    WHERE ee.evenement_id = ${alias}.id
      AND e.propriete_id = ${alias}.propriete_id
  ), '[]'::json)`;

// `date` en base, texte à l'écran. Sans `to_char`, node-postgres rend un objet
// Date, que la sérialisation d'un loader décale d'un fuseau : une intervention
// du 1er mars s'affiche le 28 février pour la moitié de la planète.
export const JOUR = (colonne: ReturnType<typeof sql.raw>) => sql`to_char(${colonne}, 'YYYY-MM-DD')`;

type LigneListe = {
  id: number;
  titre: string;
  dateDebut: string;
  dateFin: string | null;
  type: TypeEvenement;
  objets: ObjetLie[];
  total: number;
};

export type Chronologie = {
  evenements: EvenementListe[];
  total: number;
  facettes: FacetteType[];
};

/**
 * La chronologie, triée du plus récent au plus ancien. `types` vide = pas de
 * restriction, exactement la sémantique des facettes de l'étape 2.
 */
export async function chargerChronologie(
  proprieteId: number,
  options: { portee?: Portee; types?: TypeEvenement[]; limite?: number; decalage?: number } = {},
): Promise<Chronologie> {
  const portee = options.portee ?? PORTEE_PROPRIETAIRE;
  const types = options.types ?? [];
  const limite = Math.min(Math.max(options.limite ?? LIMITE_DEFAUT, 1), LIMITE_MAX);
  const decalage = Math.max(options.decalage ?? 0, 0);

  const [lignes, facettes] = await Promise.all([
    db.execute<LigneListe>(sql`
      SELECT
        ev.id,
        ev.titre,
        ${JOUR(sql.raw("ev.date_debut"))} AS "dateDebut",
        ${JOUR(sql.raw("ev.date_fin"))}   AS "dateFin",
        ev.type,
        ${OBJETS_LIES()} AS "objets",
        (count(*) OVER ())::int AS "total"
      FROM evenement ev
      WHERE ev.propriete_id = ${proprieteId}
        AND (${types.length === 0}::boolean OR ev.type::text = ANY(${sql.param(types)}::text[]))
        AND ${clauseEvenementVisible(portee)}
      ORDER BY ev.date_debut DESC, ev.id DESC
      LIMIT ${limite} OFFSET ${decalage}
    `),
    chargerFacettesTypes(proprieteId, portee),
  ]);

  return {
    evenements: lignes.rows.map(({ total: _total, ...e }) => e),
    total: lignes.rows[0]?.total ?? 0,
    facettes,
  };
}

/**
 * Le compte par type, sur le fonds VISIBLE et jamais sur le fonds.
 *
 * C'est la règle de la grille de zones appliquée à la chronologie : une
 * pastille « Sinistre (2) » sur un lien restreint apprendrait qu'il y a eu
 * deux sinistres, quand la liste n'en montre aucun. Le compte est calculé
 * dans la requête filtrée, il ne peut donc pas dire plus que la page.
 *
 * Les types sans événement visible n'ont pas de pastille : `GROUP BY` sur
 * l'ensemble filtré ne les produit pas, ce qui est exactement voulu.
 */
export async function chargerFacettesTypes(
  proprieteId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<FacetteType[]> {
  const lignes = await db.execute<FacetteType>(sql`
    SELECT ev.type, count(*)::int AS "compte"
    FROM evenement ev
    WHERE ev.propriete_id = ${proprieteId}
      AND ${clauseEvenementVisible(portee)}
    GROUP BY ev.type
    ORDER BY count(*) DESC, ev.type
  `);
  return lignes.rows;
}

/**
 * Combien d'événements ce lien peut voir. Sert à décider si l'entrée
 * « Historique » figure sur la page d'accueil d'un partage : une entrée qui
 * mène à une page vide dit qu'il existe un historique, exactement comme une
 * entrée « Sous-sol » dans un sélecteur de plans dit qu'il existe un sous-sol.
 */
export async function compterEvenementsVisibles(
  proprieteId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<number> {
  const lignes = await db.execute<{ compte: number }>(sql`
    SELECT count(*)::int AS "compte"
    FROM evenement ev
    WHERE ev.propriete_id = ${proprieteId}
      AND ${clauseEvenementVisible(portee)}
  `);
  return lignes.rows[0]?.compte ?? 0;
}

/** L'historique d'une fiche. Le sens inverse du lien, d'où l'index dédié. */
export async function chargerEvenementsDeLElement(
  proprieteId: number,
  elementId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<EvenementListe[]> {
  const lignes = await db.execute<Omit<LigneListe, "total">>(sql`
    SELECT
      ev.id,
      ev.titre,
      ${JOUR(sql.raw("ev.date_debut"))} AS "dateDebut",
      ${JOUR(sql.raw("ev.date_fin"))}   AS "dateFin",
      ev.type,
      ${OBJETS_LIES()} AS "objets"
    FROM evenement ev
    JOIN evenement_element lien ON lien.evenement_id = ev.id
    WHERE lien.element_id = ${elementId}
      AND ev.propriete_id = ${proprieteId}
      AND ${clauseEvenementVisible(portee)}
    ORDER BY ev.date_debut DESC, ev.id DESC
  `);
  return lignes.rows;
}

/**
 * Les intervenants d'un événement, sous DEUX conditions cumulées : l'événement
 * est visible (l'appelant s'en est assuré), et l'intervenant passe le plafond.
 *
 * `tel`, `email` et `notes` ne sont pas sélectionnés. Pas masqués au rendu :
 * pas chargés. Ce sont les données personnelles d'un tiers qui n'a jamais
 * accepté de figurer sur une URL qui circule dans WhatsApp, et le défaut
 * `niveau = 3` fait que même le nom ne sort qu'après une décision explicite,
 * intervenant par intervenant.
 */
async function chargerIntervenantsDeLEvenement(
  proprieteId: number,
  evenementId: number,
  niveauMax: number,
): Promise<IntervenantRendu[]> {
  const lignes = await db.execute<IntervenantRendu>(sql`
    SELECT i.id, i.nom, i.metier
    FROM evenement_intervenant ei
    JOIN intervenant i ON i.id = ei.intervenant_id
    WHERE ei.evenement_id = ${evenementId}
      AND i.propriete_id = ${proprieteId}
      AND i.niveau <= ${niveauMax}
    ORDER BY i.nom, i.id
  `);
  return lignes.rows;
}

/**
 * Les photos d'un événement. Aucun `fichier.niveau` ici : voir
 * `photoDUnEvenement`.
 *
 * Le `role` est servi, et il ne filtre RIEN. C'est de la présentation — « voici
 * l'avant, voici l'après » — et le droit de lire l'octet vient toujours de la
 * visibilité de l'événement. Une requête qui filtrerait par rôle ne fermerait
 * rien du tout et donnerait l'illusion du contraire, ce qui est pire que de ne
 * rien faire.
 *
 * L'ordre range l'avant devant l'après : c'est le sens du récit, et il ne
 * dépend pas de la date de prise (on photographie souvent l'avant après coup,
 * dans un dossier d'assurance).
 */
async function chargerPhotosDeLEvenement(
  proprieteId: number,
  evenementId: number,
): Promise<PhotoEvenement[]> {
  const lignes = await db.execute<PhotoEvenement>(sql`
    SELECT f.id, fl.role
    FROM fichier_lien fl
    JOIN fichier f ON f.id = fl.fichier_id
    WHERE fl.cible_type = 'evenement'
      AND fl.cible_id = ${evenementId}
      AND f.propriete_id = ${proprieteId}
    ORDER BY
      CASE fl.role WHEN 'avant' THEN 0 WHEN 'apres' THEN 1 ELSE 2 END,
      f.date_prise DESC NULLS LAST,
      f.id DESC
  `);
  return lignes.rows;
}

/**
 * Un événement déplié, si et seulement s'il passe le filtre. Filtré = 404,
 * jamais 403 : un 403 confirmerait qu'il existe.
 *
 * Le type de retour ne porte pas `cout` : l'écrire dans l'objet rendu est une
 * erreur de compilation, et la colonne n'est de toute façon pas sélectionnée.
 */
export async function chargerEvenementDetail(
  proprieteId: number,
  evenementId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<EvenementDetail> {
  type Ligne = Omit<LigneListe, "total"> & { description: string | null };

  const lignes = await db.execute<Ligne>(sql`
    SELECT
      ev.id,
      ev.titre,
      ${JOUR(sql.raw("ev.date_debut"))} AS "dateDebut",
      ${JOUR(sql.raw("ev.date_fin"))}   AS "dateFin",
      ev.type,
      ev.description,
      ${OBJETS_LIES()} AS "objets"
    FROM evenement ev
    WHERE ev.id = ${evenementId}
      AND ev.propriete_id = ${proprieteId}
      AND ${clauseEvenementVisible(portee)}
  `);

  const ev = lignes.rows[0];
  if (!ev) throw new Response("Introuvable", { status: 404 });

  const [intervenants, photos] = await Promise.all([
    chargerIntervenantsDeLEvenement(proprieteId, evenementId, portee.niveauMax),
    chargerPhotosDeLEvenement(proprieteId, evenementId),
  ]);

  return { ...ev, intervenants, photos };
}
