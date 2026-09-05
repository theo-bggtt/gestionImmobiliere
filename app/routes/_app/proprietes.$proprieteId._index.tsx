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
import { chargerEcheances } from "../../lib/historique/garanties.server";
import type { GarantieProprietaire } from "../../lib/historique/types";
import type { ReponseRecherche, ZoneVignette } from "../../lib/recherche/types";
import { BarreRecherche, useAntiRebond } from "../../components/recherche/BarreRecherche";
import { ListeResultats } from "../../components/recherche/ListeResultats";
import { GrilleZones } from "../../components/recherche/GrilleZones";
import { liensPropriete } from "../../components/recherche/liens";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const [zones, echeances] = await Promise.all([
    chargerZonesVignettes(propriete.id, PORTEE_PROPRIETAIRE),
    chargerEcheances(propriete.id),
  ]);
  return { propriete, zones, echeances };
}

export default function AccueilPropriete() {
  const { propriete, zones, echeances } = useLoaderData<typeof loader>();
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
        <Accueil
          proprieteId={propriete.id}
          zones={zones}
          proprieteNom={propriete.nom}
          echeances={echeances}
        />
      )}
    </div>
  );
}

function Accueil({
  proprieteId,
  proprieteNom,
  zones,
  echeances,
}: {
  proprieteId: number;
  proprieteNom: string;
  zones: ZoneVignette[];
  echeances: GarantieProprietaire[];
}) {
  return (
    <section>
      <h1 className="accueil-titre">{proprieteNom}</h1>

      <Echeances echeances={echeances} />
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
        <Link to="evenements">Historique</Link>
        <Link to="intervenants">Intervenants</Link>
        <Link to="partages">Partages</Link>
      </nav>
    </section>
  );
}

/**
 * Les échéances : tout ce que « rappels » veut dire à cette étape.
 *
 * Une liste qu'on regarde, pas une notification qui arrive — le projet n'a ni
 * mailer, ni file de travail, ni permission de notifier, et un vrai système de
 * rappels est une surface produit à lui seul. La perte est réelle et écrite
 * dans le README : sans ouvrir l'app, on n'apprend rien.
 *
 * Absente quand elle serait vide. Pas de « 0 échéance » : ce serait un score
 * de complétude déguisé, et la règle non négociable #2 l'interdit.
 *
 * Les expirées restent, en tête puisque le tri est croissant. Savoir qu'une
 * garantie a expiré est exactement ce qu'on vient chercher ici.
 */
function Echeances({ echeances }: { echeances: GarantieProprietaire[] }) {
  if (echeances.length === 0) return null;

  return (
    <section className="accueil-echeances">
      <h2>Échéances</h2>
      <ul>
        {echeances.map((g) => (
          <li key={g.id}>
            <Link to={`garanties/${g.id}/modifier`}>{g.fin}</Link>
            {g.expiree && <span className="garantie-expiree"> · expirée</span>}
            <span className="chrono-objet-zone">
              {" · "}
              <Link to={`elements/${g.elementId}/modifier`}>{g.elementNom}</Link>
              {" · "}
              {g.zoneNom}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
