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
import {
  attacherPhotoAEvenement,
  chargerPhotosProprietaire,
  detacherPhotoDEvenement,
} from "../../lib/historique/photos.server";
import { estRolePhotoEvenement, LIBELLES_ROLE_PHOTO, ROLES_PHOTO_EVENEMENT } from "../../lib/historique/types";
import { FormulaireEvenement } from "../../components/historique/FormulaireEvenement";

// Une photo de chantier vient souvent d'un appareil, pas d'un téléphone : la
// borne est celle du plan, pas celle de la capture opportuniste.
const TAILLE_MAX = 25 * 1024 * 1024;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const evenement = await chargerEvenementProprietaire(propriete.id, params.evenementId);
  const [elements, intervenants, photos] = await Promise.all([
    chargerElementsChoisissables(propriete.id),
    chargerIntervenants(propriete.id),
    chargerPhotosProprietaire(propriete.id, evenement.id),
  ]);

  return {
    propriete,
    evenement,
    photos,
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

  if (form.get("_action") === "photo") {
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) return { erreur: "Photo absente." };
    if (image.size > TAILLE_MAX) return { erreur: "Photo trop volumineuse." };
    // Un rôle inconnu est refusé et non replié sur un défaut : la valeur vient
    // d'un `select`, donc une valeur hors liste est une requête forgée, pas une
    // maladresse. Même raisonnement que le `niveau` d'un formulaire.
    const role = form.get("role");
    if (!estRolePhotoEvenement(role)) return { erreur: "Étape inconnue." };
    await attacherPhotoAEvenement(propriete.id, existant.id, Buffer.from(await image.arrayBuffer()), role);
    return redirect(`/proprietes/${propriete.id}/evenements/${existant.id}/modifier`);
  }

  if (form.get("_action") === "detacher") {
    await detacherPhotoDEvenement(propriete.id, existant.id, Number(form.get("fichierId")));
    return redirect(`/proprietes/${propriete.id}/evenements/${existant.id}/modifier`);
  }

  const saisie = lireSaisieEvenement(form);
  if (!saisie.ok) return { erreur: saisie.message };

  await majEvenement(propriete.id, existant.id, saisie.valeur);
  return redirect(`/proprietes/${propriete.id}/evenements`);
}

export default function ModifierEvenement() {
  const { propriete, evenement, photos, elements, intervenants } = useLoaderData<typeof loader>();
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

      <section className="fiche-photos">
        <h2>Photos</h2>
        {photos.length === 0 ? (
          <p className="fiche-photos-vide">Aucune photo sur cet événement.</p>
        ) : (
          <ul className="galerie">
            {photos.map((photo) => (
              <li key={photo.id}>
                <figure className="photo-etape">
                  <a href={`/proprietes/${propriete.id}/fichiers/${photo.id}`}>
                    <img
                      src={`/proprietes/${propriete.id}/fichiers/${photo.id}?taille=vignette`}
                      alt=""
                      loading="lazy"
                    />
                  </a>
                  <figcaption>{LIBELLES_ROLE_PHOTO[photo.role]}</figcaption>
                </figure>
                <Form method="post">
                  <input type="hidden" name="_action" value="detacher" />
                  <input type="hidden" name="fichierId" value={photo.id} />
                  <button type="submit" className="bouton-discret">Retirer</button>
                </Form>
              </li>
            ))}
          </ul>
        )}

        {/* Envoi direct, hors de la boîte d'envoi hors ligne : photographier
            l'avant d'un chantier n'est pas de la capture opportuniste, c'est
            un geste posé, souvent depuis un dossier déjà constitué. */}
        <Form method="post" encType="multipart/form-data">
          <input type="hidden" name="_action" value="photo" />
          <label>
            Ajouter une photo
            <input type="file" name="image" accept="image/*" required />
          </label>
          <label>
            Étape
            <select name="role" defaultValue="general">
              {ROLES_PHOTO_EVENEMENT.map((r) => (
                <option key={r} value={r}>{LIBELLES_ROLE_PHOTO[r]}</option>
              ))}
            </select>
          </label>
          <button type="submit">Joindre</button>
        </Form>
      </section>

      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit" className="bouton-discret">Supprimer l'événement</button>
      </Form>
    </main>
  );
}
