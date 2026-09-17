// tests/schema/element-type-optionnel.test.ts
// `element.type_id` est nullable depuis la migration 0013 : « le truc gris à
// côté du compteur » se consigne d'abord et se qualifie ensuite, ou jamais.
//
// L'assouplissement ne se juge pas à l'INSERT qui passe — il se juge à ce qui
// ne bouge PAS : la zone reste obligatoire, la fiche reste trouvable, et le
// filtre de partage continue de porter sur `niveau` et `zone_id` seuls. C'est
// ce que ce fichier tient.
import { describe, it, expect, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element,
} from "../../app/db/schema/index";
import { rechercher, chargerFacettes } from "../../app/lib/recherche/recherche.server";
import { partage } from "../../app/db/schema/index";
import { creerJeton } from "../../app/lib/partage/partage.server";
import { chargerFichePartage } from "../../app/lib/partage/contenu.server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `to-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test type optionnel" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Cave", ordinal: -1 }).returning();
  const [zTechnique] = await db
    .insert(zone)
    .values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique", ordre: 0 })
    .returning();

  // Chargé une fois pour toutes par tests/setup/test-db.ts : ses alias sont ce
  // qui remplit le poids B, donc ce dont l'absence se mesure.
  const [tVanne] = await db
    .select()
    .from(typeElement)
    .where(and(eq(typeElement.nom, "Vanne d'arrêt"), eq(typeElement.origine, "systeme")));
  expect(tVanne, "le catalogue de test doit contenir « Vanne d'arrêt »").toBeDefined();

  return { p, zTechnique, tVanne };
}

describe("element.type_id nullable", () => {
  it("accepte un objet sans type", async () => {
    const j = await creerJeu();
    const [e] = await db
      .insert(element)
      .values({ proprieteId: j.p.id, nom: "Truc gris", zoneId: j.zTechnique.id, niveau: 1 })
      .returning();
    expect(e.typeId).toBeNull();
  });

  // L'assouplissement s'arrête à `type_id` : `zone_id` porte la règle non
  // négociable #1, et une fiche sans zone échapperait au filtre de partage.
  it("ne desserre pas zone_id, qui reste NOT NULL", async () => {
    const j = await creerJeu();
    await expect(
      db.execute(sql`
        INSERT INTO element (propriete_id, nom, type_id, zone_id)
        VALUES (${j.p.id}, 'Sans zone', NULL, NULL)
      `),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/null value in column "zone_id"/) }),
    });
  });
});

describe("le vecteur de recherche d'un objet sans type", () => {
  // `maj_recherche_element` n'a PAS été retouchée par la migration 0013 : son
  // `SELECT … INTO` ne ramène aucune ligne, les variables restent NULL, et
  // `concat_ws` les saute. Ce test est ce qui le constate plutôt que de le
  // supposer.
  it("est rempli, et le nom y garde son poids A", async () => {
    const j = await creerJeu();
    const [e] = await db
      .insert(element)
      .values({ proprieteId: j.p.id, nom: "Compteur bizarre", zoneId: j.zTechnique.id, niveau: 1 })
      .returning();

    const lignes = await db.execute<{ vecteur: string }>(sql`
      SELECT recherche::text AS vecteur FROM element WHERE id = ${e.id}
    `);
    // 'compteur':1A — le lexème du nom, en tête et en poids A.
    expect(lignes.rows[0].vecteur).toMatch(/'compteur':1A/);
    // La zone reste en poids C : le type manquant n'emporte pas le reste.
    expect(lignes.rows[0].vecteur).toMatch(/'techniqu':\d+C/);
  });

  it("le rend trouvable par son nom, sans accent ni pluriel exact", async () => {
    const j = await creerJeu();
    await db.insert(element).values({
      proprieteId: j.p.id, nom: "Éclairage terrasse", zoneId: j.zTechnique.id, niveau: 1,
    });

    const r = await rechercher({ proprieteId: j.p.id, q: "eclairages" });
    expect(r.resultats.map((x) => x.nom)).toEqual(["Éclairage terrasse"]);
    expect(r.resultats[0].motif).toBe("nom");
    expect(r.resultats[0].typeId).toBeNull();
    expect(r.resultats[0].typeNom).toBeNull();
  });

  // Le corollaire honnête : sans type, il n'y a pas de vocabulaire de type à
  // indexer, donc l'objet ne remonte plus sur les alias du catalogue. Ce n'est
  // pas un défaut à corriger, c'est ce que « sans type » veut dire.
  it("ne remonte pas sur les alias d'un type qu'il n'a pas", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Arrivee generale", typeId: j.tVanne.id, zoneId: j.zTechnique.id, niveau: 1 },
      { proprieteId: j.p.id, nom: "Arrivee secondaire", zoneId: j.zTechnique.id, niveau: 1 },
    ]);

    const r = await rechercher({ proprieteId: j.p.id, q: "robinet" });
    expect(r.resultats.map((x) => x.nom)).toEqual(["Arrivee generale"]);
  });

  // Renommer un type déclenche `trg_maj_recherche_par_type`, qui filtre
  // `WHERE type_id = NEW.id` : une ligne à type nul n'y répond jamais. Le
  // constater évite de découvrir un jour que la propagation plante dessus.
  it("survit au renommage d'un type auquel il n'appartient pas", async () => {
    const j = await creerJeu();
    const [e] = await db
      .insert(element)
      .values({ proprieteId: j.p.id, nom: "Compteur bizarre", zoneId: j.zTechnique.id, niveau: 1 })
      .returning();

    await db.update(typeElement).set({ nom: "Vanne d'arrêt" }).where(eq(typeElement.id, j.tVanne.id));

    const apres = await db.select({ typeId: element.typeId }).from(element).where(eq(element.id, e.id));
    expect(apres[0].typeId).toBeNull();
    expect((await rechercher({ proprieteId: j.p.id, q: "compteur" })).total).toBe(1);
  });
});

describe("les facettes", () => {
  // JOIN interne assumé : une pastille a besoin d'un identifiant à cocher, et
  // « sans type » n'en est pas un. Même traitement que `systeme`, nullable
  // depuis toujours — d'où une somme de pastilles inférieure au fonds.
  it("ne fabriquent pas de pastille « sans type », et comptent le reste juste", async () => {
    const j = await creerJeu();
    await db.insert(element).values([
      { proprieteId: j.p.id, nom: "Arrivee generale", typeId: j.tVanne.id, zoneId: j.zTechnique.id, niveau: 1 },
      { proprieteId: j.p.id, nom: "Truc gris", zoneId: j.zTechnique.id, niveau: 1 },
    ]);

    const f = await chargerFacettes(j.p.id);
    expect(f.types.map((t) => [t.nom, t.nombre])).toEqual([["Vanne d'arrêt", 1]]);
    // La zone, elle, les compte tous les deux : c'est `type` qui est facultatif.
    expect(f.zones.map((z) => [z.nom, z.nombre])).toEqual([["Local technique", 2]]);
  });
});

describe("une fiche sans type, vue d'un lien de partage", () => {
  const creerPartage = async (proprieteId: number, niveauMax: number) => {
    const [l] = await db
      .insert(partage)
      .values({
        proprieteId,
        nom: "Lien de test",
        jeton: creerJeton(),
        niveauMax,
        porteeZones: [],
        porteeSystemes: [],
      })
      .returning();
    return l;
  };

  // Le point qui compte : ce qui décide de servir ou non cette fiche est
  // `clausePortee` — `niveau` et `zone_id` — et le type n'y entre pas. Passer
  // le JOIN en LEFT ne pouvait donc rien ouvrir, mais un JOIN interne oublié
  // aurait FERMÉ la fiche en silence, ce qui est le vrai risque de ce lot.
  it("est servie, avec un typeNom nul plutôt qu'un 404", async () => {
    const j = await creerJeu();
    const [e] = await db
      .insert(element)
      .values({ proprieteId: j.p.id, nom: "Truc gris", zoneId: j.zTechnique.id, niveau: 1 })
      .returning();

    const lien = await creerPartage(j.p.id, 1);
    const fiche = await chargerFichePartage(lien, "Maison", String(e.id));

    expect(fiche.nom).toBe("Truc gris");
    expect(fiche.typeNom).toBeNull();
    // Sans type, aucun champ défini : donc aucun champ rendu, et surtout
    // aucune valeur de `details` servie sans son `niveauMin`.
    expect(fiche.champs).toEqual([]);
  });

  it("reste masquée par le plafond comme n'importe quelle autre", async () => {
    const j = await creerJeu();
    const [e] = await db
      .insert(element)
      .values({ proprieteId: j.p.id, nom: "Truc gris", zoneId: j.zTechnique.id, niveau: 3 })
      .returning();

    const lien = await creerPartage(j.p.id, 1);
    await expect(chargerFichePartage(lien, "Maison", String(e.id))).rejects.toMatchObject({ status: 404 });
  });
});
