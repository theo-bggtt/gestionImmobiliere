import { describe, it, expect, beforeEach } from "vitest";
import { asc } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau } from "../../app/db/schema/index";
import { sql } from "drizzle-orm";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete CASCADE`);
});

describe("tri des niveaux par ordinal", () => {
  it("trie sous-sol < rez < étage indépendamment du nom", async () => {
    const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
    const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test" }).returning();
    const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();

    await db.insert(niveau).values([
      { batimentId: b.id, nom: "Étage", ordinal: 1 },
      { batimentId: b.id, nom: "Cave à vin", ordinal: -1 },
      { batimentId: b.id, nom: "Rez-de-chaussée", ordinal: 0 },
    ]);

    const niveaux = await db.select().from(niveau).where(sql`${niveau.batimentId} = ${b.id}`).orderBy(asc(niveau.ordinal));

    expect(niveaux.map((n) => n.nom)).toEqual(["Cave à vin", "Rez-de-chaussée", "Étage"]);
  });
});
