// tests/partage/correction.test.ts
// Corriger un lien au lieu d'en recréer un. Tout l'intérêt tient dans une
// négation — le jeton NE tourne PAS — donc c'est elle qu'on épingle, avec les
// deux bords qui l'encadrent : un lien révoqué ne se corrige pas, et ce qu'on
// change s'applique tout de suite à l'adresse déjà distribuée.
import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element, intervenant, partage,
} from "../../app/db/schema/index";
import {
  chargerPartageOu404,
  chargerPartageParJeton,
  chargerPartagesDeLIntervenant,
  creerPartage,
  lireSaisiePartage,
  majPartage,
  partageActif,
} from "../../app/lib/partage/partage.server";
import { chargerContenuPartage } from "../../app/lib/partage/contenu.server";
import { supprimerIntervenant } from "../../app/lib/historique/intervenants.server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `pc-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [zCuisine] = await db
    .insert(zone)
    .values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur", ordre: 0 })
    .returning();
  const [zTechnique] = await db
    .insert(zone)
    .values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique", ordre: 1 })
    .returning();
  const [sEau] = await db.insert(systeme).values({ proprieteId: p.id, nom: "Sanitaire" }).returning();
  const [t] = await db
    .insert(typeElement)
    .values({ origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [] })
    .returning();

  await db.insert(element).values([
    { proprieteId: p.id, nom: "Plaque", typeId: t.id, zoneId: zCuisine.id, niveau: 1 },
    { proprieteId: p.id, nom: "Chaudiere", typeId: t.id, zoneId: zTechnique.id, niveau: 2 },
  ]);

  const [plombier] = await db
    .insert(intervenant)
    .values({ proprieteId: p.id, nom: "Sanitaire Dupont SA", metier: "Chauffagiste", niveau: 3 })
    .returning();

  return { u, p, zCuisine, zTechnique, sEau, plombier };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

/** Le formulaire tel que l'écran l'envoie. */
function formulaire(champs: Record<string, string | string[] | undefined>) {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur === undefined) continue;
    for (const v of Array.isArray(valeur) ? valeur : [valeur]) f.append(cle, v);
  }
  return f;
}

const lienDe = async (j: Jeu, champs: Record<string, string | string[] | undefined> = {}) => {
  const saisie = await lireSaisiePartage(j.p.id, formulaire({ nom: "Lien de test", niveauMax: "1", ...champs }));
  if (!saisie.ok) throw new Error(saisie.message);
  return creerPartage(j.p.id, saisie.valeur);
};

describe("le jeton ne tourne pas", () => {
  // La raison d'être de tout le lot : l'artisan garde l'adresse qu'il a déjà.
  it("corriger le plafond, la portée et le nom laisse l'adresse intacte", async () => {
    const j = await creerJeu();
    const avant = await lienDe(j);

    const saisie = await lireSaisiePartage(
      j.p.id,
      formulaire({ nom: "Plombier", niveauMax: "2", zone: [String(j.zTechnique.id)], systeme: [String(j.sEau.id)] }),
    );
    expect(saisie.ok).toBe(true);
    expect(await majPartage(j.p.id, avant.id, saisie.ok ? saisie.valeur : ({} as never))).toBe(true);

    const apres = await chargerPartageOu404(j.p.id, String(avant.id));
    expect(apres.jeton).toBe(avant.jeton);
    expect(apres.nom).toBe("Plombier");
    expect(apres.niveauMax).toBe(2);
    expect(apres.porteeZones).toEqual([j.zTechnique.id]);
    expect(apres.porteeSystemes).toEqual([j.sEau.id]);
    // Et le jeton résout toujours vers le même lien.
    const etat = await chargerPartageParJeton(avant.jeton);
    expect(etat.statut).toBe("actif");
  });

  // Le cas qui donne son nom au besoin : prolonger le lien du locataire.
  it("prolonge un lien expiré sans lui en donner un nouveau", async () => {
    const j = await creerJeu();
    const hier = new Date(Date.now() - 48 * 3600_000).toISOString().slice(0, 10);
    const lien = await lienDe(j, { expireLe: hier });
    expect(partageActif(lien)).toBe(false);
    expect((await chargerPartageParJeton(lien.jeton)).statut).toBe("inactif");

    const demain = new Date(Date.now() + 48 * 3600_000).toISOString().slice(0, 10);
    const saisie = await lireSaisiePartage(j.p.id, formulaire({ nom: "Lien de test", niveauMax: "1", expireLe: demain }));
    await majPartage(j.p.id, lien.id, saisie.ok ? saisie.valeur : ({} as never));

    const etat = await chargerPartageParJeton(lien.jeton);
    expect(etat.statut).toBe("actif");
  });

  it("retirer l'expiration rend un lien sans terme", async () => {
    const j = await creerJeu();
    const demain = new Date(Date.now() + 48 * 3600_000).toISOString().slice(0, 10);
    const lien = await lienDe(j, { expireLe: demain });

    const saisie = await lireSaisiePartage(j.p.id, formulaire({ nom: "Lien de test", niveauMax: "1", expireLe: "" }));
    await majPartage(j.p.id, lien.id, saisie.ok ? saisie.valeur : ({} as never));

    expect((await chargerPartageOu404(j.p.id, String(lien.id))).expireLe).toBeNull();
  });
});

describe("un lien révoqué est une trace, pas un brouillon", () => {
  it("ne se corrige pas, et rien n'est écrit", async () => {
    const j = await creerJeu();
    const lien = await lienDe(j);
    await db.update(partage).set({ revoqueLe: new Date() }).where(eq(partage.id, lien.id));

    const saisie = await lireSaisiePartage(j.p.id, formulaire({ nom: "Tentative", niveauMax: "3" }));
    expect(await majPartage(j.p.id, lien.id, saisie.ok ? saisie.valeur : ({} as never))).toBe(false);

    const apres = await chargerPartageOu404(j.p.id, String(lien.id));
    expect(apres.nom).toBe("Lien de test");
    expect(apres.niveauMax).toBe(1);
    expect(apres.revoqueLe).not.toBeNull();
  });
});

describe("la correction s'applique tout de suite au lien déjà distribué", () => {
  // C'est le corollaire honnête de « garder la même adresse », et c'est
  // pourquoi l'écran le dit en toutes lettres plutôt que de le laisser
  // découvrir.
  it("monter le plafond ouvre davantage à qui tient déjà le jeton", async () => {
    const j = await creerJeu();
    const lien = await lienDe(j);

    const url = new URL("https://exemple.test/p/x");
    const vu = async () => {
      const etat = await chargerPartageParJeton(lien.jeton);
      if (etat.statut !== "actif") throw new Error("lien inactif");
      const contenu = await chargerContenuPartage(etat.partage, etat.proprieteNom, url);
      return contenu.zones.map((z) => z.nom).sort();
    };

    // Plafond « usage » : la chaudière (niveau technique) est hors de portée,
    // donc sa zone n'a aucun objet visible et ne paraît pas.
    expect(await vu()).toEqual(["Cuisine"]);

    const saisie = await lireSaisiePartage(j.p.id, formulaire({ nom: "Lien de test", niveauMax: "2" }));
    await majPartage(j.p.id, lien.id, saisie.ok ? saisie.valeur : ({} as never));

    expect(await vu()).toEqual(["Cuisine", "Local technique"]);
  });
});

describe("la saisie d'un lien, lue une seule fois pour les deux écrans", () => {
  // `Number("")` vaut 0, c'est-à-dire le plafond le plus OUVERT : le repli
  // silencieux partagerait tout. Le même piège que sur une fiche, à l'envers.
  it("refuse un plafond absent au lieu de le replier sur « public »", async () => {
    const j = await creerJeu();
    const saisie = await lireSaisiePartage(j.p.id, formulaire({ nom: "Lien" }));
    expect(saisie.ok).toBe(false);
    expect(saisie.ok === false && saisie.message).toMatch(/[Pp]lafond/);
  });

  it("écarte une zone et un système qui ne sont pas de la propriété", async () => {
    const j = await creerJeu();
    const voisin = await creerJeu();

    const saisie = await lireSaisiePartage(
      j.p.id,
      formulaire({
        nom: "Lien",
        niveauMax: "1",
        zone: [String(j.zCuisine.id), String(voisin.zCuisine.id)],
        systeme: [String(voisin.sEau.id)],
      }),
    );
    expect(saisie.ok).toBe(true);
    if (!saisie.ok) return;
    expect(saisie.valeur.porteeZones).toEqual([j.zCuisine.id]);
    expect(saisie.valeur.porteeSystemes).toEqual([]);
  });

  it("refuse une personne qui n'est pas du carnet de cette propriété", async () => {
    const j = await creerJeu();
    const voisin = await creerJeu();

    const saisie = await lireSaisiePartage(
      j.p.id,
      formulaire({ nom: "Lien", niveauMax: "1", intervenantId: String(voisin.plombier.id) }),
    );
    expect(saisie.ok).toBe(false);
    expect(saisie.ok === false && saisie.message).toMatch(/[Ii]ntervenant/);
  });
});

describe("le lien rattaché à une personne du carnet", () => {
  it("se retrouve depuis sa fiche", async () => {
    const j = await creerJeu();
    const lien = await lienDe(j, { intervenantId: String(j.plombier.id) });
    await lienDe(j); // sans personne : ne doit pas remonter

    const siens = await chargerPartagesDeLIntervenant(j.p.id, j.plombier.id);
    expect(siens.map((p) => p.id)).toEqual([lien.id]);
  });

  // `ON DELETE SET NULL`, jamais CASCADE : le retirer du carnet n'est pas
  // révoquer son lien. Ce qui a été ouvert reste ouvert tant qu'on ne l'a pas
  // coupé, et la décision de couper se prend ailleurs, exprès.
  it("survit à la suppression de la personne, sans être révoqué", async () => {
    const j = await creerJeu();
    const lien = await lienDe(j, { intervenantId: String(j.plombier.id) });

    await supprimerIntervenant(j.p.id, j.plombier.id);

    const apres = await chargerPartageOu404(j.p.id, String(lien.id));
    expect(apres.intervenantId).toBeNull();
    expect(apres.revoqueLe).toBeNull();
    expect(apres.jeton).toBe(lien.jeton);
    expect((await chargerPartageParJeton(lien.jeton)).statut).toBe("actif");
  });

  // Le rattachement est une commodité de gestion, pas une donnée du partage :
  // le nom de la personne et le nom du lien restent du côté du propriétaire.
  it("ne fait sortir ni le nom du lien ni celui de la personne vers /p/", async () => {
    const j = await creerJeu();
    const lien = await lienDe(j, { nom: "Plombier — clé sous le paillasson", intervenantId: String(j.plombier.id) });

    const etat = await chargerPartageParJeton(lien.jeton);
    if (etat.statut !== "actif") throw new Error("lien inactif");
    const contenu = await chargerContenuPartage(etat.partage, etat.proprieteNom, new URL("https://exemple.test/p/x"));

    const rendu = JSON.stringify(contenu);
    expect(rendu).not.toContain("paillasson");
    expect(rendu).not.toContain("Sanitaire Dupont SA");
    expect(contenu.proprieteNom).toBe("Maison de test");
  });
});
