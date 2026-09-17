// app/lib/coffre/coffre.server.ts
// Le coffre côté serveur : lire ce que le navigateur a chiffré, vérifier la
// FORME de ce qu'il envoie, et l'écrire. Rien ici n'ouvre quoi que ce soit —
// le serveur n'a ni la phrase, ni la clé de secours, ni la clé de données, et
// `chiffrement.ts` n'est importé que pour ses longueurs et son découpage de
// bloc.
//
// Aucune de ces fonctions n'est importée par `app/lib/partage/` ni par
// `app/routes/_partage/` : un secret ne sort d'aucun lien, à aucun plafond, et
// `tests/coffre/partage-statique.test.ts` l'interdit au texte. Les types
// servis à un partage (`FicheRendue`, …) ne portent pas de champ pour lui,
// donc l'y écrire ne compilerait pas.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { coffre, element, secret } from "../../db/schema/index";
import {
  LONGUEUR_CLE,
  LONGUEUR_ETIQUETTE,
  LONGUEUR_SEL,
  decoderBase64url,
  lireBloc,
  type CoffreOuvrable,
} from "./chiffrement";
import { LIBELLE_MAX, type SecretRendu } from "./types";

/**
 * Bornes du nombre d'itérations reçu du client. Un entier, et rien d'autre :
 * `Number("")` vaut 0, et 0 itération est une clé dérivée en clair. Le
 * plancher est celui de la production ; les tests, qui tournent avec 1 000,
 * passent par `creerCoffre` directement et non par cette lecture.
 */
export const ITERATIONS_MIN = 100_000;
export const ITERATIONS_MAX = 10_000_000;

/** Un bloc de secret en base64url : le clair est borné à `VALEUR_MAX` avant chiffrement, ceci borne le reste. */
const BLOC_MAX = 4096;

// ---------------------------------------------------------------------------
// Lecture.

export async function chargerCoffre(proprieteId: number): Promise<CoffreOuvrable | null> {
  const [ligne] = await db
    .select({
      sel: coffre.sel,
      iterations: coffre.iterations,
      cleParPhrase: coffre.cleParPhrase,
      cleParSecours: coffre.cleParSecours,
    })
    .from(coffre)
    .where(eq(coffre.proprieteId, proprieteId));
  return ligne ?? null;
}

/** Combien de secrets disparaîtraient en vidant le coffre : c'est ce que la confirmation dit. */
export async function compterSecrets(proprieteId: number): Promise<number> {
  const lignes = await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n
    FROM secret s
    JOIN element e ON e.id = s.element_id
    WHERE e.propriete_id = ${proprieteId}
  `);
  return Number(lignes.rows[0]?.n ?? 0);
}

/**
 * Les secrets d'un objet, pour sa fiche. L'appartenance est répétée dans la
 * requête bien que la fiche l'ait déjà vérifiée (règle #4 : le filtre vit dans
 * la requête, pas dans la promesse de l'appelant).
 */
export async function chargerSecretsDeLElement(proprieteId: number, elementId: number): Promise<SecretRendu[]> {
  const lignes = await db.execute<SecretRendu>(sql`
    SELECT s.id, s.libelle, s.valeur
    FROM secret s
    JOIN element e ON e.id = s.element_id
    WHERE s.element_id = ${elementId}
      AND e.propriete_id = ${proprieteId}
    ORDER BY s.id ASC
  `);
  return lignes.rows;
}

// ---------------------------------------------------------------------------
// Formes. Le serveur ne peut vérifier que ça, et le fait avant d'écrire.

/** Une enveloppe : un bloc dont le corps est exactement une clé de 32 octets et son étiquette. */
export function lireEnveloppe(brut: FormDataEntryValue | null): string | null {
  const texte = String(brut ?? "");
  try {
    const bloc = lireBloc(texte);
    return bloc.corps.length === LONGUEUR_CLE + LONGUEUR_ETIQUETTE ? texte : null;
  } catch {
    return null;
  }
}

/** Un secret : un bloc dont le corps porte au moins un octet sous l'étiquette, borné. */
function lireBlocSecret(brut: FormDataEntryValue | null): string | null {
  const texte = String(brut ?? "");
  if (texte.length > BLOC_MAX) return null;
  try {
    const bloc = lireBloc(texte);
    return bloc.corps.length > LONGUEUR_ETIQUETTE ? texte : null;
  } catch {
    return null;
  }
}

export type SaisieCoffre = {
  sel: string;
  iterations: number;
  cleParPhrase: string;
  cleParSecours: string;
};

export type Lecture<T> = { ok: true; valeur: T } | { ok: false; message: string };

export function lireSaisieCoffre(form: FormData): Lecture<SaisieCoffre> {
  const sel = String(form.get("sel") ?? "");
  try {
    if (decoderBase64url(sel).length !== LONGUEUR_SEL) throw new Error();
  } catch {
    return { ok: false, message: "Le sel n'a pas la forme attendue." };
  }

  const iterationsTexte = String(form.get("iterations") ?? "");
  const iterations = /^\d+$/.test(iterationsTexte) ? Number(iterationsTexte) : NaN;
  if (!Number.isInteger(iterations) || iterations < ITERATIONS_MIN || iterations > ITERATIONS_MAX) {
    return { ok: false, message: "Le nombre d'itérations n'est pas dans la plage attendue." };
  }

  const cleParPhrase = lireEnveloppe(form.get("cleParPhrase"));
  const cleParSecours = lireEnveloppe(form.get("cleParSecours"));
  if (!cleParPhrase || !cleParSecours) {
    return { ok: false, message: "Les clés enveloppées n'ont pas la forme attendue." };
  }

  return { ok: true, valeur: { sel, iterations, cleParPhrase, cleParSecours } };
}

export type SaisieSecret = { libelle: string; valeur: string };

export function lireSaisieSecret(form: FormData): Lecture<SaisieSecret> {
  const libelle = String(form.get("libelle") ?? "").trim();
  if (!libelle) return { ok: false, message: "Donnez un libellé au secret." };
  if (libelle.length > LIBELLE_MAX) return { ok: false, message: "Le libellé est trop long." };

  const valeur = lireBlocSecret(form.get("valeur"));
  if (!valeur) return { ok: false, message: "La valeur chiffrée n'a pas la forme attendue." };

  return { ok: true, valeur: { libelle, valeur } };
}

// ---------------------------------------------------------------------------
// Écriture.

/**
 * Crée le coffre. Rend `false` s'il en existe déjà un : la clé primaire ferme
 * la course entre deux créations, et on lit le nombre de lignes plutôt que de
 * vérifier avant — même montage que la consommation d'une invitation.
 */
export async function creerCoffre(proprieteId: number, saisie: SaisieCoffre): Promise<boolean> {
  const lignes = await db
    .insert(coffre)
    .values({ proprieteId, ...saisie })
    .onConflictDoNothing({ target: coffre.proprieteId })
    .returning({ proprieteId: coffre.proprieteId });
  return lignes.length === 1;
}

/**
 * Changer la phrase, c'est réécrire la SEULE enveloppe par phrase. Ni le sel,
 * ni les itérations, ni l'enveloppe par secours, ni un octet d'un secret :
 * `tests/coffre/routes.test.ts` compare les `md5` avant et après.
 */
export async function majCleParPhrase(proprieteId: number, cleParPhrase: string): Promise<boolean> {
  const lignes = await db
    .update(coffre)
    .set({ cleParPhrase })
    .where(eq(coffre.proprieteId, proprieteId))
    .returning({ proprieteId: coffre.proprieteId });
  return lignes.length === 1;
}

/**
 * Vider : tous les secrets de la propriété, puis le coffre. C'est le seul
 * recours quand la phrase ET la clé de secours sont perdues, et il ne rend
 * rien — il efface. Les secrets rejoignent la propriété par leur objet, d'où
 * le `USING element` : rien d'une autre propriété n'est touché.
 */
export async function viderCoffre(proprieteId: number): Promise<{ secrets: number }> {
  return db.transaction(async (tx) => {
    const effaces = await tx.execute(sql`
      DELETE FROM secret s
      USING element e
      WHERE e.id = s.element_id AND e.propriete_id = ${proprieteId}
    `);
    await tx.delete(coffre).where(eq(coffre.proprieteId, proprieteId));
    return { secrets: effaces.rowCount ?? 0 };
  });
}

/**
 * Pose un secret sur un objet. L'objet doit être de la propriété (404 sinon,
 * jamais 403), et la propriété doit avoir un coffre — sans lui, le bloc reçu
 * n'a été chiffré par rien que l'on connaisse et ne se rouvrira jamais.
 */
export async function creerSecret(
  proprieteId: number,
  elementId: number,
  saisie: SaisieSecret,
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const [objet] = await db
    .select({ id: element.id })
    .from(element)
    .where(and(eq(element.id, elementId), eq(element.proprieteId, proprieteId)));
  if (!objet) throw new Response("Introuvable", { status: 404 });

  if (!(await chargerCoffre(proprieteId))) {
    return { ok: false, message: "Créez d'abord le coffre de la propriété." };
  }

  const [ligne] = await db.insert(secret).values({ elementId, ...saisie }).returning({ id: secret.id });
  return { ok: true, id: ligne.id };
}

/** Retire un secret. Le chemin de l'appartenance passe par son objet ; 404 sinon. */
export async function supprimerSecret(proprieteId: number, secretId: number): Promise<void> {
  const effaces = await db.execute(sql`
    DELETE FROM secret s
    USING element e
    WHERE s.id = ${secretId}
      AND e.id = s.element_id
      AND e.propriete_id = ${proprieteId}
  `);
  if ((effaces.rowCount ?? 0) === 0) throw new Response("Introuvable", { status: 404 });
}
