// tests/historique/garanties.test.ts
// La garantie est l'inverse de l'événement : elle pend à UN élément, et
// `garantie.element_id` est NOT NULL. Sa visibilité EST celle de son élément,
// il n'y a pas de seconde règle à écrire.
//
// Ce fichier tient trois choses : que l'héritage marche vraiment (et pas « par
// construction, l'appelant a déjà vérifié »), que ce qui ne doit pas sortir ne
// sort pas, et que le CHECK en base refuse ce que le formulaire refuse déjà.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element, garantie,
} from "../../app/db/schema/index";
import {
  chargerEcheances,
  chargerGarantiesDeLElement,
  chargerGarantiesProprietaire,
  chargerGarantieOu404,
  creerGarantie,
  lireSaisieGarantie,
} from "../../app/lib/historique/garanties.server";
import { PORTEE_PROPRIETAIRE, type Portee } from "../../app/lib/recherche/recherche.server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `g-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();

  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique" }).returning();
  const [sEau] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Sanitaire" }).returning();

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();

  const [eInduction] = await db.insert(element).values({
    proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: zCuisine.id, niveau: 0,
  }).returning();
  const [eChaudiere] = await db.insert(element).values({
    proprieteId: p.id, nom: "Chaudiere", typeId: t.id, zoneId: zTechnique.id, systemeId: sEau.id, niveau: 0,
  }).returning();

  // Une garantie en cours sur la chaudière, avec référence : c'est elle qui
  // sert à vérifier ce qui ne sort pas.
  const [gChaudiere] = await db.insert(garantie).values({
    elementId: eChaudiere.id, debut: "2024-01-01", fin: "2099-01-01", reference: "CONTRAT-DUPONT-4471",
  }).returning();
  // Une expirée, et une sans terme : les deux bords de `fin`.
  const [gExpiree] = await db.insert(garantie).values({
    elementId: eInduction.id, debut: "2019-01-01", fin: "2021-01-01", reference: "VIEUX-CONTRAT",
  }).returning();
  const [gSansTerme] = await db.insert(garantie).values({
    elementId: eInduction.id, debut: "2020-06-01", fin: null,
  }).returning();

  return { p, zCuisine, zTechnique, sEau, eInduction, eChaudiere, gChaudiere, gExpiree, gSansTerme };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

describe("la garantie hérite de la visibilité de son élément", () => {
  it("une garantie sur un objet hors portée n'est pas servie", async () => {
    const j = await creerJeu();
    // Portée sur la cuisine seule : la chaudière est dans le local technique.
    const portee: Portee = { niveauMax: 3, zones: [j.zCuisine.id], systemes: null };
    const rendues = await chargerGarantiesDeLElement(j.p.id, j.eChaudiere.id, portee);
    expect(rendues).toEqual([]);
  });

  it("la même garantie est servie quand l'objet passe", async () => {
    const j = await creerJeu();
    const portee: Portee = { niveauMax: 3, zones: [j.zTechnique.id], systemes: null };
    const rendues = await chargerGarantiesDeLElement(j.p.id, j.eChaudiere.id, portee);
    expect(rendues.map((g) => g.id)).toEqual([j.gChaudiere.id]);
  });

  it("le plafond de l'objet compte aussi, pas seulement sa zone", async () => {
    const j = await creerJeu();
    // On remonte l'objet au-dessus du plafond du lien : la garantie suit.
    await db.execute(sql`UPDATE element SET niveau = 3 WHERE id = ${j.eChaudiere.id}`);
    const portee: Portee = { niveauMax: 1, zones: null, systemes: null };
    expect(await chargerGarantiesDeLElement(j.p.id, j.eChaudiere.id, portee)).toEqual([]);
    // Et le propriétaire, lui, la voit toujours.
    expect(await chargerGarantiesDeLElement(j.p.id, j.eChaudiere.id, PORTEE_PROPRIETAIRE)).toHaveLength(1);
  });

  it("une garantie d'une autre propriété ne se charge pas par son identifiant", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    // 404 et non 403 : un 403 confirmerait qu'elle existe (règle #4).
    await expect(chargerGarantieOu404(j.p.id, autre.gChaudiere.id)).rejects.toMatchObject({ status: 404 });
    await expect(chargerGarantieOu404(j.p.id, j.gChaudiere.id)).resolves.toMatchObject({ id: j.gChaudiere.id });
  });

  it("créer une garantie sur un objet d'une autre propriété lève 404", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    await expect(
      creerGarantie(j.p.id, autre.eChaudiere.id, { debut: "2026-01-01", fin: null, reference: null }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("ce qu'une garantie ne montre pas à un lien", () => {
  it("ni la référence ni le document ne sont dans la charge servie", async () => {
    const j = await creerJeu();
    // La référence est bien en base : sans ça le test passerait pour la
    // mauvaise raison — il ne trouverait rien parce qu'il n'y a rien.
    const enBase = await db.execute<{ reference: string }>(sql`
      SELECT reference FROM garantie WHERE id = ${j.gChaudiere.id}
    `);
    expect(enBase.rows[0].reference).toBe("CONTRAT-DUPONT-4471");

    const portee: Portee = { niveauMax: 3, zones: [j.zTechnique.id], systemes: null };
    const serialise = JSON.stringify(await chargerGarantiesDeLElement(j.p.id, j.eChaudiere.id, portee));
    expect(serialise).not.toContain("CONTRAT-DUPONT-4471");
    expect(serialise).not.toContain("reference");
    expect(serialise).not.toContain("fichierId");
  });

  it("le propriétaire, lui, voit la référence sur son écran", async () => {
    const j = await creerJeu();
    const siennes = await chargerGarantiesProprietaire(j.p.id, j.eChaudiere.id);
    expect(siennes[0].reference).toBe("CONTRAT-DUPONT-4471");
  });
});

describe("expiration et échéances", () => {
  it("`expiree` est calculée en base, pas déduite par l'écran", async () => {
    const j = await creerJeu();
    const surInduction = await chargerGarantiesProprietaire(j.p.id, j.eInduction.id);
    const parId = new Map(surInduction.map((g) => [g.id, g]));
    expect(parId.get(j.gExpiree.id)?.expiree).toBe(true);
    // Sans terme n'est PAS expirée : `fin IS NULL` n'échoit jamais.
    expect(parId.get(j.gSansTerme.id)?.expiree).toBe(false);
    expect(parId.get(j.gSansTerme.id)?.fin).toBeNull();
  });

  it("les échéances excluent les garanties sans terme et gardent les expirées", async () => {
    const j = await creerJeu();
    const echeances = await chargerEcheances(j.p.id);
    const ids = echeances.map((g) => g.id);

    // Sans terme : rien à échoir, donc rien à faire dans une liste d'échéances.
    expect(ids).not.toContain(j.gSansTerme.id);
    // Expirée : gardée, et en tête puisque le tri est croissant sur `fin`.
    expect(ids[0]).toBe(j.gExpiree.id);
    expect(ids).toContain(j.gChaudiere.id);
  });

  it("les échéances ne débordent pas sur une autre propriété", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    const ids = (await chargerEcheances(j.p.id)).map((g) => g.id);
    expect(ids).not.toContain(autre.gChaudiere.id);
  });
});

describe("les bornes de dates", () => {
  it("le formulaire refuse une fin avant le début", () => {
    const form = new FormData();
    form.set("debut", "2026-05-01");
    form.set("fin", "2026-04-01");
    const lu = lireSaisieGarantie(form);
    expect(lu.ok).toBe(false);
  });

  it("et la base refuse aussi, parce que le formulaire n'est pas la garantie", async () => {
    const j = await creerJeu();
    // SQL brut, pas l'ORM : l'insertion contourne `lireSaisieGarantie`, et
    // c'est tout l'intérêt — une route qui oublierait de valider ne doit pas
    // pouvoir écrire la ligne. Le nom de la contrainte est vérifié sur la
    // cause : drizzle enveloppe l'erreur de PostgreSQL dans la sienne.
    const insertion = db.execute(sql`
      INSERT INTO garantie (element_id, debut, fin)
      VALUES (${j.eChaudiere.id}, DATE '2026-05-01', DATE '2026-04-01')
    `);
    await expect(insertion).rejects.toThrow();
    const erreur = await insertion.catch((e: unknown) => e);
    expect(JSON.stringify({ ...(erreur as object), cause: String((erreur as Error).cause) }))
      .toContain("garantie_fin_apres_debut");
  });

  it("une garantie sans terme passe le CHECK", async () => {
    const j = await creerJeu();
    await expect(
      db.execute(sql`
        INSERT INTO garantie (element_id, debut, fin)
        VALUES (${j.eChaudiere.id}, DATE '2026-05-01', NULL)
      `),
    ).resolves.toBeDefined();
  });

  it("une date qui n'en est pas une est refusée avant d'atteindre la base", () => {
    const form = new FormData();
    form.set("debut", "hier");
    expect(lireSaisieGarantie(form).ok).toBe(false);
  });
});

describe("le jeu vu du propriétaire", () => {
  it("les garanties d'un objet remontent toutes, sans terme comprise", async () => {
    const j: Jeu = await creerJeu();
    const siennes = await chargerGarantiesProprietaire(j.p.id, j.eInduction.id);
    expect(siennes.map((g) => g.id).sort()).toEqual([j.gExpiree.id, j.gSansTerme.id].sort());
    expect(siennes[0].elementNom).toBe("Induction");
    expect(siennes[0].zoneNom).toBe("Cuisine");
  });
});
