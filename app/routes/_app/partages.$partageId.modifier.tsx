// app/routes/_app/partages.$partageId.modifier.tsx
// Corriger un lien plutôt que de le remplacer. C'est le jeton qui fait la
// valeur d'un lien : il est parti dans une conversation WhatsApp, il est
// peut-être en favori sur le téléphone d'un artisan. Révoquer et recréer pour
// monter un plafond d'un cran coûtait ce lien-là à chaque fois.
//
// Ce que cet écran ne fait PAS, et c'est le plus important : il ne fait pas
// tourner le jeton. `majPartage` ne l'écrit pas, `SaisiePartage` ne le porte
// pas — c'est une erreur de compilation, pas une case à ne pas cocher.
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { partage, systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerZonesVignettes } from "../../lib/recherche/recherche.server";
import { chargerPartageOu404, lireSaisiePartage, majPartage, partageActif } from "../../lib/partage/partage.server";
import { chargerIntervenants } from "../../lib/historique/intervenants.server";
import { libelleNiveau } from "../../lib/partage/niveaux";
import { FormulairePartage } from "../../components/partage/FormulairePartage";
import { jourLisible } from "../../lib/dates";

/** `YYYY-MM-DD` découpé côté serveur : `new Date("2026-03-01")` se lit en UTC
 *  et rendrait la veille à l'ouest de Greenwich (voir `app/lib/dates.ts`). */
const jourSaisi = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const lien = await chargerPartageOu404(propriete.id, params.partageId);

  const [zones, systemes, intervenants] = await Promise.all([
    chargerZonesVignettes(propriete.id),
    db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id)).orderBy(asc(systeme.nom)),
    chargerIntervenants(propriete.id),
  ]);

  return {
    propriete,
    lien: {
      id: lien.id,
      nom: lien.nom,
      niveauMax: lien.niveauMax,
      porteeZones: lien.porteeZones,
      porteeSystemes: lien.porteeSystemes,
      expireLe: jourSaisi(lien.expireLe),
      intervenantId: lien.intervenantId,
      intervenantNom: lien.intervenantNom,
      // L'URL complète, la même qu'avant et qu'après : la montrer ici est ce
      // qui dit que la correction ne la change pas. Nommée `lien` comme sur
      // l'écran de liste, et surtout PAS `adresse` — c'est le nom que
      // `tests/adresse-jamais-ecrite.test.ts` traque dans tout `app/`, et il a
      // raison de le traquer sans nuance.
      lien: `${new URL(request.url).origin}/p/${lien.jeton}`,
      actif: partageActif(lien),
      revoque: lien.revoqueLe !== null,
      plafondActuel: libelleNiveau(lien.niveauMax),
    },
    zones: zones.map((z) => ({ id: z.id, nom: z.nom, chemin: z.chemin })),
    systemes: systemes.map((s) => ({ id: s.id, nom: s.nom })),
    intervenants: intervenants.map(({ id, nom, metier }) => ({ id, nom, metier })),
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const lien = await chargerPartageOu404(propriete.id, params.partageId);

  const form = await request.formData();

  if (form.get("_action") === "revoquer") {
    // Révoqué, jamais supprimé : la trace de ce qui a été partagé, et à qui,
    // est précisément ce qu'on veut garder.
    await db
      .update(partage)
      .set({ revoqueLe: new Date() })
      .where(and(eq(partage.id, lien.id), eq(partage.proprieteId, propriete.id)));
    return redirect(`/proprietes/${propriete.id}/partages`);
  }

  const saisie = await lireSaisiePartage(propriete.id, form);
  if (!saisie.ok) return { erreur: saisie.message };

  // Le refus vient du nombre de lignes écrites, pas d'une lecture préalable :
  // c'est le `revoque_le IS NULL` du WHERE qui ferme la course entre une
  // correction et une révocation lancées en même temps.
  if (!(await majPartage(propriete.id, lien.id, saisie.valeur))) {
    return { erreur: "Ce lien est révoqué : il ne se corrige plus, il se remplace." };
  }
  return redirect(`/proprietes/${propriete.id}/partages`);
}

export default function ModifierPartage() {
  const { propriete, lien, zones, systemes, intervenants } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const base = `/proprietes/${propriete.id}`;

  return (
    <main>
      <p className="fiche-fil">
        <Link to={`${base}/partages`} viewTransition>
          Partages
        </Link>
      </p>
      <h1>{lien.nom}</h1>

      {lien.revoque ? (
        <>
          <p className="message-avis">
            Ce lien est révoqué. Il ne se corrige pas : ce qui a été coupé se remplace par un lien neuf, avec une
            nouvelle adresse — c'est justement ce que la révocation voulait dire.
          </p>
          <p className="rangee-actions">
            <Link to={`${base}/partages`} className="bouton-trait" viewTransition>
              Créer un nouveau lien
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="partage-detail">
            {lien.intervenantNom ? `Donné à ${lien.intervenantNom}. ` : ""}
            Aujourd'hui : jusqu'au niveau <strong>{lien.plafondActuel}</strong>
            {lien.expireLe ? `, expire le ${jourLisible(lien.expireLe)}` : ", sans expiration"}.
          </p>
          <input className="partage-lien" type="text" readOnly value={lien.lien} />
          <p className="message-avis">
            L'adresse ci-dessus ne change pas : c'est tout l'intérêt de corriger plutôt que de recréer. Conséquence à
            avoir en tête — ce que vous changez ici s'applique <strong>tout de suite</strong> à ce lien déjà distribué.
            Monter le plafond ouvre davantage à qui l'a déjà ; le baisser referme sans prévenir personne.{" "}
            <Link to={`${base}/partages/${lien.id}/apercu`} viewTransition>
              Voir ce que verra le destinataire
            </Link>
            .
          </p>

          <FormulairePartage
            valeurs={lien}
            zones={zones}
            systemes={systemes}
            intervenants={intervenants}
            erreur={actionData?.erreur}
            libelleBouton="Enregistrer"
          />

          <div className="formulaire-danger">
            <Form method="post">
              <input type="hidden" name="_action" value="revoquer" />
              <button type="submit" className="bouton-discret">
                Révoquer le lien
              </button>
            </Form>
          </div>
        </>
      )}
    </main>
  );
}
