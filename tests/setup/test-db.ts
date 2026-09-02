import { beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import pg from "pg";
import * as schema from "../../app/db/schema/index";
import type { ChampDefinition } from "../../app/db/schema/types";

// Ensure .env.test is loaded
try {
  const envTestContent = readFileSync(".env.test", "utf-8");
  const lines = envTestContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key) process.env[key.trim()] = valueParts.join("=").trim();
    }
  }
} catch (e) {
  // .env.test n'existe pas ou n'est pas lisible
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

const champ = (partial: Omit<ChampDefinition, "niveauMin" | "obligatoire"> & { niveauMin?: number; obligatoire?: boolean }): ChampDefinition => ({
  niveauMin: partial.niveauMin ?? 1,
  obligatoire: partial.obligatoire ?? false,
  ...partial,
});

// Catalogue de test (seul "Vanne d'arrêt" est strictement nécessaire pour le test alias)
const CATALOGUE_TEST: Array<{ nom: string; icone: string; champs: ChampDefinition[]; alias: string[] }> = [
  { nom: "Vanne d'arrêt", icone: "droplet", alias: ["robinet", "arrêt d'eau", "stop-eau", "vanne"], champs: [
    champ({ cle: "reseau", label: "Réseau", genre: "choix", options: ["eau froide", "eau chaude", "gaz"] }),
    champ({ cle: "coupe_quoi", label: "Coupe quoi", genre: "texte", niveauMin: 2 }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
];

let catalogueLoadedOnce = false;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });

  // Charger le catalogue de test après les migrations (une seule fois)
  if (!catalogueLoadedOnce) {
    const valeurs = CATALOGUE_TEST.map((entree) => ({
      nom: entree.nom,
      icone: entree.icone,
      origine: "systeme" as const,
      champs: entree.champs,
      alias: entree.alias,
    }));

    await db
      .insert(schema.typeElement)
      .values(valeurs)
      .onConflictDoNothing({ target: schema.typeElement.nom, where: sql`${schema.typeElement.origine} = 'systeme'` });

    catalogueLoadedOnce = true;
  }
});

afterAll(async () => {
  await pool.end();
});
