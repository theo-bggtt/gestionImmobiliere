// app/entry.server.tsx
// Révélé depuis le défaut de React Router (`entry.server.node.tsx`) pour une
// seule raison : passer le nonce de la politique de sécurité au rendu. Le
// serveur Express le génère par requête (`server/application.js`) et le remet
// dans le contexte de chargement ; `renderToPipeableStream` le pose sur les
// scripts que React lui-même injecte en flux, et le loader racine le rend à
// `<Scripts nonce>` et `<ScrollRestoration nonce>`. Sans lui, `script-src`
// sans `'unsafe-inline'` bloquerait le contexte d'hydratation, qui est un
// script inline.
//
// `<ServerRouter nonce>` est nécessaire aussi : il le propage par contexte
// aux scripts que le rendu ajoute hors de `<Scripts>` — le runtime du
// rechargement à chaud en développement, les scripts de données en flux —
// qui sans lui sont refusés par la politique. Il a un effet de bord, traité
// dans `root.tsx` : `<Links>` prend le même contexte et poserait le nonce sur
// chaque `<link>`.
import { PassThrough } from "node:stream";
import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";

// Le contexte est absent quand un test appelle un loader directement, et
// vide quand `getLoadContext` n'est pas branché : le nonce est donc optionnel
// partout, et son absence ne rend qu'un `<script>` sans attribut — ce qui
// n'arrive qu'hors du serveur Express, où il n'y a pas de politique à
// satisfaire.
declare module "react-router" {
  interface AppLoadContext {
    nonce?: string;
  }
}

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  const nonce = loadContext?.nonce;

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    // Un robot attend le contenu complet ; un navigateur reçoit la coquille
    // dès qu'elle est prête.
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000);

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Les erreurs de la coquille sont déjà journalisées par le
          // gestionnaire de document ; celles du flux ne le seraient pas.
          if (shellRendered) console.error(error);
        },
      },
    );
  });
}
