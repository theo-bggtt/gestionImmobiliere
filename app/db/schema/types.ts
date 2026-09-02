// app/db/schema/types.ts
import { pgTable, serial, text, integer, pgEnum, jsonb, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";

export const typeElementOrigine = pgEnum("type_element_origine", ["systeme", "perso"]);

// Liste fermée de six genres (règle non négociable #4) — seule source de
// vérité, dérivée par ChampEditor.tsx et types.nouveau.tsx pour éviter que
// les deux littéraux divergent.
export const CHAMP_GENRES = ["texte", "nombre", "date", "booleen", "choix", "fichier"] as const;
export type ChampGenre = (typeof CHAMP_GENRES)[number];

export type ChampDefinition = {
  cle: string;
  label: string;
  genre: ChampGenre;
  unite?: string;
  niveauMin: number; // 0 à 3, non encore appliqué (le partage n'existe pas à cette étape)
  obligatoire: boolean;
  // Requis quand genre === "choix" : liste des valeurs possibles.
  // Extension non listée dans le prompt, nécessaire pour que "choix" valide quoi que ce soit.
  options?: string[];
};

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
