// scripts/compte.ts
// Créer un compte, ou remettre le mot de passe d'un compte existant.
//
// C'est LE SEUL chemin pour un mot de passe oublié : l'application n'a aucun
// écran de changement de mot de passe, aucun mailer — donc pas de « mot de
// passe oublié » par email (décision #105) — et argon2 est irréversible par
// construction. Sans ce script, un mot de passe oublié enferme dehors
// définitivement.
//
// PAS DE GARDE `NODE_ENV=production`, contrairement à `seed-exemple.ts`, et
// c'est réfléchi. Ce script demande `DATABASE_URL` ET un shell sur la machine ;
// qui tient ces deux-là peut déjà écrire le hash à la main en SQL, donc la
// garde ne protégerait personne. En revanche elle enfermerait le propriétaire
// dehors sur la seule machine où c'est irrécupérable, le VPS. `seed-exemple`
// refuse pour une tout autre raison : il crée un compte dont les identifiants
// sont PUBLIÉS dans le README. Ici le mot de passe vient de l'appelant.
//
// Il vient de l'appelant et de nulle part ailleurs : aucune valeur par défaut,
// jamais de mot de passe écrit dans le dépôt.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import * as schema from "../app/db/schema/index";
import { hacherMotDePasse } from "../app/lib/auth/password.server";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

/**
 * Le même plancher que l'écran d'inscription (`register.tsx`). Écrit deux
 * fois, et signalé des deux côtés : le partager demanderait de sortir la
 * constante dans un module neutre pour une valeur qui n'a jamais bougé, et
 * l'écart se verrait ici au premier essai. Même arbitrage que `SOMMETS_MIN`
 * dupliqué dans le SQL de la migration 0009.
 */
export const MOT_DE_PASSE_MIN = 8;

export type ResultatCompte = "cree" | "remis";

/**
 * Crée le compte, ou remplace le hash de celui qui porte cette adresse.
 *
 * L'adresse est normalisée comme à l'inscription (minuscules, sans espaces
 * autour) : sans ça, `Theo@X.local` créerait un second compte à côté de
 * `theo@x.local` au lieu de lui remettre son mot de passe.
 */
export async function poserMotDePasse(email: string, motDePasse: string): Promise<ResultatCompte> {
  const adresse = email.toLowerCase().trim();
  if (!adresse.includes("@")) throw new Error("Adresse email invalide.");
  if (motDePasse.length < MOT_DE_PASSE_MIN) {
    throw new Error(`Mot de passe trop court : ${MOT_DE_PASSE_MIN} caractères au minimum.`);
  }

  const motDePasseHash = await hacherMotDePasse(motDePasse);

  // Lu avant d'écrire, pour pouvoir dire lequel des deux cas s'est produit
  // sans le déduire de quoi que ce soit : un `onConflictDoUpdate` écrirait en
  // une requête mais `RETURNING` ne dit pas s'il a inséré ou mis à jour. Rien
  // à sérialiser ici — c'est une commande lancée à la main sur une machine.
  const [existant] = await db
    .select({ id: schema.utilisateur.id })
    .from(schema.utilisateur)
    .where(eq(schema.utilisateur.email, adresse));

  if (existant) {
    await db.update(schema.utilisateur).set({ motDePasseHash }).where(eq(schema.utilisateur.id, existant.id));
    return "remis";
  }

  await db.insert(schema.utilisateur).values({ email: adresse, motDePasseHash });
  return "cree";
}

async function main() {
  const [email, motDePasse] = process.argv.slice(2);

  if (!email || !motDePasse) {
    console.error("Usage : npm run compte -- <email> <motdepasse>");
    console.error("Crée le compte s'il n'existe pas, remet son mot de passe sinon.");
    process.exitCode = 1;
    await pool.end();
    return;
  }

  try {
    const resultat = await poserMotDePasse(email, motDePasse);
    console.log(
      resultat === "cree"
        ? `Compte ${email.toLowerCase().trim()} créé.`
        : `Mot de passe de ${email.toLowerCase().trim()} remis.`,
    );
  } catch (erreur) {
    // Le message seul, sans la trace : une faute de saisie n'est pas un bug,
    // et la trace ne dirait rien de plus à qui tape une commande. Le code de
    // sortie, lui, reste non nul — c'est ce qui se lit dans un script.
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exitCode = 1;
  }
  await pool.end();
}

// Pas à l'import : la suite de tests importe `poserMotDePasse`, comme elle
// importe `CATALOGUE` de `seed-catalogue.ts`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
