// app/routes/_public/register.tsx
import { Form, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { hacherMotDePasse } from "../../lib/auth/password.server";
import { creerSession } from "../../lib/auth/session.server";
import { MESSAGE_INSCRIPTION_FERMEE } from "../../lib/auth/inscription";
import { inscriptionOuverte, inscrire } from "../../lib/auth/inscription.server";

/** Le jeton d'invitation, de l'URL ou du formulaire. Absent = chaîne vide. */
const lireJeton = (source: URLSearchParams | FormData) => String(source.get("invitation") ?? "").trim();

export async function loader({ request }: LoaderFunctionArgs) {
  const jeton = lireJeton(new URL(request.url).searchParams);
  return { ouverte: await inscriptionOuverte(jeton), jeton };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const jeton = lireJeton(form);

  // Porte fermée : on répond avant de hacher quoi que ce soit — un argon2
  // par tentative sur une porte fermée serait du travail offert. Un jeton
  // inconnu, expiré, révoqué ou déjà utilisé tombe ici, et se répond comme
  // une porte fermée : on ne dit pas au visiteur si le jeton a existé.
  if (!(await inscriptionOuverte(jeton))) return { erreur: MESSAGE_INSCRIPTION_FERMEE };

  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const motDePasse = String(form.get("motDePasse") ?? "");

  if (!email || motDePasse.length < 8) {
    return { erreur: "Email requis, mot de passe d'au moins 8 caractères." };
  }

  const resultat = await inscrire(email, await hacherMotDePasse(motDePasse), jeton);
  if (resultat.statut === "fermee") return { erreur: MESSAGE_INSCRIPTION_FERMEE };
  if (resultat.statut === "email_pris") return { erreur: "Un compte existe déjà avec cet email." };

  return creerSession(resultat.id, "/");
}

export default function Inscription() {
  const { ouverte, jeton } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (!ouverte) {
    return (
      <main className="porte">
        <a href="/" className="porte-marque">
          gestionImmobiliere
        </a>
        <h1>Créer un compte</h1>
        <p role="status" className="message-avis">
          {MESSAGE_INSCRIPTION_FERMEE}
        </p>
        <p className="porte-suite">
          <a href="/connexion">Se connecter</a>
        </p>
      </main>
    );
  }

  return (
    <main className="porte">
      <a href="/" className="porte-marque">
        gestionImmobiliere
      </a>
      <h1>Créer un compte</h1>
      <Form method="post" className="formulaire">
        {/* Le jeton en champ caché, et pas seulement dans l'URL : le POST ne
            doit pas dépendre de la chaîne de requête de l'action. */}
        <input type="hidden" name="invitation" value={jeton} />
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          Mot de passe
          <input type="password" name="motDePasse" required minLength={8} autoComplete="new-password" />
        </label>
        {actionData?.erreur && (
          <p role="alert" className="message-erreur">
            {actionData.erreur}
          </p>
        )}
        <button type="submit">Créer le compte</button>
      </Form>
      <p className="porte-suite">
        <a href="/connexion">J'ai déjà un compte</a>
      </p>
    </main>
  );
}
