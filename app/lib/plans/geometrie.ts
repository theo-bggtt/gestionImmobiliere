// app/lib/plans/geometrie.ts
// Le contour d'une zone tracé sur un plan, et la seule question qu'on lui
// pose : « ce point est-il dedans ? ». Fichier NEUTRE et PUR — aucun import de
// module `.server`, aucun DOM, aucune horloge. C'est le seul endroit de
// l'étape 6 qui décide quelque chose, donc le seul qui se teste sans base ni
// navigateur, sur le modèle de `regroupement.ts`.
//
// Le test est écrit en JavaScript et non en SQL alors que PostgreSQL porte un
// type `polygon` et un opérateur `@>`. Deux raisons : le stockage est du jsonb
// (décidé à la migration 0000, et le convertir à chaque lecture serait une
// seconde écriture de la géométrie), et surtout les bords — un point posé
// exactement sur une arête — se décident ici, une fois, sous des tests qui les
// nomment, plutôt que dans la sémantique d'un opérateur qu'on relit mal.

import type { Sommet } from "./types";

// Trois sommets font le plus petit contour qui enferme quelque chose. Le
// plafond n'est pas une limite d'écran mais une borne de coût : la validation
// en base, le test d'appartenance et le SVG servi grandissent tous
// linéairement, et le geste que le plan décrit est « 5 clics par zone, aucune
// mesure ». Quarante laisse largement la place à une zone en L ou à une
// terrasse biscornue tracée à la main.
//
// Ces deux bornes sont écrites une seconde fois dans le SQL de la migration
// 0009, qui définit la contrainte : une constante partagée est impossible,
// puisque la contrainte vit dans la base. Même duplication assumée que le nom
// de la configuration `french_sans_accent`, et signalée des deux côtés.
export const SOMMETS_MIN = 3;
export const SOMMETS_MAX = 40;

// Les coordonnées sont des pourcentages, donc des nombres de l'ordre de 100 :
// 1e-9 est du bruit de flottant, pas une tolérance de saisie. Ce n'est pas un
// rayon d'accrochage — un clic ne tombe jamais « exactement » sur une arête —
// mais ce qui rend le test des bords DÉTERMINISTE au lieu de dépendre de
// l'arrondi de la dernière multiplication.
const EPSILON = 1e-9;

const estCoordonnee = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

/**
 * Le jumeau applicatif de la contrainte `zone_geom_contour_valide`. La base
 * reste la seule garantie (voir le commentaire de `zoneGeom` dans
 * `app/db/schema/plans.ts`) ; ceci sert à rendre un message plutôt qu'une
 * erreur de contrainte, exactement comme `estPourcentage` le fait pour
 * `point_x_valide`.
 */
export function lireContour(brut: unknown): Sommet[] | null {
  if (!Array.isArray(brut)) return null;
  if (brut.length < SOMMETS_MIN || brut.length > SOMMETS_MAX) return null;

  const sommets: Sommet[] = [];
  for (const s of brut) {
    if (s === null || typeof s !== "object") return null;
    const { x, y } = s as Record<string, unknown>;
    if (!estCoordonnee(x) || !estCoordonnee(y)) return null;
    sommets.push({ x, y });
  }
  return sommets;
}

/**
 * Le point est-il sur le segment [a, b], bornes comprises ?
 *
 * Testé AVANT le lancer de rayon, et c'est ce qui rend la règle explicite :
 * **un point sur le bord est dedans**. Le lancer de rayon seul ne dit rien
 * d'utile d'un point posé sur une arête ou sur un sommet — la réponse dépend
 * alors du sens de parcours et de l'arrondi. Deux zones mitoyennes partagent
 * un mur : un point posé exactement dessus appartient donc aux deux, ce qui le
 * rend AMBIGU, et une proposition ambiguë n'est pas une proposition
 * (`zoneDuPoint`). Les deux bords échouent du côté qui n'écrit rien.
 */
export function surLeSegment(p: Sommet, a: Sommet, b: Sommet): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const longueur = Math.hypot(dx, dy);
  // Segment dégénéré (deux clics au même endroit) : il se réduit à son point.
  if (longueur < EPSILON) return Math.hypot(p.x - a.x, p.y - a.y) <= EPSILON;

  // |produit vectoriel| / longueur est la distance du point à la DROITE.
  const produitVectoriel = dx * (p.y - a.y) - dy * (p.x - a.x);
  if (Math.abs(produitVectoriel) > EPSILON * longueur) return false;

  // Sur la droite, mais entre a et b ? La projection le dit sans racine carrée.
  const projection = (p.x - a.x) * dx + (p.y - a.y) * dy;
  return projection >= -EPSILON && projection <= longueur * longueur + EPSILON;
}

/**
 * Lancer de rayon horizontal, règle **pair-impair**. Un contour concave est
 * traité correctement sans rien de plus ; un contour qui se croise l'est aussi,
 * au sens pair-impair — le lobe où le tracé se recoupe est alors DEHORS. C'est
 * un choix, pas un accident : l'autre convention (enroulement non nul) dirait
 * « dedans » et demanderait de connaître le sens de parcours, quand un tracé
 * fait à la main n'en a aucun de garanti. Ce qui compte est que la réponse
 * soit la même à chaque appel, et un test la fixe.
 *
 * `(b.y > p.y) !== (a.y > p.y)` : une comparaison stricte d'un côté et large
 * de l'autre, c'est ce qui empêche un sommet traversé par le rayon d'être
 * compté deux fois.
 */
export function dansLeContour(p: Sommet, sommets: Sommet[]): boolean {
  if (sommets.length < SOMMETS_MIN) return false;

  let dedans = false;
  for (let i = 0, j = sommets.length - 1; i < sommets.length; j = i++) {
    const a = sommets[j];
    const b = sommets[i];
    if (surLeSegment(p, a, b)) return true;

    const traverse = b.y > p.y !== (a.y > p.y);
    if (traverse && p.x < ((a.x - b.x) * (p.y - b.y)) / (a.y - b.y) + b.x) dedans = !dedans;
  }
  return dedans;
}

/**
 * La zone que la géométrie propose pour ce point, ou `null`.
 *
 * **Un seul contour contenant, ou rien.** Deux contours qui se recouvrent, ou
 * une zone imbriquée dans une autre (cave > cellier, jardin > potager), ne
 * donnent pas « la plus petite » : choisir demanderait de comparer des aires
 * tracées à la main sur une photo de plan jamais redressée, c'est-à-dire de
 * deviner. Zéro et deux se traitent pareil — on ne propose rien — parce que
 * ce qui est en jeu au bout est `element.zone_id`, la colonne qui décide de ce
 * qu'un lien de partage montre (règle non négociable #1).
 */
export function zoneDuPoint(
  p: Sommet,
  contours: { zoneId: number; sommets: Sommet[] }[],
): number | null {
  const dedans = contours.filter((c) => dansLeContour(p, c.sommets));
  return dedans.length === 1 ? dedans[0].zoneId : null;
}

/**
 * Où poser l'étiquette d'un contour : son centre de gravité (formule du
 * lacet). La moyenne des sommets suffirait pour un rectangle, mais elle dérive
 * vers le côté le plus densément cliqué dès qu'une zone en L reçoit six clics
 * sur un mur et deux sur l'autre.
 *
 * Repli sur la moyenne des sommets quand l'aire est nulle — trois clics
 * alignés, ou deux clics au même endroit : la formule divise alors par zéro.
 */
export function centre(sommets: Sommet[]): Sommet {
  const moyenne = () => ({
    x: sommets.reduce((s, v) => s + v.x, 0) / sommets.length,
    y: sommets.reduce((s, v) => s + v.y, 0) / sommets.length,
  });
  if (sommets.length === 0) return { x: 50, y: 50 };
  if (sommets.length < SOMMETS_MIN) return moyenne();

  let aireDouble = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = sommets.length - 1; i < sommets.length; j = i++) {
    const a = sommets[j];
    const b = sommets[i];
    const croix = a.x * b.y - b.x * a.y;
    aireDouble += croix;
    cx += (a.x + b.x) * croix;
    cy += (a.y + b.y) * croix;
  }
  if (Math.abs(aireDouble) < EPSILON) return moyenne();
  return { x: cx / (3 * aireDouble), y: cy / (3 * aireDouble) };
}
