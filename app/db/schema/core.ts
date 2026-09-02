// app/db/schema/core.ts
import {
  pgTable, serial, text, integer, timestamp, pgEnum, foreignKey, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { utilisateur } from "./auth";

export const propriete = pgTable("propriete", {
  id: serial("id").primaryKey(),
  // Absent du schéma fourni dans le prompt : nécessaire pour scoper les
  // routes protégées par propriétaire. Décision : un utilisateur peut
  // posséder plusieurs propriétés, donc pas de contrainte unique ici.
  proprietaireId: integer("proprietaire_id").notNull().references(() => utilisateur.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  adresse: text("adresse"),
  egid: text("egid"),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  proprietaireIdx: index("idx_propriete_proprietaire").on(table.proprietaireId),
}));

export const batimentType = pgEnum("batiment_type", ["principal", "annexe", "garage", "abri"]);

export const batiment = pgTable("batiment", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  type: batimentType("type").notNull().default("principal"),
  ordre: integer("ordre").notNull().default(0),
}, (table) => ({
  proprieteIdx: index("idx_batiment_propriete").on(table.proprieteId),
}));

export const niveau = pgTable("niveau", {
  id: serial("id").primaryKey(),
  batimentId: integer("batiment_id").notNull().references(() => batiment.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  // Entier signé : -2 sous-sol, -1 cave, 0 rez, 1 premier, 2 combles...
  // Le nom est libre ("cave à vin"), l'ordinal sert au tri et au sélecteur.
  ordinal: integer("ordinal").notNull(),
  ordre: integer("ordre").notNull().default(0),
}, (table) => ({
  batimentIdx: index("idx_niveau_batiment").on(table.batimentId),
}));

export const zoneType = pgEnum("zone_type", ["interieur", "exterieur", "annexe", "technique"]);

export const zone = pgTable("zone", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  // NULL = zone extérieure, rattachée à la propriété et non à un niveau.
  // C'est le SEUL cas où niveauId est nul.
  niveauId: integer("niveau_id").references(() => niveau.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  parentId: integer("parent_id"),
  type: zoneType("type").notNull(),
  ordre: integer("ordre").notNull().default(0),
}, (table) => ({
  proprieteIdx: index("idx_zone_propriete").on(table.proprieteId),
  niveauIdx: index("idx_zone_niveau").on(table.niveauId),
  parentFk: foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
    name: "zone_parent_id_fk",
  }).onDelete("cascade"),
}));

export const systeme = pgTable("systeme", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  icone: text("icone"),
}, (table) => ({
  proprieteIdx: index("idx_systeme_propriete").on(table.proprieteId),
}));

export const proprieteRelations = relations(propriete, ({ many }) => ({
  batiments: many(batiment),
  zones: many(zone),
  systemes: many(systeme),
}));

export const batimentRelations = relations(batiment, ({ one, many }) => ({
  propriete: one(propriete, { fields: [batiment.proprieteId], references: [propriete.id] }),
  niveaux: many(niveau),
}));

export const niveauRelations = relations(niveau, ({ one, many }) => ({
  batiment: one(batiment, { fields: [niveau.batimentId], references: [batiment.id] }),
  zones: many(zone),
}));

export const zoneRelations = relations(zone, ({ one, many }) => ({
  propriete: one(propriete, { fields: [zone.proprieteId], references: [propriete.id] }),
  niveau: one(niveau, { fields: [zone.niveauId], references: [niveau.id] }),
  parent: one(zone, { fields: [zone.parentId], references: [zone.id], relationName: "sousZones" }),
  sousZones: many(zone, { relationName: "sousZones" }),
}));
