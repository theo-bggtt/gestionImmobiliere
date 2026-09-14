// app/routes/_vitrine/partage.tsx
// La page du bailleur — le même homme que le propriétaire, à un autre moment.
//
// C'est le seul argument que ni un carnet d'entretien ni un guide d'accueil
// ne peuvent tenir : eux sont des documents, donc ils se dupliquent et se
// périment un par un. Ici il n'y a qu'une base, et des fenêtres dessus. La
// page mérite donc mieux qu'un paragraphe en bas de l'accueil, et le tableau
// qui compare le document au lien est son argument central.
import { Link } from "react-router";
import { ACCUEIL } from "../../lib/auth/redirection";

export const meta = () => [
  { title: "Partager sans tout montrer — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Un lien par personne, qui ouvre une vue filtrée de la maison : un plafond de détail et des zones autorisées. Pas de compte à créer pour elle, révocable à tout moment par vous.",
  },
];

export default function Partage() {
  return (
    <>
      <section className="v-heros v-heros-simple">
        <div className="v-heros-texte">
          <p className="v-surtitre">Partager</p>
          <h1 className="v-titre">
            Partagez <em>sans tout montrer</em>.
          </h1>
          <p className="v-chapeau">
            Vous louez, vous recevez, vous faites intervenir des gens chez vous. Chacun a besoin de
            savoir quelque chose. Personne n'a besoin de tout savoir.
          </p>
        </div>
      </section>

      <section className="v-section">
        <div className="v-section-tete">
          <h2>Un document ne se découpe pas</h2>
          <p className="v-intro">
            La solution habituelle est un classeur d'accueil, un PDF, un message épinglé. Ça marche
            une fois. Puis la chaudière est remplacée, et il faut corriger les trois, ou vivre avec
            trois versions dont deux sont fausses. Et le guide qui explique au locataire comment couper
            l'eau contient aussi, quelques lignes plus bas, le code du portail et le nom de votre
            assureur.
          </p>
        </div>
        <div className="v-tableau-cadre">
          <table className="v-tableau">
            <thead>
              <tr>
                <th scope="col">Le jour où…</th>
                <th scope="col">Avec un document</th>
                <th scope="col">Avec un lien</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">la chaudière change</th>
                <td data-libelle="Avec un document">Le classeur, le PDF et le message épinglé sont à corriger, un par un.</td>
                <td data-libelle="Avec un lien">Une fiche à modifier. Chaque lien montre la version du jour.</td>
              </tr>
              <tr>
                <th scope="row">le locataire lit</th>
                <td data-libelle="Avec un document">Tout ce qui est dans le document, y compris ce qui ne le regarde pas.</td>
                <td data-libelle="Avec un lien">Ce que son lien autorise. Le reste n'existe pas pour lui.</td>
              </tr>
              <tr>
                <th scope="row">il cherche la vanne</th>
                <td data-libelle="Avec un document">Une image figée, ou une phrase.</td>
                <td data-libelle="Avec un lien">Le plan, avec les objets repérés dessus, ceux qu'il a le droit de voir.</td>
              </tr>
              <tr>
                <th scope="row">il part</th>
                <td data-libelle="Avec un document">Le PDF reste dans sa boîte de réception.</td>
                <td data-libelle="Avec un lien">Vous révoquez le lien. Il ne montre plus rien.</td>
              </tr>
              <tr>
                <th scope="row">il doit installer quelque chose</th>
                <td data-libelle="Avec un document">Rien.</td>
                <td data-libelle="Avec un lien">Rien non plus. Une adresse à ouvrir, sans compte.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="v-section">
        <div className="v-section-tete">
          <h2>Un lien, deux réglages, rien d'autre à comprendre</h2>
        </div>
        <div className="v-duo">
          <article>
            <h3>Jusqu'où il voit</h3>
            <p>
              Chaque fiche porte un niveau de détail. Le lien porte un plafond, et ne montre rien
              au-dessus. Au sein d'une même fiche, un champ peut être plus sensible que les autres, la
              référence, le numéro de série, et se masquer seul.
            </p>
            <ul className="v-niveaux">
              <li>
                <span className="v-niveau-nom n1">Public</span>
                <span>Ce que n'importe qui pourrait voir en entrant.</span>
              </li>
              <li>
                <span className="v-niveau-nom n2">Usage</span>
                <span>Ce qu'il faut pour vivre là : couper l'eau, relancer la chaudière.</span>
              </li>
              <li>
                <span className="v-niveau-nom n3">Technique</span>
                <span>Références et raccordements : ce que l'artisan doit savoir, pas le locataire.</span>
              </li>
              <li>
                <span className="v-niveau-nom n4">Privé</span>
                <span>Ce qui ne sort d'un lien que si vous montez son plafond tout en haut, exprès.</span>
              </li>
            </ul>
          </article>
          <article>
            <h3>Où il voit</h3>
            <p>
              Vous pouvez en plus le restreindre à des zones ou à des systèmes. Le jardinier voit
              l'extérieur et l'arrosage ; le reste de la maison n'existe pas pour lui. Pas grisé, pas
              verrouillé : absent.
            </p>
            <p>
              Il ne verra pas non plus qu'il existe une zone qu'il ne voit pas. Une zone sans rien à
              montrer n'apparaît pas, parce qu'une case vide dit déjà quelque chose.
            </p>
          </article>
        </div>
      </section>

      <section className="v-section">
        <div className="v-duo">
          <article>
            <h2>Ce que reçoit la personne</h2>
            <ul className="v-coches">
              <li>Une adresse à ouvrir. Pas de compte, pas d'application, rien à accepter.</li>
              <li>Une page de texte et d'images, qui ne charge aucun script et n'installe rien.</li>
              <li>
                Les zones qu'elle a le droit de voir, leurs fiches, les plans avec les objets repérés
                dessus, et l'historique s'il la concerne.
              </li>
              <li>Une recherche, dans ce qu'elle voit et rien d'autre.</li>
            </ul>
          </article>
          <article>
            <h2>Ce qui ne sort jamais d'un lien</h2>
            <p>
              Certaines choses ne dépendent d'aucun réglage : elles ne partent pas, quel que soit le
              plafond.
            </p>
            <ul className="v-coches v-croix">
              <li>Ce que vous avez payé pour une intervention.</li>
              <li>
                Le téléphone, l'adresse et vos notes sur un artisan, qui n'a pas choisi de figurer
                sur un lien que l'on fait suivre.
              </li>
              <li>Le nom que vous avez donné à un plan ou à un lien : c'est votre étiquette à vous.</li>
              <li>La référence d'une garantie et son document.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="v-section">
        <div className="v-duo">
          <article>
            <h2>Un lien se révoque</h2>
            <p>
              Le locataire est parti, l'artisan a fini : vous coupez le lien, et il ne montre plus
              rien. Un lien peut aussi porter une date de fin dès sa création. Ce qui a été partagé,
              avec qui, et quand, reste consigné. C'est même l'intérêt.
            </p>
          </article>
          <article>
            <h2>Vous voyez ce qu'ils voient</h2>
            <p>
              Avant d'envoyer un lien, vous l'ouvrez : la même page, servie par le même code, telle
              qu'elle arrivera à son destinataire. Pas une simulation. La page réelle, avec en plus
              le compte de ce qu'elle ne montre pas.
            </p>
          </article>
        </div>
      </section>

      <section className="v-final">
        <div>
          <h2>Un lien pour le locataire, un pour le plombier.</h2>
          <p>
            Ils se créent depuis votre espace, en choisissant un plafond et des zones.{" "}
            <Link to="/confidentialite">Ce que l'application stocke, et ce qu'elle refuse</Link>.
          </p>
        </div>
        <Link to={ACCUEIL} className="v-appel">
          Ouvrir mon espace
        </Link>
      </section>
    </>
  );
}
