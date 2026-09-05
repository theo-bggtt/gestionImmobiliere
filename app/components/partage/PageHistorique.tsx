// app/components/partage/PageHistorique.tsx
// `/p/:jeton/historique` — la chronologie vue par un porteur de lien.
// Aucun script : le filtre par type est une liste de liens, et rien d'autre
// n'est interactif.
//
// Tout ce qui est rendu ici a déjà été filtré par `clauseEvenementVisible` :
// ce composant ne décide rien, il n'a même pas les moyens de le faire, faute
// de recevoir une portée.
import type { HistoriquePartage } from "../../lib/partage/contenu.server";
import { Chronologie } from "../historique/Chronologie";
import { FiltreTypes } from "../historique/FiltreTypes";
import { Pagination } from "../historique/Pagination";
import { liensPartage } from "../recherche/liens";

export function PageHistorique({ historique, jeton }: { historique: HistoriquePartage; jeton: string }) {
  const base = `/p/${jeton}/historique`;

  return (
    <div className="page-partage">
      <p className="fiche-fil">
        <a href={`/p/${jeton}`}>{historique.proprieteNom}</a>
      </p>
      <h1>Historique</h1>

      <FiltreTypes base={base} facettes={historique.facettes} actifs={historique.types} />

      <p className="resultats-compte">
        {historique.total === 0
          ? "Aucun événement"
          : `${historique.total} événement${historique.total > 1 ? "s" : ""}`}
      </p>

      <Chronologie
        evenements={historique.evenements}
        liens={liensPartage(jeton)}
        vide="Aucun événement à afficher pour ce lien."
      />

      <Pagination base={base} types={historique.types} page={historique.page} pages={historique.pages} />
    </div>
  );
}
