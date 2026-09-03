// app/lib/plans/types.ts
// Types partagés entre les requêtes serveur et les composants de plan.
// Fichier neutre : aucun import de module `.server`, sinon le client
// embarquerait la base (même raison qu'en `app/lib/recherche/types.ts`).

export type TypePlan = "etage" | "situation";

// Un plan n'est pas une photo d'objet. `LARGEUR_MAX` vaut 2000 px, soit
// ~120 dpi sur un A3 : une annotation de 2 mm y tombe à 9 px de haut,
// illisible dès qu'on zoome sur un couloir. 3500 px font ~210 dpi, soit 16 à
// 20 px pour la même annotation. Au-delà, on double les octets pour du détail
// qu'aucun écran ne peut exploiter — 3500 px dans un viewport de 400 px sont
// déjà un zoom 8,75x.
export const LARGEUR_MAX_PLAN = 3500;

// mozjpeg à 82 est calibré pour de la photo ; c'est sur du trait noir fin sur
// fond blanc — un plan — qu'il produit son ringing le plus visible.
export const QUALITE_PLAN = 90;

/** Un plan tel que le propriétaire le voit : avec le nom qu'il a saisi. */
export type PlanListe = {
  id: number;
  type: TypePlan;
  nom: string;
  niveauId: number | null;
  niveauNom: string | null;
  batimentNom: string | null;
  ordinal: number | null;
  ordre: number;
  imageFichierId: number | null;
  /** 1, 2… quand un niveau porte plusieurs plans (l'architecte et l'électricien). */
  rang: number;
};

/**
 * Un plan tel qu'un lien de partage le voit : une étiquette dérivée du
 * niveau, jamais le nom saisi par le propriétaire — qui peut y avoir écrit
 * l'adresse (règle non négociable #7).
 */
export type PlanEtiquete = {
  id: number;
  etiquette: string;
  situation: boolean;
};

/**
 * Un point est un élément placé. `x` et `y` sont des POURCENTAGES de l'image,
 * jamais des pixels : c'est ce qui permet de remplacer l'image d'un plan
 * sans déplacer un seul point.
 */
export type PointPlan = {
  id: number;
  elementId: number;
  nom: string;
  typeNom: string;
  zoneNom: string;
  x: number;
  y: number;
};

/** Lu si la table est remplie, jamais écrit avant l'étape 6. */
export type PolygoneZone = {
  zoneId: number;
  nom: string;
  sommets: { x: number; y: number }[];
};

export const estPourcentage = (valeur: unknown): valeur is number =>
  typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 && valeur <= 100;
