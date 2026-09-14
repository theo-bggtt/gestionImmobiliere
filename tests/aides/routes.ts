// tests/aides/routes.ts
// Lire la table de routes comme une liste de chemins servis.
//
// Deux gardes statiques en ont besoin — celui de la PWA (le `start_url`
// correspond-il à une route ?) et celui de la vitrine (les deux listes de
// chemins disent-elles la même chose ?) — et une seconde écriture de la même
// marche divergerait de la première.
import type { RouteConfig } from "@react-router/dev/routes";

/** Une entrée de la table, telle que la rendent `route`, `index`, `layout` et
 *  `prefix`. Le type du plugin n'est pas importé : ce qui est lu ici en est un
 *  sous-ensemble stable, et `RouteConfig` n'expose pas ces champs au lecteur. */
type Entree = { path?: string; index?: boolean; file?: string; children?: Entree[] };

/** Un chemin servi, et le module qui le sert. */
export type CheminServi = { chemin: string; fichier: string };

/**
 * Les chemins réellement servis par une table de routes, avec leur module.
 *
 * Une entrée sans enfants est une route servie ; une entrée qui en a est une
 * mise en page, qui ne sert que par eux. `prefix` ayant déjà joint les
 * segments de son côté, il ne reste qu'à enchaîner les niveaux d'imbrication.
 */
export function cheminsServis(routes: RouteConfig, base = ""): CheminServi[] {
  const sortie: CheminServi[] = [];
  for (const e of routes as unknown as Entree[]) {
    const ici = e.path === undefined ? base : `${base}/${e.path}`.replace(/\/{2,}/g, "/");
    if (e.children) sortie.push(...cheminsServis(e.children as unknown as RouteConfig, ici));
    else sortie.push({ chemin: ici === "" ? "/" : ici, fichier: e.file ?? "" });
  }
  return sortie;
}
