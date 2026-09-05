// tests/plans/portee.test.ts
// La géométrie divulgue comme un compte. Chaque test correspond à une surface
// du plan qui rend une donnée dérivée de la base : l'entrée du sélecteur de
// niveau, le point, le polygone d'une zone. Toutes passent la même `Portee`
// que la recherche, ou elles ne passent pas.
import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element, plan, point, zoneGeom, partage,
} from "../../app/db/schema/index";
import { creerJeton, porteeDuPartage } from "../../app/lib/partage/partage.server";
import { PORTEE_PROPRIETAIRE } from "../../app/lib/recherche/recherche.server";
import {
  chargerPlans, chargerPointsDuPlan, chargerPolygonesDuPlan, etiqueter, etiquettePlan,
} from "../../app/lib/plans/plans.server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

/**
 * Deux niveaux et l'extérieur. Le local technique est au sous-sol et ne porte
 * que du technique et du privé : c'est lui qui décide si le sélecteur de
 * niveau montre « Sous-sol » à qui n'a rien à y voir.
 */
async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `pl-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison", ordre: 0 }).returning();

  const [nCombles] = await db.insert(niveau).values({ batimentId: b.id, nom: "Combles", ordinal: 2 }).returning();
  const [nRez] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez-de-chaussée", ordinal: 0 }).returning();
  const [nSousSol] = await db.insert(niveau).values({ batimentId: b.id, nom: "Sous-sol", ordinal: -1 }).returning();

  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: nRez.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: nSousSol.id, nom: "Local technique", type: "technique" }).returning();
  const [zJardin] = await db.insert(zone).values({ proprieteId: p.id, niveauId: null, nom: "Jardin", type: "exterieur" }).returning();

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();

  const fiche = async (nom: string, zoneId: number, niveauFiche: number) => {
    const [e] = await db.insert(element).values({
      proprieteId: p.id, nom, typeId: t.id, zoneId, niveau: niveauFiche,
    }).returning();
    return e;
  };

  const eInduction = await fiche("Induction", zCuisine.id, 1);
  const eChaudiere = await fiche("Chaudiere", zTechnique.id, 2);
  const ePapiers = await fiche("Papiers", zTechnique.id, 3);
  const eArrosage = await fiche("Vanne arrosage", zJardin.id, 1);

  const nouveauPlan = async (valeurs: Partial<typeof plan.$inferInsert> & { nom: string }) => {
    const [ligne] = await db.insert(plan).values({
      proprieteId: p.id, type: "etage", ...valeurs,
    } as typeof plan.$inferInsert).returning();
    return ligne;
  };

  const planCombles = await nouveauPlan({ niveauId: nCombles.id, nom: "Combles" });
  const planRez = await nouveauPlan({ niveauId: nRez.id, nom: "Rez — relevé de l'électricien" });
  const planSousSol = await nouveauPlan({ niveauId: nSousSol.id, nom: "Sous-sol" });
  const planSituation = await nouveauPlan({ type: "situation", niveauId: null, nom: "Extrait cadastral" });

  // La colonne de chute du local technique est aussi repérée sur le plan du
  // rez : un objet d'une zone masquée, posé sur un plan servi.
  await db.insert(point).values([
    { planId: planRez.id, elementId: eInduction.id, x: 20, y: 30 },
    { planId: planRez.id, elementId: ePapiers.id, x: 60, y: 70 },
    { planId: planSousSol.id, elementId: eChaudiere.id, x: 40, y: 40 },
    { planId: planSituation.id, elementId: eArrosage.id, x: 80, y: 20 },
  ]);

  return {
    p, zCuisine, zTechnique, zJardin, eInduction, eChaudiere, ePapiers, eArrosage,
    planCombles, planRez, planSousSol, planSituation,
  };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

async function creerPartage(j: Jeu, valeurs: Partial<typeof partage.$inferInsert> = {}) {
  const [p] = await db.insert(partage).values({
    proprieteId: j.p.id, nom: "Lien de test", jeton: creerJeton(), niveauMax: 1,
    porteeZones: [], porteeSystemes: [], ...valeurs,
  }).returning();
  return porteeDuPartage(p);
}

describe("sélecteur de niveau", () => {
  it("trie par ordinal et non par nom, et met la situation à part en fin de liste", async () => {
    const j = await creerJeu();
    const plans = await chargerPlans(j.p.id, PORTEE_PROPRIETAIRE);

    expect(plans.map((p) => p.id)).toEqual([
      j.planSousSol.id, j.planRez.id, j.planCombles.id, j.planSituation.id,
    ]);
    expect(plans.at(-1)!.type).toBe("situation");
    // Trié par ordinal : par nom, « Combles » passerait devant « Rez ».
    expect(plans.slice(0, 3).map((p) => p.ordinal)).toEqual([-1, 0, 2]);
  });

  it("garde les plans d'un niveau vide pour le propriétaire : il doit pouvoir y poser le premier point", async () => {
    const j = await creerJeu();
    const plans = await chargerPlans(j.p.id, PORTEE_PROPRIETAIRE);
    // Les combles n'ont aucune zone, donc aucun objet.
    expect(plans.map((p) => p.id)).toContain(j.planCombles.id);
  });

  it("écarte d'un partage le plan dont aucune zone n'est visible", async () => {
    const j = await creerJeu();

    // Plafond « usage » : le local technique ne porte que du technique et du
    // privé, donc le sous-sol n'existe pas pour ce lien.
    const usage = await creerPartage(j, { niveauMax: 1 });
    const vusEnUsage = await chargerPlans(j.p.id, usage);
    expect(vusEnUsage.map((p) => p.id)).toEqual([j.planRez.id, j.planSituation.id]);
    expect(JSON.stringify(vusEnUsage)).not.toContain("Sous-sol");
    expect(JSON.stringify(vusEnUsage)).not.toContain("Combles");

    // Plafond « technique » : la chaudière devient visible, le sous-sol aussi.
    const technique = await creerPartage(j, { niveauMax: 2 });
    const vusEnTechnique = await chargerPlans(j.p.id, technique);
    expect(vusEnTechnique.map((p) => p.id)).toEqual([j.planSousSol.id, j.planRez.id, j.planSituation.id]);
  });

  it("ne sert au jardinier que le plan de situation", async () => {
    const j = await creerJeu();
    const jardinier = await creerPartage(j, { niveauMax: 1, porteeZones: [j.zJardin.id] });

    const plans = await chargerPlans(j.p.id, jardinier);
    expect(plans.map((p) => p.id)).toEqual([j.planSituation.id]);
    expect(etiqueter(plans)).toEqual([{ id: j.planSituation.id, etiquette: "Situation", situation: true }]);
  });

  it("étiquette un partage depuis le niveau, jamais depuis le nom saisi par le propriétaire", async () => {
    const j = await creerJeu();
    const plans = await chargerPlans(j.p.id, PORTEE_PROPRIETAIRE);
    const rez = plans.find((p) => p.id === j.planRez.id)!;

    expect(rez.nom).toBe("Rez — relevé de l'électricien");
    expect(etiquettePlan(rez)).toBe("Rez-de-chaussée");
    expect(etiqueter(plans).map((p) => p.etiquette)).not.toContain(rez.nom);
  });

  it("numérote les plans d'un même niveau sans laisser filtrer leurs noms", async () => {
    const j = await creerJeu();
    const [second] = await db.insert(plan).values({
      proprieteId: j.p.id, type: "etage", niveauId: j.planRez.niveauId, nom: "Rez — 12 chemin des Vignes", ordre: 1,
    }).returning();

    const plans = await chargerPlans(j.p.id, PORTEE_PROPRIETAIRE);
    const etiquettes = etiqueter(plans).map((p) => p.etiquette);
    expect(etiquettes).toContain("Rez-de-chaussée");
    expect(etiquettes).toContain("Rez-de-chaussée · plan 2");
    expect(etiquettes.join(" ")).not.toContain("chemin des Vignes");
    expect(second.id).toBeGreaterThan(0);
  });

  it("nomme le bâtiment quand deux d'entre eux portent un rez, et lui seul les distingue", async () => {
    const j = await creerJeu();
    const [grange] = await db.insert(batiment).values({ proprieteId: j.p.id, nom: "Grange", ordre: 1 }).returning();
    const [rezGrange] = await db
      .insert(niveau)
      .values({ batimentId: grange.id, nom: "Rez-de-chaussée", ordinal: 0 })
      .returning();
    await db.insert(plan).values({
      proprieteId: j.p.id, type: "etage", niveauId: rezGrange.id, nom: "Grange — plan", ordre: 0,
    });

    const etiquettes = etiqueter(await chargerPlans(j.p.id, PORTEE_PROPRIETAIRE)).map((p) => p.etiquette);
    expect(etiquettes).toContain("Maison · Rez-de-chaussée");
    expect(etiquettes).toContain("Grange · Rez-de-chaussée");
    // Deux entrées identiques dans le sélecteur, c'est le défaut qu'on corrige.
    expect(new Set(etiquettes).size).toBe(etiquettes.length);
  });

  it("n'alourdit pas l'étiquette quand la propriété n'a qu'un bâtiment", async () => {
    const j = await creerJeu();
    const etiquettes = etiqueter(await chargerPlans(j.p.id, PORTEE_PROPRIETAIRE)).map((p) => p.etiquette);
    expect(etiquettes).toContain("Rez-de-chaussée");
    expect(etiquettes.join(" ")).not.toContain("Maison");
  });
});

describe("points servis", () => {
  it("écarte du plan l'objet hors portée, sans en laisser la moindre trace", async () => {
    const j = await creerJeu();
    const usage = await creerPartage(j, { niveauMax: 1 });

    const points = await chargerPointsDuPlan(j.p.id, j.planRez.id, usage);
    expect(points.map((p) => p.nom)).toEqual(["Induction"]);
    // Ni pastille, ni compte, ni nom : ce qui est filtré n'est pas chargé.
    expect(JSON.stringify(points)).not.toContain("Papiers");
    expect(points).toHaveLength(1);
  });

  it("rend au propriétaire tous les points du plan", async () => {
    const j = await creerJeu();
    const points = await chargerPointsDuPlan(j.p.id, j.planRez.id, PORTEE_PROPRIETAIRE);
    expect(points.map((p) => p.nom).sort()).toEqual(["Induction", "Papiers"]);
  });

  it("ne sert aucun point d'un plan hors portée, même si l'objet posé dessus est visible", async () => {
    const j = await creerJeu();
    // L'arrosage est visible pour ce lien, mais posé aussi sur le sous-sol.
    await db.insert(point).values({ planId: j.planSousSol.id, elementId: j.eArrosage.id, x: 10, y: 10 });
    const jardinier = await creerPartage(j, { niveauMax: 1, porteeZones: [j.zJardin.id] });

    const plans = await chargerPlans(j.p.id, jardinier);
    expect(plans.map((p) => p.id)).not.toContain(j.planSousSol.id);
  });
});

describe("polygones de zone", () => {
  // Le filtre a été écrit à l'étape 4 sur une table que rien n'alimentait ;
  // ces tests l'éprouvaient déjà en insérant les lignes à la main. L'étape 6
  // les garde tels quels — un chemin d'écriture réel ne dispense pas de tenir
  // le filtre depuis les deux bords — et en ajoute deux.
  const contourCuisine = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
  const contourTechnique = [{ x: 60, y: 60 }, { x: 90, y: 60 }, { x: 90, y: 90 }];

  it("ne sert que les polygones des zones visibles", async () => {
    const j = await creerJeu();
    await db.insert(zoneGeom).values([
      { zoneId: j.zCuisine.id, planId: j.planRez.id, polygone: contourCuisine, source: "trace" },
      { zoneId: j.zTechnique.id, planId: j.planRez.id, polygone: contourTechnique, source: "trace" },
    ]);

    const proprietaire = await chargerPolygonesDuPlan(j.p.id, j.planRez.id, PORTEE_PROPRIETAIRE);
    expect(proprietaire.map((g) => g.nom).sort()).toEqual(["Cuisine", "Local technique"]);
    expect(proprietaire[0].sommets).toHaveLength(3);

    const usage = await creerPartage(j, { niveauMax: 1 });
    const partages = await chargerPolygonesDuPlan(j.p.id, j.planRez.id, usage);
    expect(partages.map((g) => g.nom)).toEqual(["Cuisine"]);
    expect(JSON.stringify(partages)).not.toContain("Local technique");
  });

  it("ne sert aucun contour d'une zone vide sous portée restreinte, même tracée", async () => {
    // Une zone sans objet visible n'a pas de tuile dans la grille ; elle n'a
    // pas plus de contour sur le plan. Un contour EST la surface, la position
    // et l'existence d'une zone.
    const j = await creerJeu();
    const [zVide] = await db
      .insert(zone)
      .values({ proprieteId: j.p.id, niveauId: j.zCuisine.niveauId, nom: "Buanderie", type: "interieur" })
      .returning();
    await db.insert(zoneGeom).values({
      zoneId: zVide.id, planId: j.planRez.id, polygone: contourTechnique, source: "trace",
    });

    expect((await chargerPolygonesDuPlan(j.p.id, j.planRez.id, PORTEE_PROPRIETAIRE)).map((g) => g.nom))
      .toContain("Buanderie");
    const usage = await creerPartage(j, { niveauMax: 1 });
    expect(JSON.stringify(await chargerPolygonesDuPlan(j.p.id, j.planRez.id, usage))).not.toContain("Buanderie");
  });

  it("sert le contour d'une zone rendue visible par son SYSTÈME, pas seulement par sa zone", async () => {
    // `clausePortee` ouvre par la zone OU par le système ; un contour servi
    // par la seule branche « zone » divergerait de la tuile de cette zone.
    const j = await creerJeu();
    const [s] = await db.insert(systeme).values({ proprieteId: j.p.id, nom: "Chauffage" }).returning();
    await db.update(element).set({ systemeId: s.id }).where(eq(element.id, j.eChaudiere.id));
    await db.insert(zoneGeom).values({
      zoneId: j.zTechnique.id, planId: j.planSousSol.id, polygone: contourTechnique, source: "trace",
    });

    const artisan = await creerPartage(j, { niveauMax: 2, porteeSystemes: [s.id] });
    expect((await chargerPolygonesDuPlan(j.p.id, j.planSousSol.id, artisan)).map((g) => g.nom))
      .toEqual(["Local technique"]);
  });
});
