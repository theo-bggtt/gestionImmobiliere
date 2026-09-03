// app/routes/_app/proprietes.$proprieteId._index.tsx
// L'accueil : un champ de recherche épinglé, puis la grille des zones en
// photo. Le champ ne navigue pas — il interroge la route de ressource et
// remplace la grille par ses résultats tant qu'on tape. Naviguer coûterait un
// chargement et ferait disparaître la grille pour un mot qu'on efface ensuite.
import { useEffect, useState } from "react";
import { Link, useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerZonesVignettes, PORTEE_PROPRIETAIRE } from "../../lib/recherche/recherche.server";
import type { ReponseRecherche, ZoneVignette } from "../../lib/recherche/types";
import { BarreRecherche, useAntiRebond } from "../../components/recherche/BarreRecherche";
import { ListeResultats } from "../../components/recherche/ListeResultats";
import { GrilleZones } from "../../components/recherche/GrilleZones";
import { liensPropriete } from "../../components/recherche/liens";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const zones = await chargerZonesVignettes(propriete.id, PORTEE_PROPRIETAIRE);
  return { propriete, zones };
}

export default function AccueilPropriete() {
  const { propriete, zones } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ReponseRecherche>();

  const [saisie, setSaisie] = useState("");
  const retardee = useAntiRebond(saisie, 150);
  const cherche = retardee.trim().length > 0;

  useEffect(() => {
    if (!cherche) return;
    fetcher.load(`/proprietes/${propriete.id}/recherche/donnees?q=${encodeURIComponent(retardee.trim())}`);
    // `fetcher` change d'identité à chaque rendu ; le relancer sur lui-même
    // enverrait une requête en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retardee, cherche, propriete.id]);

  return (
    <div className="page-accueil">
      <div className="recherche-epingle">
        <BarreRecherche valeur={saisie} onChange={setSaisie} />
      </div>

      {cherche ? (
        <>
          {fetcher.data ? (
            <ListeResultats
              liens={liensPropriete(propriete.id)}
              donnees={fetcher.data}
              enCours={fetcher.state === "loading"}
            />
          ) : (
            <p className="resultats-vide">Recherche…</p>
          )}
          <p className="accueil-lien-filtres">
            <Link to={`recherche?q=${encodeURIComponent(retardee.trim())}`}>Affiner avec les filtres</Link>
          </p>
        </>
      ) : (
        <Accueil proprieteId={propriete.id} zones={zones} proprieteNom={propriete.nom} />
      )}
    </div>
  );
}

function Accueil({
  proprieteId,
  proprieteNom,
  zones,
}: {
  proprieteId: number;
  proprieteNom: string;
  zones: ZoneVignette[];
}) {
  return (
    <section>
      <h1 className="accueil-titre">{proprieteNom}</h1>
      {zones.length === 0 ? (
        <>
          <p className="resultats-vide">Aucune zone pour l'instant.</p>
          {/* Le squelette d'abord : créer les zones une par une suppose d'avoir
              déjà un bâtiment et un niveau, ce qui est exactement le démarrage
              à froid que l'écran de démarrage supprime. */}
          <p className="accueil-demarrer">
            <Link to="demarrer">Composer une structure en quelques questions</Link>
          </p>
          <Link to="zones/nouveau">ou créer une zone à la main</Link>
        </>
      ) : (
        <GrilleZones zones={zones} liens={liensPropriete(proprieteId)} />
      )}

      <nav className="accueil-nav">
        <Link to="batiments">Bâtiments et niveaux</Link>
        <Link to="zones">Zones</Link>
        <Link to="systemes">Systèmes</Link>
        <Link to="elements">Éléments</Link>
        <Link to="plans">Plans</Link>
        <Link to="partages">Partages</Link>
      </nav>
    </section>
  );
}
