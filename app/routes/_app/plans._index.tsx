// app/routes/_app/plans._index.tsx
// L'écran de plan du propriétaire : un sélecteur de niveau, le plan, ses
// points, et depuis l'étape 6 les contours de ses zones. C'est aussi l'écran
// de placement — on y arrive depuis une fiche avec `?element=<id>`, et le clic
// pose l'objet. Un second écran « placer » referait ce que celui-ci fait déjà
// (même raisonnement que la décision #42), et un troisième écran « tracer »
// referait la vue zoomable pour la même raison.
import { useEffect, useState } from "react";
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
  chargerZonesTracables,
} from "../../lib/plans/plans.server";
import { SOMMETS_MIN } from "../../lib/plans/geometrie";
import type { Sommet } from "../../lib/plans/types";
import { VuePlan } from "../../components/plan/VuePlan";
import { liensPropriete } from "../../components/recherche/liens";

/** Ce que la géométrie propose après un point posé ou déplacé. Jamais écrit d'office. */
type Proposition = {
  elementId: number;
  elementNom: string;
  zoneId: number;
  zoneNom: string;
  zoneActuelleNom: string;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const url = new URL(request.url);

  const plans = await chargerPlans(propriete.id);
  // Un identifiant inconnu retombe sur le premier plan : l'URL ne décide pas
  // de ce qui est chargé, elle choisit parmi ce qui l'est déjà.
  const choisi = plans.find((p) => p.id === Number(url.searchParams.get("plan"))) ?? plans[0] ?? null;

  const [points, polygones, zonesTracables] = choisi
    ? await Promise.all([
        chargerPointsDuPlan(propriete.id, choisi.id),
        chargerPolygonesDuPlan(propriete.id, choisi.id),
        chargerZonesTracables(propriete.id, choisi.id),
      ])
    : [[], [], []];

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
    zonesTracables,
    placement: fiche ? { elementId: fiche.id, elementNom: fiche.nom } : null,
    dejaPose: dejaPose.map((d) => d.planId),
  };
}

export default function EcranPlans() {
  const { propriete, plans, choisi, points, polygones, zonesTracables, placement, dejaPose } =
    useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const fetcher = useFetcher<{ erreur?: string; proposition?: Proposition | null; range?: boolean }>();
  const contours = useFetcher<{ erreur?: string }>();
  const liens = liensPropriete(propriete.id);

  // Le tracé en cours : des sommets et la zone visée, rien de plus. Il ne
  // touche la base qu'au moment de « Terminer ».
  const [tracage, setTracage] = useState<{ zoneId: number; zoneNom: string; sommets: Sommet[] } | null>(null);
  const [proposition, setProposition] = useState<Proposition | null>(null);

  // La proposition suit la dernière réponse du fetcher de points : une pose
  // qui ne propose rien efface celle d'avant, sinon la bannière survivrait à
  // ce qui l'a produite.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.range) setProposition(null);
    else if ("proposition" in fetcher.data) setProposition(fetcher.data.proposition ?? null);
  }, [fetcher.state, fetcher.data]);

  // Changer de plan abandonne un tracé en cours : ses sommets sont des
  // pourcentages de l'AUTRE image, et les garder les poserait n'importe où.
  useEffect(() => {
    setTracage(null);
    setProposition(null);
  }, [choisi?.id]);

  const envoyer = (donnees: Record<string, string | number>) =>
    fetcher.submit(
      Object.fromEntries(Object.entries(donnees).map(([c, v]) => [c, String(v)])),
      { method: "post", action: `/proprietes/${propriete.id}/plans/points` },
    );

  const envoyerContour = (donnees: Record<string, string | number>) =>
    contours.submit(
      Object.fromEntries(Object.entries(donnees).map(([c, v]) => [c, String(v)])),
      { method: "post", action: `/proprietes/${propriete.id}/plans/contours` },
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

  const contourDe = (zoneId: number) => polygones.find((g) => g.zoneId === zoneId) ?? null;

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
        <>
          {/* La géométrie PROPOSE, elle ne décide pas : `element.zone_id` est
              ce que lit le filtre de partage, et la réécrire au passage d'un
              glissement ferait entrer ou sortir un objet de la portée d'un
              locataire sans que personne l'ait décidé. La bannière demande
              donc un geste, et « Laisser » est un vrai choix — un objet peut
              légitimement être rangé ailleurs que là où il se voit. */}
          {proposition && (
            <p className="plan-proposition" role="status">
              <strong>{proposition.elementNom}</strong> est posé dans le contour de «&nbsp;
              {proposition.zoneNom}&nbsp;», mais rangé dans «&nbsp;{proposition.zoneActuelleNom}&nbsp;».
              <button
                type="button"
                onClick={() =>
                  envoyer({
                    _action: "ranger",
                    elementId: proposition.elementId,
                    zoneId: proposition.zoneId,
                  })
                }
                disabled={fetcher.state !== "idle"}
              >
                Ranger dans {proposition.zoneNom}
              </button>
              <button type="button" className="bouton-discret" onClick={() => setProposition(null)}>
                Laisser dans {proposition.zoneActuelleNom}
              </button>
            </p>
          )}

          <VuePlan
            imageUrl={liens.image(choisi.imageFichierId, "pleine")}
            points={points}
            polygones={polygones}
            liens={liens}
            // Exclusifs : pendant un tracé, le clic pose un sommet et non un objet.
            placement={tracage ? null : placement}
            tracage={
              tracage && {
                zoneNom: tracage.zoneNom,
                sommets: tracage.sommets,
                onSommet: (x, y) => setTracage((t) => t && { ...t, sommets: [...t.sommets, { x, y }] }),
                onDefaire: () => setTracage((t) => t && { ...t, sommets: t.sommets.slice(0, -1) }),
                onAbandonner: () => setTracage(null),
                onTerminer: () => {
                  envoyerContour({
                    _action: "tracer",
                    planId: choisi.id,
                    zoneId: tracage.zoneId,
                    sommets: JSON.stringify(tracage.sommets),
                  });
                  setTracage(null);
                },
              }
            }
            onPoser={(x, y) =>
              placement && envoyer({ _action: "poser", planId: choisi.id, elementId: placement.elementId, x, y })
            }
            onDeplacer={(pointId, x, y) => envoyer({ _action: "deplacer", pointId, x, y })}
            onRetirer={(pointId) => envoyer({ _action: "retirer", pointId })}
          />
        </>
      )}

      {placement && (
        <p className="resultats-vide">
          <Link to={liens.fiche(placement.elementId)}>Revenir à la fiche</Link>
        </p>
      )}

      {choisi.imageFichierId !== null && (
        <section className="plan-contours">
          <h2>Contours des zones</h2>
          {zonesTracables.length === 0 ? (
            <p className="resultats-vide">
              Aucune zone ne se rattache à ce plan. Un plan d'étage porte les zones de son niveau, un plan de
              situation porte les zones extérieures.
            </p>
          ) : (
            <>
              <p className="resultats-vide">
                Quelques clics par zone, sans mesure : le contour sert à repérer, jamais à coter. Un objet posé
                dedans fera <em>proposer</em> cette zone — vous gardez la main sur ce qui est rangé où.
              </p>
              <ul>
                {zonesTracables.map((z) => {
                  const trace = contourDe(z.id);
                  return (
                    <li key={z.id}>
                      <span>{z.nom}</span>
                      <span className="selecteur-secondaire">
                        {trace ? `${trace.sommets.length} points` : "sans contour"}
                      </span>
                      <button
                        type="button"
                        className="bouton-discret"
                        onClick={() => {
                          setProposition(null);
                          setTracage({ zoneId: z.id, zoneNom: z.nom, sommets: [] });
                        }}
                        disabled={contours.state !== "idle"}
                      >
                        {trace ? "Retracer" : "Tracer"}
                      </button>
                      {trace && (
                        <button
                          type="button"
                          className="bouton-discret"
                          onClick={() => envoyerContour({ _action: "effacer", planId: choisi.id, zoneId: z.id })}
                          disabled={contours.state !== "idle"}
                        >
                          Effacer
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {contours.data?.erreur && <p role="alert">{contours.data.erreur}</p>}
          {tracage && tracage.sommets.length < SOMMETS_MIN && (
            <p className="resultats-vide">
              Touchez le plan aux coins de «&nbsp;{tracage.zoneNom}&nbsp;» — {SOMMETS_MIN} points au minimum.
            </p>
          )}
        </section>
      )}

      <nav className="accueil-nav">
        <Link to={`${choisi.id}/modifier`}>Modifier ce plan</Link>
        <Link to="nouveau">Ajouter un plan</Link>
      </nav>
    </main>
  );
}
