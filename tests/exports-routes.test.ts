import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

// Un module de `app/routes/` qui exporte autre chose qu'un export de route
// emporte ses dépendances dans le bundle navigateur. React Router ne retire du
// bundle client que les exports qu'il connaît (`SERVER_ONLY_ROUTE_EXPORTS` dans
// @react-router/dev) ; un `chargerNiveaux` exporté depuis `plans.nouveau.tsx` a
// suffi à y envoyer drizzle et tout le schéma — 170 Ko au lieu de 2 Ko.
//
// Rien ne voit cette classe de défaut : le typecheck est vert, les tests sont
// verts, la page fonctionne. Seule la taille du bundle change, et personne ne
// la regarde à chaque pull request. D'où ce garde, sur le modèle de
// `vocabulaire.test.ts` : la convention est écrite dans CLAUDE.md, ceci
// l'applique.
//
// La liste vient de la documentation de la version installée (7.18.3,
// reactrouter.com/7.18.3/start/framework/route-module) et se recoupe avec les
// tableaux `SERVER_ONLY_ROUTE_EXPORTS` et `CLIENT_ROUTE_EXPORTS` du plugin Vite
// — c'est ce dernier qui décide réellement. `Layout` n'est pas dans la page du
// route module (il ne sert qu'à `root.tsx`) mais le compilateur le reconnaît :
// l'omettre rendrait le test faux le jour où une route en porte un.
const EXPORTS_DE_ROUTE = new Set([
  // Serveur uniquement — retirés du bundle client par le plugin.
  "loader",
  "action",
  "middleware",
  "headers",
  // Client.
  "clientLoader",
  "clientAction",
  "clientMiddleware",
  "handle",
  "meta",
  "links",
  "shouldRevalidate",
  "default",
  "ErrorBoundary",
  "HydrateFallback",
  "Layout",
]);

const RACINE = "app/routes";
const EXTENSIONS = new Set([".ts", ".tsx"]);

async function fichiersDe(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const sortie: string[] = [];
  for (const e of entrees) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...(await fichiersDe(chemin)));
    else if (EXTENSIONS.has(extname(e.name))) sortie.push(chemin);
  }
  return sortie;
}

/**
 * Les noms exportés d'un module, lus au texte. Pas d'AST : les quatre formes
 * ci-dessous sont les seules que le dépôt écrit, et une expression régulière
 * qui rate un cas exotique vaut mieux qu'un analyseur qu'on n'ose pas relire.
 * Ce que le test ne voit pas, il ne l'interdit pas — il ne se trompe jamais
 * dans l'autre sens, et c'est le sens qui compte pour un garde-fou.
 */
function exportsDe(source: string): string[] {
  const noms: string[] = [];

  // export function x / export async function x / export class x
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z0-9_$]+)/gm)) {
    noms.push(m[1]);
  }
  // export const x / export let x / export var x
  for (const m of source.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
    noms.push(m[1]);
  }
  // export default …
  if (/^export\s+default\b/m.test(source)) noms.push("default");
  // export { a, b as c } — `export type { … }` est effacé à la compilation,
  // il ne pèse rien dans le bundle et n'a pas à être interdit.
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const morceau of m[1].split(",")) {
      const brut = morceau.trim();
      if (!brut || brut.startsWith("type ")) continue;
      const alias = brut.split(/\s+as\s+/);
      noms.push((alias[1] ?? alias[0]).trim());
    }
  }

  return noms;
}

describe("modules de route", () => {
  it("n'exportent que les exports reconnus par React Router", async () => {
    const coupables: string[] = [];
    for (const chemin of await fichiersDe(RACINE)) {
      const source = await readFile(chemin, "utf-8");
      for (const nom of exportsDe(source)) {
        if (!EXPORTS_DE_ROUTE.has(nom)) coupables.push(`${chemin} exporte « ${nom} »`);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("le garde couvre la forme exacte du défaut de l'étape 4", () => {
    // Le bug tel qu'il a été écrit : un helper serveur exporté d'un module de
    // route. Si cette assertion tombait, le test au-dessus serait décoratif.
    expect(exportsDe("export async function chargerNiveaux(id: number) {}")).toEqual(["chargerNiveaux"]);
    expect(exportsDe("export async function loader() {}").every((n) => EXPORTS_DE_ROUTE.has(n))).toBe(true);
  });
});
