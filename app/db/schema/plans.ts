// app/db/schema/plans.ts
import { pgTable, serial, integer, text, pgEnum, doublePrecision, primaryKey, jsonb } from "drizzle-orm/pg-core";
import { propriete, niveau, zone } from "./core";
import { element } from "./elements";
import { fichier } from "./fichiers";

export const planType = pgEnum("plan_type", ["etage", "situation"]);

export const plan = pgTable("plan", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  type: planType("type").notNull(),
  // NULL si type = situation (vue aérienne de la parcelle, couvre les zones extérieures).
  niveauId: integer("niveau_id").references(() => niveau.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  imageFichierId: integer("image_fichier_id").references(() => fichier.id, { onDelete: "set null" }),
  echelle: doublePrecision("echelle"),
  ordre: integer("ordre").notNull().default(0),
});

export const zoneGeomSource = pgEnum("zone_geom_source", ["trace", "importe"]);

export const zoneGeom = pgTable("zone_geom", {
  zoneId: integer("zone_id").notNull().references(() => zone.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plan.id, { onDelete: "cascade" }),
  // Liste de points {x, y} en pourcentage. jsonb à cette étape : la table
  // existe et est utilisable, l'éditeur de tracé arrive à l'étape 6.
  polygone: jsonb("polygone").notNull(),
  source: zoneGeomSource("source").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.zoneId, table.planId] }),
}));

export const point = pgTable("point", {
  id: serial("id").primaryKey(),
  // Pas de contrainte d'unicité sur elementId : un objet traversant
  // plusieurs niveaux porte un point par plan concerné.
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plan.id, { onDelete: "cascade" }),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
});
