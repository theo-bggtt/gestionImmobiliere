# Le relevé, de la vitrine à la fiche — ce qui reste à faire

État au 2026-09-15 en fin de session. Branche `feat/releve-commun`, issue #60.
Spec : `docs/superpowers/specs/2026-09-15-releve-commun-design.md`.
Plan : `docs/superpowers/plans/2026-09-15-releve-commun.md` (les tâches y sont détaillées ; ce
fichier dit où on en est et ce qui a changé en route).

## Où on en est

| Tâche | État | Commit |
|---|---|---|
| 0 — l'issue | faite | #60 |
| 1 — le socle (`releve.css`, polices, `font-src` sur `/p/`, `VERSION` v3, `Echelle` déplacée) | faite, vérifiée au navigateur (polices chargées sur les trois arbres, zéro violation) | `eeb1d8b` |
| 2 — la vitrine (`vitrine.css` sur les primitives, `Picto.tsx`, copie côté client, mouvements 2 et 3) | faite, cinq pages relues à 1440/768/375, zéro débordement, zéro violation | `53ba928` |
| 3 — charpente, accueil, recherche, porte, page d'erreur ; **`app.css` réécrite en entier** | faite, vérifiée | `c1a6485` |
| 4 — formulaires, fiches, structure, `ChoixNiveau` | faite, vérifiée (un objet créé en « technique » est écrit à 2 en base) | `62fab38` |
| 5 — plans, historique, partages, démarrage, capture, mouvements 5-6-7 | faite, vérifiée (feuille de capture à 1440 et 375, événement écrit avec son niveau, démarrage) ; **commitée avec ce fichier** | voir `git log` |
| 6 — la page d'un lien | faite, vérifiée sans session à 720 et 375 (zéro script, deux polices, zéro violation, zéro débordement) | `6ac53d3` |
| 7 — documentation, ménage, revue globale | faite : greps du ménage vides, `tab360b.png` retiré, revue à 1440/768/375/320 sous les trois politiques, README/CLAUDE.md/plan | voir `git log` |
| PR | ouverte depuis le poste local le 2026-09-15 (`gh pr create`) | — |

Chaque tâche a laissé `npm run typecheck`, les tests concernés et
`npm run build && npm run verifier:bundle` verts. `npm test` complet n'a été lancé qu'après la
tâche 1 (463 passent, les 4 échecs Windows connus de `tests/scripts/lire-env.test.ts`) : le
relancer en entier avant la PR.

## Tâche 6 — la page d'un lien

Les composants ont été lus, les éditions sont écrites dans un script de session
(`scratchpad/lot6.mjs`, répertoire temporaire : peut avoir disparu). Ce qu'il fait, à refaire
à la main si besoin — toutes des substitutions de classes, aucun script ajouté :

- `app/components/partage/PagePartage.tsx` : le bouton « Chercher » passe de `bouton-discret`
  à `bouton-plein` (garde `partage-chercher`) ; les deux `<p className="accueil-lien-filtres">`
  (« Revenir aux zones », « Historique (n) ») passent en `bloc-suite` ; `PartageInactif` rend
  `<div className="porte">` au lieu de `page-partage`.
- `app/components/partage/FicheObjet.tsx` : le `<p className="resultat-lieu">` sous le `<h1>`
  devient `<p className="fiche-type"><span>…</span></p>` ; chaque `<h2>` de section (Photos,
  Garanties, Historique) devient `<p className="sous-titre"><span>…</span></p>` et la section
  reçoit `bloc` ; la liste des garanties devient `<ul className="filets fiche-garanties-liste">`,
  chaque `<li>` porte `garantie-expiree` quand elle l'est et son texte dans
  `<span className="nom">` (« · expirée » dans le même span).
- `app/components/partage/FicheEvenement.tsx` : `resultat-lieu` → `fiche-type` ; les trois
  `<h2>` (Objets concernés, Intervenants, Photos) → `sous-titre`, sections en `bloc`.
- `PageHistorique.tsx`, `FacettesLiens.tsx`, `PlanStatique.tsx` : rien, déjà faits aux tâches 3
  et 5 (`etiquette`, pastilles numérotées de la légende).

Vérification : `npx vitest run tests/partage tests/historique`, `npm run build && npm run
verifier:bundle`, puis Playwright **sans session** (contexte neuf ou navigation privée) sur
`/p/jeton-de-test-local-0123456789` (lien actif de la démo), une fiche, `/historique`, un
événement, le plan, et `/p/<jeton révoqué>` (le second jeton de la table `partage`), à 720 et
375 px : `document.scripts.length === 0`, les deux polices dans `document.fonts`, aucune
violation, aucun débordement. Commit : `feat(partage): la page d'un lien sur le relevé, toujours
sans script`.

## Tâche 7 — documentation, ménage, revue

Suivre l'étape 7 du plan, avec ces précisions :

1. **Ménage.** Le pont `:root` d'`app.css` n'existe plus (la feuille a été réécrite à la tâche 3)
   et celui de `vitrine.css` non plus (tâche 2) ; vérifier quand même avec les `grep` du plan
   (`--fond`, `--accent`, `--v-`, `v-cote`, `pastille-active`, `bouton-primaire`, `border-radius`
   hors `50%`, `box-shadow`, `url(data:`, « pièce »). `git rm tab360b.png`.
2. **Revue au navigateur** à 1440, 768, 375 et 320 px, avec l'instrumentation
   `securitypolicyviolation` (voir « Pièges »). Pages : les cinq de la vitrine, `/connexion`,
   `/proprietes`, l'accueil de la propriété 2, la recherche, une fiche, nouvel objet, `/plans`,
   `/evenements`, un événement, `/partages`, l'aperçu d'un partage, le démarrage (créer une
   propriété jetable puis la supprimer en base), la page d'un lien et ses sous-pages,
   `/p/inconnu`. Puis un passage en `prefers-reduced-motion: reduce`.
3. **README.** Section sur `app/styles/app.css` (« feuille unique ») → les trois feuilles et
   `app/styles/polices/` ; décision #23 amendée ; décision #143 renvoyée ; **nouvelle décision**
   « Le relevé, de la vitrine à la fiche » (ce qui est fait, ce que ça renverse : #143 et la
   clause « police système » de #8, ce que ça a coûté : 30 Ko de police, `font-src 'self'` sur
   `/p/`, `VERSION` v3, `pastille` → `etiquette`, ce qui n'a pas changé) ; « Limites connues » :
   `font-src 'self'` sur `/p/` ; vérifier que le passage sur `.page-partage` à 688 px est
   toujours vrai (il l'est : `max-width: 720px` inchangé).
4. **CLAUDE.md** : paragraphe « Le relevé » dans Architecture (trois feuilles, jetons dans
   `releve.css` seul, trois traits, angles droits, polices sous `app/styles/polices/` hachées
   dans `/assets/`, interdits par arbre, marge à 1000 px sans requête, mouvements sous
   `prefers-reduced-motion`, `Echelle` et `ChoixNiveau` neutres). Le fichier mentionne encore
   `app/components/vitrine/Echelle.tsx` : corriger.
5. **`.decisions/implementation-plan.md`** : note sur la décision #8.
6. `npm test` complet, typecheck, build + verifier:bundle. Commit `docs: …`.
7. **PR** : `git push`, puis `gh pr create` avec le corps donné à l'étape 7 du plan et
   `Closes #60`.

## Écarts au plan, décidés en route

- `app.css` a été réécrite en entier à la tâche 3 plutôt que par tranches sur quatre tâches :
  les tâches 4 à 6 ne touchent que du JSX (et quelques règles ajoutées : `.bloc`, `.bloc-suite`,
  `.filet-arbre`, `.rangee-actions`, `.plan-suite`, `.champ-case`, `.champ-definition`).
- `ChoixNiveau` (`app/components/ChoixNiveau.tsx`) a deux props de plus que le plan : `depuis`
  (le renivelage en masse d'une zone commence à « usage », l'action refuse 0) et `nom`
  (`niveauMax` pour le plafond d'un lien). Il sert aussi aux formulaires d'événement,
  d'intervenant et de lien de partage. Un bug corrigé en route : le paramètre de la boucle
  s'appelait `nom` et masquait la prop.
- Les `<h2>` des blocs d'une fiche (Photos, Sur le plan, Historique, Garanties) sont devenus
  des `<p className="sous-titre">` : la sémantique de titre est perdue sur ces blocs. À
  réévaluer si l'accessibilité le demande (un `<h2 className="sous-titre">` marcherait aussi).
- « Comment c'est fait » (À propos) garde « Pas d'intelligence artificielle » : c'est un
  argument client, pas du vocabulaire de dépôt.
- `vitrine.css` porte une règle `@media print` qui désactive les animations liées au
  défilement : sur papier rien ne défile, un bloc « pas encore entré » resterait blanc.
- Le sélecteur de zone (`ZoneSelector`) rend désormais son propre `<label>Zone`.
- L'entrée « Des types d'objets » de « Ce que ça fait » a un dixième pictogramme, `types` ;
  `partager` illustre la section « Et le partage ».

## Pièges rencontrés

- **CRLF.** Les fichiers du dépôt sont en CRLF sur ce poste ; un remplacement de texte exact
  échoue si on cherche des `\n`. Normaliser (`texte.replace(/\r\n/g, "\n")`) avant de
  comparer, écrire en LF (Git normalise).
- **Playwright et le bouton d'envoi.** Sur toute page de l'app, le premier `button[type=submit]`
  est « Déconnexion » dans l'en-tête. Cibler `form.formulaire button[type="submit"]`.
- **Captures pleine page et animations liées au défilement.** Une capture `fullPage` ne fait
  pas défiler : les blocs `.v-parait` restent à l'état « pas encore entré » (opacité 0). Pour
  la revue visuelle, `page.emulateMedia({ reducedMotion: "reduce" })` ; l'animation a été
  vérifiée en faisant réellement défiler (opacité 0 puis 1).
- **`Buffer` n'existe pas** dans le bac à sable Playwright du MCP : passer un chemin de fichier
  à `setInputFiles`. Un PNG de test se fabrique sans dépendance avec `node:zlib` (IHDR, IDAT,
  IEND, CRC) — le script de session `png.mjs` le faisait.
- **Données de démo utiles** : propriété 2 (« Maison d'exemple »), objet 32 (« Prise plan de
  travail »), zone 15 (« Local technique »), événements 3 et 4, intervenant 3, partages 2
  (actif, jeton `jeton-de-test-local-0123456789`) et 3 (révoqué). Compte
  `demo@gestion-immobiliere.local` / `demo1234`. Les lignes créées pendant la revue ont été
  supprimées (élément, événement, propriété « Zz test démarrage »).
- **Instrumentation CSP** : `page.addInitScript(() => { window.__violations = [];
  document.addEventListener("securitypolicyviolation", e => window.__violations.push(e.violatedDirective + " " + e.blockedURI)); })`
  avant les navigations, puis lire `window.__violations` sur chaque page.
- La base : `docker compose up -d postgres` ; le serveur : `npm run dev` sur :3000 ; les 4
  échecs `lire-env` sous Windows sont connus et sans rapport.
