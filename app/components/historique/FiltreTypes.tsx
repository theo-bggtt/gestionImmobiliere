// app/components/historique/FiltreTypes.tsx
// Le filtre par type de la chronologie, en LIENS et non en boutons : la page
// de partage ne charge aucun JavaScript, et l'écran du propriétaire n'a aucune
// raison de se comporter autrement pour trois pastilles.
//
// Les comptes viennent de `chargerFacettesTypes`, calculés dans la requête
// filtrée : c'est le fonds VISIBLE, jamais le fonds. Une pastille
// « Sinistre (2) » sur un lien restreint apprendrait qu'il y a eu deux
// sinistres quand la liste n'en montre aucun — c'est la règle de la tuile
// « Local technique · 0 objet », appliquée au temps.
//
// Corollaire assumé : un type sans événement visible n'a pas de pastille du
// tout, donc le filtre d'un lien restreint est plus court que celui du
// propriétaire. C'est voulu, l'absence est le filtrage.
import { LIBELLES_TYPE_EVENEMENT, type FacetteType, type TypeEvenement } from "../../lib/historique/types";

export function FiltreTypes({
  base,
  facettes,
  actifs,
}: {
  base: string;
  facettes: FacetteType[];
  actifs: TypeEvenement[];
}) {
  if (facettes.length === 0) return null;

  const url = (types: TypeEvenement[]) => {
    const sp = new URLSearchParams();
    for (const t of types) sp.append("type", t);
    const q = sp.toString();
    return q ? `${base}?${q}` : base;
  };

  const bascule = (type: TypeEvenement) =>
    url(actifs.includes(type) ? actifs.filter((t) => t !== type) : [...actifs, type]);

  return (
    <section className="facettes">
      <div className="facettes-tete">
        <h2>Filtres</h2>
        {actifs.length > 0 && (
          <a className="bouton-discret" href={base}>
            Tout effacer ({actifs.length})
          </a>
        )}
      </div>
      <ul className="facettes-liste">
        {facettes.map((f) => {
          const actif = actifs.includes(f.type);
          return (
            <li key={f.type}>
              <a className={actif ? "pastille pastille-active" : "pastille"} href={bascule(f.type)}>
                {LIBELLES_TYPE_EVENEMENT[f.type]} <span className="pastille-nombre">{f.compte}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
