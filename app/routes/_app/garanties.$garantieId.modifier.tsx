// app/routes/_app/garanties.$garantieId.modifier.tsx
// Une garantie se crée depuis la fiche de son objet — `garantie.element_id`
// est NOT NULL, elle n'a pas d'existence sans lui — mais se corrige sur son
// propre écran, atteignable depuis la liste des échéances comme depuis la
// fiche. Sans cette route, corriger une date depuis l'accueil demanderait de
// retrouver l'objet d'abord.
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  chargerGarantieOu404,
  chargerGarantiesProprietaire,
  lireSaisieGarantie,
  majGarantie,
  supprimerGarantie,
} from "../../lib/historique/garanties.server";
import {
  attacherDocumentAGarantie,
  detacherDocumentDeGarantie,
} from "../../lib/historique/photos.server";

// Une photo de contrat vient souvent d'un appareil, pas d'un téléphone.
const TAILLE_MAX = 25 * 1024 * 1024;

/**
 * Le chargement passe par `chargerGarantieOu404`, qui joint l'élément et
 * compare `propriete_id` : une garantie d'une autre propriété lève 404 et non
 * 403 (règle non négociable #4). La liste est ensuite relue pour retrouver la
 * ligne complète — une seule garantie sur un objet qu'on sait déjà nôtre.
 */
async function chargerOu404(proprieteId: number, garantieIdBrut: string | undefined) {
  const { id, elementId } = await chargerGarantieOu404(proprieteId, garantieIdBrut);
  const garanties = await chargerGarantiesProprietaire(proprieteId, elementId);
  const garantie = garanties.find((g) => g.id === id);
  if (!garantie) throw new Response("Introuvable", { status: 404 });
  return garantie;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  return { propriete, garantie: await chargerOu404(propriete.id, params.garantieId) };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  // Charge d'abord : c'est ce qui 404 sur une garantie d'une autre propriété,
  // avant que le formulaire n'ait pu écrire quoi que ce soit.
  const existante = await chargerOu404(propriete.id, params.garantieId);
  const retour = `/proprietes/${propriete.id}/elements/${existante.elementId}/modifier`;

  const ici = `/proprietes/${propriete.id}/garanties/${existante.id}/modifier`;

  const form = await request.formData();
  if (form.get("_action") === "supprimer") {
    await supprimerGarantie(propriete.id, existante.id);
    return redirect(retour);
  }

  if (form.get("_action") === "document") {
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) return { erreur: "Document absent." };
    if (image.size > TAILLE_MAX) return { erreur: "Document trop volumineux." };
    await attacherDocumentAGarantie(propriete.id, existante.id, Buffer.from(await image.arrayBuffer()));
    return redirect(ici);
  }

  if (form.get("_action") === "document-retirer") {
    await detacherDocumentDeGarantie(propriete.id, existante.id);
    return redirect(ici);
  }

  const saisie = lireSaisieGarantie(form);
  if (!saisie.ok) return { erreur: saisie.message };

  await majGarantie(propriete.id, existante.id, saisie.valeur);
  return redirect(retour);
}

export default function ModifierGarantie() {
  const { propriete, garantie } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <p className="fiche-fil">
        <Link to={`/proprietes/${propriete.id}/elements/${garantie.elementId}/modifier`}>
          {garantie.elementNom}
        </Link>
      </p>
      <h1>Garantie</h1>
      <p className="resultat-lieu">
        {[garantie.elementNom, garantie.zoneNom].filter(Boolean).join(" · ")}
        {garantie.expiree && <span className="garantie-expiree"> · expirée</span>}
      </p>

      <Form method="post">
        <label>
          Début
          <input type="date" name="debut" defaultValue={garantie.debut} required />
        </label>
        <label>
          Fin (optionnelle)
          <input type="date" name="fin" defaultValue={garantie.fin ?? ""} />
        </label>
        <label>
          Référence (optionnelle)
          <input type="text" name="reference" defaultValue={garantie.reference ?? ""} />
        </label>
        <p className="selecteur-secondaire">
          Un lien de partage voit la date de fin, jamais la référence.
        </p>

        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>

      <section className="fiche-photos">
        <h2>Document</h2>
        {/* Le document ne sort d'AUCUN partage : un contrat ou une facture de
            garantie est du coût sous un autre nom. Il est rattaché par
            `garantie.fichier_id` et non par `fichier_lien`, donc il n'ajoute
            pas de quatrième droit sur les fichiers — il n'en a aucun. */}
        {garantie.fichierId === null ? (
          <p className="fiche-photos-vide">Aucun document.</p>
        ) : (
          <>
            <ul className="galerie">
              <li>
                <a href={`/proprietes/${propriete.id}/fichiers/${garantie.fichierId}`}>
                  <img
                    src={`/proprietes/${propriete.id}/fichiers/${garantie.fichierId}?taille=vignette`}
                    alt=""
                    loading="lazy"
                  />
                </a>
              </li>
            </ul>
            <Form method="post">
              <input type="hidden" name="_action" value="document-retirer" />
              <button type="submit" className="bouton-discret">Retirer le document</button>
            </Form>
          </>
        )}

        <Form method="post" encType="multipart/form-data">
          <input type="hidden" name="_action" value="document" />
          <label>
            {garantie.fichierId === null ? "Joindre une photo du contrat" : "Remplacer le document"}
            <input type="file" name="image" accept="image/*" required />
          </label>
          <p className="selecteur-secondaire">
            Visible de vous seul : un document de garantie ne part sur aucun lien de partage.
          </p>
          <button type="submit">Enregistrer le document</button>
        </Form>
      </section>

      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit" className="bouton-discret">Retirer la garantie</button>
      </Form>
    </main>
  );
}
