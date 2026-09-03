// app/routes/_app/intervenants._index.tsx
// Le carnet d'artisans. Téléphone et e-mail s'affichent ici, et nulle part
// ailleurs : c'est l'écran du propriétaire, derrière sa session.
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerIntervenants } from "../../lib/historique/intervenants.server";
import { libelleNiveau } from "../../lib/partage/niveaux";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  return { propriete, intervenants: await chargerIntervenants(propriete.id) };
}

export default function ListeIntervenants() {
  const { propriete, intervenants } = useLoaderData<typeof loader>();
  const base = `/proprietes/${propriete.id}`;

  return (
    <main>
      <h1>Intervenants — {propriete.nom}</h1>
      <p className="accueil-lien-filtres">
        <Link to={`${base}/intervenants/nouveau`}>Ajouter un intervenant</Link>
        {" · "}
        <Link to={`${base}/evenements`}>Historique</Link>
      </p>

      {intervenants.length === 0 ? (
        <p className="resultats-vide">
          Personne pour l'instant. Le plombier qui a posé la chaudière est un bon premier.
        </p>
      ) : (
        <ul className="liste-intervenants">
          {intervenants.map((i) => (
            <li key={i.id}>
              <p className="chrono-titre">
                <Link to={`${base}/intervenants/${i.id}/modifier`}>{i.nom}</Link>
              </p>
              <p className="resultat-lieu">
                {[i.metier, i.tel, i.email].filter(Boolean).join(" · ")}
              </p>
              <p className="resultat-lieu">
                Visibilité : {libelleNiveau(i.niveau)}
                {" · "}
                {i.nbEvenements === 0
                  ? "cité par aucun événement"
                  : `cité par ${i.nbEvenements} événement${i.nbEvenements > 1 ? "s" : ""}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
