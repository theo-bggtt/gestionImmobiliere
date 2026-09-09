// app/lib/auth/inscription.server.ts
// L'inscription est fermée dès qu'un compte existe. C'est un produit à
// propriétaire unique : `/inscription` sur Internet sans cette porte est un
// hébergement de photos ouvert à tous, sur la carte SD qui porte la maison
// (issue #26). Le premier compte s'inscrit librement — c'est le démarrage —
// et les suivants demandent une décision explicite du propriétaire :
// `AUTORISER_INSCRIPTION=1` dans l'environnement, le temps de créer le
// compte, puis retiré.
import { count, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { utilisateur } from "../../db/schema/index";

export { MESSAGE_INSCRIPTION_FERMEE } from "./inscription";

// Clé du verrou consultatif qui sérialise deux premières inscriptions
// simultanées : sans lui, chacune lirait zéro compte et les deux passeraient.
const VERROU_INSCRIPTION = 8_101;

function autoriseeParLEnvironnement(): boolean {
  return process.env.AUTORISER_INSCRIPTION === "1";
}

async function aucunCompte(tx: Pick<typeof db, "select">): Promise<boolean> {
  const [{ n }] = await tx.select({ n: count() }).from(utilisateur);
  return n === 0;
}

/** Ce que les écrans lisent pour afficher, ou non, le formulaire et son lien. */
export async function inscriptionOuverte(): Promise<boolean> {
  return autoriseeParLEnvironnement() || (await aucunCompte(db));
}

export type ResultatInscription = { statut: "cree"; id: number } | { statut: "fermee" } | { statut: "email_pris" };

/**
 * Crée le compte si la porte est ouverte, sous verrou. `email_pris` n'est
 * rendu que porte ouverte : fermée, on ne regarde même pas l'adresse.
 */
export async function inscrire(email: string, motDePasseHash: string): Promise<ResultatInscription> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${VERROU_INSCRIPTION}::bigint)`);

    if (!autoriseeParLEnvironnement() && !(await aucunCompte(tx))) return { statut: "fermee" };

    const [existe] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, email));
    if (existe) return { statut: "email_pris" };

    const [cree] = await tx.insert(utilisateur).values({ email, motDePasseHash }).returning({ id: utilisateur.id });
    return { statut: "cree", id: cree.id };
  });
}
