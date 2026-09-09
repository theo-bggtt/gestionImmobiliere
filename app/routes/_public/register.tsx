// app/routes/_public/register.tsx
import { Form, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { hacherMotDePasse } from "../../lib/auth/password.server";
import { creerSession } from "../../lib/auth/session.server";
import { MESSAGE_INSCRIPTION_FERMEE } from "../../lib/auth/inscription";
import { inscriptionOuverte, inscrire } from "../../lib/auth/inscription.server";

export async function loader() {
  return { ouverte: await inscriptionOuverte() };
}

export async function action({ request }: ActionFunctionArgs) {
  // Porte fermée : on répond avant de hacher quoi que ce soit — un argon2
  // par tentative sur une porte fermée serait du travail offert.
  if (!(await inscriptionOuverte())) return { erreur: MESSAGE_INSCRIPTION_FERMEE };

  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const motDePasse = String(form.get("motDePasse") ?? "");

  if (!email || motDePasse.length < 8) {
    return { erreur: "Email requis, mot de passe d'au moins 8 caractères." };
  }

  const resultat = await inscrire(email, await hacherMotDePasse(motDePasse));
  if (resultat.statut === "fermee") return { erreur: MESSAGE_INSCRIPTION_FERMEE };
  if (resultat.statut === "email_pris") return { erreur: "Un compte existe déjà avec cet email." };

  return creerSession(resultat.id, "/");
}

export default function Inscription() {
  const { ouverte } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (!ouverte) {
    return (
      <main>
        <h1>Créer un compte</h1>
        <p role="status">{MESSAGE_INSCRIPTION_FERMEE}</p>
        <p><a href="/connexion">Se connecter</a></p>
      </main>
    );
  }

  return (
    <main>
      <h1>Créer un compte</h1>
      <Form method="post">
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="motDePasse" required minLength={8} />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer le compte</button>
      </Form>
      <p><a href="/connexion">J'ai déjà un compte</a></p>
    </main>
  );
}
