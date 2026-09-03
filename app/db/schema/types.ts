// app/db/schema/types.ts
import { pgTable, serial, text, integer, pgEnum, jsonb, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";
// La définition d'un champ vit dans `app/lib/forms/types.ts`, un module neutre :
// elle est lue par des composants qui tournent dans le navigateur, et importer
// une valeur d'ici y emporterait drizzle et tout le schéma. La dépendance va
// de la base vers la définition, jamais l'inverse.
import type { ChampDefinition } from "../../lib/forms/types";

export const typeElementOrigine = pgEnum("type_element_origine", ["systeme", "perso"]);

export const typeElement = pgTable("type_element", {
  id: serial("id").primaryKey(),
  // NULL = catalogue système (livré, non modifiable). Renseigné = type perso.
  proprieteId: integer("propriete_id").references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  icone: text("icone"),
  origine: typeElementOrigine("origine").notNull(),
  champs: jsonb("champs").notNull().default(sql`'[]'::jsonb`).$type<ChampDefinition[]>(),
  alias: text("alias").array().notNull().default(sql`'{}'::text[]`),
}, (table) => ({
  origineCoherente: check(
    "type_element_origine_propriete_coherente",
    sql`(${table.origine} = 'systeme' AND ${table.proprieteId} IS NULL) OR (${table.origine} = 'perso' AND ${table.proprieteId} IS NOT NULL)`
  ),
  // La contrainte de genres fermés (règle non négociable #4) n'est PAS
  // déclarée ici : PostgreSQL interdit toute sous-requête (SELECT) dans un
  // CHECK, et valider les éléments d'un tableau jsonb en demande une. Elle
  // est ajoutée par une migration écrite à la main (voir Step 3 bis) via une
  // fonction SQL IMMUTABLE — c'est la contrainte elle-même qui devient un
  // simple appel de fonction, ce que CHECK autorise.
  // Idempotence du seed catalogue (décision verrouillée #10) : un seul type
  // système par nom. Les types perso, eux, peuvent partager un nom entre
  // propriétés différentes (pas de contrainte).
  nomSystemeUnique: uniqueIndex("idx_type_element_nom_systeme_unique")
    .on(table.nom)
    .where(sql`${table.origine} = 'systeme'`),
}));
