// tests/plans/tracage.test.ts
// La survie d'un tracé à son envoi. Fonction pure, aucune base, aucun DOM —
// même forme que `regroupement.test.ts` et pour la même raison : c'est la
// seule chose que l'écran de tracé décide.
//
// Ce que le test épingle est un refus : avant, « Terminer le contour »
// envoyait ET effaçait les clics dans la foulée. Un contour tracé sur un plan
// qui ne couvre pas la zone répond 404, le message s'affichait, et il fallait
// tout retracer.
import { describe, it, expect } from "vitest";
import { traceApres, type TraceEnCours } from "../../app/lib/plans/tracage";

const CUISINE: TraceEnCours = {
  zoneId: 7,
  zoneNom: "Cuisine",
  sommets: [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 40 },
  ],
  envoye: false,
};

const ENVOYE: TraceEnCours = { ...CUISINE, envoye: true };

describe("le tracé après une réponse du serveur", () => {
  it("garde les sommets quand le serveur refuse, et rouvre l'envoi", () => {
    const apres = traceApres(ENVOYE, "idle", { erreur: "Zone introuvable" });
    expect(apres?.sommets).toEqual(CUISINE.sommets);
    // Rouvert : sans ça, corriger et renvoyer serait impossible.
    expect(apres?.envoye).toBe(false);
  });

  it("efface une fois le contour accepté", () => {
    expect(traceApres(ENVOYE, "idle", { })).toBeNull();
  });

  it("ne décide rien tant que la réponse n'est pas là", () => {
    // La MÊME référence : `setTracage` court-circuite alors le rendu, et
    // l'appelant n'a pas de troisième cas à traiter.
    expect(traceApres(ENVOYE, "submitting", undefined)).toBe(ENVOYE);
    expect(traceApres(ENVOYE, "loading", { erreur: "vieille réponse" })).toBe(ENVOYE);
    expect(traceApres(ENVOYE, "idle", undefined)).toBe(ENVOYE);
  });

  it("ignore la réponse d'un envoi qui n'est pas le sien", () => {
    // Le même fetcher sert à effacer le contour d'une AUTRE zone. Cet
    // effacement réussit, et il n'a aucune raison de jeter les clics en cours.
    expect(traceApres(CUISINE, "idle", {})).toBe(CUISINE);
    expect(traceApres(CUISINE, "idle", { erreur: "peu importe" })).toBe(CUISINE);
  });

  it("ne réveille rien quand il n'y a pas de tracé", () => {
    expect(traceApres(null, "idle", {})).toBeNull();
    expect(traceApres(null, "idle", { erreur: "x" })).toBeNull();
  });
});
