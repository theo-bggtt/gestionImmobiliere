# Prompt — Étape 4 : le plan, phase 1

> À coller dans une session Claude Code à la racine du dépôt, sur `master` à jour (la PR #8 doit être mergée).
> Lis d'abord `.decisions/implementation-plan.md`, puis `README.md` et `CLAUDE.md` pour l'état du code.
>
> **Modèle conseillé : `opus`, effort `high`.** L'étape est courte en volume mais elle rouvre la surface de fuite de l'étape 3 sous une forme nouvelle : une géométrie divulgue autant qu'un compte.

---

## Ce que fait cette étape

Aujourd'hui, retrouver un objet passe par la recherche ou par la grille de zones. Cette étape ajoute la deuxième entrée, celle qui répond à « c'est où » sans avoir à savoir comment ça s'appelle : le propriétaire téléverse le plan de chaque niveau, y pose des points, et un point mène à une fiche.

Trois usages réels :

- **Le propriétaire pose un point** en trente secondes après une capture : la vanne d'arrêt existe déjà comme fiche, il lui donne une position.
- **L'artisan ouvre le lien de partage** et voit le tableau électrique sur le plan du sous-sol, sans avoir à lire une description de couloir.
- **Le jardinier ouvre le plan de situation**, la vue aérienne de la parcelle, et voit la vanne d'arrosage et le regard. Aucun plan d'étage.

## Ce qui existe déjà et qu'il faut brancher

- **Les trois tables sont en base depuis l'étape 0, inutilisées** (`app/db/schema/plans.ts`) :
  - `plan` : `type` (`etage` | `situation`), `niveauId` **NULL si `situation`**, `imageFichierId`, `echelle`, `ordre`
  - `point` : `elementId`, `planId`, `x`, `y` — **pas d'unicité sur `elementId`**, c'est délibéré, un objet traversant plusieurs niveaux porte un point par plan
  - `zone_geom` : `polygone` jsonb, PK `(zoneId, planId)` — **tu ne l'alimentes pas**, c'est l'étape 6. Tu la lis si elle est remplie, tu ne construis aucun éditeur de tracé.
- **`traiterImage`** (`app/lib/images/traitement.server.ts`) fait déjà orientation EXIF → effacement → vignette. Réutilise-le, ne le réécris pas. Il te faudra le **paramétrer** (voir plus bas).
- **`sauvegarder` / `lire` / `cheminVignette`** (`app/lib/stockage/fichiers.server.ts`) est la seule interface de stockage. Rien d'autre ne touche au disque.
- **`Portee`, `clausePortee`, `porteeRestreinte`** (`app/lib/recherche/recherche.server.ts`) et **`porteeDuPartage`** (`app/lib/partage/partage.server.ts`) sont le modèle de visibilité. Toute nouvelle requête sur `element` prend une `Portee` en paramètre. Sans exception.
- **`chargerRessourceOu404`** (`app/lib/db/scopedResource.server.ts`) pour `plan`, qui porte `proprieteId` directement. `point` ne l'a pas : il rejoint la propriété par `plan`, à traiter à la main comme `niveau` l'est dans `zoneTree.ts`.
- **`liensPropriete` / `liensPartage`** (`app/components/recherche/liens.ts`) : les composants partagés prennent des liens pré-construits, jamais un `proprieteId`. Le composant de plan suit la même règle, c'est ce qui empêche la page de partage d'écrire une URL protégée.

## Ce qu'il faut construire

### 1. Téléverser un plan

- Un plan par niveau, plus un plan de situation par propriété, avec un `ordre` pour le cas où un niveau en a deux (le plan de l'architecte et le relevé de l'électricien).
- **Recadrage et rotation** avant enregistrement. Le propriétaire photographie un plan posé sur une table : il doit pouvoir couper les bords et redresser de quelques degrés.
- L'image passe par `traiterImage`, donc EXIF effacé, comme toute image de l'application.
- Remplacer l'image d'un plan **ne déplace aucun point** — c'est tout l'intérêt des pourcentages. Un test doit le prouver.

### 2. Poser et déplacer les points

- Depuis une fiche : « placer sur un plan » → choisir le plan → cliquer.
- Depuis le plan : voir les points existants, en déplacer un, en retirer un.
- **`x` et `y` sont des pourcentages de l'image, entre 0 et 100**, jamais des pixels. La contrainte va **en base** (`CHECK`), pas dans la validation de formulaire — même raisonnement que `element.zone_id NOT NULL` à la règle #1.
- Un élément déjà placé sur un plan reste plaçable sur un autre. L'interface le montre plutôt que de l'interdire : « déjà sur Sous-sol ».

### 3. Consulter le plan, côté propriétaire

- Sélecteur de niveau **trié par `niveau.ordinal`** (l'entier signé, pas le nom), plus une entrée « situation » pour la parcelle.
- Zoom et déplacement. **Sans bibliothèque** : `transform` CSS et les événements pointeur suffisent, y compris le pincer-zoomer. N'ajoute pas de dépendance pour ça.
- **Regroupement quand dézoomé** : quand deux points sont à moins de N pixels *à l'écran*, ils fusionnent en une pastille comptée qui déplie au clic. Grille en coordonnées écran, déterministe, calculée côté client. Pas de bibliothèque de clustering.
- Un point mène à la fiche.

### 4. Le plan sur la page de partage — la partie qui compte

La page de partage porte `handle.sansScripts` : **elle n'exécute aucun JavaScript**. Ça ne change pas à cette étape. Donc :

- Le plan y est **statique** : une `<img>` et des `<a>` positionnés en `left`/`top` en pourcentage. Pas de zoom, pas de regroupement, pas de survol. C'est suffisant, et c'est le prix de la règle #7 de l'étape 3.
- **Un point est un élément.** Il passe par `clausePortee` comme tout le reste. Un élément au-dessus du plafond ou hors portée n'a pas de point sur le plan servi, et il ne laisse pas de pastille grise « 1 objet masqué ».
- **Un plan dont aucune zone n'est visible n'est pas listé.** Un sélecteur de niveau qui montre « Sous-sol » à un jardinier lui apprend qu'il y a un sous-sol.
- **La géométrie divulgue.** Si `zone_geom` est remplie un jour, les polygones des zones hors portée ne sont pas servis. À cette étape la table est vide, mais écris la requête filtrée maintenant plutôt que de compter sur l'étape 6 pour y penser.
- **L'image du plan n'est pas une photo de fiche.** La route `/p/:jeton/fichiers/:fichierId` accorde aujourd'hui la lecture d'un fichier parce que **la fiche liée** passe `clausePortee` (`chargerFichierPartage`). Un plan est rattaché par `plan.image_fichier_id`, pas par `fichier_lien` : il tomberait en 404. Il faut donc un second chemin d'autorisation — le fichier est l'image d'un plan **listé dans la portée du partage** — et pas un contournement du premier. Écris-le comme une branche explicite et nommée, pas comme un `OR` glissé dans la requête.

### 5. Le plan de situation

`type = 'situation'`, `niveau_id` NULL, couvre les zones extérieures. À cette étape c'est **une image que le propriétaire téléverse**, comme n'importe quel autre plan : un extrait cadastral, une capture, un croquis. Aucun appel réseau, aucune dépendance externe. Les orthophotos swisstopo restent un chantier séparé du plan d'implémentation ; ne les branche pas ici, et ne pose pas de code d'attribution « en prévision ».

## Décisions à prendre et à documenter

Trois points où le plan d'implémentation dit ce qu'il veut sans dire comment. **Tranche, applique, et écris le pourquoi dans la section « Décisions prises » de `README.md`.** Si tu penses qu'une de ces décisions devrait me revenir, arrête-toi et demande plutôt que de choisir en silence.

1. **Le PDF.** Le plan dit « PDF ou photo ». Il n'y a aucune bibliothèque PDF dans le projet, et `sharp` n'en lit pas. Les options sont : rasteriser côté serveur (dépendance native, image Docker plus lourde), rasteriser côté navigateur avec pdf.js avant l'envoi (~1 Mo de JS, mais le serveur reste propre et le traitement d'image côté client existe déjà pour la capture), ou n'accepter que des images à cette étape et reporter le PDF. Choisis, et dis ce que tu écartes.

2. **Le redressement.** `sharp` sait faire une rotation et une transformation affine, **pas une homographie** : la correction de perspective à quatre coins n'est pas gratuite. Décide si « redressement » veut dire rotation de quelques degrés (suffisant pour une photo prise à peu près en face, et faisable tout de suite) ou correction de perspective complète, et assume le coût de ce que tu choisis. Ne prétends pas faire la seconde en faisant la première.

3. **La résolution.** `LARGEUR_MAX` vaut 2000 px, calibré pour une photo d'objet. Un plan d'étage à 2000 px zoomé sur un couloir est illisible. Paramètre `traiterImage` plutôt que de dupliquer la fonction, et justifie le plafond que tu retiens pour les plans.

## Règles non négociables

1. **Un point est un élément.** Aucune requête sur `point` qui ne joigne `element` et ne passe la `Portee`.
2. **Compter, c'est divulguer** — la règle de l'étape 3 s'applique à la géométrie : pastille de regroupement, sélecteur de niveau, liste des plans, polygones.
3. **Filtré = 404, jamais 403**, pour un plan comme pour une fiche.
4. **La page de partage ne charge toujours aucun JavaScript.** Si le plan interactif t'y semble nécessaire, la réponse est non ; le plan statique est la réponse.
5. **`x` et `y` en pourcentage, contrainte en base.**
6. **`zone_geom` n'est pas alimentée à cette étape.**
7. **Ni adresse, ni EGID, ni identifiant de propriété** sur la page de partage — y compris dans le nom d'un plan téléversé, que le propriétaire saisit librement. Réfléchis à ce que ça implique et dis-le, ne le corrige pas en douce.
8. **Le vocabulaire visible est « zone » ou « lieu », jamais « pièce ».** `tests/vocabulaire.test.ts` le vérifie ; un plan d'étage est exactement l'endroit où le mot revient tout seul.
9. **Français partout**, pas d'alias de chemin, commentaires qui disent pourquoi. Comme le reste du dépôt.

## Ce qu'il ne faut PAS construire

Éditeur de tracé de polygones (étape 6), déduction automatique de la zone d'un point (étape 6), mesures et échelle réelle, éditeur de plan vectoriel, import IFC/DXF, orthophotos swisstopo, photo annotée par points, chronologie et garanties (étape 5). **Le modèle reste compatible, tu ne l'implémentes pas.**

Le champ `plan.echelle` existe et reste NULL : il n'y a aucune mesure à cette étape.

## Critères d'acceptation

Chacun doit être couvert par un test.

- [ ] Un plan téléversé est enregistré sans EXIF, recadré et pivoté selon ce qui a été demandé
- [ ] Remplacer l'image d'un plan par une image de dimensions différentes ne déplace aucun point
- [ ] `x` ou `y` hors de [0, 100] est refusé **par la base**, pas seulement par le formulaire
- [ ] Un élément peut porter un point sur deux plans différents ; supprimer l'un ne touche pas l'autre
- [ ] Le sélecteur de niveau est trié par `ordinal`, pas par nom ni par identifiant, et le plan de situation y a sa place à part
- [ ] Sur la page de partage, un élément hors portée ou au-dessus du plafond n'a **ni** point, **ni** pastille de regroupement, **ni** trace dans un compte
- [ ] Un plan dont aucune zone n'est visible dans la portée n'apparaît pas dans le sélecteur de niveau du partage
- [ ] L'image d'un plan hors portée répond **404** via la route à jeton ; celle d'un plan dans la portée est servie
- [ ] La page de partage avec plan se charge toujours sans session et sans JavaScript
- [ ] Une propriété sans aucun plan ne casse aucun écran, côté propriétaire comme côté partage
- [ ] Les 79 tests existants passent toujours

## Workflow GitHub

Comme aux étapes précédentes, et comme décrit dans `CLAUDE.md` :

- Label `etape-4`, **milestone « Étape 4 »** créé au démarrage
- Une issue pour l'étape avec ses critères d'acceptation en cases à cocher ; une issue séparée pour tout défaut trouvé en cours de route qui n'est pas une pièce de l'étape
- Branche `feat/etape-4-plan`, PR vers `master` rattachée au milestone, `Closes #N` dans le corps
- `npm run typecheck` et les tests passent avant l'ouverture de la PR

## Attendu en fin de tâche

Mise à jour de `README.md` et de `CLAUDE.md` : le modèle plan/point, le choix des pourcentages et sa raison, le second chemin d'autorisation de la route à jeton pour les images de plan, et les trois décisions ci-dessus dans la section « Décisions prises ».

**Et l'extension de la « revue de fuite »** de l'étape 3 : ajoute au tableau chaque nouvelle surface qui rend une donnée dérivée de la base sur la page de partage — point, pastille de regroupement, entrée du sélecteur de niveau, nom de plan, image de plan, polygone — et dis pour chacune comment elle est filtrée. Si une seule ne l'est pas, dis-le dans le corps de la PR plutôt que de la corriger en silence. Je veux voir la liste, pas la conclusion.
