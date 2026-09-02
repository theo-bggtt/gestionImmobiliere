// app/routes/_app/systemes._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const systemes = await db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id));
  return { propriete, systemes };
}

export default function ListeSystemes() {
  const { propriete, systemes } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>Systèmes — {propriete.nom}</h1>
      <Link to={`/proprietes/${propriete.id}/systemes/nouveau`}>Ajouter un système</Link>
      <ul>
        {systemes.map((s) => (
          <li key={s.id}>
            {s.nom}
            <Link to={`/proprietes/${propriete.id}/systemes/${s.id}/modifier`}> Modifier</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
