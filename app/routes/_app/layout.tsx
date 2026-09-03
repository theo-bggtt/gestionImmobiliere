// app/routes/_app/layout.tsx
import { useEffect, useRef, useState } from "react";
import { Outlet, Link, useLoaderData, useLocation, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { db } from "../../db/client";
import { propriete, utilisateur } from "../../db/schema/index";
import { Capture } from "../../components/capture/Capture";
import { IndicateurFile } from "../../components/capture/IndicateurFile";
import { AideInstallationIOS } from "../../components/AideInstallationIOS";
import { rafraichirInstantane } from "../../lib/capture/instantane";
import { prechargerCoquille } from "../../lib/capture/coquille";
import { demarrerSynchro, souscrire } from "../../lib/capture/synchro";

export async function loader({ request }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const [moi] = await db.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, utilisateurId));
  // Les déclencheurs de capture vivent dans le layout pour être à un geste de
  // n'importe quel écran, y compris la racine : il leur faut donc savoir sur
  // quelle propriété capturer avant même d'entrer dedans.
  const proprietes = await db
    .select({ id: propriete.id, nom: propriete.nom })
    .from(propriete)
    .where(eq(propriete.proprietaireId, utilisateurId));
  return { email: moi.email, proprietes };
}

export default function AppLayout() {
  const { email, proprietes } = useLoaderData<typeof loader>();
  const location = useLocation();
  const revalidator = useRevalidator();

  const dansUrl = Number(location.pathname.match(/^\/proprietes\/(\d+)/)?.[1]);
  const [memorisee, setMemorisee] = useState<number | null>(null);

  useEffect(() => {
    setMemorisee(Number(localStorage.getItem("dernierePropriete")) || null);
  }, []);

  useEffect(() => {
    if (dansUrl) localStorage.setItem("dernierePropriete", String(dansUrl));
  }, [dansUrl]);

  const connues = new Set(proprietes.map((p) => p.id));
  const proprieteId =
    (connues.has(dansUrl) ? dansUrl : null) ??
    (memorisee !== null && connues.has(memorisee) ? memorisee : null) ??
    (proprietes.length === 1 ? proprietes[0].id : null);

  useEffect(() => {
    if (proprieteId !== null) void rafraichirInstantane(proprieteId);
  }, [proprieteId]);

  useEffect(() => demarrerSynchro(), []);

  useEffect(() => {
    void prechargerCoquille();
  }, []);

  // Une capture partie pendant qu'un écran est ouvert doit y apparaître.
  const envoyes = useRef(0);
  useEffect(
    () =>
      souscrire((e) => {
        if (e.envoyes !== envoyes.current) {
          envoyes.current = e.envoyes;
          revalidator.revalidate();
        }
      }),
    [revalidator],
  );

  return (
    <div className="app">
      <header className="app-tete">
        <Link to="/" className="app-marque">
          gestionImmobiliere
        </Link>
        <IndicateurFile />
        <span className="app-compte">{email}</span>
        <form method="post" action="/deconnexion">
          <button type="submit" className="bouton-discret">
            Déconnexion
          </button>
        </form>
      </header>

      <main className="app-corps">
        <Outlet />
      </main>

      {proprieteId !== null && (
        <div className="capture-barre">
          <Capture proprieteId={proprieteId} mode="nouveau" className="capture-declencheur capture-principal">
            Nouvel objet
          </Capture>
          <Capture proprieteId={proprieteId} mode="existant" className="capture-declencheur capture-secondaire">
            Objet existant
          </Capture>
        </div>
      )}

      <AideInstallationIOS />
    </div>
  );
}
