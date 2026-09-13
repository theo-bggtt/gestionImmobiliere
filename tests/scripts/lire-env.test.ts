// tests/scripts/lire-env.test.ts
//
// `scripts/lire-env.sh` est du shell POSIX sourcé par `sauvegarde.sh` et
// `restauration.sh`. On l'éprouve comme les seeds : en l'exécutant pour de
// vrai (`/bin/sh`, aucune dépendance nouvelle), sur un `.env` fabriqué qui
// porte les deux divergences constatées par l'issue #35 — une valeur entre
// guillemets et une ligne terminée par CRLF.
//
// Ce que le test ne peut pas faire : constater que `docker compose` lit bien
// la même chose. C'est une vérification manuelle, reportée dans le README.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const LIRE_ENV = resolve(process.cwd(), "scripts/lire-env.sh");

let dossier: string;
let fichierEnv: string;

// Les deux divergences de l'issue, plus une variable hors liste blanche qui
// porte le secret : c'est elle qui ne doit jamais sortir.
const CONTENU_ENV = [
  "# un commentaire",
  "",
  'SAUVEGARDES="/mnt/nas/sauvegardes"',
  "RETENTION_JOURS=30\r",
  "SESSION_SECRET=\"secret-de-soixante-quatre\"\r",
  "POSTGRES_PASSWORD='mot-de-passe'",
  "STOCKAGE_RACINE=/donnees/fichiers",
  "UNE_LIGNE_SANS_EGAL",
].join("\n");

/**
 * Source le lecteur, applique `lire_env` avec la liste donnée, puis imprime
 * la valeur de chaque nom demandé, une par ligne, entre chevrons — pour que
 * les espaces et un `\r` résiduel se voient.
 */
function lire(liste: string, aImprimer: string[], env: NodeJS.ProcessEnv = {}): string[] {
  const script = [
    `. "${LIRE_ENV}"`,
    `lire_env "${liste}" "${fichierEnv}"`,
    ...aImprimer.map((n) => `printf '<%s>\\n' "\${${n}-ABSENTE}"`),
  ].join("\n");
  const sortie = execFileSync("/bin/sh", ["-c", script], {
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
  return sortie.trimEnd().split("\n");
}

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "lire-env-"));
  fichierEnv = join(dossier, ".env");
  writeFileSync(fichierEnv, CONTENU_ENV);
});

afterAll(() => {
  rmSync(dossier, { recursive: true, force: true });
});

describe("lire_env", () => {
  it("retire une paire de guillemets et le \\r final, comme l'analyseur de compose", () => {
    expect(lire("SAUVEGARDES RETENTION_JOURS", ["SAUVEGARDES", "RETENTION_JOURS"])).toEqual([
      "</mnt/nas/sauvegardes>",
      "<30>",
    ]);
  });

  it("n'exporte RIEN de ce qui n'est pas dans la liste blanche", () => {
    // Le cœur de l'issue #35 : ces deux-là reconfigureraient les conteneurs
    // que le script démarre, et le mot de passe de `postgres` est initialisé
    // sur un volume vide par `restauration.sh`.
    expect(lire("SAUVEGARDES", ["SESSION_SECRET", "POSTGRES_PASSWORD"])).toEqual([
      "<ABSENTE>",
      "<ABSENTE>",
    ]);
  });

  it("laisse gagner l'environnement, y compris sur une valeur vide", () => {
    // C'est ce qui permet de restaurer vers une AUTRE base en passant
    // DATABASE_URL sur la ligne de commande : `.env` ne doit pas la reprendre.
    expect(
      lire("SAUVEGARDES STOCKAGE_RACINE", ["SAUVEGARDES", "STOCKAGE_RACINE"], {
        SAUVEGARDES: "/autre/chemin",
        STOCKAGE_RACINE: "",
      }),
    ).toEqual(["</autre/chemin>", "<>"]);
  });

  it("ignore commentaires, lignes vides et lignes sans `=`, et un .env absent", () => {
    const script = [
      `. "${LIRE_ENV}"`,
      `lire_env "SAUVEGARDES" "${join(dossier, "pas-de-fichier")}"`,
      `printf '<%s>\\n' "\${SAUVEGARDES-ABSENTE}"`,
      "echo termine",
    ].join("\n");
    const sortie = execFileSync("/bin/sh", ["-c", script], {
      env: { PATH: process.env.PATH },
      encoding: "utf8",
    });
    expect(sortie.trimEnd().split("\n")).toEqual(["<ABSENTE>", "termine"]);
  });
});
