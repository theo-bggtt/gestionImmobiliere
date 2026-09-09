import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches, useRouteError, useRouteLoaderData } from "react-router";
import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { documentSansScripts } from "./lib/partage/document";
import { PageErreur, decrireErreur } from "./components/PageErreur";
import feuilleDeStyle from "./styles/app.css?url";

// Le manifeste et l'enregistrement du service worker ont quitté ce fichier
// pour `routes/_app/layout.tsx` : ils ne doivent pas atteindre la page de
// partage (règle non négociable #7 de l'étape 3). Racine commune à tous les
// arbres, `root.tsx` les aurait servis partout.
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: feuilleDeStyle },
  { rel: "icon", href: "/icones/icone-192.png", type: "image/png" },
];

// Le nonce de la politique de sécurité, généré par requête par le serveur
// Express et remis ici par `getLoadContext`. C'est la seule donnée de ce
// loader, et elle ne change pas pendant la vie d'un document : aucune raison
// de la redemander à chaque navigation.
export function loader({ context }: LoaderFunctionArgs) {
  return { nonce: context?.nonce };
}

export const shouldRevalidate = () => false;

export default function App() {
  // `useRouteLoaderData` plutôt que `useLoaderData` : la racine rend aussi
  // les erreurs, où les données du loader n'existent pas.
  const nonce = useRouteLoaderData<typeof loader>("root")?.nonce;

  // Une route peut demander à être servie en HTML seul. C'est le cas de
  // `/p/:jeton` : un visiteur venu d'un lien ne doit rien télécharger, rien
  // installer, rien mettre en cache. Sans `<Scripts />` il n'y a pas
  // d'hydratation du tout — la recherche y est donc un formulaire GET et les
  // facettes des liens, pas des composants qui attendent un événement.
  const sansScripts = documentSansScripts(useMatches());

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1f4f46" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Maison" />
        <Meta />
        {/* `nonce=""` et non le nonce : `<Links>` prendrait sinon celui du
            contexte de `<ServerRouter>` côté serveur, et rien côté client où
            ce contexte n'existe pas. Or le navigateur MASQUE l'attribut
            `nonce` dès qu'une politique arrive par en-tête : à l'hydratation,
            React compare ce qu'il rend à un attribut vide, et signale l'écart
            à chaque écran en développement. Une chaîne vide des deux côtés
            est ce que le DOM montre. Les `<link>` n'ont pas besoin de nonce :
            `style-src 'self'` et `script-src 'self'` couvrent une feuille et
            un `modulepreload` par leur URL. */}
        <Links nonce="" />
        <title>gestionImmobiliere</title>
      </head>
      <body>
        <Outlet />
        {!sansScripts && (
          <>
            {/* Le nonce ne va qu'aux scripts. Pas aux <link> : le navigateur
                masque l'attribut dès qu'une politique arrive par en-tête, et
                l'hydratation le signalerait à chaque écran — voir
                `entry.server.tsx`. */}
            <ScrollRestoration nonce={nonce} />
            <Scripts nonce={nonce} />
          </>
        )}
      </body>
    </html>
  );
}

// Sans cet export, une route qui lève — le 404 d'un jeton inconnu, par
// exemple — tombe sur la page par défaut de React Router. Le document rendu
// ici ne porte aucun script : voir `PageErreur`.
export function ErrorBoundary() {
  return <PageErreur erreur={decrireErreur(useRouteError())} />;
}
