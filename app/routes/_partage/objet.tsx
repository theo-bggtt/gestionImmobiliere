// app/routes/_partage/objet.tsx
// `/p/:jeton/objets/:elementId` — une fiche, ses photos, et seulement les
// champs dont le `niveauMin` tient sous le plafond du partage.
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { chargerPartageParJeton } from "../../lib/partage/partage.server";
import { chargerFichePartage } from "../../lib/partage/contenu.server";
import { ENTETES_PARTAGE, HANDLE_SANS_SCRIPTS, META_PARTAGE } from "../../lib/partage/document";
import { FicheObjet } from "../../components/partage/FicheObjet";
import { PartageInactif } from "../../components/partage/PagePartage";

export const handle = HANDLE_SANS_SCRIPTS;
export const meta: MetaFunction = () => META_PARTAGE;
export const headers = () => ENTETES_PARTAGE;

export async function loader({ params }: LoaderFunctionArgs) {
  const etat = await chargerPartageParJeton(params.jeton);
  const jeton = params.jeton!;
  if (etat.statut === "inactif") return { actif: false as const, jeton };

  // Une fiche hors portée lève 404 ici même : jamais 403, qui confirmerait
  // qu'elle existe.
  const fiche = await chargerFichePartage(etat.partage, etat.proprieteNom, params.elementId);
  return { actif: true as const, jeton, fiche };
}

export default function EcranObjetPartage() {
  const d = useLoaderData<typeof loader>();
  if (!d.actif) return <PartageInactif />;
  return <FicheObjet fiche={d.fiche} jeton={d.jeton} />;
}
