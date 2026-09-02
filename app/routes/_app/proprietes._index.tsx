// app/routes/_app/proprietes._index.tsx
import { Form, Link, useLoaderData, useActionData, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { propriete } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const proprietes = await db.select().from(propriete).where(eq(propriete.proprietaireId, utilisateurId));
  return { proprietes };
}

export async function action({ request }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();

  if (!nom) {
    return { erreur: "Le nom est obligatoire." };
  }

  const [cree] = await db.insert(propriete).values({ proprietaireId: utilisateurId, nom }).returning();
  return redirect(`/proprietes/${cree.id}`);
}

export default function MesProprietes() {
  const { proprietes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Mes propriétés</h1>
      <ul>
        {proprietes.map((p) => (
          <li key={p.id}>
            <Link to={`/proprietes/${p.id}`}>{p.nom}</Link>
          </li>
        ))}
      </ul>
      {proprietes.length === 0 && <p>Aucune propriété pour l'instant.</p>}

      <h2>Ajouter une propriété</h2>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
