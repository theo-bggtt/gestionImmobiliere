// app/routes/_app/zones.nouveau.tsx
import { Fragment } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau, zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones, type ZoneAvecEnfants } from "../../lib/zoneTree";

const TYPES = ["interieur", "exterieur", "annexe", "technique"] as const;

async function chargerNiveauxAvecBatiment(proprieteId: number) {
  const batiments = await db.select().from(batiment).where(eq(batiment.proprieteId, proprieteId)).orderBy(asc(batiment.ordre));
  const ids = batiments.map((b) => b.id);
  const niveaux = ids.length
    ? await db.select().from(niveau).where(inArray(niveau.batimentId, ids)).orderBy(asc(niveau.ordinal))
    : [];
  return niveaux.map((n) => ({ ...n, batimentNom: batiments.find((b) => b.id === n.batimentId)!.nom }));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const niveaux = await chargerNiveauxAvecBatiment(propriete.id);
  const { arbre, zonesExterieures } = await chargerArbreZones(propriete.id);
  return { propriete, niveaux, arbre, zonesExterieures };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "");
  const niveauIdBrut = String(form.get("niveauId") ?? "");
  const parentIdBrut = String(form.get("parentId") ?? "");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de zone invalide." };

  await db.insert(zone).values({
    proprieteId: propriete.id,
    nom,
    type: type as (typeof TYPES)[number],
    niveauId: niveauIdBrut ? Number(niveauIdBrut) : null,
    parentId: parentIdBrut ? Number(parentIdBrut) : null,
  });

  return redirect(`/proprietes/${propriete.id}/zones`);
}

function OptionsZonesPlates({ zones, profondeur = 0 }: { zones: ZoneAvecEnfants[]; profondeur?: number }) {
  return (
    <>
      {zones.map((z) => (
        <Fragment key={z.id}>
          <option value={z.id}>{"— ".repeat(profondeur)}{z.nom}</option>
          {z.enfants.length > 0 && <OptionsZonesPlates zones={z.enfants} profondeur={profondeur + 1} />}
        </Fragment>
      ))}
    </>
  );
}

export default function NouvelleZone() {
  const { niveaux, arbre, zonesExterieures } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const toutesLesZones = [...arbre.flatMap(({ niveaux: ns }) => ns.flatMap((n) => n.zones)), ...zonesExterieures];

  return (
    <main>
      <h1>Ajouter une zone</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Cuisine, jardin, garage, local technique..." />
        </label>
        <label>
          Type
          <select name="type" defaultValue="interieur">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Rattachement (laisser vide pour une zone extérieure, rattachée à la propriété)
          <select name="niveauId" defaultValue="">
            <option value="">— zone extérieure (aucun niveau) —</option>
            {niveaux.map((n) => (
              <option key={n.id} value={n.id}>{n.batimentNom} — {n.nom}</option>
            ))}
          </select>
        </label>
        <label>
          Sous-zone de (optionnel)
          <select name="parentId" defaultValue="">
            <option value="">— aucune, zone de premier niveau —</option>
            <OptionsZonesPlates zones={toutesLesZones} />
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
