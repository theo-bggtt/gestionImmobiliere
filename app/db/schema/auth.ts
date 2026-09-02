// app/db/schema/auth.ts
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

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
