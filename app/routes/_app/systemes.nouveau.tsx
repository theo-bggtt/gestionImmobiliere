// app/routes/_app/systemes.nouveau.tsx
import { Form, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { db } from "../../db/client";
import { systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const icone = String(form.get("icone") ?? "").trim() || null;

  if (!nom) return { erreur: "Le nom est obligatoire." };

  await db.insert(systeme).values({ proprieteId: propriete.id, nom, icone });
  return redirect(`/proprietes/${propriete.id}/systemes`);
}

export default function NouveauSysteme() {
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Ajouter un système</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Électricité, sanitaire, chauffage, arrosage..." />
        </label>
        <label>
          Icône (optionnel)
          <input type="text" name="icone" />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
