// app/routes/_vitrine/fonctionnalites.tsx
// Le détail, pour qui a lu l'accueil et veut savoir ce qu'il y a dedans.
// Tout ce qui est décrit ici existe et tourne : rien n'est « prévu », et
// c'est l'argument de la page.
//
// Rien de chiffré : ni durée de saisie, ni promesse de fonctionnement hors
// réseau. Ces deux-là n'ont jamais été mesurées sur un téléphone réel
// (issue #25), et une vitrine qui les avance avant la mise en service écrit
// un chèque que le produit n'a pas encore encaissé.
//
// Neuf entrées, en deux colonnes de filets et NON en neuf cartes : une carte
// par capacité donne neuf rectangles identiques, c'est-à-dire un catalogue où
// rien ne pèse plus que le reste. Voir l'en-tête de `vitrine.css`.
import { Link } from "react-router";
import { ACCUEIL } from "../../lib/auth/redirection";

export const meta = () => [
  { title: "Ce que ça fait — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Fiches par objet, recherche sans accent, plans annotés, contours de zone, historique, garanties, intervenants, liens de partage filtrés. Ce que l'application fait aujourd'hui.",
  },
];

export default function Fonctionnalites() {
  return (
    <>
      <section className="v-sec">
        <p className="v-cote">Ce que ça fait</p>
        <h1 className="v-titre">
          Une base qu'on remplit en marchant, et qu'on interroge quand <em>ça fuit</em>.
        </h1>
        <p className="v-chapeau">
          Tout ce qui suit existe et fonctionne aujourd'hui. Rien ici n'est prévu, promis ou en
          cours : c'est la liste de ce que l'application sait faire, et de ce qu'elle ne fait pas.
        </p>
      </section>

      <section className="v-sec">
        <p className="v-cote">Le relevé</p>
        <ul className="v-fonctions large">
          <li>
            <h3>Capturer maintenant, compléter plus tard</h3>
            <p>
              Le moment où l'on sait ce qu'est un objet, c'est celui où on l'a sous les yeux. Une
              photo, un nom déjà proposé, une zone déjà présélectionnée : vous confirmez, et le reste
              des champs attend le soir, ou n'attend personne.
            </p>
            <p>
              La cave et le fond du jardin sont exactement là où l'on a besoin de noter quelque
              chose, et là où le réseau manque. La capture est conçue pour y tenir : ce qui est
              photographié sans réseau attend sur le téléphone. C'est le dessein, constaté au
              navigateur ; tant qu'il n'a pas été éprouvé dans une vraie cave, cette page ne le
              promet pas.
            </p>
          </li>
          <li>
            <h3>Retrouver d'un mot</h3>
            <p>
              Nom, surnoms, type, zone, système, contenu des champs : la recherche lit tout, ignore
              les accents parce que personne ne les tape depuis un téléphone, et vous dit sur quoi
              elle a trouvé.
            </p>
            <p>
              Sans chercher, on se promène : les zones, puis ce qu'elles contiennent. C'est souvent
              plus rapide, parce qu'on sait où on était.
            </p>
          </li>
          <li>
            <h3>Des types d'objets, et les vôtres</h3>
            <p>
              Un catalogue de types courants est fourni, vanne d'arrêt, tableau électrique,
              chaudière, siphon, chacun avec les champs qui vont avec. Créez les vôtres, avec les
              champs que vous voulez.
            </p>
            <p>
              Un champ retiré d'un type est masqué, jamais effacé : ce que vous aviez saisi reste.
            </p>
          </li>
          <li>
            <h3>Des plans, et des points dessus</h3>
            <p>
              Un plan par niveau, un plan de situation pour l'extérieur, à partir de ce que vous avez
              déjà : un scan, un PDF, la photo d'un tirage. Posez un objet par glissement, zoomez,
              déplacez. Un objet qui traverse les niveaux, une gaine, une colonne, porte un point sur
              chaque plan.
            </p>
          </li>
          <li>
            <h3>Le contour d'une zone, en quelques clics</h3>
            <p>
              Tracez le contour d'une zone par-dessus le scan, sans mesure. Quand vous posez un objet
              dedans, l'application propose de le ranger dans cette zone.
            </p>
            <p>
              Elle propose, vous décidez : rien ne change de zone sans votre accord, parce que la
              zone d'un objet est ce qui décide qui a le droit de le voir.
            </p>
          </li>
          <li>
            <h3>L'historique</h3>
            <p>
              Dépannage, rénovation, sinistre, entretien : un événement se rattache aux objets
              concernés et aux personnes intervenues, avec les photos d'avant et d'après.
            </p>
            <p>Des années plus tard, c'est la seule façon de savoir qui avait posé quoi.</p>
          </li>
          <li>
            <h3>Les garanties, et ce qui va expirer</h3>
            <p>
              Une garantie tient à l'objet qu'elle couvre, avec sa date de fin et son document.
              L'accueil vous montre celles qui arrivent à terme, et la fiche de l'objet dit si la
              sienne court encore, au moment où vous êtes devant la chaudière qui fuit.
            </p>
            <p>
              Pas de rappel par message : rien ne vous écrit, il faut ouvrir l'application. C'est une
              limite, elle est écrite.
            </p>
          </li>
          <li>
            <h3>Vos intervenants</h3>
            <p>
              Le plombier, l'électricien, le paysagiste : une fiche par personne, reliée aux
              événements où elle est intervenue. Son téléphone et vos notes sur elle restent chez
              vous : aucun lien de partage ne les emporte, quel que soit son plafond.
            </p>
          </li>
          <li>
            <h3>Un démarrage sans page blanche</h3>
            <p>
              Créer une propriété propose une structure, bâtiments, niveaux, zones, que vous corrigez
              avant d'enregistrer. Pour une adresse en Suisse, le registre public des bâtiments
              l'enrichit : année de construction, nombre de niveaux.
            </p>
            <p>L'adresse sert à poser la question, puis disparaît. Elle n'est écrite nulle part.</p>
          </li>
        </ul>
      </section>

      <section className="v-sec">
        <p className="v-cote">La suite</p>
        <h2>Et le partage</h2>
        <p>
          C'est la partie qui a sa propre page, parce qu'elle est la moins évidente et la plus
          utile : la même base, ouverte à chacun jusqu'où vous le décidez.
        </p>
        <p className="v-suite">
          <Link to="/partage">Comment fonctionne le partage</Link>
        </p>
      </section>

      <section className="v-sec v-encre">
        <h2 className="v-encre-titre">Tout ça, à partir d'une photo.</h2>
        <p>
          Le premier objet ne demande ni plan, ni type, ni champ. Il demande une photo et une zone.
        </p>
        <div className="v-actions">
          <Link to={ACCUEIL} className="v-appel">
            Ouvrir mon espace
          </Link>
        </div>
      </section>
    </>
  );
}
