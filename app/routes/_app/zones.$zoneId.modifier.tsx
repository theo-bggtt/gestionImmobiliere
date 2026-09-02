// app/routes/_app/zones.$zoneId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerRessourceOu404 } from "../../lib/db/scopedResource.server";

const TYPES = ["interieur", "exterieur", "annexe", "technique"] as const;

async function chargerZone(proprieteId: number, zoneId: string | undefined) {
  return chargerRessourceOu404(
    zone,
    and(eq(zone.id, Number(zoneId)), eq(zone.proprieteId, proprieteId)),
    "Zone introuvable",
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const z = await chargerZone(propriete.id, params.zoneId);
  return { propriete, zone: z };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerZone(propriete.id, params.zoneId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(zone).where(eq(zone.id, Number(params.zoneId)));
    return redirect(`/proprietes/${propriete.id}/zones`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "");
  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de zone invalide." };

  await db.update(zone).set({ nom, type: type as (typeof TYPES)[number] }).where(eq(zone.id, Number(params.zoneId)));
  return redirect(`/proprietes/${propriete.id}/zones`);
}

export default function ModifierZone() {
  const { zone } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Modifier {zone.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={zone.nom} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue={zone.type}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer la zone</button>
      </Form>
    </main>
  );
}
