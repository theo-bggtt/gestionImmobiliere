// app/components/partage/FicheEvenement.tsx
// `/p/:jeton/evenements/:id` — un événement vu par un porteur de lien.
//
// Ce qui n'est PAS ici est le sujet du fichier :
//   `cout`        — jamais sélectionné par une requête de partage, quel que
//                   soit le plafond. Le type `EvenementDetail` ne le porte
//                   même pas, donc l'écrire ne compilerait pas.
//   `niveau`      — métadonnée de visibilité. L'afficher apprendrait au
//                   destinataire qu'il existe des crans au-dessus du sien.
//   tél. / e-mail — d'un intervenant : données personnelles d'un tiers.
//                   `IntervenantRendu` ne porte que le nom et le métier.
import type { EvenementPartage } from "../../lib/partage/contenu.server";
import { LIBELLES_TYPE_EVENEMENT } from "../../lib/historique/types";
import { periode } from "../historique/Chronologie";
import { liensPartage } from "../recherche/liens";

export function FicheEvenement({ evenement, jeton }: { evenement: EvenementPartage; jeton: string }) {
  const liens = liensPartage(jeton);

  return (
    <div className="page-partage">
      <p className="fiche-fil">
        <a href={`/p/${jeton}`}>{evenement.proprieteNom}</a>
        {" · "}
        <a href={liens.historique}>Historique</a>
      </p>
      <h1>{evenement.titre}</h1>
      <p className="resultat-lieu">
        <time dateTime={evenement.dateDebut}>{periode(evenement)}</time>
        {" · "}
        {LIBELLES_TYPE_EVENEMENT[evenement.type]}
      </p>

      {evenement.description && <p className="evenement-description">{evenement.description}</p>}

      {evenement.objets.length > 0 && (
        <section>
          <h2>Objets concernés</h2>
          <ul className="chrono-objets">
            {evenement.objets.map((o) => (
              <li key={o.id}>
                <a href={liens.fiche(o.id)}>{o.nom}</a>
                <span className="chrono-objet-zone"> · {o.zoneNom}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {evenement.intervenants.length > 0 && (
        <section>
          <h2>Intervenants</h2>
          <ul className="chrono-objets">
            {evenement.intervenants.map((i) => (
              <li key={i.id}>
                {i.nom}
                {i.metier && <span className="chrono-objet-zone"> · {i.metier}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evenement.photos.length > 0 && (
        <section className="fiche-photos">
          <h2>Photos</h2>
          <ul className="galerie">
            {evenement.photos.map((id) => (
              <li key={id}>
                <a href={`/p/${jeton}/fichiers/${id}`}>
                  <img src={liens.image(id)} alt="" loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
