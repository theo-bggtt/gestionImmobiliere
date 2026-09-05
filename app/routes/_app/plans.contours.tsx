// app/routes/_app/plans.contours.tsx
// Route de ressource : enregistrer ou effacer le contour d'une zone sur un
// plan. Séparée de l'écran pour la même raison que `plans/points` — le tracé
// se termine sans navigation, sinon le zoom et la position de la vue seraient
// perdus au moment précis où l'on veut vérifier ce qu'on vient de tracer.
//
// Séparée de `plans/points` aussi, et pas par symétrie : ce qui s'écrit ici
// est `zone_geom`, ce qui s'écrit là-bas est `point`. Une seule route pour les
// deux mélangerait le contour d'une zone et la position d'un objet, qui n'ont
// ni la même durée de vie ni le même auteur.
import type { ActionFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { effacerContour, enregistrerContour } from "../../lib/plans/plans.server";
import { lireContour, SOMMETS_MAX, SOMMETS_MIN } from "../../lib/plans/geometrie";

const erreur = (message: string, status = 400) => Response.json({ erreur: message }, { status });

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return erreur("Méthode non autorisée.", 405);

  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const planId = Number(form.get("planId"));
  const zoneId = Number(form.get("zoneId"));

  if (form.get("_action") === "effacer") {
    await effacerContour(propriete.id, planId, zoneId);
    return Response.json({ ok: true });
  }

  let brut: unknown = null;
  try {
    brut = JSON.parse(String(form.get("sommets") ?? "null"));
  } catch {
    brut = null;
  }

  // La forme et les bornes sont garanties par `zone_geom_contour_valide` en
  // base (migration 0009) ; ce garde-ci ne fait que rendre un message au lieu
  // d'une erreur de contrainte, comme `estPourcentage` pour un point.
  const sommets = lireContour(brut);
  if (!sommets) return erreur(`Un contour tient entre ${SOMMETS_MIN} et ${SOMMETS_MAX} points, tous dans le plan.`);

  await enregistrerContour(propriete.id, planId, zoneId, sommets);
  return Response.json({ ok: true });
}
