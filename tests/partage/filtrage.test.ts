// tests/partage/filtrage.test.ts
// Le cœur de l'étape 3. Chaque test correspond à une surface qui rend une
// donnée dérivée de la base : résultats, compte, facette, tuile de zone,
// suggestions de l'état vide, champs d'une fiche, octets d'une image.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element,
  fichier, fichierLien, partage,
} from "../../app/db/schema/index";
import type { ChampDefinition } from "../../app/db/schema/types";
import { chargerFacettes, chargerZonesVignettes, rechercher } from "../../app/lib/recherche/recherche.server";
import { porteeDuPartage, partageActif, creerJeton } from "../../app/lib/partage/partage.server";
import {
  chargerContenuPartage, chargerFichePartage, chargerFichierPartage,
} from "../../app/lib/partage/contenu.server";
import { champsVisibles } from "../../app/lib/partage/champs";

// DELETE et non TRUNCATE ... CASCADE : voir tests/recherche/requete.test.ts.
beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const CHAMPS: ChampDefinition[] = [
  { cle: "marque", label: "Marque", genre: "texte", niveauMin: 0, obligatoire: false },
  { cle: "mode_emploi", label: "Comment ça marche", genre: "texte", niveauMin: 1, obligatoire: false },
  { cle: "numero_serie", label: "Numéro de série", genre: "texte", niveauMin: 2, obligatoire: false },
  { cle: "prix_achat", label: "Prix d'achat", genre: "nombre", unite: "CHF", niveauMin: 3, obligatoire: false },
];

/**
 * Trois zones, deux systèmes, et des fiches réparties sur les quatre niveaux :
 * de quoi éprouver un plafond, une portée de zones et une portée de systèmes
 * sans que le jeu devienne illisible.
 */
async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `p-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({
    proprietaireId: u.id,
    nom: "Maison de test",
    adresse: "12 chemin des Vignes, 1260 Nyon",
    egid: "987654321",
  }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();

  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur", ordre: 0 }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique", ordre: 1 }).returning();
  const [zJardin] = await db.insert(zone).values({ proprieteId: p.id, niveauId: null, nom: "Jardin", type: "exterieur" }).returning();

  const [sEau] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Sanitaire" }).returning();
  const [sElec] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Electricite" }).returning();

  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Chaudiere-${marque}`, champs: CHAMPS, alias: [],
  }).returning();

  // Un type perso qu'aucune fiche ne porte : c'est le cas que l'état vide
  // proposerait, et qui dirait comment le propriétaire nomme ses affaires.
  const [tInutilise] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Cavealavins-${marque}`, champs: [], alias: [],
  }).returning();

  const details = {
    marque: "Viessmann",
    mode_emploi: "Bouton vert a gauche",
    numero_serie: "SN-000-111",
    prix_achat: 4200,
  };

  const [eInduction] = await db.insert(element).values({
    proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: zCuisine.id, systemeId: sElec.id, niveau: 1, details,
  }).returning();
  const [eChaudiere] = await db.insert(element).values({
    proprieteId: p.id, nom: "Chaudiere", typeId: t.id, zoneId: zTechnique.id, systemeId: sEau.id, niveau: 2, details,
  }).returning();
  const [eCoffre] = await db.insert(element).values({
    proprieteId: p.id, nom: "Papiers", typeId: t.id, zoneId: zTechnique.id, niveau: 3, details,
  }).returning();
  const [eArrosage] = await db.insert(element).values({
    proprieteId: p.id, nom: "Vanne arrosage", typeId: t.id, zoneId: zJardin.id, systemeId: sEau.id, niveau: 1, details,
  }).returning();

  return { u, p, zCuisine, zTechnique, zJardin, sEau, sElec, t, tInutilise, eInduction, eChaudiere, eCoffre, eArrosage };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

async function creerPartage(j: Jeu, valeurs: Partial<typeof partage.$inferInsert> = {}) {
  const [p] = await db.insert(partage).values({
    proprieteId: j.p.id,
    nom: "Lien de test",
    jeton: creerJeton(),
    niveauMax: 1,
    porteeZones: [],
    porteeSystemes: [],
    ...valeurs,
  }).returning();
  return p;
}

describe("plafond de niveau", () => {
  it("écarte une fiche trop privée des résultats, du compte, des facettes et des tuiles de zone", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 1 });
    const portee = porteeDuPartage(p);

    const r = await rechercher({ proprieteId: j.p.id, q: "", portee });
    expect(r.resultats.map((x) => x.nom).sort()).toEqual(["Induction", "Vanne arrosage"]);
    expect(r.total).toBe(2);

    // Le compte de la facette est celui du fonds : il doit être celui du
    // fonds VISIBLE, sinon la pastille annonce ce qu'elle ne montre pas.
    const facettes = await chargerFacettes(j.p.id, portee);
    expect(facettes.zones.map((z) => z.nom).sort()).toEqual(["Cuisine", "Jardin"]);
    expect(facettes.zones.every((z) => z.nombre === 1)).toBe(true);
    expect(facettes.systemes.map((s) => `${s.nom}:${s.nombre}`).sort()).toEqual(["Electricite:1", "Sanitaire:1"]);
    expect(facettes.types[0].nombre).toBe(2);

    // « Local technique » ne contient que des fiches de niveau 2 et 3 : la
    // tuile disparaît au lieu d'annoncer « 0 objet ».
    const grille = await chargerZonesVignettes(j.p.id, portee);
    expect(grille.map((z) => z.nom)).toEqual(["Cuisine", "Jardin"]);
  });

  it("laisse tout passer au plafond le plus haut", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 3 });

    const r = await rechercher({ proprieteId: j.p.id, q: "", portee: porteeDuPartage(p) });
    expect(r.total).toBe(4);
  });
});

describe("portée de zones et de systèmes", () => {
  it("ne laisse une zone hors portée apparaître nulle part", async () => {
    const j = await creerJeu();
    const jardinier = await creerPartage(j, { niveauMax: 2, porteeZones: [j.zJardin.id] });
    const portee = porteeDuPartage(jardinier);

    const r = await rechercher({ proprieteId: j.p.id, q: "", portee });
    expect(r.resultats.map((x) => x.nom)).toEqual(["Vanne arrosage"]);

    const facettes = await chargerFacettes(j.p.id, portee);
    expect(facettes.zones.map((z) => z.nom)).toEqual(["Jardin"]);

    const grille = await chargerZonesVignettes(j.p.id, portee);
    expect(grille.map((z) => z.nom)).toEqual(["Jardin"]);

    // Cocher une facette hors portée à la main ne la fait pas revenir : la
    // portée et les facettes se cumulent, elles ne se remplacent pas.
    const triche = await rechercher({
      proprieteId: j.p.id, q: "", portee,
      facettes: { zones: [j.zCuisine.id], systemes: [], types: [] },
    });
    expect(triche.total).toBe(0);
  });

  it("ramène l'objet d'un système hors des zones de la portée (le filtre est un OU)", async () => {
    const j = await creerJeu();
    const artisan = await creerPartage(j, { niveauMax: 2, porteeZones: [j.zCuisine.id], porteeSystemes: [j.sEau.id] });

    const r = await rechercher({ proprieteId: j.p.id, q: "", portee: porteeDuPartage(artisan) });
    expect(r.resultats.map((x) => x.nom).sort()).toEqual(["Chaudiere", "Induction", "Vanne arrosage"]);
  });

  it("donne toute la propriété à une portée vide, dans la limite du plafond", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 2, porteeZones: [], porteeSystemes: [] });
    const portee = porteeDuPartage(p);
    expect(portee).toEqual({ niveauMax: 2, zones: null, systemes: null });

    const r = await rechercher({ proprieteId: j.p.id, q: "", portee });
    expect(r.resultats.map((x) => x.nom).sort()).toEqual(["Chaudiere", "Induction", "Vanne arrosage"]);

    const grille = await chargerZonesVignettes(j.p.id, portee);
    expect(grille.map((z) => z.nom)).toEqual(["Cuisine", "Local technique", "Jardin"]);
  });
});

describe("état vide", () => {
  it("ne propose aucun type du catalogue sous portée restreinte", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 1 });

    const r = await rechercher({ proprieteId: j.p.id, q: j.tInutilise.nom, portee: porteeDuPartage(p) });
    expect(r.total).toBe(0);
    expect(r.typesProches).toEqual([]);

    // Le propriétaire, lui, garde ses suggestions : c'est l'état vide utile
    // de l'étape 2, et il n'a rien à se cacher à lui-même.
    const proprietaire = await rechercher({ proprieteId: j.p.id, q: j.tInutilise.nom });
    expect(proprietaire.total).toBe(0);
    expect(proprietaire.typesProches.map((t) => t.nom)).toContain(j.tInutilise.nom);
  });
});

describe("l'index plein texte ne sert pas d'oracle", () => {
  it("ne remonte rien sur la valeur d'un détail, même celle d'un champ visible", async () => {
    const j = await creerJeu();
    const locataire = await creerPartage(j, { niveauMax: 1 });
    const portee = porteeDuPartage(locataire);

    // Le numéro de série est un champ de niveau « technique » : la fiche
    // « Induction » est visible, sa valeur ne l'est pas. La retrouver par la
    // recherche la confirmerait sans jamais l'afficher.
    const oracle = await rechercher({ proprieteId: j.p.id, q: "SN-000-111", portee });
    expect(oracle.total).toBe(0);

    // Le prix d'achat non plus, et il est de niveau « privé ».
    expect((await rechercher({ proprieteId: j.p.id, q: "4200", portee })).total).toBe(0);

    // Contrepartie assumée : l'index ne sait pas de quel champ vient un
    // lexème, donc AUCUNE valeur de détail n'est cherchable sous portée
    // restreinte, pas même celle d'un champ que le lien affiche.
    expect((await rechercher({ proprieteId: j.p.id, q: "Bouton vert", portee })).total).toBe(0);

    // Le nom, le type, la zone et le système continuent de classer.
    expect((await rechercher({ proprieteId: j.p.id, q: "induction", portee })).total).toBe(1);
    expect((await rechercher({ proprieteId: j.p.id, q: "cuisine", portee })).total).toBe(1);

    // Le propriétaire, lui, cherche toujours dans ses détails.
    expect((await rechercher({ proprieteId: j.p.id, q: "SN-000-111" })).total).toBe(4);
    expect((await rechercher({ proprieteId: j.p.id, q: "SN-000-111" })).resultats[0].motif).toBe("details");
  });

  it("tient le budget de 150 ms malgré la perte de l'index GIN", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 2 });
    await db.insert(element).values(
      Array.from({ length: 200 }, (_, i) => ({
        proprieteId: j.p.id, nom: `Purge ${i}`, typeId: j.t.id, zoneId: j.zCuisine.id, niveau: 1,
        details: { mode_emploi: `remplacee en ${2000 + (i % 25)}` },
      })),
    );

    const r = await rechercher({ proprieteId: j.p.id, q: "purge", portee: porteeDuPartage(p) });
    expect(r.total).toBe(200);
    expect(r.ms).toBeLessThan(150);
  });

  it("n'étiquette jamais « détails » un résultat de partage", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 3, porteeZones: [j.zCuisine.id] });

    const r = await rechercher({ proprieteId: j.p.id, q: "induction", portee: porteeDuPartage(p) });
    expect(r.resultats.map((x) => x.motif)).toEqual(["nom"]);
  });
});

describe("niveau_min par champ", () => {
  it("rend la fiche mais pas les champs qui dépassent le plafond", async () => {
    const j = await creerJeu();
    const locataire = await creerPartage(j, { niveauMax: 1, porteeZones: [j.zCuisine.id] });

    const fiche = await chargerFichePartage(locataire, j.p.nom, String(j.eInduction.id));

    expect(fiche.nom).toBe("Induction");
    expect(fiche.champs.map((c) => c.label)).toEqual(["Marque", "Comment ça marche"]);
    // La valeur masquée n'est pas seulement cachée à l'affichage : elle n'est
    // pas dans ce que le loader renvoie, donc pas dans le HTML servi.
    expect(JSON.stringify(fiche)).not.toContain("SN-000-111");
    expect(JSON.stringify(fiche)).not.toContain("4200");
  });

  it("rend tous les champs au plafond le plus haut, et l'unité avec la valeur", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 3 });

    const fiche = await chargerFichePartage(p, j.p.nom, String(j.eChaudiere.id));
    expect(fiche.champs.map((c) => c.valeur)).toEqual([
      "Viessmann", "Bouton vert a gauche", "SN-000-111", "4200 CHF",
    ]);
  });

  it("répond 404 sur une fiche filtrée, jamais 403", async () => {
    const j = await creerJeu();
    const locataire = await creerPartage(j, { niveauMax: 1 });

    await expect(chargerFichePartage(locataire, j.p.nom, String(j.eCoffre.id)))
      .rejects.toMatchObject({ status: 404 });
  });

  it("champsVisibles écarte le genre fichier, les valeurs vides et les clés orphelines", () => {
    const rendus = champsVisibles(
      CHAMPS.concat({ cle: "notice", label: "Notice", genre: "fichier", niveauMin: 0, obligatoire: false }),
      { marque: "  ", mode_emploi: "ok", notice: "x.pdf", champ_retire: "valeur d'un champ supprime du type" },
      3,
    );
    expect(rendus.map((c) => c.cle)).toEqual(["mode_emploi"]);
  });
});

describe("images portées par le jeton", () => {
  it("sert celle d'une fiche visible et répond 404 pour celle d'une fiche filtrée", async () => {
    const j = await creerJeu();
    const locataire = await creerPartage(j, { niveauMax: 1 });

    const photo = async (elementId: number, chemin: string) => {
      const [f] = await db.insert(fichier).values({
        proprieteId: j.p.id, chemin, typeMime: "image/jpeg", taille: 1, zoneId: j.zCuisine.id,
      }).returning();
      await db.insert(fichierLien).values({ fichierId: f.id, cibleType: "element", cibleId: elementId });
      return f;
    };

    const visible = await photo(j.eInduction.id, "visible.jpg");
    const cachee = await photo(j.eCoffre.id, "cachee.jpg");

    expect((await chargerFichierPartage(locataire, String(visible.id))).chemin).toBe("visible.jpg");
    await expect(chargerFichierPartage(locataire, String(cachee.id))).rejects.toMatchObject({ status: 404 });

    // Un fichier d'une autre propriété, avec un identifiant valide ailleurs.
    const autre = await creerJeu();
    const [f] = await db.insert(fichier).values({
      proprieteId: autre.p.id, chemin: "voisin.jpg", typeMime: "image/jpeg", taille: 1,
    }).returning();
    await db.insert(fichierLien).values({ fichierId: f.id, cibleType: "element", cibleId: autre.eInduction.id });
    await expect(chargerFichierPartage(locataire, String(f.id))).rejects.toMatchObject({ status: 404 });
  });

  it("ne compte comme visible que les photos de la fiche demandée", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 3 });

    const [f] = await db.insert(fichier).values({
      proprieteId: j.p.id, chemin: "chaudiere.jpg", typeMime: "image/jpeg", taille: 1,
    }).returning();
    await db.insert(fichierLien).values({ fichierId: f.id, cibleType: "element", cibleId: j.eChaudiere.id });

    expect((await chargerFichePartage(p, j.p.nom, String(j.eChaudiere.id))).photos).toEqual([f.id]);
    expect((await chargerFichePartage(p, j.p.nom, String(j.eInduction.id))).photos).toEqual([]);
  });
});

describe("contenu complet d'un partage", () => {
  it("ne porte ni adresse, ni EGID, ni identifiant de propriété", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 2 });

    const donnees = await chargerContenuPartage(p, j.p.nom, new URL("http://test/p/x"));
    const serialise = JSON.stringify(donnees);

    expect(donnees.proprieteNom).toBe("Maison de test");
    expect(serialise).not.toContain("chemin des Vignes");
    expect(serialise).not.toContain("987654321");
    expect(serialise).not.toContain("proprieteId");
    // Le nom du partage est l'étiquette privée du propriétaire.
    expect(serialise).not.toContain("Lien de test");
  });

  it("bascule sur la liste dès qu'un texte ou une facette est présent", async () => {
    const j = await creerJeu();
    const p = await creerPartage(j, { niveauMax: 2 });

    const grille = await chargerContenuPartage(p, j.p.nom, new URL("http://test/p/x"));
    expect(grille.liste).toBe(false);
    expect(grille.zones.map((z) => z.nom)).toEqual(["Cuisine", "Local technique", "Jardin"]);

    const filtree = await chargerContenuPartage(p, j.p.nom, new URL(`http://test/p/x?zone=${j.zJardin.id}`));
    expect(filtree.liste).toBe(true);
    expect(filtree.recherche.resultats.map((r) => r.nom)).toEqual(["Vanne arrosage"]);
  });
});

describe("expiration et révocation", () => {
  it("juge l'activité sur revoqueLe puis sur expireLe", async () => {
    const j = await creerJeu();
    const hier = new Date(Date.now() - 86_400_000);
    const demain = new Date(Date.now() + 86_400_000);

    expect(partageActif(await creerPartage(j, {}))).toBe(true);
    expect(partageActif(await creerPartage(j, { expireLe: demain }))).toBe(true);
    expect(partageActif(await creerPartage(j, { expireLe: hier }))).toBe(false);
    expect(partageActif(await creerPartage(j, { revoqueLe: hier }))).toBe(false);
    // Révoqué l'emporte sur une expiration lointaine.
    expect(partageActif(await creerPartage(j, { expireLe: demain, revoqueLe: hier }))).toBe(false);
  });
});
