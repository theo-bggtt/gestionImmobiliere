// app/components/capture/IndicateurFile.tsx
import { useEffect, useState } from "react";
import { envoyerFile, etatCourant, relancerBloquees, souscrire, type EtatFile } from "../../lib/capture/synchro";

// Discret tant que tout part ; bruyant dès qu'une capture est bloquée, parce
// qu'une capture perdue en silence est le pire résultat possible.
export function IndicateurFile() {
  const [etat, setEtat] = useState<EtatFile>(etatCourant);

  useEffect(() => souscrire(setEtat), []);

  if (etat.enAttente === 0) return null;

  const bloquees = etat.bloquees.length;
  if (bloquees > 0) {
    return (
      <div className="file-indicateur file-indicateur-erreur" role="alert">
        <span>
          {bloquees} capture{bloquees > 1 ? "s" : ""} non envoyée{bloquees > 1 ? "s" : ""} — {etat.bloquees[0].echec}
        </span>
        <button type="button" onClick={() => void relancerBloquees()}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="file-indicateur" role="status">
      <span>{etat.enAttente} en attente</span>
      <button type="button" onClick={() => void envoyerFile()} disabled={etat.envoiEnCours}>
        {etat.envoiEnCours ? "Envoi…" : "Envoyer"}
      </button>
    </div>
  );
}
