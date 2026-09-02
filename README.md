# gestionImmobiliere — Étape 0 : socle

Mémoire technique d'un bien immobilier. Cette étape pose les fondations : schéma de données complet, authentification, catalogue de types, CRUD minimal avec formulaire dynamique. Pas de capture photo, pas de recherche, pas de partage — voir `.decisions/implementation-plan.md` pour la suite.

## Prérequis

- Docker et Docker Compose
- Node.js 22+ (pour le développement hors conteneur)
- npm

## Démarrage (Docker)

```bash
cp .env.example .env
# éditer .env : POSTGRES_PASSWORD et SESSION_SECRET
docker compose up
```

L'application applique ses migrations automatiquement au démarrage (`scripts/migrate.mjs`) et écoute sur `http://localhost:3000`. La base est vide : voir "Charger les données" ci-dessous.

## Démarrage (développement local, hors Docker pour l'app)

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

## Migrations

- `npm run db:generate` — génère une migration à partir du schéma Drizzle (`app/db/schema/`), après l'avoir modifié. Migrations versionnées dans `drizzle/`.
- `npm run db:migrate` — applique les migrations en attente (utilisé aussi bien en dev qu'en prod, via `scripts/migrate.mjs`).

## Charger les données

```bash
npm run seed:catalogue   # 33 types système avec alias — idempotent
npm run seed:exemple     # propriété "Maison d'exemple" complète — idempotent
```

Identifiants de démonstration créés par `seed:exemple` : `demo@gestion-immobiliere.local` / `demo1234`. **Jetables : à ne jamais utiliser en production.**

## Tests

```bash
docker compose exec postgres createdb -U gestion gestion_immobiliere_test   # une fois
cp .env.test.example .env.test
set -a && source .env.test && set +a && npx tsx scripts/seed-catalogue.ts    # une fois, requis par le test d'alias
npm test
```

## Structure des dossiers

- `app/db/schema/` — schéma Drizzle, une table (ou un petit groupe de tables liées) par fichier.
- `app/lib/auth/` — hachage, cookie, sessions.
- `app/lib/forms/` — validation des `details` dynamiques contre `type_element.champs`.
- `app/lib/zoneTree.ts` — construction de l'arbre bâtiment → niveau → zone (+ zones extérieures).
- `app/components/` — `ZoneSelector`, `DynamicElementFields`, `ChampEditor`.
- `app/routes/_public/` — connexion, inscription, déconnexion (non protégé).
- `app/routes/_app/` — tout le reste, protégé, scopé par `proprieteId` dans l'URL. La future page de partage publique (`/p/:jeton`, étape 3) prendra place dans un arbre `_share` séparé.
- `scripts/` — migration au démarrage, seeds.
- `tests/` — tests d'intégration base de données + tests unitaires de validation.

## Décisions prises (non spécifiées par le prompt d'étape)

1. **Lien utilisateur ↔ propriété** : le schéma fourni ne le prévoyait pas. `propriete.proprietaire_id` (FK vers `utilisateur.id`, sans contrainte unique) a été ajouté après clarification — un compte peut posséder plusieurs propriétés. Toutes les routes CRUD sont scopées par `proprieteId` dans l'URL.
2. **Serveur Express**, pas Hono — pattern officiel React Router v7 documenté et éprouvé.
3. **Résolution de session via le loader racine**, pas un middleware RR7 (encore instable en v7).
4. **`session.id` est un jeton aléatoire de 32 octets (hex)**, pas un entier séquentiel : il double comme secret porté par le cookie, un entier serait devinable.
5. **`type_element.champs[].options`** ajouté (non listé dans le prompt) : nécessaire pour que le genre "choix" valide quoi que ce soit.
6. **Genre `fichier`** : toujours traité comme optionnel à cette étape (le téléversement arrive à l'étape 6), affiché avec une mention "à venir".
7. **`niveau_min` par champ** capturé mais pas encore appliqué : le partage (qui en aurait besoin) n'existe pas à cette étape.
8. **Contrainte `CHECK ... BETWEEN 0 AND 3`** répétée sur toutes les colonnes `niveau`/`niveau_max` (element, fichier, evenement, intervenant, partage), cohérente avec la sémantique documentée, même si seule `element.niveau` était explicitement requise comme bornée.
9. **Immutabilité des types système appliquée en garde applicative**, pas par un trigger PostgreSQL bloquant — un trigger interdisant tout `UPDATE` empêcherait la fonctionnalité future explicitement autorisée "ajouter un champ à un type existant" (y compris système). Aucune route de modification de type n'existe encore à cette étape, donc la garde n'a rien à protéger pour l'instant.
10. **Idempotence du catalogue** via un index unique partiel `UNIQUE (nom) WHERE origine = 'systeme'` + `ON CONFLICT DO NOTHING`.
11. **Idempotence du jeu d'exemple** via un garde applicatif sur le nom de la propriété ("Maison d'exemple").
12. **Interprétation du déclencheur `recherche`** : la phrase du prompt était ambiguë entre "alias de l'élément" et "alias du type". Les deux sont concaténés — sans l'alias du type, le critère d'acceptation "recherche 'robinet' remonte la vanne d'arrêt" ne peut pas être vrai, puisque l'alias vit sur le catalogue, pas sur les fiches capturées.
13. **Pas d'alias de chemin `~/`** : imports relatifs partout, pour éviter une dépendance supplémentaire.
14. **npm** comme gestionnaire de paquets (aucune préférence exprimée).
15. **Écran "modifier une zone"** ne permet de changer que `nom`/`type`, pas de repositionner (niveau/parent) — non demandé, gardé hors scope.
