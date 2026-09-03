// app/routes/_app/recherche.donnees.tsx
// Route de ressource : la recherche en JSON, appelée à la frappe depuis
// l'accueil (où l'on ne veut surtout pas naviguer, la grille de zones doit
// rester). L'écran de recherche, lui, passe par son propre loader : son URL
// est son état.
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { rechercher, PORTEE_PROPRIETAIRE } from "../../lib/recherche/recherche.server";
import { lireParamsRecherche } from "../../lib/recherche/params";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { q, facettes, decalage } = lireParamsRecherche(new URL(request.url).searchParams);

  const donnees = await rechercher({
    proprieteId: propriete.id,
    q,
    // Le propriétaire voit tout ; l'étape 3 passera ici la portée du partage.
    portee: PORTEE_PROPRIETAIRE,
    facettes,
    decalage,
  });

  return Response.json(donnees, {
    // Résultats d'une propriété privée : jamais en cache partagé.
    headers: { "Cache-Control": "private, no-store" },
  });
}
