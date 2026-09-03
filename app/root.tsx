import { useEffect } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { LinksFunction } from "react-router";
import feuilleDeStyle from "./styles/app.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: feuilleDeStyle },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/icones/icone-180.png" },
  { rel: "icon", href: "/icones/icone-192.png", type: "image/png" },
];

export default function App() {
  useEffect(() => {
    // Jamais en développement : Vite sert des centaines de modules non
    // versionnés, les mettre en cache rendrait le rechargement à chaud faux.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Pas de service worker (contexte non sécurisé, réglage navigateur) :
        // l'app fonctionne, elle ne démarre simplement pas hors ligne.
      });
    }
  }, []);

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
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
