// app/components/historique/Pagination.tsx
// La pagination de la chronologie, rendue à l'identique par l'écran du
// propriétaire et par une page de partage — comme `Chronologie` et comme
// `FiltreTypes`.
//
// Des ancres, et rien d'autre. La page de partage ne charge aucun script
// (`handle.sansScripts`), donc un bouton « charger plus » y serait un ornement
// mort et un défilement infini n'existerait pas ; l'écran du propriétaire n'a
// aucune raison de se comporter autrement pour deux liens. C'est la même
// décision que pour le filtre par type, prise pour la même contrainte.
//
// Le composant ne décide rien : `page` et `pages` arrivent déjà bornés du
// serveur, et `urlChronologie` est le seul endroit qui sait qu'un lien de page
// doit conserver le filtre en cours.
import { urlChronologie } from "../../lib/historique/pagination";
import type { TypeEvenement } from "../../lib/historique/types";

export function Pagination({
  base,
  types,
  page,
  pages,
}: {
  base: string;
  types: TypeEvenement[];
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pages de la chronologie">
      {page > 1 ? (
        <a rel="prev" href={urlChronologie(base, types, page - 1)}>
          ← Précédents
        </a>
      ) : (
        // Un repère inerte plutôt qu'un lien désactivé : « précédent » n'existe
        // pas sur la première page, et un `<a>` sans `href` n'est pas
        // focalisable, donc il ne se distingue pas au clavier de celui qui suit.
        <span className="pagination-bout">← Précédents</span>
      )}

      <span className="pagination-rang">
        Page {page} sur {pages}
      </span>

      {page < pages ? (
        <a rel="next" href={urlChronologie(base, types, page + 1)}>
          Suivants →
        </a>
      ) : (
        <span className="pagination-bout">Suivants →</span>
      )}
    </nav>
  );
}
