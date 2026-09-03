# Plan d'implémentation — gestionImmobiliere

> Généré le 29 août 2026, à l'issue des 8 décisions. Les pages de décision détaillées sont dans ce dossier, `index.html` en donne la vue d'ensemble.

## Ce qu'on construit

La mémoire technique d'une maison. Le propriétaire y consigne ce qu'il oublie toujours : où passe la gaine RJ45, quelle vanne coupe quoi, qui a posé la chaudière et jusqu'à quand court sa garantie. Il retrouve tout ça en tapant un mot.

La particularité est ailleurs : **la même base se projette différemment selon qui la regarde.** Le propriétaire voit tout. Le locataire Airbnb reçoit un lien et voit les prises de la chambre et le fonctionnement de l'induction. L'artisan voit la technique de son lot. Le jardinier voit l'extérieur et rien d'autre.

Séquence : une app qui marche d'abord, la vente de l'accès ensuite. Marché visé à terme, la Suisse.

## Les huit décisions

| # | Décision | Choix | Catégorie |
|---|---|---|---|
| 1 | Les audiences et ce que chacune voit | **Niveaux + portée par lien** (B modifiée) | Technique |
| 2 | Modèle de données | **Table unique + types définis en base** (C modifiée) | Technique |
| 3 | Comment ça se remplit | **La capture opportuniste** (B) | Interaction |
| 4 | Le plan interactif | **Modèle en couches, 4 phases** (sur mesure) | Visuel |
| 5 | Recherche et découverte | **Plein texte + alias** (B) | Interaction |
| 6 | Photos, documents et fichiers | **Fichier autonome, liens multiples** (B) | Technique |
| 7 | Stack et hébergement | **PWA + boîte d'envoi, puis Capacitor** (B) · React Router v7 + PostgreSQL + Drizzle | Technique |
| 8 | Navigation et direction visuelle | **Recherche d'abord, style sobre** (B) | Archi info |

## Le schéma

```sql
-- Structure : propriété > bâtiment > niveau > zone
batiment(id, propriete_id, nom, type, ordre)
  -- type : principal | annexe | garage | abri
  -- Une parcelle peut porter plusieurs bâtiments.

niveau(id, batiment_id, nom, ordinal, ordre)
  -- ordinal ENTIER SIGNÉ : -2 sous-sol, -1 cave, 0 rez, 1 premier, 2 combles
  -- Le nom est libre ("cave à vin"), l'ordinal sert au tri et au sélecteur.

zone(id, propriete_id, niveau_id NULL, nom, parent_id, type, ordre)
  -- type : interieur | exterieur | annexe | technique
  -- L'EXTÉRIEUR EST UNE ZONE COMME UNE AUTRE : jardin, potager, terrasse,
  -- cour, garage, abri, local technique.
  -- niveau_id NULL = zone extérieure, rattachée à la parcelle et non à un
  --   niveau. C'est le SEUL cas où niveau_id est nul.
  -- parent_id : sous-découpage libre (jardin > potager, cave > cellier).

systeme(id, propriete_id, nom, icone)

-- Types : catalogue système livré + types perso créés dans l'app
type_element(id, propriete_id NULL, nom, icone, origine, champs jsonb, alias text[])
  -- origine : 'systeme' (propriete_id NULL, non modifiable) | 'perso'
  -- champs  : [{cle, label, genre, unite, niveau_min, obligatoire}]
  -- genre   : texte | nombre | date | booleen | choix | fichier   (liste FERMÉE)

-- Le cœur
element(id, propriete_id, nom, type_id,
        zone_id NOT NULL,          -- garantit le filtre de portée
        systeme_id NULL,
        niveau smallint NOT NULL DEFAULT 3,
        details jsonb, alias text[], recherche tsvector,
        cree_le, maj_le)
  -- niveau : 0 public · 1 usage · 2 technique · 3 privé

-- Plan, en trois couches indépendantes
plan(id, propriete_id, type, niveau_id NULL, nom, image_fichier_id, echelle, ordre)
  -- type : etage (plan d'architecte) | situation (vue aérienne de la parcelle)
  -- type = etage      -> niveau_id renseigné, un plan par niveau
  -- type = situation  -> niveau_id NULL, couvre toute la parcelle
  -- Le plan de situation porte les zones extérieures. Son image vient d'une
  -- orthophoto swisstopo ou du cadastre : même mécanique image + points,
  -- simplement une autre source d'image.
zone_geom(zone_id, plan_id, polygone, source)   -- source : 'trace' | 'importe'
point(id, element_id, plan_id, x, y)            -- x, y en pourcentage
  -- PAS DE CONTRAINTE D'UNICITÉ sur element_id : un même objet peut porter
  -- plusieurs points, sur plusieurs plans. C'est ainsi qu'on représente une
  -- colonne de chute, une gaine technique ou un conduit qui traverse les
  -- niveaux : un point par niveau traversé, un seul objet en base.

-- Fichiers
fichier(id, propriete_id, chemin, type_mime, taille, date_prise,
        zone_id, niveau, legende, exif_efface bool)
fichier_lien(fichier_id, cible_type, cible_id, role)
  -- role : avant | apres | plaque | general

-- Historique
evenement(id, propriete_id, titre, date_debut, date_fin, type, niveau, description, cout)
evenement_element(evenement_id, element_id)
evenement_intervenant(evenement_id, intervenant_id)
intervenant(id, propriete_id, nom, metier, tel, email, niveau, notes)
garantie(id, element_id, evenement_id, debut, fin, reference, fichier_id)

-- Partages
partage(id, propriete_id, nom, jeton, niveau_max,
        portee_zones int[], portee_systemes int[],
        expire_le, revoque_le, cree_le)
```

Le filtre de partage, en une clause :

```sql
WHERE e.niveau <= :niveau_max
  AND (:portee_vide
       OR e.zone_id = ANY(:zones)
       OR e.systeme_id = ANY(:systemes))
```

## Les douze règles qui mordent si on les oublie

1. **`zone_id` est NOT NULL**, garanti par le schéma et pas par le formulaire. Une fiche sans zone échappe au filtre de portée.
2. **Jamais de pourcentage de complétude.** Ni barre, ni score, ni « il vous reste 47 objets ». En capture opportuniste le dossier n'est jamais complet : mesurer la complétude, c'est afficher un échec permanent.
3. **EXIF : appliquer l'orientation, puis effacer.** Dans cet ordre, sinon les photos partent de travers. Obligatoire sur toute image servie par un lien de partage : les coordonnées GPS y sont.
4. **Le filtre de permission est dans la requête**, jamais un écran « accès refusé ». Afficher qu'une correspondance existe est déjà une fuite.
5. **La clé d'un champ est immuable.** Seul le libellé se renomme. Un champ ajouté après coup est toujours optionnel. Un champ supprimé est masqué, jamais effacé.
6. **Les genres de champ sont une liste fermée de six.** Le jour où on ajoute « formule calculée » ou « relation », on n'écrit plus une app de maison, on écrit Airtable.
7. **La boîte d'envoi est éphémère, pas un stockage.** Compresser avant d'écrire, téléverser au retour du réseau ou à la réouverture, purger aussitôt. Le quota iOS est de 50 à 200 Mo et les caches sont purgés après quelques jours.
8. **La capture doit tenir en 30 secondes.** Au-delà, la capture opportuniste se comporte comme une session méthodique et le projet meurt à la troisième pièce.
9. **Aucun secret dans l'app.** Pas de code d'alarme, pas de combinaison de coffre, pas d'emplacement de clé. Cette ligne tient tant qu'on n'a pas les moyens de la sécurité.
10. **Chaque écran gère le cas « pas de polygone ».** La géométrie est optionnelle dans le modèle en couches.
11. **Un niveau porte un ordinal entier signé, pas seulement un nom.** « Sous-sol », « rez », « 1er », « combles » ne se trient pas alphabétiquement, et un bâtiment sans ordre de niveaux donne un sélecteur d'étage incohérent. L'ordinal est la donnée, le nom est l'étiquette.
12. **Jamais le mot « pièce » dans l'interface.** On dit **zone**, ou **lieu**. Le jardin, la terrasse, le garage et le local technique sont des zones au même titre que la cuisine. Si l'interface dit « pièce », personne ne pensera à créer le jardin, et le partage au jardinier n'aura rien à montrer. Le vocabulaire de l'interface décide de ce que les gens saisissent.

## Ordre de construction

> **L'ordre réel diverge du plan depuis le 3 septembre 2026 : l'étape 7 est
> construite avant l'étape 5.** Les étapes 1 à 4 reposent toutes sur un
> démarrage à froid brutal — un nouveau propriétaire doit créer bâtiment,
> niveau, zones et fiches à la main avant que la capture, la recherche, le plan
> ou le partage aient quoi que ce soit à montrer. Deux jours sur l'accueil
> rendent utilisables les quatre étapes déjà livrées, quand l'historique ajoute
> une cinquième surface à une application où l'on entre encore par une page
> blanche. Les étapes restantes gardent leur numéro : la séquence effective est
> 0 · 1 · 2 · 3 · 4 · **7** · 5 · 6.

### Étape 0 — Socle · 1 à 2 semaines
- [ ] PostgreSQL, schéma complet ci-dessus, migrations
- [ ] Arborescence bâtiment → niveau → zone, avec ordinal de niveau et zones extérieures sans niveau
- [ ] Authentification propriétaire
- [ ] Catalogue de types système livré, **intérieur et extérieur** : chaudière, prise, vanne, porte, lave-linge, compteur, tableau, gaine, mais aussi arrosage, éclairage extérieur, portail, clôture, regard, fosse, pompe à chaleur extérieure… avec leurs alias
- [ ] CRUD élément minimal, formulaire généré depuis `type_element.champs`

### Étape 1 — La capture · 2 à 3 semaines
> **C'est l'étape qui décide si le projet existe dans un an.** Tout le soin va ici.

- [ ] PWA installable, manifeste, service worker
- [ ] Écran de capture : photo → zone → type → confirmer, **en moins de 30 secondes**
- [ ] Boîte d'envoi IndexedDB, compression avant écriture, purge après envoi
- [ ] Traitement EXIF (orientation puis effacement), vignettes
- [ ] Fonctionne hors ligne, synchro au retour au premier plan
- [ ] Création d'un type perso depuis l'app

### Étape 2 — Retrouver · 1 à 2 semaines
- [ ] `tsvector` en configuration `french`, index GIN, déclencheur de mise à jour
- [ ] Index sur nom, type, zone, système, `details jsonb`, légendes, texte des documents
- [ ] Champ `alias` sur type et sur fiche, préremplissage du catalogue
- [ ] Écran d'accueil : champ de recherche épinglé + grille de **zones** en photo, intérieures et extérieures mélangées
- [ ] Facettes système / zone / type

### Étape 3 — Partager · 1 semaine
- [ ] Table `partage`, jeton, expiration, révocation
- [ ] Page de partage **rendue serveur**, légère, sans installation
- [ ] Filtre `niveau <= max ET zone ∈ portée` appliqué en base
- [ ] EXIF effacé sur toute image servie
- [ ] Prévisualisation « voici exactement ce que verra le locataire »

### Étape 4 — Le plan, phase 1 · 3 à 4 jours
- [ ] Téléversement du plan (PDF ou photo), recadrage et redressement
- [ ] Points en pourcentage, zoom, regroupement quand dézoomé
- [ ] Sélecteur de niveau trié par `ordinal`, **plus un plan de situation** pour les zones extérieures (vue aérienne de la parcelle)
- [ ] Un objet traversant plusieurs niveaux porte un point sur chaque plan concerné

### Étape 5 — Historique · 1 à 2 semaines
- [ ] Événements, liens vers éléments et intervenants
- [ ] Avant/après par le champ `role` sur `fichier_lien`
- [ ] Garanties avec date de fin et rappels
- [ ] Chronologie affichée

### Étape 6 — Le plan, phase 2 · 1 semaine
- [ ] Tracé de polygones **par-dessus le scan** (5 clics par pièce, aucune mesure)
- [ ] Déduction automatique de la zone d'un point quand la géométrie existe

### Étape 7 — Accueil sans page blanche · 2 jours
> Construite avant l'étape 5, voir la note d'ordre en tête de section.
- [x] Squelette de niveaux et de zones proposé, éditable, à corriger — **le chemin
      principal, saisi à la main**, qui marche sans RegBL et hors de Suisse
- [x] Adresse → EGID via RegBL en **enrichissement optionnel** greffé dessus,
      jamais comme condition d'existence du squelette
- [x] Ni l'adresse ni l'EGID stockés : décision #82 du README, tenue par un
      balayage de toutes les colonnes de toutes les tables

## En attente d'un besoin réel

| Chantier | Coût | Déclencheur |
|---|---|---|
| Photo annotée par points | ~2 jours | Réutilise le composant du plan. À prendre dès qu'on documente un mur ouvert. |
| Enrobage Capacitor | 2 à 3 semaines | Quand le hors ligne PWA devient limitant. Corrige le quota iOS, ajoute appareil photo natif, envoi en tâche de fond et notifications. **Pas Cordova**, en déclin marqué. Prévoir navigation native pour la guideline 4.2. |
| Reprise du classeur par OCR | 2 à 4 semaines | Quand le socle tourne. Meilleur rendement à l'heure passée pour garanties, dates et intervenants. |
| Éditeur de plan complet | 2 à 3 semaines | Seulement si le tracé sur scan se révèle insuffisant. Probablement jamais. |
| Import IFC / DXF | 4 à 8 semaines | Si un jour on vend aux pros du bâtiment. |
| Orthophotos swisstopo | ~1 semaine | Deux usages d'un coup. L'orthophoto **courante** sert de plan de situation pour les zones extérieures dès l'étape 4. Les orthophotos **historiques** (depuis 1979) remplacent l'idée d'archiver Google Maps, impossible en API et interdite par les CGU. Usage commercial autorisé, attribution `©swisstopo` obligatoire. |
| Multi-logement (immeuble) | 3 à 5 semaines | **Décision non prise.** Le modèle gère plusieurs bâtiments et plusieurs niveaux, mais pas plusieurs *logements* indépendants dans un bâtiment, chacun avec son propriétaire ou son locataire. C'est un autre produit : parties communes, quotes-parts, plusieurs comptes par bâtiment. À trancher avant de démarcher des gérances. |
| Relations entre éléments | ~1 semaine | Table de liaison `element ↔ element` typée, pour répondre à « qu'est-ce que je coupe si je ferme cette vanne ». |
| Image de partage recadrée par plan | ~2 jours | Les pixels d'une image de plan divulguent — un extrait cadastral porte l'adresse et le numéro de parcelle **imprimés dedans** — et c'est la seule ligne de la revue de fuite qui ne se ferme pas : le code filtre des colonnes, pas des pixels. **Une portée de partage par plan a été envisagée et écartée** : elle laisse le choix entre un jardinier qui ne voit pas le plan de situation, donc ne trouve pas la vanne d'arrosage, et un jardinier qui voit l'adresse — elle déplace la fuite dans un écran de configuration au lieu de la fermer. La forme retenue est une **image de partage distincte par plan** : une colonne nullable, le propriétaire recadre une fois pour couper le cartouche, `imageDUnPlan` sert cette version quand elle existe. Réutilise l'éditeur de recadrage de l'étape 4. Déclencheur : le jour où un vrai extrait cadastral est téléversé et partagé. |

## À vérifier avant de s'appuyer dessus

- ~~**Étendue exacte des attributs RegBL librement accessibles.**~~ **Vérifié le 3 septembre 2026**, voir `note-2026-09-03-regbl.md`. Réponse : gratuit, sans clé ni compte, usage commercial autorisé, attribution seulement recommandée (plus permissif que swisstopo) ; année de construction, nombre de niveaux, nombre de logements et agent énergétique du chauffage sont tous servis. Deux réserves qui portent sur l'écran, pas sur le droit : le service de recherche d'adresse **ne dit jamais « pas trouvé »** (il répond en `fuzzy` une adresse suisse plausible à une adresse parisienne), et `gastw` **ne compte pas les caves** — le sous-sol se demande au propriétaire, il ne se déduit pas.
- **Quotas iOS réels** sur les appareils visés, en conditions réelles avec des photos pleine résolution.
- **Limites de débit swisstopo** si l'usage devient intensif : un contrat est requis au-delà d'un certain volume.

## Volontairement exclu

- Codes d'accès, combinaisons de coffre, emplacements de clés
- Chiffrement de bout en bout côté client (envisageable plus tard en module « coffre »)
- Estimation du bien, hypothèques, mise en relation avec des artisans — c'est le terrain de Houzy, adossé à 17 banques cantonales, et ce n'est pas le nôtre
- Comptabilité, décomptes de charges, gestion locative
