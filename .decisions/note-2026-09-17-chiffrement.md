# Chiffrement — ce que « nous ne pouvons pas les voir » peut vouloir dire, et ce qui se construit

> Note de cadrage, **17 septembre 2026**. Écrite avant toute ligne de code, en
> réponse au retour du 16 septembre : « il faudra que les données soient
> encryptées sur le serveur afin qu'on puisse promettre que NOUS, on ne peut pas
> les voir. Sans parler des codes de portes ou coffres qui nécessitent un autre
> niveau de sécurité. » Les faits sur le dépôt sont relus dans le code (renvois
> ci-dessous), pas de mémoire. Deux issues en sortent : #73 (le coffre) et rien
> d'autre — le reste de cette note dit pourquoi.

**Verdict : la phrase demande deux choses incompatibles, et une troisième qui
n'est pas dite est la seule qui se construit.** « Chiffré sur le serveur » et
« nous ne pouvons pas voir » ne vont pas ensemble : qui tient le serveur tient
la clé. Ce qui permettrait la promesse, c'est le chiffrement de bout en bout,
clé chez le propriétaire seul — et appliqué à toute la base, il détruit trois
appuis du projet (§2). Appliqué aux seuls codes et combinaisons, il
tient, et le plan l'avait prévu sous le nom de « module coffre » (§3).

Ce que ça engage, et qu'il faut dire à voix haute plutôt que découvrir en
codant : la **règle #9** du plan (« Aucun secret dans l'app ») est amendée, et
la page **`/confidentialite`** qui promet aujourd'hui « aucun code de portail
ou d'alarme, aucune combinaison de coffre » doit être réécrite le même jour.

---

## 1. Trois choses que « chiffré » peut désigner, et ce que chacune protège

| | Où est la clé | Protège contre | Ne protège pas contre |
|---|---|---|---|
| **Au repos** (disque de la VM, volume, sauvegardes) | Sur la machine, ou chez l'hébergeur | Un disque volé, une image de VM copiée, un fichier de sauvegarde qui traîne | Quiconque a un shell ou `DATABASE_URL` — c'est-à-dire **nous** |
| **De bout en bout, global** | Dans le navigateur du propriétaire, dérivée d'une phrase que le serveur ne reçoit jamais | Nous, l'hébergeur, un dump volé | Rien de plus — mais le serveur ne peut plus rien *faire* des données (§2) |
| **Coffre** (bout en bout sur un périmètre fermé) | Idem, pour les seuls secrets | Nous, l'hébergeur, un dump volé, **pour ces valeurs-là** | Le reste de la maison reste lisible par le serveur, et c'est ce qui le fait fonctionner |

La première ligne est la seule où « chiffré sur le serveur » est vrai, et elle
ne permet **pas** la promesse. Elle vaut quand même : disque chiffré à choisir
avec l'offre du VPS, et sauvegardes chiffrées avant de partir vers
`SAUVEGARDE_DESTINATION` (le dump contient les jetons de partage en clair,
#25 le note déjà par `umask 077`). Ce qu'on peut écrire honnêtement ensuite :
« chiffré au repos, sauvegardes chiffrées » — jamais « nous ne pouvons pas
voir ». Ce n'est pas l'objet de cette note ; ça se coche dans #25 avec le choix
de l'hébergeur.

## 2. Pourquoi le bout en bout global est un autre produit

Le serveur ne fait pas que stocker : il **lit** la base pour rendre ce que le
produit vend. Trois appuis le supposent, et aucune n'est cosmétique.

**La recherche.** `element.recherche` est un `tsvector` pondéré, écrit par un
trigger Postgres (`maj_recherche_element`, migration 0005) à partir du nom, des
alias, du type, de la zone, du système et des valeurs de `details`. Le
classement *est* ces poids. Chiffré côté client, chaque fiche arrive au serveur
comme du bruit, le trigger indexe du bruit, et « robinet » ne trouve plus la
vanne. Il faudrait réécrire la recherche dans le navigateur, sur une base
entièrement téléchargée et déchiffrée — le contraire de la capture à la cave.

**Le partage.** Une page `/p/<jeton>` est rendue côté serveur, **sans un octet
de JavaScript** (`handle.sansScripts`, CSP `default-src 'none'`), avec le
filtre de portée dans la requête (`clausePortee`) et le `niveau_min` par champ
appliqué dans le loader (`champsVisibles`). Tout ça lit les valeurs. Chiffrées,
le serveur ne peut ni filtrer ni projeter : il faudrait donner une clé au
plombier, donc un script sur sa page, donc renoncer à la ligne « aucun script »
qui est la raison d'être de l'étape 3.

**Les photos.** `sharp` redimensionne, redresse (EXIF, règle #3) et produit la
vignette et la dérivée `moyenne` côté serveur. Chiffrées, on sert l'original en
pleine résolution ou on refait tout ça dans le navigateur du propriétaire, à la
capture — les 30 secondes (règle #8) n'y survivent pas.

Et un quatrième point, qui n'est pas technique : **un mot de passe oublié
devient une maison perdue.** On vient de livrer `npm run compte` comme seul
recours pour un mot de passe oublié (#66), précisément parce que rien d'autre
n'est possible sans mailer. Avec une clé côté client, ce recours n'existe plus
non plus — le serveur n'a rien à remettre. Pour la mémoire technique d'une
maison, qui se transmet à la vente, c'est le mauvais compromis.

Le bout en bout global n'est donc pas « plus tard » : c'est un produit
différent, avec une autre promesse (un coffre-fort) et un autre coût (ni
recherche serveur, ni partage sans script, ni recours). On ne le ferme pas par
principe, on le ferme parce que ce qu'il coûte est ce qu'on vend.

## 3. Le coffre : le même chiffrement, sur le seul périmètre où il tient

Codes de portail, d'alarme, de digicode, combinaisons de coffre, emplacement
d'une clé, mot de passe d'un routeur ou d'une centrale : la liste exacte de la
règle #9 et de `/confidentialite`. Ce qui les distingue de tout le reste de la
base, et qui fait que le bout en bout leur convient :

- **On ne les cherche pas.** Personne ne tape « 4821 » dans la recherche. Hors
  de `element.recherche`, hors des facettes, sans perte.
- **On ne les partage pas.** Aucun plafond ne fait sortir un code d'alarme : ni
  à 3, ni jamais. Pas de route sous `/p/`, pas de type servi qui le porte.
- **On ne les transforme pas.** Pas de vignette, pas d'EXIF, pas de dérivée.
- **Les perdre se répare.** Une phrase de coffre oubliée, c'est une serrure à
  reprogrammer et des codes à ressaisir — pas une maison perdue. C'est
  exactement la différence avec le §2, et c'est ce qui rend acceptable qu'il n'y
  ait **aucun** recours côté serveur.

Le plan le disait en creux, dans « Volontairement exclu » : « Chiffrement de
bout en bout côté client (envisageable plus tard en module « coffre ») ». Le
retour du 16 septembre est le besoin réel qui le déclenche.

### Ce qui est décidé

**Une table, pas un genre de champ.** Un genre `secret` dans `CHAMP_GENRES`
serait la réponse facile, et deux choses l'interdisent. La règle #6 d'abord
(six genres, pas sept : la liste ne doit pas enfler). Et surtout le **poids D**
du trigger, qui indexe *toutes* les valeurs de `details` sans regarder
`niveauMin` — c'est déjà la raison du `ts_filter` sur les partages
(`porteeRestreinte`). Un secret dans `details`, même chiffré, entrerait dans
`element.recherche`. Il n'a rien à y faire, et le seul moyen sûr qu'il n'y
entre jamais est qu'il ne soit pas dans `details`. Donc `secret` : `id`,
`element_id` NOT NULL `ON DELETE CASCADE` (comme `garantie` : un code est la
propriété d'un objet — le portail, la centrale, la porte), `libelle` en clair,
`valeur` en `bytea`, dates.

**`libelle` en clair.** « Code du portail » dit qu'un code existe. C'est
l'écran du propriétaire, il n'est servi à personne d'autre, et un libellé
chiffré rendrait la liste illisible sans la phrase — pour ne cacher que
l'existence d'un code de portail, qui n'est un secret pour personne.

**Cryptographie native.** WebCrypto, disponible partout où l'app tourne :
AES-256-GCM (chiffrement authentifié — une mauvaise clé échoue, elle ne rend
pas du bruit), clé dérivée par PBKDF2-SHA256 à 600 000 itérations (WebCrypto
n'a pas argon2 ; argon2 en WASM serait une dépendance et un binaire de plus
pour un gain marginal sur une donnée que l'attaquant doit d'abord obtenir en
lisant la base). Une table `coffre` par propriété porte le sel, les paramètres
de dérivation et un **bloc de vérification** (une constante chiffrée) : on peut
dire « mauvaise phrase » sans toucher à un secret, et changer les paramètres
plus tard sans deviner lesquels ont servi.

**Une phrase de coffre, distincte du mot de passe du compte.** Le mot de passe
du compte atteint le serveur pour être haché par argon2 : en dériver la clé du
coffre ferait de cette clé une donnée serveur, le temps d'une requête, à chaque
connexion. La phrase de coffre, elle, **ne quitte jamais la page** : demandée à
chaque révélation, jamais écrite — ni `localStorage`, ni cookie, ni boîte
d'envoi hors ligne. La page rend le texte chiffré ; un script à nonce (l'arbre
authentifié en a, `res.locals.nonce`) déchiffre au clic. Le clair n'est jamais
dans la source servie.

**Rien côté serveur, et c'est vérifiable.** Le balayage de toutes les colonnes
de toutes les tables de `tests/demarrage/etancheite.test.ts` (avec son test de
contrôle) se rejoue après l'enregistrement d'un secret portant une sentinelle.
`chargerContenuPartage` ne touche pas la table. Le nombre de droits nommés sur
les fichiers reste à **trois** : un secret n'a pas de document.

**Perdre la phrase, c'est dit à l'écran, à la création.** Le seul recours est
de vider le coffre et de ressaisir. `npm run compte` ne peut rien, et c'est
voulu — c'est la ligne du §1, deuxième colonne.

**La capture n'est pas touchée.** Aucun secret dans le geste des 30 secondes :
un code se pose depuis la fiche, posément, comme une garantie.

### Ce que ça amende

1. **Règle #9** : « Aucun secret dans l'app » devient « Aucun secret **en
   clair** dans l'app. Un code se range dans le coffre, chiffré par le
   navigateur, ou nulle part. » Amendée en place dans le plan, datée, avec
   renvoi à cette note.
2. **`/confidentialite`**, section « Ce que l'application refuse de stocker » :
   réécrite pour dire ce qui est vrai après — stockés chiffrés par votre
   navigateur, avec une phrase que le serveur ne reçoit jamais, que nous ne
   pouvons ni lire ni vous rendre. La phrase « un coffre-fort qui ne dit pas son
   nom est pire qu'un carnet » reste vraie : celui-ci dit son nom.
   `tests/vitrine/discours.test.ts` à relire avant.
3. **Une décision README**, numérotée, avec les deux écartés (bout en bout
   global, genre de champ) et la revue de fuite complétée d'une ligne.

### Ce qui reste ouvert

- Garder la phrase pour la durée de la session : commodité, à ajouter si l'usage
  le réclame. On part sans.
- Un secret rattaché à une zone plutôt qu'à un objet (« code de la porte du
  garage » sans fiche « Porte du garage ») : on part avec `element_id` NOT
  NULL, comme `garantie`, et on verra si la vraie maison réclame autre chose.

## 4. Ce qu'on répond au retour

> Un chiffrement « sur le serveur » ne permet pas de promettre qu'on ne peut pas
> voir : le serveur a la clé. Ce qui le permettrait, c'est une clé qui reste
> chez vous — et appliqué à toute la maison, ça casse la recherche, les liens de
> partage sans script et le traitement des photos, et un mot de passe oublié
> devient une maison perdue. Ce qu'on fait à la place : au repos, disque et
> sauvegardes chiffrés, dit tel quel. Et pour les codes de portes, d'alarme et
> de coffres, exactement ce que vous décrivez — un coffre chiffré dans votre
> navigateur avec une phrase que le serveur ne reçoit jamais, qu'on ne peut ni
> lire ni vous rendre. Perdre la phrase se répare (on reprogramme la serrure) ;
> perdre la maison, non. C'est pour ça que la frontière passe là.

Suite : #73.
