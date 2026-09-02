// app/db/schema/elements.ts
import {
  pgTable, serial, text, integer, smallint, jsonb, timestamp, check, index, customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete, zone, systeme } from "./core";
import { typeElement } from "./types";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const element = pgTable("element", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  typeId: integer("type_id").notNull().references(() => typeElement.id),
  // NOT NULL garanti par la base : une fiche sans zone échapperait au
  // filtre de partage (règle non négociable #1). Ce n'est PAS une
  // validation de formulaire, c'est une contrainte de schéma.
  zoneId: integer("zone_id").notNull().references(() => zone.id),
  systemeId: integer("systeme_id").references(() => systeme.id),
  // 0 public · 1 usage · 2 technique · 3 privé
  niveau: smallint("niveau").notNull().default(3),
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  alias: text("alias").array().notNull().default(sql`'{}'::text[]`),
  // Alimentée par un déclencheur (Task 3), jamais écrite depuis l'application.
  recherche: tsvector("recherche"),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  niveauValide: check("element_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
  proprieteIdx: index("idx_element_propriete").on(table.proprieteId),
  zoneIdx: index("idx_element_zone_id").on(table.zoneId),
  niveauIdx: index("idx_element_niveau").on(table.niveau),
  typeIdx: index("idx_element_type").on(table.typeId),
  rechercheIdx: index("idx_element_recherche").using("gin", table.recherche),
  detailsIdx: index("idx_element_details").using("gin", table.details),
}));
