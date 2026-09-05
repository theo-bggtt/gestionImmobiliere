// app/routes/_app/evenements._index.tsx
// La chronologie du propriétaire. Elle rend le MÊME composant que la page de
// partage, avec `liensPropriete` au lieu de `liensPartage` : deux jeux de
// liens, un seul rendu.
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerChronologie } from "../../lib/historique/historique.server";
import { lirePage } from "../../lib/historique/pagination";
import { estTypeEvenement } from "../../lib/historique/types";
import { Chronologie } from "../../components/historique/Chronologie";
import { FiltreTypes } from "../../components/historique/FiltreTypes";
import { Pagination } from "../../components/historique/Pagination";
import { liensPropriete } from "../../components/recherche/liens";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  // Un type inconnu dans l'URL est ignoré, pas rejeté : une URL bricolée
  // mérite la page entière, pas une erreur. Un numéro de page hors bornes est
  // traité de la même façon — ramené, jamais refusé.
  const parametres = new URL(request.url).searchParams;
  const types = [...new Set(parametres.getAll("type"))].filter(estTypeEvenement);
  const chronologie = await chargerChronologie(propriete.id, { types, page: lirePage(parametres.get("page")) });

  return { propriete, types, ...chronologie };
}

export default function EcranChronologie() {
  const d = useLoaderData<typeof loader>();
  const liens = liensPropriete(d.propriete.id);
  const base = liens.historique;

  return (
    <main>
      <h1>Historique — {d.propriete.nom}</h1>
      <p className="accueil-lien-filtres">
        <Link to={`${base}/nouveau`}>Ajouter un événement</Link>
        {" · "}
        <Link to={`/proprietes/${d.propriete.id}/intervenants`}>Intervenants</Link>
      </p>

      <FiltreTypes base={base} facettes={d.facettes} actifs={d.types} />

      <p className="resultats-compte">
        {d.total === 0 ? "Aucun événement" : `${d.total} événement${d.total > 1 ? "s" : ""}`}
      </p>

      <Chronologie
        evenements={d.evenements}
        liens={liens}
        vide="Rien n'est encore consigné. Le premier événement peut être le dernier entretien dont vous vous souvenez."
      />

      <Pagination base={base} types={d.types} page={d.page} pages={d.pages} />
    </main>
  );
}
