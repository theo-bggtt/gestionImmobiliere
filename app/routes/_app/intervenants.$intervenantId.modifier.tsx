// app/routes/_app/intervenants.$intervenantId.modifier.tsx
// La fiche d'une personne du carnet. Deux réglages y vivent côte à côte, et il
// faut les tenir bien distincts parce qu'ils vont dans des sens OPPOSÉS :
//
//   « Visibilité du nom et du métier » dit ce que les AUTRES voient d'elle —
//   son nom sur un événement servi à un lien de partage.
//
//   « Ce que cette personne peut voir » dit ce qu'ELLE voit de la maison — son
//   ou ses liens de partage, avec leur plafond et leur portée.
//
// Le second est ici pour une raison précise : corriger le plafond d'un artisan
// obligeait à révoquer son lien et à en créer un autre, donc à lui renvoyer une
// adresse. `majPartage` garde le jeton, et cet écran est l'endroit d'où on y
// pense — depuis la personne, pas depuis la liste des liens.
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  chargerIntervenantOu404,
  lireSaisieIntervenant,
  majIntervenant,
  supprimerIntervenant,
} from "../../lib/historique/intervenants.server";
import {
  chargerPartagesDeLIntervenant,
  creerPartage,
  lireSaisiePartage,
  partageActif,
} from "../../lib/partage/partage.server";
import { chargerZonesVignettes } from "../../lib/recherche/recherche.server";
import { libelleNiveau } from "../../lib/partage/niveaux";
import { FormulaireIntervenant } from "../../components/historique/FormulaireIntervenant";
import { FormulairePartage, PARTAGE_VIERGE } from "../../components/partage/FormulairePartage";
import { jourLisible } from "../../lib/dates";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const intervenant = await chargerIntervenantOu404(propriete.id, params.intervenantId);

  const [liens, zones, systemes] = await Promise.all([
    chargerPartagesDeLIntervenant(propriete.id, intervenant.id),
    chargerZonesVignettes(propriete.id),
    db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id)).orderBy(asc(systeme.nom)),
  ]);

  const nomsZone = new Map(zones.map((z) => [z.id, z.nom]));
  const nomsSysteme = new Map(systemes.map((s) => [s.id, s.nom]));
  const resumerPortee = (zonesIds: number[], systemesIds: number[]) => {
    const morceaux: string[] = [];
    const z = zonesIds.map((id) => nomsZone.get(id)).filter(Boolean);
    const s = systemesIds.map((id) => nomsSysteme.get(id)).filter(Boolean);
    if (z.length > 0) morceaux.push(`zones ${z.join(", ")}`);
    if (s.length > 0) morceaux.push(`systèmes ${s.join(", ")}`);
    return morceaux.length === 0 ? "toute la propriété" : morceaux.join(" ou ");
  };

  const origine = new URL(request.url).origin;
  return {
    propriete,
    intervenant,
    zones: zones.map((z) => ({ id: z.id, nom: z.nom, chemin: z.chemin })),
    systemes: systemes.map((s) => ({ id: s.id, nom: s.nom })),
    liens: liens.map((p) => ({
      id: p.id,
      nom: p.nom,
      lien: `${origine}/p/${p.jeton}`,
      plafond: libelleNiveau(p.niveauMax),
      portee: resumerPortee(p.porteeZones, p.porteeSystemes),
      expireLe: p.expireLe ? p.expireLe.toISOString().slice(0, 10) : null,
      actif: partageActif(p),
      revoque: p.revoqueLe !== null,
    })),
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const existant = await chargerIntervenantOu404(propriete.id, params.intervenantId);

  const form = await request.formData();
  if (form.get("_action") === "supprimer") {
    // La cascade retire ses lignes de `evenement_intervenant` : les événements
    // restent, ils perdent une signature. C'est le bon sens de la perte. Ses
    // liens de partage, eux, SURVIVENT avec `intervenant_id` remis à NULL
    // (`ON DELETE SET NULL`, migration 0014) : un lien distribué continue de
    // marcher, et le retirer du carnet n'est pas le révoquer. Les révoquer
    // aussi serait une décision de plus, prise ailleurs et à dessein.
    await supprimerIntervenant(propriete.id, existant.id);
    return redirect(`/proprietes/${propriete.id}/intervenants`);
  }

  if (form.get("_action") === "partage-creer") {
    const saisie = await lireSaisiePartage(propriete.id, form);
    // L'écran sert deux formulaires : sans `cible`, le refus d'un lien
    // s'afficherait sous les coordonnées de la personne.
    if (!saisie.ok) return { erreur: saisie.message, cible: "partage" as const };
    // La personne vient de l'URL, jamais du formulaire : `intervenantImpose`
    // pose bien un champ caché, mais c'est `chargerIntervenantOu404` qui a déjà
    // 404 sur quelqu'un d'une autre propriété.
    await creerPartage(propriete.id, { ...saisie.valeur, intervenantId: existant.id });
    return redirect(`/proprietes/${propriete.id}/intervenants/${existant.id}/modifier`);
  }

  const saisie = lireSaisieIntervenant(form);
  if (!saisie.ok) return { erreur: saisie.message, cible: "intervenant" as const };

  await majIntervenant(propriete.id, existant.id, saisie.valeur);
  return redirect(`/proprietes/${propriete.id}/intervenants`);
}

export default function ModifierIntervenant() {
  const { propriete, intervenant, liens, zones, systemes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const base = `/proprietes/${propriete.id}`;
  const erreurDe = (cible: "intervenant" | "partage") =>
    actionData?.cible === cible ? actionData.erreur : undefined;

  return (
    <main>
      <p className="fiche-fil">
        <Link to={`${base}/intervenants`} viewTransition>
          Intervenants
        </Link>
      </p>
      <h1>{intervenant.nom}</h1>

      <FormulaireIntervenant
        valeurs={intervenant}
        erreur={erreurDe("intervenant")}
        libelleBouton="Enregistrer"
      />

      <section className="bloc">
        <p className="sous-titre">
          <span>Ce que cette personne peut voir</span>
        </p>
        <p className="message-avis">
          Le réglage ci-dessus dit ce que les <strong>autres</strong> voient de cette personne. Ici, c'est l'inverse :
          ce qu'<strong>elle</strong> voit de {propriete.nom}. Corriger un lien garde son adresse — celle qu'elle a
          déjà n'est pas à renvoyer.
        </p>

        {liens.length === 0 ? (
          <p className="fiche-photos-vide">Aucun lien donné à cette personne.</p>
        ) : (
          <ul className="filets partages-liste">
            {liens.map((p) => (
              <li key={p.id} className={p.actif ? "partage-ligne" : "partage-ligne partage-ligne-inactif filet-tirete"}>
                <div className="partage-tete">
                  <span className="partage-nom">{p.nom}</span>
                  <span className={p.actif ? "etiquette etiquette-active" : "etiquette etiquette-hors"}>
                    {p.revoque ? "révoqué" : p.actif ? "actif" : "expiré"}
                  </span>
                </div>
                <p className="partage-detail">
                  Jusqu'au niveau <strong>{p.plafond}</strong>, sur {p.portee}
                  {p.expireLe ? ` · expire le ${jourLisible(p.expireLe)}` : " · sans expiration"}
                </p>
                {p.actif && <input className="partage-lien" type="text" readOnly value={p.lien} />}
                <div className="partage-actions">
                  <Link to={`${base}/partages/${p.id}/apercu`} viewTransition>
                    Voir ce qu'elle verra
                  </Link>
                  {!p.revoque && (
                    <Link to={`${base}/partages/${p.id}/modifier`} viewTransition>
                      Corriger
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="cote">Donner un nouveau lien à {intervenant.nom}</p>
        <FormulairePartage
          valeurs={PARTAGE_VIERGE}
          zones={zones}
          systemes={systemes}
          intervenants={[]}
          intervenantImpose={intervenant.id}
          actionCachee="partage-creer"
          erreur={erreurDe("partage")}
          libelleBouton="Créer le lien"
        />
      </section>

      <div className="formulaire-danger">
        <Form method="post">
          <input type="hidden" name="_action" value="supprimer" />
          <button type="submit" className="bouton-discret">
            Supprimer l'intervenant
          </button>
        </Form>
      </div>
    </main>
  );
}
