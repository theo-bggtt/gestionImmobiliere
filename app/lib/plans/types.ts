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

// Ce que pèsent réellement ces deux constantes : une photo de plan sur papier
// (2971x4096) sort à 2475 Ko une fois passée par LARGEUR_MAX_PLAN et
// QUALITE_PLAN ; une photo de téléphone (3603x2158) à 2207 Ko. Les plans de
// vérification de l'étape 4 sont des tracés synthétiques de 40 Ko et ne
// disaient rien de ce cas-là. Un porteur de lien recevait donc 2 à 3 Mo — le
// jardinier en 4G, décision #71.
//
// 1400 px est la largeur d'affichage maximale de la page de partage doublée :
// `.page-partage` est bornée à 720 px moins les gouttières, soit 688 px CSS,
// et aucun agent ne dépasse un rapport de 2 à cette largeur-là (un téléphone
// à 3x n'a que ~360 px de large). La même photo y pèse 456 Ko. La pleine
// résolution reste servie par un lien explicite, pour qui veut zoomer dans
// une cote.
export const LARGEUR_MOYENNE_PLAN = 1400;

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

/**
 * Un sommet de contour, en POURCENTAGE de l'image du plan — jamais en pixels,
 * exactement comme `point.x`/`point.y` et pour la même raison : remplacer
 * l'image d'un plan ne doit déplacer aucune géométrie.
 *
 * Le type vit ici plutôt que dans `geometrie.ts` parce que `app/db/schema/
 * plans.ts` le lit pour typer la colonne jsonb, et que la dépendance va de la
 * base vers la définition, jamais l'inverse (même règle que `ChampDefinition`).
 */
export type Sommet = { x: number; y: number };

/** Le contour d'une zone sur un plan, tel qu'il est servi à un écran. */
export type PolygoneZone = {
  zoneId: number;
  nom: string;
  sommets: Sommet[];
};

/**
 * Une zone que ce plan peut porter, côté propriétaire. La liste applique la
 * même règle de couverture que `clausePlanVisible` : un plan d'étage porte les
 * zones de son niveau, un plan de situation porte les zones extérieures.
 */
export type ZoneTracable = {
  id: number;
  nom: string;
  /** Nombre de sommets du contour déjà tracé, `null` s'il n'y en a pas. */
  sommets: number | null;
};

export const estPourcentage = (valeur: unknown): valeur is number =>
  typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 && valeur <= 100;
