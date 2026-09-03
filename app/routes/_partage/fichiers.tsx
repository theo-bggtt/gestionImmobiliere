// app/routes/_partage/fichiers.tsx
// `/p/:jeton/fichiers/:fichierId` — la route `fichiers` de l'application est
// authentifiée par session et ne peut pas servir un visiteur anonyme. Celle-ci
// est portée par le jeton : le droit de lire l'octet vient de la fiche à
// laquelle l'image est rattachée, qui doit passer le filtre du partage.
//
// L'EXIF a déjà été appliqué puis effacé au téléversement (étape 1, vérifié
// sur les octets par `tests/images/traitement.test.ts`) : il n'y a rien à
// refaire ici, et le refaire à la lecture coûterait un décodage par requête.
import type { LoaderFunctionArgs } from "react-router";
import { chargerPartageParJeton } from "../../lib/partage/partage.server";
import { chargerFichierPartage } from "../../lib/partage/contenu.server";
import { ENTETES_PARTAGE } from "../../lib/partage/document";
import { lireTaille } from "../../lib/stockage/fichiers.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const etat = await chargerPartageParJeton(params.jeton);
  // Un lien expiré ou révoqué ne sert plus d'image : la page neutre n'en
  // affiche aucune, et une URL d'image gardée de côté ne doit pas survivre au
  // lien qui l'a autorisée.
  if (etat.statut === "inactif") throw new Response("Introuvable", { status: 404 });

  const f = await chargerFichierPartage(etat.partage, params.fichierId);

  let contenu: Buffer;
  try {
    contenu = await lireTaille(f.chemin, new URL(request.url).searchParams.get("taille"));
  } catch {
    throw new Response("Introuvable", { status: 404 });
  }

  return new Response(new Uint8Array(contenu), {
    headers: {
      "Content-Type": f.typeMime,
      "Content-Length": String(contenu.byteLength),
      ...ENTETES_PARTAGE,
      // Le contenu d'un identifiant ne change jamais, mais le droit de le lire
      // se révoque : cinq minutes, et jamais dans un cache partagé.
      "Cache-Control": "private, max-age=300",
    },
  });
}
