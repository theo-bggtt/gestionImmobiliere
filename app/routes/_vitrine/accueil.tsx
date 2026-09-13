// app/routes/_vitrine/accueil.tsx
// Ce qu'une maison sait et que personne n'a écrit, et à qui on le montre.
// Les deux idées du produit, dans cet ordre : d'abord la mémoire, ensuite la
// projection par audience — la seconde ne veut rien dire sans la première.
import { Link } from "react-router";
import { ACCUEIL } from "../../lib/auth/redirection";

export const meta = () => [
  { title: "gestionImmobiliere — la mémoire technique de votre maison" },
  {
    name: "description",
    content:
      "Consigner où passe la gaine, quelle vanne coupe quoi, qui a posé la chaudière. Et n'en montrer que ce qu'il faut, à qui il faut.",
  },
];

export default function Accueil() {
  return (
    <>
      <h1 className="v-titre">Votre maison sait des choses que personne n'a écrites</h1>
      <p className="v-chapeau">
        Où passe la gaine derrière le placard. Quelle vanne coupe quoi. Qui a posé la chaudière, et en
        quelle année. Ces réponses existent — dans une tête, dans un carton de factures, ou chez
        l'artisan qui est passé il y a six ans.
      </p>

      <p>
        <Link to={ACCUEIL} className="v-appel">
          Ouvrir mon espace
        </Link>
      </p>

      <h2>Une fiche par objet, rangée là où il est</h2>
      <p>
        Un objet, c'est une vanne, un tableau électrique, un lave-vaisselle, un arrosage automatique.
        Chaque fiche est rattachée à une zone — une cuisine, un local technique, un jardin — et peut
        l'être à un système : l'eau, le chauffage, l'électricité.
      </p>
      <p>
        C'est ce rattachement qui fait tout le reste. Parce que chaque fiche sait où elle est, on peut
        décider ce qu'un visiteur donné a le droit de voir, zone par zone, sans trier à la main.
      </p>

      <h2>La même base, quatre lecteurs</h2>
      <p>
        Vous ne montrez pas la même maison à un locataire de passage, à l'artisan qui vient réparer la
        chaudière, et au jardinier. Ce n'est pourtant pas trois bases qu'il faudrait tenir à jour :
        c'est la même, regardée à travers un filtre.
      </p>

      <div className="v-audience">
        <h3>Vous</h3>
        <p>Tout. C'est votre maison, et c'est vous qui l'avez écrite.</p>
      </div>
      <div className="v-audience">
        <h3>Le locataire</h3>
        <p>Où est le compteur, comment on coupe l'eau, quel jour sortent les poubelles.</p>
      </div>
      <div className="v-audience">
        <h3>L'artisan</h3>
        <p>La fiche technique de ce qu'il vient réparer, ses références, son historique d'entretien.</p>
      </div>
      <div className="v-audience">
        <h3>Le jardinier</h3>
        <p>L'extérieur, l'arrosage, rien de l'intérieur.</p>
      </div>

      <h2>Un plan, et des points dessus</h2>
      <p>
        Vous téléversez le plan que vous avez déjà — un scan, un extrait cadastral, une photo de
        tirage — et vous posez les objets dessus. Pas de dessin à faire, pas de mesures à prendre.
        « La vanne est là », un point sur une image, et c'est plus clair que trois phrases.
      </p>

      <h2>Et quand vous n'y serez plus</h2>
      <p>
        C'est la raison la moins vendeuse et la plus vraie. Une maison change de mains, et tout ce que
        vous savez d'elle part avec vous. Un document que personne ne tient à jour ne sert à rien ; une
        base qu'on remplit au fur et à mesure, en photographiant ce qu'on a sous les yeux, se transmet.
      </p>

      <p>
        <Link to="/fonctionnalites">Voir ce que ça fait, en détail</Link>
      </p>
    </>
  );
}
