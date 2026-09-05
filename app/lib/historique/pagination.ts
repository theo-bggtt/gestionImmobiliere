// app/lib/historique/pagination.ts
// La pagination de la chronologie, NEUTRE : aucun import de drizzle ni du
// schéma. Même règle que `app/lib/historique/types.ts`, et pour la même raison
// — les deux loaders lisent ce module, les deux composants aussi.
//
// La forme est décidée par une contrainte et pas par une préférence : la page
// de partage ne charge AUCUN script (`handle.sansScripts`). Une pagination y
// est donc faite de LIENS, exactement comme le filtre par type est une liste
// de liens et comme les facettes de l'étape 2. Pas de bouton « charger plus »,
// pas de défilement infini — ils ne fonctionneraient que sur la moitié des
// écrans qui rendent ce composant.
import type { TypeEvenement } from "./types";

/**
 * La taille d'une page, fixée par le serveur et jamais par l'URL.
 *
 * `chargerChronologie` prenait `limite` et `decalage`, et l'ancien plafond
 * `LIMITE_MAX = 200` gardait une limite fournie par l'appelant — un garde-fou
 * pour un paramètre que personne n'a jamais passé. L'URL ne porte plus qu'un
 * numéro de page : le destinataire d'un lien n'a aucune raison de choisir le
 * coût d'une requête, et une taille de page servie depuis l'URL est un levier
 * de charge offert à qui lit le lien.
 */
export const PAR_PAGE = 50;

/**
 * Le numéro de page demandé, ramené dans les bornes plutôt que rejeté.
 *
 * Une URL bricolée (`?page=-3`, `?page=abc`, `?page=1e9`) mérite la première
 * page, pas une erreur : c'est le même traitement qu'un `?type=` inconnu, qui
 * est ignoré et non refusé. Le plafond, lui, dépend du total et n'est donc
 * connu qu'après la requête de comptage — il est appliqué par
 * `chargerChronologie`.
 */
export function lirePage(brut: string | null): number {
  const n = Number(brut);
  return Number.isSafeInteger(n) && n > 1 ? n : 1;
}

/** Le nombre de pages d'un fonds. Zéro événement fait quand même une page. */
export const nombreDePages = (total: number): number => Math.max(Math.ceil(total / PAR_PAGE), 1);

/**
 * L'URL de la chronologie, filtre et page compris. Un seul endroit l'écrit,
 * et c'est ce qui tient les deux critères qui mordent :
 *
 * - un lien de page CONSERVE le filtre par type en cours (les `type` sont
 *   toujours réémis) ;
 * - un lien de filtre REVIENT à la première page, parce que `FiltreTypes`
 *   l'appelle sans page et que `page=1` ne s'écrit pas — sinon on atterrit
 *   sur une page vide dès que le filtre réduit le fonds.
 */
export function urlChronologie(base: string, types: TypeEvenement[], page = 1): string {
  const sp = new URLSearchParams();
  for (const t of types) sp.append("type", t);
  if (page > 1) sp.set("page", String(page));
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}
