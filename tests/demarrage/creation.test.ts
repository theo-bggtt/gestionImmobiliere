// tests/demarrage/creation.test.ts
// L'écriture du squelette : ce qui entre en base, une seule fois, et rien
// avant la confirmation.
import { describe, it, expect, beforeEach } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone } from "../../app/db/schema/index";
import { ecrireSquelette, proprieteEstVierge } from "../../app/lib/demarrage/creation.server";
import { composerSquelette } from "../../app/lib/demarrage/squelette";
import type { SquelettePropose } from "../../app/lib/demarrage/types";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

async function creerPropriete() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `d-${marque}@x.local`, motDePasseHash: "x" }).returning();
  // Le nom n'est jamais l'adresse : c'est le `<h1>` de la page de partage.
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Chez moi" }).returning();
  return p;
}

const REPONSES = {
  forme: "maison" as const,
  niveauxHabitables: 2,
  sousSol: true,
  combles: false,
  garage: true,
  exterieur: true,
};

async function structureDe(proprieteId: number) {
  const batiments = await db.select().from(batiment).where(eq(batiment.proprieteId, proprieteId)).orderBy(asc(batiment.ordre));
  const zones = await db.select().from(zone).where(eq(zone.proprieteId, proprieteId));
  const niveaux = await db
    .select({ id: niveau.id, nom: niveau.nom, ordinal: niveau.ordinal, ordre: niveau.ordre, batimentId: niveau.batimentId })
    .from(niveau)
    .innerJoin(batiment, eq(niveau.batimentId, batiment.id))
    .where(eq(batiment.proprieteId, proprieteId))
    .orderBy(asc(niveau.ordinal));
  return { batiments, niveaux, zones };
}

describe("ecrireSquelette", () => {
  it("écrit bâtiments, niveaux et zones en une fois", async () => {
    const p = await creerPropriete();
    const resultat = await ecrireSquelette(p.id, composerSquelette(REPONSES));

    expect(resultat.statut).toBe("cree");
    const { batiments, niveaux, zones } = await structureDe(p.id);
    expect(batiments).toHaveLength(2);          // maison + garage
    expect(niveaux.length).toBeGreaterThan(0);
    expect(zones.length).toBeGreaterThan(0);
  });

  it("range les niveaux par ordinal signé, et fait suivre `ordre`", async () => {
    const p = await creerPropriete();
    await ecrireSquelette(p.id, composerSquelette({ ...REPONSES, niveauxHabitables: 3, combles: true }));

    const { batiments, niveaux } = await structureDe(p.id);
    const principal = batiments.find((b) => b.type === "principal")!;
    const duPrincipal = niveaux.filter((n) => n.batimentId === principal.id);

    expect(duPrincipal.map((n) => n.ordinal)).toEqual([-1, 0, 1, 2, 3]);
    // `ordre` raconte la même histoire que l'ordinal, sinon les deux colonnes
    // se contrediraient dans un sélecteur d'étage.
    expect(duPrincipal.map((n) => n.ordre)).toEqual([0, 1, 2, 3, 4]);
  });

  it("écrit les zones extérieures avec `niveau_id` nul", async () => {
    const p = await creerPropriete();
    await ecrireSquelette(p.id, composerSquelette(REPONSES));

    const exterieures = (await structureDe(p.id)).zones.filter((z) => z.niveauId === null);
    expect(exterieures.length).toBeGreaterThan(0);
    expect(exterieures.every((z) => z.type === "exterieur")).toBe(true);
    // Sans elles, le partage au jardinier n'a rien à montrer.
    expect(exterieures.map((z) => z.nom).sort()).toEqual(["Jardin", "Terrasse"]);
  });

  it("rattache toute zone intérieure à un niveau", async () => {
    const p = await creerPropriete();
    await ecrireSquelette(p.id, composerSquelette(REPONSES));

    const zones = (await structureDe(p.id)).zones;
    expect(zones.filter((z) => z.type !== "exterieur").every((z) => z.niveauId !== null)).toBe(true);
  });

  it("ne duplique pas quand on rejoue", async () => {
    const p = await creerPropriete();
    const squelette = composerSquelette(REPONSES);

    const premier = await ecrireSquelette(p.id, squelette);
    const second = await ecrireSquelette(p.id, squelette);

    expect(premier.statut).toBe("cree");
    expect(second).toEqual({ statut: "deja-structuree" });

    const apres = await structureDe(p.id);
    expect(apres.batiments).toHaveLength(2);
    expect(apres.zones).toHaveLength(premier.statut === "cree" ? premier.zones : -1);
  });

  it("résiste à deux soumissions concurrentes (le double-clic)", async () => {
    const p = await creerPropriete();
    const squelette = composerSquelette(REPONSES);

    // Sans le FOR UPDATE, les deux transactions lisent zéro bâtiment et
    // écrivent chacune un squelette complet.
    const [a, b] = await Promise.all([
      ecrireSquelette(p.id, squelette),
      ecrireSquelette(p.id, squelette),
    ]);

    const statuts = [a.statut, b.statut].sort();
    expect(statuts).toEqual(["cree", "deja-structuree"]);
    expect((await structureDe(p.id)).batiments).toHaveLength(2);
  });

  it("refuse d'écrire sur une propriété déjà structurée à la main", async () => {
    const p = await creerPropriete();
    const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
    await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 });

    expect(await ecrireSquelette(p.id, composerSquelette(REPONSES))).toEqual({ statut: "deja-structuree" });
    expect((await structureDe(p.id)).batiments).toHaveLength(1);
  });

  it("refuse aussi quand seule une zone existe", async () => {
    const p = await creerPropriete();
    await db.insert(zone).values({ proprieteId: p.id, niveauId: null, nom: "Jardin", type: "exterieur" });

    expect(await ecrireSquelette(p.id, composerSquelette(REPONSES))).toEqual({ statut: "deja-structuree" });
  });

  it("n'écrit rien du tout quand la structure est invalide", async () => {
    const p = await creerPropriete();

    const casInvalides: unknown[] = [
      { batiments: [], zonesExterieures: [] },
      { batiments: [{ nom: "", type: "principal", niveaux: [] }], zonesExterieures: [] },
      { batiments: [{ nom: "M", type: "chateau", niveaux: [] }], zonesExterieures: [] },
      { batiments: [{ nom: "M", type: "principal", niveaux: [{ nom: "Rez", ordinal: 1.5, zones: [] }] }], zonesExterieures: [] },
      { batiments: [{ nom: "M", type: "principal", niveaux: [{ nom: "Rez", ordinal: 0, zones: [{ nom: "X", type: "cave" }] }] }], zonesExterieures: [] },
      { batiments: "non", zonesExterieures: [] },
      null,
    ];

    for (const cas of casInvalides) {
      const resultat = await ecrireSquelette(p.id, cas);
      expect(resultat.statut).toBe("invalide");
    }
    expect((await structureDe(p.id)).batiments).toHaveLength(0);
    expect(await proprieteEstVierge(p.id)).toBe(true);
  });

  it("accepte un ordinal négatif mais borne les excentricités", async () => {
    const p = await creerPropriete();
    const horsBornes: SquelettePropose = {
      batiments: [{ cle: "b", nom: "M", type: "principal", niveaux: [{ cle: "n", nom: "Abysse", ordinal: -999, zones: [] }] }],
      zonesExterieures: [{ cle: "z", nom: "Jardin", type: "exterieur" }],
    };
    expect((await ecrireSquelette(p.id, horsBornes)).statut).toBe("invalide");
  });

  it("tronque les noms trop longs en les refusant, plutôt qu'en les coupant", async () => {
    const p = await creerPropriete();
    const tropLong: SquelettePropose = {
      batiments: [],
      zonesExterieures: [{ cle: "z", nom: "j".repeat(200), type: "exterieur" }],
    };
    expect((await ecrireSquelette(p.id, tropLong)).statut).toBe("invalide");
  });

  it("n'écrit que dans la propriété visée", async () => {
    const a = await creerPropriete();
    const b = await creerPropriete();
    await ecrireSquelette(a.id, composerSquelette(REPONSES));

    expect((await structureDe(b.id)).batiments).toHaveLength(0);
    expect(await proprieteEstVierge(b.id)).toBe(true);
  });
});

describe("proprieteEstVierge", () => {
  it("est vrai sur une propriété neuve, faux dès qu'une structure existe", async () => {
    const p = await creerPropriete();
    expect(await proprieteEstVierge(p.id)).toBe(true);

    await ecrireSquelette(p.id, composerSquelette(REPONSES));
    expect(await proprieteEstVierge(p.id)).toBe(false);
  });

  it("est faux dès qu'une seule zone extérieure existe", async () => {
    const p = await creerPropriete();
    await db.insert(zone).values({ proprieteId: p.id, niveauId: null, nom: "Terrasse", type: "exterieur" });
    expect(await proprieteEstVierge(p.id)).toBe(false);
  });
});
