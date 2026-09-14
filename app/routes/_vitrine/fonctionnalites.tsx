// app/routes/_vitrine/fonctionnalites.tsx
// Le détail, pour qui a lu l'accueil et veut savoir ce qu'il y a dedans.
//
// Rien de chiffré ici : ni durée de saisie, ni promesse de fonctionnement
// hors réseau. Ces deux-là n'ont jamais été mesurées sur un téléphone réel
// (issue #25), et une vitrine qui les avance avant la mise en service écrit
// un chèque que le produit n'a pas encore encaissé.
import { Link } from "react-router";

export const meta = () => [
  { title: "Ce que ça fait — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Fiches par objet, recherche, plans annotés, historique et garanties, liens de partage filtrés. Le détail de ce que l'application sait faire.",
  },
];

export default function Fonctionnalites() {
  return (
    <>
      <h1 className="v-titre">Ce que ça fait</h1>
      <p className="v-chapeau">
        Une base technique qu'on remplit en marchant dans la maison, et qu'on interroge quand quelque
        chose fuit.
      </p>

      <h2>Capturer maintenant, compléter plus tard</h2>
      <p>
        Le moment où l'on sait ce qu'est un objet, c'est le moment où on l'a sous les yeux — pas le
        soir devant un ordinateur. On photographie, on nomme, on range dans une zone, et on s'arrête
        là. Le reste des champs attend.
      </p>
      <p>
        Une saisie interrompue n'est pas perdue : elle part quand le réseau revient. Une cave, un
        garage en sous-sol, un fond de jardin sont exactement les endroits où l'on a besoin de
        consigner quelque chose, et exactement ceux où le réseau manque.
      </p>

      <h2>Retrouver</h2>
      <p>
        La recherche cherche dans le nom de la fiche, ses surnoms, son type, sa zone, son système et
        le contenu de ses champs. Elle est insensible aux accents, parce que personne ne tape
        « éclairage » avec l'accent depuis un téléphone, et elle vous dit sur quoi elle a trouvé.
      </p>
      <p>
        On peut aussi ne pas chercher du tout et se promener : les zones, puis les objets de la zone.
        C'est souvent plus rapide, parce qu'on sait où on était.
      </p>

      <h2>Des types d'objets, et les vôtres</h2>
      <p>
        Un catalogue de types courants est fourni — vanne d'arrêt, tableau électrique, chaudière,
        siphon — chacun avec les champs qui vont avec. Vous pouvez créer les vôtres, avec les champs
        que vous voulez. Un champ supprimé d'un type est masqué, jamais effacé : ce que vous aviez
        saisi reste.
      </p>

      <h2>Des plans, et des points dessus</h2>
      <p>
        Un plan par niveau, plus un plan de situation pour l'extérieur. Vous posez un objet dessus par
        glissement, vous zoomez, vous déplacez. Vous pouvez aussi tracer le contour d'une zone en
        quelques clics, par-dessus le scan — et l'application vous proposera alors, quand vous posez
        un objet dedans, de le ranger dans cette zone. Elle le propose ; c'est vous qui décidez.
      </p>

      <h2>L'historique</h2>
      <p>
        Ce qui est arrivé à la maison : un dépannage, une rénovation, un sinistre, un entretien. Un
        événement se rattache aux objets concernés et aux gens qui sont intervenus, avec des photos
        d'avant et d'après. Six ans plus tard, c'est la seule façon de savoir qui avait posé quoi.
      </p>

      <h2>Les garanties, et ce qui va expirer</h2>
      <p>
        Une garantie tient à l'objet qu'elle couvre, avec sa date de fin. L'accueil vous montre celles
        qui arrivent à terme. Ce ne sont pas des rappels : rien ne vous écrit et rien ne vous sonne —
        il faut ouvrir l'application. C'est dit ici parce que c'est une vraie limite.
      </p>

      <h2>Les liens de partage</h2>
      <p>
        C'est la partie qui a sa propre page, parce qu'elle est la moins évidente et la plus utile.
      </p>
      <p>
        <Link to="/partage">Comment fonctionne le partage</Link>
      </p>
    </>
  );
}
