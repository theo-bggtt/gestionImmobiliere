// app/routes/_app/elements._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const elements = await db.select({
    id: element.id,
    nom: element.nom,
    typeNom: typeElement.nom,
    zoneNom: zone.nom,
  })
    .from(element)
    .innerJoin(typeElement, eq(element.typeId, typeElement.id))
    .innerJoin(zone, eq(element.zoneId, zone.id))
    .where(eq(element.proprieteId, propriete.id));

  return { propriete, elements };
}

export default function ListeElements() {
  const { propriete, elements } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>Éléments — {propriete.nom}</h1>
      <Link to={`/proprietes/${propriete.id}/elements/nouveau`}>Ajouter un élément</Link>
      <ul>
        {elements.map((e) => (
          <li key={e.id}>
            {e.nom} — {e.typeNom} — {e.zoneNom}
            <Link to={`/proprietes/${propriete.id}/elements/${e.id}/modifier`}> Modifier</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
