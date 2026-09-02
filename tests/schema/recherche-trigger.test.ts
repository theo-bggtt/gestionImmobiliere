// tests/schema/recherche-trigger.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element } from "../../app/db/schema/index";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete CASCADE`);
});

async function creerJeuMinimal() {
  const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Buanderie", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({
    origine: "systeme",
    nom: `Machin-${Date.now()}`,
    champs: [],
    alias: ["truc-bidule"],
  }).returning();
  return { p, z, t };
}

describe("déclencheur recherche", () => {
  it("alimente recherche à l'insertion, à partir du nom, de la zone et de l'alias du type", async () => {
    const { p, z, t } = await creerJeuMinimal();
    await db.insert(element).values({ proprieteId: p.id, nom: "Interrupteur principal", typeId: t.id, zoneId: z.id });

    const trouve = await db.execute(sql`
      SELECT nom FROM element
      WHERE recherche @@ plainto_tsquery('french', 'buanderie')
    `);
    expect(trouve.rows).toHaveLength(1);

    const trouveParAlias = await db.execute(sql`
      SELECT nom FROM element
      WHERE recherche @@ plainto_tsquery('french', 'truc-bidule')
    `);
    expect(trouveParAlias.rows).toHaveLength(1);
  });

  it("réalimente recherche à la mise à jour", async () => {
    const { p, z, t } = await creerJeuMinimal();
    const [e] = await db.insert(element).values({ proprieteId: p.id, nom: "Nom initial", typeId: t.id, zoneId: z.id }).returning();

    await db.update(element).set({ nom: "Nom modifié abricotier" }).where(sql`${element.id} = ${e.id}`);

    const trouve = await db.execute(sql`
      SELECT nom FROM element
      WHERE recherche @@ plainto_tsquery('french', 'abricotier')
    `);
    expect(trouve.rows).toHaveLength(1);
  });

  it("réalimente recherche des éléments existants quand leur zone est renommée", async () => {
    const { p, z, t } = await creerJeuMinimal();
    await db.insert(element).values({ proprieteId: p.id, nom: "Chauffe-eau", typeId: t.id, zoneId: z.id });

    const avant = await db.execute(sql`
      SELECT nom FROM element WHERE recherche @@ plainto_tsquery('french', 'chaufferie')
    `);
    expect(avant.rows).toHaveLength(0);

    await db.update(zone).set({ nom: "Chaufferie" }).where(sql`${zone.id} = ${z.id}`);

    const apres = await db.execute(sql`
      SELECT nom FROM element WHERE recherche @@ plainto_tsquery('french', 'chaufferie')
    `);
    expect(apres.rows).toHaveLength(1);
    expect((apres.rows[0] as { nom: string }).nom).toBe("Chauffe-eau");
  });

  it("réalimente recherche des éléments existants quand leur système est renommé", async () => {
    const { p, z, t } = await creerJeuMinimal();
    const [s] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Ancien système" }).returning();
    await db.insert(element).values({ proprieteId: p.id, nom: "Radiateur", typeId: t.id, zoneId: z.id, systemeId: s.id });

    await db.update(systeme).set({ nom: "Ventilation double flux" }).where(sql`${systeme.id} = ${s.id}`);

    const trouve = await db.execute(sql`
      SELECT nom FROM element WHERE recherche @@ plainto_tsquery('french', 'ventilation')
    `);
    expect(trouve.rows).toHaveLength(1);
  });

  it("réalimente recherche des éléments existants quand l'alias de leur type change", async () => {
    const { p, z, t } = await creerJeuMinimal();
    await db.insert(element).values({ proprieteId: p.id, nom: "Vanne", typeId: t.id, zoneId: z.id });

    await db.update(typeElement).set({ alias: ["nouvel-alias-truc"] }).where(sql`${typeElement.id} = ${t.id}`);

    const trouve = await db.execute(sql`
      SELECT nom FROM element WHERE recherche @@ plainto_tsquery('french', 'nouvel-alias-truc')
    `);
    expect(trouve.rows).toHaveLength(1);
  });
});
