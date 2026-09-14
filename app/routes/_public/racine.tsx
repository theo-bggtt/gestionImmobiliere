// app/routes/_public/racine.tsx
// L'application a quitté `/` pour `/proprietes`. Cette route occupe la racine
// en attendant la vitrine publique, et ne fait qu'une chose : rediriger.
//
// Hors de `layout.tsx` volontairement. La mise en page authentifiée exige une
// session ; ici la redirection doit partir pour tout le monde, connecté ou
// non — c'est la route d'arrivée qui décide de demander la connexion, comme
// pour n'importe quelle autre URL de l'application.
import { redirect } from "react-router";
import { ACCUEIL } from "../../lib/auth/redirection";

export function loader() {
  return redirect(ACCUEIL);
}
