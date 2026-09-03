// app/lib/capture/instantane.ts
import { ecrireInstantane, lireInstantane } from "./file";
import type { InstantaneCapture } from "./types";

// Cache mémoire en plus d'IndexedDB : la feuille de capture doit s'ouvrir
// sans attendre une transaction, sinon la seconde compte double.
const cache = new Map<number, InstantaneCapture>();

export function instantaneEnMemoire(proprieteId: number): InstantaneCapture | undefined {
  return cache.get(proprieteId);
}

export async function chargerInstantane(proprieteId: number): Promise<InstantaneCapture | undefined> {
  const memoire = cache.get(proprieteId);
  if (memoire) return memoire;
  const stocke = await lireInstantane(proprieteId);
  if (stocke) cache.set(proprieteId, stocke);
  return stocke;
}

/** Recopie l'instantané serveur dans IndexedDB. Sans réseau, échoue en silence. */
export async function rafraichirInstantane(proprieteId: number): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const reponse = await fetch(`/proprietes/${proprieteId}/capture/donnees`);
    if (!reponse.ok || !reponse.headers.get("Content-Type")?.includes("application/json")) return;
    const instantane = (await reponse.json()) as InstantaneCapture;
    cache.set(proprieteId, instantane);
    await ecrireInstantane(instantane);
  } catch {
    // Hors ligne ou serveur muet : l'instantané précédent reste valable.
  }
}
