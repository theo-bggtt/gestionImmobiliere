// app/components/historique/Chronologie.tsx
// La chronologie, rendue à l'identique par l'écran du propriétaire et par une
// page de partage. Comme les composants de recherche, elle reçoit ses liens
// déjà fabriqués (`liensPropriete` / `liensPartage`) plutôt qu'un identifiant
// de propriété : une page de partage n'a alors pas les moyens d'écrire une
// route protégée.
//
// Ce composant ne filtre rien. Les événements arrivent filtrés par
// `clauseEvenementVisible`, et leurs objets liés le sont par construction —
// un événement n'est servi que si TOUS ses objets passent la portée.
import type { Liens } from "../recherche/liens";
import { LIBELLES_TYPE_EVENEMENT, type EvenementListe } from "../../lib/historique/types";

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * `YYYY-MM-DD` en date lisible, découpée à la main. `new Date("2026-03-01")`
 * se lit en UTC et rendrait « 28 février » à l'ouest de Greenwich : c'est le
 * même piège que le `to_char` côté serveur, et il se ferme des deux côtés.
 */
export function jourLisible(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  const nom = MOIS[Number(mois) - 1];
  return nom ? `${Number(jour)} ${nom} ${annee}` : iso;
}

export const periode = (e: Pick<EvenementListe, "dateDebut" | "dateFin">): string =>
  e.dateFin && e.dateFin !== e.dateDebut
    ? `${jourLisible(e.dateDebut)} – ${jourLisible(e.dateFin)}`
    : jourLisible(e.dateDebut);

export function Chronologie({
  evenements,
  liens,
  vide = "Aucun événement.",
}: {
  evenements: EvenementListe[];
  liens: Liens;
  vide?: string;
}) {
  if (evenements.length === 0) return <p className="chrono-vide">{vide}</p>;

  return (
    <ol className="chrono">
      {evenements.map((e) => (
        <li key={e.id} className="chrono-ligne">
          <p className="chrono-date">
            {/* `dateTime` porte l'ISO : la machine lit la valeur, l'humain lit le texte. */}
            <time dateTime={e.dateDebut}>{periode(e)}</time>
            <span className="chrono-type">{LIBELLES_TYPE_EVENEMENT[e.type]}</span>
          </p>
          <p className="chrono-titre">
            <a href={liens.evenement(e.id)}>{e.titre}</a>
          </p>
          {e.objets.length > 0 && (
            <ul className="chrono-objets">
              {e.objets.map((o) => (
                <li key={o.id}>
                  <a href={liens.fiche(o.id)}>{o.nom}</a>
                  <span className="chrono-objet-zone"> · {o.zoneNom}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
