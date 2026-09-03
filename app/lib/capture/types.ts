// app/lib/capture/types.ts
// Formes partagées entre le serveur (qui produit l'instantané) et le client
// (qui le recopie dans IndexedDB). Fichier neutre : le client ne peut pas
// importer un module `.server`, même pour un type.

export type ZoneCapture = { id: number; nom: string; chemin: string };
export type TypeCapture = { id: number; nom: string; alias: string[] };
export type ElementCapture = { id: number; nom: string; zoneNom: string };

/**
 * Tout ce dont la feuille de capture a besoin pour se remplir toute seule,
 * en un seul objet : elle doit pouvoir s'afficher sans réseau, à la cave.
 */
export type InstantaneCapture = {
  proprieteId: number;
  proprieteNom: string;
  genereLe: string;
  zones: ZoneCapture[];
  types: TypeCapture[];
  /** Les objets déjà fichés, plus récemment touchés en tête (cas B). */
  elements: ElementCapture[];
  /** Zones triées par dernière capture, la plus récente en tête. */
  zonesRecentes: number[];
  /** Types triés par dernier usage, toutes zones confondues. */
  typesRecents: number[];
  /** Par zone, les types les plus posés dans cette zone (fréquence décroissante). */
  typesParZone: Record<string, number[]>;
};
