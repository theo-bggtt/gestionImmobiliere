// app/routes/_app/proprietes.$proprieteId._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  return { propriete };
}

export default function TableauDeBordPropriete() {
  const { propriete } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>{propriete.nom}</h1>
      <nav>
        <Link to="batiments">Bâtiments et niveaux</Link>
        <Link to="zones">Zones</Link>
        <Link to="systemes">Systèmes</Link>
        <Link to="elements">Éléments</Link>
      </nav>
    </main>
  );
}
