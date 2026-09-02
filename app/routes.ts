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
        route(":batimentId/niveaux/nouveau", "routes/_app/batiments.$batimentId.niveaux.nouveau.tsx"),
      ]),
      route("niveaux/:niveauId/modifier", "routes/_app/niveaux.$niveauId.modifier.tsx"),
      ...prefix("zones", [
        index("routes/_app/zones._index.tsx"),
        route("nouveau", "routes/_app/zones.nouveau.tsx"),
        route(":zoneId/modifier", "routes/_app/zones.$zoneId.modifier.tsx"),
      ]),
      ...prefix("systemes", [
        index("routes/_app/systemes._index.tsx"),
        route("nouveau", "routes/_app/systemes.nouveau.tsx"),
        route(":systemeId/modifier", "routes/_app/systemes.$systemeId.modifier.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
