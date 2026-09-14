// app/routes/_vitrine/accueil.tsx
// L'accueil de la vitrine. TEXTE PROVISOIRE : ce qui est livré ici est la
// frontière, pas le contenu — les cinq pages viennent ensuite.
//
// Aucun loader, et c'est une propriété, pas un manque. Ces pages ne lisent
// pas la base (`tests/vitrine/etancheite.test.ts`), ne lisent pas la session,
// et ne savent donc pas qui regarde : c'est ce qui leur permet d'être servies
// avec un `Cache-Control` public. Le lien « Mon espace » pointe sur la route
// protégée, qui redirige elle-même vers la connexion s'il n'y a pas de
// session — le même lien marche pour le visiteur et pour le propriétaire
// connecté, sans que la vitrine ait à le savoir.
import { Link } from "react-router";
import { ACCUEIL } from "../../lib/auth/redirection";
import { ENTETES_VITRINE, HANDLE_SANS_SCRIPTS } from "../../lib/vitrine/document";

export const handle = HANDLE_SANS_SCRIPTS;
export const headers = () => ENTETES_VITRINE;

export const meta = () => [
  { title: "gestionImmobiliere — la mémoire technique de votre maison" },
  {
    name: "description",
    content:
      "Consigner où passe la gaine, quelle vanne coupe quoi, qui a posé la chaudière. Et n'en montrer que ce qu'il faut, à qui il faut.",
  },
];

export default function AccueilVitrine() {
  return (
    <main>
      <h1>La mémoire technique de votre maison</h1>
      <p>
        Où passe la gaine. Quelle vanne coupe quoi. Qui a posé la chaudière, et quand. Une maison sait
        beaucoup de choses que personne n'a écrites.
      </p>
      <p>
        La même base se montre différemment selon qui la regarde : le locataire trouve le compteur, le
        jardinier voit le jardin et rien d'autre, l'artisan lit la fiche de ce qu'il vient réparer.
      </p>
      <p>
        <Link to={ACCUEIL}>Mon espace</Link>
      </p>
    </main>
  );
}
