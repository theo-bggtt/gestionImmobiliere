// app/routes/_app/plans.points.tsx
// Route de ressource : poser, déplacer et retirer un point. Séparée de
// l'écran pour que la vue interactive enregistre un glissement sans naviguer
// — recharger la page à chaque point déplacé perdrait le zoom et la position.
//
// Depuis l'étape 6, elle rend aussi ce que la géométrie PROPOSE : quand le
// point tombe dans le contour d'une zone qui n'est pas celle de l'objet, la
// réponse porte une proposition, et rien n'est écrit. L'acceptation est
// `_action: "ranger"`, un second aller-retour, déclenché par un bouton.
//
// Pourquoi « ranger » vit ici et non dans `plans/contours` : la proposition
// naît de la pose d'un point, l'accepter est la seconde moitié du même geste,
// et l'écran n'a qu'un fetcher — la bannière apparaît et disparaît donc avec
// l'état de cette requête-là. Ce qui s'écrit reste `element.zone_id`, pas
// `zone_geom`.
import type { ActionFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  deduireZonePourPoint,
  deplacerPoint,
  poserPoint,
  rangerElementDansZone,
  retirerPoint,
} from "../../lib/plans/plans.server";
import { estPourcentage } from "../../lib/plans/types";

const erreur = (message: string, status = 400) => Response.json({ erreur: message }, { status });

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return erreur("Méthode non autorisée.", 405);

  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  if (form.get("_action") === "retirer") {
    await retirerPoint(propriete.id, Number(form.get("pointId")));
    // `proposition: null` explicitement : l'écran efface sa bannière sur toute
    // réponse qui porte la clé, et retirer le point qui l'a produite doit
    // l'effacer — proposer de ranger un objet qui n'est plus sur le plan
    // serait une proposition qui a perdu son sujet.
    return Response.json({ ok: true, proposition: null });
  }

  // Le seul chemin qui écrit `element.zone_id`, et il demande un geste : la
  // géométrie propose, elle ne décide pas (règle non négociable #1 — cette
  // colonne est ce que lit le filtre de partage).
  if (form.get("_action") === "ranger") {
    await rangerElementDansZone(propriete.id, Number(form.get("elementId")), Number(form.get("zoneId")));
    return Response.json({ ok: true, range: true });
  }

  // La borne est garantie par la contrainte `point_x_valide` en base ; ici
  // c'est pour rendre un message plutôt qu'une erreur de contrainte.
  const x = Number(form.get("x"));
  const y = Number(form.get("y"));
  if (!estPourcentage(x) || !estPourcentage(y)) return erreur("Position hors du plan.");

  if (form.get("_action") === "deplacer") {
    const { planId, elementId } = await deplacerPoint(propriete.id, Number(form.get("pointId")), x, y);
    return Response.json({
      ok: true,
      proposition: await deduireZonePourPoint(propriete.id, planId, elementId, x, y),
    });
  }

  const planId = Number(form.get("planId"));
  const elementId = Number(form.get("elementId"));
  const pointId = await poserPoint(propriete.id, planId, elementId, x, y);
  return Response.json({
    ok: true,
    pointId,
    proposition: await deduireZonePourPoint(propriete.id, planId, elementId, x, y),
  });
}
