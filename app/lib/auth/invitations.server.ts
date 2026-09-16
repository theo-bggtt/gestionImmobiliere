// app/lib/auth/invitations.server.ts
// Créer, lister et révoquer les invitations. La CONSOMMATION n'est pas ici :
// elle vit dans `inscription.server.ts`, parce qu'elle doit se faire dans la
// même transaction que l'insertion du compte. Deux modules, deux moments.
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { invitation } from "../../db/schema/index";
import { creerJeton } from "../partage/partage.server";

export type Invitation = typeof invitation.$inferSelect;

/**
 * La durée par défaut proposée à l'écran. Sept jours parce qu'une invitation
 * se transmet par message et se consomme dans la foulée : ce qui traîne un
 * mois est une porte ouverte qu'on a oubliée.
 */
export const JOURS_PAR_DEFAUT = 7;

/** Une invitation est utilisable tant qu'elle n'a servi à rien d'autre. */
export const invitationActive = (i: Invitation, maintenant = new Date()) =>
  i.utiliseeLe === null && i.revoqueLe === null && i.expireLe > maintenant;

/** Le jeton est celui de `partage` : 32 octets, le lien circule dans WhatsApp. */
export async function creerInvitation(inviteParId: number, note: string | null, expireLe: Date) {
  const [creee] = await db.insert(invitation).values({ jeton: creerJeton(), inviteParId, note, expireLe }).returning();
  return creee;
}

/**
 * Toutes les invitations de l'instance, pas seulement celles du demandeur.
 *
 * Volontaire, et c'est la conséquence de « tout compte connecté peut
 * inviter » : chacun doit pouvoir voir — et révoquer — une porte ouverte par
 * un autre. Cacher les invitations d'autrui découperait la liste sans rien
 * protéger, puisque les comptes qui en sortent partagent la même instance.
 */
export async function listerInvitations() {
  return db.select().from(invitation).orderBy(desc(invitation.creeLe));
}

/**
 * Révoqué, jamais supprimé — même raisonnement que `partage`. `utilisee_le IS
 * NULL` dans la condition : révoquer une invitation déjà consommée ne
 * fermerait rien (le compte existe) et ferait mentir la ligne.
 */
export async function revoquerInvitation(id: number) {
  await db
    .update(invitation)
    .set({ revoqueLe: new Date() })
    .where(and(eq(invitation.id, id), isNull(invitation.utiliseeLe), isNull(invitation.revoqueLe)));
}
