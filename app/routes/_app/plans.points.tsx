// app/routes/_app/plans.points.tsx
// Route de ressource : poser, déplacer et retirer un point. Séparée de
// l'écran pour que la vue interactive enregistre un glissement sans naviguer
// — recharger la page à chaque point déplacé perdrait le zoom et la position.
import type { ActionFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { deplacerPoint, poserPoint, retirerPoint } from "../../lib/plans/plans.server";
import { estPourcentage } from "../../lib/plans/types";

const erreur = (message: string, status = 400) => Response.json({ erreur: message }, { status });

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return erreur("Méthode non autorisée.", 405);

  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  if (form.get("_action") === "retirer") {
    await retirerPoint(propriete.id, Number(form.get("pointId")));
    return Response.json({ ok: true });
  }

  // La borne est garantie par la contrainte `point_x_valide` en base ; ici
  // c'est pour rendre un message plutôt qu'une erreur de contrainte.
  const x = Number(form.get("x"));
  const y = Number(form.get("y"));
  if (!estPourcentage(x) || !estPourcentage(y)) return erreur("Position hors du plan.");

  if (form.get("_action") === "deplacer") {
    await deplacerPoint(propriete.id, Number(form.get("pointId")), x, y);
    return Response.json({ ok: true });
  }

  const pointId = await poserPoint(
    propriete.id,
    Number(form.get("planId")),
    Number(form.get("elementId")),
    x,
    y,
  );
  return Response.json({ ok: true, pointId });
}
