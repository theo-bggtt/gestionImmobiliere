import { beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import pg from "pg";
import * as schema from "../../app/db/schema/index";
import { CATALOGUE } from "../../scripts/seed-catalogue";

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

// Extract only "Vanne d'arrêt" from the shared catalogue (avoids duplication)
const CATALOGUE_TEST = CATALOGUE.filter((e) => e.nom === "Vanne d'arrêt");

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
