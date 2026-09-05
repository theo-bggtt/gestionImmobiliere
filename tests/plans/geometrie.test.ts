// tests/plans/geometrie.test.ts
// Le seul endroit de l'étape 6 qui décide quelque chose, et il décide de
// `element.zone_id` au bout de la chaîne. Testée sans base et sans DOM, comme
// `regroupement.test.ts` : ce sont les BORDS qui portent le risque — un point
// exactement sur une arête, sur un sommet, un contour concave, un contour qui
// se croise — et aucun d'eux ne se verrait à l'œil sur un plan.
import { describe, it, expect } from "vitest";
import {
  centre,
  dansLeContour,
  lireContour,
  SOMMETS_MAX,
  SOMMETS_MIN,
  surLeSegment,
  zoneDuPoint,
} from "../../app/lib/plans/geometrie";

const carre = [
  { x: 10, y: 10 },
  { x: 30, y: 10 },
  { x: 30, y: 30 },
  { x: 10, y: 30 },
];

// Un L : le rectangle 10-30 × 10-30 amputé de son quart supérieur droit.
const enL = [
  { x: 10, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 20 },
  { x: 30, y: 20 },
  { x: 30, y: 30 },
  { x: 10, y: 30 },
];

// Un nœud papillon : le tracé se recoupe entre les deux lobes.
const croise = [
  { x: 10, y: 10 },
  { x: 30, y: 30 },
  { x: 30, y: 10 },
  { x: 10, y: 30 },
];

describe("appartenance à un contour", () => {
  it("range dedans et dehors sur un contour simple", () => {
    expect(dansLeContour({ x: 20, y: 20 }, carre)).toBe(true);
    expect(dansLeContour({ x: 5, y: 20 }, carre)).toBe(false);
    expect(dansLeContour({ x: 20, y: 40 }, carre)).toBe(false);
    // Juste dehors, d'un cheveu : la frontière n'est pas floue.
    expect(dansLeContour({ x: 9.999, y: 20 }, carre)).toBe(false);
  });

  it("compte un point posé exactement sur une arête comme DEDANS", () => {
    // La règle est explicite et pas un effet de bord du lancer de rayon : un
    // objet posé sur un mur est dans la zone que ce mur borde. Les quatre
    // côtés, parce que le lancer de rayon n'en traite naturellement que deux.
    expect(dansLeContour({ x: 10, y: 20 }, carre)).toBe(true);
    expect(dansLeContour({ x: 30, y: 20 }, carre)).toBe(true);
    expect(dansLeContour({ x: 20, y: 10 }, carre)).toBe(true);
    expect(dansLeContour({ x: 20, y: 30 }, carre)).toBe(true);
  });

  it("compte un point posé exactement sur un sommet comme DEDANS", () => {
    for (const s of carre) expect(dansLeContour(s, carre)).toBe(true);
  });

  it("ne compte pas deux fois un sommet traversé par le rayon", () => {
    // Le rayon part vers la droite à la hauteur y = 10, qui est celle de deux
    // sommets. Sans la comparaison stricte d'un côté et large de l'autre, le
    // point à gauche du carré serait déclaré dedans.
    expect(dansLeContour({ x: 5, y: 10 }, carre)).toBe(false);
    expect(dansLeContour({ x: 40, y: 10 }, carre)).toBe(false);
  });

  it("creuse bien le renfoncement d'un contour concave", () => {
    // Le quart manquant du L : dans la boîte englobante, hors du contour.
    expect(dansLeContour({ x: 25, y: 15 }, enL)).toBe(false);
    expect(dansLeContour({ x: 15, y: 15 }, enL)).toBe(true);
    expect(dansLeContour({ x: 25, y: 25 }, enL)).toBe(true);
  });

  it("traite un contour qui se croise en pair-impair, et de la même façon à chaque appel", () => {
    // Les deux lobes du nœud papillon sont dedans...
    expect(dansLeContour({ x: 13, y: 20 }, croise)).toBe(true);
    expect(dansLeContour({ x: 27, y: 20 }, croise)).toBe(true);
    // ...et le point du croisement, exactement sur les deux diagonales, est
    // sur un bord, donc dedans. Ce n'est pas ce qui compte : ce qui compte est
    // que la réponse ne dépende ni du sens de parcours ni de l'arrondi.
    expect(dansLeContour({ x: 20, y: 20 }, croise)).toBe(true);
    const inverse = [...croise].reverse();
    for (const p of [{ x: 13, y: 20 }, { x: 27, y: 20 }, { x: 20, y: 5 }, { x: 20, y: 35 }]) {
      expect(dansLeContour(p, inverse)).toBe(dansLeContour(p, croise));
    }
  });

  it("refuse un contour de moins de trois sommets plutôt que d'inventer une réponse", () => {
    expect(dansLeContour({ x: 20, y: 20 }, [])).toBe(false);
    expect(dansLeContour({ x: 20, y: 20 }, [{ x: 10, y: 10 }, { x: 30, y: 30 }])).toBe(false);
  });
});

describe("un point sur un segment", () => {
  it("distingue « sur la droite » de « sur le segment »", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 10 };
    expect(surLeSegment({ x: 5, y: 5 }, a, b)).toBe(true);
    // Alignés, mais au-delà de b : sur la droite, pas sur le segment.
    expect(surLeSegment({ x: 20, y: 20 }, a, b)).toBe(false);
    expect(surLeSegment({ x: -1, y: -1 }, a, b)).toBe(false);
    expect(surLeSegment({ x: 5, y: 5.001 }, a, b)).toBe(false);
  });

  it("réduit un segment dégénéré à son point", () => {
    const a = { x: 7, y: 7 };
    expect(surLeSegment({ x: 7, y: 7 }, a, a)).toBe(true);
    expect(surLeSegment({ x: 7.5, y: 7 }, a, a)).toBe(false);
  });
});

describe("la zone que la géométrie propose", () => {
  const contours = [
    { zoneId: 1, sommets: carre },
    { zoneId: 2, sommets: [{ x: 50, y: 50 }, { x: 80, y: 50 }, { x: 80, y: 80 }, { x: 50, y: 80 }] },
  ];

  it("propose la zone quand un seul contour contient le point", () => {
    expect(zoneDuPoint({ x: 20, y: 20 }, contours)).toBe(1);
    expect(zoneDuPoint({ x: 60, y: 60 }, contours)).toBe(2);
  });

  it("ne propose rien quand aucun contour ne contient le point", () => {
    expect(zoneDuPoint({ x: 45, y: 45 }, contours)).toBeNull();
    expect(zoneDuPoint({ x: 20, y: 20 }, [])).toBeNull();
  });

  it("ne propose rien quand deux contours se recouvrent : l'ambiguïté n'est pas une proposition", () => {
    // Le cas qui arrive : une zone imbriquée dans une autre (jardin > potager),
    // ou deux tracés à la main qui se chevauchent d'un cheveu.
    const imbriques = [
      { zoneId: 1, sommets: carre },
      { zoneId: 2, sommets: [{ x: 15, y: 15 }, { x: 25, y: 15 }, { x: 25, y: 25 }, { x: 15, y: 25 }] },
    ];
    expect(zoneDuPoint({ x: 20, y: 20 }, imbriques)).toBeNull();
    // Hors de l'imbrication, la proposition revient.
    expect(zoneDuPoint({ x: 12, y: 12 }, imbriques)).toBe(1);
  });

  it("ne propose rien pour un point posé sur le mur mitoyen de deux zones", () => {
    // Deux zones qui partagent l'arête x = 30 : le point y est dedans des deux
    // côtés, donc ambigu. Les deux bords échouent du côté qui n'écrit rien.
    const mitoyennes = [
      { zoneId: 1, sommets: carre },
      { zoneId: 2, sommets: [{ x: 30, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 30 }, { x: 30, y: 30 }] },
    ];
    expect(zoneDuPoint({ x: 30, y: 20 }, mitoyennes)).toBeNull();
  });
});

describe("lecture d'un contour envoyé par le navigateur", () => {
  it("accepte un tableau de sommets bornés", () => {
    expect(lireContour(carre)).toEqual(carre);
    expect(lireContour([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toHaveLength(3);
  });

  it("refuse tout ce que la contrainte de base refuserait", () => {
    expect(lireContour(null)).toBeNull();
    expect(lireContour("[]")).toBeNull();
    expect(lireContour({ x: 1, y: 2 })).toBeNull();
    expect(lireContour([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeNull();
    expect(lireContour(Array.from({ length: SOMMETS_MAX + 1 }, () => ({ x: 1, y: 1 })))).toBeNull();
    expect(lireContour([{ x: 0, y: 0 }, { x: 101, y: 0 }, { x: 10, y: 10 }])).toBeNull();
    expect(lireContour([{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 10, y: 10 }])).toBeNull();
    expect(lireContour([{ x: "0", y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBeNull();
    expect(lireContour([{ x: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBeNull();
    expect(lireContour([{ x: Number.NaN, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBeNull();
    expect(lireContour([null, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBeNull();
  });

  it("garde les bornes exactement où la migration 0009 les met", () => {
    // La duplication est assumée (la contrainte vit en base) ; ceci épingle au
    // moins que les deux nombres n'aient pas bougé d'un seul côté.
    expect([SOMMETS_MIN, SOMMETS_MAX]).toEqual([3, 40]);
    expect(lireContour(Array.from({ length: SOMMETS_MAX }, () => ({ x: 1, y: 1 })))).toHaveLength(SOMMETS_MAX);
  });
});

describe("où poser l'étiquette d'un contour", () => {
  it("rend le centre de gravité et non la moyenne des sommets", () => {
    expect(centre(carre)).toEqual({ x: 20, y: 20 });
    // Le même carré avec trois clics serrés sur le bord gauche : la moyenne
    // des sommets dériverait vers la gauche, le centre de gravité non.
    const dense = [
      { x: 10, y: 10 },
      { x: 10, y: 15 },
      { x: 10, y: 20 },
      { x: 10, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 10 },
    ];
    expect(centre(dense).x).toBeCloseTo(20, 6);
    const moyenneX = dense.reduce((s, v) => s + v.x, 0) / dense.length;
    expect(moyenneX).toBeLessThan(19);
  });

  it("retombe sur la moyenne quand l'aire est nulle, plutôt que de diviser par zéro", () => {
    const alignes = [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }];
    expect(centre(alignes)).toEqual({ x: 20, y: 20 });
    expect(centre([])).toEqual({ x: 50, y: 50 });
  });
});
