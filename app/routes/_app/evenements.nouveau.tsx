// app/routes/_app/evenements.nouveau.tsx
import { redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerElementsChoisissables, creerEvenement, lireSaisieEvenement } from "../../lib/historique/evenements.server";
import { chargerIntervenants } from "../../lib/historique/intervenants.server";
import { EVENEMENT_VIERGE, FormulaireEvenement } from "../../components/historique/FormulaireEvenement";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const [elements, intervenants] = await Promise.all([
    chargerElementsChoisissables(propriete.id),
    chargerIntervenants(propriete.id),
  ]);

  // La date du jour est calculée ici : côté navigateur elle dépendrait du
  // fuseau de la machine, et le serveur est le seul à savoir quel jour il est
  // pour cette application.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return { propriete, elements, intervenants: intervenants.map(({ id, nom, metier }) => ({ id, nom, metier })), aujourdhui };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const saisie = lireSaisieEvenement(await request.formData());
  if (!saisie.ok) return { erreur: saisie.message };

  const id = await creerEvenement(propriete.id, saisie.valeur);
  return redirect(`/proprietes/${propriete.id}/evenements/${id}/modifier`);
}

export default function NouvelEvenement() {
  const { elements, intervenants, aujourdhui } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Ajouter un événement</h1>
      <FormulaireEvenement
        valeurs={EVENEMENT_VIERGE(aujourdhui)}
        elements={elements}
        intervenants={intervenants}
        erreur={actionData?.erreur}
        libelleBouton="Créer l'événement"
      />
    </main>
  );
}
