// app/routes/_app/evenements.$evenementId.modifier.tsx
// L'écran d'un événement, côté propriétaire : il le relit et le corrige au
// même endroit, comme la fiche d'un objet (décision #22 de l'étape 1).
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  chargerElementsChoisissables,
  chargerEvenementProprietaire,
  lireSaisieEvenement,
  majEvenement,
  supprimerEvenement,
} from "../../lib/historique/evenements.server";
import { chargerIntervenants } from "../../lib/historique/intervenants.server";
import { FormulaireEvenement } from "../../components/historique/FormulaireEvenement";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const [evenement, elements, intervenants] = await Promise.all([
    chargerEvenementProprietaire(propriete.id, params.evenementId),
    chargerElementsChoisissables(propriete.id),
    chargerIntervenants(propriete.id),
  ]);

  return {
    propriete,
    evenement,
    elements,
    intervenants: intervenants.map(({ id, nom, metier }) => ({ id, nom, metier })),
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  // Charge d'abord : c'est ce qui 404 sur un événement d'une autre propriété,
  // avant que le formulaire n'ait pu écrire quoi que ce soit.
  const existant = await chargerEvenementProprietaire(propriete.id, params.evenementId);

  const form = await request.formData();
  if (form.get("_action") === "supprimer") {
    await supprimerEvenement(propriete.id, existant.id);
    return redirect(`/proprietes/${propriete.id}/evenements`);
  }

  const saisie = lireSaisieEvenement(form);
  if (!saisie.ok) return { erreur: saisie.message };

  await majEvenement(propriete.id, existant.id, saisie.valeur);
  return redirect(`/proprietes/${propriete.id}/evenements`);
}

export default function ModifierEvenement() {
  const { propriete, evenement, elements, intervenants } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <p className="fiche-fil">
        <Link to={`/proprietes/${propriete.id}/evenements`}>Historique</Link>
      </p>
      <h1>{evenement.titre}</h1>

      <FormulaireEvenement
        valeurs={evenement}
        elements={elements}
        intervenants={intervenants}
        erreur={actionData?.erreur}
        libelleBouton="Enregistrer"
      />

      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit" className="bouton-discret">Supprimer l'événement</button>
      </Form>
    </main>
  );
}
