# Le relevé, de la vitrine à la fiche — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul système de design fait main, « le relevé », partagé par l'application, la page d'un lien, les pages de connexion et la vitrine ; la vitrine réécrite du côté du client ; une marge de navigation sur ordinateur ; sept mouvements sobres.

**Architecture:** Trois feuilles CSS natives sans outil : `app/styles/releve.css` (jetons, polices, primitives, servie partout par `root.tsx`), `app/styles/app.css` (écrans du produit, servie partout), `app/styles/vitrine.css` (mises en page de vente, servie par le layout de la vitrine). Le JSX ne change que ses classes et quelques enveloppes ; aucun loader, aucune action, aucune règle de permission ne bouge. Une seule modification de politique : `font-src 'self'` sur `/p/`.

**Tech Stack:** React Router v7 (mode framework, SSR), React 19, Vite 5, CSS natif, vitest (node, sans DOM), Playwright MCP pour les captures et l'écoute de `securitypolicyviolation`.

**Spec:** `docs/superpowers/specs/2026-09-15-releve-commun-design.md` — le plan argumente depuis le spec ; lire les deux.

## Global Constraints

- Jamais le mot « pièce » (`/pi[eè]ces?\b/i`) dans un fichier sous `app/` ou `public/`, commentaires CSS compris (`tests/vocabulaire.test.ts`). On dit zone, ou lieu.
- Aucune `url(data:` ni `url("data:` dans aucune des trois feuilles : `img-src 'self'` sans `data:` sur `/p/` et la vitrine.
- Aucun attribut `style` dans `app/routes/_vitrine/**` ni dans `app/components/PageErreur.tsx` ; aucun `<img`, `backgroundImage`, `url(` dans `app/routes/_vitrine/**` (`tests/vitrine/discours.test.ts`).
- Les attributs `style` en pourcentage de `VuePlan.tsx`, `PlanStatique.tsx` et `EditeurImagePlan.tsx` restent tels quels (`tests/partage/plan.test.ts` épingle `left:25%`).
- Aucun export hors des quinze reconnus depuis un fichier de `app/routes/` : tout composant nouveau va dans `app/components/` (`tests/exports-routes.test.ts`).
- Un composant importé par une route de `_vitrine/` n'importe rien de `app/db/`, d'un `*.server.*`, ni de `drizzle-orm`/`pg` (`tests/vitrine/etancheite.test.ts`).
- Le déclencheur de capture reste un `<label>` contenant l'`<input type="file" capture>` (Safari iOS).
- `.page-partage` reste à `max-width: 720px` (l'image moyenne du plan est calibrée sur 688 px de contenu).
- Le HTML de la page d'un lien ne contient jamais `<script`, `manifest`, `sw.js`, `/proprietes/`, `<button`, `onclick`.
- Interdits de texte sur la vitrine : `\d+ secondes?`, « hors ligne »/« offline », un tarif, une affirmation juridique, un compte d'inscrits.
- Trois traits, jamais un quatrième : `--coupe` (2.5px encre), `--vu` (1px pâle), tireté (1px graphite). Angles droits partout sauf les cercles. Aucune ombre sauf le voile de la feuille et le halo d'un point.
- Aucun `!important`, aucun `@layer`, aucun sélecteur d'élément nu hors de `releve.css`.
- Tout mouvement vit sous `@media (prefers-reduced-motion: no-preference)` ; l'état de repos est l'état final ; rien n'est parqué à `opacity: 0`.
- Après chaque tâche : `npm run typecheck`, `npm test` (vert sauf les quatre échecs Windows connus de `tests/scripts/lire-env.test.ts`), `npm run build && npm run verifier:bundle`. La base doit tourner : `docker compose up -d postgres`.
- Commits en français, un par tâche au moins, terminés par les deux lignes d'attribution de la session.

---

### Task 0 : L'issue

**Files:** aucun.

- [x] **Step 1 : Vérifier qu'elle n'existe pas**

Run : `gh issue list --state open --search "relevé"`
Expected : seule #58 (vitrine, fermée par PR #59) apparaît.

- [x] **Step 2 : Créer l'issue**

```bash
gh issue create --label feature --title "Refonte visuelle commune : le relevé, de la vitrine à la fiche" --body-file - <<'EOF'
## Contexte

Le projet n'a aucun framework de style, mais deux langages : la vitrine porte le relevé d'architecte (encre, papier, trois traits, Fraunces), l'application est restée en police système, cartes blanches arrondies et capsules. Décision du 2026-09-15 : un seul système de design fait main pour les deux, React Router v7 restant tel quel.

Spec : `docs/superpowers/specs/2026-09-15-releve-commun-design.md`. Maquette : https://claude.ai/artifact/MQnZ7F2hBvWnuMpKtZDpdL

## Critères d'acceptation

- [x] `app/styles/releve.css` déclare une fois les jetons, les deux polices auto-hébergées (Fraunces, Instrument Sans) et les primitives ; `app.css` et `vitrine.css` n'en redéclarent aucune.
- [x] L'application, la page d'un lien, les pages de connexion et la vitrine partagent ces primitives : angles droits, aucune ombre, trois traits.
- [x] À partir de 1000 px, l'application a une marge de navigation à gauche ; sous 1000 px, rien ne change dans les parcours.
- [x] La vitrine est réécrite du côté du client (plus un mot du dépôt, des tests, du code) et « Ce que ça fait » porte neuf pictogrammes en SVG inline.
- [x] Sept mouvements, tous sous `prefers-reduced-motion`, la vitrine toujours sans script.
- [x] `font-src 'self'` sur `/p/`, épinglé par `tests/serveur/application.test.ts`.
- [x] Aucune violation de politique au navigateur sur les trois arbres ; aucun débordement à 320 px.
- [x] README, CLAUDE.md et le plan d'implémentation consignent les deux renversements (décision #143, clause « police système » de #8).
EOF
```

Expected : un numéro d'issue, noté pour le `Closes #N` de la PR.

---

### Task 1 : Le socle — polices, `releve.css`, `font-src`, coquille

**Files:**
- Create: `app/styles/releve.css`
- Create: `app/styles/polices/instrument-sans-latin.woff2`, `app/styles/polices/LICENCE-InstrumentSans.txt`
- Move: `public/polices/fraunces-latin.woff2` → `app/styles/polices/fraunces-latin.woff2`, `public/polices/LICENCE-Fraunces.txt` → `app/styles/polices/LICENCE-Fraunces.txt`
- Move: `app/components/vitrine/Echelle.tsx` → `app/components/Echelle.tsx`
- Modify: `app/root.tsx:5,11-14` (links), `app/styles/app.css:6-19` (`:root`), `app/styles/vitrine.css:49-80` (`@font-face`, `:root`), `server/application.js:125-132` (`CSP_PARTAGE`), `public/sw.js:18`, `app/lib/capture/coquille.ts:16-17`, `app/routes/_vitrine/accueil.tsx`, `app/routes/_vitrine/partage.tsx` (import d'`Echelle`)
- Test: `tests/serveur/application.test.ts:128-164`

**Interfaces:**
- Produces : les jetons `--papier --creux --feuille --pale --teinte --graphite --texte --encre --encre-claire --revision --coupe --vu --cible --gouttiere --colonne --large --marge --titrage --corps` ; les classes `.bouton-plein .bouton-trait .bouton-discret .champ .champ-aide .cote .filets .filet-tirete .etiquette .etiquette-active .etiquette-hors .etiquette-nombre .pastille .echelle .plein .niveau-choix .message-ok .message-erreur .message-avis .sous-titre .formulaire .formulaire-ligne .formulaire-actions .porte .large .pleine` ; le composant `Echelle({ plafond: 1|2|3|4 })` depuis `app/components/Echelle.tsx`.

- [x] **Step 1 : Écrire le test de la politique de `/p/`**

Dans `tests/serveur/application.test.ts`, dans le test « sur /p/, interdisent tout script… » (ligne ~147), après `expect(csp, chemin).toContain("frame-ancestors 'none'");` ajouter :

```ts
      // Les polices de `releve.css` sont servies depuis ce serveur : sans
      // `font-src`, `default-src 'none'` les bloquerait et la page d'un lien
      // retomberait sur la police système, seule de tout le produit.
      expect(csp, chemin).toContain("font-src 'self'");
```

Et dans le test « sur /P/ aussi… » (ligne ~128), après `expect(csp, chemin).not.toContain("script-src");` :

```ts
      expect(csp, chemin).toContain("font-src 'self'");
```

- [x] **Step 2 : Le voir échouer**

Run : `npx vitest run tests/serveur/application.test.ts`
Expected : les deux tests échouent sur `font-src 'self'`.

- [x] **Step 3 : Ajouter la directive**

`server/application.js`, `CSP_PARTAGE` :

```js
const CSP_PARTAGE = [
  "default-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  // Les deux polices de `releve.css`, servies depuis ce serveur et depuis lui
  // seul. Ajoutée avec la refonte visuelle commune : sans elle la page d'un
  // lien était la seule du produit en police système.
  "font-src 'self'",
  "img-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");
```

Run : `npx vitest run tests/serveur/application.test.ts` → tout passe.

- [x] **Step 4 : Les polices sous `app/styles/polices/`**

```bash
mkdir -p app/styles/polices
git mv public/polices/fraunces-latin.woff2 app/styles/polices/fraunces-latin.woff2
git mv public/polices/LICENCE-Fraunces.txt app/styles/polices/LICENCE-Fraunces.txt
curl -sS -L -o app/styles/polices/instrument-sans-latin.woff2 "https://fonts.gstatic.com/s/instrumentsans/v4/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1Q.woff2"
curl -sS -L -o app/styles/polices/LICENCE-InstrumentSans.txt "https://raw.githubusercontent.com/Instrument/instrument-sans/main/OFL.txt"
```

Vérifier : `ls -la app/styles/polices` → quatre fichiers, le woff2 d'Instrument Sans fait 30 092 octets, la licence commence par « Copyright » et contient « SIL Open Font License ». Si le dépôt GitHub ne répond pas, la licence OFL 1.1 avec le copyright « Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans) » est écrite à la main : le texte de l'OFL 1.1 est public et identique à `LICENCE-Fraunces.txt` après la ligne de copyright.

- [x] **Step 5 : Écrire `app/styles/releve.css`**

```css
/* app/styles/releve.css
   Le langage visuel du produit, déclaré UNE fois et servi à tous les arbres
   par `root.tsx` : l'application, la page d'un lien, les pages de connexion,
   la vitrine. `app.css` (les écrans du produit) et `vitrine.css` (les mises
   en page de vente) composent avec ce qui est ici et ne redéclarent ni un
   jeton ni une primitive.

   ── L'IDÉE PORTEUSE : L'ÉPAISSEUR DU TRAIT EST UNE INFORMATION ──────────

   Sur un relevé d'architecte, l'épaisseur et le motif d'un trait ne décorent
   pas, ils disent quelque chose : un trait ÉPAIS est une coupe (le mur qu'on
   traverse), un trait FIN est une projection (ce qu'on voit sans le couper),
   un trait INTERROMPU est ce qui existe mais n'est pas visible d'où l'on se
   tient. C'est le modèle de permission du produit, et c'est désormais le
   vocabulaire de chaque écran : le début d'un bloc est une coupe, le filet
   entre deux lignes une projection, un lien révoqué ou un champ masqué un
   tireté. N'introduis pas une quatrième épaisseur pour des raisons
   esthétiques — chacune de celles-ci répond à une question.

   ── CE QUE CETTE FEUILLE S'INTERDIT ────────────────────────────────────

   Aucune `url(data:)` : la politique de `/p/` et celle de la vitrine n'ont
   pas `data:` dans `img-src`, et cette feuille leur est servie. Un chevron
   de `select` est un `linear-gradient`, pas une icône encodée.

   Aucun sélecteur d'élément nu ailleurs qu'ici : `app.css` et `vitrine.css`
   ne posent des règles que sur des classes. C'est ce qui a coûté trois
   télescopages de spécificité à la vitrine (`.v-sec p` battait `.v-jour`).

   Aucun `border-radius` hors des cercles (pastille, sommet, point de plan),
   aucune ombre hors du voile de la feuille de confirmation et du halo d'un
   point sur une photo de plan : un tirage n'a ni coins ronds ni relief.

   Deux polices, servies depuis ce serveur (Vite les hache dans `/assets/`,
   donc la coquille hors ligne les garde), latin seul, licence à côté du
   fichier. `/confidentialite` affirme qu'aucune police n'est chargée chez un
   tiers, et `font-src 'self'` le fait tenir par le navigateur sur les trois
   arbres. Pas d'italique chargé.

   Tout mouvement vit sous `prefers-reduced-motion: no-preference`, et l'état
   de repos est toujours l'état final : rien n'est parqué invisible. */

@font-face {
  font-family: "Fraunces";
  src: url("./polices/fraunces-latin.woff2") format("woff2");
  font-weight: 300 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308,
    U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: "Instrument Sans";
  src: url("./polices/instrument-sans-latin.woff2") format("woff2");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308,
    U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

:root {
  /* Le papier et l'encre. Aucune couleur nouvelle par rapport au produit
     d'avant : l'encre est l'ancien `--accent`, la révision l'ancien
     `--alerte`. Ce qui change est le rôle — l'encre dessine tout, le rouge ne
     sert qu'à ce qui est refusé, masqué ou expiré, jamais à attirer l'œil. */
  --papier: #faf9f7;
  --creux: #f1f0ea;
  --feuille: #ffffff;
  --pale: #d5d8d2;
  --graphite: #5f6763;
  --texte: #1b1b19;
  --encre: #1f4f46;
  --encre-claire: #2c6c60;
  --revision: #8c2f1f;
  --teinte: color-mix(in srgb, var(--encre) 8%, var(--papier));

  /* Les trois traits, et pas un quatrième. Voir l'en-tête. */
  --coupe: 2.5px;
  --vu: 1px;

  /* Plancher d'une cible tactile dans un flux de saisie : un pouce, pas un
     curseur. Et la gouttière de l'app sur téléphone. */
  --cible: 56px;
  --gouttiere: 16px;

  /* La grille de planche. `--colonne` tient sous 75 caractères au corps
     courant ; `--large` est la largeur des blocs qui débordent du texte sans
     aller jusqu'au bord ; `--marge` est le bord de l'écran. */
  --colonne: 34rem;
  --large: 66rem;
  --marge: 20px;

  --titrage: "Fraunces", Georgia, "Times New Roman", serif;
  --corps: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--papier);
}

body {
  margin: 0;
  background: var(--papier);
  color: var(--texte);
  font: 16px/1.55 var(--corps);
  -webkit-text-size-adjust: 100%;
}

/* ── Titres et corps ──────────────────────────────────────────────────
   L'échelle est franche et le titre de page est LÉGER : Fraunces à 300 en
   grand corps se lit comme un tracé, la même taille en gras comme une
   réclame. */
h1,
h2,
h3 {
  font-family: var(--titrage);
  font-weight: 400;
  color: var(--encre);
  margin: 0;
  text-wrap: balance;
}
h1 {
  font-size: clamp(2rem, 1.4rem + 1.8vw, 2.6rem);
  font-weight: 300;
  line-height: 1.05;
  letter-spacing: -0.015em;
  margin-bottom: 18px;
}
h2 {
  font-size: 1.6rem;
  line-height: 1.15;
  letter-spacing: -0.012em;
  margin-bottom: 12px;
}
h3 {
  font-size: 1.12rem;
  font-weight: 500;
  line-height: 1.25;
  margin-bottom: 8px;
}
p {
  margin: 0 0 14px;
}
a {
  color: var(--encre);
  text-decoration-color: var(--pale);
  text-underline-offset: 3px;
}
a:hover {
  text-decoration-color: var(--encre);
}
ul,
ol {
  margin: 0 0 14px;
  padding-left: 22px;
}
dl {
  margin: 0;
}
img,
svg {
  max-width: 100%;
}
figure {
  margin: 0;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
legend {
  padding: 0;
}

/* ── Le focus clavier ─────────────────────────────────────────────────
   Un trait de coupe, déclaré une fois pour tout le produit. Les champs de
   saisie font exception : leur bord devient lui-même une coupe. */
:focus-visible {
  outline: var(--coupe) solid var(--encre);
  outline-offset: 3px;
}

/* ── Les boutons ──────────────────────────────────────────────────────
   Un aplat d'encre ou un rectangle de trait, comme un cartouche sur un
   tirage. `form button[type="submit"]` sans classe est un bouton plein :
   dix-sept écrans de formulaire n'en écrivent aucune. */
button {
  font: inherit;
  cursor: pointer;
  border-radius: 0;
}
.bouton-plein,
.bouton-trait,
.bouton-discret,
form button[type="submit"]:not(.bouton-trait):not(.bouton-discret) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 22px;
  font-family: var(--titrage);
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  border: var(--coupe) solid var(--encre);
  border-radius: 0;
  background: transparent;
  color: var(--encre);
}
.bouton-plein,
form button[type="submit"]:not(.bouton-trait):not(.bouton-discret) {
  background: var(--encre);
  color: var(--papier);
}
.bouton-plein:hover,
form button[type="submit"]:not(.bouton-trait):not(.bouton-discret):hover {
  background: var(--encre-claire);
  border-color: var(--encre-claire);
}
.bouton-plein:disabled,
form button[type="submit"]:disabled {
  background: var(--pale);
  border-color: var(--pale);
  color: var(--graphite);
  cursor: default;
}
.bouton-trait:hover {
  background: var(--creux);
}
.bouton-discret {
  min-height: 40px;
  padding: 0 14px;
  font-family: var(--corps);
  font-size: 0.94rem;
  border-width: var(--vu);
  border-color: var(--pale);
  color: var(--graphite);
}
.bouton-discret:hover {
  color: var(--encre);
  border-color: var(--encre);
}
/* `.bouton-plein` posé sur un lien : `a` (0,0,1) ne le bat pas, mais un
   `.x a` (0,1,1) d'aval le battrait. Les feuilles d'aval ne stylent pas `a`
   nu, c'est la règle. */
a.bouton-plein {
  color: var(--papier);
}

/* ── Les champs ───────────────────────────────────────────────────────
   Une feuille blanche bordée d'un trait fin, qui devient une coupe quand on
   écrit dedans. L'étiquette est en titrage, au-dessus, en graphite : c'est
   une cote, elle mesure ce qu'on demande. */
label {
  display: block;
  margin-bottom: 14px;
  font-family: var(--titrage);
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--graphite);
}
.champ,
input[type="text"],
input[type="email"],
input[type="password"],
input[type="number"],
input[type="date"],
input[type="search"],
input[type="tel"],
input[type="url"],
select,
textarea {
  display: block;
  width: 100%;
  min-height: 48px;
  margin-top: 6px;
  padding: 10px 12px;
  font: 1rem/1.4 var(--corps);
  color: var(--texte);
  background: var(--feuille);
  border: var(--vu) solid var(--pale);
  border-radius: 0;
}
.champ:hover,
input:hover,
select:hover,
textarea:hover {
  border-color: var(--graphite);
}
.champ:focus,
input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: var(--encre);
  box-shadow: inset 0 0 0 1.5px var(--encre);
}
.champ-erreur,
input[aria-invalid="true"] {
  border-color: var(--revision);
}
textarea {
  min-height: 96px;
  resize: vertical;
}
select {
  appearance: none;
  padding-right: 36px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--encre) 50%),
    linear-gradient(135deg, var(--encre) 50%, transparent 50%);
  background-position:
    calc(100% - 18px) 55%,
    calc(100% - 13px) 55%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}
input[type="checkbox"],
input[type="radio"] {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--encre);
}
input[type="file"] {
  font: inherit;
}
::placeholder {
  color: var(--graphite);
  opacity: 0.7;
}
.champ-aide {
  margin: 6px 0 0;
  font-family: var(--corps);
  font-size: 0.86rem;
  font-weight: 400;
  color: var(--graphite);
}

/* ── Le formulaire ────────────────────────────────────────────────────
   Une grille, deux colonnes pour les champs courts, les actions sous un
   filet. La suppression n'est jamais dans la même rangée que
   l'enregistrement : `.formulaire-danger` la sépare d'un tireté. */
.formulaire {
  display: grid;
  gap: 4px;
  max-width: var(--colonne);
}
.formulaire-ligne {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}
.formulaire-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: var(--vu) solid var(--pale);
}
.formulaire-danger {
  margin-top: 28px;
  padding-top: 16px;
  border-top: var(--vu) dashed var(--graphite);
}

/* ── La cote ──────────────────────────────────────────────────────────
   Un embout de coupe, une étiquette, puis la ligne qui court jusqu'au bord
   du bloc. Remplace les surtitres en capitales espacées : une cote se lit,
   elle ne s'annonce pas. */
.cote {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 18px;
  font-family: var(--titrage);
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--graphite);
}
.cote::before {
  content: "";
  align-self: stretch;
  min-height: 1.2em;
  border-left: var(--coupe) solid var(--encre);
}
.cote::after {
  content: "";
  flex: 1 1 auto;
  border-top: var(--vu) solid var(--pale);
}

/* Un sous-titre de bloc dans l'app : l'étiquette, et le lien d'action à
   droite, sur la même ligne de base. */
.sous-titre {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 8px;
  font-family: var(--titrage);
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--graphite);
}
.sous-titre a {
  font-size: 0.86rem;
  font-weight: 400;
}

/* ── Les filets ───────────────────────────────────────────────────────
   Une liste dont chaque ligne est séparée par une projection, et qui
   commence par une coupe. Remplace les cartes. */
.filets {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: var(--coupe) solid var(--encre);
}
.filets > li {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 8px 0;
  border-bottom: var(--vu) solid var(--pale);
}
.filets > li.filet-tirete {
  border-bottom-style: dashed;
  border-bottom-color: var(--graphite);
  color: var(--graphite);
}
.filets .nom {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 500;
  color: var(--texte);
}
.filets .lieu {
  font-size: 0.86rem;
  color: var(--graphite);
}
.filets a.nom,
.filets .nom a {
  text-decoration: none;
  color: var(--texte);
}

/* ── L'étiquette ──────────────────────────────────────────────────────
   Un rectangle de trait. Active : une coupe. Hors de portée, révoqué,
   expiré : un tireté. Remplace toutes les capsules. */
.etiquette {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  font-family: var(--corps);
  font-size: 0.86rem;
  line-height: 1.2;
  color: var(--graphite);
  background: transparent;
  border: var(--vu) solid var(--pale);
  border-radius: 0;
  text-decoration: none;
  cursor: pointer;
}
.etiquette-active {
  border: var(--coupe) solid var(--encre);
  color: var(--encre);
  font-weight: 500;
}
.etiquette-hors {
  border-style: dashed;
  border-color: var(--graphite);
  color: var(--graphite);
}
.etiquette-nombre {
  font-family: var(--titrage);
  font-size: 0.8rem;
  color: var(--graphite);
}
.etiquette-active .etiquette-nombre {
  color: var(--encre-claire);
}
span.etiquette {
  cursor: default;
}

/* ── La pastille ──────────────────────────────────────────────────────
   Un point numéroté, comme sur un plan. C'est un cercle : le seul rayon
   du produit. Le halo papier le détache d'une photo. */
.pastille {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--encre);
  color: var(--papier);
  font-family: var(--titrage);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--papier);
  text-decoration: none;
}

/* ── L'échelle ────────────────────────────────────────────────────────
   Quatre barreaux, remplis jusqu'au plafond : public, usage, technique,
   privé. Un dessin, toujours accompagné du mot. */
.echelle {
  display: inline-flex;
  gap: 3px;
  width: 64px;
  vertical-align: middle;
}
.echelle > span {
  flex: 1 1 0;
  height: 6px;
  background: var(--pale);
}
.echelle > span.plein {
  background: var(--encre);
}

/* Le choix du niveau d'une fiche : la même échelle, devenue un sélecteur.
   Ce que le visiteur a vu sur la page « Partager » est ce que le propriétaire
   manipule sur la fiche. */
.niveau-choix {
  display: flex;
  margin-top: 6px;
  border: var(--vu) solid var(--pale);
  background: var(--feuille);
}
.niveau-choix > label {
  position: relative;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding: 10px 12px;
  border-left: var(--vu) solid var(--pale);
  font-family: var(--corps);
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--graphite);
  cursor: pointer;
}
.niveau-choix > label:first-child {
  border-left: 0;
}
.niveau-choix > label:has(input:checked) {
  background: var(--teinte);
  color: var(--encre);
  font-weight: 500;
  box-shadow: inset 0 calc(-1 * var(--coupe)) 0 var(--encre);
}
.niveau-choix > label:has(input:focus-visible) {
  outline: var(--coupe) solid var(--encre);
  outline-offset: -3px;
}
.niveau-choix input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

/* ── Les messages ─────────────────────────────────────────────────────
   Une coupe à gauche, dans la couleur de ce qui est dit. L'avis est en
   tireté : c'est un fait, pas une alarme. */
.message-ok,
.message-erreur,
.message-avis {
  margin: 12px 0 0;
  padding: 6px 0 6px 14px;
  border-left: var(--coupe) solid currentColor;
  font-size: 0.95rem;
  line-height: 1.5;
}
.message-ok {
  color: var(--encre);
}
.message-erreur {
  color: var(--revision);
}
.message-avis {
  color: var(--graphite);
  border-left-style: dashed;
}

/* ── La porte ─────────────────────────────────────────────────────────
   Une colonne étroite et centrée : connexion, inscription, lien inactif,
   page d'erreur. */
.porte {
  max-width: 26rem;
  margin: 0 auto;
  padding: 56px var(--marge) 72px;
}
.porte-marque {
  display: inline-block;
  margin-bottom: 36px;
  font-family: var(--titrage);
  font-weight: 500;
  font-size: 1.15rem;
  color: var(--encre);
  text-decoration: none;
}
.porte form button[type="submit"] {
  width: 100%;
  min-height: var(--cible);
  margin-top: 8px;
}

/* ── La grille de planche ─────────────────────────────────────────────
   Des lignes nommées, du bord de l'écran au bord de l'écran. Un bloc se
   place sur l'une des trois portées — texte, large, pleine. La colonne de
   texte commence où commence la piste large : tout le mou est à DROITE,
   c'est la mise en page d'une planche. Portée par chaque section plutôt que
   par `<main>` : `subgrid` n'est pas lu par tous les navigateurs servis. */
.planche {
  display: grid;
  grid-template-columns:
    [bord-g] minmax(var(--marge), 1fr)
    [large-g texte-g] minmax(0, var(--colonne))
    [texte-d] minmax(0, calc(var(--large) - var(--colonne)))
    [large-d] minmax(var(--marge), 1fr)
    [bord-d];
  align-content: start;
}
.planche > * {
  grid-column: texte-g / texte-d;
  min-width: 0;
}
.planche > .large {
  grid-column: large-g / large-d;
}
.planche > .pleine {
  grid-column: bord-g / bord-d;
}
.planche > .cote {
  grid-column: large-g / large-d;
}

/* ── Le mouvement de base ─────────────────────────────────────────────
   Le trait s'épaissit, l'aplat s'éclaircit : 150 ms, le seul effet de
   survol du produit. Déclaré ici, sous le media qui l'autorise, pour que
   chaque primitive l'ait sans le redire. */
@media (prefers-reduced-motion: no-preference) {
  .bouton-plein,
  .bouton-trait,
  .bouton-discret,
  form button[type="submit"],
  .etiquette,
  .champ,
  input,
  select,
  textarea,
  .filets > li,
  .niveau-choix > label {
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease,
      box-shadow 150ms ease;
  }
}

/* ── Étroit ───────────────────────────────────────────────────────────*/
@media (max-width: 1000px) {
  :root {
    --large: 46rem;
  }
}
@media (max-width: 760px) {
  :root {
    --large: var(--colonne);
    --marge: 18px;
  }
  .formulaire-ligne {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .niveau-choix > label {
    padding: 10px 8px;
    font-size: 0.8rem;
  }
}
```

- [x] **Step 6 : `root.tsx` sert les deux feuilles**

```tsx
import feuilleReleve from "./styles/releve.css?url";
import feuilleDeStyle from "./styles/app.css?url";

// `releve.css` d'abord : c'est le langage (jetons, polices, primitives) ;
// `app.css` compose avec. L'ordre du tableau est l'ordre de la cascade.
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: feuilleReleve },
  { rel: "stylesheet", href: feuilleDeStyle },
  { rel: "icon", href: "/icones/icone-192.png", type: "image/png" },
];
```

Faire de même dans `app/components/PageErreur.tsx` : là où il rend `<link rel="stylesheet" href=…>`, rendre les deux feuilles dans cet ordre (lire le fichier pour trouver comment l'URL de `app.css` y arrive et suivre le même mécanisme pour `releve.css`).

- [x] **Step 7 : Ponter les anciens jetons**

`app/styles/app.css`, remplacer le bloc `:root { … }` (lignes 6-19) par :

```css
/* Pont transitoire vers `releve.css`, retiré à la fin de la refonte (tâche 7)
   quand plus aucune règle ci-dessous ne lit ces noms. */
:root {
  --fond: var(--papier);
  --surface: var(--feuille);
  --texte-doux: var(--graphite);
  --trait: var(--pale);
  --accent: var(--encre);
  --accent-clair: var(--encre-claire);
  --alerte: var(--revision);
  --rayon: 0px;
}
```

et retirer de `app.css` les règles `* { box-sizing }`, `body { … }`, `h1 { … }`, `h2 { … }`, `a { … }` (lignes 21-31) : elles vivent dans `releve.css`.

`app/styles/vitrine.css` : supprimer le bloc `@font-face` (lignes 49-57) et remplacer le `:root` (lignes 59-80) par :

```css
/* Pont transitoire, retiré à la tâche 2 quand cette feuille est réécrite
   sur les primitives de `releve.css`. */
:root {
  --v-titrage: var(--titrage);
  --v-encre: var(--encre);
  --v-encre-claire: var(--encre-claire);
  --v-graphite: var(--graphite);
  --v-pale: var(--pale);
  --v-papier: var(--papier);
  --v-creux: var(--creux);
  --v-revision: var(--revision);
  --v-coupe: var(--coupe);
  --v-vu: var(--vu);
  --v-colonne: var(--colonne);
  --v-large: var(--large);
  --v-marge: var(--marge);
}
```

Puis, dans les deux media queries de `vitrine.css` qui redéfinissent `--v-large` et `--v-marge` (`@media (max-width: 1000px)` et `(max-width: 760px)`), supprimer ces redéfinitions : `releve.css` fait déjà tomber `--large` et `--marge` aux mêmes seuils.

- [x] **Step 8 : `VERSION` v3**

`public/sw.js:18` → `const VERSION = "v3";` et, dans le commentaire au-dessus, ajouter une ligne : « `v3` : les polices et la feuille `releve.css` entrent dans les actifs ; un cache `v2` servirait l'ancienne feuille sans les polices. » `app/lib/capture/coquille.ts:16-17` → `"coquille-v3"` et `"actifs-v3"`.

Run : `npx vitest run tests/pwa/coquille.test.ts` → passe.

- [x] **Step 9 : Déplacer `Echelle`**

```bash
git mv app/components/vitrine/Echelle.tsx app/components/Echelle.tsx
```

Dans le fichier déplacé : le chemin du commentaire de tête, et `className="v-echelle"` → `"echelle"`, `"v-barreau plein"` → `"plein"`, `"v-barreau"` → `""` : le rendu devient

```tsx
export function Echelle({ plafond }: { plafond: Plafond }) {
  return (
    <span className="echelle" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={n <= plafond ? "plein" : undefined} />
      ))}
    </span>
  );
}
```

Dans `accueil.tsx` et `partage.tsx` de `_vitrine/` : `import { Echelle } from "../../components/Echelle";`. Dans `vitrine.css`, remplacer `.v-echelle` par `.echelle` et `.v-barreau` par `.echelle > span`, `.v-barreau.plein` par `.echelle > span.plein` (les règles d'inversion dans `.v-encre` restent, sur ces nouveaux sélecteurs).

- [x] **Step 10 : Vérifier**

Run : `npm run typecheck && npx vitest run && npm run build && npm run verifier:bundle`
Expected : vert (sauf les quatre `lire-env`), et `ls build/client/assets | grep -i "fraunces\|instrument"` montre les deux woff2 hachés.

Lancer `npm run dev`, ouvrir `/`, `/connexion`, `/proprietes` (compte démo) et `/p/<jeton>` (un jeton de `partages` de la démo) : les polices sont chargées (onglet réseau : deux woff2 depuis `/assets/`), aucune violation dans la console. Le rendu de l'app est intermédiaire (polices et boutons nouveaux, reste inchangé) : c'est attendu.

- [x] **Step 11 : Commit**

```bash
git add -A
git commit -m "feat(style): le socle du relevé — releve.css, deux polices auto-hébergées, font-src sur /p/"
```

---

### Task 2 : La vitrine

**Files:**
- Create: `app/components/vitrine/Picto.tsx`
- Rewrite: `app/styles/vitrine.css`
- Modify: `app/routes/_vitrine/layout.tsx`, `accueil.tsx`, `fonctionnalites.tsx`, `partage.tsx`, `a-propos.tsx`, `confidentialite.tsx`, `app/components/vitrine/PlanMini.tsx` (classes seulement)

**Interfaces:**
- Consumes : les primitives de la tâche 1 (`.cote`, `.bouton-plein`, `.bouton-trait`, `.filets`, `.filet-tirete`, `.pastille`, `.echelle`, `.champ`, `.message-ok`, `.message-erreur`, `.planche`, `.large`, `.pleine`).
- Produces : `Picto({ nom: NomPicto })` avec `NomPicto = "photographier" | "retrouver" | "types" | "plan" | "contour" | "historique" | "garantie" | "intervenants" | "demarrage" | "partager"` (dix tracés, voir l'étape 4).

- [x] **Step 1 : `Picto.tsx`**

```tsx
// app/components/vitrine/Picto.tsx
// Neuf pictogrammes, un par capacité de « Ce que ça fait », dessinés dans le
// vocabulaire du relevé : trait d'encre pour ce qui est là, tireté graphite
// pour ce qui est proposé ou hors de vue, un seul aplat d'encre pour un
// point. Du SVG écrit dans la page — la politique de cet arbre n'a ni
// `img-src` externe ni `data:`, et `tests/vitrine/discours.test.ts` interdit
// `<img` et `url(` dans ses routes. Chaque trait est une CLASSE, jamais un
// attribut `style` : pas d'`'unsafe-inline'` ici.
//
// Module NEUTRE : aucun import. `tests/vitrine/etancheite.test.ts` suit les
// imports depuis les routes de la vitrine.
//
// `aria-hidden` : le titre de la capacité est écrit juste à côté.

export type NomPicto =
  | "photographier"
  | "retrouver"
  | "plan"
  | "contour"
  | "historique"
  | "garantie"
  | "intervenants"
  | "demarrage"
  | "partager";

const TRACES: Record<NomPicto, React.ReactNode> = {
  photographier: (
    <>
      <rect x="6" y="12" width="32" height="24" />
      <circle cx="22" cy="24" r="6" />
      <path d="M16 12l3-4h6l3 4" />
    </>
  ),
  retrouver: (
    <>
      <circle cx="19" cy="19" r="11" />
      <path d="M27 27l11 11" />
      <path className="p-tirete" d="M12 19h14" />
    </>
  ),
  plan: (
    <>
      <rect x="6" y="8" width="32" height="28" />
      <path d="M6 22h32M22 8v14" />
      <circle className="p-plein" cx="30" cy="29" r="3.5" />
    </>
  ),
  contour: (
    <>
      <path className="p-tirete" d="M8 12l20-4 8 14-6 14-22-2z" />
      <circle className="p-plein" cx="8" cy="12" r="2.2" />
      <circle className="p-plein" cx="28" cy="8" r="2.2" />
      <circle className="p-plein" cx="36" cy="22" r="2.2" />
      <circle className="p-plein" cx="30" cy="36" r="2.2" />
      <circle className="p-plein" cx="8" cy="34" r="2.2" />
    </>
  ),
  historique: (
    <>
      <path d="M6 22h32" />
      <path d="M12 22v-8M22 22v-12M32 22v-6" />
      <circle className="p-plein" cx="12" cy="14" r="2.2" />
      <circle className="p-plein" cx="22" cy="10" r="2.2" />
      <circle className="p-plein" cx="32" cy="16" r="2.2" />
      <path className="p-tirete" d="M6 30h32" />
    </>
  ),
  garantie: (
    <>
      <rect x="8" y="10" width="28" height="26" />
      <path d="M8 18h28M15 6v8M29 6v8" />
      <path d="M15 27l4 4 8-8" />
    </>
  ),
  intervenants: (
    <>
      <circle cx="22" cy="15" r="7" />
      <path d="M8 38c2-8 7-12 14-12s12 4 14 12" />
      <path className="p-tirete" d="M31 30h9" />
    </>
  ),
  demarrage: (
    <>
      <path d="M6 20L22 8l16 12" />
      <path d="M10 18v18h24V18" />
      <path className="p-tirete" d="M10 27h24M22 27v9" />
    </>
  ),
  partager: (
    <>
      <rect x="6" y="8" width="20" height="28" />
      <rect className="p-tirete" x="26" y="8" width="12" height="28" />
      <path d="M11 16h10M11 22h10M11 28h6" />
    </>
  ),
};

export function Picto({ nom }: { nom: NomPicto }) {
  return (
    <svg className="v-picto" viewBox="0 0 44 44" aria-hidden="true">
      {TRACES[nom]}
    </svg>
  );
}
```

Ajouter `import type React from "react";` en tête si `React.ReactNode` n'est pas résolu par le JSX automatique (vérifier avec `npm run typecheck`).

- [x] **Step 2 : Réécrire `vitrine.css`**

Écrire la feuille de zéro. Son en-tête de commentaire dit ce qui est propre à la vente : la grille calée à gauche (le pourquoi est déjà écrit dans la feuille actuelle, le reprendre), le relevé en bande, deux aplats d'encre et pas trois. La convention des trois traits n'est plus expliquée ici (elle est dans `releve.css`).

Contenu, dans cet ordre, en reprenant les valeurs de la feuille actuelle sauf mention :

1. `.v-sec` : `composes` n'existe pas en CSS natif, donc `.v-sec` est posée **en plus** de `.planche` dans le JSX (`className="planche v-sec"`) et ne garde que `padding: 72px 0` et le trait de coupe entre sections (`.v-sec + .v-sec { border-top: var(--coupe) solid var(--encre) }`, sauf après ou sur `.v-encre`). Supprimer sa définition de grille (elle vient de `.planche`).
2. `.v-tete`, `.v-tete-int`, `.v-marque`, `.v-nav`, `.v-espace` : inchangés en valeurs ; `--v-*` → jetons.
3. Titres : `.v-titre` inchangé ; `.v-sec h2` devient `.v-sec .v-h2` ? **Non** : on ne pose pas de règle sur `h2` nu ici. Renommer en classes : `.v-section-titre` (l'ancien `.v-sec h2`), `.v-sous-titre` (`.v-sec h3`), `.v-chapeau`, `.v-prose-texte` (l'ancien `.v-sec p` : `line-height 1.62; color graphite`). Le JSX pose ces classes.
4. Supprimer `.v-cote` (→ `.cote`), `.v-actions` reste, supprimer `.v-appel`/`.v-appel-second` et TOUTES les reprises de spécificité qui suivaient (→ `.bouton-plein`/`.bouton-trait`) ; dans `.v-encre`, garder seulement l'inversion : `.v-encre .bouton-plein { background: var(--papier); color: var(--encre); border-color: var(--papier) }`, `.v-encre .bouton-trait { color: var(--papier); border-color: rgba(250,249,247,.5) }` et leurs survols.
5. Héros : `.v-heros`, `.v-heros-texte`, `.v-heros-dessin`, les classes `.d-*`, l'animation `v-tracer`/`v-paraitre` : inchangés (mouvement 1).
6. `.v-legende` : inchangé, mais `.v-pastille` → `.pastille` (supprimer la définition).
7. `.v-releves`, `.v-jour`, `.v-gestes`, `.v-rang`, `.v-lecteurs`, `.v-portee`, `.v-mini`, `.m-*`, `.v-duo`, `.v-encre`, `.v-encre-titre` : inchangés ; les `.v-sec p.v-jour` deviennent `.v-jour` (plus de guerre de spécificité puisque `p` nu n'est plus stylé en aval).
8. Supprimer `.v-formulaire input`/`button` (→ `.champ` et `.bouton-plein` ; garder `.v-formulaire`, `.v-formulaire label`, `.v-formulaire-ligne`, et l'inversion dans `.v-encre`).
9. `.v-note`, `.v-confirmation`/`.v-erreur` → `.message-ok`/`.message-erreur` (supprimer), `.v-prose` inchangé, `.v-coches`/`.v-croix` → `.filets` + `.v-croix > li { border-bottom-style: dashed; color: var(--revision) }`.
10. `.v-niveaux`, `.v-niveau-nom`, `.v-tableau*`, `.v-fonctions` (ajouter `.v-fonctions > li { display: grid; grid-template-columns: 44px 1fr; gap: 0 18px }` et `.v-fonctions .v-picto { grid-row: span 3 }`), `.v-suite`, `.v-pied*` : inchangés en valeurs.
11. Les pictogrammes :

```css
.v-picto {
  width: 44px;
  height: 44px;
  fill: none;
  stroke: var(--encre);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.v-picto .p-tirete {
  stroke: var(--graphite);
  stroke-width: 1;
  stroke-dasharray: 2.5 2.5;
}
.v-picto .p-plein {
  fill: var(--encre);
  stroke: none;
}
```

12. Mouvements 2 et 3 :

```css
/* Deux mouvements liés au défilement, en CSS seul — cet arbre n'a aucun
   script. La cote de chaque section s'étire en entrant dans l'écran : la
   page se mesure à mesure qu'on la lit. Un bloc large monte de 10 px et
   s'opacifie. Là où `animation-timeline` n'est pas lue, rien ne bouge et
   tout est là d'emblée : `@supports` garde l'état de repos, qui est l'état
   final. */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .v-sec .cote::after {
      transform-origin: left;
      animation: v-tirer-cote linear both;
      animation-timeline: view();
      animation-range: entry 10% entry 45%;
    }
    .v-parait {
      animation: v-paraitre-bloc linear both;
      animation-timeline: view();
      animation-range: entry 5% entry 35%;
    }
  }
}
@keyframes v-tirer-cote {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@keyframes v-paraitre-bloc {
  from { opacity: 0; translate: 0 10px; }
  to { opacity: 1; translate: 0 0; }
}
```

13. Les media queries de la fin : garder tout, retirer les redéfinitions de `--v-large`/`--v-marge`, `.v-appel`/`.v-formulaire input` deviennent `.v-actions .bouton-plein, .v-actions .bouton-trait { min-height: 48px }`.

Vérifier après écriture : `grep -c -- "--v-" app/styles/vitrine.css` → 0 ; `grep -n "^\.v-sec p\|^\.v-sec h\|^\.v-sec a" app/styles/vitrine.css` → rien.

- [x] **Step 3 : Le layout**

`layout.tsx` : `<header className="planche v-sec v-tete">`, `<footer className="planche v-sec v-pied">`. Rien d'autre.

- [x] **Step 4 : Les cinq pages — classes**

Dans chaque page : `className="v-sec"` → `"planche v-sec"` ; `v-cote` → `cote` ; `v-appel` → `bouton-plein` ; `v-appel-second` → `bouton-trait` ; `v-pastille` → `pastille` ; `v-confirmation` → `message-ok` ; `v-erreur` → `message-erreur` ; `v-coches` → `filets` ; `v-coches v-croix` → `filets v-croix` ; `<h2>` de section → `<h2 className="v-section-titre">` ; `<h3>` → `<h3 className="v-sous-titre">` ; `<p>` de prose sans classe → `<p className="v-prose-texte">` (dans `.v-prose`, `.v-releves`, `.v-gestes`, `.v-lecteurs`, `.v-duo`, `.v-fonctions`, `.v-encre` : poser la classe ; le chapeau garde `v-chapeau`). Ajouter `v-parait` sur : `.v-releves`, `.v-gestes`, `.v-lecteurs`, `.v-duo`, `.v-tableau-cadre`, `.v-fonctions`, `.v-niveaux`. Dans `fonctionnalites.tsx`, chaque `<li>` de `.v-fonctions` commence par `<Picto nom="…" />`. La page a neuf entrées et le composant neuf tracés, mais ils ne se recouvrent pas un pour un : « Des types d'objets, et les vôtres » n'a pas de tracé, et `partager` n'illustre aucune entrée de la liste (le partage a sa propre section en bas de page). Donc : `partager` va dans la section « Et le partage », à gauche de son titre, dans un `<div className="v-suite-picto">` ; et l'entrée des types reçoit un dixième tracé, `types` :

```tsx
  types: (
    <>
      <rect x="6" y="8" width="14" height="14" />
      <rect x="24" y="8" width="14" height="14" />
      <rect x="6" y="26" width="14" height="14" />
      <rect className="p-tirete" x="24" y="26" width="14" height="14" />
    </>
  ),
```

Ajouter `"types"` à `NomPicto`. Ordre des pictos sur la page : photographier, retrouver, types, plan, contour, historique, garantie, intervenants, demarrage.

- [x] **Step 5 : Les cinq pages — la copie**

Réécrire les passages suivants (les autres restent) :

`accueil.tsx`, section « Commencer », le `.v-note` :

> L'inscription n'est pas encore ouverte. Laissez une adresse : vous serez prévenu à cette adresse le jour où elle le sera, et à rien d'autre. Elle n'est transmise à personne, et vous ne recevrez pas de message de confirmation : il n'y a pas d'envoi automatique de courrier ici.

`fonctionnalites.tsx` : le chapeau devient « Tout ce qui suit existe et fonctionne aujourd'hui. Pas de « bientôt » : c'est ce que l'application sait faire, et ce qu'elle ne fait pas. » ; dans « Capturer maintenant », remplacer le second paragraphe par : « La cave et le fond du jardin sont là où l'on note quelque chose, et là où le réseau manque. Ce qui est photographié sans réseau attend sur le téléphone et part au retour du réseau. » ; dans « Les garanties », le second paragraphe : « Pas de rappel par message : rien ne vous écrit, il faut ouvrir l'application. C'est une limite, et elle est dite. » ; supprimer le commentaire de tête qui cite l'issue #25 (le remplacer par : « Rien de chiffré : ni durée de saisie, ni promesse de fonctionnement sans réseau — voir `tests/vitrine/discours.test.ts`. »).

`partage.tsx`, section « Vous voyez ce qu'ils voient » : « Avant d'envoyer un lien, vous l'ouvrez : la même page que recevra son destinataire, avec en plus le compte de ce qu'elle ne montre pas. » ; « Un lien se révoque » inchangé.

`a-propos.tsx` : supprimer les sections « Ce que cette vitrine refuse de dire » et « Où ça en est » ; les remplacer par une section « Où ça en est » :

> L'application fonctionne, et l'inscription n'est pas encore ouverte : elle le sera quand une vraie maison y aura vécu quelque temps, avec de vrais liens envoyés à de vraies personnes. Il n'y a pas non plus de prix affiché, parce qu'il n'y a pas de prix décidé, et qu'en annoncer un pour avoir l'air fini serait la première chose fausse de ces pages. Vous ne lirez ici ni durée, ni compte d'inscrits, ni tarif : ce qui n'a pas été vécu n'est pas écrit.

« Comment c'est fait » : garder, remplacer « Pas d'intelligence artificielle, pas de service tiers à qui vos données seraient confiées, pas d'application à installer depuis une boutique. Ce qui n'existe pas ne tombe pas en panne, et ne fuit pas non plus. » par « Pas de service tiers à qui vos données seraient confiées, pas d'application à installer depuis une boutique. Ce qui n'existe pas ne tombe pas en panne, et ne fuit pas non plus. »

`confidentialite.tsx` : le chapeau devient « Une application qui décrit une maison décrit un endroit où des gens habitent. Voici ce que l'application garde chez vous, ce qu'elle refuse d'écrire, et ce qu'elle ne sait pas faire. Ce ne sont pas des intentions : c'est ainsi qu'elle fonctionne. » ; section « L'adresse de votre maison » : supprimer le second paragraphe (le test qui balaye) et le remplacer par « Elle n'est écrite nulle part, et l'identifiant que le registre renvoie non plus : il permettrait de la retrouver. » ; section « Ce qui ne sort jamais d'un lien » : remplacer « Ces champs ne sont pas masqués à l'affichage : ils ne sont pas chargés du tout, et le code qui tenterait de les servir ne compilerait pas. » par « Ces champs ne sont pas masqués à l'affichage : ils ne sont pas chargés du tout. Il n'y a pas de réglage qui les fasse sortir. » ; le reste inchangé.

Relire les cinq pages une fois à voix haute : aucun « test », « code », « dépôt », « compile », « mesuré », « issue ».

- [x] **Step 6 : Vérifier**

Run : `npm run typecheck && npx vitest run tests/vitrine tests/exports-routes.test.ts tests/vocabulaire.test.ts && npm run build && npm run verifier:bundle`
Expected : vert.

Playwright : `npm run dev`, ouvrir `/`, `/fonctionnalites`, `/partage`, `/a-propos`, `/confidentialite` à 1440, 768 et 375 px ; capture pleine page de chacune (scratchpad) ; `browser_evaluate` : `document.documentElement.scrollWidth <= innerWidth` ; console : aucune violation. Regarder les captures et corriger ce qui déborde ou se chevauche.

- [x] **Step 7 : Commit**

```bash
git add -A
git commit -m "feat(vitrine): sur les primitives du relevé — pictogrammes, copie côté client, cotes qui se tirent"
```

---

### Task 3 : La charpente, l'accueil, la recherche, la porte, la page d'erreur

**Files:**
- Modify: `app/routes/_app/layout.tsx`, `app/routes/_app/proprietes.$proprieteId._index.tsx`, `app/routes/_app/proprietes._index.tsx`, `app/routes/_app/recherche.tsx`, `app/components/recherche/BarreRecherche.tsx`, `ListeResultats.tsx`, `GrilleZones.tsx`, `PastillesFacettes.tsx`, `app/components/partage/FacettesLiens.tsx`, `app/components/historique/FiltreTypes.tsx`, `app/routes/_public/login.tsx`, `register.tsx`, `app/components/PageErreur.tsx`, `app/styles/app.css` (sections Charpente, Boutons et formulaires, Recherche, Résultats, Facettes, Grille de zones)

**Interfaces:**
- Consumes : tâche 1.
- Produces : `.app` (grille), `.app-marge`, `.app-marge-nav`, `.app-marge-capture`, `.app-marge-compte` ; les classes de facette `etiquette`, `etiquette-active`, `etiquette-nombre`, `etiquette-plus` (renommage de `pastille*` dans les trois composants de facettes).

- [x] **Step 1 : Le layout**

Remplacer le JSX rendu de `AppLayout` (à partir de `return (`) par :

```tsx
  return (
    <div className="app">
      <header className="app-tete">
        {/* `/` est la vitrine publique : la marque ramène le propriétaire
            connecté chez lui, pas sur la page qui explique le produit. */}
        <Link to={ACCUEIL} className="app-marque" viewTransition>
          gestionImmobiliere
        </Link>
        <IndicateurFile />
        <span className="app-compte">{email}</span>
        <form method="post" action="/deconnexion" className="app-deconnexion">
          <button type="submit" className="bouton-discret">
            Déconnexion
          </button>
        </form>
      </header>

      {/* La marge, à partir de 1000 px seulement (voir `app.css`) : la
          propriété courante, la navigation et les deux gestes de capture,
          comme les annotations dans la marge d'un relevé. Sur téléphone elle
          n'est pas rendue visible et l'accueil garde sa navigation : rien ne
          change dans les parcours. Sans compte d'objets : ce layout ne fait
          pas de requête de plus. */}
      {proprieteId !== null && (
        <aside className="app-marge" aria-label="Navigation de la propriété">
          <p className="app-marge-propriete">
            <span className="cote">Propriété</span>
            <b>{proprietes.find((p) => p.id === proprieteId)?.nom}</b>
          </p>
          <nav>
            <ul className="app-marge-nav">
              {[
                ["", "Accueil"],
                ["/zones", "Zones"],
                ["/systemes", "Systèmes"],
                ["/plans", "Plans"],
                ["/evenements", "Historique"],
                ["/intervenants", "Intervenants"],
                ["/partages", "Liens de partage"],
              ].map(([suffixe, libelle]) => (
                <li key={suffixe}>
                  <NavLink to={`${ACCUEIL}/${proprieteId}${suffixe}`} end={suffixe === ""} viewTransition>
                    {libelle}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="app-marge-capture">
            <Capture proprieteId={proprieteId} mode="nouveau" className="capture-declencheur capture-principal">
              Nouvel objet
            </Capture>
            <Capture proprieteId={proprieteId} mode="existant" className="capture-declencheur capture-secondaire">
              Objet existant
            </Capture>
          </div>
        </aside>
      )}

      <main className="app-corps">
        <Outlet />
      </main>

      {proprieteId !== null && (
        <div className="capture-barre">
          <Capture proprieteId={proprieteId} mode="nouveau" className="capture-declencheur capture-principal">
            Nouvel objet
          </Capture>
          <Capture proprieteId={proprieteId} mode="existant" className="capture-declencheur capture-secondaire">
            Objet existant
          </Capture>
        </div>
      )}

      <AideInstallationIOS />
    </div>
  );
```

Importer `NavLink` depuis `react-router`. **Attention** : deux instances de `Capture` par mode (marge et barre) veulent dire deux `<input type="file">` avec deux états ; c'est acceptable parce qu'une seule est visible à la fois (`display: none` sur l'autre), et `Capture` n'a pas d'id global — vérifier dans `Capture.tsx` qu'aucun `id` fixe n'est rendu (sinon suffixer par `mode` et un préfixe passé en prop). Si `Capture` porte un état de feuille ouverte, l'ouverture depuis la marge ouvre la feuille du composant de la marge : c'est bien.

- [x] **Step 2 : La charpente en CSS**

Dans `app.css`, section « Charpente », remplacer par :

```css
/* ── Charpente ────────────────────────────────────────────────────── */

.app {
  min-height: 100vh;
}
.app-tete {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px var(--gouttiere);
  border-bottom: var(--vu) solid var(--pale);
}
.app-marque {
  font-family: var(--titrage);
  font-weight: 500;
  font-size: 1.1rem;
  color: var(--encre);
  text-decoration: none;
}
.app-compte {
  margin-left: auto;
  color: var(--graphite);
  font-size: 0.85rem;
}
.app-deconnexion {
  margin: 0;
}
.app-corps {
  padding: var(--gouttiere);
  /* Place pour la barre de capture fixée en bas. */
  padding-bottom: calc(var(--cible) + 48px + env(safe-area-inset-bottom));
  max-width: 720px;
}
.app-marge {
  display: none;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* La marge, à partir de 1000 px : une colonne de 236 px à gauche, bordée
   d'une projection. La barre de capture fixe disparaît, ses deux gestes
   sont en bas de la marge. Le corps prend la largeur qui lui manquait. */
@media (min-width: 1000px) {
  .app {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }
  .app-tete {
    grid-column: 1 / -1;
    padding: 12px 36px 12px 22px;
  }
  .app-marge {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 22px 20px;
    border-right: var(--vu) solid var(--pale);
  }
  .app-marge-propriete {
    margin: 0;
  }
  .app-marge-propriete .cote {
    margin-bottom: 6px;
  }
  .app-marge-propriete b {
    display: block;
    font-family: var(--titrage);
    font-weight: 500;
    font-size: 1.05rem;
    color: var(--encre);
  }
  .app-marge nav {
    display: block;
  }
  .app-marge-nav {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: var(--coupe) solid var(--encre);
  }
  .app-marge-nav a {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding-left: 12px;
    margin-left: calc(-1 * var(--coupe));
    border-bottom: var(--vu) solid var(--pale);
    border-left: var(--coupe) solid transparent;
    color: var(--graphite);
    font-size: 0.95rem;
    text-decoration: none;
  }
  .app-marge-nav a:hover {
    color: var(--encre);
  }
  .app-marge-nav a[aria-current="page"] {
    color: var(--encre);
    border-left-color: var(--encre);
    font-weight: 500;
  }
  .app-marge-capture {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: auto;
  }
  .app-corps {
    padding: 22px 36px 40px;
    max-width: var(--large);
  }
  .capture-barre {
    display: none;
  }
}
```

Puis dans la section « Boutons et formulaires » d'`app.css` : supprimer `button, .bouton-primaire, .bouton-discret {…}`, `.bouton-primaire`, `.bouton-discret`, `label {…}`, `input[type=…] {…}`, `form button[type="submit"] {…}` (tout vit dans `releve.css`). `.bouton-primaire` n'a qu'un usage, dans `Capture.tsx` : le remplacer par `bouton-plein` dès cette tâche et supprimer la règle. Dans « Barre de capture » : `.capture-declencheur { border-radius: 0 }`, `.capture-principal { background: var(--encre); color: var(--papier); border: var(--coupe) solid var(--encre) }`, `.capture-secondaire { background: transparent; border: var(--coupe) solid var(--encre); color: var(--encre) }`, `.capture-barre { background: color-mix(in srgb, var(--papier) 92%, transparent); border-top: var(--vu) solid var(--pale) }` ; dans la marge : `.app-marge .capture-declencheur { min-height: 48px }`.

- [x] **Step 3 : Accueil, recherche, résultats, grille, facettes**

`app.css`, sections « Recherche », « Résultats », « Facettes », « Grille de zones » — réécrire :

```css
/* ── Recherche ────────────────────────────────────────────────────── */

.recherche-epingle {
  position: sticky;
  top: 0;
  z-index: 10;
  margin: calc(-1 * var(--gouttiere)) calc(-1 * var(--gouttiere)) var(--gouttiere);
  padding: 10px var(--gouttiere);
  background: var(--papier);
  border-bottom: var(--vu) solid var(--pale);
}
.recherche-barre {
  position: relative;
}
.recherche-barre::before {
  /* La loupe : deux traits d'encre, pas une icône encodée (pas de `data:`
     sur `/p/`). Un cercle et sa poignée. */
  content: "";
  position: absolute;
  left: 16px;
  top: 50%;
  width: 12px;
  height: 12px;
  margin-top: -8px;
  border: 1.8px solid var(--encre);
  border-radius: 50%;
  pointer-events: none;
}
.recherche-barre::after {
  content: "";
  position: absolute;
  left: 27px;
  top: 50%;
  width: 7px;
  height: 1.8px;
  margin-top: 3px;
  background: var(--encre);
  transform: rotate(45deg);
  pointer-events: none;
}
input.recherche-champ {
  min-height: var(--cible);
  margin-top: 0;
  padding-left: 44px;
  padding-right: 44px;
  font-size: 1.05rem;
}
input.recherche-champ::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}
.recherche-effacer {
  position: absolute;
  right: 4px;
  top: 0;
  width: 44px;
  height: var(--cible);
  border: none;
  background: transparent;
  color: var(--graphite);
  font-size: 1.4rem;
  line-height: 1;
}

/* ── Résultats ────────────────────────────────────────────────────── */

.resultats-compte {
  margin: 0 0 8px;
  font-family: var(--titrage);
  font-size: 0.88rem;
  color: var(--graphite);
}
.resultats-vide {
  color: var(--graphite);
}
.resultats[aria-busy="true"] {
  opacity: 0.6;
}
@media (prefers-reduced-motion: no-preference) {
  .resultats {
    transition: opacity 150ms ease;
  }
}
.resultats-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: var(--coupe) solid var(--encre);
}
.resultat {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--cible);
  padding: 8px 0;
  border-bottom: var(--vu) solid var(--pale);
  color: inherit;
  text-decoration: none;
}
.resultat:hover {
  background: var(--teinte);
}
.resultat-vignette {
  width: 48px;
  height: 48px;
  flex: none;
  object-fit: cover;
  display: block;
  border: var(--vu) solid var(--pale);
}
.resultat-vignette-vide {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--creux);
  color: var(--encre);
  font-family: var(--titrage);
  font-weight: 300;
  font-size: 1.4rem;
}
.resultat-texte {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.resultat-nom {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resultat-lieu {
  color: var(--graphite);
  font-size: 0.86rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resultat-motif {
  flex: none;
  min-height: 26px;
  padding: 0 8px;
  border: var(--vu) solid var(--pale);
  color: var(--graphite);
  font-size: 0.74rem;
  display: inline-flex;
  align-items: center;
}

.types-proches {
  list-style: none;
  margin: 10px 0;
  padding: 0;
  border-top: var(--coupe) solid var(--encre);
}
.types-proches li {
  padding: 8px 0;
  border-bottom: var(--vu) solid var(--pale);
}
.types-proches-nom {
  font-weight: 500;
  color: var(--texte);
}
.types-proches-alias {
  display: block;
  color: var(--graphite);
  font-size: 0.86rem;
}

/* ── Facettes ─────────────────────────────────────────────────────── */

.facettes {
  margin-bottom: var(--gouttiere);
}
.facettes-tete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.facettes-tete h2 {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--graphite);
}
.facettes-groupe {
  margin-top: 10px;
}
.facettes-titre {
  margin: 0 0 8px;
}
.facettes-liste {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.etiquette-plus {
  color: var(--graphite);
}

/* ── Grille de zones de l'accueil ─────────────────────────────────── */

.accueil-titre {
  margin-bottom: 12px;
}
.grille-zones {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.case-zone {
  display: block;
  color: inherit;
  text-decoration: none;
  padding-bottom: 8px;
  border-bottom: var(--vu) solid var(--pale);
}
.case-zone:hover {
  border-bottom: var(--coupe) solid var(--encre);
  padding-bottom: calc(8px - var(--coupe) + var(--vu));
}
.case-zone-image {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border: var(--vu) solid var(--pale);
  margin-bottom: 8px;
}
/* Sans photo : l'initiale en titrage léger sur une hachure d'encre — une
   zone sans photo reste lisible, elle n'est ni vide ni cassée. */
.case-zone-aplat {
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    repeating-linear-gradient(135deg, transparent 0 9px, color-mix(in srgb, var(--encre) 8%, transparent) 9px 10px),
    var(--creux);
  color: var(--encre);
  font-family: var(--titrage);
  font-size: 2rem;
  font-weight: 300;
}
.case-zone-texte {
  display: flex;
  flex-direction: column;
}
.case-zone-nom {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.case-zone-compte {
  font-family: var(--titrage);
  font-size: 0.84rem;
  color: var(--graphite);
}

.accueil-nav {
  margin-top: 20px;
}
.accueil-lien-filtres {
  margin-top: 14px;
}
.accueil-echeances ul {
  list-style: none;
  padding: 0;
  margin: 0;
  border-top: var(--coupe) solid var(--encre);
}
.accueil-echeances li {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  gap: 0 14px;
  padding: 10px 0;
  border-bottom: var(--vu) solid var(--pale);
  font-size: 0.94rem;
  align-items: baseline;
}

@media (min-width: 560px) {
  .grille-zones {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (min-width: 1000px) {
  .grille-zones {
    grid-template-columns: repeat(4, 1fr);
    gap: 18px 16px;
  }
  .accueil-nav {
    display: none;
  }
}
```

Supprimer `.pastille*` de la section Facettes (la primitive est dans `releve.css`), `a.pastille`, `a.pastille-active` de la section Partage (remplacées par `a.etiquette { text-decoration: none }` déjà couvert par `.etiquette`). Supprimer `.case-zone-texte` en position absolue et le dégradé.

JSX :
- `PastillesFacettes.tsx`, `FacettesLiens.tsx`, `FiltreTypes.tsx` : `pastille` → `etiquette`, `pastille-active` → `etiquette-active`, `pastille-nombre` → `etiquette-nombre`, `pastille-plus` → `etiquette-plus`. `facettes-titre` : rendre `<p className="cote facettes-titre">`.
- `GrilleZones.tsx` : lire le composant ; la structure `case-zone > (img.case-zone-image | span.case-zone-aplat) + span.case-zone-texte > (case-zone-nom, case-zone-compte)` reste ; l'aplat prend `aspect-ratio: 4/3` via la même classe `case-zone-image` ajoutée à côté de `case-zone-aplat` (`className="case-zone-image case-zone-aplat"`).
- `ListeResultats.tsx` : `resultat-vignette-vide` reçoit aussi `resultat-vignette` s'il ne l'a pas déjà.
- `proprietes.$proprieteId._index.tsx` : le titre des échéances devient `<p className="cote">Ce qui arrive à terme</p>` suivi de la liste ; les liens de `.accueil-nav` restent des `<Link>` (ajouter `viewTransition`). Les dates y passent par `jourLisible` déjà. Une ligne expirée : `className="garantie-expiree"` existe ; en CSS : `.garantie-expiree { color: var(--revision); border-bottom-style: dashed }` (déplacer la règle depuis la section Étape 5 et la compléter).
- `proprietes._index.tsx` : `<ul>` des propriétés → `<ul className="filets">`, chaque `<li>` : `<Link className="nom" viewTransition>` ; le formulaire d'ajout → `<Form className="formulaire">` avec `<div className="formulaire-actions">` autour du bouton.
- `recherche.tsx` : rien d'autre que ce qui précède.

- [x] **Step 4 : La porte**

`login.tsx`, JSX rendu :

```tsx
    <main className="porte">
      <a href="/" className="porte-marque">gestionImmobiliere</a>
      <h1>Connexion</h1>
      <Form method="post" className="formulaire">
        <input type="hidden" name="depuis" value={depuis} />
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          Mot de passe
          <input type="password" name="motDePasse" required autoComplete="current-password" />
        </label>
        {actionData?.erreur && <p role="alert" className="message-erreur">{actionData.erreur}</p>}
        <button type="submit">Se connecter</button>
      </Form>
      {ouverte && (
        <p className="porte-suite">
          <a href="/inscription">Créer un compte</a>
        </p>
      )}
    </main>
```

`register.tsx` : même enveloppe (`main.porte`, `a.porte-marque`, `Form.formulaire`, `message-erreur`, `p.porte-suite`) ; la branche fermée garde `<p role="status">` en `className="message-avis"` et **aucun `<form`**. CSS (`app.css`, nouvelle section « La porte ») : `.porte-suite { margin-top: 24px; font-size: 0.95rem }`.

- [x] **Step 5 : `PageErreur`**

Lire `app/components/PageErreur.tsx`. Garder le document complet et les contraintes (`<h1>Introuvable</h1>` littéral, `robots`, `href="/"`, aucun `style`, aucun script). Envelopper le corps dans `<main className="porte">`, le lien de retour en `<p className="porte-suite"><a href="/">Retour à l'accueil</a></p>`. Les deux feuilles dans `<head>` (tâche 1, étape 6).

Run : `npx vitest run tests/erreurs tests/auth` → vert.

- [x] **Step 6 : Vérifier**

Run : `npm run typecheck && npx vitest run && npm run build && npm run verifier:bundle`.
Playwright, connecté en démo : `/proprietes`, `/proprietes/:id`, `/proprietes/:id/recherche?q=vanne`, `/connexion`, `/inscription`, `/p/jeton-inconnu` (page d'erreur), à 1440 et 375 px ; captures ; aucune violation ; à 1440 la marge est là, la barre de capture absente ; à 375 l'inverse.

- [x] **Step 7 : Commit**

```bash
git add -A
git commit -m "feat(app): la charpente du relevé — marge sur ordinateur, accueil, recherche, porte, page d'erreur"
```

---

### Task 4 : Formulaires, fiches, structure

**Files:**
- Modify: `app/routes/_app/batiments._index.tsx`, `batiments.nouveau.tsx`, `batiments.$batimentId.modifier.tsx`, `batiments.$batimentId.niveaux.nouveau.tsx`, `niveaux.$niveauId.modifier.tsx`, `zones._index.tsx`, `zones.nouveau.tsx`, `zones.$zoneId.modifier.tsx`, `systemes._index.tsx`, `systemes.nouveau.tsx`, `systemes.$systemeId.modifier.tsx`, `elements._index.tsx`, `elements.nouveau.tsx`, `elements.$elementId.modifier.tsx`, `types.nouveau.tsx`, `garanties.$garantieId.modifier.tsx`, `app/components/ChampEditor.tsx`, `DynamicElementFields.tsx`, `ZoneSelector.tsx`, `app/styles/app.css` (sections Fiche, Formulaires de l'historique, Étape 5)

**Interfaces:**
- Consumes : `.formulaire`, `.formulaire-ligne`, `.formulaire-actions`, `.formulaire-danger`, `.filets`, `.nom`, `.lieu`, `.niveau-choix`, `.echelle`, `.message-*`, `.sous-titre`, `.cote`.
- Produces : `.fiche-tete`, `.fiche-type`, `.fiche-champs` (dl en filets), `.galerie` (carrés bordés), `.galerie-ajout`.

- [x] **Step 1 : Le motif d'un formulaire**

Pour chacune des routes `*.nouveau.tsx` et `*.modifier.tsx` de la liste (lire chaque fichier ; ils se ressemblent) :
- `<Form method="post">` d'enregistrement → `<Form method="post" className="formulaire">` ;
- les paires de champs courts (nom + type, ordinal + nom, début + fin) dans `<div className="formulaire-ligne">` ;
- `<p role="alert">` → `<p role="alert" className="message-erreur">`, `<p role="status">` → `className="message-ok"` ;
- le bouton d'enregistrement dans `<div className="formulaire-actions">` avec, s'il existe, le lien « Annuler » en `<Link className="bouton-discret">` ;
- le `<Form>` de suppression dans `<div className="formulaire-danger">`, son bouton en `className="bouton-discret"`, précédé de `<p className="message-avis">` reprenant le texte d'avertissement s'il existe.

Les listes (`batiments._index`, `zones._index`, `systemes._index`, `elements._index`) : `<ul>` → `<ul className="filets">`, le lien de chaque ligne en `className="nom"`, l'information secondaire (type, niveau, zone) dans `<span className="lieu">`. `zones._index` est récursif : la sous-liste garde `filets` mais en `margin-left: 22px` (`.filets .filets { margin-left: 22px; border-top: 0 }` dans `app.css`).

- [x] **Step 2 : Le niveau**

Six écrans choisissent un niveau par un `<select name="niveau">` : `elements.nouveau.tsx:124` (contrôlé, `setNiveau` pour l'aide), `elements.$elementId.modifier.tsx:239`, `zones.$zoneId.modifier.tsx:109`, `FormulaireEvenement.tsx:101`, `FormulaireIntervenant.tsx:86`. Un seul composant les remplace, `app/components/ChoixNiveau.tsx`, neutre (il n'importe qu'`Echelle` et `LIBELLES_NIVEAU` de `app/lib/partage/niveaux.ts`, neutre lui aussi) :

```tsx
// app/components/ChoixNiveau.tsx
// Le niveau d'une fiche, d'une zone, d'un événement ou d'un intervenant :
// la même échelle à quatre barreaux que la vitrine montre sur « Partager »,
// devenue un sélecteur. Ce que le visiteur a vu est ce que le propriétaire
// manipule. Quatre boutons radio et non un `<select>` : les quatre valeurs
// se voient d'un coup, avec leur dessin.
//
// Le champ s'appelle toujours `niveau` et l'action ne change pas : un niveau
// absent est refusé par `lireNiveauSaisi`, jamais replié sur 0.
import { Echelle } from "./Echelle";
import { LIBELLES_NIVEAU } from "../lib/partage/niveaux";

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ChoixNiveau({
  valeur,
  onChange,
  etiquette = "Qui peut le voir",
  aide,
}: {
  valeur: number;
  /** Fourni quand l'écran a besoin de réagir au choix (l'aide de la
   *  création d'objet). Sinon le groupe est non contrôlé. */
  onChange?: (niveau: number) => void;
  etiquette?: string;
  aide?: string;
}) {
  return (
    <div className="niveau-champ">
      <span className="niveau-etiquette">{etiquette}</span>
      <div className="niveau-choix" role="radiogroup" aria-label={etiquette}>
        {LIBELLES_NIVEAU.map((nom, n) => (
          <label key={nom}>
            <input
              type="radio"
              name="niveau"
              value={n}
              required
              {...(onChange
                ? { checked: n === valeur, onChange: () => onChange(n) }
                : { defaultChecked: n === valeur })}
            />
            <Echelle plafond={(n + 1) as 1 | 2 | 3 | 4} />
            {majuscule(nom)}
          </label>
        ))}
      </div>
      {aide && <p className="champ-aide">{aide}</p>}
    </div>
  );
}
```

Dans chaque écran, le `<select>` et son `<label>` sont remplacés par `<ChoixNiveau valeur={…} aide={…} />` (avec `onChange={setNiveau}` dans `elements.nouveau.tsx`), en reprenant la valeur initiale et le texte d'aide qu'ils portaient. Le `<input type="hidden" name="niveau">` de `zones.$zoneId.modifier.tsx:141` (second POST du renivelage) reste tel quel. CSS (`app.css`) : `.niveau-etiquette { display: block; font-family: var(--titrage); font-size: 0.88rem; font-weight: 500; color: var(--graphite) }`, `.niveau-champ { margin-bottom: 14px }`.

Run : `grep -rl lireNiveauSaisi tests | xargs npx vitest run` → vert.

- [x] **Step 3 : La fiche d'un objet**

`elements.$elementId.modifier.tsx` : au-dessus du titre, `<p className="fiche-fil">` existe ; sous le `<h1>`, ajouter `<p className="fiche-type"><Echelle plafond={niveau + 1} /> {nomNiveau} · {type} · {systeme}</p>` (avec `nomNiveau` depuis `NIVEAUX`). Photos : `.fiche-photos-tete` reste, `.galerie` reste, le déclencheur de capture de la fiche reçoit `className="capture-declencheur galerie-ajout"`. Les plans, garanties et historique : chaque bloc commence par `<p className="sous-titre"><span>Sur les plans</span><Link …>Placer</Link></p>` (respectivement « Garanties » / « Ajouter », « Historique » / « Nouvel événement »), et ses listes deviennent `.filets`. Le formulaire d'édition suit l'étape 1.

`garanties.$garantieId.modifier.tsx` et `FicheObjet.tsx` (partage) : `.fiche-champs` reste un `<dl>`.

CSS (`app.css`, section « Fiche ») :

```css
/* ── Fiche ────────────────────────────────────────────────────────── */

.fiche-fil {
  margin: 0 0 6px;
  font-family: var(--titrage);
  font-size: 0.85rem;
  color: var(--graphite);
}
.fiche-fil a {
  text-decoration: none;
}
.fiche-type {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  font-size: 0.86rem;
  color: var(--graphite);
}
.fiche-photos {
  margin-bottom: 24px;
}
.fiche-photos-tete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fiche-photos-vide {
  color: var(--graphite);
}
.galerie {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.galerie img {
  display: block;
  width: 104px;
  height: 104px;
  object-fit: cover;
  border: var(--vu) solid var(--pale);
}
.galerie-ajout {
  min-height: 40px;
  padding: 0 14px;
  flex: none;
  font-size: 0.9rem;
  border: var(--coupe) solid var(--encre);
  color: var(--encre);
}
.fiche-champs {
  margin: 16px 0;
  padding: 0;
  border-top: var(--coupe) solid var(--encre);
}
.fiche-champs > div {
  display: grid;
  grid-template-columns: minmax(6rem, 1fr) 2fr;
  gap: 0 12px;
  padding: 9px 0;
  border-bottom: var(--vu) solid var(--pale);
  align-items: baseline;
}
.fiche-champs dt {
  margin: 0;
  color: var(--graphite);
  font-size: 0.85rem;
}
.fiche-champs dd {
  margin: 0;
  font-weight: 500;
}
.fiche-plans-liste,
.fiche-garanties-liste {
  margin-bottom: 16px;
}
.garantie-expiree {
  color: var(--revision);
}
.filets > li.garantie-expiree {
  border-bottom-style: dashed;
  border-bottom-color: var(--graphite);
}
```

Supprimer les anciennes règles `.fiche-*`, `.galerie`, `.photo-etape` (déplacer `.photo-etape` inchangée à côté), `.fiche-garanties-liste li`, `.accueil-echeances ul/li` (réécrites à la tâche 3).

- [x] **Step 4 : Types et champs dynamiques**

`ChampEditor.tsx` : chaque définition de champ est un `<fieldset className="champ-definition">` avec `<legend className="cote">Champ {n}</legend>` ; ses entrées en `.formulaire-ligne` ; le bouton de retrait en `bouton-discret`. `DynamicElementFields.tsx` : rien à changer (des `<label>` et des champs nus, stylés par `releve.css`) ; vérifier que le `select` d'un genre « liste » et l'`input type="file"` rendent correctement. `ZoneSelector.tsx` : rien.

CSS : `.champ-definition { padding-top: 14px; margin-bottom: 18px; border-top: var(--vu) solid var(--pale) }`.

- [x] **Step 5 : Vérifier**

Run : `npm run typecheck && npx vitest run && npm run build && npm run verifier:bundle`.
Playwright : `/proprietes/:id/elements/nouveau`, une fiche `/elements/:id/modifier`, `/zones/:id/modifier`, `/types/nouveau`, `/batiments`, à 1440 et 375 px ; enregistrer réellement une fiche avec le nouveau sélecteur de niveau et vérifier en base (`SELECT niveau FROM element ORDER BY id DESC LIMIT 1`) que la valeur choisie est écrite.

- [x] **Step 6 : Commit**

```bash
git add -A
git commit -m "feat(app): formulaires, fiches et structure sur le relevé — le niveau devient une échelle"
```

---

### Task 5 : Plans, historique, partages, démarrage, capture

**Files:**
- Modify: `app/components/plan/VuePlan.tsx`, `EditeurImagePlan.tsx`, `app/components/partage/PlanStatique.tsx`, `app/routes/_app/plans._index.tsx`, `plans.nouveau.tsx`, `plans.$planId.modifier.tsx`, `app/components/historique/Chronologie.tsx`, `Pagination.tsx`, `FormulaireEvenement.tsx`, `FormulaireIntervenant.tsx`, `app/routes/_app/evenements.*`, `intervenants.*`, `partages._index.tsx`, `partages.$partageId.apercu.tsx`, `demarrer._index.tsx`, `app/components/demarrage/RechercheAdresse.tsx`, `EditeurSquelette.tsx`, `app/components/capture/Capture.tsx`, `Selecteur.tsx`, `IndicateurFile.tsx`, `app/components/AideInstallationIOS.tsx`, `app/styles/app.css` (sections Feuille, Sélecteur, Confirmation, Partage, Gestion des partages, Plan, Éditeur, Démarrage, Historique, Formulaires de l'historique)

**Interfaces:**
- Consumes : tout ce qui précède.
- Produces : `@view-transition` et `::view-transition-*` dans `app.css` (mouvement 5), `.feuille` centrée à 1000 px (mouvement 6).

- [x] **Step 1 : Le plan**

`app.css`, section « Le plan » : remplacer chaque `border-radius: var(--rayon)` par rien (supprimer la ligne), `border-radius: 999px`/`4px` par rien sauf sur `.plan-point-pastille`, `.plan-point-grappe`, `.plan-numero`, `.plan-sommet` (cercles : `border-radius: 50%`) ; remplacer `box-shadow: 0 1px 3px rgb(0 0 0 / 0.35)` par `box-shadow: 0 0 0 2px var(--papier)` (le halo) sur ces trois pastilles et supprimer leur `border: 2px solid #fff` ; `.plan-grappe-liste` : `background: var(--feuille); border: var(--vu) solid var(--pale)`, sans ombre ; `.plan-niveau` → supprimer la règle et poser `etiquette` dans le JSX (`plan-niveau-actif` → `etiquette-active`, `plan-niveau-deja` → `etiquette-hors`) ; `.plan-cadre { border: var(--vu) solid var(--pale); background: var(--feuille) }` ; `.plan-proposition` → dans le JSX `className="message-ok plan-proposition"` et en CSS ne garder que `display: flex; flex-wrap: wrap; align-items: center; gap: 8px` ; `.plan-geom polygon { fill: color-mix(in srgb, var(--encre) 14%, transparent); stroke: var(--encre) }` (déjà équivalent via le pont) ; `.plan-geom-nom` et `.plan-point-nom` : `background: color-mix(in srgb, var(--papier) 85%, transparent); font-family: var(--titrage)` ; `.editeur-canevas` sans rayon ; `.editeur-cadre { border: var(--coupe) dashed var(--encre) }` ; `.editeur-poignee` sans rayon, `border: 2px solid var(--papier)`.

JSX : `plans._index.tsx`, `PlanStatique.tsx` : `plan-niveau` → `etiquette`, etc. ; le `<details className="plan-liste">` reste ; les `<Link>` de navigation reçoivent `viewTransition` (pas dans `PlanStatique`, sans script).

Les attributs `style` de `VuePlan`, `PlanStatique`, `EditeurImagePlan` : **ne pas toucher**.

- [x] **Step 2 : L'historique**

`app.css`, section « Historique » :

```css
.chrono {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: var(--coupe) solid var(--encre);
}
.chrono-ligne {
  padding: 12px 0;
  border-bottom: var(--vu) solid var(--pale);
}
.chrono-date {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 0;
  font-family: var(--titrage);
  font-size: 0.88rem;
  color: var(--graphite);
}
.chrono-type {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border: var(--vu) solid var(--pale);
  font-family: var(--corps);
  font-size: 0.8rem;
}
.chrono-titre {
  margin: 4px 0 2px;
  font-family: var(--corps);
  font-size: 1.02rem;
  font-weight: 500;
  color: var(--texte);
}
.chrono-titre a {
  color: inherit;
  text-decoration: none;
}
.chrono-titre a:hover {
  text-decoration: underline;
}
.chrono-objets {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  font-size: 0.86rem;
  color: var(--graphite);
}
.chrono-objets li {
  padding: 1px 0;
}
.chrono-objet-zone {
  color: var(--graphite);
}
.chrono-vide {
  color: var(--graphite);
  margin: 12px 0;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: var(--gouttiere) 0;
  font-family: var(--titrage);
  font-size: 0.92rem;
}
.pagination a {
  text-decoration: none;
}
.pagination-rang {
  color: var(--graphite);
}
.pagination-bout {
  color: var(--graphite);
  opacity: 0.45;
}
.evenement-description {
  white-space: pre-wrap;
  margin: var(--gouttiere) 0;
}
.liste-intervenants {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: var(--coupe) solid var(--encre);
}
.liste-intervenants li {
  padding: 12px 0;
  border-bottom: var(--vu) solid var(--pale);
}
```

Section « Formulaires de l'historique » : `.formulaire-evenement` devient un alias de `.formulaire` : dans `FormulaireEvenement.tsx` et `FormulaireIntervenant.tsx`, `className="formulaire-evenement"` → `"formulaire"` ; supprimer les règles `.formulaire-evenement *` (les champs viennent de `releve.css`) ; `.formulaire-liaisons { padding: 0; border: 0 }` avec `legend` en `cote` dans le JSX ; `.formulaire-cases { border: var(--vu) solid var(--pale); padding: 6px 10px; max-height: 280px; overflow-y: auto }` ; `.formulaire-avis` → `message-avis` dans le JSX, `.formulaire-avis-fort` → `message-erreur` ; `.zone-renivelage-apercu { border-top: var(--coupe) solid var(--encre); padding-top: 12px }` sans rayon ni bord.

`evenements.$evenementId.modifier.tsx` : `.photo-etape` reste (`figcaption` en graphite 0.85rem). Les `<Link>` de liste reçoivent `viewTransition`.

- [x] **Step 3 : Les partages**

`partages._index.tsx` : `.partages-liste` → `filets` (garder `partages-liste` en plus pour la marge) ; chaque `.partage-ligne` : `display: block` (une ligne de filets à plusieurs lignes) ; `.partage-ligne-inactif` → ajouter aussi `filet-tirete` ; `.partage-etat` → `etiquette` (+ `etiquette-active` si actif, `etiquette-hors` sinon) ; `input.partage-lien` reste un champ en lecture ; `.portee-choix` : `<fieldset className="portee-choix">` avec `<legend className="cote">` ; `.apercu-bandeau { background: var(--creux); border-left: var(--coupe) solid var(--encre); padding: 10px 14px }` sans rayon.

CSS :

```css
.partages-liste {
  margin-bottom: 24px;
}
.filets > li.partage-ligne {
  display: block;
  padding: 12px 0;
}
.partage-tete {
  display: flex;
  align-items: center;
  gap: 10px;
}
.partage-nom {
  font-weight: 500;
}
.partage-detail {
  margin: 4px 0;
  color: var(--graphite);
  font-size: 0.86rem;
}
input.partage-lien {
  font-size: 0.8rem;
  min-height: 40px;
}
.partage-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
}
.portee-choix {
  margin-bottom: 12px;
}
.portee-groupe {
  margin-bottom: 12px;
}
.portee-cases {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 20px;
}
.portee-case {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  margin: 0;
  font-family: var(--corps);
  font-size: 1rem;
  font-weight: 400;
  color: var(--texte);
}
.portee-case input {
  width: 20px;
  min-height: 0;
  margin: 0;
}
@media (min-width: 760px) {
  .portee-cases {
    grid-template-columns: 1fr 1fr;
  }
}
.apercu-bandeau {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--creux);
  border-left: var(--coupe) solid var(--encre);
  font-size: 0.9rem;
}
.apercu-bandeau a {
  margin-left: auto;
}
.apercu-au-dessus {
  flex-basis: 100%;
  margin: 0;
}
.apercu-au-dessus a {
  margin-left: 0;
}
```

Dans le JSX, envelopper les listes de cases de zones et de systèmes dans `<div className="portee-cases">`.

Les étiquettes de case à cocher et de bouton radio ne sont pas des cotes : `releve.css` met tout `label` en titrage graphite, et une case veut son texte en corps. Poser dans `app.css` :

```css
/* Un `label` qui contient une case ou un bouton radio est une ligne de
   choix, pas une cote : corps, taille normale, couleur du texte. */
.portee-case,
.formulaire-cases label,
.demarrage-case,
.demarrage-questions fieldset label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-family: var(--corps);
  font-size: 1rem;
  font-weight: 400;
  color: var(--texte);
}
```

- [x] **Step 4 : Le démarrage**

`demarrer._index.tsx`, `RechercheAdresse.tsx`, `EditeurSquelette.tsx` : les encarts `demarrage-regbl`, `demarrage-questions`, `demarrage-batiment` deviennent des blocs ouverts : en CSS, `{ padding-top: 14px; margin-bottom: 22px; border-top: var(--coupe) solid var(--encre) }` sans fond, sans bord, sans rayon ; chacun commence dans le JSX par `<p className="cote">` (« L'adresse », « Quelques questions », et pour un bâtiment le champ de nom lui-même reste). `.demarrage-candidats` → `filets` en plus ; `.demarrage-candidat` : `border: 0; border-left: var(--coupe) solid transparent; background: transparent; width: 100%; text-align: left` et `.demarrage-candidat.choisi { background: var(--teinte); border-left-color: var(--encre); box-shadow: none }` ; `.demarrage-avis` → `message-avis` dans le JSX ; `.demarrage-ordinal { font-family: var(--titrage); font-variant-numeric: tabular-nums; border: var(--vu) solid var(--pale); background: transparent }` sans rayon ; `.demarrage-retirer` → `bouton-discret` dans le JSX ; `.demarrage-ajouter { border: var(--vu) dashed var(--graphite); color: var(--encre); background: transparent; min-height: 44px; width: 100% }` sans rayon ; `.demarrage-niveau { border-left: var(--vu) solid var(--pale) }`.

- [x] **Step 5 : La capture**

`Capture.tsx` : `bouton-primaire` → `bouton-plein`. CSS sections « Feuille », « Sélecteur », « Confirmation » :

```css
.feuille-fond {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(27, 27, 25, 0.5);
}
.feuille {
  width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--papier);
  border-top: var(--coupe) solid var(--encre);
  padding: 14px var(--gouttiere) calc(14px + env(safe-area-inset-bottom));
}
@media (min-width: 1000px) {
  .feuille-fond {
    align-items: center;
  }
  .feuille {
    max-width: 520px;
    max-height: 90vh;
    border: var(--vu) solid var(--pale);
    border-top: var(--coupe) solid var(--encre);
    padding: 20px 24px 24px;
  }
}
/* La feuille monte de 24 px avec son voile : le seul moment où quelque
   chose glisse dans l'app. */
@media (prefers-reduced-motion: no-preference) {
  .feuille-fond {
    animation: fondu-voile 180ms ease-out both;
  }
  .feuille {
    animation: monter-feuille 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
}
@keyframes fondu-voile {
  from { opacity: 0; }
}
@keyframes monter-feuille {
  from { translate: 0 24px; opacity: 0; }
}
.feuille-photo {
  display: flex;
  justify-content: center;
}
.feuille-photo img {
  max-height: 34vh;
  max-width: 100%;
  object-fit: contain;
  border: var(--vu) solid var(--pale);
}
.feuille-lignes {
  margin: 14px 0 8px;
  border-top: var(--coupe) solid var(--encre);
}
.ligne {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: var(--cible);
  padding: 0 2px;
  background: transparent;
  border: none;
  border-bottom: var(--vu) solid var(--pale);
  text-align: left;
  font: inherit;
  color: var(--texte);
}
.ligne:disabled {
  opacity: 1;
  cursor: default;
}
.ligne-cle {
  color: var(--graphite);
  font-size: 0.85rem;
  width: 64px;
  flex: none;
}
.ligne-valeur {
  font-weight: 500;
  flex: 1;
}
.ligne:not(:disabled) .ligne-valeur::after {
  content: " ›";
  color: var(--graphite);
  font-weight: 400;
}
.feuille-nom {
  width: 100%;
  min-height: 40px;
  background: transparent;
  border: none;
  padding: 4px 2px;
  text-align: left;
  color: var(--graphite);
  font: inherit;
  font-size: 0.9rem;
}
.feuille-nom-champ {
  margin-bottom: 8px;
}
.feuille-erreur {
  color: var(--revision);
  margin: 4px 0;
}
.feuille-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
```

Sélecteur : `.selecteur-option { border-bottom: var(--vu) solid var(--pale); font: inherit }`, `.selecteur-option-active { background: var(--teinte); box-shadow: inset var(--coupe) 0 0 var(--encre) }`, `.selecteur-liste { border-top: var(--coupe) solid var(--encre) }`, `.selecteur-principal { font-weight: 500 }`. Confirmation : `.confirmation { background: var(--texte); color: var(--papier) }` sans rayon (garder le reste) ; `.file-indicateur` → dans `IndicateurFile.tsx`, `className="etiquette file-indicateur"` et `file-indicateur-erreur` → `etiquette-hors file-indicateur-erreur` avec `.file-indicateur-erreur { color: var(--revision); border-color: var(--revision) }` ; `.aide-installation { background: var(--papier); border: var(--vu) solid var(--pale); border-top: var(--coupe) solid var(--encre) }` sans ombre ni rayon.

- [x] **Step 6 : Le fondu entre écrans**

En tête de la section « Charpente » d'`app.css` :

```css
/* Le fondu croisé entre deux écrans, 160 ms. Sur `/p/`, sans script, par
   navigation de document (`@view-transition`) ; dans l'app, sur les liens
   qui portent `viewTransition`. Pas sur la vitrine : ses pages sont courtes
   et l'en-tête identique, un fondu y ferait clignoter la navigation — cette
   règle vit ici et non dans `releve.css` pour cette raison. */
@media (prefers-reduced-motion: no-preference) {
  @view-transition {
    navigation: auto;
  }
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 160ms;
  }
}
```

`@view-transition` est global au document et `app.css` est servie sur la vitrine aussi : la vitrine en hériterait. Poser d'office dans `vitrine.css`, chargée après, `@view-transition { navigation: none; }` avec ce commentaire : « Pas de fondu entre deux pages de vente : l'en-tête est identique et les pages courtes, un fondu ferait clignoter la navigation. `app.css`, servie ici aussi, l'active pour l'app et la page d'un lien. »

- [x] **Step 7 : Vérifier**

Run : `npm run typecheck && npx vitest run && npm run build && npm run verifier:bundle`.
Playwright : `/plans`, `/plans/nouveau`, `/evenements`, `/evenements/nouveau`, `/intervenants`, `/partages`, `/partages/:id/apercu`, `/demarrer` (sur une propriété vide créée pour l'occasion), à 1440 et 375 px ; ouvrir la feuille de capture (choisir un fichier image avec `browser_file_upload`) à 375 et 1440 ; captures ; aucune violation ; naviguer accueil → zones → accueil et constater le fondu (pas de flash blanc).

- [x] **Step 8 : Commit**

```bash
git add -A
git commit -m "feat(app): plans, historique, partages, démarrage et capture sur le relevé — la feuille monte, l'écran fond"
```

---

### Task 6 : La page d'un lien

**Files:**
- Modify: `app/components/partage/PagePartage.tsx`, `FicheObjet.tsx`, `FicheEvenement.tsx`, `PageHistorique.tsx`, `FacettesLiens.tsx`, `PlanStatique.tsx`, `app/styles/app.css` (section Partage)

**Interfaces:**
- Consumes : tout ce qui précède.

- [x] **Step 1 : Les composants**

`PagePartage.tsx` : lire ; l'en-tête garde le `<h1>` du nom de propriété **et rien d'autre** ; la recherche (`form[method=get]`) : `input.recherche-champ` + `button.partage-chercher` en `bouton-plein` ; `.facettes-repli > summary` → `className="etiquette"` (un `<summary>` stylé en étiquette ; garder `list-style: none`). `PartageInactif` : `<main className="porte">`. `FicheObjet`, `FicheEvenement`, `PageHistorique` : les listes en `filets` ; `fiche-champs` comme la fiche du propriétaire (tâche 4). `PlanStatique` : la légende `<ol className="plan-legende">` → chaque `<li>` commence par `<span className="pastille">{n}</span>` si ce n'est pas déjà le cas ; le lien pleine résolution en `.plan-pleine` inchangé.

CSS section « Partage » :

```css
.page-partage {
  padding: var(--gouttiere);
  max-width: 720px;
  margin: 0 auto;
}
.page-partage .recherche-epingle {
  position: static;
  margin: 0 0 var(--gouttiere);
  padding: 0;
  border: 0;
}
.partage-recherche {
  display: flex;
  align-items: center;
  gap: 10px;
}
.partage-recherche .recherche-barre {
  flex: 1;
}
.partage-chercher {
  min-height: var(--cible);
  flex: none;
}
.facettes-repli > summary {
  list-style: none;
}
.facettes-repli > summary::-webkit-details-marker {
  display: none;
}
.facettes-repli > .facettes-liste {
  margin-top: 6px;
}
.plan-legende {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  font-size: 0.92rem;
  border-top: var(--coupe) solid var(--encre);
}
.plan-legende li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: var(--vu) solid var(--pale);
}
```

- [x] **Step 2 : Vérifier**

Run : `npx vitest run tests/partage tests/historique && npm run build && npm run verifier:bundle`.
Playwright, **sans session** (contexte neuf) : `/p/<jeton actif>`, une fiche, `/historique`, un événement, un plan, `/p/<jeton révoqué>`, à 720 et 375 px ; `document.scripts.length === 0` ; console : aucune violation (la police doit charger : vérifier dans l'onglet réseau qu'un woff2 est bien reçu, et non bloqué) ; captures.

- [x] **Step 3 : Commit**

```bash
git add -A
git commit -m "feat(partage): la page d'un lien sur le relevé, toujours sans script"
```

---

### Task 7 : Documentation, ménage, revue au navigateur

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `.decisions/implementation-plan.md`, `app/styles/app.css` (retrait du pont), `docs/superpowers/plans/2026-09-15-releve-commun.md` (cases cochées)
- Delete: `tab360b.png`

- [x] **Step 1 : Retirer le pont et les orphelins**

Dans `app.css`, supprimer le bloc `:root` de pont ; puis :

```bash
grep -n -- "--fond\|--surface\|--texte-doux\|--trait\b\|--accent\|--alerte\|--rayon" app/styles/app.css
grep -rn -- "--v-\|v-cote\|v-appel\|v-echelle\|v-pastille\|v-coches\|v-barreau\|bouton-primaire\|pastille-active\|pastille-nombre" app/ --include=*.css --include=*.tsx --include=*.ts
grep -n "border-radius" app/styles/*.css | grep -v "50%"
grep -n "box-shadow" app/styles/*.css
grep -n "url(\"data:\|url(data:" app/styles/*.css
grep -rn -i "pi[eè]ces\?\b" app/ public/
```

Expected : la première commande ne rend rien (ou seulement des occurrences à remplacer par le jeton correspondant : le faire), la deuxième rien, la troisième rien, la quatrième exactement le halo des pastilles, le voile de la feuille et `inset` des champs et du niveau, la cinquième rien, la sixième rien.

```bash
git rm tab360b.png
```

- [x] **Step 2 : La revue au navigateur**

Playwright, à 1440, 768, 375 et 320 px. Sur chaque page, après chargement :

```js
// browser_evaluate
(() => {
  const deb = document.documentElement.scrollWidth - window.innerWidth;
  return { debordement: deb, violations: window.__violations ?? "non instrumenté" };
})()
```

Instrumenter d'abord chaque page (avant navigation, via `browser_run_code_unsafe` ou un `addInitScript` équivalent) : `window.__violations = []; document.addEventListener("securitypolicyviolation", e => window.__violations.push(e.violatedDirective + " " + e.blockedURI));`.

Pages : les cinq de la vitrine ; `/connexion` ; `/proprietes` ; l'accueil d'une propriété ; la recherche ; une fiche ; nouvel objet ; le plan ; l'historique ; un événement ; les partages ; l'aperçu d'un partage ; le démarrage ; la page d'un lien, sa fiche, son historique, son plan ; `/p/inconnu`. Expected : `debordement <= 0` partout, `violations` vide partout.

Puis, avec `browser_run_code_unsafe` ou l'émulation `prefers-reduced-motion: reduce` de Playwright (`page.emulateMedia({ reducedMotion: "reduce" })`), recharger `/` et l'accueil de l'app : le relevé est entier d'emblée, les cotes sont entières, la feuille de capture apparaît sans glisser.

Corriger ce que la revue trouve ; commit séparé « fix(style): … » par constat.

- [x] **Step 3 : README**

- Section qui décrit `app/styles/app.css` (« feuille unique, sobre… ») : décrire les trois feuilles, qui les sert, et `app/styles/polices/`.
- Décision #23 : ajouter « Amendée le 2026-09-15 : trois feuilles, voir la décision sur le relevé. »
- Décision #143 : ajouter « La seconde police écartée ici a été adoptée le 2026-09-15 pour tout le produit, voir la décision sur le relevé. »
- Nouvelle décision (numéro suivant) « Le relevé, de la vitrine à la fiche » : le fait (un seul système de design fait main, trois feuilles, deux polices auto-hébergées, trois traits, marge sur ordinateur, sept mouvements, vitrine réécrite côté client), ce que ça renverse (#143, la clause « police système » de #8 du plan), ce que ça a coûté (30 Ko de police, `font-src 'self'` sur `/p/`, `VERSION` v3, le renommage `pastille` → `etiquette` des facettes), ce qui n'a pas changé (les parcours, les URL, les loaders, le filtre de portée, la page d'un lien sans script, la limite `style-src 'unsafe-inline'`), et le lien vers le spec.
- « Limites connues » : la ligne sur `style-src 'unsafe-inline'` reste ; ajouter « `font-src 'self'` sur `/p/` : la seule directive ajoutée depuis l'étape 8, pour deux fichiers servis d'ici. »
- « Revue de fuite » : inchangée ; relire la ligne « Arbre de la vitrine » et la garder vraie.
- Le passage sur `.page-partage` à 688 px : inchangé, vérifier qu'il l'est.

- [x] **Step 4 : CLAUDE.md et le plan**

`CLAUDE.md`, dans « Architecture », après le paragraphe « Partage », ajouter un paragraphe **Le relevé** : trois feuilles et qui les sert ; les jetons ne se déclarent que dans `releve.css` ; les trois traits, jamais un quatrième ; angles droits, pas d'ombre ; les polices sous `app/styles/polices/` hachées dans `/assets/` (donc dans la coquille hors ligne) ; ce qui est interdit par arbre (pas de `url(data:)`, pas de `style` inline sur la vitrine, `font-src 'self'` partout) ; la marge à 1000 px rendue par le layout sans requête ; les mouvements sous `prefers-reduced-motion` ; `Echelle.tsx` est neutre et partagé. Corriger la mention `app/components/vitrine/Echelle.tsx` si elle existe dans le fichier.

`.decisions/implementation-plan.md`, ligne de la décision #8 : ajouter « — la clause « police système » a été remplacée le 2026-09-15 par le relevé (deux polices auto-hébergées), voir README. »

- [x] **Step 5 : Vérifier et commit**

Run : `npm run typecheck && npx vitest run && npm run build && npm run verifier:bundle`.

```bash
git add -A
git commit -m "docs: le relevé, de la vitrine à la fiche — README, CLAUDE.md, plan ; retrait du pont et d'une capture égarée"
```

- [ ] **Step 6 : La PR**

```bash
git push -u origin feat/releve-commun
gh pr create --title "feat(style): le relevé, de la vitrine à la fiche" --body-file - <<'EOF'
## Contexte

Le projet n'avait aucun framework de style mais deux langages : le relevé d'architecte sur la vitrine, la police système et les cartes arrondies dans l'app. Un seul système de design fait main pour les deux, React Router v7 inchangé. Spec : `docs/superpowers/specs/2026-09-15-releve-commun-design.md`.

## Changements

- `app/styles/releve.css` : jetons, deux polices auto-hébergées (Fraunces, Instrument Sans, sous `app/styles/polices/`, hachées dans `/assets/`), primitives, focus, mouvement de base. Servie partout par `root.tsx`.
- `app.css` réécrite sur ces primitives : marge de navigation à partir de 1000 px, filets à la place des cartes, étiquettes à la place des capsules, angles droits, aucune ombre, sept mouvements sous `prefers-reduced-motion`.
- `vitrine.css` réécrite sur les mêmes primitives ; neuf pictogrammes en SVG inline ; copie réécrite du côté du client ; cotes qui se tirent au défilement, en CSS seul.
- La page d'un lien : même feuille, toujours sans script ; `font-src 'self'` ajoutée à sa politique.
- `VERSION` v3 du service worker ; facettes `pastille` → `etiquette` ; `Echelle` partagée.
- README, CLAUDE.md et le plan consignent les deux renversements (décision #143, clause « police système » de #8).

## Tests effectués

- `npm run typecheck`, `npm test` (vert sauf les quatre échecs Windows connus de `lire-env`), `npm run build && npm run verifier:bundle`.
- Revue Playwright à 1440, 768, 375 et 320 px sur les cinq pages de vitrine, une douzaine d'écrans d'app, la page d'un lien et ses sous-pages : aucun débordement, aucune violation `securitypolicyviolation` sous les trois politiques, page entière au repos sous `prefers-reduced-motion: reduce`.

Closes #<numéro de la tâche 0>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01HDFhapWqw5GQSbARegg7E4
EOF
```
