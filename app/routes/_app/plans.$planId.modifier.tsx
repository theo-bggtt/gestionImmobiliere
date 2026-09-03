// app/routes/_app/plans.$planId.modifier.tsx
// Renommer un plan, remplacer son image, le supprimer. Le remplacement est
// l'écran qui justifie les pourcentages : le relevé de l'électricien cède la
// place au plan propre de l'architecte, dans d'autres dimensions, et aucun
// point ne bouge.
import { useState } from "react";
import { Form, Link, redirect, useActionData, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { plan } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  chargerPlanOu404,
  chargerPointsDuPlan,
  lireGeometrie,
  remplacerImagePlan,
  supprimerPlan,
} from "../../lib/plans/plans.server";
import { EditeurImagePlan, type Preparation } from "../../components/plan/EditeurImagePlan";
import { liensPropriete } from "../../components/recherche/liens";

const TAILLE_MAX = 25 * 1024 * 1024;
const NOM_MAX = 120;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const p = await chargerPlanOu404(propriete.id, params.planId);
  return { propriete, plan: p, points: await chargerPointsDuPlan(propriete.id, p.id) };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const p = await chargerPlanOu404(propriete.id, params.planId);
  const form = await request.formData();
  const quoi = form.get("_action");

  if (quoi === "supprimer") {
    await supprimerPlan(propriete.id, p.id);
    return redirect(`/proprietes/${propriete.id}/plans`);
  }

  if (quoi === "renommer") {
    const nom = String(form.get("nom") ?? "").trim().slice(0, NOM_MAX);
    if (!nom) return { erreur: "Le nom est obligatoire." };
    await db.update(plan).set({ nom }).where(eq(plan.id, p.id));
    return redirect(`/proprietes/${propriete.id}/plans?plan=${p.id}`);
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) return { erreur: "Image absente." };
  if (image.size > TAILLE_MAX) return { erreur: "Image trop volumineuse." };

  await remplacerImagePlan(propriete.id, p.id, Buffer.from(await image.arrayBuffer()), lireGeometrie(form));
  return redirect(`/proprietes/${propriete.id}/plans?plan=${p.id}`);
}

export default function ModifierPlan() {
  const { propriete, plan, points } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher<{ erreur?: string }>();
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const liens = liensPropriete(propriete.id);

  function remplacer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preparation) return;
    const champs = new FormData(e.currentTarget);
    champs.set("image", preparation.fichier, preparation.nomFichier);
    champs.set("rotation", String(preparation.rotation));
    champs.set("recadrage", JSON.stringify(preparation.recadrage));
    fetcher.submit(champs, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <main>
      <h1>{plan.nom}</h1>

      {plan.imageFichierId !== null && (
        <img className="plan-apercu" src={liens.image(plan.imageFichierId, "vignette")} alt="" />
      )}

      <Form method="post">
        <input type="hidden" name="_action" value="renommer" />
        <label>
          Nom (pour vous seul)
          <input type="text" name="nom" defaultValue={plan.nom} required maxLength={NOM_MAX} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Renommer</button>
      </Form>

      <section>
        <h2>Remplacer l'image</h2>
        <p className="resultats-vide">
          {points.length === 0
            ? "Aucun objet n'est posé sur ce plan."
            : `Les ${points.length} objet${points.length > 1 ? "s" : ""} posé${points.length > 1 ? "s" : ""} sur ce plan gardent leur position : elle est enregistrée en pourcentage, pas en pixels.`}
        </p>
        <form method="post" encType="multipart/form-data" onSubmit={remplacer}>
          <EditeurImagePlan onChange={setPreparation} />
          {fetcher.data?.erreur && <p role="alert">{fetcher.data.erreur}</p>}
          <button type="submit" disabled={!preparation || fetcher.state !== "idle"}>
            {fetcher.state === "idle" ? "Remplacer l'image" : "Envoi…"}
          </button>
        </form>
      </section>

      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer ce plan</button>
      </Form>

      <p>
        <Link to={`/proprietes/${propriete.id}/plans?plan=${plan.id}`}>Revenir au plan</Link>
      </p>
    </main>
  );
}
