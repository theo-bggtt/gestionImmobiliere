// app/routes/_app/plans._index.tsx
// L'écran de plan du propriétaire : un sélecteur de niveau, le plan, ses
// points. C'est aussi l'écran de placement — on y arrive depuis une fiche
// avec `?element=<id>`, et le clic pose l'objet. Un second écran « placer »
// referait ce que celui-ci fait déjà (même raisonnement que la décision #42).
import { Link, useFetcher, useLoaderData, useSearchParams } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { element } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  chargerPlans,
  chargerPlansDeLElement,
  chargerPointsDuPlan,
  chargerPolygonesDuPlan,
} from "../../lib/plans/plans.server";
import { VuePlan } from "../../components/plan/VuePlan";
import { liensPropriete } from "../../components/recherche/liens";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const url = new URL(request.url);

  const plans = await chargerPlans(propriete.id);
  // Un identifiant inconnu retombe sur le premier plan : l'URL ne décide pas
  // de ce qui est chargé, elle choisit parmi ce qui l'est déjà.
  const choisi = plans.find((p) => p.id === Number(url.searchParams.get("plan"))) ?? plans[0] ?? null;

  const [points, polygones] = choisi
    ? await Promise.all([
        chargerPointsDuPlan(propriete.id, choisi.id),
        chargerPolygonesDuPlan(propriete.id, choisi.id),
      ])
    : [[], []];

  // Mode placement : la fiche d'où l'on vient, et les plans qui la portent
  // déjà (« déjà sur Sous-sol » plutôt qu'un placement interdit).
  const elementId = Number(url.searchParams.get("element"));
  const [fiche] = elementId
    ? await db
        .select({ id: element.id, nom: element.nom })
        .from(element)
        .where(and(eq(element.id, elementId), eq(element.proprieteId, propriete.id)))
    : [];
  const dejaPose = fiche ? await chargerPlansDeLElement(propriete.id, fiche.id) : [];

  return {
    propriete,
    plans,
    choisi,
    points,
    polygones,
    placement: fiche ? { elementId: fiche.id, elementNom: fiche.nom } : null,
    dejaPose: dejaPose.map((d) => d.planId),
  };
}

export default function EcranPlans() {
  const { propriete, plans, choisi, points, polygones, placement, dejaPose } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const fetcher = useFetcher();
  const liens = liensPropriete(propriete.id);

  const envoyer = (donnees: Record<string, string | number>) =>
    fetcher.submit(
      Object.fromEntries(Object.entries(donnees).map(([c, v]) => [c, String(v)])),
      { method: "post", action: `/proprietes/${propriete.id}/plans/points` },
    );

  if (plans.length === 0 || !choisi) {
    return (
      <main>
        <h1>Plans</h1>
        <p className="resultats-vide">
          Aucun plan pour l'instant. Un plan répond à « c'est où » sans qu'on ait à savoir comment l'objet s'appelle.
        </p>
        <Link to="nouveau">Ajouter un plan</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Plans</h1>

      {/* Trié par ordinal côté serveur, situation en fin de liste. */}
      <nav className="plan-niveaux" aria-label="Choisir un plan">
        {plans.map((p) => {
          const cible = new URLSearchParams(params);
          cible.set("plan", String(p.id));
          return (
            <Link
              key={p.id}
              to={`?${cible}`}
              className={p.id === choisi.id ? "plan-niveau plan-niveau-actif" : "plan-niveau"}
              aria-current={p.id === choisi.id ? "page" : undefined}
            >
              {p.nom}
              {dejaPose.includes(p.id) && <span className="plan-niveau-deja"> · déjà posé</span>}
            </Link>
          );
        })}
      </nav>

      {choisi.imageFichierId === null ? (
        <p className="resultats-vide">Ce plan n'a pas d'image.</p>
      ) : (
        <VuePlan
          imageUrl={liens.image(choisi.imageFichierId, "pleine")}
          points={points}
          polygones={polygones}
          liens={liens}
          placement={placement}
          onPoser={(x, y) =>
            placement && envoyer({ _action: "poser", planId: choisi.id, elementId: placement.elementId, x, y })
          }
          onDeplacer={(pointId, x, y) => envoyer({ _action: "deplacer", pointId, x, y })}
          onRetirer={(pointId) => envoyer({ _action: "retirer", pointId })}
        />
      )}

      {placement && (
        <p className="resultats-vide">
          <Link to={liens.fiche(placement.elementId)}>Revenir à la fiche</Link>
        </p>
      )}

      <nav className="accueil-nav">
        <Link to={`${choisi.id}/modifier`}>Modifier ce plan</Link>
        <Link to="nouveau">Ajouter un plan</Link>
      </nav>
    </main>
  );
}
