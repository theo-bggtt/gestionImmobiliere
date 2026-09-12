import { beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Garde-fou contre l'écriture dans le volume de développement (issue #30) :
// `fichiers.server.ts` calcule sa racine de stockage à l'IMPORT du module,
// donc il faut que la variable soit posée avant que le graphe de modules du
// fichier de test se charge. Ce fichier étant dans `setupFiles`, il est
// évalué avant ce graphe — condition qui ne tient que parce que (1) aucun
// import ci-dessus ne charge `fichiers.server` par transitivité, sinon
// `RACINE` y serait déjà figée, et (2) l'isolation des modules entre
// fichiers de test est active (défaut de vitest ; un `isolate: false` dans
// vitest.config.ts casserait ce raisonnement). Assignation, jamais `??=` :
// un `.env` copié depuis `.env.example` pose déjà `STOCKAGE_RACINE` sur le
// volume de dev, et le garde-fou doit l'écraser, pas s'incliner devant lui.
process.env.STOCKAGE_RACINE = await mkdtemp(join(tmpdir(), "gi-stockage-"));

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
