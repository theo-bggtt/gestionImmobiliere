// app/routes/_app/systemes.$systemeId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

async function chargerSysteme(proprieteId: number, systemeId: string | undefined) {
  const [s] = await db.select().from(systeme).where(and(eq(systeme.id, Number(systemeId)), eq(systeme.proprieteId, proprieteId)));
  if (!s) throw new Response("Système introuvable", { status: 404 });
  return s;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const s = await chargerSysteme(propriete.id, params.systemeId);
  return { propriete, systeme: s };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerSysteme(propriete.id, params.systemeId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(systeme).where(eq(systeme.id, Number(params.systemeId)));
    return redirect(`/proprietes/${propriete.id}/systemes`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const icone = String(form.get("icone") ?? "").trim() || null;
  if (!nom) return { erreur: "Le nom est obligatoire." };

  await db.update(systeme).set({ nom, icone }).where(eq(systeme.id, Number(params.systemeId)));
  return redirect(`/proprietes/${propriete.id}/systemes`);
}

export default function ModifierSysteme() {
  const { systeme } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Modifier {systeme.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={systeme.nom} required />
        </label>
        <label>
          Icône
          <input type="text" name="icone" defaultValue={systeme.icone ?? ""} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer le système</button>
      </Form>
    </main>
  );
}
