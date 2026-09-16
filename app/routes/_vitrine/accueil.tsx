// app/routes/_vitrine/accueil.tsx
// La page qui vend. Deux idées, dans cet ordre : d'abord la mémoire — ce
// qu'une maison sait et que personne n'a écrit —, ensuite la projection par
// audience, qui ne veut rien dire sans la première.
//
// Elle vend sans chiffrer : ni durée de saisie, ni promesse de fonctionnement
// sans réseau, ni compte d'utilisateurs, ni prix. `tests/vitrine/discours.test.ts`
// tient ces quatre-là ; le reste consiste à n'écrire que ce que le code fait
// déjà.
//
// Deux relevés, et c'est délibéré. Celui du héros est le TIRAGE : pleine
// largeur, une maison ordinaire, trois objets repérés. Ceux des quatre
// lecteurs sont le MÊME plan projeté quatre fois, avec en tiretés ce que
// chacun ne voit pas — l'argument du produit rendu par une convention de
// dessin au lieu d'un tableau de cartes. Voir `PlanMini`.
//
// Aucune balise image et aucun attribut `style` : la politique de cet arbre
// n'a ni `img-src` externe ni `'unsafe-inline'`, et ce n'est la maison de
// personne.
//
// La liste d'attente est le seul envoi de tout l'arbre : un formulaire natif
// en POST, sans une ligne de script — l'arbre porte `handle.sansScripts` et sa
// politique n'a pas de `script-src`, donc un envoi par `fetch` ne partirait
// même pas. Elle est l'appel du visiteur sans compte, là où « Mon espace » est
// celui du propriétaire.
import { Form, Link, data, useActionData } from "react-router";
import type { ActionFunctionArgs, HeadersArgs } from "react-router";
import { Echelle } from "../../components/vitrine/Echelle";
import { PlanMini } from "../../components/vitrine/PlanMini";
import { ACCUEIL } from "../../lib/auth/redirection";
import { ENTETES_VITRINE } from "../../lib/vitrine/document";
import {
  adressePlausible,
  enregistrerInteresse,
  normaliser,
} from "../../lib/vitrine/liste-attente.server";

export const meta = () => [
  { title: "gestionImmobiliere — la mémoire technique de votre maison" },
  {
    name: "description",
    content:
      "Où passe la gaine, quelle vanne coupe quoi, qui a posé la chaudière : consigné au moment où vous l'avez sous les yeux, retrouvé d'un mot, et montré à chacun selon ce qui le concerne.",
  },
];

/**
 * La liste d'attente. L'action re-rend la page.
 *
 * Elle rend LA MÊME chose que l'adresse ait été ajoutée ou qu'elle y fût
 * déjà — `enregistrerInteresse` ne le lui dit pas, et c'est délibéré : voir
 * ce module. Ici on ne peut donc pas se tromper, même en le voulant.
 */
export async function action({ request }: ActionFunctionArgs) {
  const email = normaliser((await request.formData()).get("email"));

  if (!adressePlausible(email)) {
    return data(
      { issue: "adresse-invalide" as const },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  await enregistrerInteresse(email);
  // `no-store` : une réponse à un envoi ne concerne que celui qui l'a fait,
  // et cette page est par ailleurs servie en cache PUBLIC. Ce que la route
  // pose remplace le défaut du serveur (`ENTETES_A_VALEUR_UNIQUE`).
  return data({ issue: "enregistre" as const }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Le cache de la page, sauf quand la réponse est celle d'un envoi : l'action
 * pose alors son propre `Cache-Control`, et c'est lui qui vaut.
 */
export function headers({ actionHeaders }: HeadersArgs) {
  const cache = actionHeaders.get("Cache-Control");
  return cache ? { ...ENTETES_VITRINE, "Cache-Control": cache } : ENTETES_VITRINE;
}

export default function Accueil() {
  const resultat = useActionData<typeof action>();
  return (
    <>
      <section className="v-sec v-heros">
        <div className="v-heros-texte">
          <p className="v-cote">La mémoire technique de votre maison</p>
          <h1 className="v-titre">
            Votre maison sait des choses que personne n'a écrites. <em>Jusqu'ici.</em>
          </h1>
          <p className="v-chapeau">
            Où passe la gaine derrière le placard. Quelle vanne coupe quoi. Qui a posé la chaudière,
            et en quelle année. gestionImmobiliere consigne ces réponses au moment où vous les avez
            sous les yeux, les retrouve d'un mot, et n'en montre à chacun que ce qui le concerne.
          </p>
          <div className="v-actions">
            <Link to={ACCUEIL} className="v-appel">
              Ouvrir mon espace
            </Link>
            <Link to="/fonctionnalites" className="v-appel-second">
              Voir comment ça marche
            </Link>
          </div>
        </div>

        {/* Le tirage. Trois épaisseurs de trait, et chacune dit quelque chose :
            la parcelle en trait mixte, les murs en trait de coupe, les
            cloisons en trait fin. Voir l'en-tête de `vitrine.css`. */}
        <div className="v-heros-dessin pleine">
          <svg viewBox="0 0 1200 420" role="img" aria-labelledby="releve-titre">
            <title id="releve-titre">
              Un relevé schématique : une parcelle, une maison de cinq zones, et trois objets
              repérés par un point numéroté.
            </title>

            <rect className="d-parcelle" x="16" y="16" width="1168" height="388" />

            {/* Les deux zones que citent les points 1 et 2, teintées : c'est
                la seule couleur de remplissage du dessin. */}
            <rect className="d-sol" x="540" y="246" width="200" height="142" />
            <rect className="d-sol" x="740" y="246" width="210" height="142" />

            <rect className="d-mur" x="540" y="56" width="620" height="332" />
            <line className="d-cloison" x1="540" y1="246" x2="1160" y2="246" />
            <line className="d-cloison" x1="850" y1="56" x2="850" y2="246" />
            <line className="d-cloison" x1="740" y1="246" x2="740" y2="388" />
            <line className="d-cloison" x1="950" y1="246" x2="950" y2="388" />

            <text className="d-nom" x="558" y="84">
              Cuisine
            </text>
            <text className="d-nom" x="868" y="84">
              Séjour
            </text>
            <text className="d-nom" x="558" y="274">
              Local technique
            </text>
            <text className="d-nom" x="758" y="274">
              Entrée
            </text>
            <text className="d-nom" x="968" y="274">
              Chambre
            </text>

            {/* Une ligne de cote sur le bâtiment, avec ses deux embouts :
                c'est ce qui fait d'un schéma un relevé. */}
            <line className="d-cotation" x1="540" y1="34" x2="770" y2="34" />
            <line className="d-cotation" x1="930" y1="34" x2="1160" y2="34" />
            <line className="d-cotation" x1="540" y1="26" x2="540" y2="42" />
            <line className="d-cotation" x1="1160" y1="26" x2="1160" y2="42" />
            <text className="d-mesure" x="850" y="39">
              Rez-de-chaussée
            </text>

            <circle className="d-point" cx="630" cy="330" r="20" />
            <text className="d-num" x="630" y="330">
              1
            </text>
            <circle className="d-point" cx="845" cy="330" r="20" />
            <text className="d-num" x="845" y="330">
              2
            </text>
            {/* Le troisième objet est dehors, et le nom de la zone se pose à
                côté de lui : une étiquette reléguée dans le coin de la
                parcelle ne désignerait plus rien. */}
            <circle className="d-point" cx="250" cy="300" r="20" />
            <text className="d-num" x="250" y="300">
              3
            </text>
            <text className="d-nom d-jardin" x="312" y="308">
              Jardin
            </text>
          </svg>
        </div>

        <ul className="v-legende large">
          <li>
            <span className="v-pastille">1</span>
            <span>
              <b>Vanne d'arrêt</b>
              <span>Local technique</span>
            </span>
          </li>
          <li>
            <span className="v-pastille">2</span>
            <span>
              <b>Tableau électrique</b>
              <span>Entrée</span>
            </span>
          </li>
          <li>
            <span className="v-pastille">3</span>
            <span>
              <b>Vanne d'arrosage</b>
              <span>Jardin</span>
            </span>
          </li>
        </ul>
      </section>

      <section className="v-sec">
        <p className="v-cote">Le problème</p>
        <h2>Le carton de factures ne répond pas</h2>
        <p>
          Ces réponses existent. Dans une tête, dans un classeur, ou chez l'artisan passé il y a six
          ans. Elles manquent toujours le même jour.
        </p>
        <ul className="v-releves large">
          <li>
            <p className="v-jour">Le jour où ça fuit</p>
            <h3>« Elle est où, la vanne ? »</h3>
            <p>
              L'eau coule pendant que vous cherchez. Elle est derrière le troisième carton du
              sous-sol, et seul l'ancien propriétaire le savait.
            </p>
          </li>
          <li>
            <p className="v-jour">Le jour où l'artisan appelle</p>
            <h3>« C'est quel modèle, votre chaudière ? »</h3>
            <p>
              La réponse est sur une plaque au fond du local, ou dans un courriel d'il y a cinq ans.
              Le dépanneur attend. Le devis aussi.
            </p>
          </li>
          <li>
            <p className="v-jour">Le jour où vous louez</p>
            <h3>« Comment on coupe l'eau ? »</h3>
            <p>
              Le guide d'accueil l'explique. Trois lignes plus bas, il donne aussi le code du portail
              et le nom de votre assureur.
            </p>
          </li>
        </ul>
      </section>

      <section className="v-sec">
        <p className="v-cote">La saisie</p>
        <h2>Trois gestes, et c'est écrit</h2>
        <p>
          Pas de formulaire à trente champs. On photographie, on nomme, on range. Le reste vient plus
          tard, ou jamais.
        </p>
        <ol className="v-gestes large">
          <li>
            <p className="v-rang">1</p>
            <h3>Photographiez</h3>
            <p>
              Devant l'objet, téléphone en main : une photo, un nom déjà proposé, une zone déjà
              présélectionnée. Vous confirmez, c'est enregistré. Les caractéristiques se complètent à
              tête reposée.
            </p>
          </li>
          <li>
            <p className="v-rang">2</p>
            <h3>Retrouvez</h3>
            <p>
              Tapez un mot, avec ou sans accent : la fiche, sa zone, son système, ses photos, ce qui
              lui est arrivé. Ou promenez-vous de zone en zone, comme dans la maison.
            </p>
          </li>
          <li>
            <p className="v-rang">3</p>
            <h3>Partagez, à la carte</h3>
            <p>
              Un lien par personne, avec un plafond de détail et des zones autorisées. Rien à
              installer ni à créer pour elle. Révocable d'un geste par vous.
            </p>
          </li>
        </ol>
      </section>

      <section className="v-sec">
        <p className="v-cote">Le partage</p>
        <h2>Une seule base. Quatre façons de la regarder.</h2>
        <p>
          Vous ne montrez pas la même maison au locataire de passage, à l'artisan qui vient pour la
          chaudière et au jardinier. Vous ne tenez pourtant pas trois documents à jour : c'est la même
          base, vue à travers un filtre. Ce que chacun ne voit pas est dessiné en tiretés.
        </p>
        <ul className="v-lecteurs large">
          <li>
            <PlanMini
              titre="Le plan complet : toutes les zones sont visibles."
              visibles={["cuisine", "sejour", "technique", "entree", "chambre", "jardin"]}
            />
            <Echelle plafond={4} />
            <p className="v-portee">Tout, partout</p>
            <h3>Vous</h3>
            <p>C'est votre maison, et c'est vous qui l'avez écrite.</p>
          </li>
          <li>
            <PlanMini
              titre="Le plan vu par l'artisan : seul le local technique est visible."
              visibles={["technique"]}
            />
            <Echelle plafond={3} />
            <p className="v-portee">Jusqu'au technique, dans son système</p>
            <h3>L'artisan</h3>
            <p>
              La fiche de ce qu'il vient réparer, ses références, son historique. Pas les fiches du
              jardin.
            </p>
          </li>
          <li>
            <PlanMini
              titre="Le plan vu par le locataire : l'intérieur est visible, le local technique et le jardin non."
              visibles={["cuisine", "sejour", "entree", "chambre"]}
            />
            <Echelle plafond={2} />
            <p className="v-portee">Jusqu'à l'usage, dans ses zones</p>
            <h3>Le locataire</h3>
            <p>Où est le compteur, comment on coupe l'eau, comment marche l'induction.</p>
          </li>
          <li>
            <PlanMini
              titre="Le plan vu par le jardinier : seul le jardin est visible."
              visibles={["jardin"]}
            />
            <Echelle plafond={2} />
            <p className="v-portee">Jusqu'à l'usage, à l'extérieur</p>
            <h3>Le jardinier</h3>
            <p>La vanne d'arrosage et le portail du fond. L'intérieur n'existe pas pour lui.</p>
          </li>
        </ul>
        <p className="v-suite">
          <Link to="/partage">Comment fonctionne le partage</Link>
        </p>
      </section>

      <section className="v-sec">
        <div className="v-duo large">
          <article>
            <h2>Un plan, et des points dessus</h2>
            <p>
              Téléversez le plan que vous avez déjà : un scan, un extrait cadastral, la photo d'un
              tirage. Posez les objets dessus. « La vanne est là », un point sur une image, et c'est
              plus clair que trois phrases. Le jardinier le lit aussi bien que vous.
            </p>
          </article>
          <article>
            <h2>Une histoire, pas un inventaire</h2>
            <p>
              Un dépannage, une rénovation, un sinistre : chaque événement relie les objets touchés,
              les gens intervenus et les photos d'avant et d'après. Les garanties tiennent à l'objet
              qu'elles couvrent, et l'accueil vous montre celles qui arrivent à terme.
            </p>
          </article>
        </div>
      </section>

      <section className="v-sec v-encre">
        <h2 className="v-encre-titre">Et quand vous n'y serez plus.</h2>
        <p>
          Une maison change de mains, et tout ce que vous savez d'elle part avec vous. Un classeur que
          personne ne tient à jour ne se transmet pas. Une base remplie au fil des jours, en
          photographiant ce qu'on a sous les yeux, si.
        </p>
      </section>

      <section className="v-sec">
        <p className="v-cote">Commencer</p>
        <h2>Commencez par la vanne d'arrêt.</h2>
        <p>
          Le premier objet prend le temps d'une photo. Les suivants viennent en marchant dans la
          maison. <Link to="/confidentialite">Ce que l'application stocke, et ce qu'elle refuse</Link>.
        </p>

        <p className="v-note">
          L'inscription n'est pas encore ouverte. Laissez une adresse et vous serez prévenu quand elle
          le sera. Pour être franc sur ce qui va se passer : rien, tout de suite. Il n'y a pas d'envoi
          automatique de courrier dans ce projet, donc vous ne recevrez aucun message de confirmation.
          Votre adresse est écrite dans une table, avec la date, et rien d'autre — pas votre adresse
          IP, pas votre navigateur, pas d'où vous venez.
        </p>

        <Form method="post" className="v-formulaire">
          <label htmlFor="email">Votre adresse e-mail</label>
          <div className="v-formulaire-ligne">
            <input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="vous@exemple.net"
            />
            <button type="submit">M'ajouter</button>
          </div>
        </Form>

        {resultat?.issue === "enregistre" && (
          <p className="v-confirmation" role="status">
            C'est noté. Vous serez prévenu à cette adresse le jour où l'inscription ouvre.
          </p>
        )}
        {resultat?.issue === "adresse-invalide" && (
          <p className="v-erreur" role="alert">
            Cette adresse ne ressemble pas à une adresse e-mail. Rien n'a été enregistré.
          </p>
        )}

        {/* Second, et pas par modestie : dans cette section, l'appel premier
            est la liste d'attente. « Mon espace » est celui du propriétaire,
            qui l'a déjà en haut de chaque page. */}
        <div className="v-actions">
          <Link to={ACCUEIL} className="v-appel-second">
            Mon espace
          </Link>
        </div>
      </section>
    </>
  );
}
