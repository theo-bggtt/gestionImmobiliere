# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

La mémoire technique d'une maison : le propriétaire consigne où passe la gaine RJ45, quelle vanne coupe quoi, qui a posé la chaudière. La même base se projette différemment selon qui la regarde (propriétaire, locataire, artisan, jardinier) via des liens de partage scopés par niveau et par zone/système. Stack : React Router v7 (SSR, mode framework) + Express + PostgreSQL + Drizzle ORM.

Currently at **Étape 0/1** (socle + capture) of a staged build. Full spec, the 8 locked design decisions, and the 12 non-negotiable rules live in `.decisions/implementation-plan.md` — read it before any schema or permission-model change. `README.md`'s "Décisions prises" section lists implementation choices made where the spec was silent.

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

## Architecture

**Routing**: `app/routes.ts` (not file-system routing) defines two trees. `_public/*` (connexion, inscription, deconnexion) is unauthenticated. Everything else sits under `_app/layout.tsx`, prefixed `proprietes/:proprieteId/...` — every authenticated route is scoped by `proprieteId` in the URL. A future public share tree (`/p/:jeton`, Étape 3) will be separate from `_app`.

**Multi-tenancy / IDOR guard**: every loader and action for a resource must verify it belongs to the `proprieteId` in the URL, not just that it exists. Two helpers do this:
- `requireProprieteAccess(utilisateurId, proprieteIdParam)` (`app/lib/db/proprieteAccess.server.ts`) — checks the property itself belongs to the logged-in user.
- `chargerRessourceOu404(table, condition, message)` (`app/lib/db/scopedResource.server.ts`) — generic loader for tables that carry `proprieteId` directly (batiment, zone, systeme, element). `niveau` reaches `proprieteId` only via a join on `batiment` and is handled by hand in `zoneTree.ts` (`niveauAppartientALaPropriete`, `zoneParenteValide`).

Never distinguish "doesn't exist" from "not yours" — always 404, both in these helpers and in `requireProprieteAccess`. This is rule #4 of the 12 non-negotiable rules in the implementation plan.

**Data model** (`app/db/schema/*.ts`, one file per table or small related group, re-exported from `index.ts`):
- Structure: `propriete` → `batiment` → `niveau` → `zone`. `niveau.ordinal` is a signed integer (sous-sol -2, rez 0, etc.) — this is the sort key, `niveau.nom` is a free-text label only.
- `zone.niveauId` is nullable **only** for exterior zones (garden, terrace...), rattached to the property directly. Exterior is a zone like any other, never a special case in the UI — the word "pièce" must never appear in the interface, only "zone" or "lieu" (rule #12).
- `element` is the core table: `zoneId` is `NOT NULL` at the schema level (rule #1 — a fiche without a zone would escape the share filter; this is a DB constraint, not form validation). `niveau` (0 public · 1 usage · 2 technique · 3 privé) gates visibility. `details` is JSONB validated at runtime against `typeElement.champs`. `recherche` is a `tsvector` written **only** by a Postgres trigger (`trg_maj_recherche_element` + propagation triggers added in migration 0003 for zone/systeme/type_element renames), never from application code.
- `typeElement`: `origine` is `'systeme'` (catalogue, `proprieteId` NULL, immutable) or `'perso'` (`proprieteId` set). `champs: ChampDefinition[]` is JSONB; `genre` is a closed list of six values — `CHAMP_GENRES` in `app/db/schema/types.ts` is the single source of truth, imported everywhere (`ChampEditor.tsx`, `DynamicElementFields.tsx`, `types.nouveau.tsx`) rather than re-declared (rule #6 — don't let this list grow into "computed field" or "relation", that's a different product).
- A field's `cle` (key) is immutable once created; only `label` renames; a removed field is hidden, never deleted, so `champSchema.ts`'s zod schema uses `.passthrough()` to tolerate stale keys in existing `details`.

**Dynamic forms**: `app/lib/forms/champSchema.ts` builds a zod schema from `ChampDefinition[]` at request time (`schemaPourChamps`/`validerDetails`). `genre: "fichier"` is always optional regardless of `obligatoire` — file upload doesn't exist until Étape 6. `DynamicElementFields.tsx` renders the matching inputs via `switch/case` with an exhaustive `never` default guard, so adding a genre without updating the renderer is a type error.

**Auth**: `app/lib/auth/session.server.ts`. Session id is a random 32-byte hex token stored as the PK of the `session` table (not a sequential int — it doubles as the cookie secret; a guessable id would be a session-fixation risk). `requireUtilisateurId` redirects to `/connexion?depuis=<path>` when absent. Passwords hashed with `@node-rs/argon2`.

**Search propagation**: renaming a `zone`, `systeme`, or `type_element` needs to re-derive `element.recherche` for every element that references it — handled by the three AFTER UPDATE triggers added in migration 0003, not by application code. Covered by `tests/schema/recherche-trigger.test.ts`; when writing fixtures for these tests, avoid accented characters in names that must match after stemming (the `french` tsvector config caused a mismatch on "Séchoir" — use ASCII equivalents).

**Seeds** (`scripts/seed-catalogue.ts`, `scripts/seed-exemple.ts`): both idempotent by construction — catalogue via a partial unique index (`UNIQUE(nom) WHERE origine = 'systeme'`) + `onConflictDoNothing`, example property via an application-level guard on the property name. `seed-catalogue.ts` exports `CATALOGUE` and is imported (not shelled out to) by both the seed script and the test suite, to keep the type catalogue as one source of truth.

## Conventions

- French names throughout: files, DB columns/tables, route paths (`connexion`, `proprietes`, `batiments`), variables, comments. Keep this consistent in new code.
- No path aliases (`~/`) — relative imports everywhere, by explicit choice (README decision #13).
- Comments explain *why*, matching this file's own style — e.g. why a CHECK constraint isn't declared at the schema level, why a helper takes a generic `PgTable` and casts once. Don't add comments that restate the code.

## Gestion GitHub

Projet solo (theo-bggtt/gestionImmobiliere) : gestion via issues/PR depuis le 2026-09-03, pas de push direct sur master pour du travail non trivial.

- **Issues** : à créer avant tout travail non trivial (feature, bug identifié en cours de route, refactor) — titre court, contexte, critères d'acceptation, labels type + étape. Vérifier d'abord avec `gh issue list` qu'elle n'existe pas déjà. Fix trivial (typo, une ligne, pas de logique) : commit direct, pas d'issue. Fermeture uniquement via `Closes #N` dans la PR, jamais à la main.
- **Branches/PR** : une branche par issue (`type/description-courte`), titre de PR au format `type(scope): description` comme les commits. Corps court : Contexte / Changements / Tests effectués / Closes #N. `npm run typecheck` et les tests concernés doivent passer avant l'ouverture. Squash merge, suppression de la branche après merge.
- **Labels** : `bug` (défaut GitHub, gardé), `docs`, `feature`, `chore`, `refactor`, `bloquant` (bug qui bloque l'étape en cours uniquement), `etape-N` (un par étape du plan, créé quand l'étape démarre). Pas de labels de priorité fine ni d'équipe — inutile en solo.
- **Milestones** : un par étape (« Étape N »), regroupe les issues de cette étape, fermé quand l'étape est terminée. Les issues ouvertes du milestone en cours (`gh issue list --milestone "Étape X"`) sont la seule source de vérité pour le backlog, pas de TODO.md ni les fichiers `.decisions/prompt-etape-*.md`.
- **Jamais sans demande explicite** : workflow GitHub Actions, template d'issue/PR élaboré, bot de triage, CODEOWNERS, ou autre artefact d'équipe.
- Tout en français : titres, descriptions, labels, milestones.
