// app/components/demarrage/RechercheAdresse.tsx
// L'enrichissement, greffé sur le chemin manuel : il pré-remplit deux
// réponses, il n'en est jamais la condition. Tout ce que cet écran obtient
// peut être saisi à la main juste en dessous.
import { useState } from "react";
import { useFetcher } from "react-router";
import type { CandidatBatiment, ResultatRegbl } from "../../lib/demarrage/types";

/**
 * L'adresse ne quitte jamais ce composant vers le formulaire : seules `forme`
 * et `niveauxHabitables` remontent. Elle n'a donc aucun moyen d'atterrir dans
 * le nom de la propriété, qui est le `<h1>` d'une page de partage.
 */
export function RechercheAdresse({
  proprieteId,
  onChoisir,
}: {
  proprieteId: number;
  onChoisir: (reponses: CandidatBatiment["reponses"]) => void;
}) {
  const fetcher = useFetcher<ResultatRegbl>();
  const [adresse, setAdresse] = useState("");
  const [choisi, setChoisi] = useState<number | null>(null);
  const enCours = fetcher.state !== "idle";

  function chercher() {
    const saisie = adresse.trim();
    if (saisie.length < 4) return;
    setChoisi(null);
    fetcher.load(`/proprietes/${proprieteId}/demarrer/adresse?q=${encodeURIComponent(saisie)}`);
  }

  return (
    <section className="demarrage-regbl">
      <h2>Votre bâtiment est en Suisse ?</h2>
      <p className="demarrage-aide">
        Son adresse permet de pré-remplir deux réponses depuis le registre fédéral des bâtiments.
        C'est facultatif : les questions ci-dessous se répondent très bien à la main.
      </p>

      <div className="demarrage-adresse-ligne">
        <input
          type="search"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          onKeyDown={(e) => {
            // Entrée cherche, sans soumettre le formulaire de création qui
            // englobe l'écran.
            if (e.key === "Enter") {
              e.preventDefault();
              chercher();
            }
          }}
          placeholder="Rue du Rhône 14, 1204 Genève"
          aria-label="Adresse du bâtiment"
          className="demarrage-adresse-champ"
        />
        <button type="button" onClick={chercher} disabled={enCours || adresse.trim().length < 4}>
          {enCours ? "Recherche…" : "Chercher"}
        </button>
      </div>

      {fetcher.data && (
        <Resultats
          resultat={fetcher.data}
          choisi={choisi}
          onChoisir={(candidat) => {
            setChoisi(candidat.rang);
            onChoisir(candidat.reponses);
          }}
        />
      )}

      <p className="demarrage-source">
        Source : Registre fédéral des bâtiments et des logements (RegBL), Office fédéral de la statistique.
      </p>
    </section>
  );
}

function Resultats({
  resultat,
  choisi,
  onChoisir,
}: {
  resultat: ResultatRegbl;
  choisi: number | null;
  onChoisir: (candidat: CandidatBatiment) => void;
}) {
  // « Aucun » et « indisponible » mènent au même endroit — les questions, plus
  // bas — mais ne disent pas la même chose, et le propriétaire mérite de savoir
  // s'il doit réessayer ou si son adresse n'est simplement pas dans le registre.
  if (resultat.statut === "indisponible") {
    return (
      <p className="demarrage-avis" role="status">
        Le registre ne répond pas. Répondez aux questions ci-dessous, le résultat est le même.
      </p>
    );
  }

  if (resultat.statut === "aucun") {
    return (
      <p className="demarrage-avis" role="status">
        Aucun bâtiment trouvé à cette adresse. Le registre ne couvre que la Suisse&nbsp;; répondez aux
        questions ci-dessous.
      </p>
    );
  }

  return (
    <>
      <p className="demarrage-aide" id="demarrage-choix">
        Choisissez votre bâtiment. Le registre propose des adresses proches, pas forcément la vôtre.
      </p>
      <ul className="demarrage-candidats" aria-labelledby="demarrage-choix">
        {resultat.candidats.map((candidat) => (
          <li key={candidat.rang}>
            <button
              type="button"
              onClick={() => onChoisir(candidat)}
              aria-pressed={choisi === candidat.rang}
              className={choisi === candidat.rang ? "demarrage-candidat choisi" : "demarrage-candidat"}
            >
              <span className="demarrage-candidat-adresse">{candidat.etiquette}</span>
              <span className="demarrage-candidat-detail">{candidat.description}</span>
            </button>
          </li>
        ))}
      </ul>
      {choisi !== null && (
        <p className="demarrage-avis" role="status">
          Réponses pré-remplies. Vérifiez-les, en particulier le sous-sol&nbsp;: le registre ne
          recense pas les caves.
        </p>
      )}
    </>
  );
}
