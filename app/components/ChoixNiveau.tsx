// app/components/ChoixNiveau.tsx
// Le niveau d'une fiche, d'une zone, d'un événement ou d'un intervenant :
// la même échelle à quatre barreaux que la vitrine montre sur « Partager »,
// devenue un sélecteur. Ce que le visiteur a vu est ce que le propriétaire
// manipule. Quatre boutons radio et non un `<select>` : les quatre valeurs
// se voient d'un coup, avec leur dessin.
//
// Le champ s'appelle `niveau` (ou `niveauMax` pour le plafond d'un lien) et
// l'action ne change pas : un niveau absent est refusé par `lireNiveauSaisi`,
// jamais replié sur 0.
import { Echelle } from "./Echelle";
import { LIBELLES_NIVEAU } from "../lib/partage/niveaux";

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ChoixNiveau({
  valeur,
  onChange,
  etiquette = "Qui peut le voir",
  aide,
  depuis = 0,
  nom = "niveau",
}: {
  valeur: number;
  /** `niveau` partout, sauf le plafond d'un lien de partage (`niveauMax`). */
  nom?: string;
  /** Fourni quand l'écran a besoin de réagir au choix (l'aide de la
   *  création d'objet suit la suggestion du type). Sinon le groupe est non
   *  contrôlé. */
  onChange?: (niveau: number) => void;
  etiquette?: string;
  aide?: string;
  /** Le premier niveau proposé. Le renivelage en masse d'une zone commence
   *  à « usage » : mettre toute une zone en public d'un geste est refusé par
   *  l'action, donc il n'est pas proposé. */
  depuis?: 0 | 1;
}) {
  return (
    <div className="niveau-champ">
      <span className="niveau-etiquette">{etiquette}</span>
      <div className="niveau-choix" role="radiogroup" aria-label={etiquette}>
        {LIBELLES_NIVEAU.map((libelle, n) => n < depuis ? null : (
          <label key={libelle}>
            <input
              type="radio"
              name={nom}
              value={n}
              required
              {...(onChange ? { checked: n === valeur, onChange: () => onChange(n) } : { defaultChecked: n === valeur })}
            />
            <Echelle plafond={(n + 1) as 1 | 2 | 3 | 4} />
            {majuscule(libelle)}
          </label>
        ))}
      </div>
      {aide && <p className="champ-aide">{aide}</p>}
    </div>
  );
}
