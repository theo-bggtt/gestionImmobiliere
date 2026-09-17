// app/routes/_vitrine/confidentialite.tsx
// Un argument de vente, pas une corvée — et le seul endroit de la vitrine où
// l'on peut être précis sans rien chiffrer, parce que ce qui est affirmé ici
// est tenu par du code et par des tests, pas par une intention.
//
// AUCUNE affirmation juridique : pas de nom de règlement, pas de « conforme
// à », pas de durée de conservation promise. Le dépôt n'en fait nulle part,
// et une vitrine n'est pas l'endroit où commencer — une phrase juridique
// fausse coûte plus cher que l'absence de phrase.
import { Link } from "react-router";
import { CONTACT_RETRAIT } from "../../lib/vitrine/document";

export const meta = () => [
  { title: "Vos données — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Ce que l'application garde chez vous, ce qu'elle refuse d'écrire, ce qui ne sort jamais d'un lien, et pourquoi l'adresse de votre maison n'est jamais enregistrée.",
  },
];

export default function Confidentialite() {
  return (
    <>
      <section className="planche v-sec">
        <p className="cote">Vos données</p>
        <h1 className="v-titre">
          Ce que l'application <em>refuse</em> de faire.
        </h1>
        <p className="v-chapeau">
          Une application qui décrit une maison décrit un endroit où des gens habitent. Voici ce
          qu'elle garde chez vous, ce qu'elle refuse d'écrire, et ce qu'elle ne sait pas faire. Ce ne
          sont pas des intentions : c'est ainsi qu'elle fonctionne.
        </p>
      </section>

      <section className="planche v-sec">
        <div className="v-prose">
          <h2 className="v-section-titre">L'adresse de votre maison n'est jamais enregistrée</h2>
          <p className="v-prose-texte">
            À la création d'une propriété, vous pouvez saisir une adresse : elle sert à interroger le
            registre public des bâtiments pour vous proposer une structure de départ, le nombre de
            niveaux, l'année de construction. Puis elle disparaît avec la requête.
          </p>
          <p className="v-prose-texte">
            Elle n'est écrite nulle part, et l'identifiant que le registre renvoie non plus : il n'est
            pas une version anonyme de l'adresse, il permettrait de la retrouver.
          </p>
          <p className="v-note">
            Conséquence assumée : le nom que vous donnez à votre propriété est du texte libre, et c'est
            le titre d'une page de partage. N'y écrivez pas votre adresse — l'application ne vous la
            propose jamais, et c'est délibéré.
          </p>

          <h2 className="v-section-titre">L'adresse que vous laissez sur la liste d'attente</h2>
          <p className="v-prose-texte">
            Si vous laissez une adresse e-mail sur la page d'accueil, elle est écrite dans une table
            avec la date du jour, et <strong>rien d'autre</strong> : pas votre adresse IP, pas votre
            navigateur, pas la page d'où vous venez, pas de champ libre. Elle ne sert qu'à une chose,
            vous prévenir le jour où l'inscription ouvre.
          </p>
          <p className="v-prose-texte">
            Elle n'est transmise à personne. Il n'y a pas d'outil d'envoi de courrier dans ce projet,
            donc pas de liste de diffusion chez un tiers, et pas de message de confirmation non plus —
            c'est dit sur la page au moment où vous la laissez.
          </p>
          <p className="v-prose-texte">
            <strong>Pour être retiré</strong>, écrivez à{" "}
            <a href={`mailto:${CONTACT_RETRAIT}`}>{CONTACT_RETRAIT}</a> depuis l'adresse concernée, et
            la ligne est supprimée. Il n'y a pas de bouton, et c'est une conséquence directe de
            l'absence de mailer : un bouton de désinscription honnête suppose de pouvoir vérifier que
            c'est bien vous qui le pressez, ce qui suppose de vous envoyer un message. Une adresse de
            contact est la réponse vraie ; un bouton serait la réponse rassurante.
          </p>

          <h2 className="v-section-titre">Ce que l'application refuse de stocker en clair</h2>
          <p className="v-prose-texte">
            Un code de portail ou d'alarme, une combinaison, l'emplacement d'une clé, le mot de passe
            d'un routeur : ces valeurs ont leur place, le coffre, et une seule. Elles y sont chiffrées{" "}
            <strong>par votre navigateur</strong>, avec une phrase que le serveur ne reçoit jamais, et une
            clé de secours affichée une seule fois à la création. Nous ne pouvons ni lire ces codes, ni
            vous les rendre si la phrase et la clé sont perdues : il ne reste alors qu'à vider le coffre
            et à les ressaisir. Un coffre-fort qui ne dit pas son nom est pire qu'un carnet ; celui-ci dit
            son nom, et ce qu'il ne peut pas faire.
          </p>
          <p className="v-prose-texte">
            Le coffre ne s'étend pas au reste de la maison, et c'est délibéré : la recherche, les liens
            de partage et le traitement des photos lisent ce que vous saisissez, et ne le pourraient plus.
            Un code, lui, ne se cherche pas, ne se partage pas, et se remplace en reprogrammant la serrure.
            Aucune coordonnée bancaire nulle part. Les mots de passe des comptes ne sont pas stockés non
            plus : seule une empreinte qui ne permet pas de les retrouver l'est.
          </p>

          <h2 className="v-section-titre">Ce qui ne sort jamais d'un lien de partage</h2>
          <p className="v-prose-texte">
            Le coût d'une intervention. Le téléphone, l'adresse et les notes concernant un artisan. La
            référence d'une garantie, son numéro de contrat, et le document qui va avec. Le nom privé que
            vous donnez à un plan ou à un lien. Ces champs ne sont pas masqués à l'affichage : ils ne sont
            pas chargés du tout, et aucun réglage ne les fait sortir.
          </p>
          <p className="v-prose-texte">
            Une page de partage ne charge par ailleurs aucun script, ne pose aucun traceur, et demande
            aux moteurs de recherche de ne pas l'indexer. Un lien révoqué ou expiré ne montre plus rien
            de la maison : ni ses zones, ni ses fiches, ni ses plans.
          </p>

          <h2 className="v-section-titre">Ce qu'on ne peut pas filtrer</h2>
          <p className="v-prose-texte">
            Un extrait cadastral porte souvent l'adresse et le numéro de parcelle{" "}
            <em>imprimés dans l'image</em>. Aucun filtre ne les enlève. L'écran de téléversement le dit,
            et propose de recadrer. C'est la limite connue, elle est écrite plutôt que tue.
          </p>

          <h2 className="v-section-titre">Pas de traceurs, pas de tiers</h2>
          <p className="v-prose-texte">
            Pas de régie publicitaire, pas d'outil de mesure d'audience, pas de police de caractères
            chargée chez un tiers. Les pages que vous lisez en ce moment ne chargent aucun script, et le
            navigateur a l'ordre d'en refuser un qui viendrait quand même. Rien de ce que vous saisissez
            n'est envoyé à un service tiers.
          </p>

          <h2 className="v-section-titre">Où ça vit</h2>
          <p className="v-prose-texte">
            Sur un serveur loué, que personne d'autre ne partage, avec une base qui n'est pas joignable
            depuis l'extérieur. Le pays d'hébergement n'est pas arrêté : il sera écrit ici quand il le
            sera, plutôt que promis d'avance.
          </p>

          <p className="v-suite">
            <Link to="/a-propos">Qui fait ça, et pourquoi</Link>
          </p>
        </div>
      </section>
    </>
  );
}
