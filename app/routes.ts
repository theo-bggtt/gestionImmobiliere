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
      // Le démarrage. `demarrer/adresse` est une route de ressource : la
      // recherche d'adresse ne navigue pas, sinon les réponses déjà données
      // seraient perdues à chaque essai.
      ...prefix("demarrer", [
        index("routes/_app/demarrer._index.tsx"),
        route("adresse", "routes/_app/demarrer.adresse.tsx"),
      ]),
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
      ...prefix("elements", [
        index("routes/_app/elements._index.tsx"),
        route("nouveau", "routes/_app/elements.nouveau.tsx"),
        route(":elementId/modifier", "routes/_app/elements.$elementId.modifier.tsx"),
      ]),
      route("types/nouveau", "routes/_app/types.nouveau.tsx"),
      // Les plans. `plans/points` et `plans/contours` sont des routes de
      // ressource : la vue interactive y enregistre un point déplacé ou un
      // contour terminé sans naviguer, sinon le zoom et la position seraient
      // perdus au moment même où l'on veut vérifier ce qu'on vient de faire.
      ...prefix("plans", [
        index("routes/_app/plans._index.tsx"),
        route("nouveau", "routes/_app/plans.nouveau.tsx"),
        route("points", "routes/_app/plans.points.tsx"),
        route("contours", "routes/_app/plans.contours.tsx"),
        route(":planId/modifier", "routes/_app/plans.$planId.modifier.tsx"),
      ]),
      // L'historique. La chronologie du propriétaire rend le même composant
      // que celle d'un partage, avec l'autre jeu de liens.
      ...prefix("evenements", [
        index("routes/_app/evenements._index.tsx"),
        route("nouveau", "routes/_app/evenements.nouveau.tsx"),
        route(":evenementId/modifier", "routes/_app/evenements.$evenementId.modifier.tsx"),
      ]),
      // Une garantie se crée depuis la fiche de son objet (`element_id` est
      // NOT NULL), et se corrige ici — atteignable aussi depuis les échéances
      // de l'accueil, sans avoir à retrouver l'objet d'abord.
      route("garanties/:garantieId/modifier", "routes/_app/garanties.$garantieId.modifier.tsx"),
      ...prefix("intervenants", [
        index("routes/_app/intervenants._index.tsx"),
        route("nouveau", "routes/_app/intervenants.nouveau.tsx"),
        route(":intervenantId/modifier", "routes/_app/intervenants.$intervenantId.modifier.tsx"),
      ]),
      // Gestion des liens de partage. La prévisualisation rend le composant
      // et le loader réels de `/p/:jeton`, encadrés d'un bandeau.
      ...prefix("partages", [
        index("routes/_app/partages._index.tsx"),
        route(":partageId/apercu", "routes/_app/partages.$partageId.apercu.tsx"),
      ]),
      // L'écran de recherche (dont l'URL porte texte et facettes) et sa route
      // de ressource JSON, interrogée à la frappe depuis l'accueil.
      ...prefix("recherche", [
        index("routes/_app/recherche.tsx"),
        route("donnees", "routes/_app/recherche.donnees.tsx"),
      ]),
      // Routes de ressource de la capture : l'instantané hors ligne, l'envoi
      // depuis la boîte d'envoi, et la lecture authentifiée des images.
      ...prefix("capture", [
        route("donnees", "routes/_app/capture.donnees.tsx"),
        route("envoyer", "routes/_app/capture.envoyer.tsx"),
      ]),
      route("fichiers/:fichierId", "routes/_app/fichiers.$fichierId.tsx"),
    ]),
  ]),

  // Arbre public des liens de partage. Hors de `layout.tsx` : pas de session,
  // pas de barre de capture, pas de manifeste ni de service worker. Ces routes
  // portent `handle.sansScripts`, donc `root.tsx` les sert en HTML seul.
  ...prefix("p/:jeton", [
    index("routes/_partage/page.tsx"),
    route("objets/:elementId", "routes/_partage/objet.tsx"),
    route("historique", "routes/_partage/historique.tsx"),
    route("evenements/:evenementId", "routes/_partage/evenement.tsx"),
    route("fichiers/:fichierId", "routes/_partage/fichiers.tsx"),
  ]),
] satisfies RouteConfig;
