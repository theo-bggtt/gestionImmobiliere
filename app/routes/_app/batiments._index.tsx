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
      <Link to={`/proprietes/${propriete.id}/batiments/nouveau`}>Ajouter un bâtiment</Link>
      {arbre.map(({ batiment, niveaux }) => (
        <section key={batiment.id}>
          <h2>
            {batiment.nom} ({batiment.type})
            <Link to={`/proprietes/${propriete.id}/batiments/${batiment.id}/modifier`}> Modifier</Link>
          </h2>
          <ul>
            {niveaux.map(({ niveau }) => (
              <li key={niveau.id}>
                {niveau.nom} (ordinal {niveau.ordinal})
                <Link to={`/proprietes/${propriete.id}/niveaux/${niveau.id}/modifier`}> Modifier</Link>
              </li>
            ))}
          </ul>
          <Link to={`/proprietes/${propriete.id}/batiments/${batiment.id}/niveaux/nouveau`}>Ajouter un niveau</Link>
        </section>
      ))}
    </main>
  );
}
