// app/routes/_app/zones.$zoneId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, count, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { element, zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerRessourceOu404 } from "../../lib/db/scopedResource.server";
import { chargerPartagesActifs } from "../../lib/partage/partage.server";
import { appliquerRenivelage, previsualiserRenivelage } from "../../lib/partage/niveaux.server";
import { libelleNiveau, lireNiveauSaisi } from "../../lib/partage/niveaux";

const TYPES = ["interieur", "exterieur", "annexe", "technique"] as const;

// Le re-nivelage en masse ne descend jamais à 0 : un niveau public se décide
// objet par objet, jamais sur une zone entière.
const NIVEAUX_RENIVELAGE = [1, 2, 3];

async function chargerZone(proprieteId: number, zoneId: string | undefined) {
  return chargerRessourceOu404(
    zone,
    and(eq(zone.id, Number(zoneId)), eq(zone.proprieteId, proprieteId)),
    "Zone introuvable",
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const z = await chargerZone(propriete.id, params.zoneId);
  const [{ objets }] = await db
    .select({ objets: count() })
    .from(element)
    .where(and(eq(element.proprieteId, propriete.id), eq(element.zoneId, z.id)));
  return { propriete, zone: z, objets };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerZone(propriete.id, params.zoneId);
  const form = await request.formData();

  // Le re-nivelage en masse vit ici, sur l'écran d'une zone : « tous les objets
  // de la Cuisine en usage ». En deux temps, et sans JavaScript — le premier
  // envoi compte ce que ça changerait, le second l'écrit. Ce qu'on compte est
  // réservé au propriétaire : un compte d'objets masqués dit qu'il en existe.
  if (form.get("_action") === "niveau-masse-verifier" || form.get("_action") === "niveau-masse-appliquer") {
    const cible = lireNiveauSaisi(form.get("niveau"));
    if (cible === null || !NIVEAUX_RENIVELAGE.includes(cible)) {
      return { erreur: "Niveau de visibilité invalide." };
    }

    if (form.get("_action") === "niveau-masse-appliquer") {
      const ecrits = await appliquerRenivelage(propriete.id, Number(params.zoneId), cible);
      return { renivele: { cible, ecrits } };
    }

    const partages = await chargerPartagesActifs(propriete.id);
    return { apercuRenivelage: await previsualiserRenivelage(propriete.id, Number(params.zoneId), cible, partages) };
  }

  if (form.get("_action") === "supprimer") {
    await db.delete(zone).where(eq(zone.id, Number(params.zoneId)));
    return redirect(`/proprietes/${propriete.id}/zones`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "");
  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de zone invalide." };

  await db.update(zone).set({ nom, type: type as (typeof TYPES)[number] }).where(eq(zone.id, Number(params.zoneId)));
  return redirect(`/proprietes/${propriete.id}/zones`);
}

export default function ModifierZone() {
  const { zone, objets } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const apercu = actionData && "apercuRenivelage" in actionData ? actionData.apercuRenivelage : null;
  const renivele = actionData && "renivele" in actionData ? actionData.renivele : null;

  return (
    <main>
      <h1>Modifier {zone.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={zone.nom} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue={zone.type}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {actionData && "erreur" in actionData && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>

      {objets > 0 && (
        <section className="zone-renivelage">
          <h2>Visibilité des objets</h2>
          <Form method="post">
            <input type="hidden" name="_action" value="niveau-masse-verifier" />
            <label>
              Mettre les {objets} objets de cette zone à
              <select name="niveau" defaultValue={String(apercu?.cible ?? 1)}>
                {NIVEAUX_RENIVELAGE.map((valeur) => (
                  <option key={valeur} value={valeur}>{valeur} · {libelleNiveau(valeur)}</option>
                ))}
              </select>
            </label>
            <span className="formulaire-aide">
              Les sous-zones ont leur propre écran : seuls les objets rangés dans « {zone.nom} » sont concernés.
            </span>
            <button type="submit">Voir ce que ça change</button>
          </Form>

          {apercu && (
            <div className="zone-renivelage-apercu">
              <p>
                En « {libelleNiveau(apercu.cible)} » : {apercu.plusVisibles} objet(s) deviennent plus visibles,{" "}
                {apercu.plusMasques} plus masqués, sur {apercu.total}.
              </p>
              {apercu.partages.length === 0 ? (
                <p>Aucun lien de partage actif : rien n'est exposé aujourd'hui.</p>
              ) : (
                <ul>
                  {apercu.partages.map((p) => (
                    <li key={p.id}>
                      « {p.nom} » : {p.gagnes} objet(s) de cette zone deviennent visibles
                      {p.perdus > 0 ? `, ${p.perdus} cessent de l'être` : ""}.
                    </li>
                  ))}
                </ul>
              )}
              <Form method="post">
                <input type="hidden" name="_action" value="niveau-masse-appliquer" />
                <input type="hidden" name="niveau" value={String(apercu.cible)} />
                <button type="submit">Appliquer à toute la zone</button>
              </Form>
            </div>
          )}

          {renivele && (
            <p role="status">
              {renivele.ecrits} objet(s) de cette zone sont désormais en « {libelleNiveau(renivele.cible)} ».
            </p>
          )}
        </section>
      )}

      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer la zone</button>
      </Form>
    </main>
  );
}
