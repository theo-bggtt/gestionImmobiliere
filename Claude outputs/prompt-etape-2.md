# Prompt — Étape 2 : retrouver

> À coller dans une session Claude Code à la racine du dépôt.
> Lis d'abord `.decisions/implementation-plan.md` pour le contexte, puis `README.md` pour l'état exact du code.
>
> **Modèle conseillé : `opusplan`, effort `high`.** Contrairement à l'étape 1, celle-ci est largement spécifiée.

---

## Ce qui existe déjà

L'étape 0 a livré toute la **mécanique** de recherche : colonne `element.recherche` en `tsvector` configuration `french`, index GIN, déclencheur sur `element` plus trois déclencheurs de rafraîchissement sur `zone`, `systeme` et `type_element`, champ `alias` sur les fiches et sur les types, catalogue de 33 types avec 94 alias.

**Rien de tout ça n'est exposé dans l'application.** `element.recherche` n'apparaît aujourd'hui que dans le fichier de schéma. Il n'existe aucune route de recherche, aucun champ de recherche, aucune facette.

L'étape 1 a livré la capture, la boîte d'envoi hors ligne, le traitement d'images et les fichiers liés aux éléments.

Cette étape consiste donc à **exposer** ce qui est déjà en base et à refondre l'écran d'accueil, pas à construire un moteur.

## Ce qu'il faut construire

### 1. La requête de recherche (serveur)

- Route de ressource sous `proprietes/:proprieteId`, interrogeant `element.recherche @@ plainto_tsquery('french', :q)`
- **Classement par `ts_rank`**, pas par ordre d'insertion
- Ramener, pour chaque résultat : le nom, la zone, le niveau du bâtiment le cas échéant, le type, le système, et la vignette de la photo la plus récente si elle existe
- **Indiquer pourquoi ça a matché** : `nom`, `alias`, `type`, `zone`, `système` ou `détails`. Le calcul se fait au plus simple, en comparant les termes de la requête aux champs sources ; il n'a pas besoin d'être exact, il doit être utile.
- Pagination ou limite franche, avec un compte total

**Écris dès maintenant le filtre de visibilité**, même s'il n'a aucun effet aujourd'hui :

```sql
WHERE e.propriete_id = :proprieteId
  AND e.niveau <= :niveauMax     -- toujours 3 pour le propriétaire
  AND (:porteeVide OR e.zone_id = ANY(:zones) OR e.systeme_id = ANY(:systemes))
```

L'étape 3 branchera les partages en changeant seulement les paramètres. Si la couture n'est pas posée maintenant, elle coûtera une réécriture de la requête et de ses tests.

### 2. L'écran de recherche

- Champ de recherche, résultats mis à jour à la frappe (avec anti-rebond), navigation au clavier facultative
- Chaque résultat affiche vignette, nom, zone, et une étiquette discrète du motif de correspondance
- **État vide utile** : quand la requête ne donne rien, proposer les types les plus proches par alias plutôt qu'une page blanche
- Un résultat mène à la fiche de l'élément

### 3. L'écran d'accueil, refondu

Aujourd'hui `routes/_app/proprietes.$proprieteId._index.tsx`. Nouvelle composition, dans cet ordre vertical :

1. **Champ de recherche épinglé en haut.** C'est l'élément principal de l'écran.
2. **Grille de zones en photo.** Deux colonnes, vignette carrée, nom de la zone en surimpression, nombre d'objets. L'image d'une zone est **la photo la plus récente rattachée à un élément de cette zone** ; à défaut, un aplat neutre avec l'initiale, jamais une image cassée ni une case vide.
3. Zones intérieures et extérieures dans la même grille, les extérieures en fin de liste.

**Le point d'entrée de la capture doit rester atteignable en un seul geste depuis cet écran.** L'étape 1 l'a placé quelque part ; ne le régresse pas en refondant la page. Si tu le déplaces, il reste à un tap.

### 4. Les facettes

- Filtrage par **système**, **zone** et **type**, en pastilles cumulables
- Combinables avec le texte de recherche : les facettes restreignent, le texte classe
- Le compte de résultats se met à jour
- Accessible depuis l'écran de recherche, pas un écran séparé

## Règles non négociables

1. **Aucun pourcentage de complétude.** Ni barre, ni score, ni « il vous reste N objets ». Le dossier n'est jamais complet par construction.
2. **Le vocabulaire visible est « zone » ou « lieu », jamais « pièce ».**
3. **Le filtre de visibilité est écrit dans la requête dès maintenant**, même inerte.
4. **Le point d'entrée de la capture reste à un geste de l'accueil.**
5. **Direction visuelle sobre** (décision 8 du plan) : blanc, contraste fort, police système, aucune décoration. Réutilise et étends `app/styles/app.css`, n'introduis pas de bibliothèque de composants.
6. **Rien ne doit ralentir la recherche à la frappe.** Si la requête dépasse ~150 ms sur le jeu d'exemple, c'est un index qui manque, pas un cache à ajouter.

## Ce qu'il ne faut PAS construire

Partages et jetons, plans et points, chronologie et événements, garanties, rôles avant/après, recherche sémantique, OCR. **Le modèle doit rester compatible, tu ne l'implémentes pas.**

## Points à trancher et à signaler

- **`fichier.legende` n'est jamais renseigné** par la capture, volontairement : demander une légende coûterait des secondes au chronomètre. Le plan prévoyait d'indexer les légendes ; comme il n'y en a pas, ne fais rien de spécial, mais note-le dans « Limites connues ».
- La recherche porte sur les **éléments** uniquement. Les zones et les systèmes se parcourent par les facettes, pas par le texte. Si tu penses que c'est une erreur, dis-le plutôt que de l'élargir en silence.

## Critères d'acceptation

- [ ] « robinet » remonte la vanne d'arrêt, avec l'étiquette de motif « alias »
- [ ] « compteur », « panneau », « lave-linge » remontent quelque chose de sensé sur le jeu d'exemple
- [ ] Un accent ou un pluriel ne change pas le résultat (`vannes`, `éclairage`, `eclairage`)
- [ ] Le classement remonte la correspondance sur le nom avant celle sur les détails
- [ ] Les facettes se cumulent et se combinent avec le texte
- [ ] Une zone sans photo affiche un aplat lisible, jamais une case vide
- [ ] La capture reste atteignable en un tap depuis l'accueil
- [ ] Recherche sous 150 ms sur le jeu d'exemple, mesuré et noté
- [ ] Le mot « pièce » n'apparaît nulle part
- [ ] Les tests existants passent toujours

## Attendu en fin de tâche

Mise à jour du `README.md` : la forme de la requête et son temps mesuré, la façon dont le motif de correspondance est calculé, et une section « décisions prises » listant tout arbitrage non spécifié ici. Signale tout point de ce document qui te paraît contradictoire plutôt que de choisir en silence.
