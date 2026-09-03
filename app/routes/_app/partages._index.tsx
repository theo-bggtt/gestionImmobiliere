// app/routes/_app/partages._index.tsx
// La gestion des liens de partage : créer, lister, révoquer. Le lien lui-même
// n'existe qu'ici — c'est la seule surface qui montre un jeton en clair.
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { partage, systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerZonesVignettes } from "../../lib/recherche/recherche.server";
import { creerJeton, partageActif } from "../../lib/partage/partage.server";
import { LIBELLES_NIVEAU, libelleNiveau } from "../../lib/partage/niveaux";

const NOM_MAX = 120;

/** « Toute la propriété », ou la portée en clair — le filtre est un OU. */
function resumerPortee(
  zonesIds: number[],
  systemesIds: number[],
  nomsZone: Map<number, string>,
  nomsSysteme: Map<number, string>,
) {
  const morceaux: string[] = [];
  const zones = zonesIds.map((id) => nomsZone.get(id)).filter(Boolean);
  const systemes = systemesIds.map((id) => nomsSysteme.get(id)).filter(Boolean);
  if (zones.length > 0) morceaux.push(`zones ${zones.join(", ")}`);
  if (systemes.length > 0) morceaux.push(`systèmes ${systemes.join(", ")}`);
  return morceaux.length === 0 ? "toute la propriété" : morceaux.join(" ou ");
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const [lignes, zones, systemes] = await Promise.all([
    db.select().from(partage).where(eq(partage.proprieteId, propriete.id)).orderBy(desc(partage.creeLe)),
    chargerZonesVignettes(propriete.id),
    db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id)).orderBy(asc(systeme.nom)),
  ]);

  const nomsZone = new Map(zones.map((z) => [z.id, z.nom]));
  const nomsSysteme = new Map(systemes.map((s) => [s.id, s.nom]));
  const origine = new URL(request.url).origin;

  return {
    propriete,
    zones,
    systemes,
    partages: lignes.map((p) => ({
      id: p.id,
      nom: p.nom,
      lien: `${origine}/p/${p.jeton}`,
      plafond: libelleNiveau(p.niveauMax),
      portee: resumerPortee(p.porteeZones, p.porteeSystemes, nomsZone, nomsSysteme),
      expireLe: p.expireLe ? p.expireLe.toISOString().slice(0, 10) : null,
      actif: partageActif(p),
      revoque: p.revoqueLe !== null,
    })),
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  if (form.get("_action") === "revoquer") {
    // Révoqué, jamais supprimé : la trace de ce qui a été partagé, et à qui,
    // est précisément ce qu'on veut garder.
    await db
      .update(partage)
      .set({ revoqueLe: new Date() })
      .where(and(eq(partage.id, Number(form.get("partageId"))), eq(partage.proprieteId, propriete.id)));
    return redirect(`/proprietes/${propriete.id}/partages`);
  }

  const nom = String(form.get("nom") ?? "").trim().slice(0, NOM_MAX);
  if (!nom) return { erreur: "Le nom est obligatoire." };

  const niveauMax = Number(form.get("niveauMax"));
  if (!Number.isInteger(niveauMax) || niveauMax < 0 || niveauMax > 3) {
    return { erreur: "Plafond de visibilité invalide." };
  }

  const expireLeBrut = String(form.get("expireLe") ?? "").trim();
  let expireLe: Date | null = null;
  if (expireLeBrut) {
    // Le lien du locataire expire « au départ », c'est-à-dire à la fin du
    // jour choisi, pas à minuit le matin.
    expireLe = new Date(`${expireLeBrut}T23:59:59`);
    if (Number.isNaN(expireLe.getTime())) return { erreur: "Date d'expiration invalide." };
  }

  // Jamais confiance à un identifiant venu du formulaire : une portée écrite
  // avec les zones du voisin ne fuirait rien (le filtre porte aussi sur la
  // propriété) mais elle mentirait sur l'écran de gestion.
  const [zones, systemes] = await Promise.all([
    chargerZonesVignettes(propriete.id),
    db.select({ id: systeme.id }).from(systeme).where(eq(systeme.proprieteId, propriete.id)),
  ]);
  const ids = (champ: string, connus: Set<number>) =>
    [...new Set(form.getAll(champ).map(Number))].filter((id) => connus.has(id));

  const porteeZones = ids("zone", new Set(zones.map((z) => z.id)));
  const porteeSystemes = ids("systeme", new Set(systemes.map((s) => s.id)));

  await db.insert(partage).values({
    proprieteId: propriete.id,
    nom,
    jeton: creerJeton(),
    niveauMax,
    porteeZones,
    porteeSystemes,
    expireLe,
  });

  return redirect(`/proprietes/${propriete.id}/partages`);
}

export default function EcranPartages() {
  const { propriete, partages, zones, systemes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Partages</h1>
      <p className="resultats-vide">
        Un lien donne à voir une partie de {propriete.nom}, sans compte et sans installation. Il ne montre jamais
        l'adresse.
      </p>

      <section>
        <h2>Liens existants</h2>
        {partages.length === 0 ? (
          <p className="resultats-vide">Aucun lien pour l'instant.</p>
        ) : (
          <ul className="partages-liste">
            {partages.map((p) => (
              <li key={p.id} className={p.actif ? "partage-ligne" : "partage-ligne partage-ligne-inactif"}>
                <div className="partage-tete">
                  <span className="partage-nom">{p.nom}</span>
                  <span className="partage-etat">
                    {p.revoque ? "révoqué" : p.actif ? "actif" : "expiré"}
                  </span>
                </div>
                <p className="partage-detail">
                  Jusqu'au niveau <strong>{p.plafond}</strong>, sur {p.portee}
                  {p.expireLe ? ` · expire le ${p.expireLe}` : " · sans expiration"}
                </p>
                {p.actif && <input className="partage-lien" type="text" readOnly value={p.lien} />}
                <div className="partage-actions">
                  <Link to={`${p.id}/apercu`}>Voir ce que verra le destinataire</Link>
                  {p.actif && (
                    <Form method="post">
                      <input type="hidden" name="_action" value="revoquer" />
                      <input type="hidden" name="partageId" value={p.id} />
                      <button type="submit" className="bouton-discret">Révoquer</button>
                    </Form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Nouveau lien</h2>
        <Form method="post">
          <label>
            Nom (pour vous seul)
            <input type="text" name="nom" required maxLength={NOM_MAX} placeholder="Jardinier Marc" />
          </label>

          <label>
            Plafond de visibilité
            <select name="niveauMax" defaultValue="1">
              {LIBELLES_NIVEAU.map((libelle, niveau) => (
                <option key={niveau} value={niveau}>
                  {niveau} — {libelle}
                </option>
              ))}
            </select>
          </label>

          <label>
            Expiration (optionnelle)
            <input type="date" name="expireLe" />
          </label>

          <fieldset className="portee-choix">
            <legend>Portée — ne rien cocher donne toute la propriété</legend>
            <div className="portee-groupe">
              <h3 className="facettes-titre">Zones</h3>
              {zones.map((z) => (
                <label key={z.id} className="portee-case">
                  <input type="checkbox" name="zone" value={z.id} />
                  {z.nom} <span className="selecteur-secondaire">{z.chemin}</span>
                </label>
              ))}
            </div>
            <div className="portee-groupe">
              <h3 className="facettes-titre">Systèmes</h3>
              {systemes.length === 0 ? (
                <p className="resultats-vide">Aucun système.</p>
              ) : (
                systemes.map((s) => (
                  <label key={s.id} className="portee-case">
                    <input type="checkbox" name="systeme" value={s.id} />
                    {s.nom}
                  </label>
                ))
              )}
            </div>
          </fieldset>

          {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
          <button type="submit">Créer le lien</button>
        </Form>
      </section>
    </main>
  );
}
