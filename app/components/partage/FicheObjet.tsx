// app/components/partage/FicheObjet.tsx
// Une fiche vue par un porteur de lien. Les champs arrivent déjà filtrés par
// `niveauMin` : ce composant ne décide rien, et rien de ce qui est masqué
// n'est passé jusqu'ici — sinon la valeur serait dans la source de la page.
import type { FichePartage } from "../../lib/partage/contenu.server";
import { liensPartage } from "../recherche/liens";

export function FicheObjet({ fiche, jeton }: { fiche: FichePartage; jeton: string }) {
  const liens = liensPartage(jeton);

  return (
    <div className="page-partage">
      <p className="fiche-fil">
        <a href={`/p/${jeton}`}>{fiche.proprieteNom}</a>
      </p>
      <h1>{fiche.nom}</h1>
      <p className="resultat-lieu">
        {[fiche.typeNom, fiche.zoneNom, fiche.zoneChemin, fiche.systemeNom].filter(Boolean).join(" · ")}
      </p>

      {fiche.champs.length > 0 && (
        <dl className="fiche-champs">
          {fiche.champs.map((c) => (
            <div key={c.cle}>
              <dt>{c.label}</dt>
              <dd>{c.valeur}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="fiche-photos">
        <h2>Photos</h2>
        {fiche.photos.length === 0 ? (
          <p className="fiche-photos-vide">Aucune photo.</p>
        ) : (
          <ul className="galerie">
            {fiche.photos.map((id) => (
              <li key={id}>
                <a href={`/p/${jeton}/fichiers/${id}`}>
                  <img src={liens.image(id)} alt="" loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
