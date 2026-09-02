import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "fs";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  // Charger explicitement .env.test pour les tests
  if (process.env.VITEST) {
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
  }
  return {
    test: {
      environment: "node",
      setupFiles: ["./tests/setup/test-db.ts"],
      // Chaque fichier de test exécute migrate() dans son propre worker ;
      // en parallèle, deux migrate() concurrents sur la même base de test
      // se disputent la création du schéma "drizzle" (CREATE SCHEMA IF NOT
      // EXISTS n'est pas garanti atomique sous concurrence). Fichiers de
      // test exécutés séquentiellement pour éviter cette course.
      fileParallelism: false,
    },
  };
});
