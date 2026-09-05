// app/lib/historique/evenements.server.ts
// Les écrans du propriétaire : lire un événement en entier, le saisir, le
// modifier, le supprimer. Rien ici n'est servi à un lien de partage — la
// lecture filtrée vit dans `historique.server.ts`, et c'est la seule qui
// connaisse `clauseEvenementVisible`.
//
// `cout` et `niveau` n'existent que dans ce fichier : les faire remonter d'un
// loader de partage demanderait d'importer ce module, ce qui se voit.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { element, evenement, evenementElement, evenementIntervenant, intervenant } from "../../db/schema/index";
import {
  estTypeEvenement,
  MAX_LONGUEUR_DESCRIPTION,
  MAX_LONGUEUR_TITRE,
  type TypeEvenement,
} from "./types";

export type SaisieEvenement = {
  titre: string;
  dateDebut: string;
  dateFin: string | null;
  type: TypeEvenement;
  niveau: number;
  description: string | null;
  /** Décimal en texte : `numeric` ne passe pas par un flottant sans mentir. */
  cout: string | null;
  elementIds: number[];
  intervenantIds: number[];
};

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
/** `numeric(10, 2)` : huit chiffres avant la virgule, deux après. */
const MONTANT = /^\d{1,8}([.,]\d{1,2})?$/;

const texteOuNull = (valeur: FormDataEntryValue | null): string | null => {
  const t = String(valeur ?? "").trim();
  return t.length === 0 ? null : t;
};

const identifiants = (form: FormData, champ: string): number[] => {
  const vus = new Set<number>();
  for (const brut of form.getAll(champ)) {
    const n = Number(brut);
    if (Number.isInteger(n) && n > 0) vus.add(n);
  }
  return [...vus];
};

export type LectureSaisie = { ok: true; valeur: SaisieEvenement } | { ok: false; message: string };

/**
 * Lit et valide un formulaire d'événement. Une date se vérifie par sa forme
 * ET par son ordre : une intervention qui finit avant d'avoir commencé passe
 * tous les contrôles de type et ne veut rien dire.
 */
export function lireSaisieEvenement(form: FormData): LectureSaisie {
  const titre = String(form.get("titre") ?? "").trim();
  if (titre.length === 0) return { ok: false, message: "Donnez un titre à l'événement." };
  if (titre.length > MAX_LONGUEUR_TITRE) return { ok: false, message: "Le titre est trop long." };

  const dateDebut = String(form.get("dateDebut") ?? "").trim();
  if (!JOUR.test(dateDebut)) return { ok: false, message: "La date de début est obligatoire." };

  const dateFin = texteOuNull(form.get("dateFin"));
  if (dateFin !== null && !JOUR.test(dateFin)) return { ok: false, message: "La date de fin est illisible." };
  if (dateFin !== null && dateFin < dateDebut) {
    return { ok: false, message: "La date de fin précède la date de début." };
  }

  const type = String(form.get("type") ?? "autre");
  if (!estTypeEvenement(type)) return { ok: false, message: "Ce type d'événement n'existe pas." };

  // `Number("")` et `Number(null)` valent 0, c'est-à-dire « public » : un
  // formulaire amputé de ce champ publierait au niveau le plus ouvert. La
  // valeur absente est donc refusée, pas repliée sur un défaut.
  const niveauBrut = String(form.get("niveau") ?? "").trim();
  const niveau = Number(niveauBrut);
  if (niveauBrut === "" || !Number.isInteger(niveau) || niveau < 0 || niveau > 3) {
    return { ok: false, message: "Le niveau de visibilité est hors bornes." };
  }

  const description = texteOuNull(form.get("description"));
  if (description !== null && description.length > MAX_LONGUEUR_DESCRIPTION) {
    return { ok: false, message: "La description est trop longue." };
  }

  const coutBrut = texteOuNull(form.get("cout"));
  if (coutBrut !== null && !MONTANT.test(coutBrut)) {
    return { ok: false, message: "Le coût doit être un montant, au plus deux décimales." };
  }

  return {
    ok: true,
    valeur: {
      titre,
      dateDebut,
      dateFin,
      type,
      niveau,
      description,
      cout: coutBrut === null ? null : coutBrut.replace(",", "."),
      elementIds: identifiants(form, "elementId"),
      intervenantIds: identifiants(form, "intervenantId"),
    },
  };
}

/**
 * Les identifiants venus du formulaire n'entrent jamais tels quels : un id
 * d'une autre propriété s'attacherait silencieusement (règle non négociable
 * #4). 404 sur le premier intrus, sans distinguer « n'existe pas » de « n'est
 * pas à vous ».
 *
 * C'est la PREMIÈRE des attaches de l'invariant « un lien ne traverse pas les
 * propriétés », pas la seule : `clauseEvenementVisible` le rejoue en lecture,
 * dans sa négation. Deux gardes indépendantes pour un invariant dont la
 * violation coûterait le titre et la description d'un événement d'une autre
 * propriété — c'est le prix d'une comparaison d'entiers.
 */
async function verifierAppartenance(proprieteId: number, saisie: SaisieEvenement) {
  if (saisie.elementIds.length > 0) {
    const lignes = await db.select({ id: element.id }).from(element)
      .where(and(eq(element.proprieteId, proprieteId), inArray(element.id, saisie.elementIds)));
    if (lignes.length !== saisie.elementIds.length) throw new Response("Introuvable", { status: 404 });
  }
  if (saisie.intervenantIds.length > 0) {
    const lignes = await db.select({ id: intervenant.id }).from(intervenant)
      .where(and(eq(intervenant.proprieteId, proprieteId), inArray(intervenant.id, saisie.intervenantIds)));
    if (lignes.length !== saisie.intervenantIds.length) throw new Response("Introuvable", { status: 404 });
  }
}

/** Les liens sont réécrits en bloc : ils n'ont pas d'existence propre. */
async function ecrireLiens(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  evenementId: number,
  saisie: SaisieEvenement,
) {
  await tx.delete(evenementElement).where(eq(evenementElement.evenementId, evenementId));
  await tx.delete(evenementIntervenant).where(eq(evenementIntervenant.evenementId, evenementId));

  if (saisie.elementIds.length > 0) {
    await tx.insert(evenementElement)
      .values(saisie.elementIds.map((elementId) => ({ evenementId, elementId })));
  }
  if (saisie.intervenantIds.length > 0) {
    await tx.insert(evenementIntervenant)
      .values(saisie.intervenantIds.map((intervenantId) => ({ evenementId, intervenantId })));
  }
}

export async function creerEvenement(proprieteId: number, saisie: SaisieEvenement): Promise<number> {
  await verifierAppartenance(proprieteId, saisie);

  return await db.transaction(async (tx) => {
    const [ligne] = await tx.insert(evenement).values({
      proprieteId,
      titre: saisie.titre,
      dateDebut: saisie.dateDebut,
      dateFin: saisie.dateFin,
      type: saisie.type,
      niveau: saisie.niveau,
      description: saisie.description,
      cout: saisie.cout,
    }).returning({ id: evenement.id });

    await ecrireLiens(tx, ligne.id, saisie);
    return ligne.id;
  });
}

export async function majEvenement(proprieteId: number, evenementId: number, saisie: SaisieEvenement) {
  await verifierAppartenance(proprieteId, saisie);

  await db.transaction(async (tx) => {
    const lignes = await tx.update(evenement).set({
      titre: saisie.titre,
      dateDebut: saisie.dateDebut,
      dateFin: saisie.dateFin,
      type: saisie.type,
      niveau: saisie.niveau,
      description: saisie.description,
      cout: saisie.cout,
    })
      .where(and(eq(evenement.id, evenementId), eq(evenement.proprieteId, proprieteId)))
      .returning({ id: evenement.id });

    if (lignes.length === 0) throw new Response("Introuvable", { status: 404 });
    await ecrireLiens(tx, evenementId, saisie);
  });
}

export async function supprimerEvenement(proprieteId: number, evenementId: number) {
  const lignes = await db.delete(evenement)
    .where(and(eq(evenement.id, evenementId), eq(evenement.proprieteId, proprieteId)))
    .returning({ id: evenement.id });
  if (lignes.length === 0) throw new Response("Introuvable", { status: 404 });
}

export type EvenementProprietaire = SaisieEvenement & { id: number };

/** L'événement tel que son formulaire de modification le relit, coût compris. */
export async function chargerEvenementProprietaire(
  proprieteId: number,
  evenementIdBrut: string | undefined,
): Promise<EvenementProprietaire> {
  const evenementId = Number(evenementIdBrut);
  if (!Number.isInteger(evenementId) || evenementId <= 0) throw new Response("Introuvable", { status: 404 });

  const lignes = await db.execute<EvenementProprietaire>(sql`
    SELECT
      ev.id,
      ev.titre,
      to_char(ev.date_debut, 'YYYY-MM-DD') AS "dateDebut",
      to_char(ev.date_fin, 'YYYY-MM-DD')   AS "dateFin",
      ev.type,
      ev.niveau,
      ev.description,
      ev.cout,
      coalesce((SELECT array_agg(ee.element_id ORDER BY ee.element_id)
                FROM evenement_element ee WHERE ee.evenement_id = ev.id), '{}') AS "elementIds",
      coalesce((SELECT array_agg(ei.intervenant_id ORDER BY ei.intervenant_id)
                FROM evenement_intervenant ei WHERE ei.evenement_id = ev.id), '{}') AS "intervenantIds"
    FROM evenement ev
    WHERE ev.id = ${evenementId} AND ev.propriete_id = ${proprieteId}
  `);

  const ligne = lignes.rows[0];
  if (!ligne) throw new Response("Introuvable", { status: 404 });
  return ligne;
}

export type ElementChoisissable = { id: number; nom: string; zoneNom: string; typeNom: string };

/** Le sélecteur d'objets liés. Toute la propriété : c'est l'écran du propriétaire. */
export async function chargerElementsChoisissables(proprieteId: number): Promise<ElementChoisissable[]> {
  const lignes = await db.execute<ElementChoisissable>(sql`
    SELECT e.id, e.nom, z.nom AS "zoneNom", t.nom AS "typeNom"
    FROM element e
    JOIN zone z ON z.id = e.zone_id
    JOIN type_element t ON t.id = e.type_id
    WHERE e.propriete_id = ${proprieteId}
    ORDER BY z.nom, e.nom, e.id
  `);
  return lignes.rows;
}
