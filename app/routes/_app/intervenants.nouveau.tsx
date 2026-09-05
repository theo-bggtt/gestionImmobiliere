// app/routes/_app/intervenants.nouveau.tsx
import { redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { creerIntervenant, lireSaisieIntervenant } from "../../lib/historique/intervenants.server";
import { FormulaireIntervenant, INTERVENANT_VIERGE } from "../../components/historique/FormulaireIntervenant";

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const saisie = lireSaisieIntervenant(await request.formData());
  if (!saisie.ok) return { erreur: saisie.message };

  await creerIntervenant(propriete.id, saisie.valeur);
  return redirect(`/proprietes/${propriete.id}/intervenants`);
}

export default function NouvelIntervenant() {
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Ajouter un intervenant</h1>
      <FormulaireIntervenant
        valeurs={INTERVENANT_VIERGE}
        erreur={actionData?.erreur}
        libelleBouton="Enregistrer"
      />
    </main>
  );
}
