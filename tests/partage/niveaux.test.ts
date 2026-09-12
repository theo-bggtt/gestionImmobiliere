// tests/partage/niveaux.test.ts
// Le niveau d'un objet : il se saisit, il se refuse, il se corrige en masse —
// et ce qui le COMPTE reste chez le propriétaire.
//
// Tous les tests de partage partaient jusqu'ici d'objets insérés directement
// en base avec leur niveau. C'est exactement ce que l'issue #34 reproche à la
// « Maison d'exemple » : aucun d'eux ne serait tombé le jour où les routes ont
// cessé de poser le niveau. Ceux-ci passent par les routes.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element, partage, session,
} from "../../app/db/schema/index";
import { creerJeton } from "../../app/lib/partage/partage.server";

process.env.STOCKAGE_RACINE = await mkdtemp(join(tmpdir(), "gi-niveaux-"));
const routeNouvel = await import("../../app/routes/_app/elements.nouveau");
const routeModifier = await import("../../app/routes/_app/elements.$elementId.modifier");
const routeZone = await import("../../app/routes/_app/zones.$zoneId.modifier");
const routePage = await import("../../app/routes/_partage/page");
const routeObjet = await import("../../app/routes/_partage/objet");
const routeApercu = await import("../../app/routes/_app/partages.$partageId.apercu");
const { PagePartage } = await import("../../app/components/partage/PagePartage");
const { sessionCookie } = await import("../../app/lib/auth/cookie.server");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `n-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zCave] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cave", type: "interieur" }).returning();
  // Un type qui suggère « usage », un qui suggère « technique ».
  const [tUsage] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Prise-${marque}`, champs: [], alias: [], niveauSuggere: 1,
  }).returning();
  const [tTechnique] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Vanne-${marque}`, champs: [], alias: [], niveauSuggere: 2,
  }).returning();

  const jetonSession = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: jetonSession, utilisateurId: u.id, expireLe: new Date(Date.now() + 3600_000) });
  const cookie = (await sessionCookie.serialize(jetonSession)).split(";")[0];

  return { u, p, zCuisine, zCave, tUsage, tTechnique, cookie };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

async function creerPartage(j: Jeu, niveauMax: number, porteeZones: number[] = []) {
  const [lien] = await db.insert(partage).values({
    proprieteId: j.p.id, nom: `Lien ${niveauMax}`, jeton: creerJeton(), niveauMax, porteeZones,
  }).returning();
  return lien;
}

const poster = (url: string, params: Record<string, string>, cookie: string, champs: Record<string, string>) => {
  const corps = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) corps.set(cle, valeur);
  return {
    request: new Request(url, { method: "POST", body: corps, headers: { Cookie: cookie } }),
    params,
  } as unknown as ActionFunctionArgs;
};

const lire = (url: string, params: Record<string, string>, cookie?: string) =>
  ({
    request: new Request(url, cookie ? { headers: { Cookie: cookie } } : undefined),
    params,
  }) as unknown as LoaderFunctionArgs;

describe("le niveau d'un objet se saisit sur la fiche", () => {
  it("un objet posé PAR LA ROUTE au niveau 1 est servi par un lien à plafond 1", async () => {
    const j = await creerJeu();

    const reponse = await routeNouvel.action(poster(
      `http://test/proprietes/${j.p.id}/elements/nouveau`,
      { proprieteId: String(j.p.id) },
      j.cookie,
      { nom: "Prise plan de travail", typeId: String(j.tUsage.id), zoneId: String(j.zCuisine.id), niveau: "1" },
    ));
    expect((reponse as Response).status).toBe(302);

    const [e] = await db.select().from(element).where(eq(element.proprieteId, j.p.id));
    expect(e.niveau).toBe(1);

    // Le critère de l'issue : le lien « usage » le trouve, là où une propriété
    // saisie à la main rendait « Rien à afficher pour ce lien ».
    const lien = await creerPartage(j, 1);
    const page = await routePage.loader(lire(`http://test/p/${lien.jeton}`, { jeton: lien.jeton }));
    if (!page.actif) throw new Error("le partage devrait être actif");
    expect(page.donnees.zones.map((z) => z.nom)).toContain("Cuisine");

    const fiche = await routeObjet.loader(
      lire(`http://test/p/${lien.jeton}/objets/${e.id}`, { jeton: lien.jeton, elementId: String(e.id) }),
    );
    if (!fiche.actif) throw new Error("le partage devrait être actif");
    expect(fiche.fiche.nom).toBe("Prise plan de travail");
  });

  it("un niveau absent du formulaire est refusé, et ne devient pas 0", async () => {
    const j = await creerJeu();

    const cas: Record<string, string>[] = [
      { nom: "Sans niveau", typeId: String(j.tUsage.id), zoneId: String(j.zCuisine.id) },
      { nom: "Niveau vide", typeId: String(j.tUsage.id), zoneId: String(j.zCuisine.id), niveau: "" },
      { nom: "Niveau hors bornes", typeId: String(j.tUsage.id), zoneId: String(j.zCuisine.id), niveau: "4" },
    ];

    for (const champs of cas) {
      const resultat = await routeNouvel.action(poster(
        `http://test/proprietes/${j.p.id}/elements/nouveau`,
        { proprieteId: String(j.p.id) },
        j.cookie,
        champs,
      ));
      expect(resultat).toMatchObject({ erreur: expect.stringContaining("niveau") });
    }

    // Rien n'a été écrit : le refus n'est pas un repli sur « public ».
    expect(await db.select().from(element).where(eq(element.proprieteId, j.p.id))).toHaveLength(0);
  });

  it("un niveau absent à la modification est refusé, et la fiche garde le sien", async () => {
    const j = await creerJeu();
    const [e] = await db.insert(element).values({
      proprieteId: j.p.id, nom: "Chaudière", typeId: j.tTechnique.id, zoneId: j.zCave.id, niveau: 2,
    }).returning();

    const resultat = await routeModifier.action(poster(
      `http://test/proprietes/${j.p.id}/elements/${e.id}/modifier`,
      { proprieteId: String(j.p.id), elementId: String(e.id) },
      j.cookie,
      { nom: "Chaudière", typeId: String(j.tTechnique.id), zoneId: String(j.zCave.id) },
    ));
    expect(resultat).toMatchObject({ erreur: expect.stringContaining("niveau") });

    const [apres] = await db.select().from(element).where(eq(element.id, e.id));
    expect(apres.niveau).toBe(2);
  });

  it("la fiche peut s'écarter de la suggestion du type", async () => {
    const j = await creerJeu();
    await routeNouvel.action(poster(
      `http://test/proprietes/${j.p.id}/elements/nouveau`,
      { proprieteId: String(j.p.id) },
      j.cookie,
      // Un type « usage », un objet que le propriétaire garde en privé.
      { nom: "Prise du coffre", typeId: String(j.tUsage.id), zoneId: String(j.zCuisine.id), niveau: "3" },
    ));

    const [e] = await db.select().from(element).where(eq(element.proprieteId, j.p.id));
    expect(e.niveau).toBe(3);
  });
});

describe("re-nivelage en masse d'une zone", () => {
  it("chiffre l'effet avant de l'écrire, puis ne touche que la zone visée", async () => {
    const j = await creerJeu();
    const [aCuisine] = await db.insert(element).values({
      proprieteId: j.p.id, nom: "Four", typeId: j.tUsage.id, zoneId: j.zCuisine.id, niveau: 3,
    }).returning();
    const [bCuisine] = await db.insert(element).values({
      proprieteId: j.p.id, nom: "Hotte", typeId: j.tUsage.id, zoneId: j.zCuisine.id, niveau: 3,
    }).returning();
    const [cCave] = await db.insert(element).values({
      proprieteId: j.p.id, nom: "Compteur", typeId: j.tTechnique.id, zoneId: j.zCave.id, niveau: 3,
    }).returning();
    const lien = await creerPartage(j, 1);

    const args = { proprieteId: String(j.p.id), zoneId: String(j.zCuisine.id) };
    const url = `http://test/proprietes/${j.p.id}/zones/${j.zCuisine.id}/modifier`;

    const apercu = await routeZone.action(poster(url, args, j.cookie, {
      _action: "niveau-masse-verifier", niveau: "1",
    }));
    expect(apercu).toMatchObject({
      apercuRenivelage: {
        cible: 1,
        total: 2,
        plusVisibles: 2,
        plusMasques: 0,
        partages: [{ id: lien.id, gagnes: 2, perdus: 0 }],
      },
    });

    // Compter n'écrit rien.
    const [avant] = await db.select().from(element).where(eq(element.id, aCuisine.id));
    expect(avant.niveau).toBe(3);

    const applique = await routeZone.action(poster(url, args, j.cookie, {
      _action: "niveau-masse-appliquer", niveau: "1",
    }));
    expect(applique).toMatchObject({ renivele: { cible: 1, ecrits: 2 } });

    const niveaux = await db
      .select({ id: element.id, niveau: element.niveau })
      .from(element)
      .where(eq(element.proprieteId, j.p.id));
    const parId = new Map(niveaux.map((n) => [n.id, n.niveau]));
    expect(parId.get(aCuisine.id)).toBe(1);
    expect(parId.get(bCuisine.id)).toBe(1);
    // La zone d'à côté n'a pas bougé.
    expect(parId.get(cCave.id)).toBe(3);
  });

  it("dit aussi ce qu'un lien CESSE de voir", async () => {
    const j = await creerJeu();
    await db.insert(element).values({
      proprieteId: j.p.id, nom: "Four", typeId: j.tUsage.id, zoneId: j.zCuisine.id, niveau: 1,
    });
    const lien = await creerPartage(j, 1);

    const apercu = await routeZone.action(poster(
      `http://test/proprietes/${j.p.id}/zones/${j.zCuisine.id}/modifier`,
      { proprieteId: String(j.p.id), zoneId: String(j.zCuisine.id) },
      j.cookie,
      { _action: "niveau-masse-verifier", niveau: "2" },
    ));
    expect(apercu).toMatchObject({ apercuRenivelage: { partages: [{ id: lien.id, gagnes: 0, perdus: 1 }] } });
  });

  it("refuse de descendre une zone entière au niveau public", async () => {
    const j = await creerJeu();
    await db.insert(element).values({
      proprieteId: j.p.id, nom: "Four", typeId: j.tUsage.id, zoneId: j.zCuisine.id, niveau: 1,
    });

    const resultat = await routeZone.action(poster(
      `http://test/proprietes/${j.p.id}/zones/${j.zCuisine.id}/modifier`,
      { proprieteId: String(j.p.id), zoneId: String(j.zCuisine.id) },
      j.cookie,
      { _action: "niveau-masse-appliquer", niveau: "0" },
    ));
    expect(resultat).toMatchObject({ erreur: expect.stringContaining("invalide") });

    const [e] = await db.select().from(element).where(eq(element.proprieteId, j.p.id));
    expect(e.niveau).toBe(1);
  });

  it("répond 404 sur une zone d'une autre propriété, et n'écrit rien", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();
    const [chezLautre] = await db.insert(element).values({
      proprieteId: autre.p.id, nom: "Four", typeId: autre.tUsage.id, zoneId: autre.zCuisine.id, niveau: 3,
    }).returning();

    await expect(routeZone.action(poster(
      `http://test/proprietes/${mien.p.id}/zones/${autre.zCuisine.id}/modifier`,
      { proprieteId: String(mien.p.id), zoneId: String(autre.zCuisine.id) },
      mien.cookie,
      { _action: "niveau-masse-appliquer", niveau: "1" },
    ))).rejects.toMatchObject({ status: 404 });

    const [apres] = await db.select().from(element).where(eq(element.id, chezLautre.id));
    expect(apres.niveau).toBe(3);
  });
});

describe("le compte d'objets au-dessus du plafond", () => {
  it("est servi à l'aperçu, et à aucun HTML de /p/:jeton, à aucun plafond", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Four", typeId: j.tUsage.id, zoneId: j.zCuisine.id, niveau: 1 },
      { proprieteId: j.p.id, nom: "Compteur", typeId: j.tTechnique.id, zoneId: j.zCave.id, niveau: 3 },
      { proprieteId: j.p.id, nom: "Gaine", typeId: j.tTechnique.id, zoneId: j.zCave.id, niveau: 3 },
    ]);

    const lien = await creerPartage(j, 1);
    const apercu = await routeApercu.loader(lire(
      `http://test/proprietes/${j.p.id}/partages/${lien.id}/apercu`,
      { proprieteId: String(j.p.id), partageId: String(lien.id) },
      j.cookie,
    ));
    expect(apercu.auDessus.total).toBe(2);
    expect(apercu.auDessus.zones).toEqual([{ id: j.zCave.id, nom: "Cave", total: 2 }]);

    // Et rien de tout ça ne quitte l'écran du propriétaire, quel que soit le
    // plafond : ni dans les données du loader public, ni dans le HTML rendu.
    for (const plafond of [0, 1, 2, 3]) {
      const autre = await creerPartage(j, plafond);
      const page = await routePage.loader(lire(`http://test/p/${autre.jeton}`, { jeton: autre.jeton }));
      if (!page.actif) throw new Error("le partage devrait être actif");
      expect(JSON.stringify(page.donnees)).not.toContain("auDessus");

      const html = renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: ["/p/x"] },
          createElement(PagePartage, { donnees: page.donnees, jeton: page.jeton })),
      );
      expect(html).not.toContain("au-dessus du plafond");
      expect(html).not.toContain("/zones/");
    }
  });

  it("ne compte que ce que la portée du lien couvre", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Compteur", typeId: j.tTechnique.id, zoneId: j.zCave.id, niveau: 3 },
      { proprieteId: j.p.id, nom: "Four", typeId: j.tUsage.id, zoneId: j.zCuisine.id, niveau: 3 },
    ]);

    // Un lien limité à la cuisine : la cave est hors de sa portée, et lui
    // annoncer des objets masqués qu'il ne verrait jamais serait un faux compte.
    const lien = await creerPartage(j, 1, [j.zCuisine.id]);
    const apercu = await routeApercu.loader(lire(
      `http://test/proprietes/${j.p.id}/partages/${lien.id}/apercu`,
      { proprieteId: String(j.p.id), partageId: String(lien.id) },
      j.cookie,
    ));
    expect(apercu.auDessus.zones).toEqual([{ id: j.zCuisine.id, nom: "Cuisine", total: 1 }]);
  });

  it("est vide sur un lien à plafond 3, qui ne masque rien", async () => {
    const j = await creerJeu();
    await db.insert(element).values({
      proprieteId: j.p.id, nom: "Compteur", typeId: j.tTechnique.id, zoneId: j.zCave.id, niveau: 3,
    });

    const lien = await creerPartage(j, 3);
    const apercu = await routeApercu.loader(lire(
      `http://test/proprietes/${j.p.id}/partages/${lien.id}/apercu`,
      { proprieteId: String(j.p.id), partageId: String(lien.id) },
      j.cookie,
    ));
    expect(apercu.auDessus).toEqual({ total: 0, zones: [] });
  });
});
