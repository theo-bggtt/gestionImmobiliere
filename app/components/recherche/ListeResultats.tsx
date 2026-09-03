// app/components/recherche/ListeResultats.tsx
import { Link } from "react-router";
import { LIBELLE_MOTIF, type ReponseRecherche } from "../../lib/recherche/types";
import type { Liens } from "./liens";

export function ListeResultats({
  liens,
  donnees,
  enCours,
}: {
  liens: Liens;
  donnees: ReponseRecherche;
  enCours: boolean;
}) {
  const { resultats, total, q, typesProches } = donnees;

  if (resultats.length === 0) {
    return (
      <section className="resultats" aria-busy={enCours}>
        <p className="resultats-compte">Aucun résultat{q ? ` pour « ${q} »` : ""}.</p>
        {typesProches.length > 0 ? (
          <div className="resultats-vide">
            <p>
              Ce mot désigne {typesProches.length > 1 ? "ces types" : "ce type"} du catalogue, dont aucun objet
              n'est encore enregistré ici :
            </p>
            <ul className="types-proches">
              {typesProches.map((t) => (
                <li key={t.id}>
                  <span className="types-proches-nom">{t.nom}</span>
                  {t.alias.length > 0 && <span className="types-proches-alias">{t.alias.join(" · ")}</span>}
                </li>
              ))}
            </ul>
            {liens.ajout && <Link to={liens.ajout}>Ajouter un objet</Link>}
          </div>
        ) : (
          <p className="resultats-vide">Essayez un autre mot, ou parcourez les zones depuis l'accueil.</p>
        )}
      </section>
    );
  }

  return (
    <section className="resultats" aria-busy={enCours}>
      <p className="resultats-compte">
        {total} résultat{total > 1 ? "s" : ""}
        {total > resultats.length ? ` — ${resultats.length} affichés` : ""}
      </p>
      <ul className="resultats-liste">
        {resultats.map((r) => (
          <li key={r.id}>
            <Link to={liens.fiche(r.id)} className="resultat">
              {r.fichierId ? (
                <img className="resultat-vignette" src={liens.image(r.fichierId)} alt="" loading="lazy" />
              ) : (
                <span className="resultat-vignette resultat-vignette-vide" aria-hidden="true">
                  {r.nom.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="resultat-texte">
                <span className="resultat-nom">{r.nom}</span>
                <span className="resultat-lieu">
                  {r.zoneNom} · {r.zoneChemin}
                </span>
              </span>
              {r.motif && <span className="resultat-motif">{LIBELLE_MOTIF[r.motif]}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
