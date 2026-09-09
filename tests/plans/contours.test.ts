// tests/plans/contours.test.ts
// Le chemin d'ÉCRITURE de `zone_geom`, qui n'existait pas avant l'étape 6, et
// la déduction qu'il rend possible. Deux choses sont éprouvées ici et nulle
// part ailleurs : la contrainte de base refuse ce qu'aucune route ne doit
// écrire, et la géométrie PROPOSE sans jamais écrire `element.zone_id`.
import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element, plan, zoneGeom, session,
} from "../../app/db/schema/index";
import {
  chargerPolygonesDuPlan,
  chargerZonesTracables,
  deduireZonePourPoint,
  deplacerPoint,
  effacerContour,
  enregistrerContour,
  poserPoint,
  rangerElementDansZone,
} from "../../app/lib/plans/plans.server";
import { sessionCookie } from "../../app/lib/auth/cookie.server";
import { action as actionContours } from "../../app/routes/_app/plans.contours";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const CUISINE = [
  { x: 10, y: 10 },
  { x: 40, y: 10 },
  { x: 40, y: 40 },
  { x: 10, y: 40 },
];
const SEJOUR = [
  { x: 60, y: 10 },
  { x: 90, y: 10 },
  { x: 90, y: 40 },
  { x: 60, y: 40 },
];

/**
 * Un rez avec cuisine et séjour, un sous-sol avec un local technique, un
 * jardin. Deux plans d'étage et un plan de situation : c'est le couple
 * (type, niveau) qui décide des zones qu'un plan peut porter.
 */
async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `ct-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison", ordre: 0 }).returning();

  const [nRez] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [nSousSol] = await db.insert(niveau).values({ batimentId: b.id, nom: "Sous-sol", ordinal: -1 }).returning();

  const zoneDe = async (nom: string, niveauId: number | null, type: "interieur" | "technique" | "exterieur", ordre: number) => {
    const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId, nom, type, ordre }).returning();
    return z;
  };
  const zCuisine = await zoneDe("Cuisine", nRez.id, "interieur", 0);
  const zSejour = await zoneDe("Séjour", nRez.id, "interieur", 1);
  const zTechnique = await zoneDe("Local technique", nSousSol.id, "technique", 0);
  const zJardin = await zoneDe("Jardin", null, "exterieur", 0);

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();
  const fiche = async (nom: string, zoneId: number) => {
    const [e] = await db.insert(element).values({
      proprieteId: p.id, nom, typeId: t.id, zoneId, niveau: 1,
    }).returning();
    return e;
  };
  const eInduction = await fiche("Induction", zSejour.id);

  const nouveauPlan = async (valeurs: Partial<typeof plan.$inferInsert> & { nom: string }) => {
    const [l] = await db.insert(plan).values({ proprieteId: p.id, type: "etage", ...valeurs } as typeof plan.$inferInsert).returning();
    return l;
  };
  const planRez = await nouveauPlan({ niveauId: nRez.id, nom: "Rez" });
  const planSousSol = await nouveauPlan({ niveauId: nSousSol.id, nom: "Sous-sol" });
  const planSituation = await nouveauPlan({ type: "situation", niveauId: null, nom: "Cadastre" });

  // Une session : la route de ressource est testée telle qu'un écran l'appelle.
  const cookieJeton = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: cookieJeton, utilisateurId: u.id, expireLe: new Date(Date.now() + 3600_000) });
  const cookie = (await sessionCookie.serialize(cookieJeton)).split(";")[0];

  return { p, zCuisine, zSejour, zTechnique, zJardin, eInduction, planRez, planSousSol, planSituation, cookie };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

const zoneDe = async (elementId: number) => {
  const [e] = await db.select({ zoneId: element.zoneId }).from(element).where(eq(element.id, elementId));
  return e.zoneId;
};

describe("les zones qu'un plan peut porter", () => {
  it("suit la même couverture que le sélecteur : le niveau, ou l'extérieur", async () => {
    const j = await creerJeu();

    expect((await chargerZonesTracables(j.p.id, j.planRez.id)).map((z) => z.nom)).toEqual(["Cuisine", "Séjour"]);
    expect((await chargerZonesTracables(j.p.id, j.planSousSol.id)).map((z) => z.nom)).toEqual(["Local technique"]);
    // Le plan de situation porte les zones extérieures, celles sans niveau.
    expect((await chargerZonesTracables(j.p.id, j.planSituation.id)).map((z) => z.nom)).toEqual(["Jardin"]);
  });

  // `sommets` est ce que l'écran lit pour dire « 4 points » ou « sans
  // contour », et pour choisir entre « Tracer » et « Retracer ». Il l'a lu
  // ailleurs pendant toute l'étape 6 — dans `polygones`, servi par une requête
  // qui prend une `Portee` — et ce test tenait alors une colonne que personne
  // ne lisait.
  it("annonce l'état du contour, et pas seulement son existence", async () => {
    const j = await creerJeu();
    expect((await chargerZonesTracables(j.p.id, j.planRez.id)).map((z) => z.sommets)).toEqual([null, null]);

    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);
    const apres = await chargerZonesTracables(j.p.id, j.planRez.id);
    expect(apres.find((z) => z.nom === "Cuisine")!.sommets).toBe(4);
    expect(apres.find((z) => z.nom === "Séjour")!.sommets).toBeNull();
  });
});

describe("tracer un contour", () => {
  it("l'enregistre en pourcentages, marqué comme tracé et non importé", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);

    const [ligne] = await db.select().from(zoneGeom).where(eq(zoneGeom.zoneId, j.zCuisine.id));
    expect(ligne.polygone).toEqual(CUISINE);
    expect(ligne.source).toBe("trace");
    expect(await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).toEqual([
      { zoneId: j.zCuisine.id, nom: "Cuisine", sommets: CUISINE },
    ]);
  });

  it("retrace en remplaçant, jamais en doublant : la clé primaire le dit", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);
    const corrige = [...CUISINE, { x: 25, y: 50 }];
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, corrige);

    const lignes = await db.select().from(zoneGeom).where(eq(zoneGeom.zoneId, j.zCuisine.id));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].polygone).toEqual(corrige);
  });

  it("porte un contour par plan pour une même zone : ils ne s'écrasent pas entre eux", async () => {
    const j = await creerJeu();
    // Un second plan du rez (le relevé de l'électricien à côté de celui de
    // l'architecte) : la cuisine y a son propre contour.
    const [autreRez] = await db.insert(plan).values({
      proprieteId: j.p.id, type: "etage", niveauId: j.planRez.niveauId, nom: "Rez — électricien", ordre: 1,
    }).returning();

    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);
    await enregistrerContour(j.p.id, autreRez.id, j.zCuisine.id, SEJOUR);

    expect((await chargerPolygonesDuPlan(j.p.id, j.planRez.id))[0].sommets).toEqual(CUISINE);
    expect((await chargerPolygonesDuPlan(j.p.id, autreRez.id))[0].sommets).toEqual(SEJOUR);
  });

  it("efface un contour sans toucher aux autres", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);
    await enregistrerContour(j.p.id, j.planRez.id, j.zSejour.id, SEJOUR);

    await effacerContour(j.p.id, j.planRez.id, j.zCuisine.id);
    expect((await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).map((g) => g.nom)).toEqual(["Séjour"]);
  });

  it("refuse par un 404 une zone que ce plan ne couvre pas", async () => {
    const j = await creerJeu();
    // La cuisine est au rez : la tracer sur le plan du sous-sol donnerait un
    // contour qui proposerait ensuite une zone d'un autre niveau.
    await expect(enregistrerContour(j.p.id, j.planSousSol.id, j.zCuisine.id, CUISINE)).rejects.toMatchObject({ status: 404 });
    await expect(enregistrerContour(j.p.id, j.planRez.id, j.zJardin.id, CUISINE)).rejects.toMatchObject({ status: 404 });
  });

  it("refuse par un 404 le plan ou la zone d'une autre propriété", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();

    await expect(enregistrerContour(autre.p.id, mien.planRez.id, mien.zCuisine.id, CUISINE)).rejects.toMatchObject({ status: 404 });
    await expect(enregistrerContour(mien.p.id, mien.planRez.id, autre.zCuisine.id, CUISINE)).rejects.toMatchObject({ status: 404 });
    await expect(effacerContour(mien.p.id, mien.planRez.id, autre.zCuisine.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("la contrainte de base, et non le formulaire", () => {
  // Même raisonnement que `point_x_valide` : une route qui oublierait de
  // valider écrirait sinon un contour hors de l'image — et celui-là servirait
  // à proposer d'écrire `element.zone_id`.
  const refuse = async (j: Jeu, polygone: unknown) =>
    expect(
      db.execute(sql`
        INSERT INTO zone_geom (zone_id, plan_id, polygone, source)
        VALUES (${j.zCuisine.id}, ${j.planRez.id}, ${JSON.stringify(polygone)}::jsonb, 'trace')
      `),
    ).rejects.toThrow();

  it("refuse un sommet hors de l'image", async () => {
    const j = await creerJeu();
    await refuse(j, [{ x: 0, y: 0 }, { x: 101, y: 0 }, { x: 50, y: 50 }]);
    await refuse(j, [{ x: 0, y: 0 }, { x: 10, y: -1 }, { x: 50, y: 50 }]);
  });

  it("refuse ce qui n'est pas un tableau de sommets", async () => {
    const j = await creerJeu();
    await refuse(j, { x: 10, y: 10 });
    await refuse(j, "un contour");
    await refuse(j, [1, 2, 3]);
    // Une valeur textuelle plutôt qu'un nombre : c'est le cas qui ferait lever
    // un cast, et que le chemin JSON traite en rendant faux.
    await refuse(j, [{ x: "10", y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]);
    await refuse(j, [{ y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]);
  });

  it("refuse un sommet dont une coordonnée est un TABLEAU", async () => {
    const j = await creerJeu();
    // La famille que la première écriture laissait passer. En mode `lax` — le
    // défaut — un chemin JSON DÉROULE les tableaux avant d'appliquer le
    // filtre : `{"x": [5, 700]}` existait donc, parce que 5 satisfait le
    // prédicat, quand `x` n'est même pas un nombre et que 700 est hors bornes.
    // `strict` refuse de dérouler. Ce n'est pas un cas théorique : un contour
    // pareil rend `dansLeContour` vrai hors de la forme, donc PROPOSE d'écrire
    // `element.zone_id` sur une zone fausse.
    const carre = [{ x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }];
    await refuse(j, [{ x: [5], y: 0 }, ...carre]);
    await refuse(j, [{ x: [5, 700], y: 0 }, ...carre]);
    await refuse(j, [{ x: ["a", 5], y: 0 }, ...carre]);
    await refuse(j, [{ x: 0, y: [5, 700] }, ...carre]);
    await refuse(j, [[{ x: 5, y: 5 }], ...carre]);
  });

  it("refuse un contour trop court ou trop long", async () => {
    const j = await creerJeu();
    await refuse(j, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    await refuse(j, Array.from({ length: 41 }, () => ({ x: 1, y: 1 })));
  });

  it("accepte les bornes elles-mêmes", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
    ]);
    expect(await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).toHaveLength(1);
  });

  it("accepte les bornes de comptage, dans les deux sens", async () => {
    const j = await creerJeu();
    // Le test « 41 sommets refusés » ne mord que dans un sens : il attrape un
    // desserrage du maximum SQL, pas un resserrage. Abaisser le max à 25
    // laisserait ce test vert et ferait tomber un contour légitime de 40
    // sommets en erreur de contrainte brute, sans qu'aucun test ne bouge.
    // Les deux bords du compte sont donc éprouvés du côté qui ACCEPTE aussi.
    const sommets = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ x: (i * 100) / n, y: (i % 2) * 10 }));

    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, sommets(3));
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, sommets(40));
    expect(await chargerPolygonesDuPlan(j.p.id, j.planRez.id)).toHaveLength(1);
  });
});

describe("la géométrie propose, elle ne décide pas", () => {
  it("propose la zone du contour où tombe le point, sans rien écrire", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);
    await enregistrerContour(j.p.id, j.planRez.id, j.zSejour.id, SEJOUR);

    // L'induction est rangée dans le séjour, et posée dans la cuisine.
    await poserPoint(j.p.id, j.planRez.id, j.eInduction.id, 25, 25);
    const proposition = await deduireZonePourPoint(j.p.id, j.planRez.id, j.eInduction.id, 25, 25);

    expect(proposition).toMatchObject({
      elementId: j.eInduction.id,
      elementNom: "Induction",
      zoneId: j.zCuisine.id,
      zoneNom: "Cuisine",
      zoneActuelleNom: "Séjour",
    });
    // Le point est écrit, la zone de la fiche ne l'est pas. C'est TOUTE la
    // décision de l'étape : `element.zone_id` est ce que lit le filtre de
    // partage, et la réécrire déplacerait un objet dans ou hors de la portée
    // d'un locataire sans que personne l'ait décidé.
    expect(await zoneDe(j.eInduction.id)).toBe(j.zSejour.id);
  });

  it("ne propose rien quand le point tombe déjà dans la zone de l'objet", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zSejour.id, SEJOUR);
    expect(await deduireZonePourPoint(j.p.id, j.planRez.id, j.eInduction.id, 70, 20)).toBeNull();
  });

  it("ne propose rien hors de tout contour, ni quand deux contours se recouvrent", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);
    expect(await deduireZonePourPoint(j.p.id, j.planRez.id, j.eInduction.id, 50, 50)).toBeNull();

    // Le séjour tracé par-dessus la cuisine : l'ambiguïté n'est pas une
    // proposition, et elle échoue du côté qui n'écrit rien.
    await enregistrerContour(j.p.id, j.planRez.id, j.zSejour.id, CUISINE);
    expect(await deduireZonePourPoint(j.p.id, j.planRez.id, j.eInduction.id, 25, 25)).toBeNull();
  });

  it("ne propose rien quand aucun contour n'existe : la géométrie est optionnelle", async () => {
    // Règle non négociable #10 : chaque écran gère le cas « pas de polygone ».
    const j = await creerJeu();
    await poserPoint(j.p.id, j.planRez.id, j.eInduction.id, 25, 25);
    expect(await deduireZonePourPoint(j.p.id, j.planRez.id, j.eInduction.id, 25, 25)).toBeNull();
  });

  it("propose aussi après un déplacement, en retrouvant seule le plan et la fiche", async () => {
    const j = await creerJeu();
    await enregistrerContour(j.p.id, j.planRez.id, j.zCuisine.id, CUISINE);
    const pointId = await poserPoint(j.p.id, j.planRez.id, j.eInduction.id, 50, 50);

    const { planId, elementId } = await deplacerPoint(j.p.id, pointId, 25, 25);
    expect(planId).toBe(j.planRez.id);
    expect(elementId).toBe(j.eInduction.id);
    expect(await deduireZonePourPoint(j.p.id, planId, elementId, 25, 25)).toMatchObject({ zoneNom: "Cuisine" });
  });

  it("ne propose rien pour une fiche d'une autre propriété", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();
    await enregistrerContour(mien.p.id, mien.planRez.id, mien.zCuisine.id, CUISINE);
    expect(await deduireZonePourPoint(mien.p.id, mien.planRez.id, autre.eInduction.id, 25, 25)).toBeNull();
  });
});

describe("ranger un objet dans la zone proposée", () => {
  it("écrit `element.zone_id` seulement quand on le lui demande", async () => {
    const j = await creerJeu();
    await rangerElementDansZone(j.p.id, j.eInduction.id, j.zCuisine.id);
    expect(await zoneDe(j.eInduction.id)).toBe(j.zCuisine.id);
  });

  it("réécrit le vecteur de recherche par le déclencheur, sans que personne l'ait demandé", async () => {
    // La zone pèse le poids C dans `element.recherche` : la déplacer sans
    // réindexer laisserait la fiche trouvable par son ancienne zone.
    const j = await creerJeu();
    await rangerElementDansZone(j.p.id, j.eInduction.id, j.zCuisine.id);
    const [ligne] = (
      await db.execute<{ recherche: string }>(sql`SELECT recherche::text FROM element WHERE id = ${j.eInduction.id}`)
    ).rows;
    expect(ligne.recherche).toContain("cuisin");
    expect(ligne.recherche).not.toContain("sejour");
  });

  it("refuse par un 404 la zone ou la fiche d'une autre propriété", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();

    await expect(rangerElementDansZone(mien.p.id, mien.eInduction.id, autre.zCuisine.id)).rejects.toMatchObject({ status: 404 });
    await expect(rangerElementDansZone(mien.p.id, autre.eInduction.id, mien.zCuisine.id)).rejects.toMatchObject({ status: 404 });
    // Et rien n'a bougé de part et d'autre.
    expect(await zoneDe(mien.eInduction.id)).toBe(mien.zSejour.id);
    expect(await zoneDe(autre.eInduction.id)).toBe(autre.zSejour.id);
  });
});

/**
 * Le refus vu par l'écran, et pas seulement par la couche de données.
 *
 * `enregistrerContour` LANCE ses 404 (les tests ci-dessus l'épinglent), mais
 * une `Response` lancée depuis l'action d'un fetcher ne devient pas
 * `fetcher.data` : elle remonte à la frontière d'erreur et remplace la page —
 * vérifié au navigateur, on obtenait un « 404 » nu. Elle emportait donc le
 * tracé en cours avec le composant qui le tient, et « garder les clics
 * jusqu'à confirmation » n'avait aucune prise dessus.
 *
 * La route rend ces 404 au lieu de les relancer. Le code reste 404 et le
 * message ne dépend pas du motif : la règle #4 porte sur ce que la réponse
 * apprend, pas sur la façon dont le routeur la transporte.
 */
describe("la route de contours rend ses refus au lieu de les lancer", () => {
  const appeler = (j: Jeu, champs: Record<string, string>) =>
    actionContours({
      request: new Request("http://test/proprietes/1/plans/contours", {
        method: "POST",
        headers: { Cookie: j.cookie },
        body: new URLSearchParams(champs),
      }),
      params: { proprieteId: String(j.p.id) },
    } as unknown as ActionFunctionArgs);

  it("rend un 404 lisible quand le plan ne couvre pas la zone", async () => {
    const j = await creerJeu();
    const reponse = await appeler(j, {
      _action: "tracer",
      planId: String(j.planSousSol.id),
      zoneId: String(j.zCuisine.id),
      sommets: JSON.stringify(CUISINE),
    });

    expect(reponse).toBeInstanceOf(Response);
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toEqual({ erreur: "Zone introuvable" });
    // Rien écrit, évidemment : le refus vient d'avant l'écriture.
    expect(await chargerPolygonesDuPlan(j.p.id, j.planSousSol.id)).toEqual([]);
  });

  it("rend le même 404 pour la zone d'une autre propriété", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();
    const reponse = await appeler(mien, {
      _action: "tracer",
      planId: String(mien.planRez.id),
      zoneId: String(autre.zCuisine.id),
      sommets: JSON.stringify(CUISINE),
    });

    // Indiscernable du cas précédent : « n'existe pas » et « n'est pas à
    // vous » ne se distinguent pas (règle #4).
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toEqual({ erreur: "Zone introuvable" });
  });

  it("rend un 400 lisible sur un contour hors bornes", async () => {
    const j = await creerJeu();
    const reponse = await appeler(j, {
      _action: "tracer",
      planId: String(j.planRez.id),
      zoneId: String(j.zCuisine.id),
      sommets: JSON.stringify([{ x: 0, y: 0 }, { x: 101, y: 0 }, { x: 50, y: 50 }]),
    });
    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toMatch(/points/);
  });

  it("accepte un contour couvert, et le rend lisible par la liste des zones", async () => {
    const j = await creerJeu();
    const reponse = await appeler(j, {
      _action: "tracer",
      planId: String(j.planRez.id),
      zoneId: String(j.zCuisine.id),
      sommets: JSON.stringify(CUISINE),
    });
    expect(reponse.status).toBe(200);

    // `sommets` est ce que l'écran lit pour dire « 4 points » et pour choisir
    // entre « Tracer » et « Retracer ».
    const zones = await chargerZonesTracables(j.p.id, j.planRez.id);
    expect(zones.find((z) => z.nom === "Cuisine")!.sommets).toBe(CUISINE.length);
  });
});
