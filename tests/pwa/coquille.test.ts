// tests/pwa/coquille.test.ts
// Deux gardes statiques sur la PWA, dans l'esprit de
// `tests/serveur/compose-ports.test.ts` : ils tiennent des accords entre
// fichiers qu'aucun typecheck ne voit, et dont la rupture ne se manifeste
// NI en développement NI dans la suite.
//
//  - le service worker n'est pas enregistré sous Vite (`import.meta.env.PROD`),
//    donc rien de ce qui le concerne n'est exercé en développement ;
//  - un manifeste dont le `start_url` sort de son `scope` n'est pas signalé :
//    la spécification déclare le `scope` invalide et le remplace par le
//    `start_url` privé de son nom de fichier, c'est-à-dire, ici, la racine.
//    L'application redeviendrait installable sur `/` sans que rien ne le dise.
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import routes from "../../app/routes";
import { cheminsServis } from "../aides/routes";
import { ACCUEIL } from "../../app/lib/auth/redirection";
import { COQUILLE } from "../../app/lib/capture/coquille";

/** Les chemins servis, sans les modules : ce garde ne regarde que les URL. */
const chemins = () => cheminsServis(routes).map((c) => c.chemin);

const manifeste = JSON.parse(await readFile("public/manifest.webmanifest", "utf-8")) as {
  start_url: string;
  scope: string;
};

describe("le manifeste et la table de routes disent la même chose", () => {
  it("le start_url correspond à une route qui existe", () => {
    const servis = chemins();
    // Le balayage doit voir quelque chose, sinon il passerait sur une table
    // qu'il n'a pas su lire.
    expect(servis.length).toBeGreaterThan(20);
    expect(servis).toContain(manifeste.start_url);
  });

  it("le start_url est celui qu'écrit le code, et la portée est la même", () => {
    // Un `start_url` qui ne serait pas `ACCUEIL` démarrerait l'app ailleurs
    // que là où `prechargerCoquille` met un document en cache : l'app
    // s'installerait, et ne démarrerait pas hors ligne.
    expect(manifeste.start_url).toBe(ACCUEIL);
    expect(manifeste.scope).toBe(ACCUEIL);
  });

  it("le start_url est dans la portée, et la portée ne déborde sur aucune autre route", () => {
    // La correspondance des portées — celle du manifeste comme celle du
    // service worker — est un préfixe de CHAÎNE et non de segments de chemin.
    // D'où les deux bords : `start_url` doit commencer par `scope` (sans quoi
    // le navigateur remplace la portée en silence), et aucune route hors de
    // l'arbre applicatif ne doit commencer par `scope` (sans quoi le service
    // worker contrôlerait une page qui ne lui appartient pas).
    expect(manifeste.start_url.startsWith(manifeste.scope)).toBe(true);

    const deborde = chemins().filter(
      (c) => c.startsWith(manifeste.scope) && c !== ACCUEIL && !c.startsWith(`${ACCUEIL}/`),
    );
    expect(deborde).toEqual([]);
  });

  it("détecte une portée qui déborde (contrôle du balayage)", () => {
    // Sans ce contrôle, « aucune route ne déborde » ne voudrait rien dire :
    // il faut prouver que le balayage verrait le cas.
    const inventes = cheminsServis([
      { path: "proprietes", index: true, file: "a.tsx" },
      { path: "proprietes-publiques", file: "b.tsx" },
    ] as unknown as typeof routes).map((c) => c.chemin);
    expect(inventes).toEqual(["/proprietes", "/proprietes-publiques"]);
    expect(
      inventes.filter((c) => c.startsWith("/proprietes") && c !== "/proprietes" && !c.startsWith("/proprietes/")),
    ).toEqual(["/proprietes-publiques"]);
  });
});

describe("les noms de cache suivent la version du service worker", () => {
  it("coquille.ts et sw.js portent la même version", async () => {
    const sw = await readFile("public/sw.js", "utf-8");
    const version = sw.match(/^const VERSION = "([^"]+)";$/m)?.[1];

    // Si la forme de la déclaration change, ce test doit échouer plutôt que
    // de comparer à `undefined` et passer.
    expect(version).toBeTruthy();

    // `sw.js` dérive `coquille-${VERSION}` et `actifs-${VERSION}`, et son
    // handler `activate` supprime tout cache dont le nom ne finit PAS par la
    // version courante. Un nom resté en arrière dans `coquille.ts` ferait donc
    // écrire la page dans un cache que le service worker efface aussitôt —
    // l'app cesserait de démarrer hors ligne, sans erreur nulle part.
    expect(COQUILLE).toBe(`coquille-${version}`);
    expect(sw).toContain("const COQUILLE = `coquille-${VERSION}`;");
    expect(sw).toContain("const ACTIFS = `actifs-${VERSION}`;");
  });
});
