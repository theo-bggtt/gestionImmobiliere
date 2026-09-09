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

/**
 * Exécute une écriture et RENVOIE ses 404 au lieu de les relancer.
 *
 * Une `Response` lancée depuis l'action d'un fetcher ne devient pas
 * `fetcher.data` : elle remonte à la frontière d'erreur et remplace la page
 * entière — mesuré au navigateur, on obtient un « 404 » nu. Elle emporte donc
 * avec le composant le tracé en cours, qui vit dedans, et aucune précaution
 * côté écran ne peut le rattraper. Rendue, elle arrive dans `fetcher.data`,
 * l'écran affiche son message et les clics restent à l'écran.
 *
 * Le code reste 404 sur le fil, et le message ne dépend pas du motif : la
 * règle #4 porte sur ce que la réponse APPREND — « n'existe pas » et « n'est
 * pas à vous » restent indiscernables — pas sur la façon dont le routeur la
 * transporte. Ce qui n'est pas une `Response` continue de remonter.
 */
async function rendreLes404<T>(travail: () => Promise<T>) {
  try {
    return { valeur: await travail(), refus: null };
  } catch (e) {
    if (!(e instanceof Response)) throw e;
    return { valeur: null, refus: erreur(await e.text(), e.status) };
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return erreur("Méthode non autorisée.", 405);

  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const planId = Number(form.get("planId"));
  const zoneId = Number(form.get("zoneId"));

  if (form.get("_action") === "effacer") {
    const { refus } = await rendreLes404(() => effacerContour(propriete.id, planId, zoneId));
    return refus ?? Response.json({ ok: true });
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

  const { refus } = await rendreLes404(() => enregistrerContour(propriete.id, planId, zoneId, sommets));
  return refus ?? Response.json({ ok: true });
}
