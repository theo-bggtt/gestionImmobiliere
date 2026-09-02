# Prompt — Étape 1 : la capture

> À coller dans une session Claude Code à la racine du dépôt.
> Lis d'abord `.decisions/implementation-plan.md`, puis `README.md` pour l'état du socle.
>
> **Modèle conseillé : `opus`, effort `xhigh`.** Contrairement à l'étape 0, l'essentiel du travail ici est de la conception d'interaction sous contrainte, pas de l'exécution d'une spécification.

---

## Pourquoi cette étape est différente

L'étape 0 était spécifiée jusqu'au nom des colonnes. Celle-ci ne peut pas l'être, parce que sa réussite ne se mesure pas en fonctionnalités livrées mais en **secondes**.

Toutes les applications de gestion de maison meurent du même mal : la saisie. L'utilisateur s'inscrit motivé, remplit deux ou trois zones, comprend qu'il en a pour quinze heures, et ne revient jamais. Le dossier reste à 20 %, donc il ne sert à rien, donc il reste à 20 %.

La réponse retenue est la **capture opportuniste** : on n'enregistre pas la maison, on enregistre ce qu'on manipule, au moment où on le manipule. Je change le filtre de la VMC, je photographie, vingt secondes de contexte, c'est en base.

**Le critère qui décide de tout : de l'ouverture de l'app à la fiche enregistrée, moins de 30 secondes, sans réseau.** Au-delà, la capture opportuniste se comporte comme une session méthodique et le projet est mort. Chaque fois que tu hésites entre deux options dans cette étape, choisis celle qui économise un geste.

## L'état du socle (étape 0, terminée)

Déjà en place, à réutiliser sans redévelopper : React Router v7 + Express, PostgreSQL + Drizzle, authentification argon2 et sessions en base, arbre `propriete > batiment > niveau > zone` avec zones extérieures, catalogue de 33 types système avec alias, CRUD complet, **formulaire dynamique généré depuis `type_element.champs`**, création de types perso, déclencheurs `tsvector`, seeds idempotents.

Les tables `fichier` et `fichier_lien` **existent déjà en base** mais ne sont pas utilisées.

## Ce qu'il faut construire

### 1. PWA installable
- Manifeste, icônes, `display: standalone`
- Service worker : coquille applicative en cache, l'app démarre sans réseau
- **Sur iOS il n'y a pas d'invite d'installation.** Prévois un écran d'aide expliquant « Partager → Sur l'écran d'accueil », affiché une fois, sur Safari iOS uniquement.

### 2. Le flux de capture — le cœur de l'étape

Deux points d'entrée, tous deux atteignables **en un seul geste depuis l'écran d'accueil** :

**A. Nouvel objet** — l'objet n'existe pas encore en base.
**B. Photo sur un objet existant** — le cas de l'entretien : je viens de changer le filtre, je documente.

Séquence imposée pour le cas A :

1. **L'appareil photo s'ouvre immédiatement.** Pas de menu, pas de formulaire d'abord. Le premier écran après le geste d'entrée est le viseur.
2. Photo prise → écran de confirmation unique portant, dans cet ordre : **zone**, **type**, puis un bouton d'enregistrement.
3. **La zone est pré-remplie** par la dernière zone utilisée. Un tap la change, via un sélecteur qui remonte les zones récentes en premier.
4. **Le type est pré-rempli** par le type le plus utilisé dans cette zone ; à défaut, une liste des types récents, avec une recherche qui tape aussi dans les alias.
5. **Le nom est optionnel et généré** : « Prise 230V — Chambre 2 » à partir du type et de la zone. L'utilisateur peut l'écraser, il n'a jamais à le saisir.
6. **Les champs du type ne sont PAS demandés à la capture.** La fiche est créée avec `details` vide. Les caractéristiques se remplissent plus tard, à tête reposée, via le formulaire dynamique existant.
7. Enregistrement → retour à l'écran d'accueil, avec une confirmation discrète et un lien « compléter » vers la fiche.

Le niveau de visibilité par défaut d'une fiche capturée est `3` (privé). On ne demande rien à ce sujet pendant la capture.

### 3. Boîte d'envoi hors ligne

**Contrainte vérifiée : sur iOS il n'existe pas de Background Sync, le quota par origine tourne autour de 50 à 200 Mo, et les caches sont purgés après quelques jours d'inactivité.**

Conséquence directe, à respecter :

- La file locale est une **boîte d'envoi éphémère, jamais un stockage**
- **Compresser avant d'écrire** dans IndexedDB : redimensionner à 2000 px sur le grand côté, JPEG qualité ~0,8. Une photo de téléphone à 4 Mo doit descendre autour de 400 Ko avant d'entrer dans la file.
- Téléverser dès que le réseau revient **et** à chaque retour au premier plan (`visibilitychange`), puisqu'on ne peut pas compter sur un déclenchement en arrière-plan
- **Purger l'entrée de la file dès que le serveur a confirmé**, pas plus tard
- Afficher un indicateur discret « n en attente » quand la file n'est pas vide, et permettre de forcer l'envoi
- Une capture ne doit **jamais** être perdue silencieusement : en cas d'échec définitif, l'utilisateur doit le voir

### 4. Traitement des images côté serveur

- **Appliquer l'orientation EXIF, PUIS effacer toutes les métadonnées.** Dans cet ordre, sinon les photos partent de travers. Les données GPS sont dans l'EXIF et ne doivent jamais survivre.
- Générer une vignette (~400 px) en plus de l'original
- Stocker sur le système de fichiers, dans un volume Docker, **derrière une interface de stockage** (`sauvegarder`, `lire`, `supprimer`) pour qu'un passage à du S3 plus tard ne touche que cette couche
- Servir les fichiers via une route authentifiée, jamais par un chemin public devinable
- Renseigner `fichier` (dont `exif_efface`) et un `fichier_lien` vers l'élément

### 5. Sur la fiche
- Afficher les photos de l'objet, la plus récente en premier
- Bouton « ajouter une photo » qui relance le flux de capture, pré-lié à cet objet (cas B)

## Règles non négociables

1. **Moins de 30 secondes, hors réseau, de l'ouverture à l'enregistrement.** C'est le critère, pas une aspiration.
2. **Aucun pourcentage de complétude.** Ni barre, ni score, ni « il vous reste 47 objets ». En capture opportuniste le dossier n'est jamais complet : mesurer la complétude, c'est afficher un échec permanent.
3. **La capture fonctionne hors ligne de bout en bout.** Cave, vide sanitaire, local technique : c'est là que sont les choses intéressantes et il n'y a pas de réseau.
4. **Compresser avant d'écrire dans IndexedDB**, jamais l'inverse.
5. **Orientation appliquée puis EXIF effacé**, sur toute image, sans exception.
6. **Le vocabulaire visible est « zone » ou « lieu », jamais « pièce ».**
7. **Ne demande aucun champ du type pendant la capture.** C'est la principale tentation et elle tue le chronomètre.

## Ce qu'il ne faut PAS construire

Plans et points sur image, pages de partage et jetons, interface de recherche dédiée, chronologie et événements, rôles `avant`/`après` sur `fichier_lien` et galeries de comparaison, OCR, import RegBL. **Tout cela vient plus tard. Le modèle doit rester compatible, tu ne l'implémentes pas.**

Note : la création de types perso, prévue à l'origine dans cette étape, a déjà été livrée à l'étape 0. Ne la refais pas.

## Critères d'acceptation

- [ ] L'app s'installe sur l'écran d'accueil et démarre sans réseau
- [ ] Mode avion : trois captures d'affilée réussissent et sont mises en file
- [ ] Réseau rétabli et retour au premier plan : les trois partent, la file se vide, les fiches sont en base
- [ ] Une photo de 4 Mo occupe moins de 600 Ko dans IndexedDB
- [ ] Une image servie par l'app ne contient **aucune** métadonnée EXIF (le vérifier avec un outil, pas à l'œil)
- [ ] Une photo prise en orientation portrait s'affiche à l'endroit
- [ ] La zone proposée par défaut est la dernière utilisée
- [ ] Une capture n'exige **aucune saisie clavier** si l'utilisateur accepte les valeurs proposées
- [ ] **Chronométrage documenté dans le README** : trois captures réelles, en secondes, depuis l'écran d'accueil jusqu'à la confirmation. Si une seule dépasse 30 secondes, le flux doit être retravaillé avant de considérer l'étape terminée.
- [ ] Le mot « pièce » n'apparaît nulle part

## Attendu en fin de tâche

Mise à jour du `README.md` : le chronométrage ci-dessus, la stratégie de la boîte d'envoi (compression, déclencheurs de synchro, purge), et une section « décisions prises » listant tout arbitrage non spécifié ici.

Si le chronomètre ne passe pas, **dis-le franchement plutôt que d'ajuster la mesure**. Un flux à 45 secondes qu'on assume est réparable ; un flux à 45 secondes déclaré à 25 ne l'est pas.
