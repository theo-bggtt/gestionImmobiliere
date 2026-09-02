import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element } from "../../app/db/schema/index";
import { sql } from "drizzle-orm";

async function creerJeuMinimal() {
  const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison", type: "principal" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({ origine: "systeme", nom: `Test-${Date.now()}`, champs: [] }).returning();
  return { p, z, t };
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete CASCADE`);
});

describe("element.zone_id NOT NULL", () => {
  it("rejette un élément sans zone_id", async () => {
    const { p, t } = await creerJeuMinimal();
    // drizzle-orm@0.44 enveloppe l'erreur pg dans une DrizzleQueryError dont
    // le message est "Failed query: ..." ; le message pg d'origine (celui
    // qu'on veut vérifier) est porté par `.cause`.
    await expect(
      db.execute(sql`
        INSERT INTO element (propriete_id, nom, type_id, zone_id)
        VALUES (${p.id}, 'Sans zone', ${t.id}, NULL)
      `)
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringMatching(/null value in column "zone_id"/),
      }),
    });
  });

  it("accepte un élément avec zone_id", async () => {
    const { p, z, t } = await creerJeuMinimal();
    const [e] = await db.insert(element).values({ proprieteId: p.id, nom: "Avec zone", typeId: t.id, zoneId: z.id }).returning();
    expect(e.zoneId).toBe(z.id);
  });
});
