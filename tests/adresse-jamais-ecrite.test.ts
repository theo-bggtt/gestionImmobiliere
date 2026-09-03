import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

// Décision #82 : ni l'adresse ni l'EGID n'entrent en base. `propriete.adresse`
// et `propriete.egid` existent depuis la migration 0000 et doivent rester
// nulles — elles servent de sentinelle aux tests de partage.
//
// `tests/demarrage/etancheite.test.ts` balaye toutes les colonnes de toutes
// les tables APRÈS un parcours de démarrage : il prouve que ce parcours-là
// n'écrit rien. Il ne dit rien des parcours qui n'existent pas encore — un
// écran « modifier la propriété » ajouté un jour avec un champ adresse
// passerait devant lui sans le réveiller. Celui-ci couvre l'inverse : la
// forme du code, sur tout `app/`, quel que soit l'écran.
//
// Même modèle que `tests/exports-routes.test.ts` : de l'expression régulière
// sur du texte, pas d'AST. Ce que le motif ne voit pas, il ne l'interdit pas ;
// il ne se trompe jamais dans l'autre sens, et c'est le sens qui compte pour
// un garde-fou.

const RACINE = "app";
const EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * La déclaration des deux colonnes. Elle DOIT rester : les retirer de l'objet
 * drizzle ferait générer à `drizzle-kit` une migration qui les supprime, et on
 * perdrait la sentinelle.
 */
const DECLARATION = join("app", "db", "schema", "core.ts");

/**
 * Les seuls fichiers qui ont le droit de manipuler une adresse. Ils forment
 * le module de démarrage, et aucun ne touche la base — c'est vérifié plus bas,
 * et c'est ce qui rend cette liste sûre : le mot vit là où il n'y a pas de
 * base, donc il ne peut pas y être écrit.
 */
const AUTORISES = new Set([
  join("app", "lib", "demarrage", "regbl.server.ts"),
  join("app", "lib", "demarrage", "types.ts"),
  join("app", "components", "demarrage", "RechercheAdresse.tsx"),
  join("app", "routes", "_app", "demarrer.adresse.tsx"),
]);

/**
 * Les formes d'écriture, et rien d'autre : la prose française a le droit de
 * dire « l'adresse » (plusieurs commentaires et deux avertissements à l'écran
 * le font, et c'est bien qu'ils le fassent).
 *
 * Le deux-points sans espace devant distingue le code de la prose : une clé
 * d'objet s'écrit `adresse: x`, le français s'écrit « l'adresse : x ».
 */
const INTERDITS: Array<{ motif: RegExp; forme: string }> = [
  { motif: /\bpropriete\.(adresse|egid)\b/, forme: "la colonne atteinte par l'objet drizzle" },
  { motif: /\b(adresse|egid):/i, forme: "une clé d'objet, donc un .values({…}) ou un .set({…})" },
  { motif: /\b(adresse|egid)\s*=[^=]/i, forme: "une affectation, ou un UPDATE … SET en SQL brut" },
  // La table et la colonne dans le même ordre SQL. Le mot-clé est obligatoire :
  // sans lui, le motif attraperait les commentaires qui expliquent justement
  // que ces colonnes ne sont pas chargées.
  {
    motif: /\b(?:insert\s+into|update|from|join)\s+propriete\b[^\n]*\b(adresse|egid)\b/i,
    forme: "la table puis la colonne, en SQL brut",
  },
  { motif: /\b(adresse|egid)\b[^\n]*\bfrom\s+propriete\b/i, forme: "la colonne puis la table, en SQL brut" },
];

/** Un fichier autorisé ne doit rien savoir de la base : c'est ce qui le rend sûr. */
const IMPORTS_BASE = /from\s+["'][^"']*(db\/schema|db\/client)/;

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

function infractions(source: string): string[] {
  const trouvees: string[] = [];
  source.split("\n").forEach((ligne, i) => {
    for (const { motif, forme } of INTERDITS) {
      if (motif.test(ligne)) trouvees.push(`ligne ${i + 1} (${forme}) : ${ligne.trim()}`);
    }
  });
  return trouvees;
}

describe("l'adresse et l'EGID n'entrent jamais en base", () => {
  it("aucun fichier de app/ n'écrit propriete.adresse ni propriete.egid", async () => {
    const coupables: string[] = [];
    for (const chemin of await fichiersDe(RACINE)) {
      if (chemin === DECLARATION || AUTORISES.has(chemin)) continue;
      for (const infraction of infractions(await readFile(chemin, "utf-8"))) {
        coupables.push(`${chemin}:${infraction}`);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("les fichiers autorisés à connaître une adresse ne touchent pas la base", async () => {
    const coupables: string[] = [];
    for (const chemin of AUTORISES) {
      const source = await readFile(chemin, "utf-8");
      if (IMPORTS_BASE.test(source)) coupables.push(chemin);
    }
    expect(coupables).toEqual([]);
  });

  it("la déclaration des deux colonnes est toujours là", async () => {
    // Sentinelle : sans ces colonnes, le balayage d'étanchéité ne prouverait
    // plus rien — il ne trouverait rien parce qu'il n'y aurait rien à trouver.
    const source = await readFile(DECLARATION, "utf-8");
    expect(source).toContain('adresse: text("adresse")');
    expect(source).toContain('egid: text("egid")');
  });

  it("le garde attrape bien les quatre formes d'écriture", () => {
    // Sans ces assertions, les trois tests au-dessus pourraient être verts
    // parce que le motif ne trouve jamais rien, et non parce qu'il n'y a rien.
    expect(infractions('db.update(propriete).set({ adresse: form.get("adresse") })')).not.toEqual([]);
    expect(infractions("await db.insert(propriete).values({ nom, egid: candidat.egid })")).not.toEqual([]);
    expect(infractions("sql`UPDATE propriete SET adresse = ${a}`")).not.toEqual([]);
    expect(infractions("sql`INSERT INTO propriete (nom, adresse) VALUES (…)`")).not.toEqual([]);
    expect(infractions("sql`SELECT nom, adresse FROM propriete WHERE id = ${id}`")).not.toEqual([]);
    expect(infractions("eq(propriete.egid, identifiant)")).not.toEqual([]);
    // Et la prose française passe : c'est elle qui explique la décision.
    expect(infractions("// Un surnom, pas une adresse : ce nom est un <h1> de partage.")).toEqual([]);
    expect(infractions("<p>Un extrait cadastral porte souvent l'adresse imprimée dessus.</p>")).toEqual([]);
    expect(infractions("// `propriete.nom` seul. Ni `adresse` ni `egid` n'entrent dans ce loader.")).toEqual([]);
  });
});
