// server/chemins-vitrine.js
// Les chemins exacts servis par l'arbre de la vitrine, écrits une seule fois.
//
// POURQUOI UN ENSEMBLE DE CHEMINS EXACTS, et non un préfixe : la vitrine est
// le seul arbre qui n'en a pas. `/p/` se reconnaît par `startsWith("/p/")` ;
// la vitrine vit à `/`, et `startsWith("/")` attrape tout le site — l'arbre
// authentifié compris, qui perdrait son nonce et gagnerait un cache public.
//
// POURQUOI DANS `server/` et non dans `app/lib/vitrine/` : `application.js`
// tourne sans étape de compilation (`node server/app.js`), donc il ne peut
// pas importer un `.ts` ; et l'image de production ne contient QUE `build`,
// `server`, `scripts` et `drizzle` — `app/` n'y est pas. Un import vers
// `app/lib/` marcherait en développement et casserait au démarrage du
// conteneur, c'est-à-dire la classe de défaut que cet arbre doit éviter.
// `tsconfig.json` inclut `server/**/*.js` par `allowJs`, donc le côté
// application le lit typé, à travers `app/lib/vitrine/document.ts`.
//
// Ce que cet ensemble commande : la politique de sécurité et les en-têtes que
// `application.js` pose sur ces réponses-là. Une page ajoutée à la table de
// routes sans être ajoutée ici perdrait sa politique EN SILENCE — la forme
// exacte du défaut qu'avait `/P/<jeton>`. `tests/vitrine/arbre.test.ts`
// échoue si les deux listes divergent.
//
// En minuscules, et comparé en minuscules : le routeur de React Router ne
// distingue pas la casse (`caseSensitive: false` par défaut), donc `/A-Propos`
// sert la page et doit recevoir la même politique qu'`/a-propos`.

/** @type {ReadonlySet<string>} */
export const CHEMINS_VITRINE = new Set(["/"]);

/**
 * Vrai si ce chemin est servi par la vitrine.
 *
 * @param {string} chemin `req.path`, tel quel
 * @returns {boolean}
 */
export function estCheminVitrine(chemin) {
  return CHEMINS_VITRINE.has(chemin.toLowerCase());
}
