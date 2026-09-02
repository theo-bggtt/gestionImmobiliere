// app/routes/_app/batiments.$batimentId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerRessourceOu404 } from "../../lib/db/scopedResource.server";

const TYPES = ["principal", "annexe", "garage", "abri"] as const;

async function chargerBatiment(proprieteId: number, batimentId: string | undefined) {
  return chargerRessourceOu404(
    batiment,
    and(eq(batiment.id, Number(batimentId)), eq(batiment.proprieteId, proprieteId)),
    "Bâtiment introuvable",
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const b = await chargerBatiment(propriete.id, params.batimentId);
  return { propriete, batiment: b };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerBatiment(propriete.id, params.batimentId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(batiment).where(eq(batiment.id, Number(params.batimentId)));
    return redirect(`/proprietes/${propriete.id}/batiments`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "principal");
  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de bâtiment invalide." };

  await db.update(batiment)
    .set({ nom, type: type as (typeof TYPES)[number] })
    .where(eq(batiment.id, Number(params.batimentId)));

  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function ModifierBatiment() {
  const { propriete, batiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Modifier {batiment.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={batiment.nom} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue={batiment.type}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer le bâtiment</button>
      </Form>
    </main>
  );
}
