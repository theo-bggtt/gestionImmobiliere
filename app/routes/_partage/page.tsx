// app/routes/_partage/page.tsx
// `/p/:jeton` — la page qu'ouvre le destinataire, depuis WhatsApp, sans
// compte et sans rien installer. Hors de l'arbre protégé : ni session, ni
// service worker, ni code de la PWA (règle non négociable #7 de l'étape).
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { chargerPartageParJeton } from "../../lib/partage/partage.server";
import { chargerContenuPartage } from "../../lib/partage/contenu.server";
import { ENTETES_PARTAGE, HANDLE_SANS_SCRIPTS, META_PARTAGE } from "../../lib/partage/document";
import { PagePartage, PartageInactif } from "../../components/partage/PagePartage";

export const handle = HANDLE_SANS_SCRIPTS;
export const meta: MetaFunction = () => META_PARTAGE;
export const headers = () => ENTETES_PARTAGE;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const etat = await chargerPartageParJeton(params.jeton);
  const jeton = params.jeton!;
  if (etat.statut === "inactif") return { actif: false as const, jeton };

  const donnees = await chargerContenuPartage(etat.partage, etat.proprieteNom, new URL(request.url));
  return { actif: true as const, jeton, donnees };
}

export default function EcranPartage() {
  const d = useLoaderData<typeof loader>();
  if (!d.actif) return <PartageInactif />;
  return <PagePartage donnees={d.donnees} jeton={d.jeton} />;
}
