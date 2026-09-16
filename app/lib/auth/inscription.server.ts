// app/lib/auth/inscription.server.ts
// L'inscription est fermée dès qu'un compte existe. C'est un produit à
// propriétaire unique : `/inscription` sur Internet sans cette porte est un
// hébergement de photos ouvert à tous, sur le disque qui porte la maison
// (issue #26). Le premier compte s'inscrit librement — c'est le démarrage —
// et les suivants demandent une INVITATION : un lien à jeton que le
// propriétaire crée, qui expire, et qu'il peut révoquer (issue #62).
//
// CE QUI A REMPLACÉ `AUTORISER_INSCRIPTION` ET SON PLAFOND DUR. La variable
// bornait un mécanisme sans état, et c'est ce qui l'a rendue fragile : posée,
// elle autorisait autant de comptes qu'on voulait — mesuré, six d'affilée —
// d'où le plafond à deux comptes en code pour se protéger d'un `.env` jamais
// nettoyé. Une invitation porte son propre état : un compte, une date de fin,
// révocable, et tracée en base au lieu d'être posée dans un fichier. Elle se
// borne donc toute seule, il n'y a plus de variable à oublier, et la décision
// explicite du propriétaire passe du shell du VPS à un clic.
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { invitation, utilisateur } from "../../db/schema/index";

export { MESSAGE_INSCRIPTION_FERMEE } from "./inscription";

// Clé du verrou consultatif qui sérialise deux premières inscriptions
// simultanées : sans lui, chacune lirait zéro compte et les deux passeraient.
// La course sur un MÊME JETON n'en dépend pas — elle est fermée par la
// condition de l'`UPDATE` qui consomme l'invitation, voir `consommer`.
const VERROU_INSCRIPTION = 8_101;

// Un jeton fait 43 caractères ; refuser au-delà évite d'aller demander à la
// base de comparer une chaîne d'un mégaoctet. Même borne que `partage`.
const JETON_MAX = 128;

type Lecteur = Pick<typeof db, "select">;

async function nombreDeComptes(tx: Lecteur): Promise<number> {
  const [{ n }] = await tx.select({ n: count() }).from(utilisateur);
  return n;
}

/**
 * Le tout premier compte s'inscrit sans rien demander : c'est le démarrage, et
 * exiger une invitation ici enfermerait dehors qui monte une instance neuve.
 */
const estLePremier = async (tx: Lecteur) => (await nombreDeComptes(tx)) === 0;

/**
 * Les conditions d'une invitation utilisable, écrites UNE fois : elles servent
 * à la vérification du loader comme à l'`UPDATE` qui la consomme. Deux
 * écritures de « ni consommée, ni révoquée, ni expirée » divergeraient.
 *
 * `now()` et non l'horloge de Node : une seule horloge décide de l'expiration,
 * celle de la base — même raisonnement que `garantie.expiree`.
 */
const conditionsUtilisable = (jeton: string) =>
  and(
    eq(invitation.jeton, jeton),
    isNull(invitation.utiliseeLe),
    isNull(invitation.revoqueLe),
    sql`${invitation.expireLe} > now()`,
  );

async function invitationUtilisable(tx: Lecteur, jeton: string | null | undefined): Promise<boolean> {
  if (!jeton || jeton.length > JETON_MAX) return false;
  const [trouvee] = await tx.select({ id: invitation.id }).from(invitation).where(conditionsUtilisable(jeton));
  return trouvee !== undefined;
}

/** Ce que les écrans lisent pour afficher, ou non, le formulaire et son lien. */
export async function inscriptionOuverte(jeton?: string | null): Promise<boolean> {
  return (await estLePremier(db)) || invitationUtilisable(db, jeton);
}

export type ResultatInscription = { statut: "cree"; id: number } | { statut: "fermee" } | { statut: "email_pris" };

/**
 * Crée le compte si la porte est ouverte, sous verrou, et consomme
 * l'invitation dans LA MÊME TRANSACTION — sinon un compte pourrait exister
 * sans que la porte qui l'a laissé entrer soit refermée.
 *
 * `email_pris` n'est rendu que porte ouverte : fermée, on ne regarde même pas
 * l'adresse. Et il est rendu AVANT que l'invitation soit consommée, pour
 * qu'une faute de frappe sur une adresse déjà prise ne brûle pas le lien.
 */
export async function inscrire(
  email: string,
  motDePasseHash: string,
  jeton?: string | null,
): Promise<ResultatInscription> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${VERROU_INSCRIPTION}::bigint)`);

    const premier = await estLePremier(tx);
    if (!premier && !(await invitationUtilisable(tx, jeton))) return { statut: "fermee" };

    const [existe] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, email));
    if (existe) return { statut: "email_pris" };

    const [cree] = await tx.insert(utilisateur).values({ email, motDePasseHash }).returning({ id: utilisateur.id });

    if (!premier) {
      // Les mêmes conditions qu'à la vérification, et non un `WHERE jeton =` :
      // c'est cet `UPDATE` conditionnel qui rend la consommation atomique,
      // sans dépendre du verrou. Zéro ligne touchée ne peut donc arriver que
      // si la vérification et l'écriture ont cessé de dire la même chose — on
      // le fait échouer bruyamment plutôt que de créer un compte sans
      // refermer sa porte.
      const consommees = await tx
        .update(invitation)
        .set({ utiliseeLe: new Date(), utiliseeParId: cree.id })
        .where(conditionsUtilisable(jeton!))
        .returning({ id: invitation.id });
      if (consommees.length !== 1) throw new Error("Invitation non consommée alors qu'elle venait d'être validée");
    }

    return { statut: "cree", id: cree.id };
  });
}
