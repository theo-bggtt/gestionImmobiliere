// app/lib/auth/inscription.server.ts
// L'inscription est fermée dès qu'un compte existe. C'est un produit à
// propriétaire unique : `/inscription` sur Internet sans cette porte est un
// hébergement de photos ouvert à tous, sur la carte SD qui porte la maison
// (issue #26). Le premier compte s'inscrit librement — c'est le démarrage —
// et les suivants demandent une décision explicite du propriétaire :
// `AUTORISER_INSCRIPTION=1` dans l'environnement, le temps de créer le
// compte, puis retiré.
//
// « LE TEMPS DE CRÉER LE COMPTE » EST MAINTENANT BORNÉ EN CODE, et ne l'était
// pas : la variable posée autorisait autant de comptes qu'on voulait — mesuré,
// six comptes créés d'affilée en la laissant en place. Un opérateur qui oublie
// de la retirer, ou un `docker compose up -d` qui la relit d'un `.env` jamais
// nettoyé, rouvrait une inscription publique. Elle vaut désormais pour UN
// compte de plus que ceux qui existent au moment où on la pose.
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

async function nombreDeComptes(tx: Pick<typeof db, "select">): Promise<number> {
  const [{ n }] = await tx.select({ n: count() }).from(utilisateur);
  return n;
}

/**
 * Le plafond que `AUTORISER_INSCRIPTION=1` lève, et le seul.
 *
 * Deux comptes en tout, pas « un de plus à chaque fois ». C'est un plafond
 * DUR : la variable laissée en place n'ouvre pas une troisième inscription,
 * elle ne fait plus rien. Un opérateur qui oublie de la retirer, ou un
 * `docker compose up -d` qui la relit d'un `.env` jamais nettoyé, ne rouvre
 * donc pas une inscription publique — c'était le cas avant, mesuré à six
 * comptes créés d'affilée.
 *
 * Deux et pas trois parce que le produit a un propriétaire, et que le cas
 * réel du second compte est le conjoint. Au-delà, ce n'est plus le même
 * produit : plusieurs comptes par bâtiment est la ligne « multi-logement » du
 * plan, en attente d'un besoin réel, et elle demandera bien autre chose qu'une
 * variable d'environnement.
 */
const COMPTES_MAX = 2;

async function porteOuverte(tx: Pick<typeof db, "select">): Promise<boolean> {
  const comptes = await nombreDeComptes(tx);
  // Le tout premier compte s'inscrit sans rien demander : c'est le démarrage,
  // et exiger la variable ici enfermerait dehors qui monte une instance neuve.
  if (comptes === 0) return true;
  return autoriseeParLEnvironnement() && comptes < COMPTES_MAX;
}

/** Ce que les écrans lisent pour afficher, ou non, le formulaire et son lien. */
export async function inscriptionOuverte(): Promise<boolean> {
  return porteOuverte(db);
}

export type ResultatInscription = { statut: "cree"; id: number } | { statut: "fermee" } | { statut: "email_pris" };

/**
 * Crée le compte si la porte est ouverte, sous verrou. `email_pris` n'est
 * rendu que porte ouverte : fermée, on ne regarde même pas l'adresse.
 */
export async function inscrire(email: string, motDePasseHash: string): Promise<ResultatInscription> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${VERROU_INSCRIPTION}::bigint)`);

    if (!(await porteOuverte(tx))) return { statut: "fermee" };

    const [existe] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, email));
    if (existe) return { statut: "email_pris" };

    const [cree] = await tx.insert(utilisateur).values({ email, motDePasseHash }).returning({ id: utilisateur.id });
    return { statut: "cree", id: cree.id };
  });
}
