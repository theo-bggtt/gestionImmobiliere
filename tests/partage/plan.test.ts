// tests/partage/plan.test.ts
// Le plan sur la page de partage : la surface que l'étape 4 ajoute à la revue
// de fuite. Une géométrie divulgue autant qu'un compte — un sélecteur qui
// montre « Sous-sol » à un jardinier lui apprend qu'il y a un sous-sol.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element, fichier, plan, partage,
} from "../../app/db/schema/index";
import { creerJeton } from "../../app/lib/partage/partage.server";
import { PagePartage } from "../../app/components/partage/PagePartage";

process.env.STOCKAGE_RACINE = await mkdtemp(join(tmpdir(), "gi-partage-plan-"));
const { creerPlan, poserPoint } = await import("../../app/lib/plans/plans.server");
const routePage = await import("../../app/routes/_partage/page");
const routeFichiers = await import("../../app/routes/_partage/fichiers");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const NOM_DE_PLAN_BAVARD = "Rez — 12 chemin des Vignes, EGID 987654321";

const image = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 245, g: 245, b: 240 } } })
    .jpeg()
    .toBuffer();

/**
 * Une cuisine au rez avec un objet d'usage, un local technique au sous-sol
 * avec un objet privé, et un jardin. Trois plans : le sous-sol ne doit jamais
 * apparaître pour un lien « usage ».
 */
async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `pp-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({
    proprietaireId: u.id, nom: "Maison de test", adresse: "12 chemin des Vignes, 1260 Nyon", egid: "987654321",
  }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [nRez] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez-de-chaussée", ordinal: 0 }).returning();
  const [nSousSol] = await db.insert(niveau).values({ batimentId: b.id, nom: "Sous-sol", ordinal: -1 }).returning();

  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: nRez.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: nSousSol.id, nom: "Local technique", type: "technique" }).returning();
  const [zJardin] = await db.insert(zone).values({ proprieteId: p.id, niveauId: null, nom: "Jardin", type: "exterieur" }).returning();

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();
  const fiche = async (nom: string, zoneId: number, niveauFiche: number) => {
    const [e] = await db.insert(element).values({ proprieteId: p.id, nom, typeId: t.id, zoneId, niveau: niveauFiche }).returning();
    return e;
  };
  const eInduction = await fiche("Induction", zCuisine.id, 1);
  const ePapiers = await fiche("Coffre a papiers", zTechnique.id, 3);
  const eArrosage = await fiche("Vanne arrosage", zJardin.id, 1);

  const octets = await image();
  const planRez = await creerPlan({
    proprieteId: p.id, type: "etage", niveauId: nRez.id, nom: NOM_DE_PLAN_BAVARD, ordre: 0,
    image: octets, geometrie: { rotation: 0 },
  });
  const planSousSol = await creerPlan({
    proprieteId: p.id, type: "etage", niveauId: nSousSol.id, nom: "Sous-sol", ordre: 0,
    image: octets, geometrie: { rotation: 0 },
  });
  const planSituation = await creerPlan({
    proprieteId: p.id, type: "situation", niveauId: null, nom: "Extrait cadastral", ordre: 0,
    image: octets, geometrie: { rotation: 0 },
  });

  // Le coffre du local technique est aussi repéré sur le plan du rez : un
  // objet masqué posé sur un plan servi.
  await poserPoint(p.id, planRez, eInduction.id, 20, 30);
  await poserPoint(p.id, planRez, ePapiers.id, 60, 70);
  await poserPoint(p.id, planSituation, eArrosage.id, 80, 20);

  const jeton = creerJeton();
  const [lien] = await db.insert(partage).values({
    proprieteId: p.id, nom: "Locataires 12-19 aout", jeton, niveauMax: 1,
  }).returning();

  return { p, zJardin, planRez, planSousSol, planSituation, jeton, lien };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

const args = (url: string, params: Record<string, string>) =>
  ({ request: new Request(url), params }) as unknown as LoaderFunctionArgs;

const rendre = <P extends object>(Composant: ComponentType<P>, props: P) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/p/x"] }, createElement(Composant, props)));

async function pageDe(j: Jeu, requete = "") {
  const d = await routePage.loader(args(`http://test/p/${j.jeton}${requete}`, { jeton: j.jeton }));
  if (!d.actif) throw new Error("le partage devrait être actif");
  return d;
}

const imageDuPlan = async (planId: number) => {
  const [ligne] = await db.select({ id: plan.imageFichierId }).from(plan).where(eq(plan.id, planId));
  return ligne.id!;
};

describe("le plan servi par un lien", () => {
  it("se charge sans session et se rend sans une ligne de JavaScript", async () => {
    const j = await creerJeu();
    const d = await pageDe(j);
    const html = rendre(PagePartage, { donnees: d.donnees, jeton: d.jeton });

    expect(d.donnees.plan).not.toBeNull();
    expect(html).toContain("Plan");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("/proprietes/");
    expect(routePage.handle.sansScripts).toBe(true);
  });

  it("n'a ni point, ni pastille, ni ligne de légende pour un objet hors portée", async () => {
    const j = await creerJeu();
    const d = await pageDe(j);
    const html = rendre(PagePartage, { donnees: d.donnees, jeton: d.jeton });

    expect(d.donnees.plan!.points.map((pt) => pt.nom)).toEqual(["Induction"]);
    expect(html).toContain("Induction");
    expect(html).not.toContain("Coffre a papiers");
    // Ni compte résiduel : la légende est numérotée à partir des seuls points servis.
    expect(JSON.stringify(d.donnees.plan)).not.toContain("Coffre");
  });

  it("écarte du sélecteur le plan dont aucune zone n'est visible", async () => {
    const j = await creerJeu();
    const d = await pageDe(j);
    const html = rendre(PagePartage, { donnees: d.donnees, jeton: d.jeton });

    expect(d.donnees.plans.map((p) => p.etiquette)).toEqual(["Rez-de-chaussée", "Situation"]);
    expect(html).not.toContain("Sous-sol");
  });

  it("ne sert au jardinier que le plan de situation", async () => {
    const j = await creerJeu();
    await db.update(partage).set({ porteeZones: [j.zJardin.id] }).where(eq(partage.id, j.lien.id));

    const d = await pageDe(j);
    expect(d.donnees.plans.map((p) => p.etiquette)).toEqual(["Situation"]);
    expect(d.donnees.plan!.points.map((pt) => pt.nom)).toEqual(["Vanne arrosage"]);

    const html = rendre(PagePartage, { donnees: d.donnees, jeton: d.jeton });
    expect(html).not.toContain("Rez-de-chaussée");
    expect(html).not.toContain("Induction");
  });

  it("n'écrit jamais le nom que le propriétaire a donné au plan", async () => {
    const j = await creerJeu();
    const d = await pageDe(j);
    const html = rendre(PagePartage, { donnees: d.donnees, jeton: d.jeton });

    // Le nom peut contenir l'adresse et l'EGID : il ne quitte pas les écrans
    // du propriétaire (règle non négociable #7).
    expect(html).not.toContain("chemin des Vignes");
    expect(html).not.toContain("987654321");
    expect(JSON.stringify(d.donnees)).not.toContain(NOM_DE_PLAN_BAVARD);
    expect(d.donnees.plan!.etiquette).toBe("Rez-de-chaussée");
  });

  it("retombe sur le premier plan visible quand l'URL en demande un hors portée", async () => {
    const j = await creerJeu();
    const d = await pageDe(j, `?plan=${j.planSousSol}`);
    expect(d.donnees.plan!.id).toBe(j.planRez);
  });

  it("sert le plan demandé quand il est dans la portée", async () => {
    const j = await creerJeu();
    const d = await pageDe(j, `?plan=${j.planSituation}`);
    expect(d.donnees.plan!.etiquette).toBe("Situation");
  });

  it("efface le plan pendant une recherche, sans le remplacer par un titre vide", async () => {
    const j = await creerJeu();
    const d = await pageDe(j, "?q=induction");
    expect(d.donnees.plan).toBeNull();
    expect(d.donnees.plans).toEqual([]);
  });
});

describe("image d'un plan portée par le jeton", () => {
  it("sert l'image d'un plan dans la portée", async () => {
    const j = await creerJeu();
    const fichierId = await imageDuPlan(j.planRez);

    const reponse = await routeFichiers.loader(
      args(`http://test/p/${j.jeton}/fichiers/${fichierId}`, { jeton: j.jeton, fichierId: String(fichierId) }),
    );
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("répond 404 pour l'image d'un plan hors portée, jamais 403", async () => {
    const j = await creerJeu();
    const fichierId = await imageDuPlan(j.planSousSol);

    await expect(
      routeFichiers.loader(
        args(`http://test/p/${j.jeton}/fichiers/${fichierId}`, { jeton: j.jeton, fichierId: String(fichierId) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ne sert plus l'image d'un plan une fois le lien révoqué", async () => {
    const j = await creerJeu();
    const fichierId = await imageDuPlan(j.planRez);
    await db.update(partage).set({ revoqueLe: new Date() }).where(eq(partage.id, j.lien.id));

    await expect(
      routeFichiers.loader(
        args(`http://test/p/${j.jeton}/fichiers/${fichierId}`, { jeton: j.jeton, fichierId: String(fichierId) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("laisse intact le premier droit : la photo d'une fiche reste servie", async () => {
    const j = await creerJeu();
    // Une image qui n'est ni une photo de fiche ni l'image d'un plan n'est
    // autorisée par aucune des deux branches.
    const [orpheline] = await db.insert(fichier).values({
      proprieteId: j.p.id, chemin: "orpheline.jpg", typeMime: "image/jpeg", taille: 3,
    }).returning();

    await expect(
      routeFichiers.loader(
        args(`http://test/p/${j.jeton}/fichiers/${orpheline.id}`, { jeton: j.jeton, fichierId: String(orpheline.id) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("une propriété sans aucun plan", () => {
  it("ne casse ni le loader ni le rendu", async () => {
    const j = await creerJeu();
    await db.delete(plan).where(eq(plan.proprieteId, j.p.id));

    const d = await pageDe(j);
    expect(d.donnees.plans).toEqual([]);
    expect(d.donnees.plan).toBeNull();

    const html = rendre(PagePartage, { donnees: d.donnees, jeton: d.jeton });
    expect(html).toContain("Cuisine");
    expect(html).not.toContain("plan-cadre");
  });
});
