// tests/zones/deplacement.test.ts
// Changer une zone d'étage. Le geste se dit en une phrase et touche trois
// choses : la zone, sa descendance, et les contours que le déplacement rend
// faux. Les deux dernières ne se voient pas depuis le formulaire, et c'est
// exactement ce qui est épinglé ici.
import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element, plan, zoneGeom,
} from "../../app/db/schema/index";
import { deplacerZone, descendanceDeZone } from "../../app/lib/zones/deplacement.server";
import { chargerArbreZones } from "../../app/lib/zoneTree";
import { chargerPolygonesDuPlan, enregistrerContour } from "../../app/lib/plans/plans.server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const CARRE = [
  { x: 10, y: 10 },
  { x: 40, y: 10 },
  { x: 40, y: 40 },
  { x: 10, y: 40 },
];

/**
 * Un rez et un premier, chacun avec son plan, plus un plan de situation. La
 * cuisine du rez porte un placard (sous-zone) et un objet.
 */
async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `dz-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison", ordre: 0 }).returning();

  const [nRez] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [nPremier] = await db.insert(niveau).values({ batimentId: b.id, nom: "Premier", ordinal: 1 }).returning();

  const zoneDe = async (nom: string, niveauId: number | null, parentId: number | null, ordre: number) => {
    const [z] = await db
      .insert(zone)
      .values({ proprieteId: p.id, niveauId, parentId, nom, type: "interieur", ordre })
      .returning();
    return z;
  };
  const zCuisine = await zoneDe("Cuisine", nRez.id, null, 0);
  const zPlacard = await zoneDe("Placard", nRez.id, zCuisine.id, 1);
  const zTiroir = await zoneDe("Tiroir", nRez.id, zPlacard.id, 2);
  const zSejour = await zoneDe("Séjour", nRez.id, null, 3);

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();
  const [eFour] = await db.insert(element).values({
    proprieteId: p.id, nom: "Four", typeId: t.id, zoneId: zCuisine.id, niveau: 1,
  }).returning();

  const nouveauPlan = async (valeurs: Partial<typeof plan.$inferInsert> & { nom: string }) => {
    const [l] = await db.insert(plan).values({ proprieteId: p.id, type: "etage", ...valeurs } as typeof plan.$inferInsert).returning();
    return l;
  };
  const planRez = await nouveauPlan({ niveauId: nRez.id, nom: "Rez" });
  const planPremier = await nouveauPlan({ niveauId: nPremier.id, nom: "Premier" });
  const planSituation = await nouveauPlan({ type: "situation", niveauId: null, nom: "Cadastre" });

  return { p, nRez, nPremier, zCuisine, zPlacard, zTiroir, zSejour, eFour, planRez, planPremier, planSituation };
}

const niveauDe = async (zoneId: number) => {
  const [z] = await db.select({ niveauId: zone.niveauId }).from(zone).where(eq(zone.id, zoneId));
  return z.niveauId;
};

describe("la descendance d'une zone", () => {
  it("rend la zone elle-même et tous ses niveaux d'enfants", async () => {
    const j = await creerJeu();
    const ids = await descendanceDeZone(j.p.id, j.zCuisine.id);
    expect(new Set(ids)).toEqual(new Set([j.zCuisine.id, j.zPlacard.id, j.zTiroir.id]));
    // La zone sœur n'en fait pas partie : la récursion suit `parent_id`, pas le niveau.
    expect(ids).not.toContain(j.zSejour.id);
  });

  // La garde du cycle de l'action s'appuie dessus : sans elle, ranger la
  // cuisine sous son propre tiroir ne planterait pas — `grouperParParent` ne
  // traite comme racine que ce dont le parent est absent du lot, donc la
  // branche disparaîtrait simplement de l'écran.
  it("est ce qui permet de refuser un cycle avant de l'écrire", async () => {
    const j = await creerJeu();
    expect(await descendanceDeZone(j.p.id, j.zCuisine.id)).toContain(j.zTiroir.id);
  });

  it("ne traverse pas la propriété du voisin", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    expect(await descendanceDeZone(autre.p.id, j.zCuisine.id)).toEqual([]);
  });
});

describe("déplacer une zone d'un étage à l'autre", () => {
  it("emmène toute la descendance, sur tous ses niveaux", async () => {
    const j = await creerJeu();
    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);

    expect(await niveauDe(j.zCuisine.id)).toBe(j.nPremier.id);
    expect(await niveauDe(j.zPlacard.id)).toBe(j.nPremier.id);
    expect(await niveauDe(j.zTiroir.id)).toBe(j.nPremier.id);
    // La sœur reste où elle est.
    expect(await niveauDe(j.zSejour.id)).toBe(j.nRez.id);
  });

  // Ce qu'un enfant resté au rez sous une cuisine montée au premier
  // produirait : `chargerArbreZones` groupe par niveau AVANT de reconstruire
  // l'arbre, donc le placard s'afficherait comme une zone racine du rez.
  it("garde l'arbre lisible : le placard reste sous la cuisine, au nouvel étage", async () => {
    const j = await creerJeu();
    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);

    const { arbre } = await chargerArbreZones(j.p.id);
    const premier = arbre[0].niveaux.find((n) => n.niveau.id === j.nPremier.id)!;
    expect(premier.zones.map((z) => z.nom)).toEqual(["Cuisine"]);
    expect(premier.zones[0].enfants.map((z) => z.nom)).toEqual(["Placard"]);
    expect(premier.zones[0].enfants[0].enfants.map((z) => z.nom)).toEqual(["Tiroir"]);

    const rez = arbre[0].niveaux.find((n) => n.niveau.id === j.nRez.id)!;
    expect(rez.zones.map((z) => z.nom)).toEqual(["Séjour"]);
  });

  // La décision de l'étape 6 tenue à l'envers : la géométrie propose, elle
  // n'écrit pas `element.zone_id` — et déménager une zone ne le réécrit pas
  // non plus. Un objet suit sa zone sans qu'une ligne d'`element` bouge, donc
  // rien n'entre ni ne sort de la portée d'un lien à l'insu de quiconque.
  it("ne réécrit aucun element.zone_id", async () => {
    const j = await creerJeu();
    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);

    const [e] = await db
      .select({ zoneId: element.zoneId, niveau: element.niveau })
      .from(element)
      .where(eq(element.id, j.eFour.id));
    expect(e.zoneId).toBe(j.zCuisine.id);
    expect(e.niveau).toBe(1);
  });

  it("écrit le nouveau parent en même temps que le niveau", async () => {
    const j = await creerJeu();
    // Le séjour devient une sous-zone de la cuisine : même étage, donc valide.
    await deplacerZone(j.p.id, j.zSejour.id, j.nRez.id, j.zCuisine.id);

    const { arbre } = await chargerArbreZones(j.p.id);
    const rez = arbre[0].niveaux.find((n) => n.niveau.id === j.nRez.id)!;
    expect(rez.zones.map((z) => z.nom)).toEqual(["Cuisine"]);
    expect(rez.zones[0].enfants.map((z) => z.nom)).toEqual(["Placard", "Séjour"]);
  });
});

describe("les contours que le déplacement rend faux", () => {
  // Sans cet effacement, `chargerPolygonesDuPlan` — qui ne filtre PAS par
  // couverture — continuerait de servir le contour de la cuisine sur le plan
  // du rez, et `zoneDuPoint` proposerait donc d'y ranger un objet.
  it("efface le contour resté sur le plan de l'ancien étage", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CARRE);
    expect((await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).map((c) => c.nom)).toEqual(["Cuisine"]);

    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);
    expect(await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).toEqual([]);
  });

  it("efface aussi ceux de la descendance, qui a changé d'étage avec elle", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zPlacard.id, CARRE);

    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);
    expect(await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).toEqual([]);
  });

  // L'action appelle `deplacerZone` à CHAQUE enregistrement, y compris pour un
  // simple renommage : il faut donc que le déplacement sur place soit inerte,
  // sinon renommer la cuisine effacerait son contour.
  it("est inerte quand la zone ne bouge pas, et garde son propre contour", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CARRE);

    await deplacerZone(j.p.id, j.zCuisine.id, j.nRez.id, null);
    expect((await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).map((c) => c.nom)).toEqual(["Cuisine"]);
  });

  it("laisse intact le contour d'une zone que le plan couvre encore", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zSejour.id, CARRE);

    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);
    expect((await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).map((c) => c.nom)).toEqual(["Séjour"]);
  });

  // Le cas que `NOT` seul laissait passer : devenue extérieure, la zone a un
  // `niveau_id` NULL, donc `z.niveau_id = p.niveau_id` vaut NULL et non
  // `false` — et `NOT NULL` vaut NULL. Sans le `coalesce(…, false)` du DELETE,
  // le contour le plus certainement faux des trois était le seul à survivre.
  it("efface le contour d'une zone devenue extérieure, où NOT seul échouait", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CARRE);

    await deplacerZone(j.p.id, j.zCuisine.id, null, null);
    expect(await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).toEqual([]);
  });

  // Le symétrique : une zone qui devient extérieure prend le plan de
  // situation, et son contour y survivrait s'il y était.
  it("garde celui d'une zone extérieure sur le plan de situation", async () => {
    const j = await creerJeu();
    await deplacerZone(j.p.id, j.zSejour.id, null, null);
    await enregistrerContour(j.p.id, j.planSituation.id, j.zSejour.id, CARRE);

    // Un déplacement voisin ne doit rien lui faire.
    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);
    expect((await chargerPolygonesDuPlan(j.p.id, j.planSituation.id)).map((c) => c.nom)).toEqual(["Séjour"]);
  });

  it("ne touche pas aux contours d'une autre propriété", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    await enregistrerContour(autre.p.id, autre.planRez.id, autre.zCuisine.id, CARRE);

    await deplacerZone(j.p.id, j.zCuisine.id, j.nPremier.id, null);
    expect(await db.select().from(zoneGeom).where(eq(zoneGeom.zoneId, autre.zCuisine.id))).toHaveLength(1);
  });
});
