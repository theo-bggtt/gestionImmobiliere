// app/components/historique/FormulaireEvenement.tsx
// Le formulaire d'un événement, partagé par « nouveau » et « modifier ». Il
// vit ici et non dans un module de route : un composant exporté depuis
// `app/routes/` partirait dans le bundle avec tout ce qu'il traîne, et
// `tests/exports-routes.test.ts` le refuserait.
import { useState } from "react";
import { Form } from "react-router";
import { LIBELLES_NIVEAU } from "../../lib/partage/niveaux";
import {
  LIBELLES_TYPE_EVENEMENT,
  MAX_LONGUEUR_TITRE,
  TYPES_EVENEMENT,
  type TypeEvenement,
} from "../../lib/historique/types";

export type ChoixElement = { id: number; nom: string; zoneNom: string; typeNom: string };
export type ChoixIntervenant = { id: number; nom: string; metier: string | null };

export type ValeursEvenement = {
  titre: string;
  dateDebut: string;
  dateFin: string | null;
  type: TypeEvenement;
  niveau: number;
  description: string | null;
  cout: string | null;
  elementIds: number[];
  intervenantIds: number[];
};

export const EVENEMENT_VIERGE = (aujourdhui: string): ValeursEvenement => ({
  titre: "",
  dateDebut: aujourdhui,
  dateFin: null,
  type: "entretien",
  // Défaut au plus fermé : un événement se montre sur décision, jamais par
  // oubli. Même raisonnement que `intervenant.niveau`.
  niveau: 3,
  description: null,
  cout: null,
  elementIds: [],
  intervenantIds: [],
});

export function FormulaireEvenement({
  valeurs,
  elements,
  intervenants,
  erreur,
  libelleBouton,
}: {
  valeurs: ValeursEvenement;
  elements: ChoixElement[];
  intervenants: ChoixIntervenant[];
  erreur?: string;
  libelleBouton: string;
}) {
  // Le seul état de l'écran : de quoi dire tout de suite ce qu'un événement
  // sans objet lié coûte. Le reste est un formulaire natif.
  const [lies, setLies] = useState<number[]>(valeurs.elementIds);

  const basculer = (id: number) =>
    setLies((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Form method="post" className="formulaire-evenement">
      <label>
        Titre
        <input
          type="text"
          name="titre"
          defaultValue={valeurs.titre}
          maxLength={MAX_LONGUEUR_TITRE}
          required
          placeholder="Remplacement de la chaudière"
        />
      </label>

      <div className="formulaire-ligne">
        <label>
          Début
          <input type="date" name="dateDebut" defaultValue={valeurs.dateDebut} required />
        </label>
        <label>
          Fin (optionnel)
          <input type="date" name="dateFin" defaultValue={valeurs.dateFin ?? ""} />
        </label>
      </div>

      <div className="formulaire-ligne">
        <label>
          Type
          <select name="type" defaultValue={valeurs.type}>
            {TYPES_EVENEMENT.map((t) => (
              <option key={t} value={t}>{LIBELLES_TYPE_EVENEMENT[t]}</option>
            ))}
          </select>
        </label>
        <label>
          Visibilité
          <select name="niveau" defaultValue={String(valeurs.niveau)}>
            {LIBELLES_NIVEAU.map((libelle, niveau) => (
              <option key={niveau} value={niveau}>{niveau} · {libelle}</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Description (optionnel)
        <textarea name="description" defaultValue={valeurs.description ?? ""} rows={4} />
      </label>

      <label>
        Coût (optionnel)
        <input type="text" name="cout" defaultValue={valeurs.cout ?? ""} inputMode="decimal" placeholder="4800.00" />
        <span className="formulaire-aide">Ne sort d'aucun lien de partage, quel que soit le niveau.</span>
      </label>

      <fieldset className="formulaire-liaisons">
        <legend>Objets concernés</legend>
        {/* La note dit un fait, pas un score de complétude (règle non
            négociable #2) : un événement sans objet lié n'a aucune zone d'où
            se rattacher à la portée d'un lien, donc il ne s'affiche sur aucun.
            Un événement dont UN objet sort de la portée disparaît de même :
            c'est écrit ici plutôt que découvert après coup. */}
        <p className={lies.length === 0 ? "formulaire-avis formulaire-avis-fort" : "formulaire-aide"}>
          {lies.length === 0
            ? "Sans objet lié, cet événement n'apparaîtra sur aucun lien de partage."
            : "Un lien de partage ne montre cet événement que si TOUS les objets ci-dessous sont dans sa portée."}
        </p>
        {elements.length === 0 ? (
          <p className="formulaire-aide">Aucun objet saisi pour l'instant.</p>
        ) : (
          <ul className="formulaire-cases">
            {elements.map((e) => (
              <li key={e.id}>
                <label>
                  <input
                    type="checkbox"
                    name="elementId"
                    value={e.id}
                    checked={lies.includes(e.id)}
                    onChange={() => basculer(e.id)}
                  />
                  {e.nom}
                  <span className="formulaire-detail"> · {e.zoneNom} · {e.typeNom}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="formulaire-liaisons">
        <legend>Intervenants</legend>
        {intervenants.length === 0 ? (
          <p className="formulaire-aide">Aucun intervenant enregistré.</p>
        ) : (
          <ul className="formulaire-cases">
            {intervenants.map((i) => (
              <li key={i.id}>
                <label>
                  <input
                    type="checkbox"
                    name="intervenantId"
                    value={i.id}
                    defaultChecked={valeurs.intervenantIds.includes(i.id)}
                  />
                  {i.nom}
                  {i.metier && <span className="formulaire-detail"> · {i.metier}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {erreur && <p role="alert">{erreur}</p>}
      <button type="submit">{libelleBouton}</button>
    </Form>
  );
}
