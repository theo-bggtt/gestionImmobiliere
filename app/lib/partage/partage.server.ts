// app/lib/partage/partage.server.ts
// Le lien de partage : son jeton, son état, et la portée qu'il donne à la
// requête de l'étape 2. Rien d'autre ne doit fabriquer une `Portee` de
// partage — c'est le seul endroit où `niveau_max`, `portee_zones` et
// `portee_systemes` deviennent un filtre.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { partage, propriete } from "../../db/schema/index";
import type { Portee } from "../recherche/recherche.server";

export type Partage = typeof partage.$inferSelect;

/**
 * 32 octets, encodés URL-safe. Même raisonnement que `session.id` (décision
 * #4 de l'étape 0) : le jeton EST le secret, un identifiant séquentiel ou
 * dérivé se devine, et le lien circule dans WhatsApp.
 */
export const creerJeton = () => randomBytes(32).toString("base64url");

// Un jeton fait 43 caractères ; refuser au-delà évite d'aller demander à la
// base de comparer une chaîne d'un mégaoctet.
const JETON_MAX = 128;

/** Portée vide (les deux tableaux vides) = toute la propriété, sous plafond. */
export function porteeDuPartage(p: Partage): Portee {
  return {
    niveauMax: p.niveauMax,
    zones: p.porteeZones.length > 0 ? p.porteeZones : null,
    systemes: p.porteeSystemes.length > 0 ? p.porteeSystemes : null,
  };
}

export const partageActif = (p: Partage, maintenant = new Date()) =>
  p.revoqueLe === null && (p.expireLe === null || p.expireLe > maintenant);

export type EtatPartage =
  | { statut: "actif"; partage: Partage; proprieteNom: string }
  | { statut: "inactif" };

/**
 * Jeton inconnu : 404, sans distinguer « n'existe pas » de « n'est plus à
 * vous » (règle non négociable #4 du plan). Jeton connu mais expiré ou
 * révoqué : `inactif`, pour une page neutre — celui qui tient le lien
 * connaissait déjà le bien, lui dire que le lien a existé ne lui apprend rien.
 *
 * Seul le NOM de la propriété sort d'ici. Ni l'adresse, ni l'EGID, ni son
 * identifiant : ce qui n'est pas chargé ne peut pas fuir dans le HTML.
 */
export async function chargerPartageParJeton(jetonBrut: string | undefined): Promise<EtatPartage> {
  const jeton = jetonBrut ?? "";
  if (jeton.length === 0 || jeton.length > JETON_MAX) {
    throw new Response("Lien introuvable", { status: 404 });
  }

  const [ligne] = await db
    .select({ partage, proprieteNom: propriete.nom })
    .from(partage)
    .innerJoin(propriete, eq(propriete.id, partage.proprieteId))
    .where(eq(partage.jeton, jeton));

  if (!ligne) throw new Response("Lien introuvable", { status: 404 });
  if (!partageActif(ligne.partage)) return { statut: "inactif" };

  return { statut: "actif", partage: ligne.partage, proprieteNom: ligne.proprieteNom };
}
