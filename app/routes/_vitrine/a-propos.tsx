// app/routes/_vitrine/a-propos.tsx
// D'où ça vient, où ça en est. Une page qui dit l'état réel du projet plutôt
// qu'une page « équipe » : il n'y a pas d'équipe, et le prétendre se verrait.
//
// C'est aussi le seul endroit qui a le droit de parler du stade d'avancement,
// et il ne le chiffre pas non plus : ni date de sortie, ni nombre
// d'utilisateurs, ni prix. Le modèle économique n'est pas tranché, donc il
// n'est pas annoncé. Écrit du côté du client : ce qu'il obtient et ce qu'on
// ne lui promet pas, jamais l'état du dépôt ni ce qui a été « mesuré ».
import { Link } from "react-router";

export const meta = () => [
  { title: "À propos — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Un outil né d'une maison réelle et d'une question simple, devant un mur, une perceuse à la main : où est passée la gaine ? D'où vient le projet, où il en est, et ce qu'il refuse de promettre.",
  },
];

export default function APropos() {
  return (
    <>
      <section className="planche v-sec">
        <p className="cote">À propos</p>
        <h1 className="v-titre">
          Né devant un mur, <em>une perceuse à la main</em>.
        </h1>
        <p className="v-chapeau">
          Ce projet a commencé par une question sans réponse : qu'est-ce qu'il y a derrière ? La
          gaine, le tuyau, rien ? Celui qui le savait était parti depuis longtemps.
        </p>
      </section>

      <section className="planche v-sec">
        <div className="v-prose">
          <h2 className="v-section-titre">D'où ça vient</h2>
          <p className="v-prose-texte">
            D'une maison, d'une vraie, dont la documentation tenait dans une mémoire et dans un carton.
            Le jour où il a fallu percer sans savoir, l'idée a pris sa forme définitive : ce n'est pas un
            inventaire de biens, ni un carnet d'entretien. C'est la mémoire technique d'un bâtiment, celle
            qui devrait se transmettre avec les clés et ne se transmet jamais.
          </p>
          <p className="v-prose-texte">
            La contrainte de départ était que ça ne serve à rien à personne s'il fallait remplir un
            formulaire de trente champs pour créer un objet. D'où la forme : on photographie, on nomme,
            on range, et on complète plus tard si on complète. Un outil qu'on n'utilise pas parce qu'il
            demande trop ne documente rien.
          </p>

          <h2 className="v-section-titre">Le partage est venu après, et a tout changé</h2>
          <p className="v-prose-texte">
            Au départ, c'était une archive privée. La demande d'ouvrir une vue filtrée à un locataire a
            transformé le produit : il a fallu que chaque fiche sache où elle est et à quel point elle est
            sensible, et que ce soit vrai au niveau de la base, pas de l'écran. Le filtre de partage
            commande depuis toute la structure. C'est ce qui fait qu'un lien ne peut pas montrer par
            accident ce qu'il n'a pas le droit de montrer : il n'y a pas d'accident possible, il n'y a
            que des requêtes filtrées.
          </p>

          <h2 className="v-section-titre">Où ça en est</h2>
          <p className="v-prose-texte">
            L'application fonctionne, et l'inscription n'est pas encore ouverte : elle le sera quand
            une vraie maison y aura vécu quelque temps, avec de vrais liens envoyés à de vraies
            personnes. Il n'y a pas non plus de prix affiché, parce qu'il n'y a pas de prix décidé, et
            qu'en annoncer un pour avoir l'air fini serait la première chose fausse de ces pages. Vous
            ne lirez ici ni durée, ni compte d'inscrits, ni tarif : ce qui n'a pas été vécu n'est pas
            écrit.
          </p>

          <h2 className="v-section-titre">Comment c'est fait</h2>
          <p className="v-prose-texte">
            Simplement, et en petit. Une application web, une base de données, un serveur. Pas
            d'intelligence artificielle, pas de service tiers à qui vos données seraient confiées, pas
            d'application à installer depuis une boutique. Ce qui n'existe pas ne tombe pas en panne, et
            ne fuit pas non plus.
          </p>

          <p className="v-suite">
            <Link to="/confidentialite">Ce que l'application stocke, et ce qu'elle ne stocke pas</Link>
          </p>
        </div>
      </section>
    </>
  );
}
