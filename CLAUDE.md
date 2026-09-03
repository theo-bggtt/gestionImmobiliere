# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

La mémoire technique d'une maison : le propriétaire consigne où passe la gaine RJ45, quelle vanne coupe quoi, qui a posé la chaudière. La même base se projette différemment selon qui la regarde (propriétaire, locataire, artisan, jardinier) via des liens de partage scopés par niveau et par zone/système. Stack : React Router v7 (SSR, mode framework) + Express + PostgreSQL + Drizzle ORM.

Currently at **Étape 0/1/2/3/4** (socle, capture, retrouver, partager, le plan) of a staged build. Full spec, the 8 locked design decisions, and the 12 non-negotiable rules live in `.decisions/implementation-plan.md` — read it before any schema or permission-model change. `README.md`'s "Décisions prises" section lists implementation choices made where the spec was silent.

## Commands

```bash
npm run dev              # dev server (server/app.js + Vite middleware), :3000
npm run build             # react-router build
npm run typecheck         # tsc --noEmit
npm test                  # vitest run (needs a live Postgres — see below)
npx vitest run tests/schema/zone-obligatoire.test.ts   # single test file

npm run db:generate       # drizzle-kit generate, after editing app/db/schema/
npm run db:migrate        # apply pending migrations (scripts/migrate.mjs; also runs on container start)
npm run seed:catalogue    # 33 system types with alias — idempotent
npm run seed:exemple      # full example property — idempotent, demo@gestion-immobiliere.local / demo1234
```

Tests require a running Postgres and `.env.test` (see README "Tests" for one-time setup: create the `gestion_immobiliere_test` DB, seed the catalogue once). `vitest.config.ts` forces `fileParallelism: false` — concurrent `migrate()` calls race on `CREATE SCHEMA IF NOT EXISTS`. Test setup (`tests/setup/test-db.ts`) runs migrations in `beforeAll` and seeds only the "Vanne d'arrêt" type from `scripts/seed-catalogue.ts`'s shared `CATALOGUE` array, not the full catalogue.

To reset between tests, prefer `DELETE FROM utilisateur` over `TRUNCATE ... CASCADE`. `TRUNCATE` empties every table that *references* the target, `type_element` included — so it wipes the catalogue the setup loaded, and any test that needs a catalogue type fails on the second file onwards. `DELETE` only follows row-level cascades, and the system types (`propriete_id` NULL) survive.

## Architecture

**Routing**: `app/routes.ts` (not file-system routing) defines three trees. `_public/*` (connexion, inscription, deconnexion) is unauthenticated. Everything authenticated sits under `_app/layout.tsx`, prefixed `proprietes/:proprieteId/...` — every authenticated route is scoped by `proprieteId` in the URL. `plans/points` is a resource route: the interactive plan saves a dragged point through a fetcher, because navigating would lose the zoom and the pan. `_partage/*` (`/p/:jeton`) is the public share tree: no session, no PWA, and served without `<Scripts />` — see "Partage" below.

**Multi-tenancy / IDOR guard**: every loader and action for a resource must verify it belongs to the `proprieteId` in the URL, not just that it exists. Two helpers do this:
- `requireProprieteAccess(utilisateurId, proprieteIdParam)` (`app/lib/db/proprieteAccess.server.ts`) — checks the property itself belongs to the logged-in user.
- `chargerRessourceOu404(table, condition, message)` (`app/lib/db/scopedResource.server.ts`) — generic loader for tables that carry `proprieteId` directly (batiment, zone, systeme, element). `niveau` reaches `proprieteId` only via a join on `batiment` and is handled by hand in `zoneTree.ts` (`niveauAppartientALaPropriete`, `zoneParenteValide`).

Never distinguish "doesn't exist" from "not yours" — always 404, both in these helpers and in `requireProprieteAccess`. This is rule #4 of the 12 non-negotiable rules in the implementation plan.

**Data model** (`app/db/schema/*.ts`, one file per table or small related group, re-exported from `index.ts`):
- Structure: `propriete` → `batiment` → `niveau` → `zone`. `niveau.ordinal` is a signed integer (sous-sol -2, rez 0, etc.) — this is the sort key, `niveau.nom` is a free-text label only.
- `zone.niveauId` is nullable **only** for exterior zones (garden, terrace...), rattached to the property directly. Exterior is a zone like any other, never a special case in the UI — the word "pièce" must never appear in the interface, only "zone" or "lieu" (rule #12).
- `element` is the core table: `zoneId` is `NOT NULL` at the schema level (rule #1 — a fiche without a zone would escape the share filter; this is a DB constraint, not form validation). `niveau` (0 public · 1 usage · 2 technique · 3 privé) gates visibility and is what a share's `niveau_max` is compared against — `seed-exemple.ts` sets it explicitly on every fiche, since the default of 3 would leave a "usage" link with nothing to show. `details` is JSONB validated at runtime against `typeElement.champs`. `recherche` is a **weighted** `tsvector` written **only** by a Postgres trigger (`trg_maj_recherche_element` + propagation triggers added in migration 0003 for zone/systeme/type_element renames), never from application code — see "Search" below before touching it.
- `plan` / `point` / `zone_geom` (`plans.ts`) : plus inutilisées depuis l'étape 4 — lire la section « Plan » avant d'y toucher. `point.x`/`point.y` sont des pourcentages bornés par un `CHECK`, `zone_geom` reste vide jusqu'à l'étape 6.
- `partage`: `jeton` is 32 random bytes in base64url (never sequential — it is the secret, same reasoning as `session.id`). `porteeZones`/`porteeSystemes` empty = whole property. `revoqueLe` is dated, never deleted: the record of what was shared, and with whom, is the point.
- `typeElement`: `origine` is `'systeme'` (catalogue, `proprieteId` NULL, immutable) or `'perso'` (`proprieteId` set). `champs: ChampDefinition[]` is JSONB; `genre` is a closed list of six values — `CHAMP_GENRES` in `app/db/schema/types.ts` is the single source of truth, imported everywhere (`ChampEditor.tsx`, `DynamicElementFields.tsx`, `types.nouveau.tsx`) rather than re-declared (rule #6 — don't let this list grow into "computed field" or "relation", that's a different product).
- A field's `cle` (key) is immutable once created; only `label` renames; a removed field is hidden, never deleted, so `champSchema.ts`'s zod schema uses `.passthrough()` to tolerate stale keys in existing `details`.

**Dynamic forms**: `app/lib/forms/champSchema.ts` builds a zod schema from `ChampDefinition[]` at request time (`schemaPourChamps`/`validerDetails`). `genre: "fichier"` is always optional regardless of `obligatoire` — file upload doesn't exist until Étape 6. `DynamicElementFields.tsx` renders the matching inputs via `switch/case` with an exhaustive `never` default guard, so adding a genre without updating the renderer is a type error.

**Auth**: `app/lib/auth/session.server.ts`. Session id is a random 32-byte hex token stored as the PK of the `session` table (not a sequential int — it doubles as the cookie secret; a guessable id would be a session-fixation risk). `requireUtilisateurId` redirects to `/connexion?depuis=<path>` when absent. Passwords hashed with `@node-rs/argon2`.

**Search** (`app/lib/recherche/`, Étape 2). Three things are load-bearing and none of them are visible from the application code alone:

- **The text search config is `french_sans_accent`, not `french`** — a copy of `french` with the `unaccent` dictionary in front, created by migration 0005. Plain `french` stems plurals but keeps diacritics, so `plainto_tsquery('french','eclairage')` never matched `Éclairage`. Its name is written in two places, the migration SQL (which defines the trigger) and `recherche.server.ts` (which builds the queries); a shared constant is impossible since the trigger lives in the database. Both sides carry a comment saying so.
- **`element.recherche` is weighted**: A = fiche name, B = fiche alias + type name and alias, C = zone and système names, D = `details` values. `ts_rank` reads those weights and nothing else — it ignores position and provenance — so **the weights are the whole ranking**. The trap: `@@` ignores weights entirely, so breaking `setweight` in the trigger leaves every membership test green while ranking silently stops distinguishing a name match from a details match. `tests/recherche/requete.test.ts` is the only thing that catches it.
- **The visibility filter is a parameter of every query over `element`.** `Portee` (`niveauMax`, `zones`, `systemes`) is taken by `rechercher`, `chargerFacettes` and `chargerZonesVignettes`; the owner passes `PORTEE_PROPRIETAIRE`, a share link passes `porteeDuPartage(partage)`. `clausePortee` is **exported** so the share's own queries (fiche, image) use the same clause rather than a second writing of the same idea. Any new query over `element` must take the same parameter — a scope that hid fiches but still let their count show in the zone grid would be a leak (rule #4).

The match reason shown on each result is computed against an OR-variant of the query, derived from `plainto_tsquery`'s own output text by `replace(' & ', ' | ')`. With `plainto_tsquery`'s AND, a two-word query whose terms land in two different fields matches the fiche while no single field matches, and the label comes back empty.

**`porteeRestreinte(portee)`** — true as soon as the ceiling drops below 3 or a zone/système scope is set — gates three behaviours in `recherche.server.ts`. They are derived from the scope, never from a caller-supplied flag, precisely so a future share screen cannot forget to pass one:
- the zone grid drops zones with no visible object (a « Local technique · 0 objet » tile says the room exists);
- `chercherTypesProches` returns nothing (the **perso** types name the owner's things);
- the search vector becomes `ts_filter(e.recherche, '{a,b,c}')` and the `details` match label is disabled — weight D indexes *every* `details` value regardless of its `niveauMin`, so without this a link holder could confirm a masked serial number by typing it. Cost: no `details` value is searchable from a link at all, and the GIN index is out for that query.

**Search propagation**: renaming a `zone`, `systeme`, or `type_element` needs to re-derive `element.recherche` for every element that references it — handled by the three AFTER UPDATE triggers added in migration 0003, not by application code. They work by forcing a no-op `UPDATE element SET recherche = recherche`, which re-runs `maj_recherche_element` rather than duplicating its concatenation logic; migration 0005 reuses the same trick to backfill existing rows. Covered by `tests/schema/recherche-trigger.test.ts`.

**Partage** (`app/lib/partage/`, `app/routes/_partage/`, Étape 3). A share link projects the same base through a ceiling and a scope. Four things carry the weight:

- **`porteeDuPartage(partage)` is the only place** `niveau_max` / `portee_zones` / `portee_systemes` become a `Portee`. Both arrays empty → `null`/`null` → empty scope → the whole property under the ceiling. Everything else consumes `Portee`, so no screen re-derives the rule.
- **`niveau_min` per field is finally applied**, by `champs.ts`'s `champsVisibles(champs, details, niveauMax)`, **in the loader**. What is filtered is never sent to the client — masking at render time would leave the value in the page source. It also drops `genre: "fichier"`, empty values, and `details` keys with no matching field definition (a removed field is hidden, never erased — rule #5 — and without a definition it has no `niveauMin` left to honour).
- **Filtered = 404, never 403** (a 403 confirms existence), for the fiche and for the token-scoped image route `/p/:jeton/fichiers/:fichierId`. An image's right to be read comes from the linked fiche passing `clausePortee` — **`fichier.niveau` is deliberately ignored**, capture always writes 3 and reading it would hide every photo of every share. An inactive link serves nothing.
- **Unknown token = 404, expired or revoked = neutral page.** Nothing of the property is loaded in the second case, so nothing can be rendered.

The page carries `handle.sansScripts` (`document.ts`), which `root.tsx` reads via `useMatches()` to skip `<Scripts />`: **no JavaScript at all**, so search is a GET form, facets are links, and the overflow is a native `<details>`. The manifest and the service-worker registration live in `_app/layout.tsx`, not `root.tsx`, so a route outside the protected tree structurally cannot install the PWA — don't move them back. Components take pre-built links (`liensPropriete` / `liensPartage` in `app/components/recherche/liens.ts`) rather than a `proprieteId`, so the share page has no means of writing a protected URL.

The preview (`partages/:partageId/apercu`) calls `chargerContenuPartage`, the real loader, and renders `PagePartage`, the real component. Keep it that way: `tests/partage/routes.test.ts` compares both loaders' output field by field. README's "Revue de fuite" table lists every surface that renders DB-derived data on a share page and how each is filtered — update it when you add one.

**Plan** (`app/lib/plans/`, `app/components/plan/`, `app/routes/_app/plans.*`, Étape 4). Le plan projette la même base que la recherche, à travers la même `Portee`. Cinq choses portent le poids :

- **`point.x` / `point.y` sont des pourcentages de l'image, bornés par un `CHECK` en base** (`point_x_valide`, `point_y_valide`) et non par le formulaire — même raisonnement que `element.zone_id NOT NULL`. C'est ce qui rend le remplacement d'une image de plan inoffensif pour les points, propriété tenue par `tests/plans/image.test.ts`. Pas d'unicité sur `element_id` (un objet traversant les niveaux porte un point par plan) ni sur `(element_id, plan_id)` : reposer un objet là où il est déjà **déplace** son point, en code applicatif.
- **`plan_type_niveau_coherent`** (migration 0006) exige `etage` ⇒ niveau non nul et `situation` ⇒ niveau nul. Ce couple décide des zones que couvre un plan, donc du filtre qui le sert : ce n'est pas une contrainte cosmétique.
- **`clausePlanVisible(portee)` est le prédicat de listage** : un plan n'est servi que si au moins une zone de son niveau porte un objet visible (les zones extérieures pour un plan de situation). C'est la règle de la grille de zones appliquée à la géométrie — une entrée « Sous-sol » dans un sélecteur divulgue autant qu'une tuile « Local technique · 0 objet ». Elle est **exportée** parce que la route à jeton s'en sert pour autoriser l'image d'un plan. Corollaire assumé : un point visible sur un plan non listé est inatteignable.
- **La route à jeton a deux droits distincts et nommés**, `photoDUneFiche` puis `imageDUnPlan` (`contenu.server.ts`), jamais un `OR` dans une seule requête. Un plan n'a pas de `fichier_lien` : sans la seconde branche il tomberait en 404, et avec un `OR` on ne saurait plus lequel des deux droits a ouvert la porte.
- **`plan.nom` ne sort jamais des écrans du propriétaire.** L'étiquette servie à un partage vient de `niveau.nom` et du rang (`etiquettePlan`), parce que le nom est du texte libre où l'adresse peut se trouver (règle #7). Ce que le code ne sait pas filtrer, en revanche, c'est l'adresse **imprimée dans l'image** d'un extrait cadastral : c'est dit à l'écran de téléversement et listé dans la revue de fuite.

`traiterImage` prend désormais des options (`largeurMax`, `qualite`, `rotation`, `recadrage`). La rotation puis le recadrage sont appliqués par `sharp` côté serveur, à partir des octets d'origine et de cinq nombres envoyés par le navigateur : un seul encodage, et un critère vérifiable sans navigateur. Les plafonds du plan (`LARGEUR_MAX_PLAN`, `QUALITE_PLAN`) vivent dans `app/lib/plans/types.ts` et non dans le module d'images, parce que le navigateur en a besoin pour rastériser un PDF et ne peut pas importer un module qui charge sharp.

Côté propriétaire, `VuePlan` fait zoom, déplacement et regroupement **sans bibliothèque**. Le regroupement est une fonction pure (`regroupement.ts`) sur une grille en coordonnées écran, testée sans DOM : c'est la seule pièce de la vue qui décide quelque chose. Côté partage, `PlanStatique` sert une `<img>` et des ancres numérotées avec une légende — pas d'étiquettes sur le plan, puisque sans script rien ne dépile deux points superposés.

`zone_geom` reste **vide** : aucun écran ne l'alimente avant l'étape 6. La requête filtrée (`chargerPolygonesDuPlan`) est écrite et rendue, et éprouvée par un test qui insère des lignes directement en base — une requête filtrée jamais exécutée n'est qu'une intention.

`pdfjs-dist` est importé **dynamiquement et gardé par le type du fichier** (`app/lib/plans/pdf.ts`) : 483 Ko de chunk plus un worker de 1,27 Mo qui ne sont chargés que si un PDF est réellement ouvert. Ne le transforme pas en import statique.

**Seeds** (`scripts/seed-catalogue.ts`, `scripts/seed-exemple.ts`): both idempotent by construction — catalogue via a partial unique index (`UNIQUE(nom) WHERE origine = 'systeme'`), example property via an application-level guard on the property name. On conflict the catalogue refreshes **`alias` only**: enriching the search vocabulary is the point (the 0003 propagation trigger then re-derives `element.recherche` on its own), while overwriting `champs` wholesale would delete a field removed from the catalogue, when rule #5 says it must be hidden and never erased. `seed-catalogue.ts` exports `CATALOGUE` and is imported (not shelled out to) by both the seed script and the test suite, to keep the type catalogue as one source of truth. It also opens a `pg.Pool` at module scope, so importing it from a throwaway script hangs the process — the test suite gets away with it because vitest tears down.

## Conventions

- French names throughout: files, DB columns/tables, route paths (`connexion`, `proprietes`, `batiments`), variables, comments. Keep this consistent in new code.
- No path aliases (`~/`) — relative imports everywhere, by explicit choice (README decision #13).
- **Never export anything but the known route exports** (`loader`, `action`, `handle`, `meta`, `headers`, `links`, the default component) from a file under `app/routes/`. An unrecognised export is not stripped from the client bundle: a `chargerNiveaux` exported from `plans.nouveau.tsx` shipped drizzle and the whole schema to the browser, 170 kB instead of 2 kB. Keep such helpers module-private, or move them to a `.server.ts`.
- Comments explain *why*, matching this file's own style — e.g. why a CHECK constraint isn't declared at the schema level, why a helper takes a generic `PgTable` and casts once. Don't add comments that restate the code.

## Gestion GitHub

Projet solo (theo-bggtt/gestionImmobiliere) : gestion via issues/PR depuis le 2026-09-03, pas de push direct sur master pour du travail non trivial.

- **Issues** : à créer avant tout travail non trivial (feature, bug identifié en cours de route, refactor) — titre court, contexte, critères d'acceptation, labels type + étape. Vérifier d'abord avec `gh issue list` qu'elle n'existe pas déjà. Fix trivial (typo, une ligne, pas de logique) : commit direct, pas d'issue. Fermeture uniquement via `Closes #N` dans la PR, jamais à la main.
- **Branches/PR** : une branche par issue (`type/description-courte`), titre de PR au format `type(scope): description` comme les commits. Corps court : Contexte / Changements / Tests effectués / Closes #N. `npm run typecheck` et les tests concernés doivent passer avant l'ouverture. Squash merge, suppression de la branche après merge.
- **Labels** : `bug` (défaut GitHub, gardé), `docs`, `feature`, `chore`, `refactor`, `bloquant` (bug qui bloque l'étape en cours uniquement), `etape-N` (un par étape du plan, créé quand l'étape démarre). Pas de labels de priorité fine ni d'équipe — inutile en solo.
- **Milestones** : un par étape (« Étape N »), regroupe les issues de cette étape, fermé quand l'étape est terminée. Les issues ouvertes du milestone en cours (`gh issue list --milestone "Étape X"`) sont la seule source de vérité pour le backlog, pas de TODO.md ni les fichiers `.decisions/prompt-etape-*.md`.
- **Jamais sans demande explicite** : workflow GitHub Actions, template d'issue/PR élaboré, bot de triage, CODEOWNERS, ou autre artefact d'équipe.
- Tout en français : titres, descriptions, labels, milestones.
