// app/routes/_app/intervenants.$intervenantId.modifier.tsx
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  chargerIntervenantOu404,
  lireSaisieIntervenant,
  majIntervenant,
  supprimerIntervenant,
} from "../../lib/historique/intervenants.server";
import { FormulaireIntervenant } from "../../components/historique/FormulaireIntervenant";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const intervenant = await chargerIntervenantOu404(propriete.id, params.intervenantId);
  return { propriete, intervenant };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const existant = await chargerIntervenantOu404(propriete.id, params.intervenantId);

  const form = await request.formData();
  if (form.get("_action") === "supprimer") {
    // La cascade retire ses lignes de `evenement_intervenant` : les événements
    // restent, ils perdent une signature. C'est le bon sens de la perte.
    await supprimerIntervenant(propriete.id, existant.id);
    return redirect(`/proprietes/${propriete.id}/intervenants`);
  }

  const saisie = lireSaisieIntervenant(form);
  if (!saisie.ok) return { erreur: saisie.message };

  await majIntervenant(propriete.id, existant.id, saisie.valeur);
  return redirect(`/proprietes/${propriete.id}/intervenants`);
}

export default function ModifierIntervenant() {
  const { propriete, intervenant } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <p className="fiche-fil">
        <Link to={`/proprietes/${propriete.id}/intervenants`}>Intervenants</Link>
      </p>
      <h1>{intervenant.nom}</h1>

      <FormulaireIntervenant
        valeurs={intervenant}
        erreur={actionData?.erreur}
        libelleBouton="Enregistrer"
      />

      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit" className="bouton-discret">Supprimer l'intervenant</button>
      </Form>
    </main>
  );
}
