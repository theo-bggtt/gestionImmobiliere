// app/components/partage/FicheObjet.tsx
// Une fiche vue par un porteur de lien. Les champs arrivent déjà filtrés par
// `niveauMin` : ce composant ne décide rien, et rien de ce qui est masqué
// n'est passé jusqu'ici — sinon la valeur serait dans la source de la page.
import type { FichePartage } from "../../lib/partage/contenu.server";
import { Chronologie } from "../historique/Chronologie";
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

      {/* Ce qu'un porteur de lien voit d'une garantie : la date de fin, et si
          elle a expiré. Ni la référence (numéro de contrat en texte libre,
          même famille de fuite que le nom d'un plan), ni son document (un
          contrat ou une facture, donc du coût sous un autre nom). Ce n'est pas
          un choix de ce composant : `GarantieRendue` ne porte pas ces champs,
          donc les afficher ne compilerait pas.

          Absente quand elle serait vide, comme l'historique juste en dessous. */}
      {fiche.garanties.length > 0 && (
        <section className="fiche-garanties">
          <h2>Garanties</h2>
          <ul className="fiche-garanties-liste">
            {fiche.garanties.map((g) => (
              <li key={g.id}>
                {g.fin ? `Jusqu'au ${g.fin}` : "Sans terme connu"}
                {g.expiree && <span className="garantie-expiree"> · expirée</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Absente quand elle serait vide : un titre « Historique » suivi de
          « aucun événement » dirait qu'il y en a ailleurs. Les événements
          servis ici ont passé leur propre clause, pas celle de la fiche. */}
      {fiche.evenements.length > 0 && (
        <section>
          <h2>Historique</h2>
          <Chronologie evenements={fiche.evenements} liens={liens} />
        </section>
      )}
    </div>
  );
}
