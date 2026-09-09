// app/lib/auth/redirection.ts
// Où va le navigateur après une connexion réussie.
//
// Module NEUTRE — aucun import de drizzle, du schéma ni de React Router, même
// règle que `app/lib/forms/types.ts` : il est lu par une route et il doit
// pouvoir l'être sans rien traîner. Il n'a pas d'autre raison d'exister que
// celle-ci, et elle suffit :
//
//   `/connexion?depuis=…` est le SEUL formulaire public de l'application, et
//   sa destination arrivait jusqu'à `redirect()` sans être regardée.
//
// `https://<domaine>/connexion?depuis=https://faux-domaine/` : la victime
// reconnaît son domaine, se connecte pour de vrai, et atterrit sur une copie
// de l'écran de connexion qui redemande le mot de passe. Aucun compte à
// posséder, aucun lien de partage, rien — juste une URL. C'est la seule chose
// qu'un inconnu peut faire faire à ce serveur, et c'est pour ça qu'elle est
// bordée ici plutôt qu'à l'endroit qui fabrique le paramètre.
//
// `requireUtilisateurId` le fabrique bien, lui, à partir d'un `pathname` seul.
// Mais le champ caché du formulaire accepte ce qu'on y met : c'est le LECTEUR
// qui doit se défendre, pas le producteur.

/** La destination de repli. Un chemin, jamais une URL. */
export const ACCUEIL = "/";

/**
 * Rend `valeur` si c'est un chemin interne, `ACCUEIL` sinon. Ne nettoie
 * jamais : ce qui n'est pas manifestement interne est remplacé, pas réparé.
 * Un nettoyage laisse toujours une forme à laquelle on n'a pas pensé.
 */
export function cheminInterne(valeur: unknown, defaut: string = ACCUEIL): string {
  if (typeof valeur !== "string" || valeur.length === 0) return defaut;

  // Les navigateurs SUPPRIMENT tabulation, saut de ligne et retour chariot
  // d'une URL avant de la résoudre : `/\n/exemple.test` leur arrive comme
  // `//exemple.test`, c'est-à-dire un autre domaine. Le caractère nul et les
  // autres commandes sont refusés avec eux — ils n'ont rien à faire dans un
  // chemin, et chacun est une occasion de divergence entre ce que nous lisons
  // et ce que le navigateur lit.
  if (/[\u0000-\u001f\u007f]/.test(valeur)) return defaut;

  // Un chemin interne commence par un `/` et un seul.
  if (!valeur.startsWith("/")) return defaut;

  // `//hote` est une URL dite « à protocole relatif » : elle sort du site en
  // gardant le schéma courant. `\` compte pour `/` dans les navigateurs, donc
  // `/\hote` sort aussi. Les deux se ressemblent assez peu à l'œil pour qu'on
  // les nomme ici plutôt que de les laisser à une expression régulière.
  if (valeur[1] === "/" || valeur[1] === "\\") return defaut;

  return valeur;
}
