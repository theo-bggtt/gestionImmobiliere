// tests/partage/routes.test.ts
// Les routes du partage : ce qu'elles répondent, et ce que le HTML servi
// contient — c'est-à-dire ce qui peut fuir chez le destinataire.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element,
  fichier, fichierLien, partage, session,
} from "../../app/db/schema/index";
import type { ChampDefinition } from "../../app/db/schema/types";
import { creerJeton } from "../../app/lib/partage/partage.server";
import { documentSansScripts, ENTETES_PARTAGE } from "../../app/lib/partage/document";
import { PagePartage, PartageInactif } from "../../app/components/partage/PagePartage";
import { FicheObjet } from "../../app/components/partage/FicheObjet";

// La couche de stockage résout sa racine à l'import : la fixer avant de
// charger les routes, sinon le test lirait dans le volume de développement.
process.env.STOCKAGE_RACINE = await mkdtemp(join(tmpdir(), "gi-partage-"));
const { sauvegarder } = await import("../../app/lib/stockage/fichiers.server");
const routePage = await import("../../app/routes/_partage/page");
const routeObjet = await import("../../app/routes/_partage/objet");
const routeFichiers = await import("../../app/routes/_partage/fichiers");
const routeApercu = await import("../../app/routes/_app/partages.$partageId.apercu");
const { sessionCookie } = await import("../../app/lib/auth/cookie.server");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const CHAMPS: ChampDefinition[] = [
  { cle: "mode_emploi", label: "Comment ça marche", genre: "texte", niveauMin: 1, obligatoire: false },
  { cle: "numero_serie", label: "Numéro de série", genre: "texte", niveauMin: 2, obligatoire: false },
];

const ADRESSE = "12 chemin des Vignes, 1260 Nyon";
const EGID = "987654321";

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `r-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({
    proprietaireId: u.id, nom: "Maison de test", adresse: ADRESSE, egid: EGID,
  }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [zCuisine] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [zTechnique] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique" }).returning();
  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: CHAMPS, alias: [],
  }).returning();

  const details = { mode_emploi: "Bouton vert", numero_serie: "SN-000-111" };
  const [visible] = await db.insert(element).values({
    proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: zCuisine.id, niveau: 1, details,
  }).returning();
  const [cache] = await db.insert(element).values({
    proprieteId: p.id, nom: "Papiers", typeId: t.id, zoneId: zTechnique.id, niveau: 3, details,
  }).returning();

  const jeton = creerJeton();
  const [lien] = await db.insert(partage).values({
    proprieteId: p.id, nom: "Locataires 12-19 aout", jeton, niveauMax: 1,
  }).returning();

  const cookieJeton = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: cookieJeton, utilisateurId: u.id, expireLe: new Date(Date.now() + 3600_000) });
  const cookie = (await sessionCookie.serialize(cookieJeton)).split(";")[0];

  return { u, p, zCuisine, zTechnique, t, visible, cache, jeton, lien, cookie };
}

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

const args = (url: string, params: Record<string, string>, cookie?: string) =>
  ({
    request: new Request(url, cookie ? { headers: { Cookie: cookie } } : undefined),
    params,
  }) as unknown as LoaderFunctionArgs;

async function photo(j: Jeu, elementId: number, chemin: string) {
  const [f] = await db.insert(fichier).values({
    proprieteId: j.p.id, chemin, typeMime: "image/jpeg", taille: 3,
  }).returning();
  await db.insert(fichierLien).values({ fichierId: f.id, cibleType: "element", cibleId: elementId });
  await sauvegarder(chemin, Buffer.from("jpg"));
  return f;
}

describe("accès à /p/:jeton", () => {
  it("se charge sans session", async () => {
    const j = await creerJeu();
    const d = await routePage.loader(args(`http://test/p/${j.jeton}`, { jeton: j.jeton }));
    expect(d.actif).toBe(true);
  });

  it("répond 404 sur un jeton inconnu, sans dire s'il a existé", async () => {
    await creerJeu();
    for (const jeton of ["inconnu", "", "x".repeat(500)]) {
      await expect(routePage.loader(args(`http://test/p/${jeton}`, { jeton })))
        .rejects.toMatchObject({ status: 404 });
    }
  });

  it("rend la page neutre sur un jeton expiré, et sur un jeton révoqué", async () => {
    const j = await creerJeu();
    const hier = new Date(Date.now() - 86_400_000);

    for (const valeurs of [{ expireLe: hier }, { revoqueLe: hier }]) {
      const [autre] = await db.insert(partage).values({
        proprieteId: j.p.id, nom: "Ancien", jeton: creerJeton(), niveauMax: 3, ...valeurs,
      }).returning();

      const d = await routePage.loader(args(`http://test/p/${autre.jeton}`, { jeton: autre.jeton }));
      expect(d.actif).toBe(false);
      // Rien de la propriété n'est chargé : il n'y a rien à rendre.
      expect(JSON.stringify(d)).not.toContain("Maison de test");
    }

    const html = renderToStaticMarkup(createElement(PartageInactif));
    expect(html).toContain("plus actif");
    expect(html).not.toContain("Maison de test");
  });
});

describe("HTML servi au destinataire", () => {
  // MemoryRouter : les composants rendent des <Link>, qui exigent un routeur.
  const rendre = <P extends object>(Composant: ComponentType<P>, props: P) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/p/x"] }, createElement(Composant, props)),
    );

  it("ne contient ni adresse, ni EGID, ni identifiant de propriété, ni script", async () => {
    const j = await creerJeu();
    const d = await routePage.loader(args(`http://test/p/${j.jeton}`, { jeton: j.jeton }));
    if (!d.actif) throw new Error("le partage devrait être actif");

    const html = rendre(PagePartage, { donnees: d.donnees, jeton: d.jeton });

    expect(html).toContain("Maison de test");
    expect(html).toContain("Cuisine");
    expect(html).not.toContain(ADRESSE);
    expect(html).not.toContain(EGID);
    // Aucune URL de l'arbre protégé : le composant ne reçoit que
    // `liensPartage`, il n'a pas les moyens d'en fabriquer une.
    expect(html).not.toContain("/proprietes/");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("sw.js");
    expect(html).not.toContain("manifest");
    // La zone dont toutes les fiches dépassent le plafond n'a pas de tuile.
    expect(html).not.toContain("Local technique");
    // Le nom du lien est l'étiquette privée du propriétaire.
    expect(html).not.toContain("Locataires 12-19 aout");
  });

  it("rend la fiche sans les champs qui dépassent le plafond", async () => {
    const j = await creerJeu();
    await photo(j, j.visible.id, `${j.jeton}-visible.jpg`);

    const d = await routeObjet.loader(
      args(`http://test/p/${j.jeton}/objets/${j.visible.id}`, { jeton: j.jeton, elementId: String(j.visible.id) }),
    );
    if (!d.actif) throw new Error("le partage devrait être actif");

    const html = rendre(FicheObjet, { fiche: d.fiche, jeton: d.jeton });

    expect(html).toContain("Induction");
    expect(html).toContain("Comment ça marche");
    expect(html).not.toContain("Numéro de série");
    expect(html).not.toContain("SN-000-111");
    expect(html).not.toContain("/proprietes/");
    expect(html).not.toContain("<script");
  });

  it("répond 404 sur la fiche d'un élément filtré", async () => {
    const j = await creerJeu();
    await expect(
      routeObjet.loader(
        args(`http://test/p/${j.jeton}/objets/${j.cache.id}`, { jeton: j.jeton, elementId: String(j.cache.id) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("sert la page en HTML seul, sans <Scripts />", () => {
    expect(routePage.handle.sansScripts).toBe(true);
    expect(routeObjet.handle.sansScripts).toBe(true);
    // C'est ce prédicat que `root.tsx` applique aux routes correspondantes.
    expect(documentSansScripts([{ handle: routePage.handle }])).toBe(true);
    expect(documentSansScripts([{}, { handle: { autre: true } }])).toBe(false);
    expect(routePage.headers()).toMatchObject(ENTETES_PARTAGE);
  });
});

describe("images portées par le jeton", () => {
  it("sert l'image d'une fiche visible", async () => {
    const j = await creerJeu();
    const f = await photo(j, j.visible.id, `${j.jeton}-ok.jpg`);

    const reponse = await routeFichiers.loader(
      args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) }),
    );
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toBe("image/jpeg");
    expect(reponse.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(reponse.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("répond 404 pour l'image d'une fiche filtrée, jamais 403", async () => {
    const j = await creerJeu();
    const f = await photo(j, j.cache.id, `${j.jeton}-cache.jpg`);

    await expect(
      routeFichiers.loader(
        args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ne sert plus rien une fois le lien révoqué", async () => {
    const j = await creerJeu();
    const f = await photo(j, j.visible.id, `${j.jeton}-revoque.jpg`);
    await db.update(partage).set({ revoqueLe: new Date() }).where(sql`id = ${j.lien.id}`);

    await expect(
      routeFichiers.loader(
        args(`http://test/p/${j.jeton}/fichiers/${f.id}`, { jeton: j.jeton, fichierId: String(f.id) }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("prévisualisation", () => {
  it("emprunte le même chemin de code que la vraie page", async () => {
    const j = await creerJeu();

    const publique = await routePage.loader(args(`http://test/p/${j.jeton}`, { jeton: j.jeton }));
    const apercu = await routeApercu.loader(
      args(
        `http://test/proprietes/${j.p.id}/partages/${j.lien.id}/apercu`,
        { proprieteId: String(j.p.id), partageId: String(j.lien.id) },
        j.cookie,
      ),
    );

    if (!publique.actif) throw new Error("le partage devrait être actif");
    // Pas « à peu près pareil » : les mêmes données, au même jeton, donc le
    // même rendu par le même composant. `ms` est la durée mesurée de la
    // requête, seule valeur qui ne peut pas être égale d'un appel à l'autre.
    const sansChrono = (d: typeof publique.donnees) => ({
      ...d,
      recherche: { ...d.recherche, ms: 0 },
    });
    expect(sansChrono(apercu.donnees)).toEqual(sansChrono(publique.donnees));
    expect(apercu.jeton).toBe(publique.jeton);
    expect(apercu.actif).toBe(true);

    // Et le même filtrage : le bandeau ne rend pas visible ce que le lien
    // masque.
    expect(apercu.donnees.zones.map((z) => z.nom)).toEqual(["Cuisine"]);
  });

  it("reste scopée par propriété : le partage d'un autre est un 404", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();

    await expect(
      routeApercu.loader(
        args(
          `http://test/proprietes/${mien.p.id}/partages/${autre.lien.id}/apercu`,
          { proprieteId: String(mien.p.id), partageId: String(autre.lien.id) },
          mien.cookie,
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
