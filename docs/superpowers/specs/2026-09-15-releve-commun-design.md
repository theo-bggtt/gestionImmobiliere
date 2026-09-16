# Le relevé, de la vitrine à la fiche — spec de la refonte visuelle commune

Date : 2026-09-15. Branche : `feat/releve-commun` (depuis `feat/vitrine-releve-technique`, PR #59).
Maquette validée : https://claude.ai/artifact/MQnZ7F2hBvWnuMpKtZDpdL

## 1. Ce qu'on fait, et pourquoi

Le projet n'a aucun framework de style : `app/styles/app.css` et `app/styles/vitrine.css`
sont déjà écrites à la main. Le seul framework est React Router v7, qui fait le routage,
le rendu serveur et les loaders, et n'impose rien de visuel. **Il reste.** Ce qui change
est le langage visuel : un seul système de design, fait main, partagé par l'application,
la page d'un lien, les pages de connexion et la vitrine.

La direction retenue est celle que la vitrine porte déjà, **le relevé d'architecte**
(voir l'en-tête de `vitrine.css`) : encre verte sur papier, Fraunces pour ce qui titre,
et trois épaisseurs de trait qui disent quelque chose. L'application ne l'a pas du tout
aujourd'hui (police système, cartes blanches arrondies, capsules, ombres) : elle le
reçoit. La vitrine, elle, est réécrite du côté du client et gagne des pictogrammes.

Décisions prises avec le propriétaire du projet le 2026-09-15 :

| Question | Décision |
|---|---|
| La pile | React Router v7 reste. Tout est restylé, rien n'est réécrit. |
| La direction | Le relevé d'architecte, étendu à l'app. |
| Les animations sur la vitrine | CSS pur, la vitrine reste sans aucun script. |
| Le périmètre app | La peau, et une mise en page pour grand écran. Mêmes écrans, mêmes parcours, mêmes URL. |
| Une seconde police (corps) | Oui, auto-hébergée. Renverse la décision #143 du README (« écartés : une seconde police pour le corps ») et la clause « police système » de la décision #8 du plan. |
| La marge sur ordinateur | Oui : navigation, propriété et capture dans une colonne à gauche à partir de 1000 px. |

Hors périmètre : thème sombre, nouvelle page, nouvelle navigation sur téléphone, toute
modification de schéma, de loader, d'action ou de règle de permission.

## 2. Les feuilles

Trois feuilles, toutes faites main, sans préprocesseur ni outil ajouté.

| Feuille | Servie par | Contient |
|---|---|---|
| `app/styles/releve.css` | `root.tsx` (`links`), donc **tous** les arbres | Les deux `@font-face`, les jetons, le reset, la typographie de base, les primitives (§5), le mouvement de base (§8), le focus. |
| `app/styles/app.css` | `root.tsx` (`links`), donc tous les arbres, comme aujourd'hui | Les écrans du produit : charpente, capture, recherche, grille, fiche, plan, historique, partages, démarrage, connexion, page d'un lien. La page d'un lien en a besoin : README, « même feuille, mêmes classes : on retire des éléments, on ne redessine rien ». |
| `app/styles/vitrine.css` | `routes/_vitrine/layout.tsx` (`links`), la vitrine seule | Les mises en page de vente : grille de planche, héros, relevés d'entrée, lecteurs, tableau, aplat d'encre, pictogrammes. Ne redéclare **aucun** jeton ni aucune primitive. |

Ordre de chargement : `releve.css` avant `app.css` (l'ordre du tableau `links` de la
racine), puis `vitrine.css` par le layout. Une primitive ne se redéfinit jamais dans
une feuille aval : on la compose (`class="bouton-plein v-appel"` n'existe pas ; un bouton
de vitrine EST un `.bouton-plein`).

Écarté : une seule feuille (le locataire télécharge la page de vente) et une feuille
par arbre avec ses propres jetons (trois copies qui divergent).

Règles de la cascade, apprises sur `vitrine.css` :
- Les sélecteurs d'élément nus (`p`, `a`, `h2`, `input`) ne vivent que dans `releve.css`,
  et une seule fois. `app.css` et `vitrine.css` ne posent des règles que sur des classes.
  C'est ce qui a coûté trois télescopages de spécificité à la vitrine (`.v-sec p` battait
  `.v-jour`).
- Pas de `!important`. Pas d'`@layer` non plus : trois feuilles suffisent, et `@layer`
  changerait la lecture de tout ce qui existe.
- Préfixes : `.v-` reste réservé à `vitrine.css`. Les classes d'`app.css` gardent leurs
  noms (voir §6.6 : l'inventaire est de 210 classes, on ne les renomme pas). Les
  primitives de `releve.css` n'ont pas de préfixe.

## 3. Les jetons

Déclarés une fois, dans `:root` de `releve.css`. Les noms `--v-*` de `vitrine.css`
disparaissent au profit de ceux-ci ; les noms d'`app.css` (`--fond`, `--surface`,
`--trait`, `--accent`, `--alerte`, `--texte-doux`) aussi.

| Jeton | Valeur | Rôle |
|---|---|---|
| `--papier` | `#faf9f7` | Le fond, partout. Aussi `background_color` du manifeste. |
| `--creux` | `#f1f0ea` | Une bande en retrait (le relevé du héros), un survol de ligne. |
| `--feuille` | `#ffffff` | Le fond d'un champ de saisie. Rien d'autre n'est blanc. |
| `--pale` | `#d5d8d2` | Le trait fin, les filets, le bord d'un champ au repos. |
| `--teinte` | `color-mix(in srgb, var(--encre) 8%, var(--papier))` | La sélection, l'option courante. |
| `--graphite` | `#5f6763` | Le texte secondaire, les étiquettes, la prose de la vitrine. |
| `--texte` | `#1b1b19` | Les valeurs, dans l'app. |
| `--encre` | `#1f4f46` | Titres, traits, actions, points. `theme-color`. |
| `--encre-claire` | `#2c6c60` | Survol d'un aplat d'encre. |
| `--revision` | `#8c2f1f` | Refusé, masqué, expiré, erreur. **Jamais décoratif.** |
| `--coupe` | `2.5px` | Le trait de coupe. |
| `--vu` | `1px` | Le trait de projection. |
| `--cible` | `56px` | Le plancher d'une cible tactile dans un flux de saisie (inchangé). |
| `--gouttiere` | `16px` | La gouttière de l'app sur téléphone (inchangée). |
| `--colonne` | `34rem` | La colonne de texte de la grille de planche. |
| `--large` | `66rem` | La piste large. `46rem` sous 1000 px, `--colonne` sous 760 px. |
| `--marge` | `20px` | La marge extérieure de la grille de planche (`18px` sous 760 px). |
| `--titrage` | `"Fraunces", Georgia, "Times New Roman", serif` | |
| `--corps` | `"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif` | |

Pas de `--rayon` : **angles droits partout**, sauf ce qui est un point (pastille,
sommet, point de plan : cercle). Pas d'ombre, sauf le voile de la feuille de
confirmation (`rgba(27,27,25,.5)`) et le halo blanc d'un point de plan (un `stroke`, pas
une ombre). Ces deux exceptions existent parce que sans elles la feuille ne se détache
pas de la page et un point ne se lit pas sur une photo de plan.

Les trois traits, et jamais un quatrième (convention reprise de `vitrine.css`) :

| Trait | Dit | Sert à |
|---|---|---|
| Coupe, `--coupe` d'encre | ce qu'on traverse | début d'un bloc (`border-top`), page courante de la navigation, contour d'un bouton, focus clavier, champ en cours d'édition |
| Projection, `--vu` pâle | ce qu'on voit sans le couper | filet entre deux lignes, bord d'un champ au repos, ligne d'une cote |
| Interrompu, `--vu` tireté graphite | ce qui existe mais n'est pas visible d'ici | champ masqué par le plafond, lien révoqué ou expiré, garantie expirée, zone hors portée sur un plan, message d'avis |

## 4. La typographie

Deux polices, toutes deux servies depuis ce serveur, latin seul, licence OFL à côté du
fichier :

| Police | Fichier | Poids | Rôle |
|---|---|---|---|
| Fraunces (déjà là) | `app/styles/polices/fraunces-latin.woff2` (67 Ko), `LICENCE-Fraunces.txt` | variable 300–700 | titres, cotes, chiffres, rangs, dates, libellés de bouton, étiquettes de champ |
| Instrument Sans (nouvelle) | `app/styles/polices/instrument-sans-latin.woff2` (30 Ko), `LICENCE-InstrumentSans.txt` | variable 400–700, droit seulement | corps, listes, fiches, saisie, navigation |

Les deux fichiers quittent `public/polices/` pour `app/styles/polices/` et sont
référencés par un `url()` relatif dans `releve.css` : Vite les hache alors dans
`/assets/`, ce qui les fait entrer dans la coquille hors ligne (`app/lib/capture/coquille.ts`
ne met en cache que ce qui commence par `/assets/`). Aujourd'hui Fraunces, servie
depuis `public/`, en est exclue. `font-display: swap` sur les deux.

Pas d'italique chargé, pour aucune des deux. Le `<em>` d'un titre de vitrine garde le
comportement actuel (italique synthétisé), il n'est pas dans le périmètre.

L'échelle (`rem`, corps de 16 px) :

| Corps | Police | Graisse | Rôle |
|---|---|---|---|
| `clamp(2.6rem, 6.4vw, 4.8rem)` | titrage | 300 | titre de page de vitrine (`.v-titre`) |
| 2.6rem | titrage | 300 | titre de page de l'app (`h1`), lettrage −0.015em, interligne 1.05 |
| `clamp(1.6rem, 3vw, 2.2rem)` | titrage | 400 | titre de section de vitrine |
| 1.6rem | titrage | 400 | titre de section de l'app (`h2`), chiffres et dates mis en avant |
| 1.12rem | titrage | 500 | sous-titre, nom d'objet dans une fiche |
| 0.88rem | titrage | 500 | cote, étiquette de champ, libellé de facette |
| 1rem | corps | 400 | corps, interligne 1.55 (1.62 dans la prose de vitrine) |
| 0.86rem | corps | 400 | secondaire : lieu, compte, aide de champ |

`text-wrap: balance` sur tous les titres. `font-variant-numeric: tabular-nums` sur les
dates en colonne et les ordinaux. Une ligne de corps tient sous 75 caractères
(`--colonne`).

## 5. Les primitives (`releve.css`)

Chaque primitive est une classe, avec ses états, et existe **une fois**. Les écrans de
l'app et les pages de vitrine les emploient telles quelles.

| Primitive | Classe(s) | Forme |
|---|---|---|
| Bouton plein | `.bouton-plein` | aplat d'encre, texte papier, contour `--coupe` d'encre, titrage 500, 48 px de haut (56 dans un flux de saisie via `--cible`), survol `--encre-claire`, désactivé `--pale` |
| Bouton de trait | `.bouton-trait` | transparent, contour `--coupe` d'encre, texte encre, survol `--creux` |
| Bouton discret | `.bouton-discret` | contour `--vu` pâle, texte graphite, corps 500, 40 px, survol : encre. Le nom existe déjà (14 fichiers), la classe est reprise sans renommage |
| Champ | `.champ` (et les éléments nus `input`, `select`, `textarea` pour les 17 routes sans classe) | fond `--feuille`, bord `--vu` pâle, 48 px ; survol : bord graphite ; focus : bord encre + `box-shadow: inset 0 0 0 1.5px var(--encre)` ; erreur : bord `--revision`. `select` avec un chevron dessiné en `linear-gradient` (pas de `url(data:)`, bloquée sur `/p/` et la vitrine) |
| Étiquette de champ | `label > span:first-child`, `.champ-etiquette` | titrage 0.88rem graphite, au-dessus du champ |
| Aide de champ | `.champ-aide` (existe) | corps 0.86rem graphite |
| Cote | `.cote` | embout `--coupe`, étiquette titrage 0.88rem, ligne `--vu` qui court jusqu'au bord. Remplace `.v-cote`, et remplace dans l'app les surtitres en capitales espacées (`.facettes-titre`) |
| Filets | `.filets` | liste sans puce, `border-top: --coupe`, chaque ligne `border-bottom: --vu`, 52 px minimum, survol `--teinte` ; `.filet-tirete` pour une ligne inactive |
| Étiquette | `.etiquette`, `.etiquette-active`, `.etiquette-hors` | rectangle de trait `--vu` pâle, 30 px ; active : `--coupe` d'encre ; hors : tireté. Remplace les capsules (`.pastille` de facette, `.chrono-type`, `.partage-etat`, `.resultat-motif`, `.plan-niveau`, `.file-indicateur`) |
| Pastille | `.pastille` | cercle de 24 px d'encre, chiffre papier en titrage 600, halo papier de 2 px. Reste un cercle : c'est un point de plan. **Attention** : `.pastille` désigne aujourd'hui une facette dans `app.css` ; §6.6 règle le renommage |
| Échelle | `.echelle` (+ `.plein`) | quatre barreaux de 6 px, remplis jusqu'au plafond. Existe dans `vitrine.css` sous `.v-echelle` ; devient partagée, et le composant `Echelle.tsx` passe de `components/vitrine/` à `components/Echelle.tsx` (neutre, sans import) |
| Choix de niveau | `.niveau-choix` | quatre cases côte à côte, chacune une échelle et son nom ; la choisie : `--teinte` et un `--coupe` en bas. Remplace le `<select>` de niveau des fiches et de la zone |
| Messages | `.message-ok`, `.message-erreur`, `.message-avis` | `border-left: --coupe currentColor`, encre / révision / graphite tireté. Portent `role="status"` ou `role="alert"` comme aujourd'hui |
| Focus | global | `outline: var(--coupe) solid var(--encre); outline-offset: 3px` sur `:focus-visible`, déclaré une fois |

## 6. L'application

### 6.1 La charpente (`routes/_app/layout.tsx`)

Un seul balisage, deux dispositions par CSS.

**Sous 1000 px (téléphone, tablette portrait)** : rien ne change dans les parcours.
Barre du haut (`.app-tete` : marque, indicateur de file, compte, déconnexion), corps
(`.app-corps`, gouttière 16 px, réserve en bas), barre de capture fixée en bas
(`.capture-barre`, deux déclencheurs, cibles 56 px). Le déclencheur reste un `<label>`
contenant l'`<input type="file" capture>` : c'est la seule façon fiable d'ouvrir le
viseur sur Safari iOS.

**À partir de 1000 px** : la marge, `.app-marge`, colonne de 236 px à gauche, bordée
d'un `--vu` :
- la marque, puis la propriété courante (cote « Propriété » + nom) ;
- la navigation en filets : Accueil, Zones, Systèmes, Plans, Historique, Intervenants,
  Liens de partage, vers `/proprietes/:id/…`. Rendue **seulement** quand `proprieteId`
  est connu (le layout le calcule déjà pour la capture) et **seulement** à cette
  largeur (`display: none` en dessous : sur téléphone, l'accueil garde sa navigation
  `.accueil-nav`). Page courante : `--coupe` à gauche, texte encre. Sans compte
  d'objets : ça demanderait des requêtes que le layout ne fait pas ;
- les deux déclencheurs de capture, empilés, en bas de la marge (`margin-top: auto`) ;
  la barre fixe disparaît ;
- le compte et la déconnexion sous un filet.

Le corps prend le reste : `padding: 22px 36px`, contenu jusqu'à `--large`. La feuille
de confirmation de capture (`.feuille`) se centre (520 px, `align-items: center`) au
lieu de monter du bas.

`.app` (posée sur le conteneur racine, sans règle aujourd'hui) devient la grille
`grid-template-columns: 236px 1fr` à partir de 1000 px.

### 6.2 L'accueil et la recherche

`proprietes.$proprieteId._index.tsx`, `recherche.tsx`, `BarreRecherche`,
`ListeResultats`, `GrilleZones`, `PastillesFacettes`.

- Le champ de recherche : `.champ` de 56 px, loupe SVG inline à gauche (classe, pas
  `url()`), épinglé en haut sur téléphone (inchangé).
- Les facettes : des `.etiquette` (active : coupe) sous une `.cote`. Le compte reste
  dans l'étiquette, en graphite.
- La grille de zones : 2 colonnes sous 560 px, 3 jusqu'à 1000 px, 4 au-delà. Une case
  = photo 4:3 bordée d'un `--vu` (ou, sans photo, la lettre initiale en titrage 300
  sur `--creux` hachuré en `repeating-linear-gradient`), puis le nom en corps 500 et le
  compte en titrage 0.84rem graphite, sous un filet. Plus de dégradé sombre sur la
  photo, plus de coin arrondi. Survol : le filet devient une coupe.
- Les résultats : des `.filets` ; vignette 48 px carrée ; nom 500 ; lieu 0.86rem
  graphite ; le motif de correspondance en `.etiquette`. `aria-busy="true"` : opacité
  0.6, transition 150 ms.
- Les échéances de l'accueil : `.echeances`, filets à deux colonnes (date en titrage,
  puis objet et libellé). Une garantie expirée (`garantie-expiree`, calculée par
  PostgreSQL, jamais par l'écran) : date en `--revision`, ligne tiretée.
- L'accueil garde ses blocs actuels et leur ordre : recherche, zones, échéances,
  navigation (masquée dès 1000 px puisque la marge la porte). Le bloc « Dernièrement »
  de la maquette n'est **pas** construit : le loader de l'accueil ne charge pas les
  événements, et ce n'est pas une refonte de loaders.

### 6.3 Les listes et formulaires de structure

`batiments.*`, `niveaux.*`, `zones.*`, `systemes.*`, `elements._index`, `types.nouveau`,
`proprietes._index`, `ChampEditor`, `DynamicElementFields`, `ZoneSelector`.

Dix-sept de ces routes n'ont aucune classe et reposent sur les éléments nus. Elles en
reçoivent le minimum : `<h1>` de page, listes en `.filets`, formulaires en `.formulaire`
(nouvelle classe : `display: grid; gap: 16px`, deux colonnes pour les champs courts via
`.formulaire-ligne` qui existe déjà), actions en `.formulaire-actions` (plein +
discret). Les formulaires de suppression restent un bouton discret séparé, sous un
filet tireté avec un `.message-avis`.

Le sélecteur de niveau (fiche, zone) devient `.niveau-choix` (§5). Le renivelage en
masse d'une zone (`zone-renivelage`) garde ses deux POST ; son aperçu devient des
filets sous une cote « Ce que ça changerait ».

### 6.4 La fiche d'un objet

`elements.$elementId.modifier.tsx`, `garanties.$garantieId.modifier.tsx`.

Fil d'Ariane en titrage 0.85rem (`.fiche-fil`, existe). `h1` en 2.6rem/300. Sous le
titre, une ligne `.fiche-type` : l'échelle du niveau, puis type et système en graphite.
Photos : `.galerie` en ligne, carrés bordés d'un `--vu`, plus de coin arrondi ; le
déclencheur « + photo » est une case de même taille sur `--creux`. Les champs :
`.fiche-champs` en `<dl>` avec `border-top: --coupe` et un filet par ligne, clé en
graphite 0.85rem, valeur en corps 500. Un champ dont le `niveauMin` dépasse le niveau
de la fiche n'est PAS marqué ici (le propriétaire voit tout ; c'est la page d'un lien
qui masque, en ne l'envoyant pas). Garanties, plans et historique : chacun sous un
`.sous-titre` (titrage 0.88rem, lien d'action à droite) puis des `.filets`. Une garantie
expirée : date en `--revision`, ligne en tireté.

### 6.5 Les plans

`plans._index.tsx`, `plans.nouveau.tsx`, `plans.$planId.modifier.tsx`, `VuePlan`,
`EditeurImagePlan`, `PlanStatique`.

- Le sélecteur de niveau : des `.etiquette` (active : coupe). `plan-niveau-deja` :
  tireté.
- Le cadre : `--vu` pâle, fond `--feuille`, angle droit. `touch-action: none`
  inchangé.
- Les points : cercle d'encre de 18 px avec un `stroke` papier de 2 px, sans
  `box-shadow` ; le nom sous le point en corps 0.7rem sur `--papier` à 88 %. La grappe :
  même cercle, 28 px, chiffre en titrage. La liste dépliée d'une grappe : `--feuille`,
  bord `--vu`, sans ombre ni rayon.
- Les contours : `polygon` en encre à 14 % avec un trait de 0.3 ; en cours de tracé :
  tireté. Les sommets : cercles d'encre à halo papier. Étiquette de contour : titrage
  0.75rem encre sur papier à 80 %.
- **Les attributs `style` en pourcentage restent** (positions des points, sommets,
  étiquettes, cadre de recadrage, transformée de zoom) : `tests/partage/plan.test.ts`
  épingle `left:25%`, et le README les liste en limite connue.
- La bannière de proposition de rangement (`plan-proposition`) : `.message-ok` avec ses
  deux boutons.
- L'éditeur d'image : le canevas bordé d'un `--vu`, le cadre de recadrage en tireté
  d'encre, les poignées carrées de 22 px d'encre à bord papier (déjà carrées).
- Le sélecteur de niveau de `PlanStatique` (sans script) : mêmes classes, en `<a>`.

### 6.6 Historique, intervenants, partages, démarrage, capture

- **Chronologie** (`Chronologie`, `FiltreTypes`, `Pagination`) : `.chrono` en filets ;
  la date en titrage, le type en `.etiquette`, le titre en corps 500, les objets en
  0.86rem graphite. Le filtre par type : des `.etiquette` en `<a>` (sans script sur
  `/p/`), inchangé dans sa mécanique. Pagination : deux ancres, les bouts inertes en
  graphite à 45 %.
- **Formulaires d'événement et d'intervenant** : `.formulaire` ; la liste de cases à
  cocher des objets liés (`formulaire-cases`) reste plafonnée et déroulante, bordée d'un
  `--vu` ; l'avis « aucun objet lié » en `.message-avis`, sa forme forte en
  `.message-erreur`.
- **Partages** (`partages._index.tsx`) : chaque lien en filets ; l'état en `.etiquette`
  (actif : coupe ; révoqué ou expiré : tireté, et la ligne entière en `.filet-tirete`) ;
  le jeton dans un `.champ` en lecture. Le formulaire de création : la portée
  (`portee-choix`) en `fieldset` sans bord arrondi, `legend` en cote ; les cases de
  zones et systèmes en deux colonnes à partir de 760 px. Le bandeau d'aperçu
  (`apercu-bandeau`) : `--creux`, `border-left: --coupe`, sans rayon ; le compte de ce
  que le lien ne montre pas y reste en texte (l'aperçu explique, ne corrige pas).
- **Démarrage** (`demarrer._index.tsx`, `RechercheAdresse`, `EditeurSquelette`) : les
  encarts blancs (`demarrage-regbl`, `demarrage-questions`, `demarrage-batiment`)
  deviennent des blocs à `border-top: --coupe` sous une cote (« L'adresse », « Quelques
  questions », le nom du bâtiment). Les candidats d'adresse : des `.filets` cliquables
  (le choisi : `--teinte`, coupe à gauche). L'ordinal d'un niveau : titrage
  tabulaire dans un rectangle de trait. Les boutons « retirer » et « ajouter » :
  discret, et discret en tireté.
- **Capture** (`Capture`, `Selecteur`, `IndicateurFile`, `AideInstallationIOS`,
  `.confirmation`) : la feuille (`.feuille`) en `--papier` avec `border-top: --coupe`,
  angles droits ; ses lignes (`.ligne`) en filets, clé graphite, valeur 500, chevron en
  graphite ; le sélecteur plein écran en filets, l'option active en `--teinte`. La
  confirmation flottante (`.confirmation`) : `--texte` sur `--papier`, sans rayon.
  L'indicateur de file : `.etiquette`, en `--revision` tireté quand bloqué. L'aide
  d'installation iOS : `--papier`, `border-top: --coupe`, sans ombre.

**Le renommage `.pastille`** : dans `app.css`, `.pastille` est aujourd'hui une facette
(capsule) et `.plan-numero` / `.plan-point-pastille` sont les points. La primitive
`.pastille` de `releve.css` est un point. Donc : les facettes (`PastillesFacettes`,
`FacettesLiens`, `FiltreTypes`) passent de `pastille`/`pastille-active`/`pastille-nombre`/
`pastille-plus` à `etiquette`/`etiquette-active`/`etiquette-nombre`/`etiquette-plus`,
dans les trois composants et dans `app.css`. Aucun test ne cherche ces classes
(vérifié par l'inventaire : les tests comparent des textes et des URL). C'est le seul
renommage de classe de la refonte ; les 200 autres gardent leur nom, seules leurs
règles changent.

### 6.7 Les pages de connexion et d'inscription

`routes/_public/login.tsx`, `register.tsx`. Aucune classe aujourd'hui. Elles reçoivent
un conteneur `.porte` : colonne de 26rem centrée, la marque en haut en titrage, `h1`
2.6rem/300, formulaire en `.formulaire`, bouton plein pleine largeur. Contraintes
tenues par `tests/auth/inscription.test.ts` : la page de connexion ne contient
`/inscription` nulle part quand l'inscription est fermée (donc pas de lien « créer un
compte » dans un pied de page) ; la page d'inscription fermée ne contient aucun
`<form`.

## 7. La page d'un lien, et la page d'erreur

`routes/_partage/*`, `components/partage/*`, `PageErreur`.

- Même feuille, mêmes classes, **toujours sans script** : la recherche reste un
  `<form method="get">`, les facettes et la pagination des `<a>`, le repli un
  `<details>`. Aucun `<script`, `manifest`, `sw.js` ni `/proprietes/` dans le HTML
  (`tests/partage/routes.test.ts`).
- `.page-partage` reste à 720 px au plus (688 px de contenu) : la dérivée
  `taille=moyenne` du plan (1400 px) est calibrée dessus (README, décision #81).
- En tête : le nom de la propriété en `<h1>` (rendu tel quel, c'est l'hypothèse de la
  revue de fuite), et rien d'autre. **Pas l'échelle du plafond**, contrairement à la
  maquette : deux barreaux sur quatre disent au lecteur qu'il y en a deux qu'il ne voit
  pas, même famille que la tuile « Local technique · 0 objet ». La page ne dit rien de
  ce qu'elle ne montre pas.
- La fiche (`FicheObjet`) : `.fiche-champs` en filets ; les champs filtrés ne sont pas
  envoyés (inchangé), donc rien n'est « masqué » à l'écran.
- Le plan statique : `<img>` moyenne, ancres numérotées en `.pastille` positionnées par
  `style` en pourcentage (inchangé), légende en `.legende` à deux colonnes.
- **La politique de `/p/` reçoit `font-src 'self'`** (`server/application.js`,
  `CSP_PARTAGE`). Sans ça les deux `@font-face` de `releve.css` y sont bloquées
  (`default-src 'none'` sans `font-src`). `tests/serveur/application.test.ts` gagne
  l'assertion `toContain("font-src 'self'")` sur `/p/` et `/P/`, et ne perd aucune des
  siennes (toujours pas de `script-src`, pas de nonce). Le README l'ajoute à la
  description de la politique.
- Le lien inactif (`PartageInactif`) : page neutre, un `h1` et un paragraphe, en
  `.porte`.
- `PageErreur` : un document complet, **sans `style` inline ni script**
  (`tests/erreurs/page-erreur.test.ts` : `<h1>Introuvable</h1>` littéral, `name="robots"`,
  `href="/"`). Elle charge `releve.css` par le même `?url` : titre en titrage, message en
  corps, lien de retour souligné. Elle est aussi servie sur la vitrine, où la politique
  n'a pas d'`'unsafe-inline'` : d'où l'interdiction de tout `style`.

## 8. Le mouvement

Sept mouvements, chacun dit quelque chose, aucun décoratif. Tous sous
`@media (prefers-reduced-motion: no-preference)` ; sans ce media, la page est immobile
et complète. Rien n'est jamais parqué à `opacity: 0` en attendant un script : sur la
vitrine il n'y a pas de script, et l'état de repos est toujours l'état final.

| # | Où | Quoi | Technique | Durée |
|---|---|---|---|---|
| 1 | vitrine, accueil | le relevé du héros se trace, une fois, au chargement (existe) | `stroke-dashoffset` sur le mur, fondu différé sur le reste | 1,1 s |
| 2 | vitrine | la ligne de chaque `.cote` de section s'étire de gauche à droite quand la section entre dans l'écran | `animation-timeline: view()`, `animation-range: entry 10% entry 45%`, dans `@supports (animation-timeline: view())` | liée au défilement |
| 3 | vitrine | un bloc `.large` (relevés d'entrée, gestes, lecteurs, tableau, fonctions) monte de 10 px et s'opacifie en entrant | idem, `entry 5% entry 35%` ; classe `.parait` posée sur les blocs concernés | liée au défilement |
| 4 | partout | au survol d'un lien de navigation, d'une case de zone, d'une ligne de filets : le trait de 1 px devient une coupe ; un aplat d'encre passe à `--encre-claire` | `transition: border-color, background-color, color` | 150 ms |
| 5 | app et `/p/` | fondu croisé entre deux écrans | `/p/` : `@view-transition { navigation: auto }` (navigation de document, CSS seul) ; app : prop `viewTransition` sur les `<Link>` de la marge, de l'accueil et des listes, et `::view-transition-old/new(root)` à 160 ms | 160 ms |
| 6 | app | la feuille de confirmation monte de 24 px avec son voile | `@keyframes` sur `.feuille` et `.feuille-fond` à l'ouverture | 220 ms, `cubic-bezier(.2,.7,.2,1)` |
| 7 | app | pendant qu'une recherche charge, la liste passe à 60 % | `.resultats[aria-busy="true"]` + `transition: opacity` | 150 ms |

Le mouvement 5 côté app est le seul qui touche du JSX hors classes : ajouter
`viewTransition` à une douzaine de `<Link>`. Il ne touche pas `/p/` (pas de script) ni
la vitrine (cross-document, mais la vitrine n'en a pas besoin : ses pages sont courtes
et l'en-tête est identique, un fondu ferait clignoter la navigation ; le
`@view-transition` est déclaré dans `app.css`, pas dans `releve.css`).

Ce qui est refusé, et pourquoi : pas de parallaxe (le relevé est posé sur une table, il
ne flotte pas), pas de squelette de chargement (un aplat gris qui clignote est une
promesse de contenu, l'opacité dit la même chose sans mentir), pas d'apparition au
défilement dans l'app (on y revient dix fois par jour, la troisième fois c'est du
retard), pas de compteur qui tourne (règle #2, et `discours.test.ts`).

## 9. La vitrine

### 9.1 Ce qui reste

L'arbre, ses cinq chemins (`CHEMINS_VITRINE` et `routes.ts`, comparés par
`tests/vitrine/arbre.test.ts`), `handle.sansScripts`, `ENTETES_VITRINE`, l'action de la
liste d'attente dans `accueil.tsx` (seule action de l'arbre, réponse identique octet
pour octet qu'une adresse soit neuve ou déjà là), l'absence de loader, la grille de
planche, le relevé du héros et sa légende, les quatre lecteurs (`PlanMini`), l'échelle,
le tableau qui s'empile sous 760 px avec ses `data-libelle`, l'aplat d'encre, la prose.

### 9.2 Ce qui change

1. **Le corps passe en Instrument Sans** par héritage de `releve.css` ; les `.v-*` de
   typographie de corps disparaissent.
2. **Les primitives partagées** remplacent leurs doublons : `.v-cote` → `.cote`,
   `.v-appel` → `.bouton-plein`, `.v-appel-second` → `.bouton-trait`, `.v-formulaire
   input/button` → `.champ` et `.bouton-plein`, `.v-echelle` → `.echelle`,
   `.v-pastille` → `.pastille`, `.v-coches` → `.filets` (et `.v-croix` → lignes en
   `.filet-tirete` couleur révision). `vitrine.css` perd les reprises de spécificité
   que ces doublons exigeaient.
3. **Neuf pictogrammes** sur « Ce que ça fait », un par capacité, dans un composant
   neutre `app/components/vitrine/Picto.tsx` (`<Picto nom="photographier" />`) : SVG
   inline de 44 px, trait d'encre 1.5, tireté graphite pour ce qui est proposé ou
   masqué, un seul `fill` d'encre pour un point. Aucun `url()`, aucun `<img>`
   (`discours.test.ts`). Les neuf : photographier, retrouver, plan, contour, historique,
   garantie, intervenants, démarrage, partager.
4. **La copie est réécrite du côté du client.** Règles :
   - on parle de la maison, du jour où ça arrive, de ce qu'on obtient et de ce qu'on
     garde ; jamais du dépôt, des tests, du code, de ce qui « compile », de l'état
     d'avancement, de ce qui a ou n'a pas été « mesuré » ;
   - la confidentialité se dit par ce que le visiteur garde chez lui (« l'adresse de
     votre maison n'est écrite nulle part », « rien ne part chez un tiers »), pas par le
     mécanisme qui le garantit. Une phrase, une seule, dit que ces engagements sont
     tenus par le fonctionnement de l'application et non par une charte ; c'est
     l'argument, pas la méthode ;
   - « À propos » garde d'où ça vient (la perceuse, le mur) et ce que le projet refuse de
     promettre, en une section courte ; « Où ça en est » et « Pas encore de tarifs »
     fusionnent en un paragraphe qui dit que l'inscription n'est pas ouverte et que le
     modèle n'est pas fixé, sans le mot « dépôt » ;
   - les cinq interdits de `discours.test.ts` tiennent : aucune durée en secondes,
     aucun « hors ligne », aucun tarif, aucune affirmation juridique, aucun compte
     d'inscrits ;
   - vouvoiement, phrases courtes, pas de superlatif ; le ton est celui de l'accueil
     actuel, qui est bon ; c'est la précision technique qu'on retire, pas la retenue.
5. **Le mouvement** 2 et 3 (§8). Le mouvement 1 existe.

Les commentaires de tête de `vitrine.css` sont réécrits : la convention des trois
traits déménage dans `releve.css` (c'est désormais celle de tout le produit), et
`vitrine.css` ne garde que ce qui est propre à la vente (la grille calée à gauche, le
relevé en bande, les deux aplats d'encre et pas trois).

## 10. Contraintes tenues, tests touchés, documentation

### 10.1 Contraintes qu'aucun test ne voit (à vérifier au navigateur)

- Trois politiques pour une même feuille : `img-src 'self'` sans `data:` sur `/p/` et la
  vitrine, donc **aucune `url(data:)` en CSS** ; `style-src 'self'` sans
  `'unsafe-inline'` sur la vitrine, donc **aucun `style` inline dans `_vitrine/`** ni
  dans `PageErreur`. Vérification : Chromium piloté, écoute de `securitypolicyviolation`
  sur les cinq pages de vitrine, une dizaine d'écrans d'app, la page d'un lien (plan
  compris), la page d'erreur.
- La coquille hors ligne : les polices sous `/assets/` (§4). `VERSION` de `public/sw.js`
  passe de `"v2"` à `"v3"`, et `COQUILLE` de `app/lib/capture/coquille.ts` avec elle
  (`tests/pwa/coquille.test.ts` compare les deux).
- Le déclencheur de capture reste un `<label>` (iOS).

### 10.2 Tests qui changent

| Test | Changement |
|---|---|
| `tests/serveur/application.test.ts` | + `font-src 'self'` attendu sur `/p/` et `/P/` |
| `tests/pwa/coquille.test.ts` | rien à changer, il lit la version des deux côtés |
| `tests/vitrine/discours.test.ts` | rien à changer ; la nouvelle copie doit le passer |
| `tests/vocabulaire.test.ts` | rien à changer ; balaye aussi les `.css`, donc « pièce » n'apparaît dans aucun commentaire des trois feuilles |
| `tests/exports-routes.test.ts` | rien à changer ; `Picto`, `Echelle` et tout nouveau composant vivent dans `app/components/` |
| `tests/vitrine/etancheite.test.ts` | rien à changer ; `Picto.tsx` et `Echelle.tsx` n'importent rien |

Aucun test nouveau sur le CSS : il n'y a pas de DOM de test (`environment: "node"`) et
en ajouter un est un choix d'outillage hors périmètre. Ce qui tient lieu de test est le
protocole de vérification au navigateur (§11).

### 10.3 Documentation

- `README.md` : la section sur `app/styles/app.css` (« feuille unique ») décrit les
  trois feuilles ; la décision #23 est amendée ; la décision #143 reçoit un
  renvoi vers la nouvelle décision ; une décision est ajoutée (« Le relevé, de la
  vitrine à la fiche ») avec les deux renversements (#143, la clause « police système »
  de #8) et la raison ; « Limites connues » ajoute `font-src 'self'` sur `/p/` ; la
  revue de fuite ne change pas (aucune surface nouvelle ne rend une donnée de la base).
- `CLAUDE.md` : un paragraphe « Le relevé » dans Architecture (les trois feuilles, les
  jetons dans `releve.css`, les trois traits, les polices sous `app/styles/polices/`,
  ce qui est interdit par arbre) ; la mention de `app/components/vitrine/Echelle.tsx`
  suit le déplacement.
- `.decisions/implementation-plan.md` : la ligne de la décision #8 reçoit une note
  « police système remplacée le 2026-09-15, voir README ». Le reste du plan ne bouge pas.

## 11. Découpage et vérification

Une issue (« Refonte visuelle commune : le relevé, de la vitrine à la fiche », label
`feature`), une branche `feat/releve-commun`, une PR à la fin (`feat(style): le relevé,
de la vitrine à la fiche`). Un commit par phase, chacune laissant `npm run typecheck`,
`npm test` et `npm run build && npm run verifier:bundle` verts :

1. **Le socle** : `releve.css` (jetons, polices, primitives, focus, mouvement 4),
   polices sous `app/styles/polices/`, `root.tsx` sert les deux feuilles, `font-src`
   sur `/p/` et son test, `VERSION` v3, `Echelle` déplacée. À ce stade l'app change
   déjà de polices et de boutons sans être redessinée.
2. **La vitrine** : `vitrine.css` réécrite sur les primitives, `Picto.tsx`, les cinq
   pages réécrites, mouvements 2 et 3. Captures à 375, 768, 1440.
3. **La charpente et l'accueil** : `layout.tsx` (marge, `.app`), accueil, recherche,
   résultats, facettes (renommage `etiquette`), connexion et inscription, `PageErreur`.
4. **Formulaires, fiches et structure** : les 17 routes sans classe, `.formulaire`,
   `.niveau-choix`, fiche d'objet, garanties, types, `ChampEditor`,
   `DynamicElementFields`.
5. **Plans, historique, partages, démarrage, capture** : `VuePlan`, `PlanStatique`,
   `EditeurImagePlan`, chronologie, formulaires d'événement et d'intervenant, partages,
   démarrage, feuille et sélecteur de capture, indicateurs, mouvements 5, 6, 7.
6. **La page d'un lien** : `PagePartage`, `FicheObjet`, `FicheEvenement`,
   `PageHistorique`, `FacettesLiens`, en-tête avec l'échelle. Captures à 375 et 720.
7. **Documentation et revue** : README, CLAUDE.md, plan ; retrait de `tab360b.png` ;
   passage `securitypolicyviolation` sous les trois politiques ; passage en « réduire
   les animations » ; suppression de tout `.v-*` et `--v-*` orphelin.

Critères de fin :
- les trois commandes passent (les quatre échecs Windows connus de `lire-env.test.ts`
  exceptés) ;
- aucune violation de politique sur les écrans listés en §10.1 ;
- aucun débordement horizontal à 320 px sur les cinq pages de vitrine, l'accueil de
  l'app, une fiche, le plan, la page d'un lien ;
- aucune occurrence de `--v-`, `.v-cote`, `.v-appel`, `.v-echelle`, `.v-pastille`,
  `.v-coches` ni de `--accent`, `--fond`, `--surface`, `--trait`, `--texte-doux`,
  `--rayon` dans `app/` ;
- aucun `border-radius` hors cercles, aucun `box-shadow` hors la feuille et les points,
  aucune `url(data:` dans les trois feuilles ;
- les cinq pages de vitrine relues à voix haute une fois : pas un mot du dépôt.
