// tests/historique/saisie.test.ts
// L'écriture : validation du formulaire, et la garde qui empêche un
// identifiant d'une autre propriété de s'attacher silencieusement.
//
// Cette garde n'est pas cosmétique : c'est elle qui dispense
// `clauseEvenementVisible` de se défendre en lecture contre un élément
// étranger, et donc qui rend la clause lisible.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element,
  evenement, evenementElement, evenementIntervenant, intervenant,
} from "../../app/db/schema/index";
import {
  chargerEvenementProprietaire,
  creerEvenement,
  lireSaisieEvenement,
  majEvenement,
  supprimerEvenement,
} from "../../app/lib/historique/evenements.server";
import { lireSaisieIntervenant } from "../../app/lib/historique/intervenants.server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

function formulaire(champs: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    for (const v of Array.isArray(valeur) ? valeur : [valeur]) f.append(cle, v);
  }
  return f;
}

const BASE = { titre: "Entretien annuel", dateDebut: "2026-03-01", type: "entretien", niveau: "2" };

/** Deux propriétés distinctes : la seconde sert de source d'identifiants volés. */
async function creerDeuxProprietes() {
  const marque = `${Date.now()}-${Math.random()}`;
  const compte = async (suffixe: string) => {
    const [u] = await db.insert(utilisateur).values({
      email: `s-${suffixe}-${marque}@x.local`, motDePasseHash: "x",
    }).returning();
    const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: `Maison ${suffixe}` }).returning();
    const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
    const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
    const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
    const [t] = await db.insert(typeElement).values({
      origine: "perso", proprieteId: p.id, nom: `Appareil-${suffixe}-${marque}`, champs: [], alias: [],
    }).returning();
    const [e] = await db.insert(element).values({
      proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: z.id, niveau: 0,
    }).returning();
    const [i] = await db.insert(intervenant).values({ proprieteId: p.id, nom: `Artisan ${suffixe}` }).returning();
    return { p, e, i };
  };

  return { mienne: await compte("a"), autre: await compte("b") };
}

describe("lireSaisieEvenement", () => {
  it("accepte le cas courant et normalise la virgule décimale", () => {
    const r = lireSaisieEvenement(formulaire({ ...BASE, cout: "4800,50", elementId: ["3", "3", "7"] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.cout).toBe("4800.50");
    // Les doublons d'un formulaire bricolé ne produisent pas deux liens : la
    // clé primaire les refuserait, autant les écarter avant.
    expect(r.valeur.elementIds).toEqual([3, 7]);
  });

  it("refuse un titre vide, une date illisible, une fin avant le début", () => {
    expect(lireSaisieEvenement(formulaire({ ...BASE, titre: "   " })).ok).toBe(false);
    expect(lireSaisieEvenement(formulaire({ ...BASE, dateDebut: "01/03/2026" })).ok).toBe(false);
    // Le contrôle qui compte : la forme est bonne, l'ordre ne l'est pas.
    const r = lireSaisieEvenement(formulaire({ ...BASE, dateFin: "2026-02-01" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("précède");
  });

  it("refuse un type hors de la liste fermée", () => {
    expect(lireSaisieEvenement(formulaire({ ...BASE, type: "demenagement" })).ok).toBe(false);
    expect(lireSaisieEvenement(formulaire({ ...BASE, type: "sinistre" })).ok).toBe(true);
  });

  it("refuse un niveau hors bornes et un montant qui n'en est pas un", () => {
    for (const niveauBrut of ["-1", "4", "deux", ""]) {
      expect(lireSaisieEvenement(formulaire({ ...BASE, niveau: niveauBrut })).ok).toBe(false);
    }
    for (const cout of ["4800.555", "quatre mille", "1e9", "999999999"]) {
      expect(lireSaisieEvenement(formulaire({ ...BASE, cout })).ok).toBe(false);
    }
  });

  it("écarte les identifiants qui n'en sont pas, sans échouer", () => {
    const r = lireSaisieEvenement(formulaire({ ...BASE, elementId: ["0", "-2", "abc", "5"] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.elementIds).toEqual([5]);
  });
});

describe("garde d'appartenance", () => {
  it("404 sur un élément d'une autre propriété, sans rien écrire", async () => {
    const { mienne, autre } = await creerDeuxProprietes();
    const saisie = lireSaisieEvenement(formulaire({ ...BASE, elementId: [String(autre.e.id)] }));
    if (!saisie.ok) throw new Error(saisie.message);

    await expect(creerEvenement(mienne.p.id, saisie.valeur)).rejects.toMatchObject({ status: 404 });
    // Jamais 403 : distinguer « n'existe pas » de « n'est pas à vous »
    // confirmerait l'existence de l'objet d'un autre.
    const restants = await db.execute<{ compte: number }>(sql`
      SELECT count(*)::int AS "compte" FROM evenement WHERE propriete_id = ${mienne.p.id}
    `);
    expect(restants.rows[0].compte).toBe(0);
  });

  it("404 sur un intervenant d'une autre propriété", async () => {
    const { mienne, autre } = await creerDeuxProprietes();
    const saisie = lireSaisieEvenement(formulaire({ ...BASE, intervenantId: [String(autre.i.id)] }));
    if (!saisie.ok) throw new Error(saisie.message);
    await expect(creerEvenement(mienne.p.id, saisie.valeur)).rejects.toMatchObject({ status: 404 });
  });

  it("404 en modification et en suppression d'un événement d'une autre propriété", async () => {
    const { mienne, autre } = await creerDeuxProprietes();
    const saisie = lireSaisieEvenement(formulaire(BASE));
    if (!saisie.ok) throw new Error(saisie.message);
    const chezLautre = await creerEvenement(autre.p.id, saisie.valeur);

    await expect(majEvenement(mienne.p.id, chezLautre, saisie.valeur)).rejects.toMatchObject({ status: 404 });
    await expect(supprimerEvenement(mienne.p.id, chezLautre)).rejects.toMatchObject({ status: 404 });
    await expect(chargerEvenementProprietaire(mienne.p.id, String(chezLautre))).rejects.toMatchObject({ status: 404 });
  });
});

describe("écriture des liens", () => {
  it("relit ce qui a été écrit, coût compris", async () => {
    const { mienne } = await creerDeuxProprietes();
    const saisie = lireSaisieEvenement(formulaire({
      ...BASE, cout: "4800,50", description: "Vidange et controle",
      elementId: [String(mienne.e.id)], intervenantId: [String(mienne.i.id)],
    }));
    if (!saisie.ok) throw new Error(saisie.message);

    const id = await creerEvenement(mienne.p.id, saisie.valeur);
    const relu = await chargerEvenementProprietaire(mienne.p.id, String(id));

    expect(relu).toMatchObject({
      titre: "Entretien annuel",
      dateDebut: "2026-03-01",
      dateFin: null,
      type: "entretien",
      niveau: 2,
      cout: "4800.50",
      elementIds: [mienne.e.id],
      intervenantIds: [mienne.i.id],
    });
  });

  it("réécrit les liens en bloc : ils n'ont pas d'existence propre", async () => {
    const { mienne } = await creerDeuxProprietes();
    const avec = lireSaisieEvenement(formulaire({
      ...BASE, elementId: [String(mienne.e.id)], intervenantId: [String(mienne.i.id)],
    }));
    if (!avec.ok) throw new Error(avec.message);
    const id = await creerEvenement(mienne.p.id, avec.valeur);

    const sans = lireSaisieEvenement(formulaire(BASE));
    if (!sans.ok) throw new Error(sans.message);
    await majEvenement(mienne.p.id, id, sans.valeur);

    const relu = await chargerEvenementProprietaire(mienne.p.id, String(id));
    expect(relu.elementIds).toEqual([]);
    expect(relu.intervenantIds).toEqual([]);
  });

  it("la suppression d'un événement emporte ses liens, pas ses objets", async () => {
    const { mienne } = await creerDeuxProprietes();
    const saisie = lireSaisieEvenement(formulaire({
      ...BASE, elementId: [String(mienne.e.id)], intervenantId: [String(mienne.i.id)],
    }));
    if (!saisie.ok) throw new Error(saisie.message);
    const id = await creerEvenement(mienne.p.id, saisie.valeur);

    await supprimerEvenement(mienne.p.id, id);

    const compter = async (table: string) => {
      const r = await db.execute<{ compte: number }>(
        sql`SELECT count(*)::int AS "compte" FROM ${sql.raw(table)} WHERE evenement_id = ${id}`,
      );
      return r.rows[0].compte;
    };
    expect(await compter("evenement_element")).toBe(0);
    expect(await compter("evenement_intervenant")).toBe(0);

    // L'objet et l'artisan survivent : c'est l'événement qu'on a supprimé.
    const restants = await db.execute<{ compte: number }>(sql`
      SELECT (SELECT count(*) FROM element WHERE id = ${mienne.e.id})
           + (SELECT count(*) FROM intervenant WHERE id = ${mienne.i.id}) AS "compte"
    `);
    expect(Number(restants.rows[0].compte)).toBe(2);
  });
});

describe("lireSaisieIntervenant", () => {
  it("accepte un nom seul : le reste est facultatif", () => {
    const r = lireSaisieIntervenant(formulaire({ nom: "Sanitaire Dupont SA", niveau: "3" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur).toEqual({ nom: "Sanitaire Dupont SA", metier: null, tel: null, email: null, niveau: 3, notes: null });
  });

  it("refuse un nom vide, un niveau hors bornes, une adresse sans arobase", () => {
    expect(lireSaisieIntervenant(formulaire({ nom: "  ", niveau: "0" })).ok).toBe(false);
    expect(lireSaisieIntervenant(formulaire({ nom: "X", niveau: "9" })).ok).toBe(false);
    // Absent, et non replié sur 0 : un champ manquant ne publie pas.
    expect(lireSaisieIntervenant(formulaire({ nom: "X" })).ok).toBe(false);
    expect(lireSaisieIntervenant(formulaire({ nom: "X", niveau: "0", email: "pas-une-adresse" })).ok).toBe(false);
  });
});
