// app/db/schema/auth.ts
import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const utilisateur = pgTable("utilisateur", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  motDePasseHash: text("mot_de_passe_hash").notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  // Jeton opaque (32 octets aléatoires en hex), pas un id séquentiel :
  // cette valeur EST le secret porté par le cookie. Voir décision verrouillée #4.
  id: text("id").primaryKey(),
  utilisateurId: integer("utilisateur_id").notNull().references(() => utilisateur.id, { onDelete: "cascade" }),
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Une invitation à créer un compte. C'est la seule porte d'entrée une fois le
 * premier compte créé — voir `app/lib/auth/inscription.server.ts`.
 *
 * Calquée sur `partage`, et pour les mêmes raisons : le `jeton` EST le secret
 * (32 octets aléatoires en base64url, jamais séquentiel, `creerJeton`), et
 * les trois horodatages sont DATÉS, JAMAIS SUPPRIMÉS. Savoir qui on a laissé
 * entrer, quand, et quel compte en est sorti est précisément ce qu'on veut
 * garder — même argument que `partage.revoqueLe`.
 *
 * Ce qui remplace `AUTORISER_INSCRIPTION` et son plafond dur : ceux-là
 * bornaient un mécanisme SANS ÉTAT, d'où le plafond en code contre la
 * variable oubliée dans `.env`. Une invitation porte son propre état — un
 * compte, une date de fin, révocable — donc elle se borne toute seule, et il
 * n'y a plus de variable à oublier.
 */
export const invitation = pgTable("invitation", {
  id: serial("id").primaryKey(),
  jeton: text("jeton").notNull().unique(),
  // Qui a invité. En cascade : le compte parti, ses invitations non
  // consommées n'ont plus personne derrière elles.
  inviteParId: integer("invite_par_id").notNull().references(() => utilisateur.id, { onDelete: "cascade" }),
  // Un aide-mémoire pour le propriétaire (« mon frère »), jamais montré à
  // l'invité : il ne sort d'aucune page publique, `/inscription` n'en lit rien.
  note: text("note"),
  // Obligatoire, contrairement à `partage.expireLe` : un lien de consultation
  // peut légitimement durer, une porte d'entrée sur l'instance non.
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  utiliseeLe: timestamp("utilisee_le", { withTimezone: true }),
  // `set null` et non `cascade` : le compte supprimé, la ligne doit rester —
  // elle dit qu'une invitation a servi, et c'est ce qu'on garde.
  utiliseeParId: integer("utilisee_par_id").references(() => utilisateur.id, { onDelete: "set null" }),
  revoqueLe: timestamp("revoque_le", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  inviteParIdx: index("idx_invitation_invite_par").on(table.inviteParId),
}));
