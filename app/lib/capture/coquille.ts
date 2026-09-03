// app/lib/capture/coquille.ts
// Le service worker ne voit passer un document que lors d'un chargement dur.
// Or React Router navigue en SPA : après la connexion, plus aucune requête de
// document n'est émise, et le cache resterait donc vide au moment précis où on
// en aurait besoin. C'est la page qui doit amorcer la coquille elle-même.

const COQUILLE = "coquille-v1";
const ACTIFS = "actifs-v1";

let dejaFait = false;

export async function prechargerCoquille(): Promise<void> {
  if (dejaFait || typeof caches === "undefined" || !navigator.onLine) return;
  dejaFait = true;
  try {
    // `/` est le `start_url` du manifeste : c'est le document par lequel l'app
    // démarre depuis l'écran d'accueil, donc le seul qui doive survivre au
    // mode avion. Une réponse redirigée voudrait dire session expirée.
    const reponse = await fetch("/", { redirect: "follow" });
    if (reponse.ok && !reponse.redirected) {
      await (await caches.open(COQUILLE)).put("/", reponse.clone());
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
