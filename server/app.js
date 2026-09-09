// server/app.js
// Le point d'entrée : choisit le build (Vite en développement, `build/` en
// production), fabrique l'application avec `creerApplication` et écoute.
// Tout ce qui se teste vit dans `application.js` ; ici il ne reste que ce
// qui dépend du processus.
import { createRequestHandler } from "@react-router/express";
import express from "express";
import { creerApplication } from "./application.js";

const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({ server: { middlewareMode: true } })
      );

const build = viteDevServer
  ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build")
  : await import("../build/server/index.js");

// Le nombre de proxys vient de l'environnement parce qu'il décrit la machine,
// pas le code : 1 dans le compose (Caddy), 0 sur un poste de développement.
// Une valeur qui n'est pas un entier positif vaut 0 — on ne se fie à
// personne par défaut.
const proxysDeConfiance = Math.max(0, Math.trunc(Number(process.env.PROXYS_DE_CONFIANCE)) || 0);

const app = creerApplication({
  proxysDeConfiance,
  developpement: Boolean(viteDevServer),
  statiques: viteDevServer ? viteDevServer.middlewares : express.static("build/client"),
  gestionnaire: createRequestHandler({
    build,
    // Le nonce de la politique de sécurité, généré par requête dans
    // `application.js`, remis ici au loader racine.
    getLoadContext: (_req, res) => ({ nonce: res.locals.nonce }),
  }),
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => {
  console.log(`gestionImmobiliere en écoute sur le port ${port} (proxys de confiance : ${proxysDeConfiance})`);
});
