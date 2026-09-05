// tests/historique/routes.test.ts
// Ce que les routes de partage de l'historique répondent, et ce que le HDML
// servi au destinataire contient — c'est-à-dire ce qui peut fuir.
//
// Le troisième droit sur les fichiers a sa section : `photoDUnEvenement` est
// une branche nommée à côté de `photoDUneFiche` et `imageDUnPlan`, et le test
// vérifie qu'elle s'ouvre sur la visibilité de l'ÉVÉNEMENT et rien d'autre.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import type { RolePhotoEvenement } from "../../app/lib/historique/types";
import {
  utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element,
  evenement, evenementElement, evenementIntervenant, intervenant,
  fichier, fichierLien, partage,
} from "../../app/db/schema/index";
import { creerJeton } from "../../app/lib/partage/partage.server";

process.env.STOCKAGE_RACINE = await mkdtemp(join(tmpdir(), "gi-historique-"));
const { sauvegarder } = await import("../../app/lib/stockage/fichiers.server");
const routeHistorique = await import("../../app/routes/_partage/historique");
const routeEvenement = await import("../../app/routes/_partage/evenement");
const routeFichiers = await import("../../app/routes/_partage/fichiers");
const { PageHistorique } = await import("../../app/components/partage/PageHistorique");
const { FicheEvenement } = await import("../../app/components/partage/FicheEvenement");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const COUT = "48000.00";
const TEL = "079 123 45 67";
const COURRIEL = "contact@dupont.example";
const NOTES = "Toujours rappeler avant 9h";

/**
 * Deux zones, deux événements : l'un entièrement dans la portée du lien,
 * l'autre qui déborde sur le local technique. Le lien porte sur la cuisine.
 */
async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `hr-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique" }).returning();
  await db.insert(systeme).values({ proprieteId: p.id, nom: "Sanitaire" });

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();

  const [eInduction] = await db.insert(element).values({
    proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: zCuisine.id, niveau: 0,
  }).returning();
  const [eChaudiere] = await db.insert(element).values({
    proprieteId: p.id, nom: "Chaudiere", typeId: t.id, zoneId: zTechnique.id, niveau: 0,
  }).returning();

  const [evVisible] = await db.insert(evenement).values({
    proprieteId: p.id, titre: "Remplacement de l'induction", dateDebut: "2026-03-01",
    type: "installation", niveau: 0, description: "Plaque neuve, garantie deux ans.", cout: COUT,
  }).returning();
  await db.insert(evenementElement).values({ evenementId: evVisible.id, elementId: eInduction.id });

  // Déborde : lié à la cuisine ET au local technique. Sous un `EXISTS` il
  // serait servi, et son titre parle de la toiture.
  const [evDeborde] = await db.insert(evenement).values({
    proprieteId: p.id, titre: "Refection de la toiture", dateDebut: "2026-02-01",
    type: "renovation", niveau: 0, cout: COUT,
  }).returning();
  await db.insert(evenementElement).values([
    { evenementId: evDeborde.id, elementId: eInduction.id },
    { evenementId: evDeborde.id, elementId: eChaudiere.id },
  ]);

  const [artisan] = await db.insert(intervenant).values({
    proprieteId: p.id, nom: "Sanitaire Dupont SA", metier: "Chauffagiste",
    tel: TEL, email: COURRIEL, notes: NOTES, niveau: 0,
  }).returning();
  await db.insert(evenementIntervenant).values({ evenementId: evVisible.id, intervenantId: artisan.id });

  const jeton = creerJeton();
  const [lien] = await db.insert(partage).values({
    proprieteId: p.id, nom: "Locataires 12-19 aout", jeton, niveauMax: 1, porteeZones: [zCuisine.id],
  }).returning();

  return { u, p, zCuisine, zTechnique, eInduction, eChaudiere, evVisible, evDeborde, artisan, jeton, lien };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

const args = (url: string, params: Record<string, string>) =>
  ({ request: new Request(url), params }) as unknown as LoaderFunctionArgs;

/** Une photo attachée à une cible polymorphe quelconque. */
async function photo(
  j: Jeu,
  cibleType: string,
  cibleId: number,
  chemin: string,
  role: RolePhotoEvenement = "general",
) {
  const [f] = await db.insert(fichier).values({
    proprieteId: j.p.id, chemin, typeMime: "image/jpeg", taille: 3,
  }).returning();
  await db.insert(fichierLien).values({ fichierId: f.id, cibleType, cibleId, role });
  await sauvegarder(chemin, Buffer.from("jpg"));
  return f;
}

describe("/p/:jeton/historique", () => {
  it("ne sert que les événements dont TOUS les objets sont dans la portée", async () => {
    const j = await creerJeu();
    const d = await routeHistorique.loader(args(`http://test/p/${j.jeton}/historique`, { jeton: j.jeton }));
    expect(d.actif).toBe(true);
    if (!d.actif) return;

    expect(d.historique.evenements.map((e) => e.titre)).toEqual(["Remplacement de l'induction"]);
    expect(d.historique.total).toBe(1);
  });

  it("ne laisse passer ni le coût ni le titre de l'événement qui déborde", async () => {
    const j = await creerJeu();
    const d = await routeHistorique.loader(args(`http://test/p/${j.jeton}/historique`, { jeton: j.jeton }));
    const charge = JSON.stringify(d);

    expect(charge).not.toContain("48000");
    expect(charge).not.toContain("Refection de la toiture");
  });

  it("filtre par type sans jamais élargir", async () => {
    const j = await creerJeu();
    const d = await routeHistorique.loader(
      args(`http://test/p/${j.jeton}/historique?type=renovation`, { jeton: j.jeton }),
    );
    if (!d.actif) throw new Error("lien inactif");
    // « Refection de la toiture » est une rénovation, mais elle est hors
    // portée : le filtre ne peut pas la ramener.
    expect(d.historique.evenements).toEqual([]);
  });

  it("ignore un type inconnu au lieu de rejeter la page", async () => {
    const j = await creerJeu();
    const d = await routeHistorique.loader(
      args(`http://test/p/${j.jeton}/historique?type=nimportequoi`, { jeton: j.jeton }),
    );
    if (!d.actif) throw new Error("lien inactif");
    expect(d.historique.types).toEqual([]);
    expect(d.historique.evenements).toHaveLength(1);
  });

  it("rend la page neutre sur un lien révoqué, sans rien charger", async () => {
    const j = await creerJeu();
    const [mort] = await db.insert(partage).values({
      proprieteId: j.p.id, nom: "Ancien", jeton: creerJeton(), niveauMax: 3,
      revoqueLe: new Date(Date.now() - 86_400_000),
    }).returning();

    const d = await routeHistorique.loader(args(`http://test/p/${mort.jeton}/historique`, { jeton: mort.jeton }));
    expect(d.actif).toBe(false);
    expect(JSON.stringify(d)).not.toContain("Maison de test");
  });
});

describe("/p/:jeton/evenements/:id", () => {
  it("sert un événement dans la portée", async () => {
    const j = await creerJeu();
    const d = await routeEvenement.loader(
      args(`http://test/p/${j.jeton}/evenements/${j.evVisible.id}`, { jeton: j.jeton, evenementId: String(j.evVisible.id) }),
    );
    if (!d.actif) throw new Error("lien inactif");
    expect(d.evenement.titre).toBe("Remplacement de l'induction");
  });

  it("répond 404 — jamais 403 — sur un événement qui déborde", async () => {
    const j = await creerJeu();
    await expect(
      routeEvenement.loader(
        args(`http://test/p/${j.jeton}/evenements/${j.evDeborde.id}`, { jeton: j.jeton, evenementId: String(j.evDeborde.id) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("répond 404 sur un identifiant qui n'en est pas un", async () => {
    const j = await creerJeu();
    for (const evenementId of ["0", "-3", "abc", ""]) {
      await expect(
        routeEvenement.loader(args(`http://test/p/${j.jeton}/evenements/${evenementId}`, { jeton: j.jeton, evenementId })),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("ne sert ni coût, ni niveau, ni coordonnées d'intervenant", async () => {
    const j = await creerJeu();
    const d = await routeEvenement.loader(
      args(`http://test/p/${j.jeton}/evenements/${j.evVisible.id}`, { jeton: j.jeton, evenementId: String(j.evVisible.id) }),
    );
    if (!d.actif) throw new Error("lien inactif");

    // L'intervenant est à niveau 0 : son nom et son métier passent, c'est
    // justement ce qui rend le test des coordonnées significatif.
    expect(d.evenement.intervenants).toEqual([
      { id: j.artisan.id, nom: "Sanitaire Dupont SA", metier: "Chauffagiste" },
    ]);

    const charge = JSON.stringify(d);
    for (const secret of [COUT, "48000", TEL, COURRIEL, NOTES]) {
      expect(charge).not.toContain(secret);
    }
    expect(d.evenement).not.toHaveProperty("niveau");
    expect(d.evenement).not.toHaveProperty("cout");
  });

  it("masque un intervenant resté au niveau par défaut", async () => {
    const j = await creerJeu();
    const [discret] = await db.insert(intervenant).values({
      proprieteId: j.p.id, nom: "Serrurier Nuit et Jour", metier: "Serrurier", tel: TEL,
    }).returning();
    await db.insert(evenementIntervenant).values({ evenementId: j.evVisible.id, intervenantId: discret.id });

    const d = await routeEvenement.loader(
      args(`http://test/p/${j.jeton}/evenements/${j.evVisible.id}`, { jeton: j.jeton, evenementId: String(j.evVisible.id) }),
    );
    if (!d.actif) throw new Error("lien inactif");
    expect(d.evenement.intervenants.map((i) => i.nom)).toEqual(["Sanitaire Dupont SA"]);
    expect(JSON.stringify(d)).not.toContain("Serrurier Nuit et Jour");
  });
});

describe("le troisième droit sur les fichiers", () => {
  it("sert la photo d'un événement visible", async () => {
    const j = await creerJeu();
    const f = await photo(j, "evenement", j.evVisible.id, "evenement-ok.jpg");

    const reponse = await routeFichiers.loader(
      args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) }),
    );
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("refuse la photo d'un événement qui déborde", async () => {
    const j = await creerJeu();
    const f = await photo(j, "evenement", j.evDeborde.id, "evenement-hors.jpg");

    await expect(
      routeFichiers.loader(args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) })),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ignore le rôle : « avant » n'ouvre ni ne ferme rien", async () => {
    const j = await creerJeu();
    // Le rôle est du récit — « voici l'avant, voici l'après » — et il ne doit
    // apparaître dans AUCUN prédicat. Les deux bords le prouvent : sur un
    // événement visible la photo passe quel que soit le rôle, et sur un
    // événement qui déborde elle est refusée avec le même rôle. Si un jour
    // quelqu'un ajoute un filtre par rôle en croyant fermer quelque chose,
    // c'est ce test qui tombe.
    const ouverte = await photo(j, "evenement", j.evVisible.id, "avant-ok.jpg", "avant");
    const fermee = await photo(j, "evenement", j.evDeborde.id, "avant-hors.jpg", "avant");

    const reponse = await routeFichiers.loader(
      args(`http://test/p/${j.jeton}/fichiers/${ouverte.id}`, { jeton: j.jeton, fichierId: String(ouverte.id) }),
    );
    expect(reponse.status).toBe(200);

    await expect(
      routeFichiers.loader(
        args(`http://test/p/${j.jeton}/fichiers/${fermee.id}`, { jeton: j.jeton, fichierId: String(fermee.id) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ignore `fichier.niveau` : c'est l'événement qui porte la permission", async () => {
    const j = await creerJeu();
    const f = await photo(j, "evenement", j.evVisible.id, "evenement-niveau3.jpg");
    // La capture écrit toujours 3. Le lire ici masquerait toutes les photos de
    // tous les partages.
    await db.execute(sql`UPDATE fichier SET niveau = 3 WHERE id = ${f.id}`);

    const reponse = await routeFichiers.loader(
      args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) }),
    );
    expect(reponse.status).toBe(200);
  });

  it("ne sert JAMAIS le fichier d'un intervenant, même visible", async () => {
    const j = await creerJeu();
    // L'artisan est à niveau 0 et cité par un événement servi : s'il existait
    // une quatrième branche, elle s'ouvrirait ici. Il n'y en a pas — une carte
    // de visite ou une facture n'a rien à faire dans un lien.
    const f = await photo(j, "intervenant", j.artisan.id, "carte-visite.jpg");

    await expect(
      routeFichiers.loader(args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) })),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ne sert plus rien dès que le lien est révoqué", async () => {
    const j = await creerJeu();
    const f = await photo(j, "evenement", j.evVisible.id, "evenement-revoque.jpg");
    await db.execute(sql`UPDATE partage SET revoque_le = now() WHERE id = ${j.lien.id}`);

    await expect(
      routeFichiers.loader(args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) })),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("HTML servi au destinataire", () => {
  // MemoryRouter : les composants partagés rendent des <Link> côté propriétaire.
  const rendre = <P extends object>(Composant: ComponentType<P>, props: P) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/p/x"] }, createElement(Composant, props)),
    );

  it("la chronologie n'écrit aucune URL protégée", async () => {
    const j = await creerJeu();
    const d = await routeHistorique.loader(args(`http://test/p/${j.jeton}/historique`, { jeton: j.jeton }));
    if (!d.actif) throw new Error("lien inactif");

    const html = rendre(PageHistorique, { historique: d.historique, jeton: j.jeton });
    // Le titre est rendu avec son apostrophe échappée (`&#x27;`) : on cherche
    // le fragment sans elle, pour ne pas dépendre de l'échappement de React.
    expect(html).toContain("Remplacement de l");
    expect(html).toContain("Induction");
    expect(html).not.toContain("Refection de la toiture");
    expect(html).not.toContain("/proprietes/");
    expect(html).not.toContain("Locataires 12-19 aout");
  });

  it("la page d'un événement ne rend ni coût ni coordonnées", async () => {
    const j = await creerJeu();
    const d = await routeEvenement.loader(
      args(`http://test/p/${j.jeton}/evenements/${j.evVisible.id}`, { jeton: j.jeton, evenementId: String(j.evVisible.id) }),
    );
    if (!d.actif) throw new Error("lien inactif");

    const html = rendre(FicheEvenement, { evenement: d.evenement, jeton: j.jeton });
    expect(html).toContain("Sanitaire Dupont SA");
    for (const secret of ["48000", TEL, COURRIEL, NOTES]) {
      expect(html).not.toContain(secret);
    }
    expect(html).not.toContain("/proprietes/");
  });
});
