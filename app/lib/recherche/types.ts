// app/lib/recherche/types.ts
// Types partagés entre la requête serveur et les composants. Fichier neutre :
// aucun import de module `.server`, sinon le client embarquerait la base
// (même raison qu'en `app/lib/capture/types.ts`).

/** Pourquoi une fiche est remontée. Calculé au plus simple, voir README. */
export const MOTIFS = ["nom", "alias", "type", "zone", "systeme", "details"] as const;
export type Motif = (typeof MOTIFS)[number];

export const LIBELLE_MOTIF: Record<Motif, string> = {
  nom: "nom",
  alias: "alias",
  type: "type",
  zone: "zone",
  systeme: "système",
  details: "détails",
};

export type ResultatRecherche = {
  id: number;
  nom: string;
  zoneId: number;
  zoneNom: string;
  /** « Maison principale · Rez-de-chaussée », ou « Extérieur » si la zone n'a pas de niveau. */
  zoneChemin: string;
  typeId: number;
  typeNom: string;
  systemeId: number | null;
  systemeNom: string | null;
  /** Vignette de la photo la plus récente, ou null. */
  fichierId: number | null;
  motif: Motif | null;
};

export type Facette = { id: number; nom: string; nombre: number };

export type FacettesDisponibles = {
  zones: Facette[];
  systemes: Facette[];
  types: Facette[];
};

/** Facettes cochées : OU à l'intérieur d'une dimension, ET entre dimensions. */
export type FacettesActives = { zones: number[]; systemes: number[]; types: number[] };

export const FACETTES_VIDES: FacettesActives = { zones: [], systemes: [], types: [] };

export type TypeProche = { id: number; nom: string; alias: string[] };

export type ReponseRecherche = {
  q: string;
  resultats: ResultatRecherche[];
  /** Total avant la limite, pour afficher « n résultats » et paginer. */
  total: number;
  limite: number;
  decalage: number;
  /** Rempli seulement quand il n'y a aucun résultat : l'état vide utile. */
  typesProches: TypeProche[];
  /** Durée de la requête en base, en millisecondes (critère des 150 ms). */
  ms: number;
};

export type ZoneVignette = {
  id: number;
  nom: string;
  /** true = zone extérieure (niveauId NULL), affichée en fin de grille. */
  exterieure: boolean;
  chemin: string;
  nombre: number;
  fichierId: number | null;
};
