// tests/historique/pagination.test.ts
// La pagination de la chronologie. Deux choses sont vérifiées, et la seconde
// est la seule qui puisse fuir :
//
//   - le 51e événement est atteignable, des deux côtés, par un LIEN — la page
//     de partage ne charge aucun script, donc c'est la seule forme possible ;
//   - le nombre de pages et le total sont ceux du fonds VISIBLE. La pagination
//     serait sinon un second moyen d'apprendre combien d'événements existent
//     hors portée, exactement ce que la pastille de type interdit déjà.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element,
  evenement, evenementElement, partage, session,
} from "../../app/db/schema/index";
import { creerJeton } from "../../app/lib/partage/partage.server";
import { PAR_PAGE, lirePage, nombreDePages, urlChronologie } from "../../app/lib/historique/pagination";
import type { TypeEvenement } from "../../app/lib/historique/types";
import { PageHistorique } from "../../app/components/partage/PageHistorique";
import { FiltreTypes } from "../../app/components/historique/FiltreTypes";
import { Pagination } from "../../app/components/historique/Pagination";

const routeHistoriquePartage = await import("../../app/routes/_partage/historique");
const routeChronologie = await import("../../app/routes/_app/evenements._index");
const { sessionCookie } = await import("../../app/lib/auth/cookie.server");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

/** Le jour de rang `i`, pour que le tri décroissant soit prévisible. */
const jour = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);

/**
 * `VISIBLES` événements liés à la cuisine, `CACHES` liés au local technique.
 * Le lien porte sur la cuisine : il en voit exactement `VISIBLES`, ce qui
 * fait deux pages là où le propriétaire en a trois.
 */
const VISIBLES = PAR_PAGE + 10;
const CACHES = PAR_PAGE + 10;

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `pg-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique" }).returning();

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();
  const [eCuisine] = await db.insert(element).values({
    proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: zCuisine.id, niveau: 0,
  }).returning();
  const [eTechnique] = await db.insert(element).values({
    proprieteId: p.id, nom: "Chaudiere", typeId: t.id, zoneId: zTechnique.id, niveau: 0,
  }).returning();

  // Les plus récents sont les visibles : la première page du propriétaire est
  // donc entièrement faite d'événements que le lien voit aussi, et le test des
  // pages suivantes ne se réduit pas à un tri qui trierait bien par hasard.
  const visibles = await db.insert(evenement).values(
    Array.from({ length: VISIBLES }, (_, i) => ({
      proprieteId: p.id, titre: `Entretien cuisine ${i}`, dateDebut: jour(1000 + i),
      type: "entretien" as const, niveau: 0,
    })),
  ).returning();
  const caches = await db.insert(evenement).values(
    Array.from({ length: CACHES }, (_, i) => ({
      proprieteId: p.id, titre: `Chantier technique ${i}`, dateDebut: jour(i),
      type: "reparation" as const, niveau: 0,
    })),
  ).returning();

  await db.insert(evenementElement).values([
    ...visibles.map((ev) => ({ evenementId: ev.id, elementId: eCuisine.id })),
    ...caches.map((ev) => ({ evenementId: ev.id, elementId: eTechnique.id })),
  ]);

  const jeton = creerJeton();
  await db.insert(partage).values({
    proprieteId: p.id, nom: "Locataires", jeton, niveauMax: 1, porteeZones: [zCuisine.id],
  });

  const cookieJeton = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: cookieJeton, utilisateurId: u.id, expireLe: new Date(Date.now() + 3600_000) });
  const cookie = (await sessionCookie.serialize(cookieJeton)).split(";")[0];

  return { u, p, jeton, cookie };
}

const args = (url: string, params: Record<string, string>, cookie?: string) =>
  ({
    request: new Request(url, cookie ? { headers: { Cookie: cookie } } : undefined),
    params,
  }) as unknown as LoaderFunctionArgs;

describe("les URL de pagination", () => {
  it("n'écrit jamais `page=1` : le filtre remet à la première page en l'omettant", () => {
    expect(urlChronologie("/p/x/historique", [])).toBe("/p/x/historique");
    expect(urlChronologie("/p/x/historique", ["entretien"])).toBe("/p/x/historique?type=entretien");
    expect(urlChronologie("/p/x/historique", [], 1)).toBe("/p/x/historique");
  });

  it("conserve le filtre par type dans un lien de page", () => {
    expect(urlChronologie("/h", ["entretien", "sinistre"], 3)).toBe("/h?type=entretien&type=sinistre&page=3");
  });

  it("ramène une page bricolée à la première au lieu de refuser la page", () => {
    for (const brut of ["-3", "0", "abc", "", "1.5", "3,5", null]) expect(lirePage(brut)).toBe(1);
    expect(lirePage("2")).toBe(2);
    // Un entier énorme n'est PAS ramené ici : `lirePage` ne connaît pas le
    // total. C'est `chargerChronologie` qui le borne, après comptage.
    expect(lirePage("1000000000")).toBe(1_000_000_000);
  });

  it("compte au moins une page, même sur un fonds vide", () => {
    expect(nombreDePages(0)).toBe(1);
    expect(nombreDePages(PAR_PAGE)).toBe(1);
    expect(nombreDePages(PAR_PAGE + 1)).toBe(2);
  });
});

describe("la chronologie du propriétaire", () => {
  const total = VISIBLES + CACHES;
  const pages = nombreDePages(total);

  it("sert la première page et annonce les suivantes", async () => {
    const j = await creerJeu();
    const d = await routeChronologie.loader(
      args(`http://test/proprietes/${j.p.id}/evenements`, { proprieteId: String(j.p.id) }, j.cookie),
    );
    expect(d.evenements).toHaveLength(PAR_PAGE);
    expect(d.total).toBe(total);
    expect({ page: d.page, pages: d.pages }).toEqual({ page: 1, pages });
  });

  it("rend le 51e événement atteignable", async () => {
    const j = await creerJeu();
    const un = await routeChronologie.loader(
      args(`http://test/proprietes/${j.p.id}/evenements`, { proprieteId: String(j.p.id) }, j.cookie),
    );
    const deux = await routeChronologie.loader(
      args(`http://test/proprietes/${j.p.id}/evenements?page=2`, { proprieteId: String(j.p.id) }, j.cookie),
    );

    expect(deux.page).toBe(2);
    expect(deux.evenements[0].titre).toBe(`Entretien cuisine ${VISIBLES - 1 - PAR_PAGE}`);
    // Aucun recouvrement : la page 2 commence là où la page 1 s'arrête.
    const vus = new Set(un.evenements.map((e) => e.id));
    expect(deux.evenements.some((e) => vus.has(e.id))).toBe(false);
  });

  it("ramène une page au-delà du total sans perdre le compte", async () => {
    const j = await creerJeu();
    const d = await routeChronologie.loader(
      args(`http://test/proprietes/${j.p.id}/evenements?page=999`, { proprieteId: String(j.p.id) }, j.cookie),
    );
    // Le `count(*) OVER ()` d'avant ne rendait aucune ligne au-delà de la
    // dernière page, donc aucun total : « 240 événements » devenait
    // « Aucun événement » sur une URL tapée à la main.
    expect(d.page).toBe(pages);
    expect(d.total).toBe(total);
    expect(d.evenements.length).toBeGreaterThan(0);
  });

  it("pagine le fonds filtré par type, et le filtre borne le nombre de pages", async () => {
    const j = await creerJeu();
    const d = await routeChronologie.loader(
      args(`http://test/proprietes/${j.p.id}/evenements?type=entretien&page=2`, { proprieteId: String(j.p.id) }, j.cookie),
    );
    expect(d.total).toBe(VISIBLES);
    expect(d.pages).toBe(nombreDePages(VISIBLES));
    expect(d.evenements.every((e) => e.type === "entretien")).toBe(true);
  });
});

describe("la chronologie d'un lien de partage", () => {
  it("ne pagine que le fonds visible, jamais le fonds", async () => {
    const j = await creerJeu();
    const d = await routeHistoriquePartage.loader(args(`http://test/p/${j.jeton}/historique`, { jeton: j.jeton }));
    if (!d.actif) throw new Error("lien inactif");

    // Le propriétaire a VISIBLES + CACHES événements et une page de plus. Ni
    // le total ni le nombre de pages ne doivent le laisser deviner.
    expect(d.historique.total).toBe(VISIBLES);
    expect(d.historique.pages).toBe(nombreDePages(VISIBLES));
    expect(JSON.stringify(d)).not.toContain("Chantier technique");
  });

  it("sert la dernière page visible, et rien au-delà", async () => {
    const j = await creerJeu();
    const derniere = nombreDePages(VISIBLES);
    const d = await routeHistoriquePartage.loader(
      args(`http://test/p/${j.jeton}/historique?page=${derniere}`, { jeton: j.jeton }),
    );
    if (!d.actif) throw new Error("lien inactif");

    expect(d.historique.page).toBe(derniere);
    expect(d.historique.evenements).toHaveLength(VISIBLES - PAR_PAGE * (derniere - 1));
    expect(d.historique.evenements.every((e) => e.titre.startsWith("Entretien cuisine"))).toBe(true);
  });

  it("ramène une page hors bornes dans la portée du lien", async () => {
    const j = await creerJeu();
    const d = await routeHistoriquePartage.loader(
      args(`http://test/p/${j.jeton}/historique?page=999`, { jeton: j.jeton }),
    );
    if (!d.actif) throw new Error("lien inactif");
    expect(d.historique.page).toBe(nombreDePages(VISIBLES));
    expect(JSON.stringify(d)).not.toContain("Chantier technique");
  });
});

describe("HTML servi au destinataire", () => {
  const rendre = <P extends object>(Composant: ComponentType<P>, props: P) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/p/x"] }, createElement(Composant, props)),
    );

  it("la pagination est faite d'ancres, jamais de boutons", async () => {
    const j = await creerJeu();
    const d = await routeHistoriquePartage.loader(args(`http://test/p/${j.jeton}/historique`, { jeton: j.jeton }));
    if (!d.actif) throw new Error("lien inactif");

    const html = rendre(PageHistorique, { historique: d.historique, jeton: j.jeton });
    expect(html).toContain(`href="/p/${j.jeton}/historique?page=2"`);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("/proprietes/");
  });

  it("un lien de page conserve le filtre, un lien de filtre repart de la première page", () => {
    const types: TypeEvenement[] = ["entretien"];
    const avecPage = rendre(Pagination, { base: "/h", types, page: 2, pages: 4 });
    // Le retour vers la page 1 s'écrit sans `page` : c'est la même URL que le
    // filtre seul, donc une seule adresse pour un seul écran.
    expect(avecPage).toContain('href="/h?type=entretien"');
    expect(avecPage).toContain('href="/h?type=entretien&amp;page=3"');

    const filtres = rendre(FiltreTypes, {
      base: "/h",
      facettes: [{ type: "entretien" as const, compte: 3 }],
      actifs: [],
    });
    expect(filtres).toContain('href="/h?type=entretien"');
    expect(filtres).not.toContain("page=");
  });

  it("ne rend aucune pagination quand tout tient sur une page", () => {
    expect(rendre(Pagination, { base: "/h", types: [] as TypeEvenement[], page: 1, pages: 1 })).toBe("");
  });
});
