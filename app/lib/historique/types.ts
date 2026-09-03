// app/lib/historique/types.ts
// Types de l'historique, NEUTRES : aucun import de drizzle ni du schéma. Même
// règle que `app/lib/forms/types.ts`, `app/lib/plans/types.ts` et
// `app/lib/demarrage/types.ts`, et pour la même raison mesurée — les écrans
// lisent ces types, et les faire descendre du schéma y ferait descendre
// drizzle avec eux. Le schéma importe la liste, jamais l'inverse.

/**
 * Les types d'événement, liste FERMÉE. Le schéma de l'étape 0 laissait
 * `evenement.type` en texte libre, faute de liste fournie par la spec : c'est
 * une omission, pas un choix. Un type est une catégorie, pas une description —
 * `titre` et `description` sont déjà là pour ce que le propriétaire veut dire,
 * et du texte libre rendu sur une page de partage est la même famille de fuite
 * que `plan.nom`. Fermer la liste supprime la fuite au lieu de la documenter.
 *
 * `autre` va tout avaler, et c'est assumé : sans lui le propriétaire est
 * coincé, et ajouter une valeur demande une migration (`ALTER TYPE … ADD
 * VALUE`). Le jour où « autre » domine la chronologie, c'est le signal qu'il
 * manque une valeur, pas que la liste doit s'ouvrir.
 */
export const TYPES_EVENEMENT = [
  "installation",
  "reparation",
  "entretien",
  "controle",
  "renovation",
  "sinistre",
  "autre",
] as const;

export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

export const LIBELLES_TYPE_EVENEMENT: Record<TypeEvenement, string> = {
  installation: "Installation",
  reparation: "Réparation",
  entretien: "Entretien",
  controle: "Contrôle",
  renovation: "Rénovation",
  sinistre: "Sinistre",
  autre: "Autre",
};

export const estTypeEvenement = (valeur: unknown): valeur is TypeEvenement =>
  typeof valeur === "string" && (TYPES_EVENEMENT as readonly string[]).includes(valeur);

/** Un objet lié, tel qu'il s'affiche sous une ligne de chronologie. */
export type ObjetLie = {
  id: number;
  nom: string;
  zoneNom: string;
};

/**
 * Un intervenant tel qu'il peut sortir vers un lien de partage : le nom de
 * l'entreprise et le métier, rien d'autre.
 *
 * Ni `tel`, ni `email`, ni `notes` : ce sont les données personnelles d'un
 * TIERS, qui n'a jamais accepté de figurer sur une URL qui circule dans
 * WhatsApp. Le nom de l'entreprise qui a posé la chaudière est un fait sur la
 * maison, et c'est la promesse du produit ; un numéro de téléphone est un
 * moyen de joindre quelqu'un. Le propriétaire l'a, s'il veut qu'on appelle
 * l'artisan il le transmet lui-même.
 *
 * L'absence de ces champs est une propriété du type : les écrire depuis un
 * loader de partage est une erreur de compilation, pas une revue à espérer.
 */
export type IntervenantRendu = {
  id: number;
  nom: string;
  metier: string | null;
};

/**
 * Une ligne de chronologie, servie telle quelle au propriétaire ET à un lien
 * de partage.
 *
 * `objets` porte TOUS les objets liés, sans second filtrage, et c'est une
 * conséquence du quantificateur universel : un événement n'est visible que si
 * tous ses objets liés passent la portée, donc un événement servi n'en a aucun
 * à masquer. Le rendu partiel n'existe pas ici.
 *
 * Pas de `cout` : il ne sort d'aucun lien, quel que soit le plafond.
 * Pas de `niveau` non plus — c'est de la métadonnée de visibilité, elle
 * n'apprend rien au destinataire et dit au contraire qu'il existe des crans.
 */
export type EvenementListe = {
  id: number;
  titre: string;
  /** ISO `YYYY-MM-DD` : `date` en base, pas de fuseau à traîner. */
  dateDebut: string;
  dateFin: string | null;
  type: TypeEvenement;
  objets: ObjetLie[];
};

/** Un événement déplié : ce que la page d'un événement rend, des deux côtés. */
export type EvenementDetail = EvenementListe & {
  description: string | null;
  intervenants: IntervenantRendu[];
  /** Identifiants de fichiers, servis par la route à jeton du partage. */
  photos: number[];
};

/** Une pastille de filtre de la chronologie, comptée sur le fonds VISIBLE. */
export type FacetteType = {
  type: TypeEvenement;
  compte: number;
};

/** Bornes de saisie. Un titre est une ligne, une description est un paragraphe. */
export const MAX_LONGUEUR_TITRE = 160;
export const MAX_LONGUEUR_DESCRIPTION = 4000;
export const MAX_LONGUEUR_NOM_INTERVENANT = 120;
export const MAX_LONGUEUR_CHAMP_COURT = 120;
export const MAX_LONGUEUR_NOTES = 4000;
