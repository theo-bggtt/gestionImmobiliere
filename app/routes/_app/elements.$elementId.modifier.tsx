// app/routes/_app/elements.$elementId.modifier.tsx
import { useState } from "react";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, systeme, fichier, fichierLien } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerRessourceOu404 } from "../../lib/db/scopedResource.server";
import { zoneAppartientALaPropriete, systemeAppartientALaPropriete } from "../../lib/db/elementRefs.server";
import { chargerArbreZones } from "../../lib/zoneTree";
import { chargerPlans, chargerPlansDeLElement } from "../../lib/plans/plans.server";
import { chargerEvenementsDeLElement } from "../../lib/historique/historique.server";
import { Chronologie } from "../../components/historique/Chronologie";
import { liensPropriete } from "../../components/recherche/liens";
import { validerDetails } from "../../lib/forms/champSchema";
import { extraireDetails } from "../../lib/forms/extraireDetails";
import { ZoneSelector } from "../../components/ZoneSelector";
import { DynamicElementFields } from "../../components/DynamicElementFields";
import { Capture } from "../../components/capture/Capture";

async function chargerTypesDisponibles(proprieteId: number) {
  return db.select().from(typeElement).where(or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, proprieteId)));
}

async function chargerElement(proprieteId: number, elementId: string | undefined) {
  return chargerRessourceOu404(
    element,
    and(eq(element.id, Number(elementId)), eq(element.proprieteId, proprieteId)),
    "Élément introuvable",
  );
}

// La plus récente en premier : sur une fiche d'entretien, c'est la photo
// qu'on vient de prendre qu'on veut voir, pas celle de l'installation.
async function chargerPhotos(proprieteId: number, elementId: number) {
  return db
    .select({ id: fichier.id, datePrise: fichier.datePrise })
    .from(fichierLien)
    .innerJoin(fichier, eq(fichierLien.fichierId, fichier.id))
    .where(
      and(
        eq(fichierLien.cibleType, "element"),
        eq(fichierLien.cibleId, elementId),
        eq(fichier.proprieteId, proprieteId),
      ),
    )
    .orderBy(sql`${fichier.datePrise} DESC NULLS LAST`, desc(fichier.id));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const [e, types, arbre, systemes, photos, plans, poses, evenements] = await Promise.all([
    chargerElement(propriete.id, params.elementId),
    chargerTypesDisponibles(propriete.id),
    chargerArbreZones(propriete.id),
    db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id)),
    chargerPhotos(propriete.id, Number(params.elementId)),
    chargerPlans(propriete.id),
    chargerPlansDeLElement(propriete.id, Number(params.elementId)),
    chargerEvenementsDeLElement(propriete.id, Number(params.elementId)),
  ]);
  // Un objet déjà placé reste plaçable ailleurs : l'écran le montre (« déjà
  // sur Sous-sol ») plutôt que de l'interdire.
  const posesParPlan = new Set(poses.map((p) => p.planId));
  return {
    propriete,
    element: e,
    types,
    arbre,
    systemes,
    photos,
    plans: plans.map((p) => ({ id: p.id, nom: p.nom, pose: posesParPlan.has(p.id) })),
    evenements,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerElement(propriete.id, params.elementId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(element).where(eq(element.id, Number(params.elementId)));
    return redirect(`/proprietes/${propriete.id}/elements`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const typeId = Number(form.get("typeId"));
  const zoneId = Number(form.get("zoneId"));
  const systemeIdBrut = String(form.get("systemeId") ?? "");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!zoneId) return { erreur: "La zone est obligatoire." };
  if (!(await zoneAppartientALaPropriete(propriete.id, zoneId))) return { erreur: "Zone invalide." };

  let systemeId: number | null = null;
  if (systemeIdBrut) {
    systemeId = Number(systemeIdBrut);
    if (!(await systemeAppartientALaPropriete(propriete.id, systemeId))) return { erreur: "Système invalide." };
  }

  const typesDisponibles = await chargerTypesDisponibles(propriete.id);
  const type = typesDisponibles.find((t) => t.id === typeId);
  if (!type) return { erreur: "Type invalide." };

  const detailsBruts = extraireDetails(form, type.champs);
  const resultat = validerDetails(type.champs, detailsBruts);
  if (!resultat.success) {
    return { erreur: `Détails invalides : ${resultat.error.issues.map((i) => i.message).join(", ")}` };
  }

  await db.update(element).set({
    nom,
    typeId: type.id,
    zoneId,
    systemeId,
    details: resultat.data,
    majLe: new Date(),
  }).where(eq(element.id, Number(params.elementId)));

  return redirect(`/proprietes/${propriete.id}/elements`);
}

export default function ModifierElement() {
  const { propriete, element, types, arbre, systemes, photos, plans, evenements } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [typeId, setTypeId] = useState<number>(element.typeId);
  const typeChoisi = types.find((t) => t.id === typeId);

  return (
    <main>
      <h1>{element.nom}</h1>

      <section className="fiche-photos">
        <div className="fiche-photos-tete">
          <h2>Photos</h2>
          <Capture
            proprieteId={propriete.id}
            mode={{ elementId: element.id, elementNom: element.nom }}
            className="capture-declencheur capture-secondaire"
          >
            Ajouter une photo
          </Capture>
        </div>
        {photos.length === 0 ? (
          <p className="fiche-photos-vide">Aucune photo pour l'instant.</p>
        ) : (
          <ul className="galerie">
            {photos.map((photo) => (
              <li key={photo.id}>
                <a href={`/proprietes/${propriete.id}/fichiers/${photo.id}`}>
                  <img src={`/proprietes/${propriete.id}/fichiers/${photo.id}?taille=vignette`} alt="" loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fiche-plans">
        <h2>Sur le plan</h2>
        {plans.length === 0 ? (
          <p className="fiche-photos-vide">
            Aucun plan. <Link to={`/proprietes/${propriete.id}/plans/nouveau`}>En ajouter un</Link>.
          </p>
        ) : (
          <ul className="fiche-plans-liste">
            {plans.map((p) => (
              <li key={p.id}>
                <Link to={`/proprietes/${propriete.id}/plans?plan=${p.id}&element=${element.id}`}>
                  {p.pose ? `Déplacer sur ${p.nom}` : `Placer sur ${p.nom}`}
                </Link>
                {p.pose && <span className="selecteur-secondaire"> · déjà posé</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={element.nom} required />
        </label>
        <label>
          Type
          <select name="typeId" required value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
                {t.origine === "perso" ? " (perso)" : ""}
              </option>
            ))}
          </select>
        </label>
        <ZoneSelector arbre={arbre} name="zoneId" defaultValue={element.zoneId} />
        <label>
          Système (optionnel)
          <select name="systemeId" defaultValue={element.systemeId ?? ""}>
            <option value="">—</option>
            {systemes.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        </label>

        {typeChoisi && <DynamicElementFields champs={typeChoisi.champs} valeurs={element.details as Record<string, unknown>} />}

        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <section>
        <div className="fiche-photos-tete">
          <h2>Historique</h2>
          <Link to={`/proprietes/${propriete.id}/evenements/nouveau`} className="bouton-discret">
            Ajouter un événement
          </Link>
        </div>
        <Chronologie
          evenements={evenements}
          liens={liensPropriete(propriete.id)}
          vide="Rien n'est consigné sur cet objet."
        />
      </section>

      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer l'élément</button>
      </Form>
    </main>
  );
}
