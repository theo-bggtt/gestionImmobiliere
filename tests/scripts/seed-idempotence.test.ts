// tests/scripts/seed-idempotence.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { sql, and, eq } from "drizzle-orm";
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

  it("un re-seed rafraîchit alias et niveau suggéré, et ne touche pas champs", async () => {
    executerScript("scripts/seed-catalogue.ts");

    // On abîme une ligne du catalogue comme le ferait une version antérieure :
    // alias vidés, niveau suggéré retombé au défaut, et un champ retiré.
    await db
      .update(typeElement)
      .set({ alias: [], niveauSuggere: 3, champs: [] })
      .where(and(eq(typeElement.nom, "Vanne d'arrêt"), eq(typeElement.origine, "systeme")));

    executerScript("scripts/seed-catalogue.ts");

    const [vanne] = await db
      .select()
      .from(typeElement)
      .where(and(eq(typeElement.nom, "Vanne d'arrêt"), eq(typeElement.origine, "systeme")));

    // Du vocabulaire de catalogue : rafraîchi, comme les alias. Un type système
    // n'est pas éditable, personne n'a donc rien à écraser ici — et la
    // correction du propriétaire vit sur la fiche, pas sur le type.
    expect(vanne.niveauSuggere).toBe(2);
    expect(vanne.alias).toContain("robinet");
    // `champs` reste intact : un champ retiré du catalogue doit être masqué,
    // jamais effacé (règle non négociable #5).
    expect(vanne.champs).toEqual([]);
  }, 30000);

  it("seed-exemple exécuté deux fois ne crée qu'une seule propriété d'exemple", async () => {
    executerScript("scripts/seed-catalogue.ts");
    // `beforeEach` vide la table des comptes : la base est donc « migrée et
    // sans un seul compte », l'état exact que la troisième garde refuse. Le
    // test fournit le geste explicite qu'un opérateur devrait fournir — c'est
    // le point de la garde, pas un contournement.
    executerScript("scripts/seed-exemple.ts", { SEED_EXEMPLE: "1" });
    // Le second passage n'en a plus besoin : le compte de démonstration existe.
    executerScript("scripts/seed-exemple.ts");

    const proprietes = await db.select().from(propriete).where(eq(propriete.nom, "Maison d'exemple"));
    expect(proprietes).toHaveLength(1);
  }, 30000);
});

// Les identifiants de démonstration sont publics : ce script ne doit pas
// pouvoir les créer là où il y a une vraie maison. Deux gardes, testées en
// tant que script réel comme ci-dessus.
describe("seed-exemple refuse une base réelle", () => {
  it("refuse une base migrée sans aucun compte, sans SEED_EXEMPLE", async () => {
    // Le trou que les deux premières gardes laissaient : `NODE_ENV` non défini
    // et pas de compte réel — c'est-à-dire l'état d'une instance NEUVE pendant
    // la fenêtre où les ports sont ouverts et le propriétaire pas encore
    // inscrit. Un `npm run seed:exemple` lancé depuis le shell du Pi à ce
    // moment-là y créait `demo@…/demo1234`, identifiants publiés dans le
    // README, comme PREMIER compte de l'instance.
    executerScript("scripts/seed-catalogue.ts");
    expect(() => executerScript("scripts/seed-exemple.ts")).toThrow();

    const comptes = await db.select().from(utilisateur);
    expect(comptes).toHaveLength(0);
    const proprietes = await db.select().from(propriete).where(eq(propriete.nom, "Maison d'exemple"));
    expect(proprietes).toHaveLength(0);
  }, 30000);


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
