// public/sw.js
// Coquille applicative en cache : l'app doit démarrer à la cave, sans réseau.
// Écrit à la main plutôt que généré : la stratégie tient en trente lignes et
// un générateur ajouterait une chaîne de build pour rien.

// `v2` : l'application est passée de `/` à `/proprietes`. Sans ce changement
// de version, un navigateur qui a déjà installé l'app porte l'ancienne racine
// dans `coquille-v1` et continuerait de l'ouvrir hors ligne — le handler
// `activate` ci-dessous ne supprime que les caches dont le nom ne finit PAS
// par la version courante.
//
// Ces deux noms sont écrits une seconde fois dans `app/lib/capture/coquille.ts`,
// qui amorce le cache depuis la page et ne peut rien importer d'ici : ce
// fichier est un script classique servi depuis `public/`, hors du graphe de
// modules de l'application. Duplication assumée et signalée des deux côtés,
// comme le nom de `french_sans_accent` et comme `SOMMETS_MIN` — et
// `tests/pwa/coquille.test.ts` échoue si les deux côtés divergent.
const VERSION = "v2";
const COQUILLE = `coquille-${VERSION}`;
const ACTIFS = `actifs-${VERSION}`;

self.addEventListener("install", () => {
  // Rien à pré-charger : les noms des actifs portent un hachage inconnu ici.
  // La première visite en ligne remplit le cache.
  self.skipWaiting();
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    (async () => {
      for (const nom of await caches.keys()) {
        if (!nom.endsWith(VERSION)) await caches.delete(nom);
      }
      await self.clients.claim();
    })(),
  );
});

async function documentReseauDAbord(requete) {
  const cache = await caches.open(COQUILLE);
  try {
    const reponse = await fetch(requete);
    // Une redirection (session expirée) ou une erreur ne doit jamais figer le
    // cache : on ne garde que des documents complets et de même origine.
    if (reponse.ok && reponse.type === "basic") cache.put(requete, reponse.clone());
    return reponse;
  } catch {
    // Pas de repli sur un autre document : servir l'HTML de `/proprietes`
    // sous une autre URL ferait échouer l'hydratation et donnerait un écran
    // blanc, pire que la page hors ligne du navigateur.
    return (await cache.match(requete)) || Response.error();
  }
}

async function actifCacheDAbord(requete) {
  const cache = await caches.open(ACTIFS);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok) cache.put(requete, reponse.clone());
  return reponse;
}

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // La capture a sa propre copie hors ligne (IndexedDB) et les images sont
  // des données privées : ni l'une ni les autres n'ont à traîner ici.
  if (url.pathname.includes("/capture/") || url.pathname.includes("/fichiers/")) return;

  if (requete.mode === "navigate") {
    evenement.respondWith(documentReseauDAbord(requete));
  } else if (url.pathname.startsWith("/assets/")) {
    evenement.respondWith(actifCacheDAbord(requete));
  }
});
