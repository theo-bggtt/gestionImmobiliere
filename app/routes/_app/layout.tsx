// app/routes/_app/layout.tsx
import { Outlet, Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { db } from "../../db/client";
import { utilisateur } from "../../db/schema/index";

export async function loader({ request }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const [moi] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurId));
  return { email: moi.email };
}

export default function AppLayout() {
  const { email } = useLoaderData<typeof loader>();
  return (
    <div>
      <header>
        <Link to="/">gestionImmobiliere</Link>
        <span>{email}</span>
        <form method="post" action="/deconnexion">
          <button type="submit">Déconnexion</button>
        </form>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
