// app/routes/_partage/evenement.tsx
// `/p/:jeton/evenements/:evenementId` — un événement, si et seulement s'il
// passe `clauseEvenementVisible` : son propre niveau sous le plafond, au moins
// un objet lié, et TOUS ses objets liés dans la portée.
//
// Filtré = 404, jamais 403. Un 403 confirmerait que l'événement existe, ce qui
// est déjà l'essentiel de ce qu'un titre apprendrait.
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { chargerPartageParJeton } from "../../lib/partage/partage.server";
import { chargerEvenementPartage } from "../../lib/partage/contenu.server";
import { ENTETES_PARTAGE, HANDLE_SANS_SCRIPTS, META_PARTAGE } from "../../lib/partage/document";
import { FicheEvenement } from "../../components/partage/FicheEvenement";
import { PartageInactif } from "../../components/partage/PagePartage";

export const handle = HANDLE_SANS_SCRIPTS;
export const meta: MetaFunction = () => META_PARTAGE;
export const headers = () => ENTETES_PARTAGE;

export async function loader({ params }: LoaderFunctionArgs) {
  const etat = await chargerPartageParJeton(params.jeton);
  const jeton = params.jeton!;
  if (etat.statut === "inactif") return { actif: false as const, jeton };

  const evenement = await chargerEvenementPartage(etat.partage, etat.proprieteNom, params.evenementId);
  return { actif: true as const, jeton, evenement };
}

export default function EcranEvenementPartage() {
  const d = useLoaderData<typeof loader>();
  if (!d.actif) return <PartageInactif />;
  return <FicheEvenement evenement={d.evenement} jeton={d.jeton} />;
}
