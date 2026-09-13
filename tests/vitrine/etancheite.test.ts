// tests/vitrine/etancheite.test.ts
// La vitrine ne lit PAS la base. Ni maintenant, ni le jour où quelqu'un
// voudra afficher « déjà 42 personnes inscrites » — ce chiffre se lit en
// base, pas sur la page.
//
// Ce n'est pas une précaution de style. C'est ce qui rend vraies trois choses
// écrites ailleurs : le `Cache-Control` public (une page qui lit la base n'est
// pas la même pour tout le monde), l'absence de loader (donc l'absence de
// requête sur une route publique et non freinée), et la ligne de la revue de
// fuite qui dit que cet arbre ne rend aucune donnée dérivée de la base.
//
// Le balayage est TRANSITIF, comme celui de `verifier-bundle.mjs` est
// empirique : un import direct de `db` serait vu par n'importe qui à la
// relecture. Ce qui ne se voit pas, c'est un composant partagé qui, trois
// niveaux plus bas, importe un `.server`.
import { describe, it, expect } from "vitest";
import { readdir, readFile, access } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";

const RACINE = "app/routes/_vitrine";
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/**
 * La SEULE porte ouverte sur la base, et ce qu'elle autorise : écrire une
 * adresse sur la liste d'attente. Elle n'en lit rien — `enregistrerInteresse`
 * ne rend même pas si la ligne existait, pour que « vous êtes déjà inscrit »
 * soit impossible à écrire. Tout autre chemin vers `db` reste fermé.
 */
const PORTE = "app/lib/vitrine/liste-attente.server.ts";

/** Ce qu'un module de la vitrine ne doit atteindre par aucun chemin, sauf en
 *  passant par `PORTE`. */
const INTERDITS = [
  { test: (c: string) => c.includes("app/db/"), quoi: "le schéma ou le client de la base" },
  { test: (c: string) => /\.server\.(ts|tsx|js)$/.test(c), quoi: "un module serveur (`.server`)" },
];
const PAQUETS_INTERDITS = ["drizzle-orm", "pg", "postgres"];

/** Les spécificateurs importés par un module, lus au texte. Pas d'AST : les
 *  formes ci-dessous sont les seules que le dépôt écrit, et le test de
 *  contrôle plus bas prouve que le balayage voit ce qu'il doit voir. */
function importsDe(source: string): string[] {
  const trouves: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) trouves.push(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) trouves.push(m[1]);
  return trouves;
}

async function existe(chemin: string): Promise<boolean> {
  try {
    await access(chemin);
    return true;
  } catch {
    return false;
  }
}

/** Résout un import relatif en chemin de fichier, ou `null` s'il n'en est pas
 *  un (un paquet de `node_modules`, traité à part). */
async function resoudre(depuis: string, specificateur: string): Promise<string | null> {
  if (!specificateur.startsWith(".")) return null;
  const base = resolve(dirname(depuis), specificateur);
  const candidats = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => join(base, "index" + e))];
  // Normalisé ici et pas au moment de comparer : `relative` rend des `\` sous
  // Windows, et `PORTE` s'écrit avec des `/`. La porte n'y était donc jamais
  // reconnue, et le test échouait sur le seul import qu'il autorise.
  for (const c of candidats) if (await existe(c)) return relative(process.cwd(), c).replace(/\\/g, "/");
  return null;
}

/** Tous les modules atteignables depuis `depart`, imports compris, en
 *  profondeur. Rend aussi le chemin d'importation qui y mène, pour que
 *  l'échec DISE par où la fuite passe. */
async function atteignables(depart: string[]): Promise<Map<string, string[]>> {
  const vus = new Map<string, string[]>();
  const file: Array<{ fichier: string; via: string[] }> = depart.map((f) => ({ fichier: f, via: [f] }));
  const paquets: Array<{ nom: string; via: string[] }> = [];

  while (file.length) {
    const { fichier, via } = file.shift()!;
    if (vus.has(fichier)) continue;
    vus.set(fichier, via);
    const source = await readFile(fichier, "utf-8");
    for (const spec of importsDe(source)) {
      const resolu = await resoudre(fichier, spec);
      if (resolu) file.push({ fichier: resolu, via: [...via, resolu] });
      else if (!spec.startsWith(".")) paquets.push({ nom: spec, via: [...via, spec] });
    }
  }
  for (const p of paquets) if (!vus.has(p.nom)) vus.set(p.nom, p.via);
  return vus;
}

describe("l'arbre de la vitrine n'atteint pas la base", () => {
  it("aucun module, par aucun chemin d'import", async () => {
    // `/` et non `join` : même raison que dans `resoudre`, et sans quoi une
    // même route serait vue deux fois, une par séparateur.
    const depart = (await readdir(RACINE)).map((n) => `${RACINE}/${n}`);
    // Le balayage doit partir de quelque chose.
    expect(depart.length).toBeGreaterThan(0);

    const tous = await atteignables(depart);
    const fautifs: string[] = [];
    for (const [module, via] of tous) {
      const normalise = module.replace(/\\/g, "/");
      // Ce qui passe par la porte est autorisé — c'est le chemin d'écriture
      // de la liste d'attente. Ce qui l'atteint par un AUTRE chemin ne l'est
      // pas : la porte est nominative, pas une permission générale.
      if (via.includes(PORTE)) continue;
      for (const i of INTERDITS) if (i.test(normalise)) fautifs.push(`${i.quoi} : ${via.join(" → ")}`);
      if (PAQUETS_INTERDITS.includes(normalise)) fautifs.push(`le paquet ${normalise} : ${via.join(" → ")}`);
    }
    expect(fautifs).toEqual([]);

    // Et la porte est bien la seule : une SECONDE ouverture se verrait ici.
    const portes = [...tous.entries()]
      .filter(([m]) => /\.server\.(ts|tsx|js)$/.test(m.replace(/\\/g, "/")))
      .map(([m]) => m.replace(/\\/g, "/"));
    expect(portes).toEqual([PORTE]);

    // Et le balayage doit avoir réellement suivi des imports, sinon
    // « aucun fautif » ne dirait rien : les routes importent au moins
    // `document.ts` et `redirection.ts`.
    expect(tous.size).toBeGreaterThan(depart.length);
  });

  it("détecte une fuite plantée (contrôle du balayage)", async () => {
    // Sans ce contrôle, le test passerait aussi bien sur un balayage qui ne
    // suit rien. On part d'un module qui, LUI, atteint la base par deux
    // niveaux d'imports, et on vérifie que c'est vu.
    const tous = await atteignables(["app/routes/_app/proprietes._index.tsx"]);
    const touche = [...tous.keys()].some((m) => m.replace(/\\/g, "/").includes("app/db/"));
    expect(touche).toBe(true);
  });

  it("aucune route de la vitrine n'exporte de loader", async () => {
    // C'est le vrai invariant, et il survit à l'arrivée de la liste
    // d'attente : la vitrine n'a rien À LIRE en base. Un loader serait une
    // requête sur une page publique, et une page dont le contenu dépend de
    // la base ne peut plus être servie en cache public.
    const fautives: string[] = [];
    for (const nom of await readdir(RACINE)) {
      const source = await readFile(join(RACINE, nom), "utf-8");
      if (/export (async )?(function|const) loader\b/.test(source)) fautives.push(nom);
    }
    expect(fautives).toEqual([]);
  });

  it("une seule route exporte une action : celle de la liste d'attente", async () => {
    // Une action ÉCRIT, elle ne rend pas de donnée : c'est la seule chose que
    // la vitrine a le droit de faire en base, et une seule page la fait.
    const avecAction: string[] = [];
    for (const nom of await readdir(RACINE)) {
      const source = await readFile(join(RACINE, nom), "utf-8");
      if (/export (async )?(function|const) action\b/.test(source)) avecAction.push(nom);
    }
    expect(avecAction).toEqual(["accueil.tsx"]);
  });
});
