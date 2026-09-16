// app/components/historique/FormulaireIntervenant.tsx
// Le formulaire d'un intervenant, partagé par « nouveau » et « modifier ».
//
// L'écran dit ce que le niveau décide, parce que c'est ici que le propriétaire
// engage quelqu'un d'autre que lui : le nom d'une entreprise peut sortir vers
// un lien qui circule, jamais son téléphone ni son adresse e-mail.
import { Form } from "react-router";
import { ChoixNiveau } from "../ChoixNiveau";
import {
  MAX_LONGUEUR_CHAMP_COURT,
  MAX_LONGUEUR_NOM_INTERVENANT,
} from "../../lib/historique/types";

export type ValeursIntervenant = {
  nom: string;
  metier: string | null;
  tel: string | null;
  email: string | null;
  niveau: number;
  notes: string | null;
};

export const INTERVENANT_VIERGE: ValeursIntervenant = {
  nom: "",
  metier: null,
  tel: null,
  email: null,
  // Le défaut du schéma, répété ici parce que c'est le défaut qui compte :
  // rien ne sort tant que le propriétaire ne l'a pas décidé.
  niveau: 3,
  notes: null,
};

export function FormulaireIntervenant({
  valeurs,
  erreur,
  libelleBouton,
}: {
  valeurs: ValeursIntervenant;
  erreur?: string;
  libelleBouton: string;
}) {
  return (
    <Form method="post" className="formulaire">
      <label>
        Nom
        <input
          type="text"
          name="nom"
          defaultValue={valeurs.nom}
          maxLength={MAX_LONGUEUR_NOM_INTERVENANT}
          required
          placeholder="Sanitaire Dupont SA"
        />
      </label>

      <label>
        Métier (optionnel)
        <input
          type="text"
          name="metier"
          defaultValue={valeurs.metier ?? ""}
          maxLength={MAX_LONGUEUR_CHAMP_COURT}
          placeholder="Chauffagiste"
        />
      </label>

      <div className="formulaire-ligne">
        <label>
          Téléphone (optionnel)
          <input type="tel" name="tel" defaultValue={valeurs.tel ?? ""} maxLength={MAX_LONGUEUR_CHAMP_COURT} />
        </label>
        <label>
          E-mail (optionnel)
          <input type="email" name="email" defaultValue={valeurs.email ?? ""} maxLength={MAX_LONGUEUR_CHAMP_COURT} />
        </label>
      </div>
      <p className="message-avis">
        Le téléphone et l'e-mail ne sortent d'aucun lien de partage, quel que soit le niveau ci-dessous. Ce sont
        les coordonnées d'un tiers, qui n'a pas choisi de figurer sur une adresse que l'on peut faire suivre.
      </p>

      <ChoixNiveau
        valeur={valeurs.niveau}
        etiquette="Visibilité du nom et du métier"
        aide="« Privé » (le défaut) veut dire qu'aucun lien ne montre cet intervenant. Le baisser fait apparaître son nom et son métier sur les événements déjà visibles."
      />

      <label>
        Notes (optionnel)
        <textarea name="notes" defaultValue={valeurs.notes ?? ""} rows={3} />
        <span className="champ-aide">Pour vous seul : les notes ne sortent d'aucun lien.</span>
      </label>

      {erreur && (
        <p role="alert" className="message-erreur">
          {erreur}
        </p>
      )}
      <div className="formulaire-actions">
        <button type="submit">{libelleBouton}</button>
      </div>
    </Form>
  );
}
