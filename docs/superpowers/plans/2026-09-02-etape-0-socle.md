# Étape 0 — Socle de gestionImmobiliere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le socle technique de gestionImmobiliere : projet React Router v7 + PostgreSQL + Drizzle conteneurisé, schéma de données complet (structure, types, éléments, plan, fichiers, historique, partages, auth), authentification propriétaire, catalogue de types système, CRUD minimal avec formulaire dynamique, jeu de données d'exemple, tests d'intégration base de données.

**Architecture:** Un seul projet React Router v7 en mode framework (TypeScript, rendu serveur), servi par un petit serveur Express (pattern officiel RR7 : vite en middleware mode en dev, build statique en prod). PostgreSQL 16 comme unique source de vérité, Drizzle comme couche d'accès typée avec échappatoire SQL brut pour le déclencheur `tsvector` et les contraintes `CHECK` avancées. Sessions en base, cookie `httpOnly` signé via le `createCookie` natif de React Router (pas de librairie d'auth). Toutes les routes protégées vivent sous un arbre `_app` scopé par `proprieteId` dans l'URL ; les futures pages de partage public vivront dans un arbre séparé, non protégé, prévu mais pas construit ici.

**Tech Stack:** React Router v7 (framework mode) · TypeScript · Node 22 · Express (`@react-router/express`) · PostgreSQL 16 · Drizzle ORM + drizzle-kit · `pg` · `@node-rs/argon2` · `zod` · `vitest` · `tsx` · Docker + docker-compose.

**Spec:** `.decisions/prompt-etape-0.md` (prompt détaillé de l'étape) et `.decisions/implementation-plan.md` (vue d'ensemble du produit, les 12 règles, l'ordre de construction). Les deux voyagent avec ce plan ; en cas de doute sur une règle, l'exécutant doit relire `prompt-etape-0.md`.

## Global Constraints

Copiées verbatim depuis `prompt-etape-0.md`, elles s'appliquent implicitement à chaque tâche :

- `element.zone_id` est `NOT NULL`, garanti par une contrainte de base (pas par un formulaire).
- `niveau.ordinal` est un entier signé ; le tri des niveaux se fait dessus, jamais sur le nom.
- La clé (`cle`) d'un champ de `type_element.champs` est immuable ; un champ ajouté après coup est toujours optionnel ; un champ retiré est masqué, jamais effacé.
- `genre` (dans `type_element.champs`) est une liste fermée de **six** valeurs : `texte | nombre | date | booleen | choix | fichier`. Appliquée par une contrainte `CHECK`, jamais étendue.
- Les types système (`origine = 'systeme'`) ne sont pas modifiables par l'utilisateur ; il peut créer ses propres types et ajouter un champ à un type existant, mais pas altérer nom/icône/origine du catalogue livré.
- Vocabulaire visible : « zone » ou « lieu », **jamais** « pièce ». Dans le code, les commentaires, toute chaîne affichée.
- Aucun secret dans le modèle : pas de champ pour code d'alarme, combinaison, emplacement de clé.
- N'ajoute aucune dépendance non listée dans ce plan sans la justifier en commentaire dans le code.
- Ne construis PAS à cette étape : capture photo, boîte d'envoi hors ligne, service worker/PWA, plans et points (UI), pages de partage et jetons (UI), interface de recherche, chronologie, téléversement de fichiers, traitement EXIF, soin graphique. Le schéma doit les rendre possibles sans migration destructive — les tables existent, mais aucune UI ni logique n'est construite pour elles.

## Décisions verrouillées avant l'écriture du plan

Ces points n'étaient pas spécifiés (ou entraient en tension avec le "respecte les noms exactement" du prompt) et ont été tranchés avant de démarrer, pour éviter qu'un exécutant improvise au milieu d'une tâche :

1. **Lien utilisateur ↔ propriété (absent du schéma fourni).** `propriete` gagne une colonne `proprietaire_id` (FK vers `utilisateur.id`, `NOT NULL`, **pas** de contrainte unique) — décidé avec l'utilisateur : un compte peut posséder plusieurs propriétés. Conséquence : un écran minimal "mes propriétés" (liste + création par nom) sert de page d'accueil post-connexion, et toutes les routes CRUD sont scopées par `proprieteId` dans l'URL (`/proprietes/:proprieteId/...`), vérifié à chaque loader/action.
2. **Serveur Node : Express** (pas Hono). Les templates officiels React Router v7 pour serveur custom sont documentés et éprouvés avec Express ; Hono n'apporte rien ici et aurait demandé de réécrire le pattern `getLoadContext`/build sans référence officielle.
3. **Résolution de session : loader racine, pas middleware.** Le prompt offrait le choix. Le loader racine (`app/root.tsx`) + un helper `requireUserId` appelé dans chaque loader/action protégé est plus simple qu'un middleware RR7 (fonctionnalité encore `unstable_` en v7) et remplit la même exigence ("exposée aux routes via le contexte").
4. **`session.id` est un jeton texte aléatoire (32 octets hex via `crypto.randomBytes`), pas un entier séquentiel.** Le schéma générique du prompt suggère des id numériques partout, mais ici l'`id` de session double comme secret porté par le cookie : un entier séquentiel serait devinable/énumérable. Déviation volontaire et documentée dans le README.
5. **`type_element.champs[].options`** : champ additif non listé dans le prompt, requis quand `genre = 'choix'` pour donner la liste des valeurs possibles. Sans lui, le genre "choix" ne peut rien valider. N'étend pas la liste des six genres, ne modifie aucune clé existante.
6. **Genre `fichier` dans le formulaire dynamique** : à cette étape le téléversement n'existe pas (étape 6). Un champ de genre `fichier` est toujours traité comme optionnel quel que soit son `obligatoire`, et son entrée est désactivée dans le formulaire avec la mention "à venir". Aucune donnée fichier n'est collectée.
7. **`niveau_min` par champ n'est pas encore appliqué** (le partage n'existe pas à cette étape) : il est capturé et stocké, mais l'écran propriétaire affiche toujours tous les champs.
8. **Colonnes `niveau` (element, fichier, evenement, intervenant) et `niveau_max` (partage)** partagent une contrainte `CHECK ... BETWEEN 0 AND 3`, cohérente avec la sémantique documentée (0 public · 1 usage · 2 technique · 3 privé) même si seul `element.niveau` était explicitement requis comme borné.
9. **Immutabilité des types système (règle 5)** appliquée en garde applicative dans les `action` des routes (vérifie `origine === 'perso'` avant toute mutation), pas par un trigger PostgreSQL — un trigger bloquant bêtement tout `UPDATE` empêcherait la future fonctionnalité explicitement autorisée "ajouter un champ à un type existant" (y compris système).
10. **Le catalogue de types système est idempotent via un index unique partiel** `UNIQUE (nom) WHERE origine = 'systeme'` + `ON CONFLICT DO NOTHING`, plutôt qu'une vérification applicative (évite les doublons même en cas de réexécutions concurrentes).
11. **Le jeu de données d'exemple est idempotent par un garde applicatif** : le script cherche une `propriete` nommée `"Maison d'exemple"` ; si elle existe déjà, il s'arrête sans rien recréer. Le script crée aussi (ou réutilise) un utilisateur de démonstration `demo@gestion-immobiliere.local` pour porter cette propriété — identifiants affichés en console et documentés dans le README comme **jetables, à ne jamais utiliser en production**.
12. **Pas d'alias de chemin (`~/...`)** : imports relatifs partout. Évite une dépendance (`vite-tsconfig-paths`) pour un projet de cette taille.
13. **Package manager : npm** (pas de préférence exprimée, npm est le plus safe par défaut).

---

## File Structure

```
gestionImmobiliere/
  .env.example
  .gitignore
  Dockerfile
  docker-compose.yml
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  react-router.config.ts
  drizzle.config.ts
  server/
    app.js                        # serveur Express custom (dev + prod), pas de TS ici
  app/
    root.tsx
    routes.ts
    db/
      client.ts
      schema/
        core.ts                   # propriete, batiment, niveau, zone, systeme + relations
        types.ts                  # type_element
        elements.ts                # element (+ type tsvector custom)
        fichiers.ts                # fichier, fichier_lien
        plans.ts                   # plan, zone_geom, point
        historique.ts              # evenement, evenement_element, evenement_intervenant, intervenant, garantie
        partage.ts                 # partage
        auth.ts                    # utilisateur, session
        index.ts                   # ré-exporte tout
    lib/
      auth/
        password.server.ts
        cookie.server.ts
        session.server.ts
      forms/
        champSchema.ts
      db/
        proprieteAccess.server.ts
      zoneTree.ts
    components/
      ZoneSelector.tsx
      ChampEditor.tsx
      DynamicElementFields.tsx
    routes/
      _public/
        login.tsx
        register.tsx
        logout.tsx
      _app/
        layout.tsx
        proprietes._index.tsx
        proprietes.$proprieteId._index.tsx
        batiments._index.tsx
        batiments.nouveau.tsx
        batiments.$batimentId.modifier.tsx
        batiments.$batimentId.niveaux.nouveau.tsx
        niveaux.$niveauId.modifier.tsx
        zones._index.tsx
        zones.nouveau.tsx
        zones.$zoneId.modifier.tsx
        systemes._index.tsx
        systemes.nouveau.tsx
        systemes.$systemeId.modifier.tsx
        elements._index.tsx
        elements.nouveau.tsx
        elements.$elementId.modifier.tsx
        types.nouveau.tsx
  drizzle/                         # généré par drizzle-kit (migrations SQL + journal)
  scripts/
    migrate.mjs
    seed-catalogue.ts
    seed-exemple.ts
  tests/
    setup/
      test-db.ts
    schema/
      zone-obligatoire.test.ts
      niveau-tri.test.ts
      recherche-trigger.test.ts
      catalogue-alias.test.ts
    forms/
      champ-validation.test.ts
  README.md
```

---

### Task 1: Scaffold du projet, TypeScript, serveur Express, Docker

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `react-router.config.ts`, `server/app.js`, `app/root.tsx`, `app/routes.ts`, `.env.example`, `.gitignore`, `Dockerfile`, `docker-compose.yml`

**Interfaces:**
- Produces: commande `npm run dev` qui sert l'app sur `PORT` (défaut 3000) ; `npm run build` ; `npm start` (prod) ; squelette de `app/routes.ts` que les tâches suivantes vont enrichir.

- [ ] **Step 1: Initialiser git et le `package.json`**

```bash
git init
```

`package.json` :

```json
{
  "name": "gestion-immobiliere",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --env-file=.env server/app.js",
    "build": "react-router build",
    "start": "node --env-file=.env server/app.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node --env-file=.env scripts/migrate.mjs",
    "seed:catalogue": "tsx --env-file=.env scripts/seed-catalogue.ts",
    "seed:exemple": "tsx --env-file=.env scripts/seed-exemple.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.9.0",
    "@react-router/express": "^7.9.0",
    "@react-router/node": "^7.9.0",
    "express": "^4.21.0",
    "drizzle-orm": "^0.44.0",
    "pg": "^8.13.0",
    "@node-rs/argon2": "^2.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@react-router/dev": "^7.9.0",
    "vite": "^5.4.0",
    "typescript": "^5.6.0",
    "@types/express": "^4.17.21",
    "@types/node": "^22.9.0",
    "@types/pg": "^8.11.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "drizzle-kit": "^0.31.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0"
  }
}
```

Chaque dépendance est justifiée dans les Global Constraints / le README ; aucune n'est ajoutée par la suite sans commentaire expliquant pourquoi.

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "node"],
    "rootDirs": [".", "./.react-router/types"],
    "noEmit": true
  },
  "include": ["app/**/*", "server/**/*.js", "scripts/**/*", "tests/**/*", "*.ts", ".react-router/types/**/*"]
}
```

- [ ] **Step 3: `vite.config.ts` et `react-router.config.ts`**

```ts
// vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
});
```

```ts
// react-router.config.ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
```

- [ ] **Step 4: `app/routes.ts` (squelette, enrichi par les tâches suivantes) et `app/root.tsx` minimal**

```ts
// app/routes.ts
import { type RouteConfig } from "@react-router/dev/routes";

export default [] satisfies RouteConfig;
```

```tsx
// app/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
```

- [ ] **Step 5: Serveur Express custom `server/app.js`**

Pattern officiel React Router v7 (serveur custom) : vite en middleware mode en dev, bundle statique en prod. Volontairement en JavaScript brut (pas TypeScript) : ce fichier tourne directement sous Node en production, hors du pipeline de build Vite/RR7, donc toute logique métier (session, DB) doit vivre sous `app/` où elle sera bundlée — jamais ici.

```js
// server/app.js
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
```

- [ ] **Step 6: `.env.example`, `.gitignore`**

```bash
# .env.example
POSTGRES_DB=gestion_immobiliere
POSTGRES_USER=gestion
POSTGRES_PASSWORD=change-me

# Hors Docker (dev local), DATABASE_URL pointe vers localhost.
# Dans docker-compose, l'app reçoit sa propre DATABASE_URL vers le service "postgres".
DATABASE_URL=postgres://gestion:change-me@localhost:5432/gestion_immobiliere
SESSION_SECRET=change-me-too-generate-a-long-random-string
PORT=3000
```

```
# .gitignore
node_modules/
build/
.react-router/
.env
.env.test
*.log
```

- [ ] **Step 7: `Dockerfile` et `docker-compose.yml`**

```dockerfile
# Dockerfile
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node server/app.js"]
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-gestion_immobiliere}
      POSTGRES_USER: ${POSTGRES_USER:-gestion}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?définir POSTGRES_PASSWORD dans .env}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-gestion}"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER:-gestion}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-gestion_immobiliere}
      SESSION_SECRET: ${SESSION_SECRET:?définir SESSION_SECRET dans .env}
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```

`Dockerfile` n'a pas de `RUN npm run db:generate` : les migrations sont générées en dev et **versionnées** (dossier `drizzle/`), jamais générées à la volée en prod — seule `migrate.mjs` les *applique* au démarrage (voir Task 2).

- [ ] **Step 8: Vérifier que le squelette démarre**

```bash
npm install
npm run typecheck
```

Expected: `npm install` réussit, `tsc --noEmit` ne remonte aucune erreur (le projet est encore vide de logique, juste le squelette).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold du projet React Router v7 + Express + Docker"
```

---

### Task 2: Schéma Drizzle complet, migration initiale, contraintes de base

**Files:**
- Create: `app/db/schema/core.ts`, `app/db/schema/types.ts`, `app/db/schema/elements.ts`, `app/db/schema/fichiers.ts`, `app/db/schema/plans.ts`, `app/db/schema/historique.ts`, `app/db/schema/partage.ts`, `app/db/schema/auth.ts`, `app/db/schema/index.ts`, `app/db/client.ts`, `drizzle.config.ts`, `scripts/migrate.mjs`
- Test: `tests/setup/test-db.ts`, `tests/schema/zone-obligatoire.test.ts`, `tests/schema/niveau-tri.test.ts`
- Create: `vitest.config.ts`, `.env.test.example`

**Interfaces:**
- Produces: `db` (client Drizzle exporté par `app/db/client.ts`), le schéma complet exporté par `app/db/schema/index.ts` (toutes les tables + tous les enums + le type `ChampDefinition`), utilisé par toutes les tâches suivantes.

- [ ] **Step 1: `app/db/schema/core.ts`**

```ts
// app/db/schema/core.ts
import {
  pgTable, serial, text, integer, timestamp, pgEnum, foreignKey, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { utilisateur } from "./auth";

export const propriete = pgTable("propriete", {
  id: serial("id").primaryKey(),
  // Absent du schéma fourni dans le prompt : nécessaire pour scoper les
  // routes protégées par propriétaire. Décision : un utilisateur peut
  // posséder plusieurs propriétés, donc pas de contrainte unique ici.
  proprietaireId: integer("proprietaire_id").notNull().references(() => utilisateur.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  adresse: text("adresse"),
  egid: text("egid"),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  proprietaireIdx: index("idx_propriete_proprietaire").on(table.proprietaireId),
}));

export const batimentType = pgEnum("batiment_type", ["principal", "annexe", "garage", "abri"]);

export const batiment = pgTable("batiment", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  type: batimentType("type").notNull().default("principal"),
  ordre: integer("ordre").notNull().default(0),
}, (table) => ({
  proprieteIdx: index("idx_batiment_propriete").on(table.proprieteId),
}));

export const niveau = pgTable("niveau", {
  id: serial("id").primaryKey(),
  batimentId: integer("batiment_id").notNull().references(() => batiment.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  // Entier signé : -2 sous-sol, -1 cave, 0 rez, 1 premier, 2 combles...
  // Le nom est libre ("cave à vin"), l'ordinal sert au tri et au sélecteur.
  ordinal: integer("ordinal").notNull(),
  ordre: integer("ordre").notNull().default(0),
}, (table) => ({
  batimentIdx: index("idx_niveau_batiment").on(table.batimentId),
}));

export const zoneType = pgEnum("zone_type", ["interieur", "exterieur", "annexe", "technique"]);

export const zone = pgTable("zone", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  // NULL = zone extérieure, rattachée à la propriété et non à un niveau.
  // C'est le SEUL cas où niveauId est nul.
  niveauId: integer("niveau_id").references(() => niveau.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  parentId: integer("parent_id"),
  type: zoneType("type").notNull(),
  ordre: integer("ordre").notNull().default(0),
}, (table) => ({
  proprieteIdx: index("idx_zone_propriete").on(table.proprieteId),
  niveauIdx: index("idx_zone_niveau").on(table.niveauId),
  parentFk: foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
    name: "zone_parent_id_fk",
  }).onDelete("cascade"),
}));

export const systeme = pgTable("systeme", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  icone: text("icone"),
}, (table) => ({
  proprieteIdx: index("idx_systeme_propriete").on(table.proprieteId),
}));

export const proprieteRelations = relations(propriete, ({ many }) => ({
  batiments: many(batiment),
  zones: many(zone),
  systemes: many(systeme),
}));

export const batimentRelations = relations(batiment, ({ one, many }) => ({
  propriete: one(propriete, { fields: [batiment.proprieteId], references: [propriete.id] }),
  niveaux: many(niveau),
}));

export const niveauRelations = relations(niveau, ({ one, many }) => ({
  batiment: one(batiment, { fields: [niveau.batimentId], references: [batiment.id] }),
  zones: many(zone),
}));

export const zoneRelations = relations(zone, ({ one, many }) => ({
  propriete: one(propriete, { fields: [zone.proprieteId], references: [propriete.id] }),
  niveau: one(niveau, { fields: [zone.niveauId], references: [niveau.id] }),
  parent: one(zone, { fields: [zone.parentId], references: [zone.id], relationName: "sousZones" }),
  sousZones: many(zone, { relationName: "sousZones" }),
}));
```

- [ ] **Step 2: `app/db/schema/auth.ts`**

```ts
// app/db/schema/auth.ts
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const utilisateur = pgTable("utilisateur", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  motDePasseHash: text("mot_de_passe_hash").notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  // Jeton opaque (32 octets aléatoires en hex), pas un id séquentiel :
  // cette valeur EST le secret porté par le cookie. Voir décision verrouillée #4.
  id: text("id").primaryKey(),
  utilisateurId: integer("utilisateur_id").notNull().references(() => utilisateur.id, { onDelete: "cascade" }),
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});
```

Note d'ordre d'import : `core.ts` importe `utilisateur` depuis `auth.ts`, donc `auth.ts` ne doit rien importer de `core.ts` (aucun cycle — c'est le cas ici).

- [ ] **Step 2 bis: Run test to verify it fails (rien à tester encore, mais vérifions la compilation)**

```bash
npm run typecheck
```

Expected: PASS (les deux fichiers compilent, pas encore de logique testable).

- [ ] **Step 3: `app/db/schema/types.ts`**

```ts
// app/db/schema/types.ts
import { pgTable, serial, text, integer, pgEnum, jsonb, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";

export const typeElementOrigine = pgEnum("type_element_origine", ["systeme", "perso"]);

export type ChampGenre = "texte" | "nombre" | "date" | "booleen" | "choix" | "fichier";

export type ChampDefinition = {
  cle: string;
  label: string;
  genre: ChampGenre;
  unite?: string;
  niveauMin: number; // 0 à 3, non encore appliqué (le partage n'existe pas à cette étape)
  obligatoire: boolean;
  // Requis quand genre === "choix" : liste des valeurs possibles.
  // Extension non listée dans le prompt, nécessaire pour que "choix" valide quoi que ce soit.
  options?: string[];
};

export const typeElement = pgTable("type_element", {
  id: serial("id").primaryKey(),
  // NULL = catalogue système (livré, non modifiable). Renseigné = type perso.
  proprieteId: integer("propriete_id").references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  icone: text("icone"),
  origine: typeElementOrigine("origine").notNull(),
  champs: jsonb("champs").notNull().default(sql`'[]'::jsonb`).$type<ChampDefinition[]>(),
  alias: text("alias").array().notNull().default(sql`'{}'::text[]`),
}, (table) => ({
  origineCoherente: check(
    "type_element_origine_propriete_coherente",
    sql`(${table.origine} = 'systeme' AND ${table.proprieteId} IS NULL) OR (${table.origine} = 'perso' AND ${table.proprieteId} IS NOT NULL)`
  ),
  // La contrainte de genres fermés (règle non négociable #4) n'est PAS
  // déclarée ici : PostgreSQL interdit toute sous-requête (SELECT) dans un
  // CHECK, et valider les éléments d'un tableau jsonb en demande une. Elle
  // est ajoutée par une migration écrite à la main (voir Step 3 bis) via une
  // fonction SQL IMMUTABLE — c'est la contrainte elle-même qui devient un
  // simple appel de fonction, ce que CHECK autorise.
  // Idempotence du seed catalogue (décision verrouillée #10) : un seul type
  // système par nom. Les types perso, eux, peuvent partager un nom entre
  // propriétés différentes (pas de contrainte).
  nomSystemeUnique: uniqueIndex("idx_type_element_nom_systeme_unique")
    .on(table.nom)
    .where(sql`${table.origine} = 'systeme'`),
}));
```

- [ ] **Step 4: `app/db/schema/elements.ts`**

```ts
// app/db/schema/elements.ts
import {
  pgTable, serial, text, integer, smallint, jsonb, timestamp, check, index, customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete, zone, systeme } from "./core";
import { typeElement } from "./types";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const element = pgTable("element", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  typeId: integer("type_id").notNull().references(() => typeElement.id),
  // NOT NULL garanti par la base : une fiche sans zone échapperait au
  // filtre de partage (règle non négociable #1). Ce n'est PAS une
  // validation de formulaire, c'est une contrainte de schéma.
  zoneId: integer("zone_id").notNull().references(() => zone.id),
  systemeId: integer("systeme_id").references(() => systeme.id),
  // 0 public · 1 usage · 2 technique · 3 privé
  niveau: smallint("niveau").notNull().default(3),
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  alias: text("alias").array().notNull().default(sql`'{}'::text[]`),
  // Alimentée par un déclencheur (Task 3), jamais écrite depuis l'application.
  recherche: tsvector("recherche"),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  niveauValide: check("element_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
  proprieteIdx: index("idx_element_propriete").on(table.proprieteId),
  zoneIdx: index("idx_element_zone_id").on(table.zoneId),
  niveauIdx: index("idx_element_niveau").on(table.niveau),
  typeIdx: index("idx_element_type").on(table.typeId),
  rechercheIdx: index("idx_element_recherche").using("gin", table.recherche),
  detailsIdx: index("idx_element_details").using("gin", table.details),
}));
```

- [ ] **Step 5: `app/db/schema/fichiers.ts`, `app/db/schema/plans.ts`, `app/db/schema/historique.ts`, `app/db/schema/partage.ts`**

```ts
// app/db/schema/fichiers.ts
import {
  pgTable, serial, integer, text, bigint, timestamp, smallint, pgEnum, boolean, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete, zone } from "./core";

export const fichier = pgTable("fichier", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  chemin: text("chemin").notNull(),
  typeMime: text("type_mime").notNull(),
  taille: bigint("taille", { mode: "number" }).notNull(),
  datePrise: timestamp("date_prise", { withTimezone: true }),
  zoneId: integer("zone_id").references(() => zone.id),
  niveau: smallint("niveau").notNull().default(3),
  legende: text("legende"),
  exifEfface: boolean("exif_efface").notNull().default(false),
}, (table) => ({
  niveauValide: check("fichier_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
}));

export const fichierLienRole = pgEnum("fichier_lien_role", ["avant", "apres", "plaque", "general"]);

export const fichierLien = pgTable("fichier_lien", {
  id: serial("id").primaryKey(),
  fichierId: integer("fichier_id").notNull().references(() => fichier.id, { onDelete: "cascade" }),
  // Polymorphe (element | evenement | intervenant | ...) : pas de FK possible ici.
  cibleType: text("cible_type").notNull(),
  cibleId: integer("cible_id").notNull(),
  role: fichierLienRole("role").notNull().default("general"),
});
```

```ts
// app/db/schema/plans.ts
import { pgTable, serial, integer, text, pgEnum, doublePrecision, primaryKey, jsonb } from "drizzle-orm/pg-core";
import { propriete, niveau, zone } from "./core";
import { element } from "./elements";
import { fichier } from "./fichiers";

export const planType = pgEnum("plan_type", ["etage", "situation"]);

export const plan = pgTable("plan", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  type: planType("type").notNull(),
  // NULL si type = situation (vue aérienne de la parcelle, couvre les zones extérieures).
  niveauId: integer("niveau_id").references(() => niveau.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  imageFichierId: integer("image_fichier_id").references(() => fichier.id, { onDelete: "set null" }),
  echelle: doublePrecision("echelle"),
  ordre: integer("ordre").notNull().default(0),
});

export const zoneGeomSource = pgEnum("zone_geom_source", ["trace", "importe"]);

export const zoneGeom = pgTable("zone_geom", {
  zoneId: integer("zone_id").notNull().references(() => zone.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plan.id, { onDelete: "cascade" }),
  // Liste de points {x, y} en pourcentage. jsonb à cette étape : la table
  // existe et est utilisable, l'éditeur de tracé arrive à l'étape 6.
  polygone: jsonb("polygone").notNull(),
  source: zoneGeomSource("source").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.zoneId, table.planId] }),
}));

export const point = pgTable("point", {
  id: serial("id").primaryKey(),
  // Pas de contrainte d'unicité sur elementId : un objet traversant
  // plusieurs niveaux porte un point par plan concerné.
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plan.id, { onDelete: "cascade" }),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
});
```

```ts
// app/db/schema/historique.ts
import { pgTable, serial, integer, text, date, numeric, smallint, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";
import { element } from "./elements";
import { fichier } from "./fichiers";

export const evenement = pgTable("evenement", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  titre: text("titre").notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  // Pas de liste fermée fournie par la spécification pour ce champ : texte libre.
  type: text("type"),
  niveau: smallint("niveau").notNull().default(3),
  description: text("description"),
  cout: numeric("cout", { precision: 10, scale: 2 }),
}, (table) => ({
  niveauValide: check("evenement_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
}));

export const evenementElement = pgTable("evenement_element", {
  evenementId: integer("evenement_id").notNull().references(() => evenement.id, { onDelete: "cascade" }),
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.evenementId, table.elementId] }),
}));

export const intervenant = pgTable("intervenant", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  metier: text("metier"),
  tel: text("tel"),
  email: text("email"),
  niveau: smallint("niveau").notNull().default(3),
  notes: text("notes"),
}, (table) => ({
  niveauValide: check("intervenant_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
}));

export const evenementIntervenant = pgTable("evenement_intervenant", {
  evenementId: integer("evenement_id").notNull().references(() => evenement.id, { onDelete: "cascade" }),
  intervenantId: integer("intervenant_id").notNull().references(() => intervenant.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.evenementId, table.intervenantId] }),
}));

export const garantie = pgTable("garantie", {
  id: serial("id").primaryKey(),
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
  evenementId: integer("evenement_id").references(() => evenement.id, { onDelete: "set null" }),
  debut: date("debut").notNull(),
  fin: date("fin"),
  reference: text("reference"),
  fichierId: integer("fichier_id").references(() => fichier.id, { onDelete: "set null" }),
});
```

```ts
// app/db/schema/partage.ts
import { pgTable, serial, integer, text, smallint, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";

export const partage = pgTable("partage", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  jeton: text("jeton").notNull().unique(),
  niveauMax: smallint("niveau_max").notNull(),
  porteeZones: integer("portee_zones").array().notNull().default(sql`'{}'::integer[]`),
  porteeSystemes: integer("portee_systemes").array().notNull().default(sql`'{}'::integer[]`),
  expireLe: timestamp("expire_le", { withTimezone: true }),
  revoqueLe: timestamp("revoque_le", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  niveauMaxValide: check("partage_niveau_max_valide", sql`${table.niveauMax} BETWEEN 0 AND 3`),
}));
```

- [ ] **Step 6: `app/db/schema/index.ts`**

Ordre d'export sans dépendance circulaire : `auth` (aucune dépendance) → `core` (dépend d'`auth`) → `types` (dépend de `core`) → `elements` (dépend de `core`, `types`) → `fichiers` (dépend de `core`) → `plans` (dépend de `core`, `elements`, `fichiers`) → `historique` (dépend de `core`, `elements`, `fichiers`) → `partage` (dépend de `core`).

```ts
// app/db/schema/index.ts
export * from "./auth";
export * from "./core";
export * from "./types";
export * from "./elements";
export * from "./fichiers";
export * from "./plans";
export * from "./historique";
export * from "./partage";
```

- [ ] **Step 7: `app/db/client.ts` et `drizzle.config.ts`**

```ts
// app/db/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
```

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 8: Générer la migration initiale**

```bash
docker compose up -d postgres
# attendre le healthcheck (docker compose ps)
set -a && source .env && set +a && npx drizzle-kit generate
```

`npx <outil>` plutôt qu'un appel direct à `node_modules/.bin/<outil>` : sur certains systèmes (dont Git Bash sous Windows), le fichier dans `.bin/` est un script shell que `node` ne peut pas exécuter directement en argument. `npx` résout le bon binaire pour la plateforme. `set -a && source .env && set +a` charge les variables de `.env` dans l'environnement du shell avant l'appel (`npx` ne comprend pas le flag Node `--env-file`).

Expected: un dossier `drizzle/0000_*.sql` est créé, contenant `CREATE TYPE` pour les enums, `CREATE TABLE` pour les 16 tables, les `CHECK`, les index nommés, l'index unique partiel — **sans** la contrainte sur les genres de `champs` (voir Step 8 bis).

- [ ] **Step 8 bis : contrainte des genres de `champs`, par une migration écrite à la main**

PostgreSQL interdit toute sous-requête dans un `CHECK` — `NOT EXISTS (SELECT ...)` ne peut pas être déclaré directement sur la colonne. La sous-requête doit vivre dans une fonction `IMMUTABLE`, et le `CHECK` se contente d'appeler cette fonction.

```bash
set -a && source .env && set +a && npx drizzle-kit generate --custom --name=champs_valides_check
```

Contenu du fichier généré (vide) :

```sql
CREATE FUNCTION champs_valides(champs jsonb) RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(champs) elem
    WHERE (elem->>'genre') NOT IN ('texte','nombre','date','booleen','choix','fichier')
       OR elem->>'cle' IS NULL
       OR elem->>'label' IS NULL
  );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE type_element
  ADD CONSTRAINT type_element_champs_genres_valides CHECK (champs_valides(champs));
```

```bash
npm run db:migrate
```

Expected: les deux migrations s'appliquent sans erreur ; `\d type_element` dans `psql` montre bien la contrainte `type_element_champs_genres_valides`.

- [ ] **Step 9: `scripts/migrate.mjs`**

Plain JS (pas TS) : tourne en production sans passer par le pipeline Vite/RR7, avec `drizzle-orm` (dépendance normale, présente en prod) — **pas** `drizzle-kit` (dev-only, absent de l'image de production).

```js
// scripts/migrate.mjs
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();

console.log("Migrations appliquées.");
```

```bash
npm run db:migrate
```

Expected: `Migrations appliquées.` — table `__drizzle_migrations` créée, toutes les tables du schéma présentes (vérifiable via `docker compose exec postgres psql -U gestion -d gestion_immobiliere -c '\dt'`).

- [ ] **Step 10: Base de test + harnais Vitest**

```bash
docker compose exec postgres createdb -U gestion gestion_immobiliere_test
```

```bash
# .env.test.example
DATABASE_URL=postgres://gestion:change-me@localhost:5432/gestion_immobiliere_test
SESSION_SECRET=test-secret
```

```ts
// vitest.config.ts
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    test: {
      environment: "node",
      setupFiles: ["./tests/setup/test-db.ts"],
    },
  };
});
```

```ts
// tests/setup/test-db.ts
import { beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "../../app/db/schema/index";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await pool.end();
});
```

- [ ] **Step 11: Write the failing tests (contrainte `zone_id` NOT NULL, tri par `ordinal`)**

```ts
// tests/schema/zone-obligatoire.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone, systeme, typeElement, element } from "../../app/db/schema/index";
import { sql } from "drizzle-orm";

async function creerJeuMinimal() {
  const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison", type: "principal" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({ origine: "systeme", nom: `Test-${Date.now()}`, champs: [] }).returning();
  return { p, z, t };
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete CASCADE`);
});

describe("element.zone_id NOT NULL", () => {
  it("rejette un élément sans zone_id", async () => {
    const { p, t } = await creerJeuMinimal();
    await expect(
      db.execute(sql`
        INSERT INTO element (propriete_id, nom, type_id, zone_id)
        VALUES (${p.id}, 'Sans zone', ${t.id}, NULL)
      `)
    ).rejects.toThrow(/null value in column "zone_id"/);
  });

  it("accepte un élément avec zone_id", async () => {
    const { p, z, t } = await creerJeuMinimal();
    const [e] = await db.insert(element).values({ proprieteId: p.id, nom: "Avec zone", typeId: t.id, zoneId: z.id }).returning();
    expect(e.zoneId).toBe(z.id);
  });
});
```

```ts
// tests/schema/niveau-tri.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { asc } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau } from "../../app/db/schema/index";
import { sql } from "drizzle-orm";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete CASCADE`);
});

describe("tri des niveaux par ordinal", () => {
  it("trie sous-sol < rez < étage indépendamment du nom", async () => {
    const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
    const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test" }).returning();
    const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();

    await db.insert(niveau).values([
      { batimentId: b.id, nom: "Étage", ordinal: 1 },
      { batimentId: b.id, nom: "Cave à vin", ordinal: -1 },
      { batimentId: b.id, nom: "Rez-de-chaussée", ordinal: 0 },
    ]);

    const niveaux = await db.select().from(niveau).where(sql`${niveau.batimentId} = ${b.id}`).orderBy(asc(niveau.ordinal));

    expect(niveaux.map((n) => n.nom)).toEqual(["Cave à vin", "Rez-de-chaussée", "Étage"]);
  });
});
```

- [ ] **Step 12: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS — les deux fichiers de test passent (4 tests).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: schéma Drizzle complet, migration initiale, tests zone_id et tri ordinal"
```

---

### Task 3: Déclencheur `recherche` (tsvector), index GIN

**Files:**
- Create: `drizzle/000N_recherche_trigger.sql` (migration custom, écrite à la main — `drizzle-kit` choisit le numéro suivant disponible automatiquement, ce sera `0002` si Task 2 a bien consommé `0001` pour sa propre migration custom du Step 8 bis)
- Test: `tests/schema/recherche-trigger.test.ts`

**Interfaces:**
- Consumes: table `element` (Task 2), colonnes `nom`, `alias`, `type_id`, `zone_id`, `systeme_id`, `details`.
- Produces: `element.recherche` alimentée automatiquement à l'INSERT et à l'UPDATE — aucune tâche suivante n'écrit jamais dans cette colonne depuis l'application.

Interprétation nécessaire pour que le critère d'acceptation "recherche 'robinet' remonte la vanne d'arrêt" fonctionne : la phrase du prompt "concatène nom, les alias, le nom du type, le nom de la zone, le nom du système" est ambiguë entre "les alias de l'élément" et "les alias du type". Dans le jeu de données réel, l'alias `"robinet"` est porté par `type_element.alias` (catalogue), pas par `element.alias` (généralement vide à la capture). Le déclencheur inclut donc **les deux** sources d'alias — sans ça, le critère d'acceptation ne peut pas être vrai. Documenté dans le README.

Limite assumée : le déclencheur ne se redéclenche que sur `INSERT OR UPDATE` de la ligne `element` elle-même, pas en cascade si on renomme une zone/un type/un système après coup (non demandé par le prompt, qui ne parle que du déclenchement "à l'insertion et à la mise à jour" de l'élément).

- [ ] **Step 1: Générer un fichier de migration custom vide**

```bash
set -a && source .env && set +a && npx drizzle-kit generate --custom --name=recherche_trigger
```

Expected: `drizzle/000N_recherche_trigger.sql` créé (vide, le numéro suit automatiquement), entrée ajoutée à `drizzle/meta/_journal.json`.

- [ ] **Step 2: Écrire le déclencheur dans le fichier généré**

```sql
-- drizzle/000N_recherche_trigger.sql
CREATE OR REPLACE FUNCTION maj_recherche_element() RETURNS trigger AS $$
DECLARE
  v_type_nom text;
  v_type_alias text;
  v_zone_nom text;
  v_systeme_nom text;
  v_details_texte text;
BEGIN
  SELECT nom, array_to_string(alias, ' ') INTO v_type_nom, v_type_alias
    FROM type_element WHERE id = NEW.type_id;

  SELECT nom INTO v_zone_nom FROM zone WHERE id = NEW.zone_id;

  IF NEW.systeme_id IS NOT NULL THEN
    SELECT nom INTO v_systeme_nom FROM systeme WHERE id = NEW.systeme_id;
  END IF;

  SELECT string_agg(value, ' ') INTO v_details_texte
    FROM jsonb_each_text(NEW.details);

  NEW.recherche := to_tsvector('french', concat_ws(' ',
    NEW.nom,
    array_to_string(NEW.alias, ' '),
    v_type_nom,
    v_type_alias,
    v_zone_nom,
    v_systeme_nom,
    v_details_texte
  ));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maj_recherche_element ON element;

CREATE TRIGGER trg_maj_recherche_element
  BEFORE INSERT OR UPDATE ON element
  FOR EACH ROW EXECUTE FUNCTION maj_recherche_element();
```

- [ ] **Step 3: Appliquer la migration**

```bash
npm run db:migrate
```

Expected: `Migrations appliquées.` (deux migrations désormais dans `__drizzle_migrations`).

- [ ] **Step 4: Write the failing test**

```ts
// tests/schema/recherche-trigger.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone, typeElement, element } from "../../app/db/schema/index";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete CASCADE`);
});

async function creerJeuMinimal() {
  const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Buanderie", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({
    origine: "systeme",
    nom: `Machin-${Date.now()}`,
    champs: [],
    alias: ["truc-bidule"],
  }).returning();
  return { p, z, t };
}

describe("déclencheur recherche", () => {
  it("alimente recherche à l'insertion, à partir du nom, de la zone et de l'alias du type", async () => {
    const { p, z, t } = await creerJeuMinimal();
    await db.insert(element).values({ proprieteId: p.id, nom: "Interrupteur principal", typeId: t.id, zoneId: z.id });

    const trouve = await db.execute(sql`
      SELECT nom FROM element
      WHERE recherche @@ plainto_tsquery('french', 'buanderie')
    `);
    expect(trouve.rows).toHaveLength(1);

    const trouveParAlias = await db.execute(sql`
      SELECT nom FROM element
      WHERE recherche @@ plainto_tsquery('french', 'truc-bidule')
    `);
    expect(trouveParAlias.rows).toHaveLength(1);
  });

  it("réalimente recherche à la mise à jour", async () => {
    const { p, z, t } = await creerJeuMinimal();
    const [e] = await db.insert(element).values({ proprieteId: p.id, nom: "Nom initial", typeId: t.id, zoneId: z.id }).returning();

    await db.update(element).set({ nom: "Nom modifié abricotier" }).where(sql`${element.id} = ${e.id}`);

    const trouve = await db.execute(sql`
      SELECT nom FROM element
      WHERE recherche @@ plainto_tsquery('french', 'abricotier')
    `);
    expect(trouve.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS (6 tests au total).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: déclencheur recherche tsvector, index GIN, tests"
```

---

### Task 4: Catalogue de types système (33 types, idempotent) + test alias

**Files:**
- Create: `scripts/seed-catalogue.ts`
- Test: `tests/schema/catalogue-alias.test.ts`

**Interfaces:**
- Consumes: `typeElement` (Task 2), index unique partiel `idx_type_element_nom_systeme_unique` (Task 2).
- Produces: 33 lignes `type_element` avec `origine = 'systeme'`, `proprieteId = null`, rejouable via `npm run seed:catalogue` sans doublon (`onConflictDoNothing`).

- [ ] **Step 1: Écrire les données du catalogue**

```ts
// scripts/seed-catalogue.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../app/db/schema/index";
import type { ChampDefinition } from "../app/db/schema/types";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

type Entree = { nom: string; icone: string; champs: ChampDefinition[]; alias: string[] };

const champ = (partial: Omit<ChampDefinition, "niveauMin" | "obligatoire"> & { niveauMin?: number; obligatoire?: boolean }): ChampDefinition => ({
  niveauMin: partial.niveauMin ?? 1,
  obligatoire: partial.obligatoire ?? false,
  ...partial,
});

const CATALOGUE: Entree[] = [
  // ── Intérieur ──────────────────────────────────────────────────────
  { nom: "Prise 230V", icone: "power-plug", alias: ["prise", "prise électrique", "prise de courant"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "circuit", label: "Circuit / disjoncteur", genre: "texte", niveauMin: 2 }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Prise RJ45", icone: "network", alias: ["prise réseau", "prise ethernet", "prise informatique"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "brasse_vers", label: "Brassée vers", genre: "texte", niveauMin: 2, unite: "panneau de brassage / baie" }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Interrupteur", icone: "toggle-left", alias: ["interrupteur", "va-et-vient", "variateur"], champs: [
    champ({ cle: "type_interrupteur", label: "Type", genre: "choix", options: ["simple", "va-et-vient", "variateur", "détecteur"] }),
    champ({ cle: "commande", label: "Commande quoi", genre: "texte" }),
  ]},
  { nom: "Tableau électrique", icone: "layout-grid", alias: ["tableau électrique", "disjoncteur général", "coffret électrique"], champs: [
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "nombre_disjoncteurs", label: "Nombre de disjoncteurs", genre: "nombre", niveauMin: 2 }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
  ]},
  { nom: "Disjoncteur", icone: "circle-power", alias: ["disjoncteur", "fusible", "coupe-circuit"], champs: [
    champ({ cle: "calibre", label: "Calibre", genre: "nombre", unite: "A", niveauMin: 2 }),
    champ({ cle: "type", label: "Type", genre: "choix", niveauMin: 2, options: ["différentiel", "magnétothermique"] }),
    champ({ cle: "circuit_protege", label: "Circuit protégé", genre: "texte" }),
  ]},
  { nom: "Luminaire", icone: "lightbulb", alias: ["luminaire", "lampe", "plafonnier", "applique"], champs: [
    champ({ cle: "type_ampoule", label: "Type d'ampoule", genre: "texte" }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "W" }),
    champ({ cle: "commande", label: "Commandé par", genre: "texte" }),
  ]},
  { nom: "Vanne d'arrêt", icone: "droplet", alias: ["robinet", "arrêt d'eau", "stop-eau", "vanne"], champs: [
    champ({ cle: "reseau", label: "Réseau", genre: "choix", options: ["eau froide", "eau chaude", "gaz"] }),
    champ({ cle: "coupe_quoi", label: "Coupe quoi", genre: "texte", niveauMin: 2 }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Robinet", icone: "droplet", alias: ["mitigeur", "robinetterie"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["mitigeur", "mélangeur", "simple"] }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Siphon", icone: "droplet", alias: ["bonde", "évacuation", "siphon de sol"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "diametre", label: "Diamètre", genre: "nombre", unite: "mm", niveauMin: 2 }),
  ]},
  { nom: "Chauffe-eau", icone: "flame", alias: ["ballon d'eau chaude", "cumulus", "boiler"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["électrique", "thermodynamique", "gaz", "solaire"] }),
    champ({ cle: "volume", label: "Volume", genre: "nombre", unite: "L" }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
    champ({ cle: "numero_serie", label: "Numéro de série", genre: "texte", niveauMin: 2 }),
    champ({ cle: "garantie_jusquau", label: "Garantie jusqu'au", genre: "date" }),
  ]},
  { nom: "Chaudière", icone: "flame", alias: ["chaudière", "chauffage central"], champs: [
    champ({ cle: "type_energie", label: "Énergie", genre: "choix", options: ["gaz", "fioul", "bois", "pompe à chaleur", "électrique"] }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "kW" }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "modele", label: "Modèle", genre: "texte" }),
    champ({ cle: "numero_serie", label: "Numéro de série", genre: "texte", niveauMin: 2 }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
    champ({ cle: "dernier_entretien", label: "Dernier entretien", genre: "date", niveauMin: 2 }),
  ]},
  { nom: "Radiateur", icone: "thermometer", alias: ["radiateur", "chauffage"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["eau chaude", "électrique", "sèche-serviettes"] }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "W" }),
  ]},
  { nom: "Thermostat", icone: "thermometer", alias: ["thermostat", "régulateur de température"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["filaire", "connecté", "mécanique"] }),
    champ({ cle: "zone_regulee", label: "Zone régulée", genre: "texte" }),
  ]},
  { nom: "Bouche de VMC", icone: "wind", alias: ["ventilation", "VMC", "bouche d'aération", "extraction d'air"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["entrée d'air", "extraction"] }),
    champ({ cle: "zone_desservie", label: "Zone desservie", genre: "texte" }),
  ]},
  { nom: "Lave-linge", icone: "washing-machine", alias: ["machine à laver", "lave-linge"], champs: [
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "modele", label: "Modèle", genre: "texte" }),
    champ({ cle: "date_achat", label: "Date d'achat", genre: "date" }),
    champ({ cle: "garantie_jusquau", label: "Garantie jusqu'au", genre: "date" }),
  ]},
  { nom: "Lave-vaisselle", icone: "washing-machine", alias: ["lave-vaisselle"], champs: [
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "modele", label: "Modèle", genre: "texte" }),
    champ({ cle: "date_achat", label: "Date d'achat", genre: "date" }),
    champ({ cle: "garantie_jusquau", label: "Garantie jusqu'au", genre: "date" }),
  ]},
  { nom: "Four", icone: "cooking-pot", alias: ["four", "four encastrable"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["encastrable", "pose libre", "vapeur", "micro-ondes combiné"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "date_achat", label: "Date d'achat", genre: "date" }),
  ]},
  { nom: "Hotte", icone: "fan", alias: ["hotte", "hotte aspirante", "extracteur de cuisine"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["aspirante", "recyclage"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
  ]},
  { nom: "Porte", icone: "door-open", alias: ["porte", "porte d'entrée", "porte-fenêtre"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["intérieure", "extérieure", "blindée", "coulissante"] }),
    champ({ cle: "materiau", label: "Matériau", genre: "texte" }),
    champ({ cle: "a_une_serrure", label: "A une serrure", genre: "booleen" }),
  ]},
  { nom: "Fenêtre", icone: "square", alias: ["fenêtre", "châssis", "baie vitrée"], champs: [
    champ({ cle: "type_vitrage", label: "Vitrage", genre: "choix", options: ["simple", "double", "triple"] }),
    champ({ cle: "materiau_cadre", label: "Matériau du cadre", genre: "texte" }),
    champ({ cle: "annee_pose", label: "Année de pose", genre: "date" }),
  ]},
  { nom: "Compteur électrique", icone: "gauge", alias: ["compteur électrique", "compteur EDF", "compteur d'électricité"], champs: [
    champ({ cle: "numero_compteur", label: "Numéro de compteur", genre: "texte", niveauMin: 2 }),
    champ({ cle: "fournisseur", label: "Fournisseur", genre: "texte" }),
    champ({ cle: "puissance_souscrite", label: "Puissance souscrite", genre: "nombre", unite: "kVA" }),
  ]},
  { nom: "Compteur d'eau", icone: "gauge", alias: ["compteur d'eau", "compteur d'eau froide"], champs: [
    champ({ cle: "numero_compteur", label: "Numéro de compteur", genre: "texte", niveauMin: 2 }),
    champ({ cle: "fournisseur", label: "Fournisseur", genre: "texte" }),
  ]},
  { nom: "Gaine technique", icone: "route", alias: ["gaine", "gaine technique", "chemin de câbles", "colonne montante"], champs: [
    champ({ cle: "contenu", label: "Contenu", genre: "texte", niveauMin: 2 }),
    champ({ cle: "trajet", label: "Trajet", genre: "texte", niveauMin: 2 }),
  ]},
  // ── Extérieur ──────────────────────────────────────────────────────
  { nom: "Vanne d'arrosage", icone: "droplet", alias: ["vanne d'arrosage", "électrovanne", "arrosage"], champs: [
    champ({ cle: "zone_arrosee", label: "Zone arrosée", genre: "texte" }),
    champ({ cle: "type", label: "Type", genre: "choix", options: ["manuelle", "électrovanne"] }),
  ]},
  { nom: "Programmateur d'arrosage", icone: "clock", alias: ["programmateur", "programmateur d'arrosage", "minuterie d'arrosage"], champs: [
    champ({ cle: "nombre_zones", label: "Nombre de zones", genre: "nombre" }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
  ]},
  { nom: "Éclairage extérieur", icone: "lightbulb", alias: ["éclairage extérieur", "spot extérieur", "luminaire extérieur"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["spot", "borne", "guirlande", "détecteur de mouvement"] }),
    champ({ cle: "commande", label: "Commandé par", genre: "texte" }),
  ]},
  { nom: "Portail motorisé", icone: "door-open", alias: ["portail", "portail électrique", "portail automatique"], champs: [
    champ({ cle: "type_motorisation", label: "Motorisation", genre: "choix", options: ["battant", "coulissant"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "telecommandes", label: "Nombre de télécommandes", genre: "nombre" }),
  ]},
  { nom: "Clôture", icone: "fence", alias: ["clôture", "grillage", "haie", "mur de clôture"], champs: [
    champ({ cle: "materiau", label: "Matériau", genre: "texte" }),
    champ({ cle: "hauteur", label: "Hauteur", genre: "nombre", unite: "m" }),
    champ({ cle: "longueur", label: "Longueur", genre: "nombre", unite: "m" }),
  ]},
  { nom: "Regard", icone: "square", alias: ["regard", "regard d'égout", "tampon"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["eaux usées", "eaux pluviales", "mixte"] }),
    champ({ cle: "profondeur", label: "Profondeur", genre: "nombre", unite: "cm", niveauMin: 2 }),
  ]},
  { nom: "Fosse", icone: "container", alias: ["fosse septique", "fosse toutes eaux", "assainissement"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["septique", "toutes eaux", "étanche"] }),
    champ({ cle: "volume", label: "Volume", genre: "nombre", unite: "L" }),
    champ({ cle: "derniere_vidange", label: "Dernière vidange", genre: "date" }),
  ]},
  { nom: "Pompe à chaleur extérieure", icone: "fan", alias: ["pompe à chaleur", "PAC", "unité extérieure"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["air-eau", "air-air"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "kW" }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
  ]},
  { nom: "Prise extérieure", icone: "power-plug", alias: ["prise extérieure", "prise de jardin"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "etanche", label: "Étanche", genre: "booleen" }),
  ]},
  { nom: "Cuve", icone: "container", alias: ["cuve", "citerne", "réservoir"], champs: [
    champ({ cle: "contenu", label: "Contenu", genre: "choix", options: ["eau de pluie", "fioul", "gaz"] }),
    champ({ cle: "volume", label: "Volume", genre: "nombre", unite: "L" }),
  ]},
];

```ts
async function main() {
  const valeurs = CATALOGUE.map((entree) => ({
    nom: entree.nom,
    icone: entree.icone,
    origine: "systeme" as const,
    champs: entree.champs,
    alias: entree.alias,
  }));

  // ON CONFLICT (nom) WHERE origine = 'systeme' cible précisément l'index
  // unique PARTIEL de Task 2 (idx_type_element_nom_systeme_unique). Un index
  // partiel ne peut pas être ciblé par "ON CONFLICT ON CONSTRAINT" (réservé
  // aux contraintes) : la syntaxe target + where est la bonne ici.
  const inserees = await db
    .insert(schema.typeElement)
    .values(valeurs)
    .onConflictDoNothing({ target: schema.typeElement.nom, where: sql`${schema.typeElement.origine} = 'systeme'` })
    .returning({ nom: schema.typeElement.nom });

  console.log(`Catalogue : ${inserees.length} nouveaux types sur ${CATALOGUE.length} (le reste existait déjà).`);
  await pool.end();
}

main();
```

- [ ] **Step 2: Lancer le seed deux fois**

```bash
npm run seed:catalogue
npm run seed:catalogue
```

Expected: premier run → "33 nouveaux types sur 33" ; second run → "0 nouveaux types sur 33".

- [ ] **Step 3: Write the failing test (alias → type)**

```ts
// tests/schema/catalogue-alias.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone, typeElement, element } from "../../app/db/schema/index";

describe("recherche par alias du catalogue", () => {
  it("« robinet » remonte un élément de type « Vanne d'arrêt »", async () => {
    const [u] = await db.insert(utilisateur).values({ email: `test-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
    const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Test alias" }).returning();
    const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
    const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Cave", ordinal: -1 }).returning();
    const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Local technique", type: "technique" }).returning();

    const [type] = await db.select().from(typeElement).where(sql`${typeElement.nom} = 'Vanne d''arrêt' AND ${typeElement.origine} = 'systeme'`);
    expect(type, "le catalogue doit avoir été chargé avant ce test (npm run seed:catalogue)").toBeDefined();

    await db.insert(element).values({ proprieteId: p.id, nom: "Arrivée générale", typeId: type.id, zoneId: z.id });

    const trouve = await db.execute(sql`
      SELECT e.nom FROM element e
      JOIN type_element t ON t.id = e.type_id
      WHERE e.recherche @@ plainto_tsquery('french', 'robinet')
        AND e.propriete_id = ${p.id}
    `);

    expect(trouve.rows).toHaveLength(1);
    expect((trouve.rows[0] as { nom: string }).nom).toBe("Arrivée générale");
  });
});
```

Ce test suppose le catalogue déjà chargé dans la base de test. Ajouter au README l'ordre exact : `db:migrate` puis `seed:catalogue` sur `gestion_immobiliere_test` avant `npm test` (ou charger le catalogue dans un `beforeAll` global si l'exécutant préfère l'automatiser — décision libre, à documenter).

- [ ] **Step 4: Charger le catalogue dans la base de test puis lancer les tests**

```bash
set -a && source .env.test && set +a && npx tsx scripts/seed-catalogue.ts
npm test
```

Expected: PASS (7 tests au total).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: catalogue de 33 types système avec alias, idempotent"
```

---

### Task 5: Jeu de données d'exemple (idempotent)

**Files:**
- Create: `scripts/seed-exemple.ts`

**Interfaces:**
- Consumes: catalogue chargé (Task 4), `@node-rs/argon2` (Task 6 — cette tâche peut être faite avant Task 6 si le hash de mot de passe de l'utilisateur de démo est codé en dur temporairement, mais l'ordre recommandé est Task 6 puis Task 5 pour réutiliser `hacherMotDePasse`).
- Produces: une propriété "Maison d'exemple" complète, rejouable via `npm run seed:exemple` sans doublon (garde applicatif sur le nom de la propriété).

- [ ] **Step 1: Écrire le script**

```ts
// scripts/seed-exemple.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import pg from "pg";
import * as schema from "../app/db/schema/index";
import { hacherMotDePasse } from "../app/lib/auth/password.server";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const NOM_PROPRIETE = "Maison d'exemple";
const EMAIL_DEMO = "demo@gestion-immobiliere.local";
const MOT_DE_PASSE_DEMO = "demo1234";

async function idType(nom: string) {
  const [t] = await db.select().from(schema.typeElement)
    .where(and(eq(schema.typeElement.nom, nom), eq(schema.typeElement.origine, "systeme")));
  if (!t) throw new Error(`Type "${nom}" introuvable — lancer "npm run seed:catalogue" avant "npm run seed:exemple".`);
  return t.id;
}

async function main() {
  const [existe] = await db.select().from(schema.propriete).where(eq(schema.propriete.nom, NOM_PROPRIETE));
  if (existe) {
    console.log(`"${NOM_PROPRIETE}" existe déjà (id ${existe.id}) — rien à faire.`);
    await pool.end();
    return;
  }

  let [demo] = await db.select().from(schema.utilisateur).where(eq(schema.utilisateur.email, EMAIL_DEMO));
  if (!demo) {
    [demo] = await db.insert(schema.utilisateur).values({
      email: EMAIL_DEMO,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE_DEMO),
    }).returning();
    console.log(`Utilisateur de démonstration créé : ${EMAIL_DEMO} / ${MOT_DE_PASSE_DEMO} (À NE JAMAIS UTILISER EN PRODUCTION)`);
  }

  const [propriete] = await db.insert(schema.propriete).values({
    proprietaireId: demo.id,
    nom: NOM_PROPRIETE,
    adresse: "12 chemin des Vignes, 1260 Nyon",
  }).returning();

  const [maison] = await db.insert(schema.batiment).values({ proprieteId: propriete.id, nom: "Maison principale", type: "principal", ordre: 0 }).returning();
  const [garage] = await db.insert(schema.batiment).values({ proprieteId: propriete.id, nom: "Garage", type: "garage", ordre: 1 }).returning();

  const [cave] = await db.insert(schema.niveau).values({ batimentId: maison.id, nom: "Cave", ordinal: -1, ordre: 0 }).returning();
  const [rez] = await db.insert(schema.niveau).values({ batimentId: maison.id, nom: "Rez-de-chaussée", ordinal: 0, ordre: 1 }).returning();
  const [etage] = await db.insert(schema.niveau).values({ batimentId: maison.id, nom: "Étage", ordinal: 1, ordre: 2 }).returning();
  const [rezGarage] = await db.insert(schema.niveau).values({ batimentId: garage.id, nom: "Rez", ordinal: 0, ordre: 0 }).returning();

  const zonesInterieures = await db.insert(schema.zone).values([
    { proprieteId: propriete.id, niveauId: cave.id, nom: "Cave", type: "interieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: cave.id, nom: "Local technique", type: "technique", ordre: 1 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "Cuisine", type: "interieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "Salon", type: "interieur", ordre: 1 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "Entrée", type: "interieur", ordre: 2 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "WC", type: "interieur", ordre: 3 },
    { proprieteId: propriete.id, niveauId: etage.id, nom: "Chambre 1", type: "interieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: etage.id, nom: "Chambre 2", type: "interieur", ordre: 1 },
    { proprieteId: propriete.id, niveauId: etage.id, nom: "Salle de bain", type: "interieur", ordre: 2 },
    { proprieteId: propriete.id, niveauId: rezGarage.id, nom: "Garage", type: "interieur", ordre: 0 },
  ]).returning();

  const [jardin] = await db.insert(schema.zone).values({ proprieteId: propriete.id, niveauId: null, nom: "Jardin", type: "exterieur", ordre: 0 }).returning();
  const zonesExterieures = await db.insert(schema.zone).values([
    { proprieteId: propriete.id, niveauId: null, nom: "Potager", parentId: jardin.id, type: "exterieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: null, nom: "Terrasse", type: "exterieur", ordre: 1 },
  ]).returning();

  const zone = (nom: string) => [...zonesInterieures, jardin, ...zonesExterieures].find((z) => z.nom === nom)!;

  const [electricite, sanitaire, chauffage] = await db.insert(schema.systeme).values([
    { proprieteId: propriete.id, nom: "Électricité", icone: "zap" },
    { proprieteId: propriete.id, nom: "Sanitaire", icone: "droplet" },
    { proprieteId: propriete.id, nom: "Chauffage", icone: "flame" },
  ]).returning();

  const elements: Array<{ nom: string; type: string; zoneNom: string; systemeId?: number; details?: Record<string, unknown>; niveau?: number }> = [
    { nom: "Prise plan de travail", type: "Prise 230V", zoneNom: "Cuisine", systemeId: electricite.id },
    { nom: "Interrupteur entrée cuisine", type: "Interrupteur", zoneNom: "Cuisine", systemeId: electricite.id },
    { nom: "Four encastrable", type: "Four", zoneNom: "Cuisine", details: { marque: "Bosch" } },
    { nom: "Hotte aspirante", type: "Hotte", zoneNom: "Cuisine" },
    { nom: "Robinet évier", type: "Robinet", zoneNom: "Cuisine", systemeId: sanitaire.id },
    { nom: "Prise RJ45 salon", type: "Prise RJ45", zoneNom: "Salon", systemeId: electricite.id },
    { nom: "Luminaire suspension", type: "Luminaire", zoneNom: "Salon", systemeId: electricite.id },
    { nom: "Radiateur salon", type: "Radiateur", zoneNom: "Salon", systemeId: chauffage.id },
    { nom: "Porte d'entrée", type: "Porte", zoneNom: "Entrée", details: { materiau: "bois massif" } },
    { nom: "Tableau électrique principal", type: "Tableau électrique", zoneNom: "Local technique", systemeId: electricite.id, niveau: 2 },
    { nom: "Disjoncteur général", type: "Disjoncteur", zoneNom: "Local technique", systemeId: electricite.id, niveau: 2 },
    { nom: "Chaudière", type: "Chaudière", zoneNom: "Local technique", systemeId: chauffage.id, details: { type_energie: "gaz", marque: "Viessmann" }, niveau: 2 },
    { nom: "Vanne d'arrêt générale", type: "Vanne d'arrêt", zoneNom: "Local technique", systemeId: sanitaire.id, niveau: 2 },
    { nom: "Compteur d'eau", type: "Compteur d'eau", zoneNom: "Cave", systemeId: sanitaire.id, niveau: 2 },
    { nom: "Compteur électrique", type: "Compteur électrique", zoneNom: "Cave", systemeId: electricite.id, niveau: 2 },
    { nom: "Gaine technique cave-étage", type: "Gaine technique", zoneNom: "Cave", niveau: 2 },
    { nom: "Chauffe-eau", type: "Chauffe-eau", zoneNom: "Cave", systemeId: sanitaire.id, details: { volume: 200 } },
    { nom: "Prise établi", type: "Prise 230V", zoneNom: "Garage", systemeId: electricite.id },
    { nom: "Interrupteur portail", type: "Interrupteur", zoneNom: "Garage", systemeId: electricite.id },
    { nom: "Fenêtre chambre 1", type: "Fenêtre", zoneNom: "Chambre 1", details: { type_vitrage: "double" } },
    { nom: "Radiateur chambre 1", type: "Radiateur", zoneNom: "Chambre 1", systemeId: chauffage.id },
    { nom: "Fenêtre chambre 2", type: "Fenêtre", zoneNom: "Chambre 2" },
    { nom: "Thermostat étage", type: "Thermostat", zoneNom: "Chambre 2", systemeId: chauffage.id },
    { nom: "Robinet salle de bain", type: "Robinet", zoneNom: "Salle de bain", systemeId: sanitaire.id },
    { nom: "Siphon douche", type: "Siphon", zoneNom: "Salle de bain", systemeId: sanitaire.id },
    { nom: "Bouche VMC salle de bain", type: "Bouche de VMC", zoneNom: "Salle de bain" },
    { nom: "Vanne d'arrosage jardin", type: "Vanne d'arrosage", zoneNom: "Jardin", systemeId: sanitaire.id },
    { nom: "Programmateur d'arrosage", type: "Programmateur d'arrosage", zoneNom: "Local technique", systemeId: sanitaire.id, niveau: 2 },
    { nom: "Éclairage terrasse", type: "Éclairage extérieur", zoneNom: "Terrasse", systemeId: electricite.id },
    { nom: "Prise extérieure terrasse", type: "Prise extérieure", zoneNom: "Terrasse", systemeId: electricite.id },
    { nom: "Portail motorisé", type: "Portail motorisé", zoneNom: "Jardin" },
  ];

  const elementsInseres: Record<string, number> = {};
  for (const e of elements) {
    const [inserted] = await db.insert(schema.element).values({
      proprieteId: propriete.id,
      nom: e.nom,
      typeId: await idType(e.type),
      zoneId: zone(e.zoneNom).id,
      systemeId: e.systemeId,
      niveau: e.niveau ?? 3,
      details: e.details ?? {},
    }).returning();
    elementsInseres[e.nom] = inserted.id;
  }

  const [plombier, electricien] = await db.insert(schema.intervenant).values([
    { proprieteId: propriete.id, nom: "Jean Dupont", metier: "Plombier", tel: "+41 79 000 00 00", niveau: 2 },
    { proprieteId: propriete.id, nom: "Atelier Martin", metier: "Électricien", tel: "+41 79 111 11 11", niveau: 2 },
  ]).returning();

  const [remplacementChauffeEau] = await db.insert(schema.evenement).values({
    proprieteId: propriete.id,
    titre: "Remplacement du chauffe-eau",
    dateDebut: "2024-03-12",
    dateFin: "2024-03-12",
    type: "renovation",
    description: "Ancien chauffe-eau remplacé après fuite.",
    cout: "1450.00",
  }).returning();

  await db.insert(schema.evenementElement).values({ evenementId: remplacementChauffeEau.id, elementId: elementsInseres["Chauffe-eau"] });
  await db.insert(schema.evenementIntervenant).values({ evenementId: remplacementChauffeEau.id, intervenantId: plombier.id });

  const [tableauElectrique] = await db.insert(schema.evenement).values({
    proprieteId: propriete.id,
    titre: "Mise aux normes du tableau électrique",
    dateDebut: "2023-09-01",
    dateFin: "2023-09-03",
    type: "renovation",
    description: "Ajout d'un différentiel 30mA et remplacement de deux disjoncteurs.",
    cout: "890.00",
  }).returning();

  await db.insert(schema.evenementElement).values({ evenementId: tableauElectrique.id, elementId: elementsInseres["Tableau électrique principal"] });
  await db.insert(schema.evenementIntervenant).values({ evenementId: tableauElectrique.id, intervenantId: electricien.id });

  console.log(`"${NOM_PROPRIETE}" créée (id ${propriete.id}) avec ${elements.length} éléments, 3 systèmes, 2 intervenants, 2 événements.`);
  await pool.end();
}

main();
```

- [ ] **Step 2: Lancer le seed deux fois**

```bash
npm run seed:exemple
npm run seed:exemple
```

Expected: premier run → message de création complet ; second run → `"Maison d'exemple" existe déjà (id N) — rien à faire.`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: jeu de données d'exemple idempotent (maison, garage, jardin, 31 éléments)"
```

---

### Task 6: Authentification — cœur (hachage, cookie, sessions)

**Files:**
- Create: `app/lib/auth/password.server.ts`, `app/lib/auth/cookie.server.ts`, `app/lib/auth/session.server.ts`

**Interfaces:**
- Produces: `hacherMotDePasse(motDePasse: string): Promise<string>`, `verifierMotDePasse(hash: string, motDePasse: string): Promise<boolean>`, `creerSession(request, utilisateurId): Promise<Response>` (redirige avec cookie posé), `getUtilisateurId(request): Promise<number | null>`, `requireUtilisateurId(request): Promise<number>` (lève une redirection vers `/connexion` sinon), `detruireSession(request): Promise<Response>`.
- Consumes: `utilisateur`, `session` (Task 2).

- [ ] **Step 1: `app/lib/auth/password.server.ts`**

```ts
// app/lib/auth/password.server.ts
import { hash, verify } from "@node-rs/argon2";

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse);
}

export async function verifierMotDePasse(hashStocke: string, motDePasse: string): Promise<boolean> {
  return verify(hashStocke, motDePasse);
}
```

- [ ] **Step 2: `app/lib/auth/cookie.server.ts`**

```ts
// app/lib/auth/cookie.server.ts
import { createCookie } from "react-router";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET manquant (voir .env.example).");
}

export const sessionCookie = createCookie("gi_session", {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  secrets: [process.env.SESSION_SECRET],
  maxAge: 60 * 60 * 24 * 30, // 30 jours
  path: "/",
});
```

- [ ] **Step 3: `app/lib/auth/session.server.ts`**

```ts
// app/lib/auth/session.server.ts
import { randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { redirect } from "react-router";
import { db } from "../../db/client";
import { session as sessionTable } from "../../db/schema/index";
import { sessionCookie } from "./cookie.server";

const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export async function creerSession(utilisateurId: number, redirectTo: string): Promise<Response> {
  const jeton = randomBytes(32).toString("hex");
  const expireLe = new Date(Date.now() + DUREE_SESSION_MS);

  await db.insert(sessionTable).values({ id: jeton, utilisateurId, expireLe });

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionCookie.serialize(jeton) },
  });
}

async function lireJetonCookie(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie");
  const valeur = await sessionCookie.parse(cookieHeader);
  return typeof valeur === "string" ? valeur : null;
}

export async function getUtilisateurId(request: Request): Promise<number | null> {
  const jeton = await lireJetonCookie(request);
  if (!jeton) return null;

  const [ligne] = await db.select().from(sessionTable)
    .where(and(eq(sessionTable.id, jeton), gt(sessionTable.expireLe, new Date())));

  return ligne?.utilisateurId ?? null;
}

export async function requireUtilisateurId(request: Request): Promise<number> {
  const utilisateurId = await getUtilisateurId(request);
  if (!utilisateurId) {
    throw redirect(`/connexion?depuis=${encodeURIComponent(new URL(request.url).pathname)}`);
  }
  return utilisateurId;
}

export async function detruireSession(request: Request): Promise<Response> {
  const jeton = await lireJetonCookie(request);
  if (jeton) {
    await db.delete(sessionTable).where(eq(sessionTable.id, jeton));
  }
  return redirect("/connexion", {
    headers: { "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }) },
  });
}
```

- [ ] **Step 4: Vérifier la compilation**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: authentification — hachage argon2, cookie de session, sessions en base"
```

---

### Task 7: Routes d'authentification, arbre de routes protégé, accueil "mes propriétés"

**Files:**
- Create: `app/routes.ts` (rempli), `app/routes/_public/login.tsx`, `app/routes/_public/register.tsx`, `app/routes/_public/logout.tsx`, `app/routes/_app/layout.tsx`, `app/routes/_app/proprietes._index.tsx`, `app/routes/_app/proprietes.$proprieteId._index.tsx`, `app/lib/db/proprieteAccess.server.ts`

**Interfaces:**
- Consumes: `requireUtilisateurId`, `creerSession`, `detruireSession` (Task 6).
- Produces: `requireProprieteAccess(utilisateurId, proprieteIdParam): Promise<Propriete>` (lève une `Response` 404 si la propriété n'existe pas ou n'appartient pas à l'utilisateur — **jamais** un écran "accès refusé" qui confirmerait l'existence de la ressource à quelqu'un d'autre), utilisé par toutes les routes CRUD des tâches suivantes. Arbre de routes définitif : `_public` (connexion/inscription/déconnexion, non protégé) séparé de `_app` (tout le reste, protégé) — la future page `/p/:jeton` (étape 3) prendra place dans un troisième arbre `_share`, non protégé, non construit ici mais dont la place est réservée par cette séparation.

- [ ] **Step 1: `app/routes.ts` — uniquement les routes que CETTE tâche construit**

React Router v7 résout au démarrage (`npm run dev`/`build`/`typecheck`) chaque fichier référencé dans `routes.ts` : y lister un fichier qui n'existe pas encore casse le serveur. `routes.ts` est donc rempli **progressivement** — chaque tâche CRUD suivante (9 à 14) y ajoute sa propre tranche, jamais toutes les routes d'un coup. À cette étape, seules les routes publiques et le tableau de bord existent :

```ts
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
    ]),
  ]),
] satisfies RouteConfig;
```

Convention appliquée dans tout le reste du plan : chaque fichier de route importe ses types de loader/action depuis `"react-router"` (`LoaderFunctionArgs`, `ActionFunctionArgs`), pas depuis les types générés `./+types/*` — évite d'exiger un premier `npm run dev` avant que `npm run typecheck` passe.

- [ ] **Step 2: `app/lib/db/proprieteAccess.server.ts`**

```ts
// app/lib/db/proprieteAccess.server.ts
import { eq, and } from "drizzle-orm";
import { db } from "../../db/client";
import { propriete } from "../../db/schema/index";

export async function requireProprieteAccess(utilisateurId: number, proprieteIdParam: string | undefined) {
  const proprieteId = Number(proprieteIdParam);
  if (!proprieteIdParam || Number.isNaN(proprieteId)) {
    throw new Response("Propriété introuvable", { status: 404 });
  }

  const [ligne] = await db.select().from(propriete)
    .where(and(eq(propriete.id, proprieteId), eq(propriete.proprietaireId, utilisateurId)));

  if (!ligne) {
    // Le filtre de permission est dans la requête : ne jamais confirmer par
    // un écran "accès refusé" qu'une propriété existe pour quelqu'un d'autre.
    throw new Response("Propriété introuvable", { status: 404 });
  }

  return ligne;
}
```

- [ ] **Step 3: `app/routes/_public/login.tsx`, `register.tsx`, `logout.tsx`**

```tsx
// app/routes/_public/login.tsx
import { Form, useActionData, useSearchParams } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { utilisateur } from "../../db/schema/index";
import { verifierMotDePasse } from "../../lib/auth/password.server";
import { creerSession } from "../../lib/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const motDePasse = String(form.get("motDePasse") ?? "");
  const depuis = String(form.get("depuis") ?? "/");

  const [ligne] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
  if (!ligne || !(await verifierMotDePasse(ligne.motDePasseHash, motDePasse))) {
    return { erreur: "Email ou mot de passe incorrect." };
  }

  return creerSession(ligne.id, depuis || "/");
}

export default function Connexion() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const depuis = searchParams.get("depuis") ?? "/";

  return (
    <main>
      <h1>Connexion</h1>
      <Form method="post">
        <input type="hidden" name="depuis" value={depuis} />
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="motDePasse" required />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Se connecter</button>
      </Form>
      <p><a href="/inscription">Créer un compte</a></p>
    </main>
  );
}
```

```tsx
// app/routes/_public/register.tsx
import { Form, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { utilisateur } from "../../db/schema/index";
import { hacherMotDePasse } from "../../lib/auth/password.server";
import { creerSession } from "../../lib/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const motDePasse = String(form.get("motDePasse") ?? "");

  if (!email || motDePasse.length < 8) {
    return { erreur: "Email requis, mot de passe d'au moins 8 caractères." };
  }

  const [existe] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
  if (existe) {
    return { erreur: "Un compte existe déjà avec cet email." };
  }

  const [cree] = await db.insert(utilisateur)
    .values({ email, motDePasseHash: await hacherMotDePasse(motDePasse) })
    .returning();

  return creerSession(cree.id, "/");
}

export default function Inscription() {
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Créer un compte</h1>
      <Form method="post">
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="motDePasse" required minLength={8} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer le compte</button>
      </Form>
      <p><a href="/connexion">J'ai déjà un compte</a></p>
    </main>
  );
}
```

```tsx
// app/routes/_public/logout.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { detruireSession } from "../../lib/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
  return detruireSession(request);
}

export async function loader({}: LoaderFunctionArgs) {
  return redirect("/");
}
```

- [ ] **Step 4: `app/routes/_app/layout.tsx`**

```tsx
// app/routes/_app/layout.tsx
import { Outlet, Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { db } from "../../db/client";
import { utilisateur } from "../../db/schema/index";

export async function loader({ request }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const [moi] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurId));
  return { email: moi.email };
}

export default function AppLayout() {
  const { email } = useLoaderData<typeof loader>();
  return (
    <div>
      <header>
        <Link to="/">gestionImmobiliere</Link>
        <span>{email}</span>
        <form method="post" action="/deconnexion">
          <button type="submit">Déconnexion</button>
        </form>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: `app/routes/_app/proprietes._index.tsx` (accueil : liste + création)**

```tsx
// app/routes/_app/proprietes._index.tsx
import { Form, Link, useLoaderData, useActionData, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { propriete } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const proprietes = await db.select().from(propriete).where(eq(propriete.proprietaireId, utilisateurId));
  return { proprietes };
}

export async function action({ request }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();

  if (!nom) {
    return { erreur: "Le nom est obligatoire." };
  }

  const [cree] = await db.insert(propriete).values({ proprietaireId: utilisateurId, nom }).returning();
  return redirect(`/proprietes/${cree.id}`);
}

export default function MesProprietes() {
  const { proprietes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Mes propriétés</h1>
      <ul>
        {proprietes.map((p) => (
          <li key={p.id}>
            <Link to={`/proprietes/${p.id}`}>{p.nom}</Link>
          </li>
        ))}
      </ul>
      {proprietes.length === 0 && <p>Aucune propriété pour l'instant.</p>}

      <h2>Ajouter une propriété</h2>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 6: `app/routes/_app/proprietes.$proprieteId._index.tsx` (tableau de bord d'une propriété)**

```tsx
// app/routes/_app/proprietes.$proprieteId._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  return { propriete };
}

export default function TableauDeBordPropriete() {
  const { propriete } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>{propriete.nom}</h1>
      <nav>
        <Link to="batiments">Bâtiments et niveaux</Link>
        <Link to="zones">Zones</Link>
        <Link to="systemes">Systèmes</Link>
        <Link to="elements">Éléments</Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 7: Vérifier manuellement — critère d'acceptation "un compte se crée, se connecte, et les routes protégées le sont réellement"**

```bash
npm run db:migrate
npm run dev
```

Dans le navigateur : ouvrir `/`, être redirigé vers `/connexion?depuis=%2F` (route protégée). Créer un compte via `/inscription`, être redirigé vers `/` connecté, créer une propriété, être redirigé vers `/proprietes/:id`. Se déconnecter, retenter `/proprietes/:id` directement → redirection vers `/connexion`. Ouvrir l'URL d'une propriété qui n'appartient pas au compte connecté (id d'une autre propriété) → 404, jamais un écran "accès refusé".

Expected: chaque étape se comporte comme décrit.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: routes d'authentification, arbre de routes protégé, accueil mes propriétés"
```

---

### Task 8: Moteur de validation des champs dynamiques

**Files:**
- Create: `app/lib/forms/champSchema.ts`
- Test: `tests/forms/champ-validation.test.ts`

**Interfaces:**
- Consumes: `ChampDefinition` (Task 2, `app/db/schema/types.ts`).
- Produces: `schemaPourChamps(champs: ChampDefinition[]): z.ZodObject`, `validerDetails(champs: ChampDefinition[], details: unknown): z.SafeParseReturnType` — consommé par le formulaire d'élément dynamique (Task 13) et l'éditeur de type perso (Task 14).

- [ ] **Step 1: `app/lib/forms/champSchema.ts`**

```ts
// app/lib/forms/champSchema.ts
import { z } from "zod";
import type { ChampDefinition } from "../../db/schema/types";

export function schemaPourChamps(champs: ChampDefinition[]) {
  const forme: Record<string, z.ZodTypeAny> = {};

  for (const champ of champs) {
    if (champ.genre === "fichier") {
      // Décision verrouillée #6 : le téléversement n'existe pas encore
      // (étape 6). Toujours optionnel, quel que soit `obligatoire`.
      forme[champ.cle] = z.any().optional();
      continue;
    }

    let base: z.ZodTypeAny;
    switch (champ.genre) {
      case "texte":
        base = z.string().min(1);
        break;
      case "nombre":
        base = z.coerce.number();
        break;
      case "date":
        base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)");
        break;
      case "booleen":
        base = z.coerce.boolean();
        break;
      case "choix": {
        if (!champ.options || champ.options.length === 0) {
          throw new Error(`Le champ "${champ.cle}" est de genre "choix" mais ne définit aucune option.`);
        }
        base = z.enum(champ.options as [string, ...string[]]);
        break;
      }
    }

    forme[champ.cle] = champ.obligatoire ? base : base.optional().nullable();
  }

  // .passthrough() : un `details` existant peut porter la valeur d'un champ
  // retiré du type depuis (règle non négociable #3 — masqué, jamais effacé).
  return z.object(forme).passthrough();
}

export function validerDetails(champs: ChampDefinition[], details: unknown) {
  return schemaPourChamps(champs).safeParse(details);
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/forms/champ-validation.test.ts
import { describe, it, expect } from "vitest";
import { validerDetails } from "../../app/lib/forms/champSchema";
import type { ChampDefinition } from "../../app/db/schema/types";

const champsChaudiere: ChampDefinition[] = [
  { cle: "puissance", label: "Puissance", genre: "nombre", unite: "kW", niveauMin: 1, obligatoire: true },
  { cle: "type_energie", label: "Énergie", genre: "choix", niveauMin: 1, obligatoire: true, options: ["gaz", "fioul", "bois"] },
  { cle: "dernier_entretien", label: "Dernier entretien", genre: "date", niveauMin: 2, obligatoire: false },
];

describe("validerDetails", () => {
  it("accepte un details conforme", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "gaz" });
    expect(resultat.success).toBe(true);
  });

  it("rejette un champ obligatoire manquant", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24 });
    expect(resultat.success).toBe(false);
  });

  it("rejette une valeur hors de la liste choix", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "nucléaire" });
    expect(resultat.success).toBe(false);
  });

  it("rejette une date mal formée", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "gaz", dernier_entretien: "12/03/2024" });
    expect(resultat.success).toBe(false);
  });

  it("laisse passer une clé d'un champ retiré du type (passthrough)", () => {
    const resultat = validerDetails(champsChaudiere, { puissance: 24, type_energie: "gaz", ancien_champ_retire: "valeur historique" });
    expect(resultat.success).toBe(true);
  });

  it("lève une erreur explicite si un champ 'choix' ne définit aucune option", () => {
    const champsInvalides: ChampDefinition[] = [{ cle: "x", label: "X", genre: "choix", niveauMin: 1, obligatoire: false }];
    expect(() => validerDetails(champsInvalides, {})).toThrow(/aucune option/);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS (13 tests au total).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: moteur de validation des champs dynamiques (zod)"
```

---

### Task 9: Arbre bâtiment → niveau → zone, sélecteur de zone, CRUD bâtiment

**Files:**
- Create: `app/lib/zoneTree.ts`, `app/components/ZoneSelector.tsx`, `app/routes/_app/batiments._index.tsx`, `app/routes/_app/batiments.nouveau.tsx`, `app/routes/_app/batiments.$batimentId.modifier.tsx`
- Modify: `app/routes.ts` (ajoute le préfixe `batiments`)

**Interfaces:**
- Produces: `chargerArbreZones(proprieteId): Promise<{ arbre, zonesExterieures }>` et `<ZoneSelector arbre={...} name="zoneId" defaultValue={...} />`, réutilisés par les CRUD zone (Task 11) et élément (Task 13).

- [ ] **Step 0: Ajouter le préfixe `batiments` à `app/routes.ts`**

Dans le tableau `...prefix("proprietes/:proprieteId", [ ... ])` créé en Task 7, ajouter, juste après `index("routes/_app/proprietes.$proprieteId._index.tsx")` :

```ts
...prefix("batiments", [
  index("routes/_app/batiments._index.tsx"),
  route("nouveau", "routes/_app/batiments.nouveau.tsx"),
  route(":batimentId/modifier", "routes/_app/batiments.$batimentId.modifier.tsx"),
]),
```

(Les routes des niveaux, `:batimentId/niveaux/nouveau` et `niveaux/:niveauId/modifier`, sont ajoutées par la Task 10 — pas ici. Ne pas les ajouter en avance : un fichier référencé avant d'exister casse `npm run dev`.)

- [ ] **Step 1: `app/lib/zoneTree.ts`**

```ts
// app/lib/zoneTree.ts
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { batiment, niveau, zone } from "../db/schema/index";

export type ZoneAvecEnfants = typeof zone.$inferSelect & { enfants: ZoneAvecEnfants[] };

function grouperParParent(zones: (typeof zone.$inferSelect)[]): ZoneAvecEnfants[] {
  const parId = new Map<number, ZoneAvecEnfants>();
  for (const z of zones) parId.set(z.id, { ...z, enfants: [] });

  const racines: ZoneAvecEnfants[] = [];
  for (const z of parId.values()) {
    if (z.parentId && parId.has(z.parentId)) {
      parId.get(z.parentId)!.enfants.push(z);
    } else {
      racines.push(z);
    }
  }
  return racines;
}

export async function chargerArbreZones(proprieteId: number) {
  const batiments = await db.select().from(batiment).where(eq(batiment.proprieteId, proprieteId)).orderBy(asc(batiment.ordre));
  const idsBatiments = batiments.map((b) => b.id);

  const niveaux = idsBatiments.length
    ? await db.select().from(niveau).where(inArray(niveau.batimentId, idsBatiments)).orderBy(asc(niveau.ordinal))
    : [];

  const zones = await db.select().from(zone).where(eq(zone.proprieteId, proprieteId)).orderBy(asc(zone.ordre));

  const arbre = batiments.map((b) => ({
    batiment: b,
    niveaux: niveaux
      .filter((n) => n.batimentId === b.id)
      .map((n) => ({
        niveau: n,
        zones: grouperParParent(zones.filter((z) => z.niveauId === n.id)),
      })),
  }));

  // niveauId NULL = zone extérieure (le seul cas où il est nul), rattachée
  // à la propriété et non à un niveau.
  const zonesExterieures = grouperParParent(zones.filter((z) => z.niveauId === null));

  return { arbre, zonesExterieures };
}
```

- [ ] **Step 2: `app/components/ZoneSelector.tsx`**

```tsx
// app/components/ZoneSelector.tsx
import type { chargerArbreZones, ZoneAvecEnfants } from "../lib/zoneTree";

type Arbre = Awaited<ReturnType<typeof chargerArbreZones>>;

function OptionsZone({ zones, profondeur = 0 }: { zones: ZoneAvecEnfants[]; profondeur?: number }) {
  return (
    <>
      {zones.map((z) => (
        <>
          <option key={z.id} value={z.id}>
            {"— ".repeat(profondeur)}
            {z.nom}
          </option>
          {z.enfants.length > 0 && <OptionsZone zones={z.enfants} profondeur={profondeur + 1} />}
        </>
      ))}
    </>
  );
}

// Vocabulaire "zone", jamais "pièce" (règle non négociable #6).
export function ZoneSelector({ arbre, name, defaultValue }: { arbre: Arbre; name: string; defaultValue?: number }) {
  return (
    <select name={name} defaultValue={defaultValue} required>
      <option value="">— choisir une zone —</option>
      {arbre.arbre.flatMap(({ batiment, niveaux }) =>
        niveaux.map(({ niveau, zones }) => (
          <optgroup key={niveau.id} label={`${batiment.nom} — ${niveau.nom}`}>
            <OptionsZone zones={zones} />
          </optgroup>
        ))
      )}
      {arbre.zonesExterieures.length > 0 && (
        <optgroup label="Extérieur">
          <OptionsZone zones={arbre.zonesExterieures} />
        </optgroup>
      )}
    </select>
  );
}
```

- [ ] **Step 3: `app/routes/_app/batiments._index.tsx`**

```tsx
// app/routes/_app/batiments._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones } from "../../lib/zoneTree";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { arbre } = await chargerArbreZones(propriete.id);
  return { propriete, arbre };
}

export default function ListeBatiments() {
  const { propriete, arbre } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>Bâtiments et niveaux — {propriete.nom}</h1>
      <Link to={`/proprietes/${propriete.id}/batiments/nouveau`}>Ajouter un bâtiment</Link>
      {arbre.map(({ batiment, niveaux }) => (
        <section key={batiment.id}>
          <h2>
            {batiment.nom} ({batiment.type})
            <Link to={`/proprietes/${propriete.id}/batiments/${batiment.id}/modifier`}> Modifier</Link>
          </h2>
          <ul>
            {niveaux.map(({ niveau }) => (
              <li key={niveau.id}>
                {niveau.nom} (ordinal {niveau.ordinal})
                <Link to={`/proprietes/${propriete.id}/niveaux/${niveau.id}/modifier`}> Modifier</Link>
              </li>
            ))}
          </ul>
          <Link to={`/proprietes/${propriete.id}/batiments/${batiment.id}/niveaux/nouveau`}>Ajouter un niveau</Link>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 4: `app/routes/_app/batiments.nouveau.tsx`**

```tsx
// app/routes/_app/batiments.nouveau.tsx
import { Form, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { db } from "../../db/client";
import { batiment } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

const TYPES = ["principal", "annexe", "garage", "abri"] as const;

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "principal");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de bâtiment invalide." };

  await db.insert(batiment).values({ proprieteId: propriete.id, nom, type: type as (typeof TYPES)[number] });
  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function NouveauBatiment() {
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Ajouter un bâtiment</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required />
        </label>
        <label>
          Type
          <select name="type" defaultValue="principal">
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 5: `app/routes/_app/batiments.$batimentId.modifier.tsx` (modifier + supprimer)**

```tsx
// app/routes/_app/batiments.$batimentId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

const TYPES = ["principal", "annexe", "garage", "abri"] as const;

async function chargerBatiment(proprieteId: number, batimentId: string | undefined) {
  const [b] = await db.select().from(batiment).where(and(eq(batiment.id, Number(batimentId)), eq(batiment.proprieteId, proprieteId)));
  if (!b) throw new Response("Bâtiment introuvable", { status: 404 });
  return b;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const b = await chargerBatiment(propriete.id, params.batimentId);
  return { propriete, batiment: b };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerBatiment(propriete.id, params.batimentId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(batiment).where(eq(batiment.id, Number(params.batimentId)));
    return redirect(`/proprietes/${propriete.id}/batiments`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "principal");
  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de bâtiment invalide." };

  await db.update(batiment)
    .set({ nom, type: type as (typeof TYPES)[number] })
    .where(eq(batiment.id, Number(params.batimentId)));

  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function ModifierBatiment() {
  const { propriete, batiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Modifier {batiment.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={batiment.nom} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue={batiment.type}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer le bâtiment</button>
      </Form>
    </main>
  );
}
```

Note pour l'exécutant : `batiments.$batimentId.niveaux.nouveau.tsx` et `niveaux.$niveauId.modifier.tsx` suivent exactement ce même pattern (loader vérifie l'appartenance à la propriété via une jointure batiment→propriete, action gère `nom`/`ordinal`/suppression) — ils sont écrits en Task 10, pas dupliqués ici.

- [ ] **Step 6: Vérifier manuellement dans le navigateur**

```bash
npm run dev
```

Créer un bâtiment "Maison" depuis `/proprietes/:id/batiments/nouveau`, le voir apparaître dans la liste, le modifier, vérifier que le mot "pièce" n'apparaît nulle part dans l'interface.

Expected: CRUD bâtiment fonctionnel de bout en bout.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: arbre bâtiment/niveau/zone, sélecteur de zone, CRUD bâtiment"
```

---

### Task 10: CRUD niveau

**Files:**
- Create: `app/routes/_app/batiments.$batimentId.niveaux.nouveau.tsx`, `app/routes/_app/niveaux.$niveauId.modifier.tsx`
- Modify: `app/routes.ts` (ajoute les deux routes niveau)

**Interfaces:**
- Consumes: `requireUtilisateurId`, `requireProprieteAccess` (Task 6/7). Chaque route vérifie en plus, par une jointure `niveau → batiment`, que le niveau appartient bien à un bâtiment de la propriété visée dans l'URL (l'appartenance à la propriété ne suffit pas : il faut aussi vérifier le bâtiment, sinon un `niveauId` d'une autre propriété du même utilisateur passerait le premier contrôle).

- [ ] **Step 0: Ajouter les routes niveau à `app/routes.ts`**

Dans le bloc `...prefix("batiments", [...])` ajouté en Task 9, ajouter une ligne après `route(":batimentId/modifier", ...)` :

```ts
route(":batimentId/niveaux/nouveau", "routes/_app/batiments.$batimentId.niveaux.nouveau.tsx"),
```

Et, dans le tableau `prefix("proprietes/:proprieteId", [...])`, au même niveau que le préfixe `batiments` (pas dedans) :

```ts
route("niveaux/:niveauId/modifier", "routes/_app/niveaux.$niveauId.modifier.tsx"),
```

- [ ] **Step 1: `app/routes/_app/batiments.$batimentId.niveaux.nouveau.tsx`**

```tsx
// app/routes/_app/batiments.$batimentId.niveaux.nouveau.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

async function chargerBatiment(proprieteId: number, batimentId: string | undefined) {
  const [b] = await db.select().from(batiment).where(and(eq(batiment.id, Number(batimentId)), eq(batiment.proprieteId, proprieteId)));
  if (!b) throw new Response("Bâtiment introuvable", { status: 404 });
  return b;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const b = await chargerBatiment(propriete.id, params.batimentId);
  return { propriete, batiment: b };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const b = await chargerBatiment(propriete.id, params.batimentId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const ordinal = Number(form.get("ordinal"));

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!Number.isInteger(ordinal)) return { erreur: "L'ordinal doit être un entier (ex : -1 pour une cave, 0 pour le rez, 1 pour le premier)." };

  await db.insert(niveau).values({ batimentId: b.id, nom, ordinal });
  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function NouveauNiveau() {
  const { batiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Ajouter un niveau à {batiment.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Rez-de-chaussée, cave à vin..." />
        </label>
        <label>
          Ordinal (entier signé : -1 cave, 0 rez, 1 premier, 2 combles...)
          <input type="number" name="ordinal" required step={1} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 2: `app/routes/_app/niveaux.$niveauId.modifier.tsx`**

```tsx
// app/routes/_app/niveaux.$niveauId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

async function chargerNiveau(proprieteId: number, niveauId: string | undefined) {
  const [ligne] = await db.select({ niveau, batiment })
    .from(niveau)
    .innerJoin(batiment, eq(niveau.batimentId, batiment.id))
    .where(and(eq(niveau.id, Number(niveauId)), eq(batiment.proprieteId, proprieteId)));
  if (!ligne) throw new Response("Niveau introuvable", { status: 404 });
  return ligne;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { niveau: n, batiment: b } = await chargerNiveau(propriete.id, params.niveauId);
  return { propriete, niveau: n, batiment: b };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerNiveau(propriete.id, params.niveauId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(niveau).where(eq(niveau.id, Number(params.niveauId)));
    return redirect(`/proprietes/${propriete.id}/batiments`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const ordinal = Number(form.get("ordinal"));
  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!Number.isInteger(ordinal)) return { erreur: "L'ordinal doit être un entier." };

  await db.update(niveau).set({ nom, ordinal }).where(eq(niveau.id, Number(params.niveauId)));
  return redirect(`/proprietes/${propriete.id}/batiments`);
}

export default function ModifierNiveau() {
  const { niveau, batiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Modifier {niveau.nom} ({batiment.nom})</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={niveau.nom} required />
        </label>
        <label>
          Ordinal
          <input type="number" name="ordinal" defaultValue={niveau.ordinal} required step={1} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer le niveau</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 3: Vérifier manuellement**

Créer deux niveaux avec des ordinaux -1 et 0 sur un bâtiment, vérifier dans `/proprietes/:id/batiments` qu'ils s'affichent triés par ordinal (pas par ordre de création ni alphabétique).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: CRUD niveau, scopé bâtiment puis propriété"
```

---

### Task 11: CRUD zone (avec zones extérieures et sous-zones)

**Files:**
- Create: `app/routes/_app/zones._index.tsx`, `app/routes/_app/zones.nouveau.tsx`, `app/routes/_app/zones.$zoneId.modifier.tsx`
- Modify: `app/routes.ts` (ajoute le préfixe `zones`)

**Interfaces:**
- Consumes: `chargerArbreZones`, `ZoneAvecEnfants` (Task 9).

- [ ] **Step 0: Ajouter le préfixe `zones` à `app/routes.ts`**

Dans `prefix("proprietes/:proprieteId", [...])`, au même niveau que `batiments` :

```ts
...prefix("zones", [
  index("routes/_app/zones._index.tsx"),
  route("nouveau", "routes/_app/zones.nouveau.tsx"),
  route(":zoneId/modifier", "routes/_app/zones.$zoneId.modifier.tsx"),
]),
```

Décision de portée : l'écran "modifier" ne permet de changer que `nom` et `type` — pas de repositionner une zone (changer son niveau ou son parent). Le prompt demande "écrans de liste et de formulaire", pas un repositionnement ; en ajouter un serait construire au-delà de ce qui est demandé.

- [ ] **Step 1: `app/routes/_app/zones._index.tsx`**

```tsx
// app/routes/_app/zones._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones, type ZoneAvecEnfants } from "../../lib/zoneTree";

function ListeZones({ zones, proprieteId, profondeur = 0 }: { zones: ZoneAvecEnfants[]; proprieteId: number; profondeur?: number }) {
  return (
    <ul>
      {zones.map((z) => (
        <li key={z.id}>
          {"— ".repeat(profondeur)}
          {z.nom} ({z.type})
          <Link to={`/proprietes/${proprieteId}/zones/${z.id}/modifier`}> Modifier</Link>
          {z.enfants.length > 0 && <ListeZones zones={z.enfants} proprieteId={proprieteId} profondeur={profondeur + 1} />}
        </li>
      ))}
    </ul>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { arbre, zonesExterieures } = await chargerArbreZones(propriete.id);
  return { propriete, arbre, zonesExterieures };
}

export default function ListeZonesPage() {
  const { propriete, arbre, zonesExterieures } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>Zones — {propriete.nom}</h1>
      <Link to={`/proprietes/${propriete.id}/zones/nouveau`}>Ajouter une zone</Link>

      {arbre.map(({ batiment, niveaux }) => (
        <section key={batiment.id}>
          <h2>{batiment.nom}</h2>
          {niveaux.map(({ niveau, zones }) => (
            <div key={niveau.id}>
              <h3>{niveau.nom}</h3>
              <ListeZones zones={zones} proprieteId={propriete.id} />
            </div>
          ))}
        </section>
      ))}

      <section>
        <h2>Extérieur</h2>
        <ListeZones zones={zonesExterieures} proprieteId={propriete.id} />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: `app/routes/_app/zones.nouveau.tsx`**

```tsx
// app/routes/_app/zones.nouveau.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau, zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones, type ZoneAvecEnfants } from "../../lib/zoneTree";

const TYPES = ["interieur", "exterieur", "annexe", "technique"] as const;

async function chargerNiveauxAvecBatiment(proprieteId: number) {
  const batiments = await db.select().from(batiment).where(eq(batiment.proprieteId, proprieteId)).orderBy(asc(batiment.ordre));
  const ids = batiments.map((b) => b.id);
  const niveaux = ids.length
    ? await db.select().from(niveau).where(inArray(niveau.batimentId, ids)).orderBy(asc(niveau.ordinal))
    : [];
  return niveaux.map((n) => ({ ...n, batimentNom: batiments.find((b) => b.id === n.batimentId)!.nom }));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const niveaux = await chargerNiveauxAvecBatiment(propriete.id);
  const { arbre, zonesExterieures } = await chargerArbreZones(propriete.id);
  return { propriete, niveaux, arbre, zonesExterieures };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "");
  const niveauIdBrut = String(form.get("niveauId") ?? "");
  const parentIdBrut = String(form.get("parentId") ?? "");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de zone invalide." };

  await db.insert(zone).values({
    proprieteId: propriete.id,
    nom,
    type: type as (typeof TYPES)[number],
    niveauId: niveauIdBrut ? Number(niveauIdBrut) : null,
    parentId: parentIdBrut ? Number(parentIdBrut) : null,
  });

  return redirect(`/proprietes/${propriete.id}/zones`);
}

function OptionsZonesPlates({ zones, profondeur = 0 }: { zones: ZoneAvecEnfants[]; profondeur?: number }) {
  return (
    <>
      {zones.map((z) => (
        <>
          <option key={z.id} value={z.id}>{"— ".repeat(profondeur)}{z.nom}</option>
          {z.enfants.length > 0 && <OptionsZonesPlates zones={z.enfants} profondeur={profondeur + 1} />}
        </>
      ))}
    </>
  );
}

export default function NouvelleZone() {
  const { niveaux, arbre, zonesExterieures } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const toutesLesZones = [...arbre.flatMap(({ niveaux: ns }) => ns.flatMap((n) => n.zones)), ...zonesExterieures];

  return (
    <main>
      <h1>Ajouter une zone</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Cuisine, jardin, garage, local technique..." />
        </label>
        <label>
          Type
          <select name="type" defaultValue="interieur">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Rattachement (laisser vide pour une zone extérieure, rattachée à la propriété)
          <select name="niveauId" defaultValue="">
            <option value="">— zone extérieure (aucun niveau) —</option>
            {niveaux.map((n) => (
              <option key={n.id} value={n.id}>{n.batimentNom} — {n.nom}</option>
            ))}
          </select>
        </label>
        <label>
          Sous-zone de (optionnel)
          <select name="parentId" defaultValue="">
            <option value="">— aucune, zone de premier niveau —</option>
            <OptionsZonesPlates zones={toutesLesZones} />
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 3: `app/routes/_app/zones.$zoneId.modifier.tsx`**

```tsx
// app/routes/_app/zones.$zoneId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

const TYPES = ["interieur", "exterieur", "annexe", "technique"] as const;

async function chargerZone(proprieteId: number, zoneId: string | undefined) {
  const [z] = await db.select().from(zone).where(and(eq(zone.id, Number(zoneId)), eq(zone.proprieteId, proprieteId)));
  if (!z) throw new Response("Zone introuvable", { status: 404 });
  return z;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const z = await chargerZone(propriete.id, params.zoneId);
  return { propriete, zone: z };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerZone(propriete.id, params.zoneId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(zone).where(eq(zone.id, Number(params.zoneId)));
    return redirect(`/proprietes/${propriete.id}/zones`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "");
  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!TYPES.includes(type as (typeof TYPES)[number])) return { erreur: "Type de zone invalide." };

  await db.update(zone).set({ nom, type: type as (typeof TYPES)[number] }).where(eq(zone.id, Number(params.zoneId)));
  return redirect(`/proprietes/${propriete.id}/zones`);
}

export default function ModifierZone() {
  const { zone } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Modifier {zone.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={zone.nom} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue={zone.type}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer la zone</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 4: Vérifier manuellement**

Créer une zone extérieure "Jardin" (rattachement vide), puis une sous-zone "Potager" avec `parentId` = Jardin. Vérifier qu'elles apparaissent toutes deux sous "Extérieur" dans la liste, "Potager" indentée sous "Jardin".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: CRUD zone, zones extérieures et sous-zones"
```

---

### Task 12: CRUD système

**Files:**
- Create: `app/routes/_app/systemes._index.tsx`, `app/routes/_app/systemes.nouveau.tsx`, `app/routes/_app/systemes.$systemeId.modifier.tsx`
- Modify: `app/routes.ts` (ajoute le préfixe `systemes`)

**Interfaces:**
- Consumes: `requireUtilisateurId`, `requireProprieteAccess`.

- [ ] **Step 0: Ajouter le préfixe `systemes` à `app/routes.ts`**

Dans `prefix("proprietes/:proprieteId", [...])`, au même niveau que `batiments`/`zones` :

```ts
...prefix("systemes", [
  index("routes/_app/systemes._index.tsx"),
  route("nouveau", "routes/_app/systemes.nouveau.tsx"),
  route(":systemeId/modifier", "routes/_app/systemes.$systemeId.modifier.tsx"),
]),
```

- [ ] **Step 1: `app/routes/_app/systemes._index.tsx`**

```tsx
// app/routes/_app/systemes._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const systemes = await db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id));
  return { propriete, systemes };
}

export default function ListeSystemes() {
  const { propriete, systemes } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>Systèmes — {propriete.nom}</h1>
      <Link to={`/proprietes/${propriete.id}/systemes/nouveau`}>Ajouter un système</Link>
      <ul>
        {systemes.map((s) => (
          <li key={s.id}>
            {s.nom}
            <Link to={`/proprietes/${propriete.id}/systemes/${s.id}/modifier`}> Modifier</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: `app/routes/_app/systemes.nouveau.tsx`**

```tsx
// app/routes/_app/systemes.nouveau.tsx
import { Form, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { db } from "../../db/client";
import { systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();
  const nom = String(form.get("nom") ?? "").trim();
  const icone = String(form.get("icone") ?? "").trim() || null;

  if (!nom) return { erreur: "Le nom est obligatoire." };

  await db.insert(systeme).values({ proprieteId: propriete.id, nom, icone });
  return redirect(`/proprietes/${propriete.id}/systemes`);
}

export default function NouveauSysteme() {
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Ajouter un système</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Électricité, sanitaire, chauffage, arrosage..." />
        </label>
        <label>
          Icône (optionnel)
          <input type="text" name="icone" />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 3: `app/routes/_app/systemes.$systemeId.modifier.tsx`**

```tsx
// app/routes/_app/systemes.$systemeId.modifier.tsx
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

async function chargerSysteme(proprieteId: number, systemeId: string | undefined) {
  const [s] = await db.select().from(systeme).where(and(eq(systeme.id, Number(systemeId)), eq(systeme.proprieteId, proprieteId)));
  if (!s) throw new Response("Système introuvable", { status: 404 });
  return s;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const s = await chargerSysteme(propriete.id, params.systemeId);
  return { propriete, systeme: s };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerSysteme(propriete.id, params.systemeId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(systeme).where(eq(systeme.id, Number(params.systemeId)));
    return redirect(`/proprietes/${propriete.id}/systemes`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const icone = String(form.get("icone") ?? "").trim() || null;
  if (!nom) return { erreur: "Le nom est obligatoire." };

  await db.update(systeme).set({ nom, icone }).where(eq(systeme.id, Number(params.systemeId)));
  return redirect(`/proprietes/${propriete.id}/systemes`);
}

export default function ModifierSysteme() {
  const { systeme } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Modifier {systeme.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={systeme.nom} required />
        </label>
        <label>
          Icône
          <input type="text" name="icone" defaultValue={systeme.icone ?? ""} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer le système</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 4: Vérifier manuellement puis commit**

```bash
git add -A
git commit -m "feat: CRUD système"
```

---

### Task 13: CRUD élément avec formulaire dynamique — le point technique central

**Files:**
- Create: `app/components/DynamicElementFields.tsx`, `app/routes/_app/elements._index.tsx`, `app/routes/_app/elements.nouveau.tsx`, `app/routes/_app/elements.$elementId.modifier.tsx`
- Modify: `app/routes.ts` (ajoute le préfixe `elements`)

**Interfaces:**
- Consumes: `ZoneSelector`, `chargerArbreZones` (Task 9), `validerDetails` (Task 8), `ChampDefinition` (Task 2).
- Produces: `<DynamicElementFields champs={...} valeurs={...} />`, réutilisé par Task 14 indirectement (le type perso créé y redevient sélectionnable).

- [ ] **Step 0: Ajouter le préfixe `elements` à `app/routes.ts`**

Dans `prefix("proprietes/:proprieteId", [...])`, au même niveau que `batiments`/`zones`/`systemes` :

```ts
...prefix("elements", [
  index("routes/_app/elements._index.tsx"),
  route("nouveau", "routes/_app/elements.nouveau.tsx"),
  route(":elementId/modifier", "routes/_app/elements.$elementId.modifier.tsx"),
]),
```

C'est le cœur de l'étape : le choix du type dans le formulaire change dynamiquement les champs affichés, et la validation des `details` contre les `champs` du type est refaite côté serveur (jamais fait confiance au client — un `typeId` ou des champs falsifiés dans la requête HTTP sont revalidés contre le type réel chargé en base).

- [ ] **Step 1: `app/components/DynamicElementFields.tsx`**

```tsx
// app/components/DynamicElementFields.tsx
import type { ChampDefinition } from "../db/schema/types";

export function DynamicElementFields({ champs, valeurs = {} }: { champs: ChampDefinition[]; valeurs?: Record<string, unknown> }) {
  return (
    <>
      {champs.map((champ) => {
        const nomChamp = `details.${champ.cle}`;
        const valeur = valeurs[champ.cle];

        if (champ.genre === "fichier") {
          // Décision verrouillée #6 : téléversement non construit à cette étape.
          return <p key={champ.cle}>{champ.label} : téléversement de fichier à venir (étape 6).</p>;
        }

        return (
          <label key={champ.cle}>
            {champ.label}
            {champ.unite ? ` (${champ.unite})` : ""}
            {champ.genre === "texte" && (
              <input type="text" name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire} />
            )}
            {champ.genre === "nombre" && (
              <input type="number" name={nomChamp} defaultValue={typeof valeur === "number" ? valeur : ""} required={champ.obligatoire} step="any" />
            )}
            {champ.genre === "date" && (
              <input type="date" name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire} />
            )}
            {champ.genre === "booleen" && (
              <input type="checkbox" name={nomChamp} defaultChecked={Boolean(valeur)} value="true" />
            )}
            {champ.genre === "choix" && (
              <select name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire}>
                <option value="">—</option>
                {(champ.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            )}
          </label>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: `app/routes/_app/elements._index.tsx`**

```tsx
// app/routes/_app/elements._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const elements = await db.select({
    id: element.id,
    nom: element.nom,
    typeNom: typeElement.nom,
    zoneNom: zone.nom,
  })
    .from(element)
    .innerJoin(typeElement, eq(element.typeId, typeElement.id))
    .innerJoin(zone, eq(element.zoneId, zone.id))
    .where(eq(element.proprieteId, propriete.id));

  return { propriete, elements };
}

export default function ListeElements() {
  const { propriete, elements } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>Éléments — {propriete.nom}</h1>
      <Link to={`/proprietes/${propriete.id}/elements/nouveau`}>Ajouter un élément</Link>
      <ul>
        {elements.map((e) => (
          <li key={e.id}>
            {e.nom} — {e.typeNom} — {e.zoneNom}
            <Link to={`/proprietes/${propriete.id}/elements/${e.id}/modifier`}> Modifier</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: `app/routes/_app/elements.nouveau.tsx`**

```tsx
// app/routes/_app/elements.nouveau.tsx
import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones } from "../../lib/zoneTree";
import { validerDetails } from "../../lib/forms/champSchema";
import { ZoneSelector } from "../../components/ZoneSelector";
import { DynamicElementFields } from "../../components/DynamicElementFields";
import type { ChampDefinition } from "../../db/schema/types";

// Types disponibles pour un élément : le catalogue système (proprieteId NULL)
// + les types perso de cette propriété.
async function chargerTypesDisponibles(proprieteId: number) {
  return db.select().from(typeElement).where(or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, proprieteId)));
}

function extraireDetails(form: FormData, champs: ChampDefinition[]) {
  const details: Record<string, unknown> = {};
  for (const champ of champs) {
    if (champ.genre === "fichier") continue;
    if (champ.genre === "booleen") {
      details[champ.cle] = form.get(`details.${champ.cle}`) === "true";
      continue;
    }
    const valeur = form.get(`details.${champ.cle}`);
    if (valeur === null || valeur === "") continue;
    details[champ.cle] = valeur;
  }
  return details;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const types = await chargerTypesDisponibles(propriete.id);
  const arbre = await chargerArbreZones(propriete.id);
  const systemes = await db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id));
  return { propriete, types, arbre, systemes };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const nom = String(form.get("nom") ?? "").trim();
  const typeId = Number(form.get("typeId"));
  const zoneId = Number(form.get("zoneId"));
  const systemeIdBrut = String(form.get("systemeId") ?? "");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!zoneId) return { erreur: "La zone est obligatoire." };

  // Le type est rechargé et revalidé côté serveur : ne jamais faire
  // confiance aux champs envoyés par le client pour décider quels details
  // sont attendus.
  const typesDisponibles = await chargerTypesDisponibles(propriete.id);
  const type = typesDisponibles.find((t) => t.id === typeId);
  if (!type) return { erreur: "Type invalide." };

  const detailsBruts = extraireDetails(form, type.champs);
  const resultat = validerDetails(type.champs, detailsBruts);
  if (!resultat.success) {
    return { erreur: `Détails invalides : ${resultat.error.issues.map((i) => i.message).join(", ")}` };
  }

  await db.insert(element).values({
    proprieteId: propriete.id,
    nom,
    typeId: type.id,
    zoneId,
    systemeId: systemeIdBrut ? Number(systemeIdBrut) : null,
    details: resultat.data,
  });

  return redirect(`/proprietes/${propriete.id}/elements`);
}

export default function NouvelElement() {
  const { propriete, types, arbre, systemes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [typeId, setTypeId] = useState<number | null>(null);
  const typeChoisi = types.find((t) => t.id === typeId);

  return (
    <main>
      <h1>Ajouter un élément</h1>
      <p><a href={`/proprietes/${propriete.id}/types/nouveau`}>Créer un type personnalisé</a> s'il n'est pas dans la liste.</p>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required />
        </label>
        <label>
          Type
          <select name="typeId" required value={typeId ?? ""} onChange={(e) => setTypeId(Number(e.target.value) || null)}>
            <option value="">— choisir un type —</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
                {t.origine === "perso" ? " (perso)" : ""}
              </option>
            ))}
          </select>
        </label>
        <ZoneSelector arbre={arbre} name="zoneId" />
        <label>
          Système (optionnel)
          <select name="systemeId" defaultValue="">
            <option value="">—</option>
            {systemes.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        </label>

        {typeChoisi && <DynamicElementFields champs={typeChoisi.champs} />}

        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 4: `app/routes/_app/elements.$elementId.modifier.tsx`**

```tsx
// app/routes/_app/elements.$elementId.modifier.tsx
import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, systeme } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones } from "../../lib/zoneTree";
import { validerDetails } from "../../lib/forms/champSchema";
import { ZoneSelector } from "../../components/ZoneSelector";
import { DynamicElementFields } from "../../components/DynamicElementFields";
import type { ChampDefinition } from "../../db/schema/types";

async function chargerTypesDisponibles(proprieteId: number) {
  return db.select().from(typeElement).where(or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, proprieteId)));
}

async function chargerElement(proprieteId: number, elementId: string | undefined) {
  const [e] = await db.select().from(element).where(and(eq(element.id, Number(elementId)), eq(element.proprieteId, proprieteId)));
  if (!e) throw new Response("Élément introuvable", { status: 404 });
  return e;
}

function extraireDetails(form: FormData, champs: ChampDefinition[]) {
  const details: Record<string, unknown> = {};
  for (const champ of champs) {
    if (champ.genre === "fichier") continue;
    if (champ.genre === "booleen") {
      details[champ.cle] = form.get(`details.${champ.cle}`) === "true";
      continue;
    }
    const valeur = form.get(`details.${champ.cle}`);
    if (valeur === null || valeur === "") continue;
    details[champ.cle] = valeur;
  }
  return details;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const e = await chargerElement(propriete.id, params.elementId);
  const types = await chargerTypesDisponibles(propriete.id);
  const arbre = await chargerArbreZones(propriete.id);
  const systemes = await db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id));
  return { propriete, element: e, types, arbre, systemes };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerElement(propriete.id, params.elementId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(element).where(eq(element.id, Number(params.elementId)));
    return redirect(`/proprietes/${propriete.id}/elements`);
  }

  const nom = String(form.get("nom") ?? "").trim();
  const typeId = Number(form.get("typeId"));
  const zoneId = Number(form.get("zoneId"));
  const systemeIdBrut = String(form.get("systemeId") ?? "");

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (!zoneId) return { erreur: "La zone est obligatoire." };

  const typesDisponibles = await chargerTypesDisponibles(propriete.id);
  const type = typesDisponibles.find((t) => t.id === typeId);
  if (!type) return { erreur: "Type invalide." };

  const detailsBruts = extraireDetails(form, type.champs);
  const resultat = validerDetails(type.champs, detailsBruts);
  if (!resultat.success) {
    return { erreur: `Détails invalides : ${resultat.error.issues.map((i) => i.message).join(", ")}` };
  }

  await db.update(element).set({
    nom,
    typeId: type.id,
    zoneId,
    systemeId: systemeIdBrut ? Number(systemeIdBrut) : null,
    details: resultat.data,
    majLe: new Date(),
  }).where(eq(element.id, Number(params.elementId)));

  return redirect(`/proprietes/${propriete.id}/elements`);
}

export default function ModifierElement() {
  const { propriete, element, types, arbre, systemes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [typeId, setTypeId] = useState<number>(element.typeId);
  const typeChoisi = types.find((t) => t.id === typeId);

  return (
    <main>
      <h1>Modifier {element.nom}</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={element.nom} required />
        </label>
        <label>
          Type
          <select name="typeId" required value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
                {t.origine === "perso" ? " (perso)" : ""}
              </option>
            ))}
          </select>
        </label>
        <ZoneSelector arbre={arbre} name="zoneId" defaultValue={element.zoneId} />
        <label>
          Système (optionnel)
          <select name="systemeId" defaultValue={element.systemeId ?? ""}>
            <option value="">—</option>
            {systemes.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        </label>

        {typeChoisi && <DynamicElementFields champs={typeChoisi.champs} valeurs={element.details as Record<string, unknown>} />}

        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Enregistrer</button>
      </Form>
      <Form method="post">
        <input type="hidden" name="_action" value="supprimer" />
        <button type="submit">Supprimer l'élément</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 5: Vérifier manuellement — critères d'acceptation centraux**

```bash
npm run dev
```

Créer un élément de type "Chaudière" : vérifier que les champs puissance/énergie/marque/etc. apparaissent. Changer le type vers "Radiateur" dans le `<select>` sans recharger la page : vérifier que les champs affichés changent immédiatement. Soumettre avec un champ obligatoire vide : vérifier le message d'erreur serveur.

Expected: comportement conforme aux deux critères d'acceptation "Créer un élément de type chaudière affiche les champs de la chaudière ; changer le type change les champs".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: CRUD élément avec formulaire dynamique généré depuis type_element.champs"
```

---

### Task 14: Création de type personnalisé (éditeur de champs)

**Files:**
- Create: `app/components/ChampEditor.tsx`, `app/routes/_app/types.nouveau.tsx`
- Modify: `app/routes.ts` (ajoute la route `types/nouveau`)

**Interfaces:**
- Consumes: `ChampDefinition`, `ChampGenre` (Task 2).
- Produces: un type perso complet, immédiatement sélectionnable dans le formulaire d'élément (Task 13, la liste des types est rechargée par le `loader` à chaque navigation).

- [ ] **Step 0: Ajouter la route `types/nouveau` à `app/routes.ts`**

Dans `prefix("proprietes/:proprieteId", [...])`, après les préfixes de ressources :

```ts
route("types/nouveau", "routes/_app/types.nouveau.tsx"),
```

Aucune UI de modification/suppression d'un type (perso ou système) n'est construite à cette étape — seule la **création** d'un type perso est demandée par le prompt ("Création d'un type perso depuis l'interface, avec l'éditeur de champs"). La garde applicative de la décision verrouillée #9 (protéger les types système) s'appliquera quand une UI de modification sera construite ; elle n'a rien à protéger tant qu'aucune route ne permet de modifier un `type_element`.

- [ ] **Step 1: `app/components/ChampEditor.tsx`**

```tsx
// app/components/ChampEditor.tsx
import { useState } from "react";
import type { ChampDefinition, ChampGenre } from "../db/schema/types";

// Liste fermée de six genres (règle non négociable #4) — ne jamais l'étendre.
const GENRES: ChampGenre[] = ["texte", "nombre", "date", "booleen", "choix", "fichier"];

type ChampBrouillon = ChampDefinition & { optionsTexte?: string };

export function ChampEditor({ nomChamp = "champs" }: { nomChamp?: string }) {
  const [champs, setChamps] = useState<ChampBrouillon[]>([]);

  function ajouter() {
    setChamps((c) => [...c, { cle: "", label: "", genre: "texte", niveauMin: 1, obligatoire: false }]);
  }

  function retirer(index: number) {
    setChamps((c) => c.filter((_, i) => i !== index));
  }

  function modifier(index: number, patch: Partial<ChampBrouillon>) {
    setChamps((c) => c.map((champ, i) => (i === index ? { ...champ, ...patch } : champ)));
  }

  return (
    <fieldset>
      <legend>Champs du type</legend>
      {champs.map((champ, i) => (
        <fieldset key={i}>
          <label>
            Clé (immuable une fois créée)
            <input
              type="text"
              value={champ.cle}
              onChange={(e) => modifier(i, { cle: e.target.value.trim().replace(/\s+/g, "_") })}
              required
            />
          </label>
          <label>
            Libellé
            <input type="text" value={champ.label} onChange={(e) => modifier(i, { label: e.target.value })} required />
          </label>
          <label>
            Genre
            <select value={champ.genre} onChange={(e) => modifier(i, { genre: e.target.value as ChampGenre })}>
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          {champ.genre === "choix" && (
            <label>
              Options (une par ligne)
              <textarea
                value={champ.optionsTexte ?? (champ.options ?? []).join("\n")}
                onChange={(e) =>
                  modifier(i, {
                    optionsTexte: e.target.value,
                    options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </label>
          )}
          <label>
            Unité (optionnel)
            <input type="text" value={champ.unite ?? ""} onChange={(e) => modifier(i, { unite: e.target.value || undefined })} />
          </label>
          <label>
            Niveau minimum pour voir ce champ
            <select value={champ.niveauMin} onChange={(e) => modifier(i, { niveauMin: Number(e.target.value) })}>
              <option value={0}>0 — public</option>
              <option value={1}>1 — usage</option>
              <option value={2}>2 — technique</option>
              <option value={3}>3 — privé</option>
            </select>
          </label>
          <label>
            Obligatoire
            <input type="checkbox" checked={champ.obligatoire} onChange={(e) => modifier(i, { obligatoire: e.target.checked })} />
          </label>
          <button type="button" onClick={() => retirer(i)}>Retirer ce champ</button>
        </fieldset>
      ))}
      <button type="button" onClick={ajouter}>Ajouter un champ</button>
      <input type="hidden" name={nomChamp} value={JSON.stringify(champs.map(({ optionsTexte, ...c }) => c))} />
    </fieldset>
  );
}
```

- [ ] **Step 2: `app/routes/_app/types.nouveau.tsx`**

```tsx
// app/routes/_app/types.nouveau.tsx
import { Form, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "../../db/client";
import { typeElement } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { ChampEditor } from "../../components/ChampEditor";

const champDefinitionSchema = z
  .object({
    cle: z.string().min(1),
    label: z.string().min(1),
    genre: z.enum(["texte", "nombre", "date", "booleen", "choix", "fichier"]),
    unite: z.string().optional(),
    niveauMin: z.number().int().min(0).max(3),
    obligatoire: z.boolean(),
    options: z.array(z.string()).optional(),
  })
  .refine((c) => c.genre !== "choix" || (c.options && c.options.length > 0), {
    message: "Un champ de genre 'choix' doit définir au moins une option.",
  });

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const nom = String(form.get("nom") ?? "").trim();
  const icone = String(form.get("icone") ?? "").trim() || null;
  const alias = String(form.get("alias") ?? "").split(",").map((a) => a.trim()).filter(Boolean);

  if (!nom) return { erreur: "Le nom est obligatoire." };

  let champsBruts: unknown;
  try {
    champsBruts = JSON.parse(String(form.get("champs") ?? "[]"));
  } catch {
    return { erreur: "Champs invalides." };
  }

  const resultat = z.array(champDefinitionSchema).safeParse(champsBruts);
  if (!resultat.success) {
    return { erreur: `Champs invalides : ${resultat.error.issues.map((i) => i.message).join(", ")}` };
  }

  const cles = resultat.data.map((c) => c.cle);
  if (new Set(cles).size !== cles.length) {
    return { erreur: "Deux champs ne peuvent pas partager la même clé." };
  }

  await db.insert(typeElement).values({
    proprieteId: propriete.id,
    nom,
    icone,
    origine: "perso",
    champs: resultat.data,
    alias,
  });

  return redirect(`/proprietes/${propriete.id}/elements/nouveau`);
}

export default function NouveauTypePerso() {
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Créer un type personnalisé</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Adoucisseur d'eau..." />
        </label>
        <label>
          Icône (optionnel)
          <input type="text" name="icone" />
        </label>
        <label>
          Alias (séparés par des virgules)
          <input type="text" name="alias" placeholder="adoucisseur, filtre à eau" />
        </label>
        <ChampEditor />
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer le type</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 3: Vérifier manuellement — critère d'acceptation type perso de bout en bout**

Créer un type perso "Adoucisseur d'eau" avec trois champs (par exemple `marque` texte, `capacite` nombre avec unité "L", `date_installation` date), le voir apparaître dans le sélecteur de type du formulaire d'élément avec la mention "(perso)", créer un élément de ce type, vérifier que les trois champs s'affichent et que la sauvegarde fonctionne.

Expected: conforme au critère d'acceptation.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: création de type personnalisé avec éditeur de champs"
```

---

### Task 15: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Aucune (documentation).

- [ ] **Step 1: Écrire `README.md`**

Contenu à couvrir (prérequis, démarrage, migrations, chargement des données, structure, décisions prises) :

```markdown
# gestionImmobiliere — Étape 0 : socle

Mémoire technique d'un bien immobilier. Cette étape pose les fondations : schéma de données complet, authentification, catalogue de types, CRUD minimal avec formulaire dynamique. Pas de capture photo, pas de recherche, pas de partage — voir `.decisions/implementation-plan.md` pour la suite.

## Prérequis

- Docker et Docker Compose
- Node.js 22+ (pour le développement hors conteneur)
- npm

## Démarrage (Docker)

\`\`\`bash
cp .env.example .env
# éditer .env : POSTGRES_PASSWORD et SESSION_SECRET
docker compose up
\`\`\`

L'application applique ses migrations automatiquement au démarrage (`scripts/migrate.mjs`) et écoute sur `http://localhost:3000`. La base est vide : voir "Charger les données" ci-dessous.

## Démarrage (développement local, hors Docker pour l'app)

\`\`\`bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
\`\`\`

## Migrations

- `npm run db:generate` — génère une migration à partir du schéma Drizzle (`app/db/schema/`), après l'avoir modifié. Migrations versionnées dans `drizzle/`.
- `npm run db:migrate` — applique les migrations en attente (utilisé aussi bien en dev qu'en prod, via `scripts/migrate.mjs`).

## Charger les données

\`\`\`bash
npm run seed:catalogue   # 33 types système avec alias — idempotent
npm run seed:exemple     # propriété "Maison d'exemple" complète — idempotent
\`\`\`

Identifiants de démonstration créés par `seed:exemple` : `demo@gestion-immobiliere.local` / `demo1234`. **Jetables : à ne jamais utiliser en production.**

## Tests

\`\`\`bash
docker compose exec postgres createdb -U gestion gestion_immobiliere_test   # une fois
cp .env.test.example .env.test
set -a && source .env.test && set +a && npx tsx scripts/seed-catalogue.ts    # une fois, requis par le test d'alias
npm test
\`\`\`

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
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: README (démarrage, migrations, seeds, décisions prises)"
```

---

## Self-Review

**Couverture du prompt (`.decisions/prompt-etape-0.md`) :**

| Section du prompt | Tâche(s) |
|---|---|
| §1 Projet et infrastructure | Task 1 |
| §2 Base de données (schéma, migrations, index, déclencheur) | Task 2, Task 3 |
| §3 Authentification (hash, sessions, cookie, protection, séparation `/p/:jeton`) | Task 6, Task 7 |
| §4 Catalogue ≥25 types avec alias | Task 4 (33 types) |
| §5 CRUD minimal (bâtiment, niveau, zone, système, élément), formulaire dynamique, type perso, sélecteur de zone | Task 9, 10, 11, 12, 13, 14 |
| §6 Jeu de données d'exemple | Task 5 |
| §7 Tests (zone_id, ordinal, déclencheur, validation details, alias) | Task 2 (zone_id, ordinal), Task 3 (déclencheur), Task 4 (alias), Task 8 (validation details) |
| Règles non négociables 1–7 | Reprises verbatim dans "Global Constraints" et rappelées en commentaire au point d'application (Task 2 pour 1/2/4, Task 8 pour 3, Task 7/9/11 pour 6, absence de champ secret pour 7, garde applicative Task 14 pour 5) |
| README avec section "décisions prises" | Task 15 |

**Balayage des placeholders :** aucun "TBD"/"à implémenter plus tard" dans le plan ; chaque étape de code contient le code réel. Les deux seuls renvois explicites entre tâches ("suit exactement ce pattern", fin de Task 9) concernent des fichiers **intégralement écrits** dans la tâche suivante (Task 10), pas un code non montré.

**Cohérence des types :** `ChampDefinition` (Task 2) est utilisé identiquement dans `champSchema.ts` (Task 8), `DynamicElementFields` et les routes élément (Task 13), et `ChampEditor` (Task 14) — mêmes clés (`cle`, `label`, `genre`, `unite`, `niveauMin`, `obligatoire`, `options`) partout. `chargerArbreZones`/`ZoneAvecEnfants` (Task 9) sont le seul point de construction de l'arbre, réutilisés sans redéfinition en Task 11 et Task 13. `requireUtilisateurId`/`requireProprieteAccess` (Task 6/7) sont le seul point d'entrée d'autorisation, appelés identiquement (mêmes deux lignes) au début de chaque loader/action protégé de Task 9 à 14.

---

## Execution Handoff

Plan complet et sauvegardé dans `docs/superpowers/plans/2026-09-02-etape-0-socle.md`. Deux options d'exécution :

1. **Subagent-Driven (recommandé)** — je dispatche un sous-agent frais par tâche, avec revue entre chaque tâche, itération rapide.
2. **Exécution inline** — j'exécute les tâches dans cette session avec `executing-plans`, par lots avec points de contrôle.

Laquelle préfères-tu ?
