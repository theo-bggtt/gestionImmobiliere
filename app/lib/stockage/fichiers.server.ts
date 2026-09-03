// app/lib/stockage/fichiers.server.ts
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

// Interface de stockage volontairement réduite à trois verbes. Le reste de
// l'application ne connaît qu'un `chemin` opaque : passer à S3 plus tard ne
// doit toucher que ce fichier.
const RACINE = resolve(process.env.STOCKAGE_RACINE ?? "./donnees/fichiers");

// Les chemins sont fabriqués par l'application (jamais par le client), mais
// une remontée d'arborescence coûterait tout le disque : on vérifie quand même.
function cheminAbsolu(chemin: string): string {
  const absolu = resolve(join(RACINE, chemin));
  if (absolu !== RACINE && !absolu.startsWith(RACINE + sep)) {
    throw new Error(`Chemin de stockage hors racine : ${chemin}`);
  }
  return absolu;
}

export async function sauvegarder(chemin: string, contenu: Buffer): Promise<void> {
  const absolu = cheminAbsolu(chemin);
  await mkdir(dirname(absolu), { recursive: true });
  await writeFile(absolu, contenu);
}

export async function lire(chemin: string): Promise<Buffer> {
  return readFile(cheminAbsolu(chemin));
}

export async function supprimer(chemin: string): Promise<void> {
  try {
    await unlink(cheminAbsolu(chemin));
  } catch (erreur) {
    // Supprimer ce qui n'existe déjà plus est le résultat attendu.
    if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") throw erreur;
  }
}

// La vignette n'a pas de colonne dédiée : elle se déduit du chemin de
// l'original, ce qui évite une migration pour une donnée entièrement dérivée.
export function cheminVignette(cheminOriginal: string): string {
  return cheminOriginal.replace(/\.jpg$/, "") + ".vignette.jpg";
}
