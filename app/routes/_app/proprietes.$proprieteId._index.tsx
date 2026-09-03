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
import type { ReponseRecherche } from "../../lib/recherche/types";
import { BarreRecherche, useAntiRebond } from "../../components/recherche/BarreRecherche";
import { ListeResultats } from "../../components/recherche/ListeResultats";

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
              proprieteId={propriete.id}
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
        <GrilleZones proprieteId={propriete.id} zones={zones} proprieteNom={propriete.nom} />
      )}
    </div>
  );
}

function GrilleZones({
  proprieteId,
  proprieteNom,
  zones,
}: {
  proprieteId: number;
  proprieteNom: string;
  zones: Awaited<ReturnType<typeof chargerZonesVignettes>>;
}) {
  if (zones.length === 0) {
    return (
      <section>
        <h1>{proprieteNom}</h1>
        <p className="resultats-vide">Aucune zone pour l'instant.</p>
        <Link to="zones/nouveau">Créer une zone</Link>
      </section>
    );
  }

  return (
    <section>
      <h1 className="accueil-titre">{proprieteNom}</h1>
      <ul className="grille-zones">
        {zones.map((z) => (
          <li key={z.id}>
            {/* Une case de zone mène à la recherche facettée sur cette zone :
                c'est déjà l'écran qui sait lister, filtrer et compter. */}
            <Link to={`recherche?zone=${z.id}`} className="case-zone">
              {z.fichierId ? (
                <img
                  className="case-zone-image"
                  src={`/proprietes/${proprieteId}/fichiers/${z.fichierId}?taille=vignette`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                // Pas de photo n'est pas une case vide : un aplat lisible avec
                // l'initiale, jamais une image cassée.
                <span className="case-zone-image case-zone-aplat" aria-hidden="true">
                  {z.nom.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="case-zone-texte">
                <span className="case-zone-nom">{z.nom}</span>
                <span className="case-zone-compte">
                  {z.nombre} objet{z.nombre > 1 ? "s" : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <nav className="accueil-nav">
        <Link to="batiments">Bâtiments et niveaux</Link>
        <Link to="zones">Zones</Link>
        <Link to="systemes">Systèmes</Link>
        <Link to="elements">Éléments</Link>
      </nav>
    </section>
  );
}
