// tests/plans/regroupement.test.ts
// Le regroupement est la seule pièce de la vue interactive qui décide quelque
// chose. Elle est écrite en fonction pure pour être éprouvée sans DOM : une
// grappe qui ne se déplierait pas au bon zoom, ou qui changerait d'un rendu à
// l'autre, ne se verrait autrement qu'à l'œil.
import { describe, it, expect } from "vitest";
import { regrouper, SEUIL_REGROUPEMENT } from "../../app/lib/plans/regroupement";
import type { PointPlan } from "../../app/lib/plans/types";

const point = (id: number, x: number, y: number): PointPlan => ({
  id,
  elementId: id * 10,
  nom: `Objet ${id}`,
  typeNom: "Vanne",
  zoneNom: "Local technique",
  x,
  y,
});

describe("regroupement des points", () => {
  it("fusionne deux points voisins quand on est dézoomé, les sépare quand on zoome", () => {
    const points = [point(1, 10, 10), point(2, 11, 10)];

    // 1000 px affichés : 1 % vaut 10 px, moins qu'une cible tactile.
    const dezoome = regrouper(points, 1000, 1000);
    expect(dezoome).toHaveLength(1);
    expect(dezoome[0].points).toHaveLength(2);

    // 10 000 px affichés (zoom 10) : 1 % vaut 100 px, largement au-delà.
    const zoome = regrouper(points, 10_000, 10_000);
    expect(zoome).toHaveLength(2);
    expect(zoome.every((g) => g.points.length === 1)).toBe(true);
  });

  it("place la pastille de grappe à la moyenne de ses membres", () => {
    const grappes = regrouper([point(1, 10, 20), point(2, 12, 21)], 1000, 1000);
    expect(grappes).toHaveLength(1);
    expect(grappes[0].x).toBeCloseTo(11);
    expect(grappes[0].y).toBeCloseTo(20.5);
  });

  it("rend le même résultat quel que soit l'ordre d'arrivée", () => {
    const points = [point(3, 80, 12), point(1, 10, 10), point(7, 11, 10), point(2, 40, 60)];
    const attendu = regrouper(points, 1200, 900);
    const melange = regrouper([...points].reverse(), 1200, 900);

    expect(melange.map((g) => g.cle)).toEqual(attendu.map((g) => g.cle));
    expect(melange.map((g) => g.points.map((p) => p.id))).toEqual(attendu.map((g) => g.points.map((p) => p.id)));
  });

  it("ne perd aucun point, et n'en duplique aucun", () => {
    const points = Array.from({ length: 40 }, (_, i) => point(i + 1, (i * 7) % 100, (i * 13) % 100));
    for (const largeur of [200, 1000, 5000, 20_000]) {
      const ids = regrouper(points, largeur, largeur).flatMap((g) => g.points.map((p) => p.id));
      expect(ids.sort((a, b) => a - b)).toEqual(points.map((p) => p.id));
    }
  });

  it("dégrade en points isolés plutôt qu'en NaN si l'image n'est pas encore mesurée", () => {
    const grappes = regrouper([point(1, 10, 10), point(2, 11, 10)], 0, 0, SEUIL_REGROUPEMENT);
    expect(grappes).toHaveLength(2);
    expect(grappes.every((g) => Number.isFinite(g.x) && Number.isFinite(g.y))).toBe(true);
  });
});
