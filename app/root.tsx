import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches } from "react-router";
import type { LinksFunction } from "react-router";
import { documentSansScripts } from "./lib/partage/document";
import feuilleDeStyle from "./styles/app.css?url";

// Le manifeste et l'enregistrement du service worker ont quitté ce fichier
// pour `routes/_app/layout.tsx` : ils ne doivent pas atteindre la page de
// partage (règle non négociable #7 de l'étape 3). Racine commune à tous les
// arbres, `root.tsx` les aurait servis partout.
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: feuilleDeStyle },
  { rel: "icon", href: "/icones/icone-192.png", type: "image/png" },
];

export default function App() {
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
        <Links />
        <title>gestionImmobiliere</title>
      </head>
      <body>
        <Outlet />
        {!sansScripts && (
          <>
            <ScrollRestoration />
            <Scripts />
          </>
        )}
      </body>
    </html>
  );
}
