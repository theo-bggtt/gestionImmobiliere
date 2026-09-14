// app/routes/_vitrine/accueil.tsx
// La page qui vend. Deux idées, dans cet ordre : d'abord la mémoire — ce
// qu'une maison sait et que personne n'a écrit —, ensuite la projection par
// audience, qui ne veut rien dire sans la première.
//
// Elle vend sans chiffrer : ni durée de saisie, ni promesse de fonctionnement
// sans réseau, ni compte d'utilisateurs, ni prix. `tests/vitrine/discours.test.ts`
// tient ces quatre-là ; le reste consiste à n'écrire que ce que le code fait
// déjà. Le schéma est un SVG dessiné dans la page, sans balise image ni
// attribut `style` : la politique de cet arbre n'a ni `img-src` externe ni
// `'unsafe-inline'`, et ce n'est la maison de personne.
import { Link } from "react-router";
import { ACCUEIL } from "../../lib/auth/redirection";

export const meta = () => [
  { title: "gestionImmobiliere — la mémoire technique de votre maison" },
  {
    name: "description",
    content:
      "Où passe la gaine, quelle vanne coupe quoi, qui a posé la chaudière : consigné au moment où vous l'avez sous les yeux, retrouvé d'un mot, et montré à chacun selon ce qui le concerne.",
  },
];

/** Les quatre barreaux de l'échelle d'un lecteur : public, usage, technique,
 *  privé. Remplis jusqu'au plafond, de un à quatre. */
function Echelle({ plafond }: { plafond: 1 | 2 | 3 | 4 }) {
  return (
    <div className="v-echelle" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={n <= plafond ? "v-barreau plein" : "v-barreau"} />
      ))}
    </div>
  );
}

export default function Accueil() {
  return (
    <>
      <section className="v-heros">
        <div className="v-heros-texte">
          <p className="v-surtitre">La mémoire technique de votre maison</p>
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

        <div className="v-schema">
          <svg viewBox="0 0 400 280" role="img" aria-labelledby="schema-titre">
            <title id="schema-titre">
              Un plan schématique : trois zones, trois objets repérés par un point numéroté.
            </title>
            {/* La parcelle, en pointillé : l'extérieur est une zone comme une autre. */}
            <rect className="s-terrain" x="8" y="8" width="384" height="264" rx="6" />
            <text className="s-etiquette" x="318" y="34">
              Jardin
            </text>

            {/* Le bâtiment et ses zones. */}
            <rect className="s-mur" x="40" y="48" width="260" height="190" />
            <rect className="s-zone" x="40" y="143" width="100" height="95" />
            <rect className="s-zone" x="140" y="143" width="80" height="95" />
            <line className="s-cloison" x1="160" y1="48" x2="160" y2="143" />
            <line className="s-cloison" x1="40" y1="143" x2="300" y2="143" />
            <line className="s-cloison" x1="140" y1="143" x2="140" y2="238" />
            <line className="s-cloison" x1="220" y1="143" x2="220" y2="238" />
            <text className="s-etiquette" x="52" y="68">
              Cuisine
            </text>
            <text className="s-etiquette" x="172" y="68">
              Séjour
            </text>
            <text className="s-etiquette" x="52" y="163">
              Technique
            </text>
            <text className="s-etiquette" x="150" y="163">
              Entrée
            </text>
            <text className="s-etiquette" x="232" y="163">
              Chambre
            </text>

            {/* Trois objets repérés. */}
            <circle className="s-halo" cx="84" cy="204" r="17" />
            <circle className="s-point" cx="84" cy="204" r="11" />
            <text className="s-num" x="84" y="204">
              1
            </text>
            <circle className="s-halo" cx="180" cy="196" r="17" />
            <circle className="s-point" cx="180" cy="196" r="11" />
            <text className="s-num" x="180" y="196">
              2
            </text>
            <circle className="s-halo" cx="350" cy="224" r="17" />
            <circle className="s-point" cx="350" cy="224" r="11" />
            <text className="s-num" x="350" y="224">
              3
            </text>
          </svg>
          <ul className="v-schema-legende">
            <li>
              <span className="v-pastille">1</span>
              <span>
                <strong>Vanne d'arrêt</strong> · local technique
              </span>
            </li>
            <li>
              <span className="v-pastille">2</span>
              <span>
                <strong>Tableau électrique</strong> · entrée
              </span>
            </li>
            <li>
              <span className="v-pastille">3</span>
              <span>
                <strong>Vanne d'arrosage</strong> · jardin
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="v-section">
        <div className="v-section-tete">
          <h2>Le carton de factures ne répond pas</h2>
          <p className="v-intro">
            Ces réponses existent. Dans une tête, dans un classeur, ou chez l'artisan passé il y a six
            ans. Elles manquent toujours le même jour.
          </p>
        </div>
        <ul className="v-cartes">
          <li className="v-carte">
            <p className="v-carte-jour">Le jour où ça fuit</p>
            <h3>« Elle est où, la vanne ? »</h3>
            <p>
              L'eau coule pendant que vous cherchez. Elle est derrière le troisième carton du
              sous-sol, et seul l'ancien propriétaire le savait.
            </p>
          </li>
          <li className="v-carte">
            <p className="v-carte-jour">Le jour où l'artisan appelle</p>
            <h3>« C'est quel modèle, votre chaudière ? »</h3>
            <p>
              La réponse est sur une plaque au fond du local, ou dans un courriel d'il y a cinq ans.
              Le dépanneur attend. Le devis aussi.
            </p>
          </li>
          <li className="v-carte">
            <p className="v-carte-jour">Le jour où vous louez</p>
            <h3>« Comment on coupe l'eau ? »</h3>
            <p>
              Le guide d'accueil l'explique. Trois lignes plus bas, il donne aussi le code du portail
              et le nom de votre assureur.
            </p>
          </li>
        </ul>
      </section>

      <section className="v-section">
        <div className="v-section-tete">
          <h2>Trois gestes, et c'est écrit</h2>
          <p className="v-intro">
            Pas de formulaire à trente champs. On photographie, on nomme, on range. Le reste vient
            plus tard, ou jamais.
          </p>
        </div>
        <ol className="v-etapes">
          <li className="v-etape">
            <p className="v-etape-num">1</p>
            <h3>Photographiez</h3>
            <p>
              Devant l'objet, téléphone en main : une photo, un nom déjà proposé, une zone déjà
              présélectionnée. Vous confirmez, c'est enregistré. Les caractéristiques se complètent
              à tête reposée.
            </p>
          </li>
          <li className="v-etape">
            <p className="v-etape-num">2</p>
            <h3>Retrouvez</h3>
            <p>
              Tapez un mot, avec ou sans accent : la fiche, sa zone, son système, ses photos, ce qui
              lui est arrivé. Ou promenez-vous de zone en zone, comme dans la maison.
            </p>
          </li>
          <li className="v-etape">
            <p className="v-etape-num">3</p>
            <h3>Partagez, à la carte</h3>
            <p>
              Un lien par personne, avec un plafond de détail et des zones autorisées. Rien à
              installer ni à créer pour elle. Révocable d'un geste par vous.
            </p>
          </li>
        </ol>
      </section>

      <section className="v-section">
        <div className="v-section-tete">
          <h2>Une seule base. Quatre façons de la regarder.</h2>
          <p className="v-intro">
            Vous ne montrez pas la même maison au locataire de passage, à l'artisan qui vient pour la
            chaudière et au jardinier. Vous ne tenez pourtant pas trois documents à jour : c'est la
            même base, vue à travers un filtre.
          </p>
        </div>
        <ul className="v-lecteurs">
          <li className="v-lecteur v-lecteur-vous">
            <Echelle plafond={4} />
            <p className="v-plafond">Tout, partout</p>
            <h3>Vous</h3>
            <p>C'est votre maison, et c'est vous qui l'avez écrite.</p>
          </li>
          <li className="v-lecteur">
            <Echelle plafond={3} />
            <p className="v-plafond">Jusqu'au technique · son système</p>
            <h3>L'artisan</h3>
            <p>
              La fiche de ce qu'il vient réparer, ses références, son historique. Pas les fiches du
              jardin.
            </p>
          </li>
          <li className="v-lecteur">
            <Echelle plafond={2} />
            <p className="v-plafond">Jusqu'à l'usage · ses zones</p>
            <h3>Le locataire</h3>
            <p>Où est le compteur, comment on coupe l'eau, comment marche l'induction.</p>
          </li>
          <li className="v-lecteur">
            <Echelle plafond={2} />
            <p className="v-plafond">Jusqu'à l'usage · l'extérieur</p>
            <h3>Le jardinier</h3>
            <p>La vanne d'arrosage et le portail du fond. L'intérieur n'existe pas pour lui.</p>
          </li>
        </ul>
        <p className="v-suite">
          <Link to="/partage">Comment fonctionne le partage</Link>
        </p>
      </section>

      <section className="v-section">
        <div className="v-duo">
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

      <section className="v-bande">
        <h2>Et quand vous n'y serez plus.</h2>
        <p>
          Une maison change de mains, et tout ce que vous savez d'elle part avec vous. Un classeur que
          personne ne tient à jour ne se transmet pas. Une base remplie au fil des jours, en
          photographiant ce qu'on a sous les yeux, si.
        </p>
      </section>

      <section className="v-final">
        <div>
          <h2>Commencez par la vanne d'arrêt.</h2>
          <p>
            Le premier objet prend le temps d'une photo. Les suivants viennent en marchant dans la
            maison. <Link to="/confidentialite">Ce que l'application stocke, et ce qu'elle refuse</Link>.
          </p>
        </div>
        <Link to={ACCUEIL} className="v-appel">
          Ouvrir mon espace
        </Link>
      </section>
    </>
  );
}
