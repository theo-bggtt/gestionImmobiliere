// scripts/verifier-bundle.mjs
// `tests/exports-routes.test.ts` interdit la cause connue — un export non
// reconnu depuis un module de route. Ce script-ci constate l'effet, sur les
// octets réellement produits : c'est le seul des deux qui verrait une fuite
// arrivée par un autre chemin (un composant client qui importe un `.server`,
// un module partagé qui touche la base).
//
// Il n'est PAS dans `npm test` volontairement : il exige un `npm run build`
// complet, et une suite qui met une minute à démarrer est une suite qu'on
// lance moins souvent.
//
//   npm run build && npm run verifier:bundle
//
// Les marqueurs sont des chaînes littérales, donc elles survivent à la
// minification : un nom de table SQL est écrit tel quel dans le schéma
// drizzle, et aucun code de navigateur n'a de raison de le porter.
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const RACINE = "build/client";

const MARQUEURS = [
  { motif: "zone_geom", quoi: "le schéma de la base (drizzle)" },
  { motif: "fichier_lien", quoi: "le schéma de la base (drizzle)" },
  { motif: "type_element", quoi: "le schéma de la base (drizzle)" },
  { motif: "SCRAM-SHA-256", quoi: "le client PostgreSQL (pg)" },
  { motif: "pg_catalog", quoi: "le client PostgreSQL (pg)" },
];

async function fichiersDe(dossier) {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const sortie = [];
  for (const e of entrees) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...(await fichiersDe(chemin)));
    else if (extname(e.name) === ".js") sortie.push(chemin);
  }
  return sortie;
}

let fichiers;
try {
  fichiers = await fichiersDe(RACINE);
} catch {
  console.error(`Aucun build dans ${RACINE}. Lancez d'abord : npm run build`);
  process.exit(1);
}

const coupables = [];
for (const chemin of fichiers) {
  const source = await readFile(chemin, "utf-8");
  for (const { motif, quoi } of MARQUEURS) {
    if (source.includes(motif)) coupables.push(`${chemin} contient « ${motif} » — ${quoi}`);
  }
}

if (coupables.length > 0) {
  console.error(`Le bundle client emporte du code serveur :\n  ${coupables.join("\n  ")}`);
  console.error(
    "\nCause la plus probable : un export non reconnu depuis un module de `app/routes/`,\n" +
      "ou un import de `.server` depuis un composant. Voir CLAUDE.md, section Conventions.",
  );
  process.exit(1);
}

console.log(`${fichiers.length} fichiers JS vérifiés dans ${RACINE} : aucun marqueur serveur.`);
