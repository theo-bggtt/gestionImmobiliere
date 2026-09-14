// app/routes/_app/layout.tsx
import { useEffect, useRef, useState } from "react";
import { Outlet, Link, useLoaderData, useLocation, useRevalidator } from "react-router";
import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { db } from "../../db/client";
import { propriete, utilisateur } from "../../db/schema/index";
import { Capture } from "../../components/capture/Capture";
import { IndicateurFile } from "../../components/capture/IndicateurFile";
import { AideInstallationIOS } from "../../components/AideInstallationIOS";
import { rafraichirInstantane } from "../../lib/capture/instantane";
import { prechargerCoquille, retirerAnciennesVersions } from "../../lib/capture/coquille";
import { ACCUEIL } from "../../lib/auth/redirection";
import { demarrerSynchro, souscrire } from "../../lib/capture/synchro";

// La PWA vit ici, et pas dans `root.tsx` : la page de partage est servie par
// le même document racine, et un manifeste y proposerait d'installer une
// application à qui n'a reçu qu'un lien de consultation.
export const links: LinksFunction = () => [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/icones/icone-180.png" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const [moi] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurId));
  // Les déclencheurs de capture vivent dans le layout pour être à un geste de
  // n'importe quel écran, y compris la racine : il leur faut donc savoir sur
  // quelle propriété capturer avant même d'entrer dedans.
  const proprietes = await db
    .select({ id: propriete.id, nom: propriete.nom })
    .from(propriete)
    .where(eq(propriete.proprietaireId, utilisateurId));
  return { email: moi.email, proprietes };
}

export default function AppLayout() {
  const { email, proprietes } = useLoaderData<typeof loader>();
  const location = useLocation();
  const revalidator = useRevalidator();

  const dansUrl = Number(location.pathname.match(/^\/proprietes\/(\d+)/)?.[1]);
  const [memorisee, setMemorisee] = useState<number | null>(null);

  useEffect(() => {
    setMemorisee(Number(localStorage.getItem("dernierePropriete")) || null);
  }, []);

  useEffect(() => {
    if (dansUrl) localStorage.setItem("dernierePropriete", String(dansUrl));
  }, [dansUrl]);

  const connues = new Set(proprietes.map((p) => p.id));
  const proprieteId =
    (connues.has(dansUrl) ? dansUrl : null) ??
    (memorisee !== null && connues.has(memorisee) ? memorisee : null) ??
    (proprietes.length === 1 ? proprietes[0].id : null);

  useEffect(() => {
    if (proprieteId !== null) void rafraichirInstantane(proprieteId);
  }, [proprieteId]);

  useEffect(() => demarrerSynchro(), []);

  useEffect(() => {
    void prechargerCoquille();
  }, []);

  useEffect(() => {
    // Jamais en développement : Vite sert des centaines de modules non
    // versionnés, les mettre en cache rendrait le rechargement à chaud faux.
    // Enregistré depuis ce layout et non depuis `root.tsx`, pour qu'une page
    // hors de l'arbre protégé ne puisse structurellement pas l'installer.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      // La portée : un worker servi depuis `/sw.js` a le droit d'en prendre
      // une plus étroite que son propre chemin, l'inverse est refusé. Sans
      // `scope`, elle vaudrait `/` — le service worker contrôlerait la
      // vitrine publique et les pages de partage, qu'il mettrait en cache au
      // passage alors qu'elles sont servies en `no-store`.
      //
      // SANS barre oblique finale, et ce n'est pas une étourderie : la
      // correspondance des portées est un préfixe de CHAÎNE, pas de segments
      // de chemin. `/proprietes/` ne contrôlerait pas `/proprietes`, c'est-à-
      // dire précisément le `start_url`, et l'app ne démarrerait plus hors
      // ligne. Le revers — `/proprietes-autre` tomberait dans la portée — est
      // sans objet : `tests/pwa/coquille.test.ts` vérifie qu'aucune route
      // hors de l'arbre applicatif ne commence par ce préfixe.
      navigator.serviceWorker
        .register("/sw.js", { scope: ACCUEIL })
        // Le ménage APRÈS coup, pour ne rien retirer si la nouvelle
        // inscription n'a pas pu être posée. Voir `retirerAnciennesVersions` :
        // une inscription est identifiée par sa portée, donc celle de la
        // racine survivrait à ce déplacement sans ce retrait.
        .then(() => retirerAnciennesVersions())
        .catch(() => {
          // Pas de service worker (contexte non sécurisé, réglage navigateur) :
          // l'app fonctionne, elle ne démarre simplement pas hors ligne.
        });
    }
  }, []);

  // Une capture partie pendant qu'un écran est ouvert doit y apparaître.
  const envoyes = useRef(0);
  useEffect(
    () =>
      souscrire((e) => {
        if (e.envoyes !== envoyes.current) {
          envoyes.current = e.envoyes;
          revalidator.revalidate();
        }
      }),
    [revalidator],
  );

  return (
    <div className="app">
      <header className="app-tete">
        {/* `/` est la vitrine publique : la marque ramène le propriétaire
            connecté chez lui, pas sur la page qui explique le produit. */}
        <Link to={ACCUEIL} className="app-marque">
          gestionImmobiliere
        </Link>
        <IndicateurFile />
        <span className="app-compte">{email}</span>
        <form method="post" action="/deconnexion">
          <button type="submit" className="bouton-discret">
            Déconnexion
          </button>
        </form>
      </header>

      <main className="app-corps">
        <Outlet />
      </main>

      {proprieteId !== null && (
        <div className="capture-barre">
          <Capture proprieteId={proprieteId} mode="nouveau" className="capture-declencheur capture-principal">
            Nouvel objet
          </Capture>
          <Capture proprieteId={proprieteId} mode="existant" className="capture-declencheur capture-secondaire">
            Objet existant
          </Capture>
        </div>
      )}

      <AideInstallationIOS />
    </div>
  );
}
