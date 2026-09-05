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
import { LIBELLES_ROLE_PHOTO } from "../../lib/historique/types";
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
            {/* L'étiquette est une légende, pas un filtre : le droit de lire
                l'octet vient de la visibilité de l'événement, jamais du rôle.
                « Sans étape » n'est pas affiché — c'est le défaut, et une
                légende qui dit « rien de particulier » est du bruit. */}
            {evenement.photos.map((photo) => (
              <li key={photo.id}>
                <figure className="photo-etape">
                  <a href={`/p/${jeton}/fichiers/${photo.id}`}>
                    <img src={liens.image(photo.id)} alt="" loading="lazy" />
                  </a>
                  {photo.role !== "general" && (
                    <figcaption>{LIBELLES_ROLE_PHOTO[photo.role]}</figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
