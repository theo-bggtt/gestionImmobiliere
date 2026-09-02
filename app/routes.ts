// app/routes.ts
import { type RouteConfig, route, index, layout, prefix } from "@react-router/dev/routes";

export default [
  route("connexion", "routes/_public/login.tsx"),
  route("inscription", "routes/_public/register.tsx"),
  route("deconnexion", "routes/_public/logout.tsx"),

  layout("routes/_app/layout.tsx", [
    index("routes/_app/proprietes._index.tsx"),
    ...prefix("proprietes/:proprieteId", [
      index("routes/_app/proprietes.$proprieteId._index.tsx"),
      ...prefix("batiments", [
        index("routes/_app/batiments._index.tsx"),
        route("nouveau", "routes/_app/batiments.nouveau.tsx"),
        route(":batimentId/modifier", "routes/_app/batiments.$batimentId.modifier.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
