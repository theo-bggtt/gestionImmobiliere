// app/routes/_app/zones.$zoneId.modifier.tsx
import { Fragment } from "react";
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
import { ChoixNiveau } from "../../components/ChoixNiveau";
import {
  chargerArbreZones,
  niveauAppartientALaPropriete,
  zoneParenteValide,
  type ZoneAvecEnfants,
} from "../../lib/zoneTree";
import { deplacerZone, descendanceDeZone } from "../../lib/zones/deplacement.server";

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
  const [[{ objets }], { arbre, zonesExterieures }, descendance] = await Promise.all([
    db
      .select({ objets: count() })
      .from(element)
      .where(and(eq(element.proprieteId, propriete.id), eq(element.zoneId, z.id))),
    chargerArbreZones(propriete.id),
    descendanceDeZone(propriete.id, z.id),
  ]);
  // Dérivés de `arbre` plutôt que requêtés à part, comme à la création : la
  // jointure bâtiment/niveau est déjà faite.
  const niveaux = arbre.flatMap(({ batiment: b, niveaux: ns }) =>
    ns.map(({ niveau: n }) => ({ ...n, batimentNom: b.nom })),
  );
  return { propriete, zone: z, objets, niveaux, arbre, zonesExterieures, descendance };
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

  const zoneId = Number(params.zoneId);
  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "");
  const niveauIdBrut = String(form.get("niveauId") ?? "");
  const parentIdBrut = String(form.get("parentId") ?? "");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de zone invalide." };

  const niveauId = niveauIdBrut ? Number(niveauIdBrut) : null;
  if (niveauId !== null && !(await niveauAppartientALaPropriete(propriete.id, niveauId))) {
    return { erreur: "Niveau invalide." };
  }

  const parentId = parentIdBrut ? Number(parentIdBrut) : null;
  if (parentId !== null) {
    // Le seul contrôle que la création n'a pas à faire : une zone neuve n'a
    // pas de descendance, celle-ci en a une. Se ranger sous son propre enfant
    // ferait un cycle dont `chargerArbreZones` ne sortirait pas — il ne
    // planterait même pas, il ferait disparaître la branche de l'écran, parce
    // que `grouperParParent` ne considère comme racine que ce dont le parent
    // est absent du lot.
    if (parentId === zoneId || (await descendanceDeZone(propriete.id, zoneId)).includes(parentId)) {
      return { erreur: "Une zone ne peut pas être rangée sous elle-même ni sous l'une de ses sous-zones." };
    }
    if (!(await zoneParenteValide(propriete.id, parentId, niveauId))) {
      return { erreur: "Zone parente invalide (doit être sur le même niveau)." };
    }
  }

  await db.update(zone).set({ nom, type: type as (typeof TYPES)[number] }).where(eq(zone.id, zoneId));
  // Le rattachement s'écrit à part : il emporte la descendance et fait le
  // ménage des contours, ce qu'un `set` de plus ne dirait pas.
  await deplacerZone(propriete.id, zoneId, niveauId, parentId);
  return redirect(`/proprietes/${propriete.id}/zones`);
}

/** Les zones offertes comme parente, à plat et indentées — même rendu qu'à la
 *  création. `exclues` retire la zone qu'on modifie et toute sa descendance :
 *  les options d'un cycle ne sont pas proposées avant d'être refusées. */
function OptionsZonesPlates({
  zones,
  exclues,
  profondeur = 0,
}: {
  zones: ZoneAvecEnfants[];
  exclues: number[];
  profondeur?: number;
}) {
  return (
    <>
      {zones.map((z) =>
        exclues.includes(z.id) ? null : (
          <Fragment key={z.id}>
            <option value={z.id}>{"— ".repeat(profondeur)}{z.nom}</option>
            {z.enfants.length > 0 && (
              <OptionsZonesPlates zones={z.enfants} exclues={exclues} profondeur={profondeur + 1} />
            )}
          </Fragment>
        ),
      )}
    </>
  );
}

export default function ModifierZone() {
  const { zone, objets, niveaux, arbre, zonesExterieures, descendance } = useLoaderData<typeof loader>();
  const toutesLesZones = [
    ...arbre.flatMap(({ niveaux: ns }) => ns.flatMap((n) => n.zones)),
    ...zonesExterieures,
  ];
  const actionData = useActionData<typeof action>();
  const apercu = actionData && "apercuRenivelage" in actionData ? actionData.apercuRenivelage : null;
  const renivele = actionData && "renivele" in actionData ? actionData.renivele : null;

  return (
    <main>
      <h1>Modifier {zone.nom}</h1>
      <Form method="post" className="formulaire">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={zone.nom} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue={zone.type}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rattachement
          <select name="niveauId" defaultValue={zone.niveauId ?? ""}>
            <option value="">— zone extérieure (aucun niveau) —</option>
            {niveaux.map((n) => (
              <option key={n.id} value={n.id}>
                {n.batimentNom} — {n.nom}
              </option>
            ))}
          </select>
          <span className="champ-aide">
            Changer d'étage emmène les sous-zones et les objets rangés ici. Les contours tracés sur les plans de
            l'ancien étage sont effacés : ils désigneraient une zone qui n'y est plus.
          </span>
        </label>
        <label>
          Sous-zone de (optionnel)
          <select name="parentId" defaultValue={zone.parentId ?? ""}>
            <option value="">— aucune, zone de premier niveau —</option>
            <OptionsZonesPlates zones={toutesLesZones} exclues={descendance} />
          </select>
          <span className="champ-aide">La zone parente doit être au même étage.</span>
        </label>
        {actionData && "erreur" in actionData && (
          <p role="alert" className="message-erreur">
            {actionData.erreur}
          </p>
        )}
        <div className="formulaire-actions">
          <button type="submit">Enregistrer</button>
        </div>
      </Form>

      {objets > 0 && (
        <section className="zone-renivelage">
          <h2>Visibilité des objets</h2>
          <Form method="post" className="formulaire">
            <input type="hidden" name="_action" value="niveau-masse-verifier" />
            <ChoixNiveau
              valeur={apercu?.cible ?? 1}
              depuis={1}
              etiquette={`Mettre les ${objets} objets de cette zone à`}
              aide={`Les sous-zones ont leur propre écran : seuls les objets rangés dans « ${zone.nom} » sont concernés.`}
            />
            <div className="formulaire-actions">
              <button type="submit" className="bouton-trait">
                Voir ce que ça change
              </button>
            </div>
          </Form>

          {apercu && (
            <div className="zone-renivelage-apercu">
              <p className="cote">Ce que ça changerait</p>
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
            <p role="status" className="message-ok">
              {renivele.ecrits} objet(s) de cette zone sont désormais en « {libelleNiveau(renivele.cible)} ».
            </p>
          )}
        </section>
      )}

      <div className="formulaire-danger">
        <Form method="post">
          <input type="hidden" name="_action" value="supprimer" />
          <button type="submit" className="bouton-discret">
            Supprimer la zone
          </button>
        </Form>
      </div>
    </main>
  );
}
