// tests/historique/portee.test.ts
// Le cœur de l'étape 5 : `clauseEvenementVisible`.
//
// Un événement pend à la propriété et non à une zone. Sa visibilité se dérive
// donc de ses objets liés, et le quantificateur est UNIVERSEL — tous passent,
// et il y en a au moins un. Chaque test ci-dessous correspond à un bord de
// cette règle, y compris le bord ternaire de SQL qui l'aurait ouverte en
// silence.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element,
  evenement, evenementElement, evenementIntervenant, intervenant,
} from "../../app/db/schema/index";
import {
  chargerChronologie,
  chargerEvenementDetail,
  chargerEvenementsDeLElement,
  compterEvenementsVisibles,
} from "../../app/lib/historique/historique.server";
import { clausePortee, PORTEE_PROPRIETAIRE, type Portee } from "../../app/lib/recherche/recherche.server";

// DELETE et non TRUNCATE ... CASCADE : voir tests/recherche/requete.test.ts.
beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

/**
 * Le jeu tient en quatre objets et six événements. Le seul détail qui n'est
 * pas décoratif : `ePapiers` n'a PAS de système, et c'est lui qui déclenche le
 * NULL de SQL sous une portée qui nomme des systèmes.
 */
async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `h-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();

  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique" }).returning();
  // Une zone sans aucun objet : c'est la portée du jardinier avant qu'on ait
  // rien saisi dehors, et le seul cas où la chronologie est vraiment vide.
  const [zGarage] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Garage", type: "annexe" }).returning();

  const [sEau] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Sanitaire" }).returning();
  const [sElec] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Electricite" }).returning();

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();

  const [eInduction] = await db.insert(element).values({
    proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: zCuisine.id, systemeId: sElec.id, niveau: 0,
  }).returning();
  const [eChaudiere] = await db.insert(element).values({
    proprieteId: p.id, nom: "Chaudiere", typeId: t.id, zoneId: zTechnique.id, systemeId: sEau.id, niveau: 0,
  }).returning();
  // SANS système : c'est le piège ternaire. `NULL = ANY('{3}')` vaut NULL, et
  // `NOT NULL` vaut NULL, donc sans `coalesce` cette ligne disparaîtrait de la
  // sous-requête de `clauseEvenementVisible` et rendrait l'événement visible.
  const [ePapiers] = await db.insert(element).values({
    proprieteId: p.id, nom: "Papiers", typeId: t.id, zoneId: zTechnique.id, niveau: 0,
  }).returning();

  const creerEv = async (titre: string, niveauEv: number, elements: number[]) => {
    const [ev] = await db.insert(evenement).values({
      proprieteId: p.id, titre, dateDebut: "2026-03-01", type: "entretien", niveau: niveauEv, cout: "4800.00",
    }).returning();
    if (elements.length > 0) {
      await db.insert(evenementElement).values(elements.map((elementId) => ({ evenementId: ev.id, elementId })));
    }
    return ev;
  };

  return {
    p, zCuisine, zTechnique, zGarage, sEau, sElec, eInduction, eChaudiere, ePapiers,
    evSansLien: await creerEv("Ramonage annuel", 0, []),
    evCuisine: await creerEv("Remplacement de l'induction", 0, [eInduction.id]),
    evDeuxZones: await creerEv("Renovation cuisine et local technique", 0, [eInduction.id, eChaudiere.id]),
    evPapiers: await creerEv("Rangement des papiers", 0, [ePapiers.id]),
    evChaudiere: await creerEv("Entretien de la chaudiere", 0, [eChaudiere.id]),
    evPrive: await creerEv("Devis confidentiel", 3, [eInduction.id]),
  };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

const titresVisibles = async (j: Jeu, portee: Portee) =>
  (await chargerChronologie(j.p.id, { portee })).evenements.map((e) => e.titre).sort();

describe("clausePortee ne rend jamais NULL", () => {
  it("aucun élément ne produit un NULL, système nul compris", async () => {
    const j = await creerJeu();
    // La portée qui déclenche le piège : elle NOMME des systèmes, donc la
    // branche `e.systeme_id = ANY(…)` est évaluée sur une colonne nullable.
    const portee: Portee = { niveauMax: 3, zones: null, systemes: [j.sEau.id] };

    const lignes = await db.execute<{ nuls: number }>(sql`
      SELECT count(*) FILTER (WHERE (${clausePortee(portee)}) IS NULL)::int AS "nuls"
      FROM element e
      WHERE e.propriete_id = ${j.p.id}
    `);
    expect(lignes.rows[0].nuls).toBe(0);
  });

  it("la clause vaut FALSE et non NULL pour un élément sans système", async () => {
    const j = await creerJeu();
    const portee: Portee = { niveauMax: 3, zones: null, systemes: [j.sEau.id] };

    const lignes = await db.execute<{ passe: boolean | null }>(sql`
      SELECT (${clausePortee(portee)}) AS "passe"
      FROM element e
      WHERE e.id = ${j.ePapiers.id}
    `);
    // `false`, pas `null` : c'est toute la différence entre « exclu » et
    // « inconnu », et `NOT` ne les traite pas pareil.
    expect(lignes.rows[0].passe).toBe(false);
  });
});

describe("visibilité d'un événement", () => {
  it("le propriétaire voit tout, y compris un événement sans objet lié", async () => {
    const j = await creerJeu();
    expect(await titresVisibles(j, PORTEE_PROPRIETAIRE)).toHaveLength(6);
  });

  it("un événement sans objet lié n'apparaît sur aucun lien restreint", async () => {
    const j = await creerJeu();
    // Portée vide mais plafond abaissé : `porteeRestreinte` mord dès que le
    // plafond descend, et l'événement sans lien n'a alors aucune zone d'où se
    // rattacher. Défaut assumé, écrit dans le README.
    const titres = await titresVisibles(j, { niveauMax: 1, zones: null, systemes: null });
    expect(titres).not.toContain("Ramonage annuel");
  });

  it("un événement dont TOUS les objets passent est visible", async () => {
    const j = await creerJeu();
    const titres = await titresVisibles(j, { niveauMax: 3, zones: [j.zCuisine.id], systemes: null });
    expect(titres).toContain("Remplacement de l'induction");
  });

  it("un événement dont UN SEUL objet sort de la portée disparaît", async () => {
    const j = await creerJeu();
    // Le cas qui a décidé du quantificateur. Sous un `EXISTS`, l'objet de la
    // cuisine suffirait, et le locataire lirait un titre qui parle du local
    // technique.
    const titres = await titresVisibles(j, { niveauMax: 3, zones: [j.zCuisine.id], systemes: null });
    expect(titres).toContain("Remplacement de l'induction");
    expect(titres).not.toContain("Renovation cuisine et local technique");
  });

  it("un événement lié à un objet sans système ne passe pas une portée par système", async () => {
    const j = await creerJeu();
    // LA régression. Sans le `coalesce` de `clausePortee`, cet événement
    // remonte : la ligne de `ePapiers` sort de la sous-requête sur un NULL, le
    // `NOT EXISTS` devient vrai, et le titre part dans le lien.
    const titres = await titresVisibles(j, { niveauMax: 3, zones: null, systemes: [j.sEau.id] });
    expect(titres).toEqual(["Entretien de la chaudiere"]);
  });

  it("le plafond porte aussi sur le niveau propre de l'événement", async () => {
    const j = await creerJeu();
    // L'objet lié passe (niveau 0, zone dans la portée) ; c'est l'événement
    // lui-même qui est au-dessus du plafond.
    const titres = await titresVisibles(j, { niveauMax: 2, zones: [j.zCuisine.id], systemes: null });
    expect(titres).not.toContain("Devis confidentiel");
    expect(titres).toContain("Remplacement de l'induction");
  });

  it("un événement filtré lève 404 et non 403", async () => {
    const j = await creerJeu();
    const portee: Portee = { niveauMax: 3, zones: [j.zCuisine.id], systemes: null };
    await expect(chargerEvenementDetail(j.p.id, j.evChaudiere.id, portee)).rejects.toMatchObject({ status: 404 });
    // Et le même événement passe pour le propriétaire : c'est bien la portée
    // qui décide, pas un identifiant cassé.
    await expect(chargerEvenementDetail(j.p.id, j.evChaudiere.id)).resolves.toMatchObject({
      titre: "Entretien de la chaudiere",
    });
  });

  it("l'historique d'une fiche visible masque quand même l'événement qui déborde", async () => {
    const j = await creerJeu();
    const portee: Portee = { niveauMax: 3, zones: [j.zCuisine.id], systemes: null };
    // L'induction est visible ; « Renovation cuisine et local technique » ne
    // l'est pas, alors qu'elle y est liée. La fiche ne porte pas la permission
    // de son historique.
    const titres = (await chargerEvenementsDeLElement(j.p.id, j.eInduction.id, portee)).map((e) => e.titre);
    expect(titres).toContain("Remplacement de l'induction");
    expect(titres).not.toContain("Renovation cuisine et local technique");
  });

  it("les objets d'un événement servi ne sont jamais partiels", async () => {
    const j = await creerJeu();
    // Conséquence directe du quantificateur universel : un événement visible
    // n'a aucun objet à masquer, donc aucun second filtrage à tenir à jour.
    const detail = await chargerEvenementDetail(j.p.id, j.evDeuxZones.id);
    expect(detail.objets.map((o) => o.nom).sort()).toEqual(["Chaudiere", "Induction"]);
  });
});

describe("un lien vers une autre propriété ne rend rien", () => {
  /**
   * La ligne croisée est insérée DIRECTEMENT en base, en contournant
   * `verifierAppartenance` : c'est tout l'intérêt du test. La garde d'écriture
   * rend ce lien impossible par l'application, et c'est précisément pourquoi
   * on ne peut pas la charger de prouver que la lecture se défend aussi.
   */
  async function lierUnObjetEtranger(j: Jeu) {
    const marque = `${Date.now()}-${Math.random()}`;
    const [autreU] = await db.insert(utilisateur).values({ email: `x-${marque}@x.local`, motDePasseHash: "x" }).returning();
    const [autreP] = await db.insert(propriete).values({ proprietaireId: autreU.id, nom: "Maison du voisin" }).returning();
    const [autreB] = await db.insert(batiment).values({ proprieteId: autreP.id, nom: "Villa" }).returning();
    const [autreN] = await db.insert(niveau).values({ batimentId: autreB.id, nom: "Rez", ordinal: 0 }).returning();
    const [autreZ] = await db.insert(zone).values({
      proprieteId: autreP.id, niveauId: autreN.id, nom: "Chambre du voisin", type: "interieur",
    }).returning();
    const [autreT] = await db.insert(typeElement).values({
      origine: "perso", proprieteId: autreP.id, nom: `Appareil-${marque}`, champs: [], alias: [],
    }).returning();
    const [autreE] = await db.insert(element).values({
      proprieteId: autreP.id, nom: "Coffre du voisin", typeId: autreT.id, zoneId: autreZ.id, niveau: 0,
    }).returning();

    // L'événement de NOTRE propriété porte un objet légitime et un intrus.
    await db.insert(evenementElement).values({ evenementId: j.evCuisine.id, elementId: autreE.id });
    return { autreZ, autreE };
  }

  it("un événement dont un objet lié appartient à une autre propriété disparaît", async () => {
    const j = await creerJeu();
    const { autreZ } = await lierUnObjetEtranger(j);

    // La portée nomme la zone ÉTRANGÈRE en plus de la nôtre : sans le
    // `propriete_id` dans la négation, l'intrus passe `clausePortee` — elle ne
    // dit rien de la propriété — et l'événement remonte entier.
    const titres = await titresVisibles(j, { niveauMax: 3, zones: [j.zCuisine.id, autreZ.id], systemes: null });
    expect(titres).not.toContain("Remplacement de l'induction");
  });

  it("aucun nom d'une autre propriété n'entre dans la charge sérialisée", async () => {
    const j = await creerJeu();
    const { autreZ } = await lierUnObjetEtranger(j);
    const portee: Portee = { niveauMax: 3, zones: [j.zCuisine.id, autreZ.id], systemes: null };

    // Le détail est refusé, et pas seulement absent de la liste.
    await expect(chargerEvenementDetail(j.p.id, j.evCuisine.id, portee)).rejects.toMatchObject({ status: 404 });

    // Et sur l'écran du propriétaire, qui ne passe pas par la clause
    // restreinte, l'objet étranger ne figure pas non plus dans `objets`.
    const chezLui = await chargerEvenementDetail(j.p.id, j.evCuisine.id);
    const serialise = JSON.stringify(chezLui);
    for (const fuite of ["Coffre du voisin", "Chambre du voisin"]) {
      expect(serialise).not.toContain(fuite);
    }
  });
});

describe("comptes et facettes", () => {
  it("le compte par type porte sur le fonds VISIBLE, jamais sur le fonds", async () => {
    const j = await creerJeu();
    const proprietaire = await chargerChronologie(j.p.id);
    expect(proprietaire.facettes).toEqual([{ type: "entretien", compte: 6 }]);

    // Une pastille « Entretien (6) » sur un lien qui n'en montre qu'un
    // apprendrait qu'il en existe cinq autres.
    const restreint = await chargerChronologie(j.p.id, {
      portee: { niveauMax: 3, zones: null, systemes: [j.sEau.id] },
    });
    expect(restreint.facettes).toEqual([{ type: "entretien", compte: 1 }]);
    expect(restreint.total).toBe(1);
  });

  it("un type sans événement visible n'a pas de pastille du tout", async () => {
    const j = await creerJeu();
    await db.insert(evenement).values({
      proprieteId: j.p.id, titre: "Degat des eaux", dateDebut: "2026-01-05", type: "sinistre", niveau: 0,
    });

    const proprietaire = await chargerChronologie(j.p.id);
    expect(proprietaire.facettes.map((f) => f.type).sort()).toEqual(["entretien", "sinistre"]);

    // Le sinistre n'a aucun objet lié : il disparaît, et sa pastille avec lui.
    const restreint = await chargerChronologie(j.p.id, {
      portee: { niveauMax: 3, zones: null, systemes: [j.sEau.id] },
    });
    expect(restreint.facettes.map((f) => f.type)).toEqual(["entretien"]);
  });

  it("le compte d'événements visibles décide de l'entrée « Historique »", async () => {
    const j = await creerJeu();
    expect(await compterEvenementsVisibles(j.p.id)).toBe(6);
    expect(await compterEvenementsVisibles(j.p.id, { niveauMax: 3, zones: null, systemes: [j.sEau.id] })).toBe(1);
    // Une portée sur une zone sans objet : aucun événement, donc pas d'entrée
    // « Historique » du tout. Une entrée vers une page vide dirait qu'il en
    // existe un ailleurs.
    expect(await compterEvenementsVisibles(j.p.id, { niveauMax: 3, zones: [j.zGarage.id], systemes: null })).toBe(0);
  });

  it("le filtre par type restreint sans jamais élargir", async () => {
    const j = await creerJeu();
    const portee: Portee = { niveauMax: 3, zones: null, systemes: [j.sEau.id] };
    const rien = await chargerChronologie(j.p.id, { portee, types: ["sinistre"] });
    expect(rien.evenements).toEqual([]);
    const tout = await chargerChronologie(j.p.id, { portee, types: ["entretien"] });
    expect(tout.evenements).toHaveLength(1);
  });
});

describe("intervenants", () => {
  it("le nom ne sort qu'au niveau décidé, et jamais le téléphone", async () => {
    const j = await creerJeu();
    const [prive] = await db.insert(intervenant).values({
      proprieteId: j.p.id, nom: "Sanitaire Dupont SA", metier: "Chauffagiste",
      tel: "079 123 45 67", email: "contact@dupont.example", notes: "Rappeler le matin",
    }).returning();
    const [publie] = await db.insert(intervenant).values({
      proprieteId: j.p.id, nom: "Electricite Martin", metier: "Electricien",
      tel: "079 987 65 43", email: "martin@example.org", niveau: 1,
    }).returning();

    await db.insert(evenementIntervenant).values([
      { evenementId: j.evChaudiere.id, intervenantId: prive.id },
      { evenementId: j.evChaudiere.id, intervenantId: publie.id },
    ]);

    const portee: Portee = { niveauMax: 1, zones: null, systemes: [j.sEau.id] };
    const detail = await chargerEvenementDetail(j.p.id, j.evChaudiere.id, portee);

    // Défaut à 3 : celui qu'on n'a pas décidé de montrer ne sort pas.
    expect(detail.intervenants.map((i) => i.nom)).toEqual(["Electricite Martin"]);

    // Et rien de ce qui joint un tiers, à aucun niveau : le contrat porte sur
    // la charge utile sérialisée, pas sur le rendu.
    const serialise = JSON.stringify(detail);
    for (const secret of ["079 123 45 67", "079 987 65 43", "contact@dupont.example", "martin@example.org", "Rappeler le matin"]) {
      expect(serialise).not.toContain(secret);
    }
  });

  it("le propriétaire voit ses intervenants quel que soit leur niveau", async () => {
    const j = await creerJeu();
    const [prive] = await db.insert(intervenant).values({
      proprieteId: j.p.id, nom: "Sanitaire Dupont SA", metier: "Chauffagiste",
    }).returning();
    await db.insert(evenementIntervenant).values({ evenementId: j.evChaudiere.id, intervenantId: prive.id });

    const detail = await chargerEvenementDetail(j.p.id, j.evChaudiere.id);
    expect(detail.intervenants.map((i) => i.nom)).toEqual(["Sanitaire Dupont SA"]);
  });
});

describe("le coût", () => {
  it("n'est sélectionné par aucune lecture d'historique, à aucun plafond", async () => {
    const j = await creerJeu();
    // Le montant est bien en base : sans ça le test passerait pour la mauvaise
    // raison — il ne trouverait rien parce qu'il n'y a rien.
    const enBase = await db.execute<{ cout: string }>(sql`
      SELECT cout FROM evenement WHERE id = ${j.evChaudiere.id}
    `);
    expect(enBase.rows[0].cout).toBe("4800.00");

    for (const portee of [PORTEE_PROPRIETAIRE, { niveauMax: 3, zones: null, systemes: [j.sEau.id] }]) {
      const chronologie = await chargerChronologie(j.p.id, { portee });
      const detail = await chargerEvenementDetail(j.p.id, j.evChaudiere.id, portee);
      for (const charge of [chronologie, detail]) {
        expect(JSON.stringify(charge)).not.toContain("4800");
      }
    }
  });
});
