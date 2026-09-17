# Prompt — Issue #73 : le coffre

> À coller dans une session Claude Code à la racine du dépôt, sur `master` à jour (PR #74 mergée : la note de cadrage est dans l'arbre).
> Lis d'abord, dans cet ordre : `.decisions/note-2026-09-17-chiffrement.md` (la décision et ses raisons), l'issue #73 **et son commentaire du 17 septembre** (`gh issue view 73 --comments` — le commentaire remplace un point de la note : clé de données enveloppée, clé de secours), puis `CLAUDE.md` et `README.md` pour l'état du code. Le plan `.decisions/implementation-plan.md` pour la règle #9, que cette tâche amende.
>
> **Modèle conseillé : `fable` (Fable 5.1), effort `high`.** Le volume de code est modeste — un module de chiffrement, deux tables, deux écrans — mais chaque ligne est du côté où une erreur ne se voit pas : une valeur en clair qui passe par un champ de formulaire nommé, un import de schéma qui emporte `coffre` dans un chunk client, une route de partage qui joint une table de trop. Le travail difficile n'est pas d'écrire, c'est de prouver par des tests que rien ne sort. Même raisonnement que le prompt de l'étape 4.

---

## Ce que fait cette tâche

Aujourd'hui, la règle #9 du plan interdit tout secret dans l'app, et la page `/confidentialite` promet qu'aucun code de portail, d'alarme ou de coffre n'est stocké. Cette tâche donne au propriétaire un **coffre** : des valeurs courtes (un code, une combinaison, un mot de passe de routeur, l'emplacement d'une clé) chiffrées **par son navigateur** avec une phrase que le serveur ne reçoit jamais. Nous, l'hébergeur, ou quelqu'un qui vole un dump ne voient que du bruit. La règle #9 devient « aucun secret **en clair** », et la page de confidentialité dit ce qui est vrai après.

Ce que ça n'est **pas** : un chiffrement de la maison. La recherche (trigger `tsvector`), le partage (page rendue sans script) et les photos (`sharp`) lisent la base, et continuent. Le coffre est le seul périmètre où le bout en bout tient, parce qu'un code ne se cherche pas, ne se partage pas, ne se transforme pas, et que le perdre se répare (on reprogramme la serrure). La note explique pourquoi la frontière passe là ; ne la déplace pas.

Trois usages réels :

- **Le propriétaire range le code du portail** depuis la fiche « Portail », posément, comme il pose une garantie. Pas depuis la capture.
- **Il le relit deux ans plus tard** : il tape sa phrase, le navigateur déchiffre, la valeur s'affiche. Rien n'a transité en clair.
- **Il a oublié sa phrase** : la clé de secours, imprimée à la création et rangée avec les papiers, rouvre le coffre et lui laisse poser une nouvelle phrase. Les deux perdues : il vide le coffre et ressaisit. Aucun recours côté serveur, et c'est ce qui permet la promesse.

## Ce qui existe déjà et qu'il faut brancher

- **La fiche du propriétaire est `app/routes/_app/elements.$elementId.modifier.tsx`.** Les garanties s'y créent (`element_id` NOT NULL, même forme que ce que tu vas faire). Le coffre s'y greffe en section, sous le même modèle : une action `_action=…` par geste, pas de route par secret.
- **Le nonce de la CSP** naît dans `server/application.js` et arrive à `<Scripts nonce>` par le loader racine (`app/root.tsx`). L'arbre authentifié exécute déjà du JavaScript (capture, plan) : le coffre est un composant React ordinaire, **il n'y a aucun script inline à écrire** et aucune directive à ajouter à la politique. Si tu te surprends à toucher `application.js` pour la CSP, tu fais fausse route.
- **`chargerRessourceOu404`** (`app/lib/db/scopedResource.server.ts`) pour `element`, qui porte `proprieteId`. `secret` ne l'a pas : il rejoint la propriété par `element`, à traiter à la main comme `niveau` (`niveauAppartientALaPropriete`). 404 dans tous les cas, jamais 403 (règle #4).
- **`tests/demarrage/etancheite.test.ts`** balaye toutes les colonnes de toutes les tables après un parcours complet, avec un **test de contrôle** qui prouve que le balayage détecte un motif présent. C'est le modèle de ton test principal. Lis-le en entier avant d'écrire le tien.
- **`tests/partage/routes.test.ts`** compare champ par champ ce que servent l'aperçu et le vrai loader de partage. Il doit rester vert sans modification : si tu dois y toucher, c'est que quelque chose du coffre a atteint `chargerContenuPartage`.
- **Les modules neutres** (`app/lib/forms/types.ts`, `app/lib/plans/types.ts`, `app/lib/dates.ts`) : aucun import drizzle, partagés par le navigateur et le serveur. Ton module de chiffrement en est un. `npm run verifier:bundle` cherche les noms de tables dans `build/client` — ajoute `coffre` et `secret` à sa liste de marqueurs, **avant** d'écrire le composant, pour qu'il te rattrape.
- **`exports-routes.test.ts`** : rien d'autre que les exports de route ne sort d'un fichier sous `app/routes/`. Tes aides vont dans `app/lib/coffre/`.

## Ce qu'il faut construire

### 1. Le module de chiffrement — neutre, testé sous Node

`app/lib/coffre/chiffrement.ts`. **WebCrypto seulement** (`globalThis.crypto.subtle`, présent dans le navigateur et dans Node ≥ 20), **aucune dépendance**. Ce que le module sait faire, et rien de plus :

- `genererCleDonnees()` : 256 bits aléatoires. C'est elle qui chiffre les secrets. Elle ne dérive de rien.
- `genererCleSecours()` : 160 bits aléatoires rendus **lisibles** (base32, groupes de quatre, `XXXX-XXXX-…`) — c'est ce que le propriétaire imprime. Elle passe ensuite par le même chemin que la phrase.
- `deriverCleEnveloppe(phraseOuSecours, sel, iterations)` : PBKDF2-SHA256 → clé AES-256-GCM. Le sel (16 octets) et `iterations` sont **stockés** dans `coffre`, jamais codés en dur dans la lecture : c'est ce qui permet de monter le nombre d'itérations plus tard sans deviner lequel a servi, et aux tests de tourner avec 1 000 au lieu de 600 000. La valeur de production, `ITERATIONS_COFFRE = 600_000`, est une constante exportée du module et écrite **une fois**.
- `envelopper(cleDonnees, cleEnveloppe)` / `desenvelopper(enveloppe, cleEnveloppe)` : AES-GCM sur les 32 octets de la clé de données. Une mauvaise phrase **échoue** ici (étiquette GCM), elle ne rend pas une clé fausse.
- `chiffrer(cleDonnees, texte)` / `dechiffrer(cleDonnees, bloc)` : AES-GCM, nonce de 12 octets tiré à chaque chiffrement.
- **Format des blocs** : un octet de version (`1`), puis le nonce, puis le texte chiffré avec son étiquette. Encodés en **base64url**, stockés en `text`. Pas de `bytea` : drizzle n'en a pas de natif, un `customType` pour des valeurs de quelques dizaines d'octets n'apporte rien, et du texte se relit dans un dump. Le format est documenté dans un commentaire d'en-tête, avec la raison de l'octet de version (changer d'algorithme sans casser les blocs existants).

`tests/coffre/chiffrement.test.ts`, environnement Node : aller-retour ; une phrase fausse **lance** au désenveloppement ; deux chiffrements du même texte donnent deux blocs différents (nonce) ; un bloc altéré d'un octet lance ; la clé de secours rouvre ce que la phrase a fermé ; changer de phrase ne change pas la clé de données ni un seul secret.

### 2. Le schéma — deux tables, une migration

`app/db/schema/coffre.ts`, réexporté par `index.ts`, migration **0015** par `npm run db:generate` (relis le SQL produit avant de l'appliquer).

- `coffre` : `propriete_id` **PK** (un coffre par propriété, `ON DELETE CASCADE`), `sel`, `iterations`, `cle_par_phrase`, `cle_par_secours`, `cree_le`. Les deux dernières sont la **même clé de données enveloppée deux fois**. Pas de bloc de vérification : une mauvaise phrase échoue au désenveloppement, c'est suffisant, et le commentaire de schéma dit pourquoi il n'y en a pas.
- `secret` : `id`, `element_id` NOT NULL `ON DELETE CASCADE`, `libelle` en clair, `valeur` (bloc chiffré), `cree_le`, `modifie_le`. Index sur `element_id`. **Pas de `propriete_id`** : il vient de l'élément, comme pour `garantie`, et le commentaire dit que c'est voulu.
- Le commentaire d'en-tête du fichier dit **pourquoi une table et pas un genre de champ** : la règle #6, et le poids D du trigger `maj_recherche_element` qui indexe toutes les valeurs de `details`, même chiffrées. Ce commentaire est la raison d'être de la table ; ne le résume pas en une ligne.

Rien dans `seed-exemple.ts` : la maison d'exemple n'a pas de coffre, et une phrase publiée n'aurait aucun sens.

### 3. Les écrans

**Le coffre de la propriété** : route `coffre` sous le préfixe de la propriété (`app/routes/_app/coffre.tsx`), une entrée depuis l'accueil de la propriété. Trois gestes :

- **Créer** : phrase saisie deux fois. Le navigateur tire la clé de données et la clé de secours, dérive, enveloppe deux fois, et POSTe `sel`, `iterations`, `cle_par_phrase`, `cle_par_secours`. Le serveur vérifie les formes (longueurs, base64url) et écrit. **Puis** l'écran affiche la clé de secours, **une seule fois**, avec la consigne (noter, imprimer, ranger avec les papiers) et ce qui arrive si les deux sont perdues. Elle n'est ni stockée, ni renvoyée par aucun loader, ni gardée dans l'état après navigation.
- **Changer la phrase** : ancienne phrase (ou clé de secours) → désenvelopper → réenvelopper avec la nouvelle → POSTer la seule `cle_par_phrase`. **Aucun octet de `secret.valeur` ne bouge**, un test le tient par `md5` avant/après.
- **Vider** : supprime `coffre` et tous les `secret` de la propriété, avec une confirmation qui dit combien de secrets disparaissent. C'est le seul recours quand les deux clés sont perdues, et l'écran le dit.

**Sur la fiche** (`elements.$elementId.modifier.tsx`), une section « Coffre » :

- Sans coffre : une phrase et un lien vers sa création. Rien d'autre.
- Avec : la liste des secrets (libellé, bouton « Révéler », bouton « Retirer »), et un formulaire d'ajout (libellé, valeur, phrase). **Tout se passe dans le navigateur** : la phrase désenveloppe la clé de données, la valeur est chiffrée, et le POST porte `libelle` et le bloc. La révélation demande la phrase (ou la clé de secours), déchiffre, affiche. La page servie contient le bloc, jamais le clair.
- **La phrase et la valeur en clair n'ont pas d'attribut `name`.** C'est le piège concret de cette tâche : un `<input name="phrase">` dans un `<form method="post">` part au serveur le jour où le JavaScript échoue avant l'hydratation. Les champs sensibles sont hors de tout `<form>` soumis, ou sans `name`, et l'envoi passe par un `fetcher.submit` construit à la main avec le seul bloc chiffré. Un test de rendu serveur vérifie qu'aucun `name="phrase"`, `name="valeur"`, `name="secours"` n'existe dans le HTML.
- Sans JavaScript, la section dit que le coffre en a besoin. C'est acceptable : l'arbre authentifié en dépend déjà pour la capture et le plan, et c'est justement parce que le déchiffrement est **dans** le navigateur.
- La phrase n'est **jamais écrite** : ni `localStorage`, ni `sessionStorage`, ni cookie, ni boîte d'envoi hors ligne. Elle vit dans l'état du composant le temps du geste. Garder la phrase pour la session est écarté (issue) ; ne l'ajoute pas.

**La capture n'est pas touchée.** Aucun champ, aucune option, aucun lien vers le coffre dans `capture.*`.

### 4. Ce qui ne doit rien voir — la partie qui compte

- **Aucune requête sous `app/lib/partage/` ni `app/routes/_partage/` ne nomme `coffre` ou `secret`.** Un test statique (sur le modèle de `exports-routes.test.ts`) grep ces deux dossiers et échoue à la première occurrence. Aucun type servi à un partage (`FicheRendue`, etc.) ne porte de champ pour eux, donc les écrire ne compile pas.
- **`tests/coffre/etancheite.test.ts`** : créer un coffre (par le module, comme le navigateur le ferait, avec 1 000 itérations), poser un secret dont la phrase, la clé de secours **et** la valeur portent chacune une sentinelle distincte, puis balayer toutes les colonnes de toutes les tables — `element.recherche` compris — et n'en trouver aucune. Avec le test de contrôle qui prouve que le balayage détecte une sentinelle réellement présente (mets-en une dans `secret.libelle`, qui est en clair, et vérifie qu'elle est trouvée).
- **`chargerContenuPartage`** sur un lien à plafond 3, portée entière, sur une propriété qui a un coffre et des secrets : la sortie sérialisée ne contient ni un libellé, ni un bloc, ni le mot `coffre`.
- **Aucun journal** : `server/application.js` ne journalise pas les corps, vérifie que ça reste vrai et que ton code n'ajoute aucun `console.log` d'un bloc ou d'une phrase, même en développement.
- **Les droits nommés sur les fichiers restent à trois** (`photoDUneFiche`, `imageDUnPlan`, `photoDUnEvenement`). Un secret n'a pas de document. Si tu penses en avoir besoin, arrête-toi et écris pourquoi dans la PR au lieu de le faire.

### 5. Ce que ça amende — dans la même PR

- **Règle #9** dans `.decisions/implementation-plan.md`, amendée en place et datée : « Aucun secret **en clair** dans l'app. Un code se range dans le coffre, chiffré par le navigateur, ou nulle part. » Renvoi à la note.
- **`/confidentialite`**, section « Ce que l'application refuse de stocker » : réécrite pour dire ce qui est vrai — les codes sont stockés chiffrés par votre navigateur, avec une phrase et une clé de secours que le serveur ne reçoit jamais, que nous ne pouvons ni lire ni vous rendre ; la phrase « un coffre-fort qui ne dit pas son nom est pire qu'un carnet » reste, celui-ci dit son nom. **Lis `tests/vitrine/discours.test.ts` avant d'écrire un mot** : il interdit des motifs (chiffres non mesurés, affirmations) et doit rester vert. Aucun attribut `style`, aucun script : la vitrine est sans `'unsafe-inline'`.
- **README** : décision numérotée (la dernière est la #148) avec les deux écartés (bout en bout global, genre de champ) et le troisième (mode réinitialisable par le serveur, remplacé par la clé de secours) ; une ligne « secret » dans la **revue de fuite** ; « Limites connues » : la phrase perdue avec la clé de secours perdue.
- **CLAUDE.md** : une section « Le coffre » de la longueur des autres, qui dit ce qui porte le poids : la table et non le genre (poids D), la clé enveloppée, les champs sans `name`, le test statique sur les deux dossiers de partage.

## Pièges connus, à ne pas redécouvrir

- **`Number("")` vaut 0.** Ce n'est pas le sujet ici, mais `iterations` reçu du client est un entier : refuse tout ce qui n'est pas un entier dans une plage plausible (≥ 100 000 en production, et le test passe par le module, pas par la route, pour ses 1 000).
- **Le balayage d'étanchéité lit des colonnes `text` et `jsonb`.** Tes blocs sont du base64url : une sentinelle en clair ne peut pas y apparaître **par construction**, et c'est exactement ce que le test doit constater. Ne fais pas de sentinelle qui soit elle-même du base64url valide, elle serait indétectable sans que ça prouve rien.
- **Deux instances du même composant** (comme `Capture`) ne partagent pas d'état : si la section coffre apparaît deux fois, la phrase saisie dans l'une ne sert pas l'autre. Une seule section par écran.
- **Un `fetcher` qui lance une `Response`** remplace la page (voir « plans/contours » dans `CLAUDE.md`). Rends tes 404 pour les actions de la fiche.
- **Le nonce.** Si le navigateur signale une `securitypolicyviolation` sur ton écran, c'est un `style` inline ou un `eval` quelque part, pas une directive manquante. Ne touche pas à la politique.

## Critères d'acceptation

Ceux de l'issue #73 et de son commentaire, repris ici pour qu'ils soient cochés dans la PR :

- [ ] Après enregistrement d'un secret, le balayage de toutes les colonnes de toutes les tables ne trouve ni la phrase, ni la clé de secours, ni la valeur — `element.recherche` compris ; le test de contrôle trouve bien le libellé
- [ ] Un lien à plafond 3, portée entière, ne sert ni libellé ni bloc ; le test statique refuse toute occurrence de `coffre`/`secret` sous `app/lib/partage/` et `app/routes/_partage/`
- [ ] Le HTML servi de la fiche contient le bloc et jamais le clair ; aucun `name="phrase"`, `name="valeur"`, `name="secours"` dans le rendu
- [ ] Le module est neutre, testé sous Node : aller-retour, phrase fausse qui lance, bloc altéré qui lance, secours qui rouvre
- [ ] Changer la phrase laisse `secret.valeur` identique à l'octet près (`md5` avant/après)
- [ ] Un coffre s'ouvre avec la clé de secours après une phrase fausse, et une nouvelle phrase peut être posée depuis là
- [ ] La clé de secours n'est affichée qu'une fois et ne sort d'aucun loader
- [ ] Vider le coffre supprime `coffre` et tous les `secret` de la propriété, et seulement de celle-là
- [ ] La capture n'a pas changé d'un octet (`git diff --stat` sur `capture.*` et `app/lib/capture/` vide)
- [ ] Règle #9 amendée, `/confidentialite` réécrite, décision README, revue de fuite, CLAUDE.md
- [ ] `npm run typecheck`, `npm test`, `npm run build && npm run verifier:bundle` (avec `coffre` et `secret` dans ses marqueurs) verts ; passage `securitypolicyviolation` au navigateur sur le coffre et la fiche, 1440 et 375

## Workflow GitHub

Comme décrit dans `CLAUDE.md` :

- Branche `feat/coffre`, PR `feat(coffre): des codes chiffrés par le navigateur, jamais cherchés, jamais partagés`, label `feature`, `Closes #73` dans le corps. Pas de milestone : ce n'est pas une étape du plan.
- Corps court : Contexte / Changements / Tests effectués / Closes. Le corps dit **ce qui a été écarté en route** s'il y a eu une tentation (un genre de champ, une route par secret, une phrase gardée en session).
- Tout défaut trouvé en chemin qui n'est pas une pièce du coffre : issue à part, pas un correctif glissé dans la PR.
- `npm run typecheck`, la suite complète et `npm run build && npm run verifier:bundle` verts **avant** l'ouverture de la PR. Pas de squash ni de merge : c'est le propriétaire du dépôt qui merge.

## Attendu en fin de tâche

Un résumé qui tient seul : ce qui a été construit, ce que les tests prouvent (et ce qu'ils ne prouvent pas — le comportement réel du navigateur face à un JavaScript qui échoue à mi-chemin n'est vérifiable qu'au navigateur, dis-le), les deux points ouverts de la note (secret rattaché à une zone, phrase gardée pour la session) laissés ouverts, et la ligne exacte de `/confidentialite` après réécriture, pour relecture.
