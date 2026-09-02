// tests/schema/catalogue-alias.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone, typeElement, element } from "../../app/db/schema/index";

describe("recherche par alias du catalogue", () => {
  it("« robinet » remonte un élément de type « Vanne d'arrêt »", async () => {
    const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
    const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test alias" }).returning();
    const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
    const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Cave", ordinal: -1 }).returning();
    const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique" }).returning();

    const [type] = await db.select().from(typeElement).where(sql`${typeElement.nom} = 'Vanne d''arrêt' AND ${typeElement.origine} = 'systeme'`);
    expect(type, "le catalogue doit avoir été chargé avant ce test (npm run seed:catalogue)").toBeDefined();

    await db.insert(element).values({ proprieteId: p.id, nom: "Arrivée générale", typeId: type.id, zoneId: z.id });

    const trouve = await db.execute(sql`
      SELECT e.nom FROM element e
      JOIN type_element t ON t.id = e.type_id
      WHERE e.recherche @@ plainto_tsquery('french', 'robinet')
        AND e.propriete_id = ${p.id}
    `);

    expect(trouve.rows).toHaveLength(1);
    expect((trouve.rows[0] as { nom: string }).nom).toBe("Arrivée générale");
  });
});
