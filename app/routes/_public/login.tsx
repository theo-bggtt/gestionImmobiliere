// app/routes/_public/login.tsx
import { Form, useActionData, useSearchParams } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { utilisateur } from "../../db/schema/index";
import { verifierMotDePasse } from "../../lib/auth/password.server";
import { creerSession } from "../../lib/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const motDePasse = String(form.get("motDePasse") ?? "");
  const depuis = String(form.get("depuis") ?? "/");

  const [ligne] = await db.select().from(utilisateur).where(eq(utilisateur.email, email));
  if (!ligne || !(await verifierMotDePasse(ligne.motDePasseHash, motDePasse))) {
    return { erreur: "Email ou mot de passe incorrect." };
  }

  return creerSession(ligne.id, depuis || "/");
}

export default function Connexion() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const depuis = searchParams.get("depuis") ?? "/";

  return (
    <main>
      <h1>Connexion</h1>
      <Form method="post">
        <input type="hidden" name="depuis" value={depuis} />
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="motDePasse" required />
        </label>
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Se connecter</button>
      </Form>
      <p><a href="/inscription">Créer un compte</a></p>
    </main>
  );
}
