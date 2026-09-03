// app/components/recherche/PastillesFacettes.tsx
import { useState } from "react";
import type { Facette, FacettesActives, FacettesDisponibles } from "../../lib/recherche/types";

type Dimension = keyof FacettesActives;

const TITRES: Record<Dimension, string> = {
  systemes: "Système",
  zones: "Zone",
  types: "Type",
};

// Un catalogue de trente types déroulé en entier pousse les résultats hors de
// l'écran : on ouvre sur les plus fournis, le reste tient derrière un bouton.
const REPLI = 8;

function Groupe({
  titre,
  options,
  actives,
  onBasculer,
}: {
  titre: string;
  options: Facette[];
  actives: number[];
  onBasculer: (id: number) => void;
}) {
  const [tout, setTout] = useState(false);
  if (options.length === 0) return null;

  // Une facette cochée reste toujours visible, sinon elle ne se décoche plus.
  const visibles = tout ? options : options.filter((o, i) => i < REPLI || actives.includes(o.id));
  const caches = options.length - visibles.length;

  return (
    <div className="facettes-groupe">
      <h3 className="facettes-titre">{titre}</h3>
      <ul className="facettes-liste">
        {visibles.map((o) => {
          const active = actives.includes(o.id);
          return (
            <li key={o.id}>
              <button
                type="button"
                className={active ? "pastille pastille-active" : "pastille"}
                aria-pressed={active}
                onClick={() => onBasculer(o.id)}
              >
                {o.nom} <span className="pastille-nombre">{o.nombre}</span>
              </button>
            </li>
          );
        })}
        {caches > 0 && (
          <li>
            <button type="button" className="pastille pastille-plus" onClick={() => setTout(true)}>
              + {caches} autres
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

export function PastillesFacettes({
  disponibles,
  actives,
  onBasculer,
  onToutEffacer,
}: {
  disponibles: FacettesDisponibles;
  actives: FacettesActives;
  onBasculer: (dimension: Dimension, id: number) => void;
  onToutEffacer: () => void;
}) {
  const nombreActives = actives.zones.length + actives.systemes.length + actives.types.length;

  return (
    <section className="facettes">
      <div className="facettes-tete">
        <h2>Filtres</h2>
        {nombreActives > 0 && (
          <button type="button" className="bouton-discret" onClick={onToutEffacer}>
            Tout effacer ({nombreActives})
          </button>
        )}
      </div>
      {(["systemes", "zones", "types"] as Dimension[]).map((d) => (
        <Groupe
          key={d}
          titre={TITRES[d]}
          options={disponibles[d]}
          actives={actives[d]}
          onBasculer={(id) => onBasculer(d, id)}
        />
      ))}
    </section>
  );
}
