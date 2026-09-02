// app/db/schema/fichiers.ts
import {
  pgTable, serial, integer, text, bigint, timestamp, smallint, pgEnum, boolean, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete, zone } from "./core";

export const fichier = pgTable("fichier", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  chemin: text("chemin").notNull(),
  typeMime: text("type_mime").notNull(),
  taille: bigint("taille", { mode: "number" }).notNull(),
  datePrise: timestamp("date_prise", { withTimezone: true }),
  zoneId: integer("zone_id").references(() => zone.id),
  niveau: smallint("niveau").notNull().default(3),
  legende: text("legende"),
  exifEfface: boolean("exif_efface").notNull().default(false),
}, (table) => ({
  niveauValide: check("fichier_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
}));

export const fichierLienRole = pgEnum("fichier_lien_role", ["avant", "apres", "plaque", "general"]);

export const fichierLien = pgTable("fichier_lien", {
  id: serial("id").primaryKey(),
  fichierId: integer("fichier_id").notNull().references(() => fichier.id, { onDelete: "cascade" }),
  // Polymorphe (element | evenement | intervenant | ...) : pas de FK possible ici.
  cibleType: text("cible_type").notNull(),
  cibleId: integer("cible_id").notNull(),
  role: fichierLienRole("role").notNull().default("general"),
});
