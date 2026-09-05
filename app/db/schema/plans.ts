// app/db/schema/plans.ts
import { pgTable, serial, integer, text, pgEnum, doublePrecision, primaryKey, jsonb, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete, niveau, zone } from "./core";
import { element } from "./elements";
import { fichier } from "./fichiers";
// Le sommet vit dans `app/lib/plans/types.ts`, un module neutre lu par des
// composants qui tournent dans le navigateur : la dépendance va de la base
// vers la définition, jamais l'inverse (même règle que `ChampDefinition`).
import type { Sommet } from "../../lib/plans/types";

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
  // Liste de sommets {x, y} en POURCENTAGE de l'image, jamais en pixels :
  // c'est ce qui permet de remplacer l'image d'un plan sans déplacer un seul
  // contour, exactement comme pour `point`.
  polygone: jsonb("polygone").notNull().$type<Sommet[]>(),
  source: zoneGeomSource("source").notNull(),
}, (table) => ({
  // La clé primaire dit la règle : un contour par zone et par plan. Retracer
  // remplace, comme reposer un objet déplace son point — le même arbitrage
  // qu'à l'étape 4, et il vaut mieux ici : deux contours pour une zone sur un
  // même plan rendraient `zoneDuPoint` ambigu avec elle-même.
  pk: primaryKey({ columns: [table.zoneId, table.planId] }),
  // Le seul sens de lecture est « les contours de ce plan ». La clé primaire
  // ne le sert pas : `zone_id` en est la colonne de tête.
  planIdx: index("idx_zone_geom_plan").on(table.planId),
  // La borne `0 <= x, y <= 100` et la forme du tableau ne sont PAS déclarées
  // ici, et ce n'est pas un oubli : valider les éléments d'un tableau jsonb
  // demande une sous-requête, que PostgreSQL interdit dans un CHECK. La
  // contrainte `zone_geom_contour_valide` est ajoutée par la migration 0009 à
  // travers une fonction SQL IMMUTABLE — même forme exactement que
  // `type_element_champs_genres_valides` (migration 0001), et même raison.
  //
  // Elle va en base et non dans le formulaire, comme `point_x_valide` : une
  // route qui oublierait de valider écrirait sinon un contour hors de l'image,
  // et ce contour-là ne serait pas seulement invisible — il servirait à
  // déduire la zone d'un objet, donc à proposer d'écrire `element.zone_id`.
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
