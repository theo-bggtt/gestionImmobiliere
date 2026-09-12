// app/routes/_app/elements.nouveau.tsx
import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { zoneAppartientALaPropriete, systemeAppartientALaPropriete } from "../../lib/db/elementRefs.server";
import { chargerArbreZones } from "../../lib/zoneTree";
import { validerDetails } from "../../lib/forms/champSchema";
import { extraireDetails } from "../../lib/forms/extraireDetails";
import { ZoneSelector } from "../../components/ZoneSelector";
import { DynamicElementFields } from "../../components/DynamicElementFields";
import { LIBELLES_NIVEAU, lireNiveauSaisi } from "../../lib/partage/niveaux";

// Types disponibles pour un élément : le catalogue système (proprieteId NULL)
// + les types perso de cette propriété.
async function chargerTypesDisponibles(proprieteId: number) {
  return db.select().from(typeElement).where(or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, proprieteId)));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const [types, arbre, systemes] = await Promise.all([
    chargerTypesDisponibles(propriete.id),
    chargerArbreZones(propriete.id),
    db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id)),
  ]);
  return { propriete, types, arbre, systemes };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const nom = String(form.get("nom") ?? "").trim();
  const typeId = Number(form.get("typeId"));
  const zoneId = Number(form.get("zoneId"));
  const systemeIdBrut = String(form.get("systemeId") ?? "");

  // Refusé et non replié sur 0 : `Number("")` vaut 0, c'est-à-dire « public ».
  const niveau = lireNiveauSaisi(form.get("niveau"));

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (niveau === null) return { erreur: "Le niveau de visibilité est obligatoire." };
  if (!zoneId) return { erreur: "La zone est obligatoire." };
  if (!(await zoneAppartientALaPropriete(propriete.id, zoneId))) return { erreur: "Zone invalide." };

  let systemeId: number | null = null;
  if (systemeIdBrut) {
    systemeId = Number(systemeIdBrut);
    if (!(await systemeAppartientALaPropriete(propriete.id, systemeId))) return { erreur: "Système invalide." };
  }

  // Le type est rechargé et revalidé côté serveur : ne jamais faire
  // confiance aux champs envoyés par le client pour décider quels details
  // sont attendus.
  const typesDisponibles = await chargerTypesDisponibles(propriete.id);
  const type = typesDisponibles.find((t) => t.id === typeId);
  if (!type) return { erreur: "Type invalide." };

  const detailsBruts = extraireDetails(form, type.champs);
  const resultat = validerDetails(type.champs, detailsBruts);
  if (!resultat.success) {
    return { erreur: `Détails invalides : ${resultat.error.issues.map((i) => i.message).join(", ")}` };
  }

  await db.insert(element).values({
    proprieteId: propriete.id,
    nom,
    typeId: type.id,
    zoneId,
    systemeId,
    niveau,
    details: resultat.data,
  });

  return redirect(`/proprietes/${propriete.id}/elements`);
}

export default function NouvelElement() {
  const { propriete, types, arbre, systemes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [typeId, setTypeId] = useState<number | null>(null);
  const typeChoisi = types.find((t) => t.id === typeId);
  // Contrôlé, et non `defaultValue` : le sélecteur doit suivre la suggestion
  // du type qu'on vient de choisir. Le type propose, le propriétaire tranche.
  const [niveau, setNiveau] = useState<number>(3);

  function choisirType(valeur: number | null) {
    setTypeId(valeur);
    const type = types.find((t) => t.id === valeur);
    if (type) setNiveau(type.niveauSuggere);
  }

  return (
    <main>
      <h1>Ajouter un élément</h1>
      <p><a href={`/proprietes/${propriete.id}/types/nouveau`}>Créer un type personnalisé</a> s'il n'est pas dans la liste.</p>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required />
        </label>
        <label>
          Type
          <select name="typeId" required value={typeId ?? ""} onChange={(e) => choisirType(Number(e.target.value) || null)}>
            <option value="">— choisir un type —</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
                {t.origine === "perso" ? " (perso)" : ""}
              </option>
            ))}
          </select>
        </label>
        <ZoneSelector arbre={arbre} name="zoneId" />
        <label>
          Visibilité
          <select name="niveau" value={String(niveau)} onChange={(e) => setNiveau(Number(e.target.value))}>
            {LIBELLES_NIVEAU.map((libelle, valeur) => (
              <option key={valeur} value={valeur}>{valeur} · {libelle}</option>
            ))}
          </select>
          <span className="formulaire-aide">
            Comparé au plafond d'un lien de partage : un lien « usage » montre les objets de
            niveau 0 et 1, jamais ceux au-dessus. Le type en propose un, à corriger ici.
          </span>
        </label>
        <label>
          Système (optionnel)
          <select name="systemeId" defaultValue="">
            <option value="">—</option>
            {systemes.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        </label>

        {typeChoisi && <DynamicElementFields champs={typeChoisi.champs} />}

        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
