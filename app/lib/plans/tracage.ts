// app/lib/plans/tracage.ts
// Ce que devient un tracé en cours quand le serveur répond. C'est la seule
// chose que l'écran de tracé décide, donc c'est une fonction pure, testée sans
// base ni DOM — même découpage que `regroupement.ts`, qui est à la vue zoomable
// ce que ce fichier est au tracé.
//
// Le tracé ne touche la base qu'à « Terminer le contour » (limite connue de
// l'étape 6, et lecture la plus simple de « tant que ce n'est pas fini, ce
// n'est pas enregistré »). Ce qui manquait est la suite : l'écran effaçait les
// clics au moment de l'envoi, sans attendre la réponse. Un contour tracé sur un
// plan qui ne couvre pas la zone répond 404 (`enregistrerContour` vérifie la
// couverture par une requête, pas par la liste affichée) : le message
// s'affichait et les clics étaient perdus, il fallait tout retracer.
import type { Sommet } from "./types";

/**
 * Un tracé en cours. `envoye` dit qu'on attend une réponse POUR LUI : le même
 * fetcher sert aussi à effacer le contour d'une autre zone, et cet effacement
 * n'a aucune raison de jeter les clics en cours.
 */
export type TraceEnCours = {
  zoneId: number;
  zoneNom: string;
  sommets: Sommet[];
  envoye: boolean;
};

/** L'état d'un fetcher de React Router, réduit à ce qui nous intéresse. */
type EtatFetcher = "idle" | "loading" | "submitting";

/**
 * Le tracé après une réponse du serveur. Rendre `tracage` inchangé — la MÊME
 * référence — signifie « rien à décider » : `setTracage` court-circuite alors
 * le rendu, et l'appelant n'a pas de troisième cas à traiter.
 *
 * Trois issues, et une seule efface :
 * - rien envoyé, ou réponse pas encore là : on garde, évidemment ;
 * - refusée (404 de couverture, contour hors bornes) : on garde les clics et
 *   on rouvre l'envoi. C'est tout l'objet du fichier ;
 * - acceptée : on efface, parce que le contour est en base et que le
 *   rechargement du loader va le rendre.
 */
export function traceApres(
  tracage: TraceEnCours | null,
  etat: EtatFetcher,
  reponse: { erreur?: string } | undefined,
): TraceEnCours | null {
  if (!tracage?.envoye || etat !== "idle" || !reponse) return tracage;
  return reponse.erreur ? { ...tracage, envoye: false } : null;
}
