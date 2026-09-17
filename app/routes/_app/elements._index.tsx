// app/routes/_app/elements._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { libelleNiveau } from "../../lib/partage/niveaux";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const elements = await db.select({
    id: element.id,
    nom: element.nom,
    typeNom: typeElement.nom,
    zoneNom: zone.nom,
    // Le seul écran d'où l'on voit l'ensemble, donc le seul d'où l'on repère
    // un objet resté en privé. Pas de compte de ce qui « manque » : le niveau
    // existe toujours, il n'y a rien à compléter (règle non négociable #2).
    niveau: element.niveau,
  })
    .from(element)
    // `leftJoin` sur le type, `innerJoin` sur la zone : le premier est
    // facultatif depuis la migration 0013, la seconde est NOT NULL en base
    // (règle non négociable #1). La différence entre les deux jointures dit
    // laquelle des deux colonnes porte le filtre de partage.
    .leftJoin(typeElement, eq(element.typeId, typeElement.id))
    .innerJoin(zone, eq(element.zoneId, zone.id))
    .where(eq(element.proprieteId, propriete.id));

  return { propriete, elements };
}

export default function ListeElements() {
  const { propriete, elements } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>Éléments — {propriete.nom}</h1>
      <p>
        <Link to={`/proprietes/${propriete.id}/elements/nouveau`} className="bouton-trait" viewTransition>
          Ajouter un élément
        </Link>
      </p>
      {elements.length === 0 ? (
        <p className="resultats-vide">Aucun élément pour l'instant.</p>
      ) : (
        <ul className="filets">
          {elements.map((e) => (
            <li key={e.id}>
              <Link to={`/proprietes/${propriete.id}/elements/${e.id}/modifier`} className="nom" viewTransition>
                {e.nom}
              </Link>
              <span className="lieu">
                {[e.typeNom, e.zoneNom, libelleNiveau(e.niveau)].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
