// app/components/PageErreur.tsx
// Le document rendu quand une route échoue — un 404 de `/p/`, une erreur
// serveur. Sans ce composant, React Router sert sa page par défaut : en
// anglais, avec un script inline et un message pour développeurs, sur un
// arbre qui est joignable depuis Internet depuis l'étape 8.
//
// Aucun script, quel que soit l'arbre : une page d'erreur n'a rien à hydrater,
// et celle de `/p/` doit rester sans JavaScript comme le reste du partage.
// Le lien de retour est une ancre ordinaire, qui recharge.
import feuilleDeStyle from "../styles/app.css?url";

export type ErreurRendue = { status: number; titre: string; message: string };

/**
 * Ce qu'on dit d'une erreur, et rien de plus. Un 404 ne distingue jamais
 * « n'existe pas » de « pas à vous » (règle #4), et aucune erreur ne montre
 * sa pile : elle est dans le journal du serveur, pas dans la page.
 */
export function decrireErreur(erreur: unknown): ErreurRendue {
  const status =
    typeof erreur === "object" && erreur !== null && typeof (erreur as { status?: unknown }).status === "number"
      ? (erreur as { status: number }).status
      : 500;
  if (status === 404) return { status, titre: "Introuvable", message: "Cette page n'existe pas, ou n'existe plus." };
  if (status === 429) return { status, titre: "Trop de demandes", message: "Réessayez dans un instant." };
  if (status >= 400 && status < 500) return { status, titre: "Demande refusée", message: "Cette demande ne peut pas être servie." };
  return { status: 500, titre: "Erreur", message: "Quelque chose s'est mal passé de notre côté. Réessayez plus tard." };
}

export function PageErreur({ erreur }: { erreur: ErreurRendue }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="stylesheet" href={feuilleDeStyle} />
        <title>{erreur.titre}</title>
      </head>
      <body>
        <main>
          <h1>{erreur.titre}</h1>
          <p>{erreur.message}</p>
          <p>
            <a href="/">Retour à l'accueil</a>
          </p>
        </main>
      </body>
    </html>
  );
}
