// app/components/recherche/GrilleZones.tsx
// La grille de zones en photo, rendue à l'identique par l'accueil du
// propriétaire et par la page d'un lien de partage — seuls les liens
// changent. Le contenu, lui, a déjà été filtré par la requête : ce composant
// affiche ce qu'on lui donne et ne décide rien.
import { Link } from "react-router";
import type { ZoneVignette } from "../../lib/recherche/types";
import type { Liens } from "./liens";

export function GrilleZones({ zones, liens }: { zones: ZoneVignette[]; liens: Liens }) {
  return (
    <ul className="grille-zones">
      {zones.map((z) => (
        <li key={z.id}>
          {/* Une case mène à la recherche facettée sur cette zone : c'est déjà
              l'écran qui sait lister, filtrer et compter. */}
          <Link to={liens.zone(z.id)} className="case-zone">
            {z.fichierId ? (
              <img className="case-zone-image" src={liens.image(z.fichierId)} alt="" loading="lazy" />
            ) : (
              // Pas de photo n'est pas une case vide : un aplat lisible avec
              // l'initiale, jamais une image cassée.
              <span className="case-zone-image case-zone-aplat" aria-hidden="true">
                {z.nom.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="case-zone-texte">
              <span className="case-zone-nom">{z.nom}</span>
              <span className="case-zone-compte">
                {z.nombre} objet{z.nombre > 1 ? "s" : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
