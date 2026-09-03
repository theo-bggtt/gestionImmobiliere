// app/routes/_app/capture.donnees.tsx
// Route de ressource : l'instantané que le client recopie dans IndexedDB pour
// que la feuille de capture s'ouvre pré-remplie même sans réseau.
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerInstantaneCapture } from "../../lib/capture/instantane.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const instantane = await chargerInstantaneCapture(propriete.id, propriete.nom);

  return Response.json(instantane, {
    // Jamais en cache partagé : l'instantané décrit une propriété privée.
    headers: { "Cache-Control": "private, no-store" },
  });
}
