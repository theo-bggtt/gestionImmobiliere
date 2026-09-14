// tests/vitrine/arbre.test.ts
// La vitrine est le seul arbre SANS PRÉFIXE, et c'est toute sa difficulté.
// `/p/` se reconnaît par `startsWith("/p/")` ; `startsWith("/")` attraperait
// tout le site. La reconnaissance se fait donc sur un ensemble de chemins
// EXACTS — et un ensemble se désynchronise d'une table de routes en silence.
//
// C'est exactement la forme du défaut qu'avait `/P/<jeton>` : une URL servie
// par le routeur, mais que le serveur ne reconnaissait pas, donc servie sous
// la politique de l'arbre authentifié. Ici ce serait l'inverse — une page de
// vitrine servie avec un nonce et sans cache public — mais le mécanisme est
// le même, et il ne se voit pas : la page s'affiche.
import { describe, it, expect, afterEach } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { RequestHandler } from "express";
import routes from "../../app/routes";
import { cheminsServis } from "../aides/routes";
import { creerApplication } from "../../server/application.js";
import { CHEMINS_VITRINE, estCheminVitrine } from "../../server/chemins-vitrine.js";
import { ENTETES_VITRINE } from "../../app/lib/vitrine/document";

/** Les chemins que la TABLE DE ROUTES confie à l'arbre de la vitrine. */
const cheminsDeLArbre = () =>
  cheminsServis(routes)
    .filter((c) => c.fichier.startsWith("routes/_vitrine/"))
    .map((c) => c.chemin);

describe("les deux listes de chemins disent la même chose", () => {
  it("l'ensemble du serveur est exactement l'arbre de la table de routes", () => {
    const table = cheminsDeLArbre().sort();
    // Le balayage doit voir quelque chose, sinon l'égalité serait celle de
    // deux listes vides.
    expect(table.length).toBeGreaterThan(0);
    expect(table).toEqual([...CHEMINS_VITRINE].sort());
  });

  it("aucune route hors de la vitrine n'est dans l'ensemble", () => {
    // L'autre bord : un chemin de trop donnerait à une page de l'application
    // la politique de la vitrine — sans nonce, donc sans script, donc cassée.
    const ailleurs = cheminsServis(routes)
      .filter((c) => !c.fichier.startsWith("routes/_vitrine/"))
      .filter((c) => estCheminVitrine(c.chemin));
    expect(ailleurs).toEqual([]);
  });

  it("la reconnaissance ignore la casse", () => {
    // Le routeur de React Router ne distingue pas la casse, donc `/A-Propos`
    // SERT la page ; sans ce repli elle la servirait sous l'autre politique.
    for (const chemin of CHEMINS_VITRINE) {
      expect(estCheminVitrine(chemin.toUpperCase())).toBe(true);
    }
    expect(estCheminVitrine("/proprietes")).toBe(false);
    expect(estCheminVitrine("/p/un-jeton")).toBe(false);
  });
});

// ── Ce que le serveur pose réellement, sur de vraies connexions HTTP, comme
//    `tests/serveur/application.test.ts`. Déduire les en-têtes de la lecture
//    du code est précisément ce que cette suite refuse de faire : la route et
//    le serveur en posent chacun, et c'est `laRouteRemplaceLeDefaut` qui
//    décide lequel gagne.
const serveurs: Server[] = [];
afterEach(async () => {
  await Promise.all(serveurs.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function demarrer(gestionnaire: RequestHandler) {
  const app = creerApplication({ gestionnaire });
  const serveur = app.listen(0, "127.0.0.1");
  serveurs.push(serveur);
  await once(serveur, "listening");
  const { port } = serveur.address() as AddressInfo;
  return (chemin: string) => fetch(`http://127.0.0.1:${port}${chemin}`);
}

/** Un gestionnaire qui pose ce qu'une route de vitrine pose. */
const commeUneRoute: RequestHandler = (_req, res) => {
  for (const [nom, valeur] of Object.entries(ENTETES_VITRINE)) res.append(nom, valeur);
  res.type("text/html").send("<!doctype html><title>x</title>");
};

describe("la politique servie sur un chemin de vitrine", () => {
  it("interdit tout script, et autorise le formulaire de la liste d'attente", async () => {
    const appeler = await demarrer((_req, res) => res.json({}));
    const r = await appeler("/");
    const csp = r.headers.get("content-security-policy") ?? "";

    expect(csp).toContain("default-src 'none'");
    // Aucun `script-src` : le navigateur interdit alors tout script, inline
    // ou non. C'est ce qui double la règle « sans <Scripts /> » plutôt que de
    // s'en remettre à elle.
    expect(csp).not.toContain("script-src");
    // Le POST de la liste d'attente part vers la même origine.
    expect(csp).toContain("form-action 'self'");
    // Pas de `'unsafe-inline'` sur les styles : la vitrine n'a aucune
    // géométrie à positionner, contrairement à la page de partage.
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it("n'émet AUCUN nonce : il n'y a pas de script à signer", async () => {
    let vu: string | null = null;
    const appeler = await demarrer((_req, res) => {
      vu = res.locals.nonce ?? null;
      res.json({});
    });
    await appeler("/");
    expect(vu).toBeNull();
  });

  it("se met en cache publiquement, et n'interdit pas l'indexation", async () => {
    const appeler = await demarrer(commeUneRoute);
    const r = await appeler("/");
    // Le contraire exact de `/p/` : ces pages sont les mêmes pour tout le
    // monde et ne dépendent d'aucune session.
    expect(r.headers.get("cache-control")).toBe(ENTETES_VITRINE["Cache-Control"]);
    // Et surtout : une vitrine qu'on n'indexe pas ne sert à rien.
    expect(r.headers.get("x-robots-tag")).toBeNull();
  });

  it("la valeur de la route REMPLACE celle du serveur, elle ne s'y empile pas", async () => {
    // `Cache-Control` et `Referrer-Policy` sont dans `ENTETES_A_VALEUR_UNIQUE`,
    // et l'adaptateur Express de React Router recopie avec `res.append`, qui
    // empile. Vérifié sur la réponse plutôt que déduit du code : deux valeurs
    // contradictoires dans un même en-tête ne se voient pas à la lecture.
    const appeler = await demarrer((_req, res) => {
      res.append("Cache-Control", "public, max-age=42");
      res.type("text/html").send("x");
    });
    const r = await appeler("/");
    expect(r.headers.get("cache-control")).toBe("public, max-age=42");
  });

  it("un chemin hors de l'ensemble garde la politique de l'application", async () => {
    let nonce: string | null = null;
    const appeler = await demarrer((_req, res) => {
      nonce = res.locals.nonce ?? null;
      res.json({});
    });
    const r = await appeler("/proprietes");
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(nonce).not.toBeNull();
  });

  it("`/p/` garde la sienne : l'ordre des branches ne l'a pas déplacée", async () => {
    const appeler = await demarrer((_req, res) => res.json({}));
    const r = await appeler("/p/un-jeton");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
});
