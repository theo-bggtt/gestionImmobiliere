// app/db/schema/partage.ts
import { pgTable, serial, integer, text, smallint, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";

export const partage = pgTable("partage", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  jeton: text("jeton").notNull().unique(),
  niveauMax: smallint("niveau_max").notNull(),
  porteeZones: integer("portee_zones").array().notNull().default(sql`'{}'::integer[]`),
  porteeSystemes: integer("portee_systemes").array().notNull().default(sql`'{}'::integer[]`),
  expireLe: timestamp("expire_le", { withTimezone: true }),
  revoqueLe: timestamp("revoque_le", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  niveauMaxValide: check("partage_niveau_max_valide", sql`${table.niveauMax} BETWEEN 0 AND 3`),
}));
