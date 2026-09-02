// app/routes/_app/batiments.nouveau.tsx
import { Form, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { db } from "../../db/client";
import { batiment } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

const TYPES = ["principal", "annexe", "garage", "abri"] as const;

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "principal");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de bâtiment invalide." };

  await db.insert(batiment).values({ proprieteId: propriete.id, nom, type: type as (typeof TYPES)[number] });
  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function NouveauBatiment() {
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Ajouter un bâtiment</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required />
        </label>
        <label>
          Type
          <select name="type" defaultValue="principal">
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
