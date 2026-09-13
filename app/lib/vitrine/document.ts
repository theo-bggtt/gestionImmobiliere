// app/lib/vitrine/document.ts
// Ce qu'une page de vitrine change au document.
//
// Module NEUTRE — aucun import de drizzle ni du schéma, même règle que
// `app/lib/forms/types.ts` et `app/lib/historique/types.ts`. Ici la règle est
// plus qu'une convention de bundle : la vitrine ne lit PAS la base, et
// `tests/vitrine/etancheite.test.ts` le tient sur tout l'arbre.
import { CHEMINS_VITRINE } from "../../../server/chemins-vitrine.js";

// L'ensemble des chemins vit dans `server/` — voir le commentaire là-bas :
// `application.js` tourne sans compilation et l'image de production ne
// contient pas `app/`. Réexporté ici pour que le côté application ait un seul
// endroit où lire les affaires de la vitrine.
export { CHEMINS_VITRINE };

/**
 * Le même marqueur que la page de partage, et surtout pas un second :
 * `root.tsx` lit `handle.sansScripts` et ne connaît qu'une propriété.
 *
 * Réexporté ici pour que les routes de la vitrine n'aient pas à importer un
 * module de `partage/`, dont elles ne partagent ni le sujet ni les raisons.
 * Les deux arbres arrivent au même endroit par deux chemins : la page de
 * partage ne charge rien pour protéger un jeton, la vitrine ne charge rien
 * parce qu'elle n'a rien à charger.
 */
export { HANDLE_SANS_SCRIPTS } from "../partage/document";

/**
 * Les en-têtes d'une page de vitrine — le contraire exact de ceux d'un
 * partage, et c'est le point.
 *
 * `Cache-Control` PUBLIC : ces pages sont les mêmes pour tout le monde,
 * ne dépendent d'aucune session et ne lisent pas la base. Un partage, lui,
 * est `private, no-store` parce qu'il se révoque.
 *
 * PAS de `X-Robots-Tag: noindex` : une vitrine qu'on n'indexe pas ne sert à
 * rien. C'est la seule surface publique du projet qui doive être trouvée.
 *
 * `Referrer-Policy` reste celle de l'arbre authentifié : une page publique
 * n'a pas de jeton dans son URL, donc rien à cacher à la destination d'un
 * lien sortant, mais rien n'oblige non plus à envoyer le chemin complet.
 *
 * Ces trois noms figurent dans `ENTETES_A_VALEUR_UNIQUE` de
 * `server/application.js` : ce que la route pose REMPLACE le défaut du
 * serveur au lieu de s'y empiler. Vérifié sur une vraie réponse dans
 * `tests/vitrine/arbre.test.ts`, pas déduit de la lecture du code.
 */
export const ENTETES_VITRINE = {
  "Cache-Control": "public, max-age=300",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/**
 * L'adresse à laquelle on demande à être retiré de la liste d'attente.
 *
 * À REMPLACER par une adresse réelle avant la mise en service — c'est la
 * seule valeur de la vitrine qui promet quelque chose à quelqu'un d'autre, et
 * une adresse qui ne reçoit pas transforme la page la plus honnête du site en
 * la plus mensongère. Elle est nommée ici plutôt qu'écrite dans la page pour
 * qu'il n'y ait qu'un endroit à changer, et que ce changement se voie.
 *
 * Une adresse de rôle sur le domaine du site, et non une adresse personnelle :
 * elle sera lue par des inconnus et moissonnée par des robots.
 */
export const CONTACT_RETRAIT = "contact@gestion-immobiliere.invalid";
