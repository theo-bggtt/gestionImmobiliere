# Prompt — Étape 3 : partager

> À coller dans une session Claude Code à la racine du dépôt.
> Lis d'abord `.decisions/implementation-plan.md`, puis `README.md` et `CLAUDE.md` pour l'état du code.
>
> **Modèle conseillé : `opus`, effort `high`.** C'est la première étape avec une vraie surface de fuite : une erreur y est invisible en revue et visible par un tiers.

---

## Ce que fait cette étape

Le propriétaire crée un **lien de partage** et l'envoie à qui il veut. Le destinataire clique depuis WhatsApp et voit une page, immédiatement, **sans installer quoi que ce soit et sans créer de compte**.

Trois usages réels :

- **Locataire Airbnb** : plafond `usage`. Où sont les prises de la chambre, comment marche l'induction, où sont les poubelles. Lien qui expire au départ.
- **Artisan** : plafond `technique`, portée limitée au système concerné. Il voit le tableau électrique, pas tes factures.
- **Jardinier** : plafond `usage`, portée limitée aux zones extérieures. Il voit la vanne d'arrosage, pas la prise de la chambre.

## Ce qui existe déjà et qu'il faut brancher

- **La table `partage`** est en base depuis l'étape 0, inutilisée : `nom`, `jeton`, `niveau_max`, `portee_zones int[]`, `portee_systemes int[]`, `expire_le`, `revoque_le`.
- **Le filtre de visibilité est déjà écrit dans la requête de recherche**, inerte, avec ses tests. Il s'applique déjà aux facettes et à la grille de zones. Cette étape lui donne enfin des paramètres non triviaux.
- **L'EXIF est déjà effacé au téléversement** (étape 1). Vérifie-le, ne le refais pas.
- **Les arbres de routes publics et protégés sont déjà séparés** (étape 0).

## Ce qu'il faut construire

### 1. Gestion des partages, côté propriétaire

- Créer un partage : nom libre (« Locataires 12-19 août », « Jardinier Marc »), plafond de niveau, portée (zones et/ou systèmes, vide = toute la propriété), date d'expiration
- Lister les partages actifs, avec leur lien, leur portée résumée en clair, et leur date d'expiration
- **Révoquer** un partage (`revoque_le`), sans le supprimer, pour garder la trace
- **Le jeton est aléatoire et long** (32 octets, encodé URL-safe), jamais séquentiel ni dérivé d'un identifiant. Réutilise le raisonnement déjà appliqué à `session.id`.

### 2. La page de partage

Route **`/p/:jeton`**, hors de l'arbre protégé, **rendue serveur**, sans PWA, sans service worker, sans installation.

Contenu, filtré :

- Le **nom** de la propriété. Jamais l'adresse, jamais l'EGID.
- Les zones autorisées, en grille photo comme sur l'accueil
- Les éléments d'une zone, avec leurs photos et leurs champs autorisés
- Un champ de recherche, réutilisant la requête de l'étape 2 avec les paramètres du partage

Style sobre identique à l'application (décision 8) : on retire des éléments, on ne redessine rien.

### 3. Le filtrage — le cœur de l'étape

```
niveau_max      = partage.niveau_max
portee_zones    = partage.portee_zones
portee_systemes = partage.portee_systemes
```

**Compter, c'est divulguer.** Le travail de l'étape 2 a déjà établi ce principe pour les facettes et la grille. Il s'applique ici à tout, sans exception : listes, comptes, facettes, tuiles de zone, suggestions de l'état vide, résultats de recherche, et jusqu'au nombre de photos annoncé sur une fiche.

**`niveau_min` par champ arrive à échéance.** Chaque entrée de `type_element.champs` porte un `niveau_min`, capturé depuis l'étape 0 et **jamais appliqué**, faute de partage. C'est maintenant qu'il sert : un champ dont le `niveau_min` dépasse le plafond du partage ne doit pas être rendu. Concrètement, le numéro de série d'une chaudière (`technique`) reste invisible à un locataire qui voit pourtant la fiche.

### 4. Les images sur la page de partage

La route `fichiers/:fichierId` actuelle est authentifiée par session : elle ne peut pas servir un visiteur anonyme. Il faut une route équivalente **portée par le jeton**, qui vérifie que l'élément lié au fichier passe le filtre du partage avant de servir l'octet.

Un fichier rattaché à un élément filtré doit répondre **404**, pas 403.

### 5. La prévisualisation

Depuis l'écran de gestion : « voir ce que verra le destinataire ».

**Elle doit rendre le composant réel de la page de partage, avec le loader réel et les paramètres réels du partage**, simplement encadré d'un bandeau « prévisualisation ». Une maquette séparée dériverait du vrai rendu, et mentirait exactement le jour où ça compte.

## Règles non négociables

1. **Compter, c'est divulguer.** Aucune surface n'échappe au filtre.
2. **`niveau_min` par champ est appliqué.** La dette de l'étape 0 est due.
3. **Filtré = 404, jamais 403.** Un 403 confirme l'existence.
4. **Jeton inconnu = 404.** Jeton connu mais expiré ou révoqué = page neutre « ce lien n'est plus actif ». La distinction est acceptable : le porteur du lien connaissait déjà le bien.
5. **Ni adresse, ni EGID, ni identifiant de propriété** sur la page de partage.
6. **Aucun secret nulle part.** La règle tient depuis le début et ne bouge pas.
7. **La page de partage ne charge pas le service worker** ni le code de la PWA. Un visiteur ne doit rien installer, rien mettre en cache.
8. **Le vocabulaire visible est « zone » ou « lieu », jamais « pièce ».**

## Ce qu'il ne faut PAS construire

Comptes pour les destinataires, commentaires, notifications, plans et points, chronologie, garanties, rôles avant/après. **Le modèle reste compatible, tu ne l'implémentes pas.**

## Critères d'acceptation

Chacun doit être couvert par un test.

- [ ] Un élément de niveau supérieur au plafond n'apparaît **ni** dans les résultats, **ni** dans un compte, **ni** dans une facette, **ni** dans une tuile de zone
- [ ] Une zone hors portée n'apparaît nulle part, y compris dans les facettes et l'état vide
- [ ] Un champ dont le `niveau_min` dépasse le plafond n'est pas rendu, alors que sa fiche l'est
- [ ] Un fichier rattaché à un élément filtré répond 404 via la route à jeton
- [ ] Un jeton inconnu répond 404 ; un jeton expiré et un jeton révoqué rendent la page neutre
- [ ] La page `/p/:jeton` se charge sans session et sans service worker
- [ ] La prévisualisation emprunte le même chemin de code que la vraie page (le prouver par un test, pas par une affirmation)
- [ ] Un partage de portée vide voit toute la propriété dans la limite de son plafond
- [ ] Aucune adresse ni EGID dans le HTML servi
- [ ] Les 69 tests existants passent toujours

## Attendu en fin de tâche

Mise à jour de `README.md` et de `CLAUDE.md` : la forme du filtre de partage, l'application de `niveau_min`, la route à jeton pour les fichiers, et une section « décisions prises ».

**Et une revue de fuite explicite** : liste chaque surface qui rend une donnée dérivée de la base sur la page de partage (compte, agrégat, suggestion, message d'état vide, métadonnée d'image), et dis pour chacune comment elle est filtrée. Si une seule ne l'est pas, dis-le plutôt que de la corriger en silence — je veux voir la liste.
