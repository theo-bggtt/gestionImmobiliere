// app/routes/_vitrine/layout.tsx
// La charpente commune aux cinq pages publiques : en-tête, navigation, pied.
//
// C'est ici que vivent les trois choses qui valent pour tout l'arbre —
// `handle.sansScripts`, les en-têtes, et la feuille de style — pour qu'une
// page ajoutée demain les reçoive sans avoir à y penser. Une page qui
// oublierait `headers` recevrait quand même ceux que `server/application.js`
// pose sur les chemins de `CHEMINS_VITRINE` : les deux se recouvrent, et
// c'est voulu — la route décide, le serveur rattrape.
//
// AUCUN loader, ici comme ailleurs dans cet arbre. La navigation ne dépend
// pas de la session, et le lien « Mon espace » pointe sur la route protégée,
// qui redirige elle-même vers la connexion s'il n'y en a pas : le même lien
// marche pour le visiteur et pour le propriétaire. Une branche « si connecté »
// rendrait la page différente selon le lecteur, donc non cachable.
import { Link, NavLink, Outlet } from "react-router";
import type { LinksFunction } from "react-router";
import { ACCUEIL } from "../../lib/auth/redirection";
import { ENTETES_VITRINE, HANDLE_SANS_SCRIPTS } from "../../lib/vitrine/document";
import feuilleVitrine from "../../styles/vitrine.css?url";

// Servie par un `links` de route et non versée dans `app.css` : celle-ci part
// à tous les arbres, page de partage comprise, et un locataire venu voir où
// sont les prises n'a pas à télécharger une mise en page de page de vente.
export const links: LinksFunction = () => [{ rel: "stylesheet", href: feuilleVitrine }];

export const handle = HANDLE_SANS_SCRIPTS;
export const headers = () => ENTETES_VITRINE;

export default function VitrineLayout() {
  return (
    <>
      <header className="v-tete">
        <Link to="/" className="v-marque">
          gestionImmobiliere
        </Link>
        <nav className="v-nav">
          <NavLink to="/fonctionnalites">Ce que ça fait</NavLink>
          <NavLink to="/partage">Partager</NavLink>
          <NavLink to="/confidentialite">Vos données</NavLink>
          <NavLink to="/a-propos">À propos</NavLink>
        </nav>
        {/* Vers la route protégée, jamais vers `/connexion` : elle redirige
            déjà avec un `?depuis=`, donc ce lien mène le visiteur à la
            connexion et le propriétaire connecté chez lui. */}
        <Link to={ACCUEIL} className="v-espace">
          Mon espace
        </Link>
      </header>

      <main className="v-corps">
        <Outlet />
      </main>

      <footer className="v-pied">
        <div className="v-pied-int">
          <div className="v-pied-liens">
            <Link to="/fonctionnalites">Ce que ça fait</Link>
            <Link to="/partage">Partager</Link>
            <Link to="/confidentialite">Vos données</Link>
            <Link to="/a-propos">À propos</Link>
          </div>
          <p>Né dans une vraie maison. Construit pour la vôtre.</p>
        </div>
      </footer>
    </>
  );
}
