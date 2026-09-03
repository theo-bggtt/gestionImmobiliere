// tests/recherche/requete.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element,
  fichier, fichierLien,
} from "../../app/db/schema/index";
import { rechercher, chargerFacettes, chargerZonesVignettes, PORTEE_PROPRIETAIRE } from "../../app/lib/recherche/recherche.server";

// DELETE et non TRUNCATE ... CASCADE : TRUNCATE vide toute table qui
// RÉFÉRENCE la cible, y compris type_element, dont les lignes système
// (propriete_id NULL) sont le catalogue chargé une fois par le setup. Un
// DELETE ne suit que les cascades de lignes, le catalogue survit.
beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

/**
 * Un jeu minimal mais complet : deux bâtiments n'apporteraient rien ici, une
 * zone extérieure si — c'est le seul cas de niveauId nul, et la grille de
 * l'accueil doit la ranger en fin de liste.
 */
async function creerJeu() {
  const [u] = await db.insert(utilisateur).values({ email: `r-${Date.now()}-${Math.random()}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test recherche" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Cave", ordinal: -1 }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique", ordre: 0 }).returning();
  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur", ordre: 1 }).returning();
  const [zJardin] = await db.insert(zone).values({ proprieteId: p.id, niveauId: null, nom: "Jardin", type: "exterieur" }).returning();
  const [sEau] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Sanitaire" }).returning();
  const [sElec] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Electricite" }).returning();

  // Chargé une fois pour toutes par tests/setup/test-db.ts.
  const [tVanne] = await db.select().from(typeElement)
    .where(and(eq(typeElement.nom, "Vanne d'arrêt"), eq(typeElement.origine, "systeme")));
  expect(tVanne, "le catalogue de test doit contenir « Vanne d'arrêt »").toBeDefined();

  const [tGeneri] = await db.insert(typeElement).values({
    origine: "systeme", nom: `Objet-${Date.now()}-${Math.random()}`, champs: [], alias: [],
  }).returning();

  return { p, b, n, zTechnique, zCuisine, zJardin, sEau, sElec, tVanne, tGeneri };
}

describe("requête de recherche", () => {
  it("« robinet » remonte la vanne d'arrêt, étiquetée « alias »", async () => {
    const j = await creerJeu();
    await db.insert(element).values({
      proprieteId: j.p.id, nom: "Arrivee generale", typeId: j.tVanne.id, zoneId: j.zTechnique.id,
    });

    const r = await rechercher({ proprieteId: j.p.id, q: "robinet" });

    expect(r.total).toBe(1);
    expect(r.resultats[0].nom).toBe("Arrivee generale");
    expect(r.resultats[0].motif).toBe("alias");
  });

  it("l'accent et le pluriel ne changent pas le résultat", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Éclairage terrasse", typeId: j.tGeneri.id, zoneId: j.zJardin.id },
      { proprieteId: j.p.id, nom: "Vanne de purge", typeId: j.tGeneri.id, zoneId: j.zTechnique.id },
    ]);

    for (const q of ["eclairage", "éclairage", "Eclairages"]) {
      const r = await rechercher({ proprieteId: j.p.id, q });
      expect(r.resultats.map((x) => x.nom), `q=${q}`).toEqual(["Éclairage terrasse"]);
    }
    // Le pluriel passe par le stemmer, pas par unaccent : les deux doivent
    // tenir ensemble pour que « vannes » remonte « Vanne de purge ».
    const pluriel = await rechercher({ proprieteId: j.p.id, q: "vannes" });
    expect(pluriel.resultats.map((x) => x.nom)).toContain("Vanne de purge");
  });

  it("classe la correspondance sur le nom avant celle sur les détails", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      // Le mot n'apparaît QUE dans les détails.
      { proprieteId: j.p.id, nom: "Poele a bois", typeId: j.tGeneri.id, zoneId: j.zCuisine.id, details: { note: "cheminee tubee en 2019" } },
      // Le mot est dans le nom.
      { proprieteId: j.p.id, nom: "Cheminee du salon", typeId: j.tGeneri.id, zoneId: j.zCuisine.id },
    ]);

    const r = await rechercher({ proprieteId: j.p.id, q: "cheminee" });

    expect(r.resultats.map((x) => x.nom)).toEqual(["Cheminee du salon", "Poele a bois"]);
    expect(r.resultats.map((x) => x.motif)).toEqual(["nom", "details"]);
  });

  it("étiquette le motif par la source la plus spécifique", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Objet A", typeId: j.tGeneri.id, zoneId: j.zCuisine.id },
      { proprieteId: j.p.id, nom: "Objet B", typeId: j.tGeneri.id, zoneId: j.zTechnique.id, systemeId: j.sEau.id },
    ]);

    const parZone = await rechercher({ proprieteId: j.p.id, q: "cuisine" });
    expect(parZone.resultats.map((x) => [x.nom, x.motif])).toEqual([["Objet A", "zone"]]);

    const parSysteme = await rechercher({ proprieteId: j.p.id, q: "sanitaire" });
    expect(parSysteme.resultats.map((x) => [x.nom, x.motif])).toEqual([["Objet B", "systeme"]]);
  });

  it("ramène la zone, son chemin, le type, le système et la vignette la plus récente", async () => {
    const j = await creerJeu();
    const [e] = await db.insert(element).values({
      proprieteId: j.p.id, nom: "Compteur unique", typeId: j.tGeneri.id, zoneId: j.zTechnique.id, systemeId: j.sElec.id,
    }).returning();

    const [vieille] = await db.insert(fichier).values({
      proprieteId: j.p.id, chemin: "a.jpg", typeMime: "image/jpeg", taille: 1,
      datePrise: new Date("2024-01-01"), zoneId: j.zTechnique.id,
    }).returning();
    const [recente] = await db.insert(fichier).values({
      proprieteId: j.p.id, chemin: "b.jpg", typeMime: "image/jpeg", taille: 1,
      datePrise: new Date("2025-06-01"), zoneId: j.zTechnique.id,
    }).returning();
    await db.insert(fichierLien).values([
      { fichierId: vieille.id, cibleType: "element", cibleId: e.id },
      { fichierId: recente.id, cibleType: "element", cibleId: e.id },
    ]);

    const [r] = (await rechercher({ proprieteId: j.p.id, q: "compteur" })).resultats;

    expect(r.zoneNom).toBe("Local technique");
    expect(r.zoneChemin).toBe("Maison · Cave");
    expect(r.systemeNom).toBe("Electricite");
    expect(r.typeNom).toBe(j.tGeneri.nom);
    expect(r.fichierId).toBe(recente.id);
  });

  it("dit « Extérieur » pour une zone sans niveau", async () => {
    const j = await creerJeu();
    await db.insert(element).values({ proprieteId: j.p.id, nom: "Portail", typeId: j.tGeneri.id, zoneId: j.zJardin.id });

    const [r] = (await rechercher({ proprieteId: j.p.id, q: "portail" })).resultats;
    expect(r.zoneChemin).toBe("Extérieur");
  });

  it("ne franchit jamais la frontière d'une propriété", async () => {
    const a = await creerJeu();
    const b = await creerJeu();
    await db.insert(element).values({ proprieteId: b.p.id, nom: "Chaudiere du voisin", typeId: b.tGeneri.id, zoneId: b.zTechnique.id });

    const r = await rechercher({ proprieteId: a.p.id, q: "chaudiere" });
    expect(r.total).toBe(0);
  });
});

describe("filtre de visibilité (inerte aujourd'hui, branché à l'étape 3)", () => {
  it("écarte ce qui dépasse niveauMax", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Vanne publique", typeId: j.tGeneri.id, zoneId: j.zTechnique.id, niveau: 0 },
      { proprieteId: j.p.id, nom: "Vanne privee", typeId: j.tGeneri.id, zoneId: j.zTechnique.id, niveau: 3 },
    ]);

    const proprietaire = await rechercher({ proprieteId: j.p.id, q: "vanne" });
    expect(proprietaire.total).toBe(2);

    const locataire = await rechercher({
      proprieteId: j.p.id, q: "vanne",
      portee: { niveauMax: 1, zones: null, systemes: null },
    });
    expect(locataire.resultats.map((x) => x.nom)).toEqual(["Vanne publique"]);
  });

  it("restreint à la portée de zones ou de systèmes, en OU", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Objet cuisine", typeId: j.tGeneri.id, zoneId: j.zCuisine.id, niveau: 0 },
      { proprieteId: j.p.id, nom: "Objet technique", typeId: j.tGeneri.id, zoneId: j.zTechnique.id, niveau: 0 },
      { proprieteId: j.p.id, nom: "Objet jardin", typeId: j.tGeneri.id, zoneId: j.zJardin.id, niveau: 0, systemeId: j.sEau.id },
    ]);

    const jardinier = await rechercher({
      proprieteId: j.p.id, q: "objet",
      portee: { niveauMax: 3, zones: [j.zJardin.id], systemes: [] },
    });
    expect(jardinier.resultats.map((x) => x.nom)).toEqual(["Objet jardin"]);

    // Une portée par système ramène l'objet même s'il est hors des zones.
    const plombier = await rechercher({
      proprieteId: j.p.id, q: "objet",
      portee: { niveauMax: 3, zones: [j.zCuisine.id], systemes: [j.sEau.id] },
    });
    expect(plombier.resultats.map((x) => x.nom).sort()).toEqual(["Objet cuisine", "Objet jardin"]);
  });

  it("applique aussi la visibilité aux facettes et à la grille de zones", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Visible", typeId: j.tGeneri.id, zoneId: j.zCuisine.id, niveau: 0 },
      { proprieteId: j.p.id, nom: "Cache", typeId: j.tGeneri.id, zoneId: j.zTechnique.id, niveau: 3 },
    ]);

    const portee = { niveauMax: 0, zones: null, systemes: null };
    const facettes = await chargerFacettes(j.p.id, portee);
    expect(facettes.zones.map((z) => z.nom)).toEqual(["Cuisine"]);

    const grille = await chargerZonesVignettes(j.p.id, portee);
    expect(grille.find((z) => z.nom === "Local technique")!.nombre).toBe(0);
    expect(grille.find((z) => z.nom === "Cuisine")!.nombre).toBe(1);
  });
});

describe("facettes", () => {
  it("cumulent en OU dans une dimension, en ET entre dimensions, et se combinent au texte", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Vanne cuisine eau", typeId: j.tVanne.id, zoneId: j.zCuisine.id, systemeId: j.sEau.id },
      { proprieteId: j.p.id, nom: "Vanne technique eau", typeId: j.tVanne.id, zoneId: j.zTechnique.id, systemeId: j.sEau.id },
      { proprieteId: j.p.id, nom: "Vanne jardin elec", typeId: j.tGeneri.id, zoneId: j.zJardin.id, systemeId: j.sElec.id },
    ]);

    const f = (p: Partial<{ zones: number[]; systemes: number[]; types: number[] }>) => ({
      zones: [], systemes: [], types: [], ...p,
    });

    // Sans texte : les facettes seules listent.
    const deuxZones = await rechercher({ proprieteId: j.p.id, q: "", facettes: f({ zones: [j.zCuisine.id, j.zJardin.id] }) });
    expect(deuxZones.total).toBe(2);

    // Deux dimensions : intersection.
    const croise = await rechercher({
      proprieteId: j.p.id, q: "",
      facettes: f({ zones: [j.zCuisine.id, j.zJardin.id], systemes: [j.sEau.id] }),
    });
    expect(croise.resultats.map((x) => x.nom)).toEqual(["Vanne cuisine eau"]);

    // Le texte classe, la facette restreint.
    const avecTexte = await rechercher({ proprieteId: j.p.id, q: "vanne", facettes: f({ types: [j.tVanne.id] }) });
    expect(avecTexte.total).toBe(2);
    expect(avecTexte.resultats.every((x) => x.typeId === j.tVanne.id)).toBe(true);
  });

  it("proposent les dimensions présentes dans la propriété, comptées", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "A", typeId: j.tVanne.id, zoneId: j.zCuisine.id, systemeId: j.sEau.id },
      { proprieteId: j.p.id, nom: "B", typeId: j.tVanne.id, zoneId: j.zCuisine.id },
    ]);

    const facettes = await chargerFacettes(j.p.id);
    expect(facettes.zones).toEqual([{ id: j.zCuisine.id, nom: "Cuisine", nombre: 2 }]);
    expect(facettes.systemes).toEqual([{ id: j.sEau.id, nom: "Sanitaire", nombre: 1 }]);
    expect(facettes.types).toEqual([{ id: j.tVanne.id, nom: "Vanne d'arrêt", nombre: 2 }]);
  });
});

describe("limite, total et état vide", () => {
  it("borne la page mais annonce le total", async () => {
    const j = await creerJeu();
    await db.insert(element).values(
      Array.from({ length: 7 }, (_, i) => ({
        proprieteId: j.p.id, nom: `Vanne ${i}`, typeId: j.tGeneri.id, zoneId: j.zTechnique.id,
      })),
    );

    const page = await rechercher({ proprieteId: j.p.id, q: "vanne", limite: 3 });
    expect(page.resultats).toHaveLength(3);
    expect(page.total).toBe(7);

    const suite = await rechercher({ proprieteId: j.p.id, q: "vanne", limite: 3, decalage: 6 });
    expect(suite.resultats).toHaveLength(1);
    expect(suite.total).toBe(7);
  });

  it("propose les types du catalogue quand rien ne correspond", async () => {
    const j = await creerJeu();

    const r = await rechercher({ proprieteId: j.p.id, q: "robinet" });
    expect(r.total).toBe(0);
    expect(r.typesProches.map((t) => t.nom)).toContain("Vanne d'arrêt");
  });

  it("rattrape une saisie partielle que le plein texte ne lemmatise pas", async () => {
    const j = await creerJeu();

    const r = await rechercher({ proprieteId: j.p.id, q: "robi" });
    expect(r.typesProches.map((t) => t.nom)).toContain("Vanne d'arrêt");
  });

  it("ne propose rien, sans planter, sur une saisie sans rapport", async () => {
    const j = await creerJeu();

    const r = await rechercher({ proprieteId: j.p.id, q: "zzzzqqq" });
    expect(r.total).toBe(0);
    expect(r.typesProches).toEqual([]);
  });

  it("rend toute la propriété quand ni texte ni facette", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Alpha", typeId: j.tGeneri.id, zoneId: j.zCuisine.id },
      { proprieteId: j.p.id, nom: "Beta", typeId: j.tGeneri.id, zoneId: j.zJardin.id },
    ]);

    const r = await rechercher({ proprieteId: j.p.id, q: "" });
    expect(r.resultats.map((x) => x.nom)).toEqual(["Alpha", "Beta"]);
    expect(r.resultats.every((x) => x.motif === null)).toBe(true);
  });

  it("reste sous les 150 ms annoncées", async () => {
    const j = await creerJeu();
    await db.insert(element).values(
      Array.from({ length: 200 }, (_, i) => ({
        proprieteId: j.p.id, nom: `Vanne ${i}`, typeId: j.tGeneri.id, zoneId: j.zTechnique.id,
        details: { note: `remplacee en ${2000 + (i % 25)}` },
      })),
    );

    const r = await rechercher({ proprieteId: j.p.id, q: "vanne" });
    expect(r.total).toBe(200);
    expect(r.ms).toBeLessThan(150);
  });
});

describe("grille de zones de l'accueil", () => {
  it("compte les objets, range les extérieures en fin, et laisse fichierId nul sans photo", async () => {
    const j = await creerJeu();
    const [e] = await db.insert(element).values({
      proprieteId: j.p.id, nom: "Vanne", typeId: j.tGeneri.id, zoneId: j.zCuisine.id,
    }).returning();
    const [f] = await db.insert(fichier).values({
      proprieteId: j.p.id, chemin: "z.jpg", typeMime: "image/jpeg", taille: 1, zoneId: j.zCuisine.id,
    }).returning();
    await db.insert(fichierLien).values({ fichierId: f.id, cibleType: "element", cibleId: e.id });

    const grille = await chargerZonesVignettes(j.p.id);

    expect(grille.map((z) => z.nom)).toEqual(["Local technique", "Cuisine", "Jardin"]);
    expect(grille.at(-1)!.exterieure).toBe(true);
    expect(grille.filter((z) => z.exterieure)).toHaveLength(1);

    const cuisine = grille.find((z) => z.nom === "Cuisine")!;
    expect(cuisine.nombre).toBe(1);
    expect(cuisine.fichierId).toBe(f.id);
    expect(cuisine.chemin).toBe("Maison · Cave");

    // Une zone sans photo n'est pas une ligne manquante : elle est là, sans image.
    const technique = grille.find((z) => z.nom === "Local technique")!;
    expect(technique.nombre).toBe(0);
    expect(technique.fichierId).toBeNull();
  });
});
