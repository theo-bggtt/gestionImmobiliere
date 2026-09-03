// app/routes/_app/partages.$partageId.apercu.tsx
// « Voici exactement ce que verra le destinataire. »
//
// Cet écran ne dessine rien : il appelle `chargerContenuPartage`, le loader
// réel de `/p/:jeton`, avec la ligne `partage` réelle, et rend `PagePartage`,
// le composant réel. Un aperçu qui reconstruirait l'écran à sa façon finirait
// par diverger de la vraie page, et c'est le jour de cette divergence qu'on
// enverrait le mauvais lien. `tests/partage/apercu.test.ts` compare les
// données des deux loaders plutôt que de croire ce commentaire.
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { partage } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerRessourceOu404 } from "../../lib/db/scopedResource.server";
import { chargerContenuPartage } from "../../lib/partage/contenu.server";
import { partageActif } from "../../lib/partage/partage.server";
import { libelleNiveau } from "../../lib/partage/niveaux";
import { PagePartage, PartageInactif } from "../../components/partage/PagePartage";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const p = await chargerRessourceOu404(
    partage,
    and(eq(partage.id, Number(params.partageId)), eq(partage.proprieteId, propriete.id)),
    "Partage introuvable",
  );

  const donnees = await chargerContenuPartage(p, propriete.nom, new URL(request.url));
  return {
    donnees,
    retour: `/proprietes/${propriete.id}/partages`,
    jeton: p.jeton,
    partageNom: p.nom,
    plafond: libelleNiveau(p.niveauMax),
    actif: partageActif(p),
  };
}

export default function EcranApercu() {
  const { donnees, retour, jeton, partageNom, plafond, actif } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="apercu-bandeau">
        <strong>Prévisualisation</strong> — « {partageNom} », jusqu'au niveau {plafond}.
        {!actif && " Ce lien n'est plus actif : le destinataire voit la page ci-dessous."}
        <Link to={retour}>Retour aux partages</Link>
      </div>

      {actif ? <PagePartage donnees={donnees} jeton={jeton} /> : <PartageInactif />}
    </div>
  );
}
