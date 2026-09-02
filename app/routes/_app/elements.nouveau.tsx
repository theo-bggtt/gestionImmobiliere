// app/routes/_app/elements.nouveau.tsx
import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones } from "../../lib/zoneTree";
import { validerDetails } from "../../lib/forms/champSchema";
import { ZoneSelector } from "../../components/ZoneSelector";
import { DynamicElementFields } from "../../components/DynamicElementFields";
import type { ChampDefinition } from "../../db/schema/types";

// Types disponibles pour un élément : le catalogue système (proprieteId NULL)
// + les types perso de cette propriété.
async function chargerTypesDisponibles(proprieteId: number) {
  return db.select().from(typeElement).where(or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, proprieteId)));
}

function extraireDetails(form: FormData, champs: ChampDefinition[]) {
  const details: Record<string, unknown> = {};
  for (const champ of champs) {
    if (champ.genre === "fichier") continue;
    if (champ.genre === "booleen") {
      details[champ.cle] = form.get(`details.${champ.cle}`) === "true";
      continue;
    }
    const valeur = form.get(`details.${champ.cle}`);
    if (valeur === null || valeur === "") continue;
    details[champ.cle] = valeur;
  }
  return details;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const types = await chargerTypesDisponibles(propriete.id);
  const arbre = await chargerArbreZones(propriete.id);
  const systemes = await db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id));
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

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!zoneId) return { erreur: "La zone est obligatoire." };

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
    systemeId: systemeIdBrut ? Number(systemeIdBrut) : null,
    details: resultat.data,
  });

  return redirect(`/proprietes/${propriete.id}/elements`);
}

export default function NouvelElement() {
  const { propriete, types, arbre, systemes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [typeId, setTypeId] = useState<number | null>(null);
  const typeChoisi = types.find((t) => t.id === typeId);

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
          <select name="typeId" required value={typeId ?? ""} onChange={(e) => setTypeId(Number(e.target.value) || null)}>
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
