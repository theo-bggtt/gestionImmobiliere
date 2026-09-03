import { describe, it, expect } from "vitest";
import { composerSquelette } from "../../app/lib/demarrage/squelette";
import type { ReponsesDemarrage, SquelettePropose } from "../../app/lib/demarrage/types";

// Fonction pure, aucune base : ces tests tournent sans Postgres.

const MAISON: ReponsesDemarrage = {
  forme: "maison",
  niveauxHabitables: 2,
  sousSol: true,
  combles: false,
  garage: false,
  exterieur: true,
};

function toutesLesZones(s: SquelettePropose) {
  return [
    ...s.batiments.flatMap((b) => b.niveaux.flatMap((n) => n.zones)),
    ...s.zonesExterieures,
  ];
}

describe("composerSquelette", () => {
  it("ordonne les niveaux par ordinal signé, sous-sol en premier", () => {
    const { batiments } = composerSquelette({ ...MAISON, niveauxHabitables: 3, combles: true });
    const principal = batiments.find((b) => b.type === "principal")!;
    const ordinaux = principal.niveaux.map((n) => n.ordinal);

    expect(ordinaux).toEqual([-1, 0, 1, 2, 3]);
    // Strictement croissant : c'est la propriété qui compte, pas la liste.
    expect([...ordinaux].sort((a, b) => a - b)).toEqual(ordinaux);
  });

  it("ne trie pas alphabétiquement — « Combles » reste au-dessus des étages", () => {
    const { batiments } = composerSquelette({ ...MAISON, niveauxHabitables: 2, sousSol: false, combles: true });
    const noms = batiments[0].niveaux.map((n) => n.nom);

    expect(noms).toEqual(["Rez-de-chaussée", "1er étage", "Combles"]);
    // Un tri par nom placerait « Combles » en tête : c'est exactement le piège
    // que l'ordinal existe pour éviter (règle non négociable #11).
    expect(noms).not.toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
    expect(batiments[0].niveaux.at(-1)!.ordinal).toBe(2);
  });

  it("place le sous-sol à un ordinal négatif", () => {
    const { batiments } = composerSquelette({ ...MAISON, sousSol: true });
    const sousSol = batiments[0].niveaux.find((n) => n.nom === "Sous-sol");

    expect(sousSol).toBeDefined();
    expect(sousSol!.ordinal).toBe(-1);
  });

  it("n'invente pas de sous-sol quand il n'est pas demandé", () => {
    const { batiments } = composerSquelette({ ...MAISON, sousSol: false });
    expect(batiments[0].niveaux.every((n) => n.ordinal >= 0)).toBe(true);
  });

  it("propose des zones extérieures, sinon le partage au jardinier n'a rien à montrer", () => {
    const maison = composerSquelette({ ...MAISON, exterieur: true });
    expect(maison.zonesExterieures.map((z) => z.nom)).toEqual(["Jardin", "Terrasse"]);
    expect(maison.zonesExterieures.every((z) => z.type === "exterieur")).toBe(true);

    const logement = composerSquelette({ ...MAISON, forme: "appartement", exterieur: true });
    expect(logement.zonesExterieures.map((z) => z.nom)).toEqual(["Balcon"]);
  });

  it("donne un local technique dès qu'il y a un sous-sol", () => {
    const { batiments } = composerSquelette({ ...MAISON, sousSol: true });
    const sousSol = batiments[0].niveaux.find((n) => n.ordinal === -1)!;
    expect(sousSol.zones.some((z) => z.type === "technique")).toBe(true);
  });

  it("fait du garage un bâtiment, avec un niveau qui porte sa zone", () => {
    const { batiments } = composerSquelette({ ...MAISON, garage: true });
    const garage = batiments.find((b) => b.type === "garage");

    expect(garage).toBeDefined();
    expect(garage!.niveaux).toHaveLength(1);
    expect(garage!.niveaux[0].zones).toHaveLength(1);
    // Une zone rattachée à un bâtiment passe forcément par un niveau.
    expect(garage!.niveaux[0].ordinal).toBe(0);
  });

  it("ne donne qu'un niveau à un logement, quel que soit le nombre demandé", () => {
    const { batiments } = composerSquelette({
      ...MAISON, forme: "appartement", niveauxHabitables: 5, combles: true, sousSol: false,
    });
    expect(batiments[0].niveaux.map((n) => n.ordinal)).toEqual([0]);
  });

  it("borne le nombre de niveaux au lieu de faire confiance à la saisie", () => {
    const enorme = composerSquelette({ ...MAISON, niveauxHabitables: 9999, sousSol: false });
    const zero = composerSquelette({ ...MAISON, niveauxHabitables: 0, sousSol: false });
    const absurde = composerSquelette({ ...MAISON, niveauxHabitables: Number.NaN, sousSol: false });

    expect(enorme.batiments[0].niveaux.length).toBe(8);
    expect(zero.batiments[0].niveaux.length).toBe(1);
    expect(absurde.batiments[0].niveaux.length).toBe(1);
  });

  it("donne des clés uniques, y compris entre deux compositions", () => {
    const a = composerSquelette(MAISON);
    const b = composerSquelette(MAISON);
    const cles = [
      ...a.batiments.flatMap((x) => [x.cle, ...x.niveaux.map((n) => n.cle)]),
      ...b.batiments.flatMap((x) => [x.cle, ...x.niveaux.map((n) => n.cle)]),
      ...toutesLesZones(a).map((z) => z.cle),
      ...toutesLesZones(b).map((z) => z.cle),
    ];
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("ne nomme aucune zone avec le mot interdit (règle non négociable #12)", () => {
    // Le générateur de squelette est précisément l'endroit où il revient tout
    // seul. `tests/vocabulaire.test.ts` lit les sources ; ici on lit ce que la
    // fonction produit vraiment, sur toutes les combinaisons de réponses.
    const interdit = /pi[eè]ces?\b/i;
    for (const forme of ["maison", "appartement"] as const) {
      for (const sousSol of [true, false]) {
        for (const combles of [true, false]) {
          for (const garage of [true, false]) {
            for (const exterieur of [true, false]) {
              for (let n = 1; n <= 8; n += 1) {
                const s = composerSquelette({ forme, niveauxHabitables: n, sousSol, combles, garage, exterieur });
                const mots = [
                  ...s.batiments.map((b) => b.nom),
                  ...s.batiments.flatMap((b) => b.niveaux.map((x) => x.nom)),
                  ...toutesLesZones(s).map((z) => z.nom),
                ];
                expect(mots.filter((m) => interdit.test(m))).toEqual([]);
              }
            }
          }
        }
      }
    }
  });

  it("est déterministe : les mêmes réponses donnent la même structure", () => {
    const sansCles = (s: SquelettePropose) => JSON.stringify(s, (k, v) => (k === "cle" ? undefined : v));
    expect(sansCles(composerSquelette(MAISON))).toBe(sansCles(composerSquelette(MAISON)));
  });
});
