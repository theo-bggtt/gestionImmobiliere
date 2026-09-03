// app/lib/demarrage/types.ts
// Types du démarrage, NEUTRES : aucun import de drizzle ni du schéma. Même
// règle que `app/lib/forms/types.ts` et `app/lib/plans/types.ts`, et pour la
// même raison mesurée — l'écran de démarrage importe ces types et compose le
// squelette dans le navigateur ; les faire descendre du schéma y ferait
// descendre drizzle avec eux.

/** Ce que le propriétaire répond avant de voir une proposition. */
export type ReponsesDemarrage = {
  /** Une maison entière, ou un logement dans un immeuble. */
  forme: "maison" | "appartement";
  /** Niveaux habitables au-dessus du sol, rez compris. 1 à 8. */
  niveauxHabitables: number;
  /** Demandé, jamais déduit : `gastw` du RegBL ne compte pas les caves. */
  sousSol: boolean;
  combles: boolean;
  garage: boolean;
  /** Jardin et terrasse pour une maison, balcon pour un logement. */
  exterieur: boolean;
};

export type ZoneProposee = {
  /** Stable sur la durée de l'écran : sert de clé React et de cible aux retraits. */
  cle: string;
  nom: string;
  type: "interieur" | "exterieur" | "annexe" | "technique";
};

export type NiveauPropose = {
  cle: string;
  nom: string;
  /** Entier signé, c'est LE tri (règle non négociable #11). */
  ordinal: number;
  zones: ZoneProposee[];
};

export type BatimentPropose = {
  cle: string;
  nom: string;
  type: "principal" | "annexe" | "garage" | "abri";
  niveaux: NiveauPropose[];
};

export type SquelettePropose = {
  batiments: BatimentPropose[];
  /** `niveau_id` nul : le seul cas admis par le schéma (zones extérieures). */
  zonesExterieures: ZoneProposee[];
};

/**
 * Ce que l'écran reçoit du registre. Ces types vivent ICI et non dans
 * `regbl.server.ts` : `RechercheAdresse.tsx` les lit, et un composant qui
 * importe un module `.server`, même pour un type, est exactement la fuite que
 * `npm run verifier:bundle` a déjà attrapée une fois.
 *
 * Ni EGID, ni `egrid`, ni numéro de parcelle, ni coordonnées : le registre les
 * rend, le serveur les jette. L'absence de ces champs est une propriété du
 * type, donc une erreur de compilation le jour où quelqu'un voudrait les
 * ajouter sans y penser.
 */
export type CandidatBatiment = {
  /** Rang dans la liste : le seul identifiant qui descend au navigateur. */
  rang: number;
  /** L'adresse telle que le registre l'écrit, pour que le choix soit lisible. */
  etiquette: string;
  /** « Maison individuelle · 2 niveaux · 1962 » — pour reconnaître SON bâtiment. */
  description: string;
  /** Le pré-remplissage, et rien d'autre. Pas de `sousSol` : il se demande. */
  reponses: Pick<ReponsesDemarrage, "forme" | "niveauxHabitables">;
};

export type ResultatRegbl =
  | { statut: "ok"; candidats: CandidatBatiment[] }
  /** Rien trouvé : hors de Suisse, ou adresse inconnue. Le service ne le dit jamais lui-même. */
  | { statut: "aucun" }
  /** Le registre n'a pas répondu. Même issue pour le propriétaire, pas le même message. */
  | { statut: "indisponible" };

export const NIVEAUX_HABITABLES_MIN = 1;
export const NIVEAUX_HABITABLES_MAX = 8;

/** Bornes de l'écriture. Un squelette est une amorce, pas un import. */
export const MAX_BATIMENTS = 6;
export const MAX_NIVEAUX_PAR_BATIMENT = 12;
export const MAX_ZONES = 120;
export const MAX_LONGUEUR_NOM = 80;
