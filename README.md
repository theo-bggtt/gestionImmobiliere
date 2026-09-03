# gestionImmobiliere — étape 1 : la capture

Mémoire technique d'un bien immobilier. L'étape 0 a posé les fondations (schéma complet, authentification, catalogue de types, CRUD avec formulaire dynamique). Cette étape ajoute ce qui décide si le projet existe encore dans un an : **capturer un objet en moins de 30 secondes, sans réseau, appareil photo en premier**. Pas de recherche dédiée, pas de partage, pas de plan — voir `.decisions/implementation-plan.md` pour la suite.

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

L'application applique ses migrations automatiquement au démarrage (`scripts/migrate.mjs`) et écoute sur `http://localhost:3000`. Les photos sont écrites dans le volume `fichiers_data`, monté sur `/donnees`. La base est vide : voir "Charger les données" ci-dessous.

## Démarrage (développement local, hors Docker pour l'app)

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

Le service worker n'est enregistré qu'en production (Vite sert des centaines de modules non versionnés en développement). Pour éprouver le hors ligne, il faut donc un build :

```bash
npm run build
NODE_ENV=production node --env-file=.env server/app.js
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

---

## La capture

### Le flux

Deux déclencheurs vivent dans une barre fixée en bas de **tous** les écrans authentifiés, y compris l'écran d'accueil : ils sont donc toujours à un geste.

- **Nouvel objet** (cas A) — l'objet n'existe pas encore.
- **Objet existant** (cas B) — l'entretien : je viens de changer le filtre, je documente. Aussi accessible depuis la fiche, où l'objet est alors déjà connu.

Chaque déclencheur est un `<label>` qui porte un `<input type="file" accept="image/*" capture="environment">` : **le viseur s'ouvre sur le geste lui-même**, sans navigation ni JavaScript intermédiaire. C'est la seule façon fiable sur Safari iOS, où un `click()` programmatique après un changement de route est bloqué faute de geste utilisateur.

La photo prise, une feuille de confirmation se superpose à l'écran courant — toujours pas de navigation, pour ne pas perdre le `File` ni payer un aller-retour serveur qu'on n'a pas à la cave :

1. **Zone**, pré-remplie par la dernière zone utilisée (mémorisée localement ; à défaut, la zone la plus récemment capturée d'après l'instantané serveur).
2. **Type**, pré-rempli par le type le plus posé dans cette zone ; à défaut le type le plus récemment utilisé. Changer la zone re-propose le type, tant que l'utilisateur n'en a pas choisi un lui-même.
3. **Nom** généré (« Prise 230V — Chambre 2 »), affiché sous les deux lignes, modifiable d'un tap. Jamais à saisir.
4. **Enregistrer**.

Les deux sélecteurs s'ouvrent en plein écran, récent en tête, avec un champ de filtre qui cherche aussi dans les alias du catalogue — **jamais autofocus** : faire surgir le clavier coûterait une seconde à qui accepte les valeurs proposées.

**Aucun champ du type n'est demandé.** La fiche est créée avec `details` vide et `niveau = 3` (privé). Les caractéristiques se remplissent plus tard, à tête reposée, par le formulaire dynamique de l'étape 0.

### Chronométrage

#### Ce qui a été mesuré

Build de production, Chromium piloté, viewport 414×896, **mode avion réel** (réseau coupé au niveau du navigateur, pas seulement le serveur arrêté), catalogue et arborescence de la propriété d'exemple. Photos sources : 4000×3000, orientation EXIF 6, 3,9 à 5,5 Mo.

| # | Scénario | Rendu de la feuille | Enregistrement | **Part applicative** | Gestes après la photo | Clavier |
|---|---|---|---|---|---|---|
| 1 | valeurs proposées acceptées | 1 ms | 182 ms | **183 ms** | 1 | non |
| 2 | zone changée (Chambre 2 → Cuisine) | 1 ms | 12 ms | **13 ms** | 3 | non |
| 3 | valeurs proposées acceptées | 1 ms | 164 ms | **165 ms** | 1 | non |

*Rendu de la feuille* = de l'arrivée de la photo à l'affichage de l'aperçu. *Enregistrement* = du tap sur « Enregistrer » à la confirmation à l'écran, écriture dans la boîte d'envoi comprise.

Compression mesurée à part : **132 à 137 ms** pour une 4000×3000 sur cette machine. Elle démarre à l'instant où la photo arrive et tourne pendant que la feuille est à l'écran, donc hors du chemin critique. Sur un téléphone, compter 4 à 8 fois plus, soit 0,5 à 1,1 s — toujours terminé avant que le doigt n'atteigne « Enregistrer ».

#### Ce qui n'a PAS été mesuré, et pourquoi

**Aucune de ces trois captures n'a été faite sur un vrai téléphone avec un vrai appareil photo.** Le pilotage automatique remplace `<input capture>` par un fichier local, ce qui court-circuite précisément l'étape la plus longue : ouverture de l'appareil photo natif, cadrage, déclenchement, retour à l'application. Le temps de réaction humain entre deux taps n'est pas mesuré non plus.

Autrement dit, les chiffres ci-dessus disent ce que coûte le **logiciel**, pas ce que coûte la **capture**.

#### Le reste du budget, annoncé comme un budget

| Poste | Secondes | Origine |
|---|---|---|
| Tap sur « Nouvel objet » | 1,0 | estimation |
| Ouverture de l'appareil photo natif | 1,0 – 2,0 | estimation |
| Cadrage et déclenchement | 3,0 – 6,0 | estimation |
| Retour à l'app, aperçu affiché | 0,5 | mesuré côté app (1 ms) + estimation OS |
| Lecture de la feuille, décision | 2,0 – 3,0 | estimation |
| *(si la zone change : 2 taps + parcours de la liste)* | *+3,0 – 5,0* | estimation |
| Tap sur « Enregistrer » | 1,0 | estimation |
| Écriture et confirmation | 0,2 | **mesuré** |
| **Total, valeurs acceptées** | **8,7 – 13,7** | |
| **Total, zone changée** | **11,7 – 18,7** | |

#### Verdict

La part logicielle du chronomètre est de **0,2 seconde**. Elle ne peut pas, dans son état actuel, faire échouer le critère des 30 secondes : il resterait 29,8 s au geste humain et à l'appareil photo, soit deux fois le budget estimé le plus pessimiste. Le nombre de gestes après la photo — **un seul** quand les valeurs proposées conviennent, trois quand on change de zone — est le vrai levier, et il est au plancher.

**Mais le critère demande trois captures réelles, et elles restent à faire.** Le tableau ci-dessous est à remplir sur un téléphone, chronomètre en main, avant de considérer l'étape close. Si l'une dépasse 30 secondes, c'est le flux qu'il faut retravailler, pas la mesure.

| # | Zone | Type | Valeurs acceptées ? | Secondes | Appareil / navigateur |
|---|---|---|---|---|---|
| 1 | | | | *à remplir* | |
| 2 | | | | *à remplir* | |
| 3 | | | | *à remplir* | |

### La boîte d'envoi

Éphémère, jamais un stockage. Une entrée n'y vit qu'entre la capture et l'accusé de réception du serveur.

**Compression avant écriture.** `createImageBitmap(fichier, { imageOrientation: "from-image" })` pivote les pixels d'après l'EXIF, le canvas ré-encode à 2000 px sur le grand côté en JPEG qualité 0,8, et n'écrit aucune métadonnée. Ce qui entre dans IndexedDB est donc déjà droit et déjà nettoyé. Mesuré : **une photo de 4 114 035 octets (3,92 Mo) occupe 443 919 octets (434 Ko)** dans la file, en 1500×2000. Sur une image de bruit pur (pire cas, 5,05 Mo), 611 Ko.

**Déclencheurs d'envoi**, dans cet ordre de préférence :

1. immédiatement après chaque capture ;
2. au retour au premier plan (`visibilitychange`) ;
3. à l'évènement `online` ;
4. **toutes les 30 s tant que la file n'est pas vide.**

Le quatrième n'était pas prévu. Il a été ajouté après avoir mesuré que `navigator.onLine` peut rester à `true` alors que tout `fetch` échoue : dans ce cas l'évènement `online` ne part jamais au retour du réseau, et une file pleine attendrait indéfiniment. `navigator.onLine` sert donc à déclencher, jamais à décider. Il n'y a de toute façon pas de Background Sync sur iOS.

**Purge** dès l'accusé de réception du serveur, pas plus tard.

**Une capture n'est jamais perdue en silence.** Rien n'est supprimé sans confirmation serveur. Un `fetch` qui lève (pas de connexion) n'est pas compté comme une tentative — sinon trois captures dans une cave suffiraient à faire crier au loup. Seul un refus du serveur compte : un 4xx est définitif, un 5xx incrémente. Au bout de 5 tentatives, l'entrée bascule en erreur visible avec son message et un bouton « Réessayer ». Tant que la file n'est pas vide, un indicateur « n en attente » reste dans l'en-tête, avec un envoi forçable.

**Doublons.** Le client fabrique un `captureId` avant d'écrire dans la file ; il est stocké en `fichier.capture_id` sous index unique. Un réseau mobile qui coupe après l'écriture serveur mais avant la réponse fait rejouer l'envoi : le serveur reconnaît la capture et renvoie la fiche existante au lieu d'en créer une seconde.

### Traitement des images côté serveur

Le client a beau envoyer une image déjà propre, on ne fait pas confiance à ce qui arrive du réseau : le serveur refait le travail.

`sharp(...).rotate()` applique l'orientation EXIF, puis le ré-encodage n'écrit aucune métadonnée — **l'ordre est garanti par la bibliothèque**, effacer avant de pivoter serait impossible ici. Un original à 2000 px et une vignette à 400 px sont écrits derrière l'interface de stockage (`sauvegarder`, `lire`, `supprimer`, `cheminVignette` dans `app/lib/stockage/`) : un passage à S3 plus tard ne touchera que ce fichier. `fichier.exif_efface` est mis à `true`.

Vérifié sur les octets, pas à l'œil (`tests/images/traitement.test.ts`) : ni segment APP1 (`0xFFE1`), ni chaîne `Exif\0\0`, ni marque de l'appareil, et une source 1200×800 en orientation 6 ressort en 800×1200.

Les images ne sont jamais servies par un chemin public devinable : `GET /proprietes/:proprieteId/fichiers/:fichierId` (`?taille=vignette`), scopée propriété comme le reste de `_app`.

### PWA et hors ligne

Manifeste, icônes (dont une *maskable*), `display: standalone`, `start_url: "/"`.

Le service worker (`public/sw.js`) tient en trente lignes : documents en réseau-d'abord avec repli sur le cache, actifs `/assets/` en cache-d'abord. Il ne met **pas** en cache les images ni les données de capture — les premières sont privées, les secondes ont déjà leur copie dans IndexedDB.

Un piège à connaître : **React Router navigue en SPA**, donc après la connexion plus aucune requête de document n'est émise et le service worker ne voit jamais passer la coquille qu'il est censé garder. C'est la page qui l'amorce elle-même (`app/lib/capture/coquille.ts`) : elle met `/` en cache et y ajoute les actifs que la page vient réellement de charger, relevés dans `performance.getEntriesByType("resource")` — pas de manifeste de build à tenir à jour.

Vérifié : réseau coupé au niveau du navigateur, l'app démarre depuis le cache, mise en page comprise ; trois captures d'affilée sont mises en file ; réseau rétabli **sans aucune action utilisateur**, la file se vide et les fiches sont en base.

**iOS n'a pas d'invite d'installation** ni de `beforeinstallprompt`. Une aide « Partager → Sur l'écran d'accueil » s'affiche une fois, sur Safari iOS uniquement, quand l'app n'est pas déjà installée.

### Sur la fiche

L'écran d'une fiche montre ses photos, la plus récente en premier, et un bouton « Ajouter une photo » qui relance le flux pré-lié à cet objet. Une capture partie pendant que la fiche est ouverte y apparaît toute seule.

## Structure des dossiers

- `app/db/schema/` — schéma Drizzle, une table (ou un petit groupe de tables liées) par fichier.
- `app/lib/auth/` — hachage, cookie, sessions.
- `app/lib/forms/` — validation des `details` dynamiques contre `type_element.champs`.
- `app/lib/capture/` — instantané hors ligne (`instantane.server.ts` le produit, `instantane.ts` le recopie), boîte d'envoi IndexedDB (`file.ts`), compression (`image.ts`), synchro (`synchro.ts`), amorçage de la coquille (`coquille.ts`).
- `app/lib/images/` — orientation puis effacement EXIF, vignette.
- `app/lib/stockage/` — interface `sauvegarder` / `lire` / `supprimer`, adossée au système de fichiers.
- `app/lib/zoneTree.ts` — construction de l'arbre bâtiment → niveau → zone (+ zones extérieures).
- `app/components/` — `ZoneSelector`, `DynamicElementFields`, `ChampEditor`, `AideInstallationIOS`.
- `app/components/capture/` — `Capture` (déclencheur, feuille, confirmation), `Selecteur`, `IndicateurFile`.
- `app/styles/app.css` — feuille unique, sobre, dimensionnée pour le pouce.
- `app/routes/_public/` — connexion, inscription, déconnexion (non protégé).
- `app/routes/_app/` — tout le reste, protégé, scopé par `proprieteId` dans l'URL. La future page de partage publique (`/p/:jeton`, étape 3) prendra place dans un arbre `_share` séparé.
- `public/` — manifeste, icônes, service worker.
- `scripts/` — migration au démarrage, seeds.
- `tests/` — tests d'intégration base de données, traitement d'images, réception d'une capture, vocabulaire.

## Décisions prises (non spécifiées par le prompt d'étape)

### Étape 0

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

### Étape 1

16. **Le viseur passe par `<input type="file" capture="environment">` dans un `<label>`**, pas par `getUserMedia`. Le `label` porte le clic natif jusqu'à l'input : c'est ce qui garantit que l'appareil photo s'ouvre sur le geste, y compris sur Safari iOS, où un déclenchement programmatique après navigation serait refusé. Effet secondaire utile : on récupère la photo pleine résolution de l'appareil photo système, sans réimplémenter un viseur.
17. **Aucune navigation pendant la capture.** La feuille de confirmation est une surcouche portée par le même composant. Changer de route perdrait le `File` et coûterait un chargement, précisément là où il n'y a pas de réseau. Corollaire : « retour à l'écran d'accueil » après enregistrement se traduit par « fermeture de la surcouche », ce qui rend l'écran d'où l'on vient, quel qu'il soit.
18. **Les deux déclencheurs vivent dans le layout**, en barre fixe, sur tous les écrans authentifiés. Le prompt les veut à un geste de l'écran d'accueil ; les mettre dans le layout les rend à un geste de partout, sans code en plus. La propriété visée est déduite de l'URL, sinon de la dernière visitée, sinon de l'unique propriété du compte.
19. **Un « instantané de capture » est recopié dans IndexedDB** (`/proprietes/:id/capture/donnees`) : zones aplaties avec leur chemin, types avec alias, objets récents, et les classements de récence et de fréquence type-par-zone. La feuille doit se pré-remplir sans réseau ; le calculer côté serveur évite de descendre l'historique complet des éléments sur le téléphone.
20. **`fichier.capture_id`, texte sous index unique** (migration 0004), pour l'idempotence des réessais. C'est la seule colonne ajoutée à cette étape.
21. **La vignette n'a pas de colonne** : son chemin se déduit de celui de l'original (`.vignette.jpg`). Une donnée entièrement dérivée ne mérite pas une migration.
22. **La « fiche » est l'écran `modifier` existant.** Le prompt parle d'une fiche sans en demander une nouvelle, et le lien « compléter » doit mener là où l'on complète. Un écran de consultation séparé viendra avec la recherche (étape 2), s'il se justifie.
23. **Une feuille de style a été ajoutée** (`app/styles/app.css`). L'étape 0 n'avait aucun CSS ; des `<select>` natifs non stylés ne tiennent pas un chronomètre de 30 secondes au pouce. Sobre, une seule feuille, cibles à 56 px.
24. **Le préchargement de la coquille est fait par la page, pas par le service worker.** Mesuré : React Router navigue en SPA, donc après la connexion aucune requête de document ne passe par le service worker et son cache resterait vide. La page met `/` en cache et y ajoute les actifs qu'elle vient de charger, relevés dans `performance.getEntriesByType("resource")` — plutôt qu'un manifeste de build à maintenir.
25. **Pas de repli sur `/` quand un document n'est pas en cache.** Servir l'HTML de l'accueil sous une autre URL ferait échouer l'hydratation et donnerait un écran blanc, pire que la page hors ligne du navigateur. Seul `start_url` est garanti hors ligne, ce qui est exactement le chemin d'entrée de la PWA.
26. **`navigator.onLine` ne sert qu'à déclencher, jamais à décider.** Mesuré à `true` alors que tout `fetch` échouait. Deux conséquences : un `fetch` qui lève n'est pas compté comme une tentative ratée, et une relance périodique (30 s, uniquement tant que la file n'est pas vide) complète les déclencheurs prévus par le prompt.
27. **Le passage par `/connexion` purge la coquille en cache, mais pas la boîte d'envoi.** Y arriver signifie déconnexion ou session expirée : les pages authentifiées gardées en cache n'ont plus rien à faire là. La file, elle, contient des captures que personne n'a encore vues passer — la vider serait exactement la perte silencieuse que la règle interdit.
28. **Les modules navigateur ne portent pas le suffixe `.client`.** C'est une convention React Router : un module `*.client.ts` est remplacé par du vide côté serveur, ce qui casse le rendu SSR de tout composant qui en lit un export. Ils sont simplement écrits pour ne toucher aucune API navigateur au niveau module.
29. **Le lien « compléter » n'est actif qu'après confirmation du serveur.** Hors ligne, la fiche n'a pas encore d'identifiant : la confirmation affiche « envoi en attente » et devient un lien dès que la capture est partie. Inventer une URL qui ne répondrait pas serait pire que d'annoncer l'attente.
30. **Le cas B depuis l'accueil ne pré-remplit pas l'objet.** Le prompt n'impose de pré-remplissage que pour la zone et le type. Deviner l'objet d'un entretien est un pari le plus souvent perdant, et une photo rattachée au mauvais objet coûte plus cher que le tap qu'elle économise : le sélecteur d'objet s'ouvre donc directement après la photo. Depuis la fiche, où l'objet est connu, il reste un seul geste.

## Limites connues

- **Hors ligne, seul `start_url` est garanti.** Suivre un lien dans l'app sans réseau échoue : React Router demande alors ses données de route au serveur. La capture, elle, ne navigue pas — c'est ce qui compte à cette étape.
- **Le chronométrage sur téléphone réel reste à faire** (voir plus haut).
- Le sélecteur de zone du formulaire de l'étape 0 (`ZoneSelector`) est un `<select>` sans libellé visible sur l'écran de modification. Constaté, pas corrigé : hors du périmètre de cette étape.
