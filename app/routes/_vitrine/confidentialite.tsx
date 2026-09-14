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

export const meta = () => [
  { title: "Vos données — gestionImmobiliere" },
  {
    name: "description",
    content:
      "Ce que l'application stocke, ce qu'elle refuse de stocker, ce qui ne sort jamais d'un lien, et pourquoi l'adresse de votre maison n'entre jamais en base.",
  },
];

export default function Confidentialite() {
  return (
    <>
      <section className="v-heros v-heros-simple">
        <div className="v-heros-texte">
          <p className="v-surtitre">Vos données</p>
          <h1 className="v-titre">
            Ce que le code <em>refuse</em> de faire.
          </h1>
          <p className="v-chapeau">
            Une application qui décrit une maison décrit un endroit où des gens habitent. Ce qui suit
            n'est pas une politique : c'est la liste de ce que le code fait, de ce qu'il refuse, et de
            ce qu'il ne sait pas faire. Chaque ligne est tenue par un test, pas par une intention.
          </p>
        </div>
      </section>

      <div className="v-prose">
        <h2>L'adresse de votre maison n'entre pas en base</h2>
        <p>
          À la création d'une propriété, vous pouvez saisir une adresse : elle sert à interroger le
          registre public des bâtiments pour vous proposer une structure de départ, le nombre de
          niveaux, l'année de construction. Puis elle disparaît avec la requête.
        </p>
        <p>
          Elle n'est écrite dans aucune colonne, et l'identifiant que le registre renvoie non plus : il
          n'est pas une version anonyme de l'adresse, il permet de la retrouver. Un test balaye{" "}
          <strong>toutes les colonnes de toutes les tables</strong> après un parcours complet de
          création, et échoue s'il trouve la moindre trace. Il porte son propre contrôle, qui prouve
          que le balayage détecterait bien ce qu'il cherche, sans quoi « rien trouvé » ne voudrait
          rien dire.
        </p>
        <p className="v-note">
          Conséquence assumée : le nom que vous donnez à votre propriété est du texte libre, et c'est
          le titre d'une page de partage. N'y écrivez pas votre adresse — l'application ne vous la
          propose jamais, et c'est délibéré.
        </p>

        <h2>Ce que l'application refuse de stocker</h2>
        <p>
          Aucun mot de passe de vos appareils, aucun code de portail ou d'alarme, aucune combinaison de
          coffre, aucun emplacement de clé, aucune coordonnée bancaire. Ce n'est pas un coffre-fort, et
          un coffre-fort qui ne dit pas son nom est pire qu'un carnet. Les mots de passe des comptes,
          eux, ne sont pas stockés : seule une empreinte qui ne permet pas de les retrouver l'est.
        </p>

        <h2>Ce qui ne sort jamais d'un lien de partage</h2>
        <p>
          Le coût d'une intervention. Le téléphone, l'adresse et les notes concernant un artisan. La
          référence d'une garantie, son numéro de contrat, et le document qui va avec. Le nom privé que
          vous donnez à un plan ou à un lien. Ces champs ne sont pas masqués à l'affichage : ils ne sont
          pas chargés du tout, et le code qui tenterait de les servir ne compilerait pas.
        </p>
        <p>
          Une page de partage ne charge par ailleurs aucun script, ne pose aucun traceur, et demande
          aux moteurs de recherche de ne pas l'indexer. Un lien révoqué ou expiré ne montre plus rien
          de la maison : ni ses zones, ni ses fiches, ni ses plans.
        </p>

        <h2>Ce qu'on ne peut pas filtrer</h2>
        <p>
          Un extrait cadastral porte souvent l'adresse et le numéro de parcelle{" "}
          <em>imprimés dans l'image</em>. Aucun filtre ne les enlève. L'écran de téléversement le dit,
          et propose de recadrer. C'est la limite connue, elle est écrite plutôt que tue.
        </p>

        <h2>Pas de traceurs, pas de tiers</h2>
        <p>
          Pas de régie publicitaire, pas d'outil de mesure d'audience, pas de police de caractères
          chargée chez un tiers. Les pages que vous lisez en ce moment ne chargent aucun script, et le
          navigateur a l'ordre d'en refuser un qui viendrait quand même. Rien de ce que vous saisissez
          n'est envoyé à un service tiers.
        </p>

        <h2>Où ça vit</h2>
        <p>
          Sur un serveur loué, que personne d'autre ne partage, avec une base qui n'est pas joignable
          depuis l'extérieur. Le pays d'hébergement n'est pas arrêté : il sera écrit ici quand il le
          sera, plutôt que promis d'avance.
        </p>

        <p className="v-suite">
          <Link to="/a-propos">Qui fait ça, et pourquoi</Link>
        </p>
      </div>
    </>
  );
}
