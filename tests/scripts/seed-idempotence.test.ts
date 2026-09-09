// tests/scripts/seed-idempotence.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { sql, eq } from "drizzle-orm";
import { db } from "../setup/test-db";
import { typeElement, propriete, utilisateur } from "../../app/db/schema/index";

// Les seeds sont testés en tant que scripts réels (comme `npm run seed:*`),
// pas importés : seed-exemple.ts appelle main() au chargement du module, un
// import direct lancerait donc une écriture non maîtrisée (même défaut que
// Task 4 avant sa correction, cf. progress.md).
function executerScript(chemin: string, env: NodeJS.ProcessEnv = {}) {
  execSync(`npx tsx ${chemin}`, { env: { ...process.env, ...env }, cwd: process.cwd(), stdio: "pipe" });
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

// Les identifiants de démonstration sont publics : ce script ne doit pas
// pouvoir les créer là où il y a une vraie maison. Deux gardes, testées en
// tant que script réel comme ci-dessus.
describe("seed-exemple refuse une base réelle", () => {
  it("refuse sous NODE_ENV=production, et ne crée rien", async () => {
    executerScript("scripts/seed-catalogue.ts");
    expect(() => executerScript("scripts/seed-exemple.ts", { NODE_ENV: "production" })).toThrow();

    expect(await db.select().from(propriete).where(eq(propriete.nom, "Maison d'exemple"))).toHaveLength(0);
    expect(await db.select().from(utilisateur)).toHaveLength(0);
  }, 30000);

  it("refuse dès qu'un compte qui n'est pas celui de la démonstration existe", async () => {
    executerScript("scripts/seed-catalogue.ts");
    await db.insert(utilisateur).values({ email: "proprietaire@x.local", motDePasseHash: "x" });

    expect(() => executerScript("scripts/seed-exemple.ts")).toThrow(/compte réel/);

    expect(await db.select().from(propriete)).toHaveLength(0);
    const comptes = await db.select({ email: utilisateur.email }).from(utilisateur);
    expect(comptes).toEqual([{ email: "proprietaire@x.local" }]);
  }, 30000);
});
