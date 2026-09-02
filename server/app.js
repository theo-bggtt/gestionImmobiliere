import { createRequestHandler } from "@react-router/express";
import express from "express";

const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({ server: { middlewareMode: true } })
      );

const app = express();

app.use(
  viteDevServer ? viteDevServer.middlewares : express.static("build/client")
);

const build = viteDevServer
  ? () => viteDevServer.ssrLoadModule("virtual:react-router/server-build")
  : await import("../build/server/index.js");

app.all("*", createRequestHandler({ build }));

const port = process.env.PORT ?? 3000;
app.listen(port, () => {
  console.log(`gestionImmobiliere en écoute sur le port ${port}`);
});
