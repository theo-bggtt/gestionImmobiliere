// tests/forms/champ-validation.test.ts
import { describe, it, expect } from "vitest";
import { validerDetails } from "../../app/lib/forms/champSchema";
import type { ChampDefinition } from "../../app/db/schema/types";

const champsChaudiere: ChampDefinition[] = [
  { cle: "puissance", label: "Puissance", genre: "nombre", unite: "kW", niveauMin: 1, obligatoire: true },
  { cle: "type_energie", label: "Énergie", genre: "choix", niveauMin: 1, obligatoire: true, options: ["gaz", "fioul", "bois"] },
  { cle: "dernier_entretien", label: "Dernier entretien", genre: "date", niveauMin: 2, obligatoire: false },
];

describe("validerDetails", () => {
  it("accepte un details conforme", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "gaz" });
    expect(resultat.success).toBe(true);
  });

  it("rejette un champ obligatoire manquant", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24 });
    expect(resultat.success).toBe(false);
  });

  it("rejette une valeur hors de la liste choix", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "nucléaire" });
    expect(resultat.success).toBe(false);
  });

  it("rejette une date mal formée", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "gaz", dernier_entretien: "12/03/2024" });
    expect(resultat.success).toBe(false);
  });

  it("laisse passer une clé d'un champ retiré du type (passthrough)", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "gaz", ancien_champ_retire: "valeur historique" });
    expect(resultat.success).toBe(true);
  });

  it("lève une erreur explicite si un champ 'choix' ne définit aucune option", () => {
    const champsInvalides: ChampDefinition[] = [{ cle: "x", label: "X", genre: "choix", niveauMin: 1, obligatoire: false }];
    expect(() => validerDetails(champsInvalides, {})).toThrow(/aucune option/);
  });
});
