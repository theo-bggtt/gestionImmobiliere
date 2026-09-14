// app/routes/_vitrine/a-propos.tsx
// D'où ça vient, où ça en est. Une page qui dit l'état réel du projet plutôt
// qu'une page « équipe » : il n'y a pas d'équipe, et le prétendre se verrait.
//
// C'est aussi le seul endroit qui a le droit de parler du stade d'avancement,
// et il ne le chiffre pas non plus : ni date de sortie, ni nombre
// d'utilisateurs, ni prix. Le modèle économique n'est pas tranché, donc il
// n'est pas annoncé.
import { Link } from "react-router";

export const meta = () => [
  { title: "À propos — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Un outil né d'une maison réelle et d'une question simple : où est passée la gaine ? D'où vient le projet et où il en est.",
  },
];

export default function APropos() {
  return (
    <>
      <h1 className="v-titre">À propos</h1>
      <p className="v-chapeau">
        Ce projet a commencé par une question sans réponse, devant un mur, une perceuse à la main.
      </p>

      <h2>D'où ça vient</h2>
      <p>
        D'une maison, d'une vraie, dont la documentation tenait dans une mémoire et dans un carton.
        Le jour où il a fallu percer un mur sans savoir ce qu'il y avait derrière, l'idée a pris sa
        forme définitive : ce n'est pas un inventaire de biens, ni un carnet d'entretien. C'est la
        mémoire technique d'un bâtiment.
      </p>
      <p>
        La contrainte de départ était que ça ne serve à rien à personne d'autre s'il fallait remplir
        un formulaire de trente champs pour créer un objet. D'où la forme : on photographie, on nomme,
        on range, et on complète plus tard si on complète.
      </p>

      <h2>Le partage est venu après, et a tout changé</h2>
      <p>
        Au départ, c'était une archive privée. La demande d'ouvrir une vue filtrée à un locataire a
        transformé le produit : il a fallu que chaque fiche sache où elle est et à quel point elle est
        sensible, et que ce soit vrai au niveau de la base, pas de l'écran. Le filtre de partage est
        depuis ce qui commande toute la structure.
      </p>

      <h2>Où ça en est</h2>
      <p>
        L'application est écrite et fonctionne. Ce qui reste est le passage à la vraie vie : une vraie
        maison dedans, sur une vraie machine, éprouvé avec de vrais liens envoyés à de vraies
        personnes. Tant que ce n'est pas fait, certaines choses restent des intentions, et cette
        vitrine évite de les présenter autrement.
      </p>
      <p>
        C'est la raison pour laquelle vous ne lisez ici aucun chiffre : ni durée de saisie, ni
        promesse de fonctionnement sans réseau, ni nombre d'inscrits. Ce qui n'a pas été mesuré n'est
        pas écrit.
      </p>

      <h2>Pas encore de tarifs</h2>
      <p>
        Il n'y a pas de page « prix », parce qu'il n'y a pas de prix décidé. Annoncer un modèle pour
        avoir l'air d'un produit fini serait la première chose fausse de ce site.
      </p>

      <h2>Comment c'est fait</h2>
      <p>
        Simplement, et en petit. Une application web, une base de données, un serveur. Pas
        d'intelligence artificielle, pas de service tiers à qui vos données seraient confiées. Ce qui
        n'existe pas ne tombe pas en panne.
      </p>

      <p>
        <Link to="/confidentialite">Ce que l'application stocke, et ce qu'elle ne stocke pas</Link>
      </p>
    </>
  );
}
