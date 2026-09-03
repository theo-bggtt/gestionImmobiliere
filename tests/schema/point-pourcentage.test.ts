// tests/schema/point-pourcentage.test.ts
// Les deux contraintes que l'étape 4 met EN BASE, et pas dans un formulaire :
// un point est un pourcentage, un plan sait à quel niveau il se rattache.
// Même raisonnement que `element.zone_id NOT NULL` (règle non négociable #1) :
// une route qui oublierait de valider ne doit pas pouvoir écrire la ligne.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element, plan, point,
} from "../../app/db/schema/index";

// DELETE et non TRUNCATE ... CASCADE : TRUNCATE viderait `type_element`,
// c'est-à-dire le catalogue chargé une fois par le setup.
beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `pt-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [nSousSol] = await db.insert(niveau).values({ batimentId: b.id, nom: "Sous-sol", ordinal: -1 }).returning();
  const [nRez] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: nRez.id, nom: "Cuisine", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({ origine: "perso", proprieteId: p.id, nom: `Gaine-${marque}`, champs: [] }).returning();
  const [e] = await db.insert(element).values({ proprieteId: p.id, nom: "Colonne de chute", typeId: t.id, zoneId: z.id }).returning();

  const [planRez] = await db.insert(plan).values({
    proprieteId: p.id, type: "etage", niveauId: nRez.id, nom: "Rez — plan de l'architecte",
  }).returning();
  const [planSousSol] = await db.insert(plan).values({
    proprieteId: p.id, type: "etage", niveauId: nSousSol.id, nom: "Sous-sol",
  }).returning();

  return { p, nRez, nSousSol, e, planRez, planSousSol };
}

// drizzle-orm@0.44 enveloppe l'erreur pg dans une DrizzleQueryError dont le
// message est « Failed query: … » ; le message pg d'origine est sur `.cause`.
const refuseePar = (contrainte: string) => ({
  cause: expect.objectContaining({ message: expect.stringContaining(contrainte) }),
});

describe("point.x / point.y en pourcentage", () => {
  it("refuse en base un point hors de [0, 100], insertion brute comprise", async () => {
    const j = await creerJeu();

    for (const [x, y, contrainte] of [
      [101, 50, "point_x_valide"],
      [-1, 50, "point_x_valide"],
      [50, 100.5, "point_y_valide"],
      [50, -0.1, "point_y_valide"],
    ] as const) {
      await expect(
        db.execute(sql`
          INSERT INTO point (element_id, plan_id, x, y)
          VALUES (${j.e.id}, ${j.planRez.id}, ${x}, ${y})
        `),
      ).rejects.toMatchObject(refuseePar(contrainte));
    }
  });

  it("accepte les bornes : un objet peut être posé dans un coin du plan", async () => {
    const j = await creerJeu();
    const [coin] = await db.insert(point).values({ elementId: j.e.id, planId: j.planRez.id, x: 0, y: 0 }).returning();
    const [oppose] = await db.insert(point).values({ elementId: j.e.id, planId: j.planSousSol.id, x: 100, y: 100 }).returning();
    expect([coin.x, coin.y]).toEqual([0, 0]);
    expect([oppose.x, oppose.y]).toEqual([100, 100]);
  });
});

describe("plan.type et plan.niveau_id", () => {
  it("refuse un plan d'étage sans niveau, et un plan de situation qui en porte un", async () => {
    const j = await creerJeu();

    await expect(
      db.execute(sql`INSERT INTO plan (propriete_id, type, niveau_id, nom) VALUES (${j.p.id}, 'etage', NULL, 'Orphelin')`),
    ).rejects.toMatchObject(refuseePar("plan_type_niveau_coherent"));

    await expect(
      db.execute(
        sql`INSERT INTO plan (propriete_id, type, niveau_id, nom) VALUES (${j.p.id}, 'situation', ${j.nRez.id}, 'Parcelle')`,
      ),
    ).rejects.toMatchObject(refuseePar("plan_type_niveau_coherent"));
  });

  it("accepte le plan de situation, rattaché à la parcelle et à aucun niveau", async () => {
    const j = await creerJeu();
    const [situation] = await db.insert(plan).values({
      proprieteId: j.p.id, type: "situation", niveauId: null, nom: "Extrait cadastral",
    }).returning();
    expect(situation.niveauId).toBeNull();
  });
});

describe("un objet qui traverse les niveaux", () => {
  it("porte un point par plan, et retirer l'un ne touche pas l'autre", async () => {
    const j = await creerJeu();
    const [auRez] = await db.insert(point).values({ elementId: j.e.id, planId: j.planRez.id, x: 30, y: 40 }).returning();
    const [enBas] = await db.insert(point).values({ elementId: j.e.id, planId: j.planSousSol.id, x: 31, y: 41 }).returning();

    await db.delete(point).where(sql`${point.id} = ${auRez.id}`);

    const restants = await db.select().from(point).where(sql`${point.elementId} = ${j.e.id}`);
    expect(restants.map((p) => p.id)).toEqual([enBas.id]);
    expect([restants[0].x, restants[0].y]).toEqual([31, 41]);
  });

  it("perd ses points d'un plan supprimé, et garde ceux des autres", async () => {
    const j = await creerJeu();
    await db.insert(point).values({ elementId: j.e.id, planId: j.planRez.id, x: 30, y: 40 });
    await db.insert(point).values({ elementId: j.e.id, planId: j.planSousSol.id, x: 31, y: 41 });

    await db.delete(plan).where(sql`${plan.id} = ${j.planRez.id}`);

    const restants = await db.select().from(point).where(sql`${point.elementId} = ${j.e.id}`);
    expect(restants.map((p) => p.planId)).toEqual([j.planSousSol.id]);
  });
});
