// app/routes/_app/batiments.$batimentId.niveaux.nouveau.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

async function chargerBatiment(proprieteId: number, batimentId: string | undefined) {
  const [b] = await db.select().from(batiment).where(and(eq(batiment.id, Number(batimentId)), eq(batiment.proprieteId, proprieteId)));
  if (!b) throw new Response("Bâtiment introuvable", { status: 404 });
  return b;
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
  const b = await chargerBatiment(propriete.id, params.batimentId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const ordinal = Number(form.get("ordinal"));

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!Number.isInteger(ordinal)) return { erreur: "L'ordinal doit être un entier (ex : -1 pour une cave, 0 pour le rez, 1 pour le premier)." };

  await db.insert(niveau).values({ batimentId: b.id, nom, ordinal });
  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function NouveauNiveau() {
  const { batiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Ajouter un niveau à {batiment.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Rez-de-chaussée, cave à vin..." />
        </label>
        <label>
          Ordinal (entier signé : -1 cave, 0 rez, 1 premier, 2 combles...)
          <input type="number" name="ordinal" required step={1} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
