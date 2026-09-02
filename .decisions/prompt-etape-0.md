# Prompt — Étape 0 : socle de gestionImmobiliere

> À copier-coller tel quel dans une session d'agent de code, à la racine du dépôt.
> Le document est autoportant : il ne suppose aucune connaissance des échanges précédents.

---

## Contexte

Je construis **gestionImmobiliere**, une application web qui sert de mémoire technique à un bien immobilier. Le propriétaire y consigne chaque objet de sa maison (prises, vannes, gaines, appareils, arrosage, portail…), les retrouve par une recherche par mot-clé, tient l'historique des rénovations et des garanties, et **partage des vues filtrées** à des tiers : un locataire Airbnb, un artisan, un jardinier.

Tu construis l'**étape 0 : le socle**. Pas d'interface soignée, pas de capture photo, pas de recherche avancée, pas de partage. Uniquement les fondations sur lesquelles tout le reste s'appuiera.

## Stack imposée

| Élément | Choix | Raison |
|---|---|---|
| Framework | **React Router v7 en mode framework** (ex-Remix), TypeScript, serveur Node | Un seul projet sert l'app riche du propriétaire ET les pages de partage rendues serveur. Couche fine, modèle `loader` / `action` qui colle à HTTP, auto-hébergement Docker direct. |
| Base | **PostgreSQL 16+** | `jsonb`, `tsvector` en configuration `french`, index GIN |
| ORM | **Drizzle** | Couche fine, schéma typé, migrations, et échappatoire SQL brut indispensable pour `tsvector` |
| Hachage mot de passe | **argon2** (via `@node-rs/argon2` ou équivalent maintenu) | Ne pas écrire de crypto à la main |
| Sessions | **Table en base + cookie `httpOnly`, écrites à la main** | Un seul type de compte, pas de OAuth, pas de dépendance d'auth à maintenir |
| Conteneurisation | **Docker + docker-compose** (app + postgres) | Cible : Raspberry Pi 5, puis hébergeur suisse |

N'ajoute **aucune** autre dépendance sans la justifier en commentaire.

**Next.js est explicitement écarté** : le modèle RSC, les couches de cache et le runtime d'optimisation d'images ajoutent une charge opérationnelle inutile pour un déploiement auto-hébergé sur Raspberry Pi. React Router v7 offre le même rendu serveur avec une couche bien plus fine.

## Le schéma à créer

Respecte les noms exactement. Les commentaires sont des contraintes, pas des suggestions.

```sql
-- ── Structure : propriété > bâtiment > niveau > zone ──────────────────
propriete(id, nom, adresse, egid, cree_le)

batiment(id, propriete_id, nom, type, ordre)
  -- type : principal | annexe | garage | abri
  -- Une parcelle peut porter plusieurs bâtiments.

niveau(id, batiment_id, nom, ordinal, ordre)
  -- ordinal ENTIER SIGNÉ : -2 sous-sol, -1 cave, 0 rez, 1 premier, 2 combles
  -- Le nom est libre ("cave à vin"), l'ordinal sert au tri et au sélecteur.

zone(id, propriete_id, niveau_id NULL, nom, parent_id, type, ordre)
  -- type : interieur | exterieur | annexe | technique
  -- L'extérieur est une zone comme une autre : jardin, potager, terrasse,
  --   cour, garage, abri, local technique.
  -- niveau_id NULL = zone extérieure. C'est le SEUL cas où il est nul.
  -- parent_id : sous-découpage libre (jardin > potager, cave > cellier).

systeme(id, propriete_id, nom, icone)
  -- électricité, sanitaire, chauffage, ventilation, réseau, arrosage…

-- ── Types d'objets : catalogue système + types créés par l'utilisateur ─
type_element(id, propriete_id NULL, nom, icone, origine, champs jsonb, alias text[])
  -- origine : 'systeme' (propriete_id NULL, NON MODIFIABLE par l'utilisateur)
  --         | 'perso'   (propriete_id renseigné)
  -- champs  : [{cle, label, genre, unite, niveau_min, obligatoire}]
  -- genre   : texte | nombre | date | booleen | choix | fichier
  --           LISTE FERMÉE. Ne pas en ajouter.

-- ── Le cœur ───────────────────────────────────────────────────────────
element(id, propriete_id, nom, type_id,
        zone_id NOT NULL,
        systeme_id NULL,
        niveau smallint NOT NULL DEFAULT 3,
        details jsonb NOT NULL DEFAULT '{}',
        alias text[], recherche tsvector,
        cree_le, maj_le)
  -- niveau : 0 public · 1 usage · 2 technique · 3 privé

-- ── Plan, en trois couches indépendantes ──────────────────────────────
plan(id, propriete_id, type, niveau_id NULL, nom, image_fichier_id, echelle, ordre)
  -- type = etage     -> niveau_id renseigné, un plan par niveau
  -- type = situation -> niveau_id NULL, vue aérienne de la parcelle
zone_geom(zone_id, plan_id, polygone, source)   -- source : trace | importe
point(id, element_id, plan_id, x, y)            -- x, y en pourcentage
  -- AUCUNE contrainte d'unicité sur element_id : un objet traversant
  -- plusieurs niveaux porte un point par plan concerné.

-- ── Fichiers ──────────────────────────────────────────────────────────
fichier(id, propriete_id, chemin, type_mime, taille, date_prise,
        zone_id, niveau, legende, exif_efface bool)
fichier_lien(fichier_id, cible_type, cible_id, role)
  -- role : avant | apres | plaque | general

-- ── Historique ────────────────────────────────────────────────────────
evenement(id, propriete_id, titre, date_debut, date_fin, type, niveau, description, cout)
evenement_element(evenement_id, element_id)
evenement_intervenant(evenement_id, intervenant_id)
intervenant(id, propriete_id, nom, metier, tel, email, niveau, notes)
garantie(id, element_id, evenement_id, debut, fin, reference, fichier_id)

-- ── Partages ──────────────────────────────────────────────────────────
partage(id, propriete_id, nom, jeton, niveau_max,
        portee_zones int[], portee_systemes int[],
        expire_le, revoque_le, cree_le)

-- ── Auth ──────────────────────────────────────────────────────────────
utilisateur(id, email UNIQUE, mot_de_passe_hash, cree_le)
session(id, utilisateur_id, expire_le, cree_le)
```

## Règles non négociables

1. **`element.zone_id` est `NOT NULL`, garanti par une contrainte de base.** Une fiche sans zone échapperait au filtre de partage. Ce n'est pas un champ obligatoire dans un formulaire, c'est une contrainte de schéma.
2. **`niveau.ordinal` est un entier signé.** Le tri des niveaux se fait dessus, jamais sur le nom.
3. **La clé d'un champ de `type_element.champs` est immuable.** Prévois-le : un champ ajouté après coup est toujours optionnel, un champ retiré est masqué et jamais effacé (les données restent dans `details`).
4. **`genre` est une liste fermée de six valeurs.** Applique-la par un type énuméré ou une contrainte `CHECK`.
5. **Les types système (`origine = 'systeme'`) ne sont pas modifiables par l'utilisateur.** L'utilisateur peut créer ses propres types et ajouter un champ à un type existant, mais pas altérer le catalogue livré.
6. **Le vocabulaire visible est « zone » ou « lieu », jamais « pièce ».** Dans le code, les commentaires et toute chaîne affichée. Le jardin et le garage sont des zones au même titre que la cuisine.
7. **Aucun secret dans le modèle.** Pas de champ prévu pour un code d'alarme, une combinaison ou un emplacement de clé.

## Ce qu'il faut livrer

### 1. Projet et infrastructure
- Projet React Router v7 en mode framework + TypeScript, serveur Node (Express ou Hono), rendu serveur activé
- `docker-compose.yml` : service app + service postgres, volumes persistants, variables d'environnement dans un `.env.example` documenté
- `Dockerfile` multi-étapes, image finale légère
- Le projet doit démarrer avec `docker compose up` et une base vide, sans étape manuelle

### 2. Base de données
- Schéma Drizzle complet correspondant au SQL ci-dessus
- Migrations générées et versionnées
- Index : clés étrangères, `element(zone_id)`, `element(niveau)`, index GIN sur `element.recherche` et sur `element.details`
- La colonne `recherche` est alimentée par un **déclencheur** qui concatène `nom`, les `alias`, le nom du type, le nom de la zone, le nom du système et les valeurs texte de `details`, en configuration `french`. Le déclencheur se déclenche à l'insertion et à la mise à jour.

### 3. Authentification
- Inscription et connexion par email et mot de passe, hachage argon2
- Sessions en base, cookie `httpOnly` + `SameSite=Lax` + `Secure` en production
- Résolution de la session côté serveur, exposée aux routes via le contexte (loader racine ou middleware)
- Protection des routes de l'espace propriétaire dans leurs `loader`, redirection vers la connexion sinon
- Les futures pages de partage publiques (`/p/:jeton`) devront rester hors de cette protection : prévois la séparation des arbres de routes dès maintenant, même si tu ne construis pas le partage

### 4. Catalogue de types système
Un script de données de départ, rejouable sans doublon, créant **au moins 25 types** couvrant l'intérieur et l'extérieur. Pour chacun : nom, icône, liste de champs typés avec unités et `niveau_min`, et **des alias français réalistes**.

Intérieur : prise 230V, prise RJ45, interrupteur, tableau électrique, disjoncteur, luminaire, vanne d'arrêt, robinet, siphon, chauffe-eau, chaudière, radiateur, thermostat, bouche de VMC, lave-linge, lave-vaisselle, four, hotte, porte, fenêtre, compteur électrique, compteur d'eau, gaine technique.

Extérieur : vanne d'arrosage, programmateur d'arrosage, éclairage extérieur, portail motorisé, clôture, regard, fosse, pompe à chaleur extérieure, prise extérieure, cuve.

Exemple de forme attendue pour les alias, à respecter : `vanne d'arrêt` porte `["robinet", "arrêt d'eau", "stop-eau", "vanne"]`. C'est ce qui permettra à une recherche « robinet » de trouver une fiche nommée « vanne d'arrêt ».

### 5. CRUD minimal
- Écrans de liste et de formulaire pour : bâtiment, niveau, zone, système, élément
- **Le formulaire d'un élément est généré dynamiquement depuis `type_element.champs`** : le choix du type fait apparaître les bons champs, avec leur libellé, leur unité et leur validation. C'est le point technique central de l'étape, ne le contourne pas avec un formulaire figé.
- Création d'un type perso depuis l'interface, avec l'éditeur de champs (les six genres, l'unité, le `niveau_min`, l'obligatoire)
- Sélecteur de zone présentant l'arborescence bâtiment → niveau → zone, plus les zones extérieures groupées à part

### 6. Jeu de données d'exemple
Un script séparé du catalogue, créant une propriété fictive complète : une maison à deux niveaux plus une cave, un garage, un jardin avec potager, une trentaine d'éléments répartis, trois systèmes, deux intervenants et deux événements passés. De quoi avoir des écrans peuplés dès le premier lancement.

### 7. Tests
- Tests d'intégration sur la base : contrainte `zone_id NOT NULL` respectée, tri par `ordinal` correct, déclencheur `recherche` alimenté, validation d'un `details` contre les `champs` de son type
- Un test qui vérifie qu'une recherche « robinet » remonte bien un élément de type « vanne d'arrêt » grâce aux alias

## Ce qu'il ne faut PAS construire à cette étape

Capture photo et boîte d'envoi hors ligne, service worker et PWA, plans et points, pages de partage et jetons, interface de recherche, chronologie, téléversement de fichiers, traitement EXIF, soin graphique. Tout cela vient aux étapes suivantes. **Le schéma doit les rendre possibles sans migration destructive, mais tu ne les implémentes pas.**

## Critères d'acceptation

- [ ] `docker compose up` sur une machine vierge donne une application fonctionnelle
- [ ] Les migrations s'appliquent sur une base vide sans intervention
- [ ] Le catalogue et le jeu d'exemple se chargent par une commande documentée, deux fois de suite sans doublon
- [ ] Un compte se crée, se connecte, et les routes protégées le sont réellement
- [ ] Créer un élément de type « chaudière » affiche les champs de la chaudière ; changer le type change les champs
- [ ] Créer un type perso « adoucisseur d'eau » avec trois champs, puis un élément de ce type, fonctionne de bout en bout
- [ ] Une requête SQL directe `WHERE recherche @@ plainto_tsquery('french', 'robinet')` remonte la vanne d'arrêt
- [ ] Une insertion d'élément sans `zone_id` est rejetée par la base
- [ ] Le mot « pièce » n'apparaît nulle part dans l'interface

## Attendu en fin de tâche

Un `README.md` couvrant : prérequis, démarrage, commandes de migration et de chargement des données, structure des dossiers, et une section « décisions prises » listant tout arbitrage que tu as dû trancher et qui n'était pas spécifié ici.

Si un point de ce document te paraît contradictoire ou irréalisable, **arrête-toi et signale-le** plutôt que de choisir silencieusement.
