import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

// Règle non négociable #12 du plan : le mot interdit ne doit apparaître nulle
// part. Ce n'est pas de la cosmétique — si l'interface le dit, personne ne
// crée le jardin, et le partage au jardinier n'a plus rien à montrer. Un
// simple test l'empêche de revenir par une pull request distraite.
const INTERDIT = /pi[eè]ces?\b/i;
const DOSSIERS = ["app", "public"];
const EXTENSIONS = new Set([".ts", ".tsx", ".css", ".js", ".json", ".webmanifest", ".html"]);

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

describe("vocabulaire de l'interface", () => {
  it("ne dit jamais le mot interdit, on dit zone ou lieu", async () => {
    const coupables: string[] = [];
    for (const dossier of DOSSIERS) {
      for (const chemin of await fichiersDe(dossier)) {
        const lignes = (await readFile(chemin, "utf-8")).split("\n");
        lignes.forEach((ligne, i) => {
          if (INTERDIT.test(ligne)) coupables.push(`${chemin}:${i + 1} ${ligne.trim()}`);
        });
      }
    }
    expect(coupables).toEqual([]);
  });
});
