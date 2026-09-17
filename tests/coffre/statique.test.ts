// tests/coffre/statique.test.ts
// Ce que le coffre ne doit jamais toucher, tenu au texte — sur le modèle de
// `exports-routes.test.ts` : la convention est écrite dans CLAUDE.md, ceci
// l'applique, et ce que le test ne voit pas il ne l'interdit pas.
//
//   1. Aucune requête sous `app/lib/partage/` ni `app/routes/_partage/` ne
//      nomme `coffre` ou `secret`. Un secret ne sort d'aucun lien, à aucun
//      plafond, et la façon la plus sûre de le tenir est qu'aucune de ces
//      requêtes ne connaisse la table.
//   2. Aucun `console.*` dans le code du coffre : un bloc ou une phrase ne se
//      journalise pas, même en développement. Et `server/application.js` ne
//      journalise aucun corps de requête — c'était vrai avant, ça le reste.
import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const EXTENSIONS = new Set([".ts", ".tsx", ".js"]);

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
 * Les lignes de code d'un module, commentaires retirés. Un commentaire qui dit
 * « le jeton EST le secret » (`partage.server.ts`) parle d'autre chose, et le
 * test porte sur ce qu'une requête NOMME, pas sur ce qu'un auteur explique.
 * Pas d'AST : un `//` en début de ligne, ou une ligne d'un bloc `/* … *\/`, et
 * c'est tout ce que le dépôt écrit.
 */
function lignesDeCode(source: string): string[] {
  return source.split("\n").map((ligne) =>
    ligne
      .replace(/\/\*.*?\*\//g, "")
      .replace(/^\s*(\/\/|\*|\/\*|\{\/\*).*$/, "")
      .replace(/\/\/.*$/, ""),
  );
}

const NOMME_LE_COFFRE = /\b(coffre|secrets?)\b/i;

describe("le partage ne connaît pas le coffre", () => {
  it("aucune ligne de code sous app/lib/partage ni app/routes/_partage ne nomme coffre ou secret", async () => {
    const coupables: string[] = [];
    for (const dossier of ["app/lib/partage", "app/routes/_partage"]) {
      for (const chemin of await fichiersDe(dossier)) {
        lignesDeCode(await readFile(chemin, "utf-8")).forEach((ligne, i) => {
          if (NOMME_LE_COFFRE.test(ligne)) coupables.push(`${chemin}:${i + 1} ${ligne.trim()}`);
        });
      }
    }
    expect(coupables).toEqual([]);
  });

  it("détecte une requête qui joindrait la table (contrôle du balayage)", () => {
    for (const ligne of [
      'import { secret } from "../../db/schema/index";',
      "  JOIN secret s ON s.element_id = e.id",
      "  const lignes = await db.select().from(coffre);",
      "SELECT s.libelle FROM secret s",
    ]) {
      expect(lignesDeCode(ligne).some((l) => NOMME_LE_COFFRE.test(l)), ligne).toBe(true);
    }
    // Et un commentaire, lui, n'est pas une requête.
    expect(lignesDeCode(" * #4 de l'étape 0) : le jeton EST le secret, un identifiant").some((l) => NOMME_LE_COFFRE.test(l))).toBe(false);
    expect(lignesDeCode("const x = 1; // le secret").some((l) => NOMME_LE_COFFRE.test(l))).toBe(false);
  });
});

/** Chaque balise `<input …>` d'une source JSX, sur une ou plusieurs lignes, commentaires exclus. */
function balisesInput(source: string): string[] {
  return [...lignesDeCode(source).join("\n").matchAll(/<input\b[\s\S]*?\/?>/g)].map((m) => m[0]);
}

const ECRANS_DU_COFFRE = ["app/components/coffre/SectionCoffre.tsx", "app/routes/_app/coffre.tsx"];

describe("les champs sensibles n'ont pas de name", () => {
  // Le rendu serveur (`etancheite.test.ts`) ne voit que ce qui est rendu sans
  // clic ; le champ de révélation n'apparaît qu'après un. D'où ce garde au
  // texte, qui lit CHAQUE `<input>` des deux écrans : un champ de type
  // password ne porte jamais de `name`, et aucun champ ne s'appelle phrase,
  // valeur ou secours — dans un formulaire natif, il partirait au serveur le
  // jour où le JavaScript échoue avant l'hydratation.
  it("aucun <input type=\"password\"> ne porte de name, et rien ne s'appelle phrase, valeur ou secours", async () => {
    const coupables: string[] = [];
    for (const chemin of ECRANS_DU_COFFRE) {
      const balises = balisesInput(await readFile(chemin, "utf-8"));
      expect(balises.length, `${chemin} : aucun <input> lu`).toBeGreaterThan(0);
      for (const balise of balises) {
        const compacte = balise.replace(/\s+/g, " ");
        if (/type="password"/.test(compacte) && /\bname=/.test(compacte)) coupables.push(`${chemin} : ${compacte}`);
        if (/\bname="(phrase|valeur|secours|cleDonnees)"/.test(compacte)) coupables.push(`${chemin} : ${compacte}`);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("détecte un champ nommé sur plusieurs lignes (contrôle du balayage)", () => {
    const source = `<input\n  type="password"\n  name="phrase"\n  value={x}\n/>`;
    const [balise] = balisesInput(source);
    expect(balise.replace(/\s+/g, " ")).toMatch(/type="password" name="phrase"/);
    expect(balisesInput('<input type="hidden" name="_action" value="vider" />')).toHaveLength(1);
  });
});

describe("rien du coffre ne se journalise", () => {
  it("aucun console.* dans le code du coffre, ni un corps de requête dans application.js", async () => {
    const fichiers = [
      ...(await fichiersDe("app/lib/coffre")),
      ...(await fichiersDe("app/components/coffre")),
      "app/routes/_app/coffre.tsx",
      "app/routes/_app/elements.$elementId.modifier.tsx",
    ];
    const coupables: string[] = [];
    for (const chemin of fichiers) {
      lignesDeCode(await readFile(chemin, "utf-8")).forEach((ligne, i) => {
        if (/\bconsole\.\w+\s*\(/.test(ligne)) coupables.push(`${chemin}:${i + 1} ${ligne.trim()}`);
      });
    }
    expect(coupables).toEqual([]);

    // Le serveur ne journalise rien d'une requête : ni corps, ni en-tête, ni
    // URL. Un `console.log` dans la fabrique Express serait le premier endroit
    // où un bloc — ou pire, un formulaire — pourrait s'écrire sur disque.
    const application = lignesDeCode(await readFile("server/application.js", "utf-8"));
    expect(application.filter((l) => /\bconsole\.\w+\s*\(/.test(l))).toEqual([]);
  });
});
