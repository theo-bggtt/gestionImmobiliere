// app/routes/_app/batiments._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones } from "../../lib/zoneTree";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { arbre } = await chargerArbreZones(propriete.id);
  return { propriete, arbre };
}

export default function ListeBatiments() {
  const { propriete, arbre } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>Bâtiments et niveaux — {propriete.nom}</h1>
      <p>
        <Link to={`/proprietes/${propriete.id}/batiments/nouveau`} className="bouton-trait" viewTransition>
          Ajouter un bâtiment
        </Link>
      </p>
      {arbre.map(({ batiment, niveaux }) => (
        <section key={batiment.id} className="bloc">
          <p className="sous-titre">
            <span>
              {batiment.nom} · {batiment.type}
            </span>
            <Link to={`/proprietes/${propriete.id}/batiments/${batiment.id}/modifier`} viewTransition>
              Modifier
            </Link>
          </p>
          <ul className="filets">
            {niveaux.map(({ niveau }) => (
              <li key={niveau.id}>
                <span className="nom">{niveau.nom}</span>
                <span className="lieu">ordinal {niveau.ordinal}</span>
                <Link
                  to={`/proprietes/${propriete.id}/niveaux/${niveau.id}/modifier`}
                  className="bouton-discret"
                  viewTransition
                >
                  Modifier
                </Link>
              </li>
            ))}
          </ul>
          <p className="bloc-suite">
            <Link to={`/proprietes/${propriete.id}/batiments/${batiment.id}/niveaux/nouveau`} viewTransition>
              Ajouter un niveau
            </Link>
          </p>
        </section>
      ))}
    </main>
  );
}
