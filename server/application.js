// server/application.js
// La fabrique de l'application Express, séparée du point d'entrée qui
// écoute (`app.js`) pour être construite dans un test avec un gestionnaire
// factice à la place de React Router : ce qui est vérifié ici est ce que le
// serveur ajoute AUTOUR de l'application — d'où vient l'adresse du client,
// quels en-têtes partent, qui est freiné et qui ne l'est jamais.
//
// Tout ce fichier est du JavaScript sans étape de compilation, comme
// `app.js` : en production le conteneur lance `node server/app.js`, sans
// `tsx`. `tsconfig.json` l'inclut par `allowJs` pour que les tests l'importent
// typés.
import { randomBytes } from "node:crypto";
import express from "express";
import { cleDeFrein, creerLimiteur } from "./limiteur.js";

/** Un envoi légitime est une photo de capture (≤ 15 Mo, déjà compressée par
 *  le navigateur) ou l'image d'un plan (≤ 25 Mo). La route vérifie ces bornes
 *  sur le fichier une fois le corps lu ; celle-ci refuse AVANT de lire, sur
 *  `Content-Length`, ce qu'aucune route n'accepterait de toute façon. Un
 *  corps en `Transfer-Encoding: chunked` sans longueur annoncée passe ici :
 *  c'est `request_body max_size` dans le Caddyfile qui le borne, et les
 *  navigateurs annoncent toujours la longueur d'un `FormData`. */
export const TAILLE_MAX_CORPS = 30 * 1024 * 1024;

/**
 * Les limites par défaut. `/p/` compte les pages ET les images d'un lien :
 * une page de partage en charge une vingtaine, et une famille derrière la
 * même adresse NAT partage le compteur — la borne est large pour eux, et
 * reste une borne pour qui tient le Pi occupé. La connexion et l'inscription
 * partagent un compteur serré : chaque essai coûte un argon2, c'est-à-dire
 * un cœur pendant une fraction de seconde, et un formulaire public sans
 * frein devant est une attaque à quatre cœurs.
 */
export const LIMITES = {
  partage: { fenetreMs: 5 * 60_000, maximum: 600 },
  connexion: { fenetreMs: 60_000, maximum: 10 },
};

/**
 * Les en-têtes de tout l'arbre. Ceux du document de partage
 * (`app/lib/partage/document.ts`) restent posés par les routes ; ceux-ci
 * couvrent ce qu'une route ne renvoie pas — les actifs statiques, les 404,
 * les 429 du limiteur — et ce que le serveur seul peut savoir, comme le
 * protocole vu par le proxy pour HSTS.
 */
const ENTETES_COMMUNS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), microphone=(), payment=(), usb=()",
};

/**
 * L'arbre authentifié charge ses scripts, ses images de capture en `blob:`
 * (aperçu de la photo avant envoi) et le worker de pdf.js. Les scripts
 * inline de React Router (contexte d'hydratation, restauration du défilement)
 * portent le nonce généré par requête ; rien d'autre n'est autorisé inline.
 * `style-src 'unsafe-inline'` parce que les points d'un plan et les
 * étiquettes de contour sont positionnés par un attribut `style` en
 * pourcentage — c'est de la géométrie, pas du script.
 */
function cspApplication(nonce, developpement) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    // En développement seulement : le rechargement à chaud de Vite passe par
    // un WebSocket sur son propre port, hors de `'self'`.
    developpement ? "connect-src 'self' ws:" : "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * La page de partage ne charge aucun script : c'est la règle non négociable
 * de l'étape 3, tenue jusqu'ici par l'absence de `<Scripts />`. Cette
 * politique la fait tenir aussi par le navigateur — `default-src 'none'` sans
 * `script-src` interdit tout script, inline ou non, même si un jour une route
 * de `/p/` oubliait `handle.sansScripts`. Ce qu'elle autorise est exactement
 * ce que la page rend : la feuille de style, les images servies sous jeton,
 * le formulaire GET de recherche vers la même origine.
 */
const CSP_PARTAGE = [
  "default-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** Les mêmes valeurs que `ENTETES_PARTAGE`, posées ici pour les réponses que
 *  les routes ne produisent pas : un 429 du limiteur, une URL que rien ne
 *  reconnaît sous `/p/`. */
const ENTETES_PARTAGE_SERVEUR = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

/**
 * L'adaptateur Express de React Router recopie les en-têtes de la réponse
 * avec `res.append`, qui EMPILE sur ce que ce fichier a déjà posé : la page
 * de partage sortait avec deux `Cache-Control`, deux `Referrer-Policy`, deux
 * `X-Robots-Tag`. Identiques, donc sans effet — mais un jour différents, et
 * la seconde valeur contredirait la première sans que rien ne le dise. Pour
 * ces en-têtes à valeur unique, ce que la route décide REMPLACE le défaut du
 * serveur. `Set-Cookie` n'en fait pas partie : plusieurs cookies sont
 * plusieurs en-têtes, et c'est pour eux que `append` existe.
 */
const ENTETES_A_VALEUR_UNIQUE = new Set([
  "cache-control",
  "referrer-policy",
  "x-robots-tag",
]);

// Ces trois-là et pas un de plus. La liste avait d'abord été étendue à la
// politique de sécurité, HSTS et les deux `X-` — or pour la CSP le navigateur
// applique l'INTERSECTION de plusieurs en-têtes : empiler y est le
// comportement sûr, et remplacer laisserait une route affaiblir la ligne de
// base du serveur. Aucune route n'en pose aujourd'hui, donc c'était latent ;
// c'est justement pour ça qu'il fallait le refermer avant que ça devienne
// vrai. (Sur `/p/` l'intersection ne changerait rien — `default-src 'none'`
// est déjà le plancher — mais la règle vaut pour tout l'arbre.)

function laRouteRemplaceLeDefaut(res) {
  const append = res.append.bind(res);
  res.append = (nom, valeur) => (ENTETES_A_VALEUR_UNIQUE.has(String(nom).toLowerCase()) ? res.set(nom, valeur) : append(nom, valeur));
}

/**
 * @param {object} options
 * @param {import("express").RequestHandler} options.gestionnaire
 *   ce qui répond une fois les protections passées — React Router en
 *   production, une fonction factice dans les tests
 * @param {import("express").RequestHandler} [options.statiques]
 *   le service des fichiers du build (absent en test)
 * @param {number} [options.proxysDeConfiance]
 *   nombre de proxys entre le client et ce processus. 0 : aucun, l'adresse du
 *   socket est celle du client. 1 : exactement Caddy, dans le même compose —
 *   voir le README, « Mise en service ». Jamais `true` : ce serait croire
 *   toute la chaîne `X-Forwarded-For`, dont le premier maillon est écrit par
 *   le client lui-même.
 * @param {typeof LIMITES} [options.limites]
 * @param {number} [options.tailleMaxCorps]
 * @param {boolean} [options.developpement]
 *   vrai sous le serveur Vite : la politique de sécurité admet alors le
 *   WebSocket du rechargement à chaud, et rien d'autre ne change
 * @param {() => number} [options.maintenant]
 */
export function creerApplication({
  gestionnaire,
  statiques,
  proxysDeConfiance = 0,
  limites = LIMITES,
  tailleMaxCorps = TAILLE_MAX_CORPS,
  developpement = false,
  maintenant = Date.now,
}) {
  const app = express();
  app.disable("x-powered-by");

  // Un entier de sauts, pas `true` : avec N sauts de confiance, Express lit
  // l'adresse du client à N positions de la fin de `X-Forwarded-For`, là où
  // le dernier proxy digne de confiance l'a écrite. Caddy, par défaut, ignore
  // la valeur entrante de cet en-tête et la remplace par l'adresse qu'il voit
  // lui-même ; avec un saut, `req.ip` est donc cette adresse-là, et rien de
  // ce que le client a pu écrire.
  app.set("trust proxy", proxysDeConfiance > 0 ? proxysDeConfiance : false);

  const limiteurPartage = creerLimiteur({ ...limites.partage, maintenant });
  const limiteurConnexion = creerLimiteur({ ...limites.connexion, maintenant });

  app.use((req, res, next) => {
    laRouteRemplaceLeDefaut(res);
    for (const [nom, valeur] of Object.entries(ENTETES_COMMUNS)) res.setHeader(nom, valeur);

    // `req.secure` ne vaut que par `trust proxy` : sans lui, derrière Caddy,
    // tout arrive en HTTP et HSTS ne partirait jamais. Une année, sans
    // `preload` ni sous-domaines — le domaine ne porte que cette application.
    if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");

    // Comparé en minuscules parce que le routeur de React Router, lui, ne
    // distingue pas la casse (`caseSensitive: false` par défaut) : `/P/<jeton>`
    // servait la page de partage avec la politique de l'arbre AUTHENTIFIÉ,
    // c'est-à-dire `default-src 'self'` au lieu de `'none'`, et sans
    // `X-Robots-Tag` ni `Cache-Control` sur les réponses qu'aucune route ne
    // produit — un 404 de jeton inconnu, par exemple, dont l'URL porte le
    // jeton. Poser `caseSensitive: true` sur les routes ferait de `/P/` un 404
    // franc, mais ce 404-là resterait hors de ces en-têtes : c'est ici que le
    // problème se ferme, pas dans la table de routes.
    const chemin = req.path.toLowerCase();
    if (chemin === "/p" || chemin.startsWith("/p/")) {
      res.setHeader("Content-Security-Policy", CSP_PARTAGE);
      for (const [nom, valeur] of Object.entries(ENTETES_PARTAGE_SERVEUR)) res.setHeader(nom, valeur);
    } else {
      // Le nonce voyage par `res.locals` jusqu'au `getLoadContext` de React
      // Router, qui le remet au loader racine ; `<Scripts nonce>` le pose sur
      // ses balises. Seize octets aléatoires par réponse : rien à deviner.
      res.locals.nonce = randomBytes(16).toString("base64");
      res.setHeader("Content-Security-Policy", cspApplication(res.locals.nonce, developpement));
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    }
    next();
  });

  // Refus sur la longueur annoncée, avant que quiconque lise le corps.
  //
  // Répondre 413 ne suffit PAS à couper l'envoi, contrairement à ce que ce
  // commentaire affirmait : Node appelle `req._dump()`, qui DRAINE le corps
  // restant au lieu d'interrompre la connexion. Mesuré — un `Content-Length`
  // de 200 Mo contre une borne de 1 000 octets rend bien un 413, puis
  // 8 388 608 octets sont acceptés, socket toujours ouvert. Le refus
  // protégeait donc les routes, pas la bande passante ni la carte SD.
  //
  // `req.destroy()` une fois la réponse partie ferme ça. Caddy borne déjà le
  // corps (`request_body max_size`), mais cette borne-ci est la seule qui
  // vaille quand on n'est pas derrière lui : réseau local, port publié par
  // erreur, autre conteneur du même réseau.
  app.use((req, res, next) => {
    const longueur = Number(req.headers["content-length"]);
    if (Number.isFinite(longueur) && longueur > tailleMaxCorps) {
      res.on("finish", () => req.destroy());
      res.status(413).type("text/plain").send("Envoi trop volumineux.");
      return;
    }
    next();
  });

  const freiner = (limiteur) => (req, res, next) => {
    const verdict = limiteur.consommer(cleDeFrein(req.ip));
    if (verdict.autorise) return next();
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil(verdict.reessaiDansMs / 1000))));
    res.status(429).type("text/plain").send("Trop de requêtes. Réessayez dans un instant.");
  };

  // L'arbre `/p/` et les deux formulaires publics, et rien d'autre : l'usage
  // authentifié du propriétaire n'est jamais freiné — se faire jeter en
  // pleine capture serait pire que tout ce que le frein protège. Les
  // formulaires ne comptent que leurs envois : afficher la page ne coûte
  // rien, la vérifier coûte un argon2.
  app.use("/p", freiner(limiteurPartage));
  app.post(["/connexion", "/inscription"], freiner(limiteurConnexion));

  if (statiques) app.use(statiques);
  app.all("*", gestionnaire);

  return app;
}
