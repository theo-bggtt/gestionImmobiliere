// app/db/schema/fichiers.ts
import {
  pgTable, serial, integer, text, bigint, timestamp, smallint, pgEnum, boolean, check, index, uniqueIndex,
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
  // Identifiant fabriqué par le client avant de mettre la capture en file.
  // Un réseau mobile qui coupe après l'écriture serveur mais avant la réponse
  // fait rejouer l'envoi : sans cette clé, chaque coupure crée un doublon.
  captureId: text("capture_id"),
}, (table) => ({
  niveauValide: check("fichier_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
  captureUnique: uniqueIndex("idx_fichier_capture_id").on(table.captureId),
}));

export const fichierLienRole = pgEnum("fichier_lien_role", ["avant", "apres", "plaque", "general"]);

export const fichierLien = pgTable("fichier_lien", {
  id: serial("id").primaryKey(),
  fichierId: integer("fichier_id").notNull().references(() => fichier.id, { onDelete: "cascade" }),
  // Polymorphe (element | evenement | intervenant | ...) : pas de FK possible ici.
  cibleType: text("cible_type").notNull(),
  cibleId: integer("cible_id").notNull(),
  role: fichierLienRole("role").notNull().default("general"),
}, (table) => ({
  cibleIdx: index("idx_fichier_lien_cible").on(table.cibleType, table.cibleId),
}));
