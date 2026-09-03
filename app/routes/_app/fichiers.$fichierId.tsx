// app/routes/_app/fichiers.$fichierId.tsx
// Les images ne sont jamais servies depuis un chemin public devinable : elles
// passent par cette route, scopée propriété comme le reste de `_app`.
import type { LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { fichier } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerRessourceOu404 } from "../../lib/db/scopedResource.server";
import { cheminVignette, lire } from "../../lib/stockage/fichiers.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const f = await chargerRessourceOu404(
    fichier,
    and(eq(fichier.id, Number(params.fichierId)), eq(fichier.proprieteId, propriete.id)),
    "Fichier introuvable",
  );

  const vignette = new URL(request.url).searchParams.get("taille") === "vignette";

  let contenu: Buffer;
  try {
    contenu = await lire(vignette ? cheminVignette(f.chemin) : f.chemin);
  } catch {
    throw new Response("Fichier introuvable", { status: 404 });
  }

  return new Response(new Uint8Array(contenu), {
    headers: {
      "Content-Type": f.typeMime,
      "Content-Length": String(contenu.byteLength),
      // Le contenu d'un id ne change jamais ; `private` parce qu'il n'est
      // lisible que par le propriétaire connecté.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
