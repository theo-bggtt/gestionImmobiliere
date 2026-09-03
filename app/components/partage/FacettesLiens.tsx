// app/components/partage/FacettesLiens.tsx
// Les mêmes pastilles que dans l'application, en liens plutôt qu'en boutons :
// la page de partage ne charge aucun JavaScript, un `onClick` n'y ferait rien.
// Même feuille de style, mêmes classes — on retire, on ne redessine pas.
import { ecrireParamsRecherche } from "../../lib/recherche/params";
import type { Facette, FacettesActives, FacettesDisponibles } from "../../lib/recherche/types";

type Dimension = keyof FacettesActives;

const TITRES: Record<Dimension, string> = {
  systemes: "Système",
  zones: "Zone",
  types: "Type",
};

// Le repli passe par <details>, le seul dépliant qui fonctionne sans script.
const REPLI = 8;

export function FacettesLiens({
  base,
  q,
  disponibles,
  actives,
}: {
  base: string;
  q: string;
  disponibles: FacettesDisponibles;
  actives: FacettesActives;
}) {
  const url = (facettes: FacettesActives) => {
    const sp = ecrireParamsRecherche(q, facettes).toString();
    return sp ? `${base}?${sp}` : base;
  };

  const bascule = (dimension: Dimension, id: number) =>
    url({
      ...actives,
      [dimension]: actives[dimension].includes(id)
        ? actives[dimension].filter((x) => x !== id)
        : [...actives[dimension], id],
    });

  const nombreActives = actives.zones.length + actives.systemes.length + actives.types.length;
  const dimensions = (["systemes", "zones", "types"] as Dimension[]).filter((d) => disponibles[d].length > 0);
  if (dimensions.length === 0) return null;

  const pastille = (d: Dimension, o: Facette) => {
    const active = actives[d].includes(o.id);
    return (
      <li key={o.id}>
        <a className={active ? "pastille pastille-active" : "pastille"} href={bascule(d, o.id)}>
          {o.nom} <span className="pastille-nombre">{o.nombre}</span>
        </a>
      </li>
    );
  };

  return (
    <section className="facettes">
      <div className="facettes-tete">
        <h2>Filtres</h2>
        {nombreActives > 0 && (
          <a className="bouton-discret" href={url({ zones: [], systemes: [], types: [] })}>
            Tout effacer ({nombreActives})
          </a>
        )}
      </div>

      {dimensions.map((d) => {
        // Une pastille cochée reste toujours visible, sinon elle ne se
        // décoche plus.
        const visibles = disponibles[d].filter((o, i) => i < REPLI || actives[d].includes(o.id));
        const caches = disponibles[d].filter((o) => !visibles.includes(o));

        return (
          <div className="facettes-groupe" key={d}>
            <h3 className="facettes-titre">{TITRES[d]}</h3>
            <ul className="facettes-liste">
              {visibles.map((o) => pastille(d, o))}
              {caches.length > 0 && (
                <li>
                  <details className="facettes-repli">
                    <summary className="pastille pastille-plus">+ {caches.length} autres</summary>
                    <ul className="facettes-liste">{caches.map((o) => pastille(d, o))}</ul>
                  </details>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
