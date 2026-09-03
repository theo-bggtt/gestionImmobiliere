# RegBL — ce qui est réellement accessible, et à quelles conditions

> Note de vérification, **3 septembre 2026**. Écrite avant toute ligne de code de
> l'étape 7, en réponse à la ligne « Étendue exacte des attributs RegBL librement
> accessibles » de la section *À vérifier avant de s'appuyer dessus* du plan
> d'implémentation. Toutes les réponses ci-dessous ont été **mesurées par appel
> réel**, pas lues dans une documentation.

**Verdict : oui, on peut s'appuyer dessus.** Gratuit, sans clé, sans compte,
usage commercial autorisé, et les attributs vont bien au-delà de l'EGID —
année de construction, nombre de niveaux, nombre de logements, agent
énergétique du chauffage. Le squelette proposé peut donc être riche.

Les vraies difficultés ne sont pas juridiques ni contractuelles, elles sont
dans le comportement du service de recherche d'adresse (§4). Elles sont
lourdes de conséquences pour l'écran, et invisibles si on ne teste que des
adresses correctes.

---

## 1. Le service qui expose adresse → EGID

**Ce n'est pas le service que le nom laisse croire.** La page officielle
« De l'adresse à l'EGID, l'EDID et l'EWID »
(<https://www.gwr.admin.ch/fr/data/query/adrtoegid.html>) n'est **pas une API** :
c'est un formulaire de conversion **par lot**, où l'on téléverse un `.xlsx` ou un
`.csv` d'adresses et où l'on récupère un fichier. Utile pour un traitement de
masse, inutilisable dans un formulaire d'inscription. Ne pas partir de là.

Le point d'entrée interrogeable est l'API de la Confédération
**`api3.geo.admin.ch`**, en deux appels JSON :

**a) Adresse → identifiant** — `SearchServer`, `origin=address` :

```
GET https://api3.geo.admin.ch/rest/services/api/SearchServer
      ?searchText=Rue+du+Rhone+14+Geneve&type=locations&origin=address&limit=5
```

Chaque résultat porte un `links[]` dont une entrée pointe la couche RegBL :

```json
{"attrs": {"label": "Rue du Rhône 14 <b>1204 Genève</b>", "origin": "address",
  "lat": 46.2044, "lon": 6.1455,
  "links": [{"title": "ch.bfs.gebaeude_wohnungs_register",
             "href": "/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/2037304_3"}]}}
```

Le dernier segment, `2037304_3`, est **`EGID_EDID`** : EGID 2037304, EDID 3
(l'entrée d'immeuble). L'EGID est donc obtenu dès le premier appel.

**b) EGID → attributs** — la couche `ch.bfs.gebaeude_wohnungs_register` :

```
GET https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/2037304_3?lang=fr
```

Un troisième chemin existe et n'est pas nécessaire ici : `identify` sur la même
couche, à partir de coordonnées LV95 — utile plus tard si l'on part d'un point
sur une carte plutôt que d'une adresse. Testé, HTTP 200.

## 2. Clé, compte, contrat, débit

| Question | Réponse mesurée |
|---|---|
| Clé d'API | **Aucune.** Les appels ci-dessus ont été passés sans en-tête d'authentification. |
| Compte / inscription | **Aucun.** Les CGU de l'IFDG le disent explicitement : « L'utilisation des géoservices de l'IFDG ne nécessite pas d'enregistrement et est gratuite ». |
| Contrat | Seulement au-delà du *fair use*. |
| Limite de débit | Aucun en-tête `RateLimit-*`, aucun `429` sur 12 requêtes consécutives sans pause. Le seuil documenté est un ordre de grandeur, pas un quota technique : « L'intégration de géoservices dans des applications web avec une moyenne de **20 000 utilisateurs par jour** […] correspond à un fair use ». Au-delà : écrire à `info@geo.admin.ch` avant la mise en service, « l'accès peut être limité ou refusé ». |

À notre échelle (un appel par création de propriété, soit quelques appels par
utilisateur **à vie**), on est à quatre ordres de grandeur du seuil. La réponse
porte `Cache-Control: public, max-age=600`.

## 3. Licence et attribution — la réponse **diffère** de swisstopo

C'est la question que le prompt d'étape demandait de ne pas supposer. Elle a
bien deux réponses distinctes, parce qu'il y a deux objets :

- **Les données RegBL** (le contenu) sont publiées par l'OFS sur opendata.swiss
  sous la catégorie **`terms_open`**, dont la formulation officielle est :
  « Vous pouvez utiliser ce jeu de données à des fins commerciales. **Nous vous
  recommandons** d'indiquer la source ». Usage commercial autorisé,
  attribution **recommandée, non obligatoire**.
- **Le géoservice** `api3.geo.admin.ch` (le tuyau) est exploité par swisstopo,
  gratuit et sans enregistrement, sous réserve de fair use.

C'est donc **plus permissif** que les orthophotos swisstopo de l'étape 4, où
`© swisstopo` est obligatoire. Le plan avait raison de demander de vérifier
plutôt que de recopier.

Recommandation malgré tout : **afficher la mention de source.** Elle coûte une
ligne, elle explique à l'utilisateur d'où sortent des chiffres qu'il n'a pas
saisis (ce qui est un besoin d'interface avant d'être un besoin juridique), et
elle nous met à l'abri si l'OFS resserre la catégorie. Formulation retenue :
*Source : Registre fédéral des bâtiments et des logements (RegBL), OFS.*

Base juridique de l'ouverture : les caractères de **niveau d'accès A** de
l'annexe 1 de l'ORegBL sont publics et utilisables sans restriction. Ce sont
ceux que sert la couche publique, et ce sont ceux listés au §5.

## 4. Trois pièges du service de recherche — la vraie difficulté

Mesurés, tous les trois. Chacun produit une donnée **fausse et plausible**, ce
qui est le pire cas : rien n'échoue, l'écran affiche un résultat crédible.

**a) `origin=address` n'est pas un filtre.** Quand rien ne correspond, le
service répond quand même, avec des résultats d'une autre nature
(`origin: "gazetteer"` : régions, communes). Une requête a renvoyé un objet
« Grossregion Mittelland » long de plusieurs milliers de noms de communes.
→ *Ne garder que les résultats dont `origin === "address"` et qui portent un
lien `ch.bfs.gebaeude_wohnungs_register`.*

**b) `fuzzy: true` est un repli silencieux, pas une erreur.** Le service ne
répond jamais « pas trouvé » :

| Saisie | Ce qui revient |
|---|---|
| `10 rue de Rivoli Paris` | **Ruelle de Paris 10, 3966 Chalais (VS)** |
| `Hauptstrasse 1 Wien` | *An der Houptstrass*, Ringgenberg (BE) |
| `zzzzqqq 999` | Chemin de Rive 999, 1350 Orbe |

Un propriétaire parisien qui saisit son adresse recevrait un EGID valaisan, et
le squelette d'une maison qui n'est pas la sienne. → *Traiter `fuzzy: true`
comme « aucun résultat » et basculer sur le chemin manuel.* C'est exactement le
cas « propriétaire hors Suisse » du prompt d'étape, et il faut le détecter
plutôt que l'espérer.

**c) Même sans `fuzzy`, le premier résultat n'est pas l'adresse demandée.**
`Dorfstrasse 10 3800 Interlaken` (`fuzzy` absent) renvoie en tête
*Unterdorfstrasse 10, 3800 Matten b. Interlaken* — correspondance de
sous-chaîne. → **Jamais d'auto-sélection.** Le propriétaire choisit dans une
liste ; c'est aussi ce qui rend le lien entre son adresse et l'EGID
explicitement confirmé par lui, ce qui compte pour la décision du §7.

## 5. Attributs réellement servis — c'est riche

Relevé complet sur `2037304_3` (immeuble, Genève) et confirmé sur d'autres
bâtiments. Ce qui sert au squelette est en gras.

| Champ | Valeur | Ce que c'est |
|---|---|---|
| `egid` / `edid` | `2037304` / `3` | Identifiant fédéral du bâtiment / de l'entrée |
| **`gastw`** | `8` | **Nombre de niveaux** (voir le piège ci-dessous) |
| **`gklas`** | `1122` | **Classe** : 1110 maison individuelle · 1121 deux logements · 1122 trois logements et plus |
| **`gkat`** | `1030` | **Catégorie** : usage d'habitation, partiel, sans habitation… |
| **`gbauj`** / `gbaup` | `1920` / `8012` | **Année de construction** / période |
| **`ganzwhg`** | `21` | **Nombre de logements** |
| **`genh1`** / `gwaerzh1` | `7580` / `7460` | **Agent énergétique et générateur, chauffage** |
| `genw1` / `gwaerzw1` | `7580` / `7660` | Idem, eau chaude |
| `garea` | `2542` | Surface au sol (m²) |
| `gazzi` | `null` | Nombre de pièces d'habitation, souvent absent |
| `ggdename` / `gdekt` | `Genève` / `GE` | Commune / canton |
| `strname_deinr`, `plz_plz6` | `Rue du Rhône 14`, `1204` | Adresse normalisée |
| `egrid`, `lparz` | `CH296589536314`, `7013` | **Bien-fonds et n° de parcelle** — voir §6 |
| `gkode` / `gkodn` | `2500184.8` / `1117799.44` | Coordonnées LV95 |

**Le piège de `gastw`.** Le catalogue des caractères du RegBL le définit comme
le nombre d'étages **rez-de-chaussée inclus**, où combles et sous-sols ne
comptent **que s'ils sont aménagés pour l'habitation** — et où **les caves ne
comptent jamais**. Conséquence directe sur le squelette : `gastw = 2` ne veut
pas dire « rez + 1er, et rien d'autre », il veut dire « deux niveaux habitables,
et on ne sait pas s'il y a une cave ». **Le sous-sol ne peut pas être déduit du
RegBL** ; c'est une question à poser au propriétaire, quelle que soit la
richesse de la réponse de l'API. Un squelette qui déduirait `ordinal: -1` de
`gastw` serait faux sur une majorité de maisons.

Les codes (`gklas`, `gkat`, `genh1`…) sont des entiers dont le catalogue
officiel est publié par l'OFS. Nous n'aurons besoin que d'une poignée d'entre
eux, et seulement de ceux qui changent la forme du squelette.

## 6. Interrogeable côté serveur, sans contorsion

| Point | Constat |
|---|---|
| Depuis une infra suisse | Oui. `X-Amz-Cf-Pop: ZRH52-P1` — le POP CloudFront est à Zurich. |
| Géoblocage | Aucun. |
| User-agent particulier | Aucun. `curl` par défaut passe. |
| CORS | `Access-Control-Allow-Origin: *`. L'appel serveur reste préférable (voir ci-dessous), mais le navigateur n'est pas exclu. |
| Latence | **78 à 89 ms** sur les deux appels. |
| HTTPS | Oui, obligatoire. |

**L'appel se fera côté serveur**, malgré le CORS permissif : parce que le RegBL
renvoie `egrid` et `lparz`, c'est-à-dire le **numéro de parcelle** et
l'identifiant fédéral de bien-fonds. Les faire transiter par le navigateur, puis
choisir dans un `loader` ce qu'on garde, c'est déjà les avoir sortis. Le serveur
appelle, ne retient que les champs dont le squelette a besoin, et le reste ne
quitte jamais le processus.

## 7. Repli et disponibilité

Le service n'a aucun SLA : il est gratuit et sans contrat, il peut être lent ou
absent. Deux conséquences pour l'implémentation, cohérentes avec la consigne
« le repli n'est pas un lot de consolation » :

- **Délai d'attente court et échec silencieux.** Un RegBL qui ne répond pas
  doit donner exactement l'écran du propriétaire hors Suisse, pas une erreur.
  L'enrichissement se greffe sur le chemin manuel ; il n'en est jamais la
  condition.
- **Plan B disponible si le service se ferme un jour** : l'OFS publie l'export
  national complet en téléchargement libre, `https://public.madd.bfs.admin.ch/ch.zip`
  — vérifié : **946 Mo, HTTP 200, régénéré ce matin même** (`Last-Modified`
  du jour). Héberger la donnée est donc possible sans renégocier quoi que ce
  soit. Ce n'est **pas** ce qu'on fait maintenant : 946 Mo pour un appel par
  inscription est un mauvais échange, et cela transformerait une question de
  réseau en question d'exploitation. C'est une porte de sortie, notée pour ne
  pas avoir à la rechercher.

## Sources

- [RegBL — De l'adresse à l'EGID (service par lot, pas une API)](https://www.gwr.admin.ch/fr/data/query/adrtoegid.html)
- [Conditions générales d'utilisation des géoservices IFDG](https://www.geo.admin.ch/fr/geo-services-proposes/geoservices/terms-of-use.html)
- [opendata.swiss — les quatre conditions d'utilisation](https://opendata.swiss/fr/terms-of-use)
- [opendata.swiss — jeu de données RegBL (licence `terms_open`)](https://opendata.swiss/fr/dataset/eidg-gebaude-und-wohnungsregister-gebaudestatus)
- [Catalogue des caractères du RegBL (définition de `GASTW`)](https://www.housing-stat.ch/fr/help/41.html)
- [OFS — mise à disposition des données (MADD)](https://www.housing-stat.ch/fr/madd/index.html)
- [Documentation technique de l'IFDG](https://docs.geo.admin.ch/)
