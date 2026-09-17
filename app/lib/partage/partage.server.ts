// app/lib/partage/partage.server.ts
// Le lien de partage : son jeton, son état, et la portée qu'il donne à la
// requête de l'étape 2. Rien d'autre ne doit fabriquer une `Portee` de
// partage — c'est le seul endroit où `niveau_max`, `portee_zones` et
// `portee_systemes` deviennent un filtre.
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { intervenant, partage, propriete, systeme } from "../../db/schema/index";
import { chargerZonesVignettes, type Portee } from "../recherche/recherche.server";

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

/**
 * Les liens encore ouverts d'une propriété. Le prédicat d'activité reste
 * `partageActif`, en JavaScript : une seconde écriture en SQL de « ni révoqué
 * ni expiré » dériverait de celle-ci au premier changement.
 */
export async function chargerPartagesActifs(proprieteId: number): Promise<Partage[]> {
  const lignes = await db.select().from(partage).where(eq(partage.proprieteId, proprieteId));
  return lignes.filter((p) => partageActif(p));
}

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


// ─── Créer et corriger un lien ────────────────────────────────────────────

const NOM_MAX = 120;

export type SaisiePartage = {
  nom: string;
  niveauMax: number;
  porteeZones: number[];
  porteeSystemes: number[];
  expireLe: Date | null;
  intervenantId: number | null;
};

export type LectureSaisiePartage = { ok: true; valeur: SaisiePartage } | { ok: false; message: string };

/**
 * La saisie d'un lien, lue et bornée une seule fois pour les deux écrans qui
 * l'écrivent — la création et la correction. Deux lectures du même formulaire
 * dériveraient, et c'est le genre de dérive qui s'appelle « le plafond n'est
 * pas vérifié sur l'écran de modification ».
 *
 * Jamais confiance à un identifiant venu du formulaire : une portée écrite
 * avec les zones du voisin ne fuirait rien (le filtre porte aussi sur la
 * propriété) mais elle mentirait sur l'écran de gestion.
 */
export async function lireSaisiePartage(proprieteId: number, form: FormData): Promise<LectureSaisiePartage> {
  const nom = String(form.get("nom") ?? "").trim().slice(0, NOM_MAX);
  if (!nom) return { ok: false, message: "Le nom est obligatoire." };

  // `Number("")` vaut 0, c'est-à-dire le plafond le plus OUVERT : un formulaire
  // amputé de ce champ partagerait tout. Refusé, jamais replié — même
  // raisonnement que `lireNiveauSaisi` sur une fiche.
  const niveauBrut = String(form.get("niveauMax") ?? "").trim();
  const niveauMax = Number(niveauBrut);
  if (niveauBrut === "" || !Number.isInteger(niveauMax) || niveauMax < 0 || niveauMax > 3) {
    return { ok: false, message: "Plafond de visibilité invalide." };
  }

  const expireLeBrut = String(form.get("expireLe") ?? "").trim();
  let expireLe: Date | null = null;
  if (expireLeBrut) {
    // Le lien du locataire expire « au départ », c'est-à-dire à la fin du jour
    // choisi, pas à minuit le matin.
    expireLe = new Date(`${expireLeBrut}T23:59:59`);
    if (Number.isNaN(expireLe.getTime())) return { ok: false, message: "Date d'expiration invalide." };
  }

  const [zones, systemes] = await Promise.all([
    chargerZonesVignettes(proprieteId),
    db.select({ id: systeme.id }).from(systeme).where(eq(systeme.proprieteId, proprieteId)),
  ]);
  const ids = (champ: string, connus: Set<number>) =>
    [...new Set(form.getAll(champ).map(Number))].filter((id) => connus.has(id));

  const intervenantBrut = String(form.get("intervenantId") ?? "").trim();
  let intervenantId: number | null = null;
  if (intervenantBrut) {
    const [ligne] = await db
      .select({ id: intervenant.id })
      .from(intervenant)
      .where(and(eq(intervenant.id, Number(intervenantBrut)), eq(intervenant.proprieteId, proprieteId)));
    if (!ligne) return { ok: false, message: "Intervenant invalide." };
    intervenantId = ligne.id;
  }

  return {
    ok: true,
    valeur: {
      nom,
      niveauMax,
      porteeZones: ids("zone", new Set(zones.map((z) => z.id))),
      porteeSystemes: ids("systeme", new Set(systemes.map((s) => s.id))),
      expireLe,
      intervenantId,
    },
  };
}

export async function creerPartage(proprieteId: number, saisie: SaisiePartage): Promise<Partage> {
  const [ligne] = await db
    .insert(partage)
    .values({ proprieteId, jeton: creerJeton(), ...saisie })
    .returning();
  return ligne;
}

/**
 * Corriger un lien SANS toucher à son jeton : c'est tout l'intérêt. Changer le
 * plafond d'un artisan ne doit pas l'obliger à recevoir une nouvelle adresse —
 * celle qu'il a déjà dans sa messagerie continue de marcher.
 *
 * `jeton` n'est tout simplement pas dans le `set`, et `SaisiePartage` ne le
 * porte pas : le faire tourner ici ne serait pas une option à ne pas prendre,
 * c'est une erreur de compilation.
 *
 * `revoque_le IS NULL` dans le WHERE, et non une vérification préalable : un
 * lien révoqué est une TRACE — de ce qui a été ouvert, à qui, et jusqu'à
 * quand — et la réécrire serait réécrire l'histoire. On ne le ressuscite pas
 * non plus : ce qui est coupé se remplace par un lien neuf, avec un jeton neuf,
 * ce qui est précisément ce que la révocation voulait dire.
 */
export async function majPartage(proprieteId: number, partageId: number, saisie: SaisiePartage): Promise<boolean> {
  const lignes = await db
    .update(partage)
    .set(saisie)
    .where(and(eq(partage.id, partageId), eq(partage.proprieteId, proprieteId), isNull(partage.revoqueLe)))
    .returning({ id: partage.id });
  return lignes.length > 0;
}

export type PartageAvecIntervenant = Partage & { intervenantNom: string | null };

/**
 * Un lien de la propriété, ou 404 — sans distinguer « n'existe pas » de « n'est
 * pas à vous » (règle non négociable #4).
 */
export async function chargerPartageOu404(proprieteId: number, partageIdBrut: string | undefined) {
  const [ligne] = await db
    .select({ partage, intervenantNom: intervenant.nom })
    .from(partage)
    .leftJoin(intervenant, eq(intervenant.id, partage.intervenantId))
    .where(and(eq(partage.id, Number(partageIdBrut)), eq(partage.proprieteId, proprieteId)));
  if (!ligne) throw new Response("Lien introuvable", { status: 404 });
  return { ...ligne.partage, intervenantNom: ligne.intervenantNom } satisfies PartageAvecIntervenant;
}

/** Les liens donnés à une personne du carnet, le plus récent d'abord. */
export async function chargerPartagesDeLIntervenant(proprieteId: number, intervenantId: number): Promise<Partage[]> {
  return db
    .select()
    .from(partage)
    .where(and(eq(partage.proprieteId, proprieteId), eq(partage.intervenantId, intervenantId)))
    .orderBy(sql`${partage.creeLe} DESC`);
}
