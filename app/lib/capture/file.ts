// app/lib/capture/file.ts
// Boîte d'envoi éphémère (règle non négociable #7 du plan) : ce n'est pas un
// stockage. Une entrée n'y vit qu'entre la capture et l'accusé de réception
// du serveur, et elle est purgée dès celui-ci reçu.
import type { InstantaneCapture } from "./types";

const NOM_BASE = "gestionImmobiliere";
const VERSION = 1;
const FILE = "file";
const INSTANTANE = "instantane";

export type CibleCapture =
  | { genre: "nouveau" }
  | { genre: "element"; elementId: number; elementNom: string };

export type EntreeFile = {
  /** Fabriqué avant l'écriture : sert de clé d'idempotence côté serveur. */
  id: string;
  proprieteId: number;
  cible: CibleCapture;
  zoneId: number | null;
  typeId: number | null;
  nom: string;
  photo: Blob;
  octets: number;
  datePrise: number;
  creeLe: number;
  tentatives: number;
  /** Renseigné = échec définitif, l'entrée reste visible au lieu de disparaître. */
  echec: string | null;
};

function attendre<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

let baseOuverte: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  baseOuverte ??= new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(NOM_BASE, VERSION);
    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(FILE)) base.createObjectStore(FILE, { keyPath: "id" });
      if (!base.objectStoreNames.contains(INSTANTANE)) base.createObjectStore(INSTANTANE, { keyPath: "proprieteId" });
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
  return baseOuverte;
}

async function magasin(nom: string, mode: IDBTransactionMode) {
  const base = await ouvrir();
  return base.transaction(nom, mode).objectStore(nom);
}

export async function ajouterEnFile(entree: EntreeFile): Promise<void> {
  await attendre((await magasin(FILE, "readwrite")).add(entree));
}

export async function listerFile(): Promise<EntreeFile[]> {
  const entrees = await attendre((await magasin(FILE, "readonly")).getAll() as IDBRequest<EntreeFile[]>);
  return entrees.sort((a, b) => a.creeLe - b.creeLe);
}

export async function retirerDeLaFile(id: string): Promise<void> {
  await attendre((await magasin(FILE, "readwrite")).delete(id));
}

export async function majEntree(id: string, modif: Partial<EntreeFile>): Promise<void> {
  const store = await magasin(FILE, "readwrite");
  const entree = await attendre(store.get(id) as IDBRequest<EntreeFile | undefined>);
  if (!entree) return;
  await attendre(store.put({ ...entree, ...modif }));
}

export async function lireInstantane(proprieteId: number): Promise<InstantaneCapture | undefined> {
  return attendre((await magasin(INSTANTANE, "readonly")).get(proprieteId) as IDBRequest<InstantaneCapture | undefined>);
}

export async function ecrireInstantane(instantane: InstantaneCapture): Promise<void> {
  await attendre((await magasin(INSTANTANE, "readwrite")).put(instantane));
}

/** Après déconnexion : la boîte d'envoi et les instantanés sont des données privées. */
export async function viderTout(): Promise<void> {
  const base = await ouvrir();
  const tx = base.transaction([FILE, INSTANTANE], "readwrite");
  tx.objectStore(FILE).clear();
  tx.objectStore(INSTANTANE).clear();
}
