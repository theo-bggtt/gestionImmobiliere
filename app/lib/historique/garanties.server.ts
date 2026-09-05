// app/lib/historique/garanties.server.ts
// Les garanties. Une seule idée porte le fichier, et c'est l'inverse de celle
// de `historique.server.ts` :
//
//   une garantie pend à UN élément, et `garantie.element_id` est NOT NULL.
//
// Elle n'a donc pas le problème d'`evenement`, qui pend à la propriété et à
// aucune zone. Sa visibilité EST celle de son élément : il n'y a pas de
// `clauseGarantieVisible` à écrire, seulement `clausePortee` appliquée à
// l'élément joint. Écrire une seconde règle serait la laisser diverger de la
// première, et c'est exactement ce que la PR 1 a passé son temps à éviter.
//
// Ce que le partage voit d'une garantie : `debut`, `fin`, et si elle est
// expirée. Ni `reference` (numéro de contrat en texte libre, même famille de
// fuite que `plan.nom`), ni son document (un contrat ou une facture, donc du
// `cout` sous un autre nom, décision #100). Le type servi ne porte pas ces
// champs — voir `GarantieRendue`.
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { garantie } from "../../db/schema/index";
import { clausePortee, PORTEE_PROPRIETAIRE, type Portee } from "../recherche/recherche.server";
import { JOUR } from "./historique.server";
import { MAX_LONGUEUR_REFERENCE, type GarantieProprietaire, type GarantieRendue } from "./types";

/**
 * `expiree` est calculée par PostgreSQL contre `CURRENT_DATE`, jamais par
 * l'écran. `new Date("2026-03-01") < new Date()` se lit en UTC : à l'ouest de
 * Greenwich, une garantie qui expire aujourd'hui s'afficherait expirée depuis
 * hier soir. Même piège que les dates de la chronologie, et il se règle du
 * même côté.
 */
const EXPIREE = sql`(g.fin IS NOT NULL AND g.fin < CURRENT_DATE)`;

/**
 * Les garanties d'un objet, sous la portée de qui regarde.
 *
 * La clause est répétée ici alors que l'appelant a déjà vérifié que l'élément
 * passe : le filtre de permission vit dans la requête, pas dans la promesse de
 * l'appelant (règle non négociable #4). Une fonction qui compte sur son
 * contexte n'est plus réutilisable sans le relire.
 */
export async function chargerGarantiesDeLElement(
  proprieteId: number,
  elementId: number,
  portee: Portee = PORTEE_PROPRIETAIRE,
): Promise<GarantieRendue[]> {
  const lignes = await db.execute<GarantieRendue>(sql`
    SELECT
      g.id,
      ${JOUR(sql.raw("g.debut"))} AS "debut",
      ${JOUR(sql.raw("g.fin"))}   AS "fin",
      ${EXPIREE}                  AS "expiree"
    FROM garantie g
    JOIN element e ON e.id = g.element_id
    WHERE g.element_id = ${elementId}
      AND e.propriete_id = ${proprieteId}
      AND ${clausePortee(portee)}
    ORDER BY g.fin DESC NULLS FIRST, g.id DESC
  `);
  return lignes.rows;
}

/**
 * Les échéances de la propriété, pour l'écran du propriétaire.
 *
 * C'est tout ce que « rappels » veut dire dans cette étape : une liste qu'on
 * regarde, pas une notification qui arrive. Le projet n'a ni mailer, ni file
 * de travail, ni permission de notifier — un vrai système de rappels est une
 * surface produit à lui seul, et le faire entrer par la porte de côté d'une PR
 * sur les garanties serait le construire à moitié. La décision et son
 * déclencheur de réouverture sont dans le README.
 *
 * Les garanties SANS terme (`fin IS NULL`) sont exclues : elles n'échoient
 * jamais, donc elles n'ont rien à faire dans une liste d'échéances. Elles
 * restent sur la fiche de leur objet.
 *
 * Les expirées restent, et c'est délibéré : « la garantie de la chaudière a
 * expiré il y a trois mois » est précisément ce qu'on veut apprendre en
 * ouvrant cet écran. Masquer un fait parce qu'il est désagréable, c'est la
 * règle #2 dans l'autre sens.
 */
export async function chargerEcheances(proprieteId: number, limite = 50): Promise<GarantieProprietaire[]> {
  const lignes = await db.execute<GarantieProprietaire>(sql`
    SELECT
      g.id,
      ${JOUR(sql.raw("g.debut"))} AS "debut",
      ${JOUR(sql.raw("g.fin"))}   AS "fin",
      ${EXPIREE}                  AS "expiree",
      g.reference,
      g.fichier_id AS "fichierId",
      e.id  AS "elementId",
      e.nom AS "elementNom",
      z.nom AS "zoneNom"
    FROM garantie g
    JOIN element e ON e.id = g.element_id
    JOIN zone z ON z.id = e.zone_id
    WHERE e.propriete_id = ${proprieteId}
      AND g.fin IS NOT NULL
    ORDER BY g.fin ASC, g.id ASC
    LIMIT ${limite}
  `);
  return lignes.rows;
}

/** Les garanties d'un objet, vues du propriétaire : référence et document compris. */
export async function chargerGarantiesProprietaire(
  proprieteId: number,
  elementId: number,
): Promise<GarantieProprietaire[]> {
  const lignes = await db.execute<GarantieProprietaire>(sql`
    SELECT
      g.id,
      ${JOUR(sql.raw("g.debut"))} AS "debut",
      ${JOUR(sql.raw("g.fin"))}   AS "fin",
      ${EXPIREE}                  AS "expiree",
      g.reference,
      g.fichier_id AS "fichierId",
      e.id  AS "elementId",
      e.nom AS "elementNom",
      z.nom AS "zoneNom"
    FROM garantie g
    JOIN element e ON e.id = g.element_id
    JOIN zone z ON z.id = e.zone_id
    WHERE g.element_id = ${elementId}
      AND e.propriete_id = ${proprieteId}
    ORDER BY g.fin DESC NULLS FIRST, g.id DESC
  `);
  return lignes.rows;
}

// ---------------------------------------------------------------------------
// Écriture. Rien ici ne sort vers un partage.

export type SaisieGarantie = {
  debut: string;
  fin: string | null;
  reference: string | null;
};

export type LectureSaisieGarantie =
  | { ok: true; valeur: SaisieGarantie }
  | { ok: false; message: string };

/** `YYYY-MM-DD` et rien d'autre : la colonne est un `date`, pas un `timestamp`. */
const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function lireSaisieGarantie(form: FormData): LectureSaisieGarantie {
  const debut = String(form.get("debut") ?? "").trim();
  if (!JOUR_ISO.test(debut)) return { ok: false, message: "Donnez une date de début." };

  const finBrute = String(form.get("fin") ?? "").trim();
  const fin = finBrute.length === 0 ? null : finBrute;
  if (fin !== null && !JOUR_ISO.test(fin)) return { ok: false, message: "La date de fin n'est pas une date." };

  // Le CHECK en base refuserait de toute façon, mais un 500 n'est pas un
  // message d'erreur : la validation est là pour l'écran, la contrainte est là
  // pour ce qui n'y passe pas.
  if (fin !== null && fin < debut) {
    return { ok: false, message: "La garantie ne peut pas finir avant de commencer." };
  }

  const referenceBrute = String(form.get("reference") ?? "").trim();
  const reference = referenceBrute.length === 0 ? null : referenceBrute;
  if (reference !== null && reference.length > MAX_LONGUEUR_REFERENCE) {
    return { ok: false, message: "La référence est trop longue." };
  }

  return { ok: true, valeur: { debut, fin, reference } };
}

/**
 * Une garantie ne se charge jamais par son seul identifiant : le chemin de
 * l'appartenance passe par son élément, et c'est `garantie.element_id NOT
 * NULL` qui le rend possible. 404 et jamais 403 (règle #4).
 */
export async function chargerGarantieOu404(proprieteId: number, garantieIdBrut: string | number | undefined) {
  const lignes = await db.execute<{ id: number; elementId: number }>(sql`
    SELECT g.id, g.element_id AS "elementId"
    FROM garantie g
    JOIN element e ON e.id = g.element_id
    WHERE g.id = ${Number(garantieIdBrut)}
      AND e.propriete_id = ${proprieteId}
  `);
  const ligne = lignes.rows[0];
  if (!ligne) throw new Response("Introuvable", { status: 404 });
  return ligne;
}

/** L'élément doit être de la propriété : un id venu d'un formulaire n'entre jamais tel quel. */
async function verifierElement(proprieteId: number, elementId: number) {
  const lignes = await db.execute<{ id: number }>(sql`
    SELECT id FROM element WHERE id = ${elementId} AND propriete_id = ${proprieteId}
  `);
  if (!lignes.rows[0]) throw new Response("Introuvable", { status: 404 });
}

export async function creerGarantie(
  proprieteId: number,
  elementId: number,
  saisie: SaisieGarantie,
): Promise<number> {
  await verifierElement(proprieteId, elementId);
  const [ligne] = await db.insert(garantie).values({ elementId, ...saisie }).returning({ id: garantie.id });
  return ligne.id;
}

export async function majGarantie(proprieteId: number, garantieId: number, saisie: SaisieGarantie) {
  await chargerGarantieOu404(proprieteId, garantieId);
  await db.update(garantie).set(saisie).where(eq(garantie.id, garantieId));
}

export async function supprimerGarantie(proprieteId: number, garantieId: number) {
  await chargerGarantieOu404(proprieteId, garantieId);
  await db.delete(garantie).where(eq(garantie.id, garantieId));
}
