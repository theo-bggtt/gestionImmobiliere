// app/routes/_app/zones._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones, type ZoneAvecEnfants } from "../../lib/zoneTree";

function ListeZones({ zones, proprieteId }: { zones: ZoneAvecEnfants[]; proprieteId: number }) {
  return (
    <ul className="filets">
      {zones.map((z) => (
        <li key={z.id} className="filet-arbre">
          <span className="filet-ligne">
            <span className="nom">{z.nom}</span>
            <span className="lieu">{z.type}</span>
            <Link to={`/proprietes/${proprieteId}/zones/${z.id}/modifier`} className="bouton-discret" viewTransition>
              Modifier
            </Link>
          </span>
          {/* Une sous-zone est en retrait sous son parent, dans ses propres
              filets : l'indentation dit la hiérarchie, plus un tiret. */}
          {z.enfants.length > 0 && <ListeZones zones={z.enfants} proprieteId={proprieteId} />}
        </li>
      ))}
    </ul>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const { arbre, zonesExterieures } = await chargerArbreZones(propriete.id);
  return { propriete, arbre, zonesExterieures };
}

export default function ListeZonesPage() {
  const { propriete, arbre, zonesExterieures } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>Zones — {propriete.nom}</h1>
      <p>
        <Link to={`/proprietes/${propriete.id}/zones/nouveau`} className="bouton-trait" viewTransition>
          Ajouter une zone
        </Link>
      </p>

      {arbre.map(({ batiment, niveaux }) => (
        <section key={batiment.id} className="bloc">
          <h2>{batiment.nom}</h2>
          {niveaux.map(({ niveau, zones }) => (
            <div key={niveau.id} className="bloc-niveau">
              <p className="cote">{niveau.nom}</p>
              {zones.length === 0 ? (
                <p className="resultats-vide">Aucune zone à ce niveau.</p>
              ) : (
                <ListeZones zones={zones} proprieteId={propriete.id} />
              )}
            </div>
          ))}
        </section>
      ))}

      <section className="bloc">
        <h2>Extérieur</h2>
        {zonesExterieures.length === 0 ? (
          <p className="resultats-vide">Aucune zone extérieure.</p>
        ) : (
          <ListeZones zones={zonesExterieures} proprieteId={propriete.id} />
        )}
      </section>
    </main>
  );
}
