// app/routes/_app/zones._index.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerArbreZones, type ZoneAvecEnfants } from "../../lib/zoneTree";

function ListeZones({ zones, proprieteId, profondeur = 0 }: { zones: ZoneAvecEnfants[]; proprieteId: number; profondeur?: number }) {
  return (
    <ul>
      {zones.map((z) => (
        <li key={z.id}>
          {"— ".repeat(profondeur)}
          {z.nom} ({z.type})
          <Link to={`/proprietes/${proprieteId}/zones/${z.id}/modifier`}> Modifier</Link>
          {z.enfants.length > 0 && <ListeZones zones={z.enfants} proprieteId={proprieteId} profondeur={profondeur + 1} />}
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
      <Link to={`/proprietes/${propriete.id}/zones/nouveau`}>Ajouter une zone</Link>

      {arbre.map(({ batiment, niveaux }) => (
        <section key={batiment.id}>
          <h2>{batiment.nom}</h2>
          {niveaux.map(({ niveau, zones }) => (
            <div key={niveau.id}>
              <h3>{niveau.nom}</h3>
              <ListeZones zones={zones} proprieteId={propriete.id} />
            </div>
          ))}
        </section>
      ))}

      <section>
        <h2>Extérieur</h2>
        <ListeZones zones={zonesExterieures} proprieteId={propriete.id} />
      </section>
    </main>
  );
}
