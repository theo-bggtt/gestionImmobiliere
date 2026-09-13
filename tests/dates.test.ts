// tests/dates.test.ts
// `jourLisible` est une fonction pure, testée sans base ni DOM — même famille
// que `regroupement.ts` et `tracage.ts`.
//
// Le test qui compte est celui du fuseau, et il porte son propre contrôle :
// sans la preuve que `new Date(iso)` décale VRAIMENT d'un jour à l'ouest de
// Greenwich, « la date est bonne » ne voudrait rien dire.
import { describe, it, expect } from "vitest";
import { jourLisible } from "../app/lib/dates";

describe("jourLisible", () => {
  it("rend une date française, sans zéro inutile", () => {
    expect(jourLisible("2031-03-04")).toBe("4 mars 2031");
    expect(jourLisible("2026-01-01")).toBe("1 janvier 2026");
    expect(jourLisible("2026-12-31")).toBe("31 décembre 2026");
  });

  it("ne décale pas d'un jour à l'ouest de Greenwich, là où `new Date` le fait", () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";

      // Le contrôle : c'est bien le piège, et pas une supposition. `Date` lit
      // `YYYY-MM-DD` comme du UTC, donc minuit UTC devient la veille ici.
      const parDate = new Date("2026-03-01");
      expect(parDate.getDate()).toBe(28);
      expect(parDate.getMonth()).toBe(1); // février

      // Le découpage à la main ne passe par aucun `Date` : il ne peut pas
      // décaler.
      expect(jourLisible("2026-03-01")).toBe("1 mars 2026");
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("rend tel quel ce qui n'a pas la forme attendue", () => {
    // Une date illisible se remarque ; une date décalée d'un jour, non.
    expect(jourLisible("")).toBe("");
    expect(jourLisible("pas-une-date")).toBe("pas-une-date");
    expect(jourLisible("2026-13-01")).toBe("2026-13-01");
  });
});
