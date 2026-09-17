// app/routes/_app/partages._index.tsx
// La gestion des liens de partage : créer, lister, révoquer. Le lien lui-même
// n'existe qu'ici — c'est la seule surface qui montre un jeton en clair.
//
// La correction d'un lien vit sur son propre écran (`:partageId/modifier`), et
// la lecture du formulaire dans `lireSaisiePartage` : les deux écrans qui
// écrivent un lien lisent la MÊME saisie, sinon celui de correction finirait
// par oublier une borne que celui-ci vérifie.
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { intervenant, partage, systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerZonesVignettes } from "../../lib/recherche/recherche.server";
import { creerPartage, lireSaisiePartage, partageActif } from "../../lib/partage/partage.server";
import { chargerIntervenants } from "../../lib/historique/intervenants.server";
import { libelleNiveau } from "../../lib/partage/niveaux";
import { FormulairePartage, PARTAGE_VIERGE } from "../../components/partage/FormulairePartage";
import { jourLisible } from "../../lib/dates";

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

  const [lignes, zones, systemes, intervenants] = await Promise.all([
    db
      .select({ partage, intervenantNom: intervenant.nom })
      .from(partage)
      .leftJoin(intervenant, eq(intervenant.id, partage.intervenantId))
      .where(eq(partage.proprieteId, propriete.id))
      .orderBy(desc(partage.creeLe)),
    chargerZonesVignettes(propriete.id),
    db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id)).orderBy(asc(systeme.nom)),
    chargerIntervenants(propriete.id),
  ]);

  const nomsZone = new Map(zones.map((z) => [z.id, z.nom]));
  const nomsSysteme = new Map(systemes.map((s) => [s.id, s.nom]));
  const origine = new URL(request.url).origin;

  return {
    propriete,
    zones: zones.map((z) => ({ id: z.id, nom: z.nom, chemin: z.chemin })),
    systemes: systemes.map((s) => ({ id: s.id, nom: s.nom })),
    intervenants: intervenants.map(({ id, nom, metier }) => ({ id, nom, metier })),
    partages: lignes.map(({ partage: p, intervenantNom }) => ({
      id: p.id,
      nom: p.nom,
      intervenantNom,
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

  const saisie = await lireSaisiePartage(propriete.id, form);
  if (!saisie.ok) return { erreur: saisie.message };

  await creerPartage(propriete.id, saisie.valeur);
  return redirect(`/proprietes/${propriete.id}/partages`);
}

export default function EcranPartages() {
  const { propriete, partages, zones, systemes, intervenants } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const base = `/proprietes/${propriete.id}`;

  return (
    <main>
      <h1>Partages</h1>
      <p className="resultats-vide">
        Un lien donne à voir une partie de {propriete.nom}, sans compte et sans installation. Il ne montre jamais
        l'adresse.
      </p>

      <section className="bloc">
        <p className="cote">Liens existants</p>
        {partages.length === 0 ? (
          <p className="resultats-vide">Aucun lien pour l'instant.</p>
        ) : (
          <ul className="filets partages-liste">
            {partages.map((p) => (
              <li key={p.id} className={p.actif ? "partage-ligne" : "partage-ligne partage-ligne-inactif filet-tirete"}>
                <div className="partage-tete">
                  <span className="partage-nom">{p.nom}</span>
                  <span className={p.actif ? "etiquette etiquette-active" : "etiquette etiquette-hors"}>
                    {p.revoque ? "révoqué" : p.actif ? "actif" : "expiré"}
                  </span>
                </div>
                <p className="partage-detail">
                  {p.intervenantNom ? `Donné à ${p.intervenantNom} · ` : ""}
                  Jusqu'au niveau <strong>{p.plafond}</strong>, sur {p.portee}
                  {p.expireLe ? ` · expire le ${jourLisible(p.expireLe)}` : " · sans expiration"}
                </p>
                {p.actif && <input className="partage-lien" type="text" readOnly value={p.lien} />}
                <div className="partage-actions">
                  <Link to={`${p.id}/apercu`} viewTransition>
                    Voir ce que verra le destinataire
                  </Link>
                  {/* Un lien expiré se corrige aussi : prolonger la date est
                      exactement le cas où l'on veut garder le même jeton. */}
                  {!p.revoque && (
                    <Link to={`${p.id}/modifier`} viewTransition>
                      Corriger
                    </Link>
                  )}
                  {p.actif && (
                    <Form method="post">
                      <input type="hidden" name="_action" value="revoquer" />
                      <input type="hidden" name="partageId" value={p.id} />
                      <button type="submit" className="bouton-discret">
                        Révoquer
                      </button>
                    </Form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bloc">
        <p className="cote">Nouveau lien</p>
        <FormulairePartage
          valeurs={PARTAGE_VIERGE}
          zones={zones}
          systemes={systemes}
          intervenants={intervenants}
          erreur={actionData?.erreur}
          libelleBouton="Créer le lien"
        />
        <p className="champ-aide">
          Le carnet d'artisans est sur <Link to={`${base}/intervenants`} viewTransition>Intervenants</Link>.
        </p>
      </section>
    </main>
  );
}
