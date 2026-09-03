// app/routes/_app/recherche.tsx
// L'écran de recherche. Son URL EST son état : texte et facettes y sont
// écrits, donc un résultat se partage, se met en favori, et le retour arrière
// fonctionne. Conséquence assumée : c'est le loader qui fournit les données,
// pas un fetcher — une seule source, pas deux vues à réconcilier.
import { useEffect, useState } from "react";
import { useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerFacettes, rechercher, PORTEE_PROPRIETAIRE } from "../../lib/recherche/recherche.server";
import { ecrireParamsRecherche, lireParamsRecherche, rechercheActive } from "../../lib/recherche/params";
import type { FacettesActives } from "../../lib/recherche/types";
import { BarreRecherche, useAntiRebond } from "../../components/recherche/BarreRecherche";
import { ListeResultats } from "../../components/recherche/ListeResultats";
import { PastillesFacettes } from "../../components/recherche/PastillesFacettes";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { q, facettes, decalage } = lireParamsRecherche(new URL(request.url).searchParams);

  const [donnees, facettesDisponibles] = await Promise.all([
    rechercher({ proprieteId: propriete.id, q, portee: PORTEE_PROPRIETAIRE, facettes, decalage }),
    chargerFacettes(propriete.id, PORTEE_PROPRIETAIRE),
  ]);

  return { propriete, donnees, facettesDisponibles, facettes };
}

export default function EcranRecherche() {
  const { propriete, donnees, facettesDisponibles, facettes } = useLoaderData<typeof loader>();
  const [paramsUrl, setSearchParams] = useSearchParams();
  const navigation = useNavigation();

  // Le champ reste piloté localement pour rester fluide sous le doigt ; c'est
  // la valeur anti-rebondie qui part dans l'URL et déclenche le loader.
  const [saisie, setSaisie] = useState(donnees.q);
  const retardee = useAntiRebond(saisie, 150);
  const [choisies, setChoisies] = useState<FacettesActives>(facettes);

  useEffect(() => {
    const cible = ecrireParamsRecherche(retardee, choisies).toString();
    // Sans cette comparaison, l'arrivée sur la page relancerait le loader
    // pour aboutir exactement à la même URL.
    if (cible === paramsUrl.toString()) return;
    setSearchParams(
      new URLSearchParams(cible),
      // `replace` : trente frappes ne doivent pas remplir l'historique.
      { replace: true, preventScrollReset: true },
    );
  }, [retardee, choisies, paramsUrl, setSearchParams]);

  const basculer = (dimension: keyof FacettesActives, id: number) =>
    setChoisies((f) => ({
      ...f,
      [dimension]: f[dimension].includes(id) ? f[dimension].filter((x) => x !== id) : [...f[dimension], id],
    }));

  const actif = rechercheActive(saisie, choisies);

  return (
    <div className="page-recherche">
      <div className="recherche-epingle">
        <BarreRecherche valeur={saisie} onChange={setSaisie} autoFocus />
      </div>

      <PastillesFacettes
        disponibles={facettesDisponibles}
        actives={choisies}
        onBasculer={basculer}
        onToutEffacer={() => setChoisies({ zones: [], systemes: [], types: [] })}
      />

      {actif ? (
        <ListeResultats
          proprieteId={propriete.id}
          donnees={donnees}
          enCours={navigation.state === "loading"}
        />
      ) : (
        <p className="resultats-vide">
          Tapez un mot, ou cochez un filtre. La recherche cherche aussi dans les alias : « robinet » trouve une
          vanne d'arrêt.
        </p>
      )}
    </div>
  );
}
