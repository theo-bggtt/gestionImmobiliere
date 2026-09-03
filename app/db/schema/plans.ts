// app/db/schema/plans.ts
import { pgTable, serial, integer, text, pgEnum, doublePrecision, primaryKey, jsonb, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
}, (table) => ({
  proprieteIdx: index("idx_plan_propriete").on(table.proprieteId),
  niveauIdx: index("idx_plan_niveau").on(table.niveauId),
  // Le couple (type, niveau_id) décide des zones que couvre un plan, donc du
  // filtre qui le sert ou non à un partage : un `etage` sans niveau, ou une
  // `situation` qui en porte un, casserait le sens de ce filtre. La contrainte
  // va en base pour la même raison que `element.zone_id NOT NULL` (règle #1).
  typeNiveauCoherent: check(
    "plan_type_niveau_coherent",
    sql`(${table.type} = 'etage' AND ${table.niveauId} IS NOT NULL)
      OR (${table.type} = 'situation' AND ${table.niveauId} IS NULL)`,
  ),
}));

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
}, (table) => ({
  planIdx: index("idx_point_plan").on(table.planId),
  elementIdx: index("idx_point_element").on(table.elementId),
  // x et y sont des POURCENTAGES de l'image, jamais des pixels : c'est ce qui
  // permet de remplacer l'image d'un plan sans déplacer un seul point. La
  // borne va en base et pas dans le formulaire — une route qui oublierait de
  // valider écrirait sinon un point hors de l'image, invisible et introuvable.
  xValide: check("point_x_valide", sql`${table.x} BETWEEN 0 AND 100`),
  yValide: check("point_y_valide", sql`${table.y} BETWEEN 0 AND 100`),
}));
