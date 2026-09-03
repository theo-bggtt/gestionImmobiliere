// tests/plans/image.test.ts
// Le téléversement d'un plan, et la promesse que portent les pourcentages :
// remplacer l'image ne déplace aucun point. C'est la raison d'être du choix
// de coordonnées, et elle ne vaut que si un test la tient.
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element, fichier, plan, point,
} from "../../app/db/schema/index";

// La couche de stockage résout sa racine à l'import : la fixer avant de
// charger les modules qui écrivent, sinon le test salirait le volume de dev.
process.env.STOCKAGE_RACINE = await mkdtemp(join(tmpdir(), "gi-plans-"));
const { lire, cheminVignette } = await import("../../app/lib/stockage/fichiers.server");
const { creerPlan, remplacerImagePlan, supprimerPlan, poserPoint, chargerPointsDuPlan } = await import(
  "../../app/lib/plans/plans.server"
);

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

// Un plan photographié de travers avec un téléphone : orientation EXIF et
// coordonnées GPS, comme toute photo qui entre dans l'application.
const photoDePlan = (largeur: number, hauteur: number) =>
  sharp({ create: { width: largeur, height: hauteur, channels: 3, background: { r: 240, g: 240, b: 235 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestPhone" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 31/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `im-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();
  const [e1] = await db.insert(element).values({ proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: z.id, niveau: 1 }).returning();
  const [e2] = await db.insert(element).values({ proprieteId: p.id, nom: "Vanne", typeId: t.id, zoneId: z.id, niveau: 1 }).returning();
  return { p, n, e1, e2 };
}

const cheminDuPlan = async (planId: number) => {
  const [ligne] = await db
    .select({ fichierId: fichier.id, chemin: fichier.chemin })
    .from(plan)
    .innerJoin(fichier, eq(fichier.id, plan.imageFichierId))
    .where(eq(plan.id, planId));
  return ligne;
};

describe("téléversement d'un plan", () => {
  it("enregistre l'image sans EXIF, recadrée et pivotée comme demandé", async () => {
    const j = await creerJeu();
    const planId = await creerPlan({
      proprieteId: j.p.id,
      type: "etage",
      niveauId: j.n.id,
      nom: "Rez — plan de l'architecte",
      ordre: 0,
      image: await photoDePlan(1200, 800),
      // Orientation 6 : le paysage 1200x800 est d'abord redressé en 800x1200,
      // puis le quart de tour le remet en 1200x800, puis on garde la moitié
      // haute.
      geometrie: { rotation: 90, recadrage: { x: 0, y: 0, largeur: 100, hauteur: 50 } },
    });

    const image = await cheminDuPlan(planId);
    const octets = await lire(image.chemin);
    const meta = await sharp(octets).metadata();

    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(400);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(octets.includes(Buffer.from("TestPhone"))).toBe(false);

    // La vignette suit le même chemin dérivé que toute image de l'application.
    await expect(lire(cheminVignette(image.chemin))).resolves.toBeInstanceOf(Buffer);
  });
});

describe("remplacement de l'image d'un plan", () => {
  it("ne déplace aucun point, même vers une image de dimensions différentes", async () => {
    const j = await creerJeu();
    const planId = await creerPlan({
      proprieteId: j.p.id, type: "etage", niveauId: j.n.id, nom: "Rez", ordre: 0,
      image: await photoDePlan(1200, 800),
      geometrie: { rotation: 0 },
    });

    await poserPoint(j.p.id, planId, j.e1.id, 20.5, 30.25);
    await poserPoint(j.p.id, planId, j.e2.id, 80, 90);
    const avant = await chargerPointsDuPlan(j.p.id, planId);
    const ancienne = await cheminDuPlan(planId);

    // Le relevé de l'électricien remplacé par le plan propre de l'architecte,
    // dans un tout autre format et une tout autre orientation.
    await remplacerImagePlan(j.p.id, planId, await photoDePlan(900, 1600), { rotation: 0 });

    const apres = await chargerPointsDuPlan(j.p.id, planId);
    expect(apres.map((p) => ({ id: p.id, x: p.x, y: p.y }))).toEqual(
      avant.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    );

    const nouvelle = await cheminDuPlan(planId);
    expect(nouvelle.fichierId).not.toBe(ancienne.fichierId);
    const meta = await sharp(await lire(nouvelle.chemin)).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 900]);

    // L'ancienne image ne traîne ni en base ni sur le volume.
    const [reste] = await db.select().from(fichier).where(eq(fichier.id, ancienne.fichierId));
    expect(reste).toBeUndefined();
    await expect(lire(ancienne.chemin)).rejects.toBeTruthy();
  });

  it("emporte ses points quand le plan lui-même est supprimé, et rien d'autre", async () => {
    const j = await creerJeu();
    const planId = await creerPlan({
      proprieteId: j.p.id, type: "etage", niveauId: j.n.id, nom: "Rez", ordre: 0,
      image: await photoDePlan(600, 400), geometrie: { rotation: 0 },
    });
    await poserPoint(j.p.id, planId, j.e1.id, 10, 10);
    const image = await cheminDuPlan(planId);

    await supprimerPlan(j.p.id, planId);

    expect(await db.select().from(point).where(eq(point.planId, planId))).toEqual([]);
    await expect(lire(image.chemin)).rejects.toBeTruthy();
    // La fiche, elle, survit à son plan.
    const [fiche] = await db.select().from(element).where(eq(element.id, j.e1.id));
    expect(fiche.nom).toBe("Induction");
  });
});

describe("poser un point", () => {
  it("déplace le point existant plutôt que d'en créer un second sur le même plan", async () => {
    const j = await creerJeu();
    const planId = await creerPlan({
      proprieteId: j.p.id, type: "etage", niveauId: j.n.id, nom: "Rez", ordre: 0,
      image: await photoDePlan(600, 400), geometrie: { rotation: 0 },
    });

    const premier = await poserPoint(j.p.id, planId, j.e1.id, 10, 10);
    const second = await poserPoint(j.p.id, planId, j.e1.id, 70, 20);

    expect(second).toBe(premier);
    const points = await chargerPointsDuPlan(j.p.id, planId);
    expect(points).toHaveLength(1);
    expect([points[0].x, points[0].y]).toEqual([70, 20]);
  });

  it("refuse un plan ou une fiche d'une autre propriété par un 404", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();
    const planId = await creerPlan({
      proprieteId: mien.p.id, type: "etage", niveauId: mien.n.id, nom: "Rez", ordre: 0,
      image: await photoDePlan(600, 400), geometrie: { rotation: 0 },
    });

    await expect(poserPoint(autre.p.id, planId, autre.e1.id, 10, 10)).rejects.toMatchObject({ status: 404 });
    await expect(poserPoint(mien.p.id, planId, autre.e1.id, 10, 10)).rejects.toMatchObject({ status: 404 });
  });
});
