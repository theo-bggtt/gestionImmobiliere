// tests/scripts/seed-idempotence.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { sql, eq } from "drizzle-orm";
import { db } from "../setup/test-db";
import { typeElement, propriete } from "../../app/db/schema/index";

// Les seeds sont testés en tant que scripts réels (comme `npm run seed:*`),
// pas importés : seed-exemple.ts appelle main() au chargement du module, un
// import direct lancerait donc une écriture non maîtrisée (même défaut que
// Task 4 avant sa correction, cf. progress.md).
function executerScript(chemin: string) {
  execSync(`npx tsx ${chemin}`, { env: process.env, cwd: process.cwd(), stdio: "pipe" });
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete, type_element RESTART IDENTITY CASCADE`);
});

describe("idempotence des seeds", () => {
  it("seed-catalogue exécuté deux fois n'insère aucun doublon", async () => {
    executerScript("scripts/seed-catalogue.ts");
    executerScript("scripts/seed-catalogue.ts");

    const types = await db.select({ nom: typeElement.nom }).from(typeElement).where(eq(typeElement.origine, "systeme"));
    const noms = types.map((t) => t.nom);
    expect(noms.length).toBeGreaterThan(0);
    expect(new Set(noms).size).toBe(noms.length);
  }, 30000);

  it("seed-exemple exécuté deux fois ne crée qu'une seule propriété d'exemple", async () => {
    executerScript("scripts/seed-catalogue.ts");
    executerScript("scripts/seed-exemple.ts");
    executerScript("scripts/seed-exemple.ts");

    const proprietes = await db.select().from(propriete).where(eq(propriete.nom, "Maison d'exemple"));
    expect(proprietes).toHaveLength(1);
  }, 30000);
});
