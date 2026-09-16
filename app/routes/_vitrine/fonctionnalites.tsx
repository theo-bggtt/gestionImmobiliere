// app/routes/_vitrine/fonctionnalites.tsx
// Le détail, pour qui a lu l'accueil et veut savoir ce qu'il y a dedans.
// Tout ce qui est décrit ici existe et tourne : rien n'est « prévu », et
// c'est l'argument de la page.
//
// Rien de chiffré : ni durée de saisie, ni promesse de fonctionnement hors
// réseau — `tests/vitrine/discours.test.ts` le tient.
//
// Neuf entrées, en deux colonnes de filets et NON en neuf cartes, chacune
// ouverte par un pictogramme dessiné dans le vocabulaire des traits (voir
// `Picto.tsx`) : une carte par capacité donne neuf rectangles identiques,
// c'est-à-dire un catalogue où rien ne pèse plus que le reste.
import { Link } from "react-router";
import { Picto } from "../../components/vitrine/Picto";
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
      <section className="planche v-sec">
        <p className="cote">Ce que ça fait</p>
        <h1 className="v-titre">
          Une base qu'on remplit en marchant, et qu'on interroge quand <em>ça fuit</em>.
        </h1>
        <p className="v-chapeau">
          Tout ce qui suit existe et fonctionne aujourd'hui. Pas de « bientôt » : c'est ce que
          l'application sait faire, et ce qu'elle ne fait pas.
        </p>
      </section>

      <section className="planche v-sec">
        <p className="cote">Le relevé</p>
        <ul className="v-fonctions large v-parait">
          <li>
            <Picto nom="photographier" />
            <h3 className="v-sous-titre">Capturer maintenant, compléter plus tard</h3>
            <p className="v-prose-texte">
              Le moment où l'on sait ce qu'est un objet, c'est celui où on l'a sous les yeux. Une
              photo, un nom déjà proposé, une zone déjà présélectionnée : vous confirmez, et le reste
              des champs attend le soir, ou n'attend personne.
            </p>
            <p className="v-prose-texte">
              La cave et le fond du jardin sont là où l'on note quelque chose, et là où le réseau
              manque. Ce qui est photographié sans réseau attend sur le téléphone, et part au
              retour du réseau.
            </p>
          </li>
          <li>
            <Picto nom="retrouver" />
            <h3 className="v-sous-titre">Retrouver d'un mot</h3>
            <p className="v-prose-texte">
              Nom, surnoms, type, zone, système, contenu des champs : la recherche lit tout, ignore
              les accents parce que personne ne les tape depuis un téléphone, et vous dit sur quoi
              elle a trouvé.
            </p>
            <p className="v-prose-texte">
              Sans chercher, on se promène : les zones, puis ce qu'elles contiennent. C'est souvent
              plus rapide, parce qu'on sait où on était.
            </p>
          </li>
          <li>
            <Picto nom="types" />
            <h3 className="v-sous-titre">Des types d'objets, et les vôtres</h3>
            <p className="v-prose-texte">
              Un catalogue de types courants est fourni, vanne d'arrêt, tableau électrique,
              chaudière, siphon, chacun avec les champs qui vont avec. Créez les vôtres, avec les
              champs que vous voulez.
            </p>
            <p className="v-prose-texte">
              Un champ retiré d'un type est masqué, jamais effacé : ce que vous aviez saisi reste.
            </p>
          </li>
          <li>
            <Picto nom="plan" />
            <h3 className="v-sous-titre">Des plans, et des points dessus</h3>
            <p className="v-prose-texte">
              Un plan par niveau, un plan de situation pour l'extérieur, à partir de ce que vous avez
              déjà : un scan, un PDF, la photo d'un tirage. Posez un objet par glissement, zoomez,
              déplacez. Un objet qui traverse les niveaux, une gaine, une colonne, porte un point sur
              chaque plan.
            </p>
          </li>
          <li>
            <Picto nom="contour" />
            <h3 className="v-sous-titre">Le contour d'une zone, en quelques clics</h3>
            <p className="v-prose-texte">
              Tracez le contour d'une zone par-dessus le scan, sans mesure. Quand vous posez un objet
              dedans, l'application propose de le ranger dans cette zone.
            </p>
            <p className="v-prose-texte">
              Elle propose, vous décidez : rien ne change de zone sans votre accord, parce que la
              zone d'un objet est ce qui décide qui a le droit de le voir.
            </p>
          </li>
          <li>
            <Picto nom="historique" />
            <h3 className="v-sous-titre">L'historique</h3>
            <p className="v-prose-texte">
              Dépannage, rénovation, sinistre, entretien : un événement se rattache aux objets
              concernés et aux personnes intervenues, avec les photos d'avant et d'après.
            </p>
            <p className="v-prose-texte">Des années plus tard, c'est la seule façon de savoir qui avait posé quoi.</p>
          </li>
          <li>
            <Picto nom="garantie" />
            <h3 className="v-sous-titre">Les garanties, et ce qui va expirer</h3>
            <p className="v-prose-texte">
              Une garantie tient à l'objet qu'elle couvre, avec sa date de fin et son document.
              L'accueil vous montre celles qui arrivent à terme, et la fiche de l'objet dit si la
              sienne court encore, au moment où vous êtes devant la chaudière qui fuit.
            </p>
            <p className="v-prose-texte">
              Pas de rappel par message : rien ne vous écrit, il faut ouvrir l'application. C'est une
              limite, et elle est dite.
            </p>
          </li>
          <li>
            <Picto nom="intervenants" />
            <h3 className="v-sous-titre">Vos intervenants</h3>
            <p className="v-prose-texte">
              Le plombier, l'électricien, le paysagiste : une fiche par personne, reliée aux
              événements où elle est intervenue. Son téléphone et vos notes sur elle restent chez
              vous : aucun lien de partage ne les emporte, quel que soit son plafond.
            </p>
          </li>
          <li>
            <Picto nom="demarrage" />
            <h3 className="v-sous-titre">Un démarrage sans page blanche</h3>
            <p className="v-prose-texte">
              Créer une propriété propose une structure, bâtiments, niveaux, zones, que vous corrigez
              avant d'enregistrer. Pour une adresse en Suisse, le registre public des bâtiments
              l'enrichit : année de construction, nombre de niveaux.
            </p>
            <p className="v-prose-texte">L'adresse sert à poser la question, puis disparaît. Elle n'est écrite nulle part.</p>
          </li>
        </ul>
      </section>

      <section className="planche v-sec">
        <p className="cote">La suite</p>
        <div className="v-suite-picto">
          <Picto nom="partager" />
        </div>
        <h2 className="v-section-titre">Et le partage</h2>
        <p className="v-prose-texte">
          C'est la partie qui a sa propre page, parce qu'elle est la moins évidente et la plus
          utile : la même base, ouverte à chacun jusqu'où vous le décidez.
        </p>
        <p className="v-suite">
          <Link to="/partage">Comment fonctionne le partage</Link>
        </p>
      </section>

      <section className="planche v-sec v-encre">
        <h2 className="v-encre-titre">Tout ça, à partir d'une photo.</h2>
        <p className="v-prose-texte">
          Le premier objet ne demande ni plan, ni type, ni champ. Il demande une photo et une zone.
        </p>
        <div className="v-actions">
          <Link to={ACCUEIL} className="bouton-plein">
            Ouvrir mon espace
          </Link>
        </div>
      </section>
    </>
  );
}
