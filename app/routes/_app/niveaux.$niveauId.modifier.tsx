// app/routes/_app/niveaux.$niveauId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

async function chargerNiveau(proprieteId: number, niveauId: string | undefined) {
  const [ligne] = await db.select({ niveau, batiment })
    .from(niveau)
    .innerJoin(batiment, eq(niveau.batimentId, batiment.id))
    .where(and(eq(niveau.id, Number(niveauId)), eq(batiment.proprieteId, proprieteId)));
  if (!ligne) throw new Response("Niveau introuvable", { status: 404 });
  return ligne;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { niveau: n, batiment: b } = await chargerNiveau(propriete.id, params.niveauId);
  return { propriete, niveau: n, batiment: b };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerNiveau(propriete.id, params.niveauId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(niveau).where(eq(niveau.id, Number(params.niveauId)));
    return redirect(`/proprietes/${propriete.id}/batiments`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const ordinal = Number(form.get("ordinal"));
  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!Number.isInteger(ordinal)) return { erreur: "L'ordinal doit être un entier." };

  await db.update(niveau).set({ nom, ordinal }).where(eq(niveau.id, Number(params.niveauId)));
  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function ModifierNiveau() {
  const { niveau, batiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Modifier {niveau.nom} ({batiment.nom})</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={niveau.nom} required />
        </label>
        <label>
          Ordinal
          <input type="number" name="ordinal" defaultValue={niveau.ordinal} required step={1} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer le niveau</button>
      </Form>
    </main>
  );
}
