// tests/serveur/limiteur.test.ts
// Le compteur à fenêtre fixe, éprouvé avec une horloge injectée : ce qu'il
// autorise, quand il rouvre, et que sa mémoire est bornée.
import { describe, it, expect } from "vitest";
import { creerLimiteur } from "../../server/limiteur.js";

function horloge(depart = 1_000_000) {
  let t = depart;
  return { maintenant: () => t, avancer: (ms: number) => (t += ms) };
}

describe("creerLimiteur", () => {
  it("autorise `maximum` requêtes par fenêtre, puis refuse", () => {
    const h = horloge();
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 3, maintenant: h.maintenant });

    expect(l.consommer("a").autorise).toBe(true);
    expect(l.consommer("a").autorise).toBe(true);
    expect(l.consommer("a")).toMatchObject({ autorise: true, restant: 0 });
    expect(l.consommer("a")).toMatchObject({ autorise: false, restant: 0 });
  });

  it("dit quand réessayer, et rouvre une fois la fenêtre passée", () => {
    const h = horloge();
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 1, maintenant: h.maintenant });

    l.consommer("a");
    h.avancer(15_000);
    expect(l.consommer("a")).toMatchObject({ autorise: false, reessaiDansMs: 45_000 });

    h.avancer(45_000);
    expect(l.consommer("a").autorise).toBe(true);
  });

  it("compte chaque clé à part", () => {
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 1 });
    expect(l.consommer("a").autorise).toBe(true);
    expect(l.consommer("b").autorise).toBe(true);
    expect(l.consommer("a").autorise).toBe(false);
    expect(l.consommer("b").autorise).toBe(false);
  });

  it("oublie les fenêtres closes et ne garde jamais plus de `clesMax` clés", () => {
    const h = horloge();
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 5, clesMax: 3, maintenant: h.maintenant });

    for (let i = 0; i < 10; i++) l.consommer(`adresse-${i}`);
    expect(l.taille()).toBe(3);
    // La clé en cours n'est jamais celle qu'on évince.
    expect(l.consommer("adresse-9")).toMatchObject({ autorise: true, restant: 3 });

    h.avancer(60_000);
    l.consommer("nouvelle");
    expect(l.taille()).toBe(1);
  });

  it("refuse une configuration qui n'aurait aucun sens", () => {
    expect(() => creerLimiteur({ fenetreMs: 0, maximum: 1 })).toThrow();
    expect(() => creerLimiteur({ fenetreMs: 1000, maximum: 0 })).toThrow();
  });
});
