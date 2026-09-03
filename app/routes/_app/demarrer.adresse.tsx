// app/routes/_app/demarrer.adresse.tsx
// Route de ressource : l'écran de démarrage cherche une adresse sans naviguer,
// pour ne pas perdre les réponses déjà données.
//
// L'appel au registre se fait ICI, côté serveur. Le RegBL rend `egrid` et
// `lparz` (le numéro de parcelle) ; ce qui redescend est construit par
// `chercherBatiments` et n'en contient rien. L'adresse saisie n'est ni
// journalisée ni écrite : elle sert à l'appel, puis disparaît avec la requête.
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chercherBatiments } from "../../lib/demarrage/regbl.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  // Scopé comme toute route authentifiée, même sans rien lire de la propriété :
  // c'est le propriétaire qui a le droit d'interroger, pas n'importe quel compte.
  await requireProprieteAccess(utilisateurId, params.proprieteId);

  const q = new URL(request.url).searchParams.get("q") ?? "";
  return await chercherBatiments(q);
}
