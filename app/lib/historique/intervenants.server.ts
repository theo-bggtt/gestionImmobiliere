// app/lib/historique/intervenants.server.ts
// Le carnet d'adresses des artisans. C'est la PREMIÈRE fois que le produit
// stocke les données personnelles d'un tiers, et cette table est la seule.
//
// Tout ce qui sort d'ici vers un lien de partage passe par
// `historique.server.ts`, qui ne sélectionne que `nom` et `metier`. Les
// fonctions de ce fichier lisent `tel`, `email` et `notes` : elles ne sont
// appelées que par les écrans du propriétaire, et le jour où un loader de
// partage importerait ce module, ça se verrait dans la revue.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { intervenant } from "../../db/schema/index";
import { chargerRessourceOu404 } from "../db/scopedResource.server";
import {
  MAX_LONGUEUR_CHAMP_COURT,
  MAX_LONGUEUR_NOM_INTERVENANT,
  MAX_LONGUEUR_NOTES,
} from "./types";

export type SaisieIntervenant = {
  nom: string;
  metier: string | null;
  tel: string | null;
  email: string | null;
  niveau: number;
  notes: string | null;
};

const texteOuNull = (valeur: FormDataEntryValue | null): string | null => {
  const t = String(valeur ?? "").trim();
  return t.length === 0 ? null : t;
};

export type LectureSaisieIntervenant =
  | { ok: true; valeur: SaisieIntervenant }
  | { ok: false; message: string };

export function lireSaisieIntervenant(form: FormData): LectureSaisieIntervenant {
  const nom = String(form.get("nom") ?? "").trim();
  if (nom.length === 0) return { ok: false, message: "Donnez un nom à l'intervenant." };
  if (nom.length > MAX_LONGUEUR_NOM_INTERVENANT) return { ok: false, message: "Le nom est trop long." };

  const metier = texteOuNull(form.get("metier"));
  const tel = texteOuNull(form.get("tel"));
  const email = texteOuNull(form.get("email"));
  for (const [valeur, quoi] of [[metier, "Le métier"], [tel, "Le téléphone"], [email, "L'adresse e-mail"]] as const) {
    if (valeur !== null && valeur.length > MAX_LONGUEUR_CHAMP_COURT) {
      return { ok: false, message: `${quoi} est trop long.` };
    }
  }
  // Contrôle volontairement minimal : les formats de téléphone et d'e-mail
  // réels débordent toute expression régulière raisonnable, et c'est un carnet
  // d'adresses personnel, pas un formulaire d'inscription.
  if (email !== null && !email.includes("@")) {
    return { ok: false, message: "Cette adresse e-mail n'en a pas l'air." };
  }

  // `Number("")` et `Number(null)` valent 0, c'est-à-dire « public » : un
  // formulaire amputé de ce champ publierait au niveau le plus ouvert. La
  // valeur absente est donc refusée, pas repliée sur un défaut.
  const niveauBrut = String(form.get("niveau") ?? "").trim();
  const niveau = Number(niveauBrut);
  if (niveauBrut === "" || !Number.isInteger(niveau) || niveau < 0 || niveau > 3) {
    return { ok: false, message: "Le niveau de visibilité est hors bornes." };
  }

  const notes = texteOuNull(form.get("notes"));
  if (notes !== null && notes.length > MAX_LONGUEUR_NOTES) {
    return { ok: false, message: "Les notes sont trop longues." };
  }

  return { ok: true, valeur: { nom, metier, tel, email, niveau, notes } };
}

export type IntervenantListe = {
  id: number;
  nom: string;
  metier: string | null;
  tel: string | null;
  email: string | null;
  niveau: number;
  /** Combien d'événements le citent : de quoi savoir ce qu'une suppression emporte. */
  nbEvenements: number;
};

export async function chargerIntervenants(proprieteId: number): Promise<IntervenantListe[]> {
  const lignes = await db.execute<IntervenantListe>(sql`
    SELECT
      i.id, i.nom, i.metier, i.tel, i.email, i.niveau,
      (SELECT count(*) FROM evenement_intervenant ei WHERE ei.intervenant_id = i.id)::int AS "nbEvenements"
    FROM intervenant i
    WHERE i.propriete_id = ${proprieteId}
    ORDER BY i.nom, i.id
  `);
  return lignes.rows;
}

export const chargerIntervenantOu404 = (proprieteId: number, intervenantIdBrut: string | number | undefined) =>
  chargerRessourceOu404(
    intervenant,
    and(eq(intervenant.id, Number(intervenantIdBrut)), eq(intervenant.proprieteId, proprieteId)),
    "Intervenant introuvable",
  );

export async function creerIntervenant(proprieteId: number, saisie: SaisieIntervenant): Promise<number> {
  const [ligne] = await db.insert(intervenant).values({ proprieteId, ...saisie }).returning({ id: intervenant.id });
  return ligne.id;
}

export async function majIntervenant(proprieteId: number, intervenantId: number, saisie: SaisieIntervenant) {
  const lignes = await db.update(intervenant).set(saisie)
    .where(and(eq(intervenant.id, intervenantId), eq(intervenant.proprieteId, proprieteId)))
    .returning({ id: intervenant.id });
  if (lignes.length === 0) throw new Response("Introuvable", { status: 404 });
}

export async function supprimerIntervenant(proprieteId: number, intervenantId: number) {
  const lignes = await db.delete(intervenant)
    .where(and(eq(intervenant.id, intervenantId), eq(intervenant.proprieteId, proprieteId)))
    .returning({ id: intervenant.id });
  if (lignes.length === 0) throw new Response("Introuvable", { status: 404 });
}
