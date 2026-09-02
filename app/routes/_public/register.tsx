// app/routes/_public/register.tsx
import { Form, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { utilisateur } from "../../db/schema/index";
import { hacherMotDePasse } from "../../lib/auth/password.server";
import { creerSession } from "../../lib/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const motDePasse = String(form.get("motDePasse") ?? "");

  if (!email || motDePasse.length < 8) {
    return { erreur: "Email requis, mot de passe d'au moins 8 caractères." };
  }

  const [existe] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
  if (existe) {
    return { erreur: "Un compte existe déjà avec cet email." };
  }

  const [cree] = await db.insert(utilisateur)
    .values({ email, motDePasseHash: await hacherMotDePasse(motDePasse) })
    .returning();

  return creerSession(cree.id, "/");
}

export default function Inscription() {
  const actionData = useActionData<typeof action>();

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
