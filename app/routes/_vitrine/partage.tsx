// app/routes/_vitrine/partage.tsx
// La page du bailleur — le même homme que le propriétaire, à un autre moment.
//
// C'est le seul argument que ni un carnet d'entretien ni un guide d'accueil
// ne peuvent tenir : eux sont des documents, donc ils se dupliquent et se
// périment un par un. Ici il n'y a qu'une base, et des fenêtres dessus. La
// page mérite donc mieux qu'un paragraphe en bas de l'accueil.
import { Link } from "react-router";

export const meta = () => [
  { title: "Partager sans tout montrer — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Un lien par personne, qui ouvre une vue filtrée de la maison : un plafond de détail et des zones autorisées. Pas de compte à créer, révocable à tout moment.",
  },
];

export default function Partage() {
  return (
    <>
      <h1 className="v-titre">Partager sans tout montrer</h1>
      <p className="v-chapeau">
        Vous louez, vous recevez, vous faites intervenir des gens chez vous. Chacun a besoin de savoir
        quelque chose, et personne n'a besoin de tout savoir.
      </p>

      <h2>Le problème, tel qu'il se pose vraiment</h2>
      <p>
        La solution habituelle est un document : un classeur d'accueil, un PDF, un message épinglé.
        Ça marche une fois. Puis la chaudière est remplacée, et il faut corriger le classeur, le PDF
        et le message — ou vivre avec trois versions dont deux sont fausses.
      </p>
      <p>
        Et un document ne se découpe pas. Le guide qui explique au locataire comment couper l'eau
        contient aussi, quelques lignes plus bas, le code du portail et le nom de votre assureur.
      </p>

      <h2>Un lien, un plafond, des zones</h2>
      <p>
        Vous créez un lien. Il porte deux réglages, et c'est tout ce qu'il y a à comprendre.
      </p>

      <h3>Jusqu'où il voit</h3>
      <p>
        Chaque fiche porte un niveau de détail : ce qui est public, ce qui sert à l'usage courant, ce
        qui est technique, ce qui reste privé. Le lien porte un plafond, et ne montre rien au-dessus.
        Au sein d'une même fiche, un champ peut être plus sensible que les autres — la référence, le
        numéro de série — et se masquer seul.
      </p>

      <h3>Où il voit</h3>
      <p>
        Vous pouvez en plus le restreindre à des zones ou à des systèmes. Le jardinier voit
        l'extérieur et l'arrosage ; le reste de la maison n'existe pas pour lui. Pas grisé, pas
        verrouillé : absent. Il ne verra pas non plus qu'il existe une zone qu'il ne voit pas.
      </p>

      <h2>Ce que reçoit la personne</h2>
      <p>
        Une adresse à ouvrir. Pas de compte à créer, pas d'application à installer, rien à accepter.
        La page est du texte et des images : elle ne charge aucun script et n'installe rien.
      </p>
      <p>
        Elle y trouve les zones qu'elle a le droit de voir, les fiches qu'elles contiennent, les plans
        avec les objets repérés dessus, et l'historique s'il la concerne. Elle peut chercher.
      </p>

      <h2>Ce qui ne sort jamais d'un lien</h2>
      <p>
        Certaines choses ne sont pas masquées selon un réglage : elles ne partent pas, quel que soit
        le plafond. Ce que vous avez payé pour une intervention. Le téléphone et l'adresse de
        l'artisan, qui n'a pas choisi de figurer sur un lien que l'on fait suivre. Le nom que vous
        avez donné à un plan ou à un lien, qui est votre étiquette à vous. Les documents de garantie.
      </p>

      <h2>Un lien se révoque</h2>
      <p>
        Le locataire est parti, l'artisan a fini : vous coupez le lien, et il ne montre plus rien. Un
        lien peut aussi porter une date de fin dès sa création. Ce qui a été partagé, avec qui, et
        quand, reste consigné — c'est même l'intérêt.
      </p>

      <h2>Vous voyez ce qu'ils voient</h2>
      <p>
        Avant d'envoyer un lien, vous l'ouvrez : la même page, servie par le même code, telle qu'elle
        arrivera à son destinataire. Pas une simulation — la page réelle.
      </p>

      <p>
        <Link to="/confidentialite">Ce que l'application stocke, et ce qu'elle ne stocke pas</Link>
      </p>
    </>
  );
}
