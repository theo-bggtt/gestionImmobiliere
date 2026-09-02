import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
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
