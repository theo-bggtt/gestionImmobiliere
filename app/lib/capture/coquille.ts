// app/lib/capture/coquille.ts
// Le service worker ne voit passer un document que lors d'un chargement dur.
// Or React Router navigue en SPA : après la connexion, plus aucune requête de
// document n'est émise, et le cache resterait donc vide au moment précis où on
// en aurait besoin. C'est la page qui doit amorcer la coquille elle-même.
import { ACCUEIL } from "../auth/redirection";

// Les noms de cache de `public/sw.js`, écrits une seconde fois parce qu'un
// script de service worker classique, servi depuis `public/`, est hors du
// graphe de modules de l'application : il ne peut rien importer d'ici, et
// rien ici ne peut l'importer. Duplication assumée et signalée des deux
// côtés, comme le nom de `french_sans_accent` et comme `SOMMETS_MIN`. Le
// suffixe DOIT suivre la `VERSION` de `sw.js`, dont le handler `activate`
// supprime tout cache qui ne finit pas par elle ; `tests/pwa/coquille.test.ts`
// échoue si les deux côtés divergent.
export const COQUILLE = "coquille-v3";
const ACTIFS = "actifs-v3";

/** Les caches de la version courante. Tout autre est un reste d'avant. */
const CACHES_COURANTS = [COQUILLE, ACTIFS];

let dejaFait = false;

export async function prechargerCoquille(): Promise<void> {
  if (dejaFait || typeof caches === "undefined" || !navigator.onLine) return;
  dejaFait = true;
  try {
    // `ACCUEIL` est le `start_url` du manifeste : c'est le document par
    // lequel l'app démarre depuis l'écran d'accueil, donc le seul qui doive
    // survivre au mode avion. Ce n'est plus `/`, qui appartient à la vitrine
    // publique et n'a aucune raison de traîner dans le cache de l'app. Une
    // réponse redirigée voudrait dire session expirée.
    const reponse = await fetch(ACCUEIL, { redirect: "follow" });
    if (reponse.ok && !reponse.redirected) {
      await (await caches.open(COQUILLE)).put(ACCUEIL, reponse.clone());
    }

    // Les noms d'actifs portent un hachage de build : plutôt qu'un manifeste
    // à tenir à jour, on prend ce que la page vient réellement de charger.
    const actifs = await caches.open(ACTIFS);
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin + "/assets/"));
    await Promise.all(
      urls.map(async (u) => {
        if (!(await actifs.match(u))) await actifs.add(u);
      }),
    );
  } catch {
    // Hors ligne, cache refusé, quota plein : l'app marche, elle ne démarrera
    // simplement pas sans réseau tant que ce préchargement n'aura pas abouti.
    dejaFait = false;
  }
}

/**
 * Retire ce qu'une version antérieure de l'application a laissé derrière
 * elle : son inscription de service worker, puis ses caches.
 *
 * L'inscription d'abord, et c'est le point non évident : une inscription est
 * identifiée par sa PORTÉE, pas par son script. `register("/sw.js", { scope:
 * ACCUEIL })` ne remplace donc pas celle de la racine, il en ajoute une
 * seconde — mesuré au navigateur : l'ancien worker continuait de contrôler
 * `/`, `/connexion` et `/p/`, et de remplir `coquille-v1` pendant que le
 * nouveau remplissait `coquille-v2`.
 *
 * Les caches ensuite, bien que le handler `activate` du nouveau worker les
 * supprime déjà : il tourne AVANT que l'ancien ne meure, et celui-ci recrée
 * le sien en servant les actifs de la page en cours. Mesuré aussi — un
 * `actifs-v1` orphelin survivait à la mise à jour. Appelée à chaque montage,
 * cette fonction rattrape au chargement suivant ce qu'une course lui aurait
 * fait manquer.
 */
export async function retirerAnciennesVersions(): Promise<void> {
  const attendue = new URL(ACCUEIL, window.location.origin).href;
  const inscriptions = await navigator.serviceWorker.getRegistrations();
  await Promise.all(inscriptions.filter((i) => i.scope !== attendue).map((i) => i.unregister()));

  if (typeof caches === "undefined") return;
  const noms = await caches.keys();
  await Promise.all(noms.filter((n) => !CACHES_COURANTS.includes(n)).map((n) => caches.delete(n)));
}
