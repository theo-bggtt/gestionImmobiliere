// app/routes/_partage/historique.tsx
// `/p/:jeton/historique` — la chronologie du bien, filtrée par la portée du
// lien. Comme les autres routes de cet arbre : pas de session, pas de PWA, et
// `handle.sansScripts` fait que `root.tsx` n'émet aucun `<Scripts />`.
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { chargerPartageParJeton } from "../../lib/partage/partage.server";
import { chargerHistoriquePartage } from "../../lib/partage/contenu.server";
import { ENTETES_PARTAGE, HANDLE_SANS_SCRIPTS, META_PARTAGE } from "../../lib/partage/document";
import { PageHistorique } from "../../components/partage/PageHistorique";
import { PartageInactif } from "../../components/partage/PagePartage";

export const handle = HANDLE_SANS_SCRIPTS;
export const meta: MetaFunction = () => META_PARTAGE;
export const headers = () => ENTETES_PARTAGE;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const etat = await chargerPartageParJeton(params.jeton);
  const jeton = params.jeton!;
  if (etat.statut === "inactif") return { actif: false as const, jeton };

  const historique = await chargerHistoriquePartage(etat.partage, etat.proprieteNom, new URL(request.url));
  return { actif: true as const, jeton, historique };
}

export default function EcranHistoriquePartage() {
  const d = useLoaderData<typeof loader>();
  if (!d.actif) return <PartageInactif />;
  return <PageHistorique historique={d.historique} jeton={d.jeton} />;
}
