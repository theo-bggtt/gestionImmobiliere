// app/components/partage/FormulairePartage.tsx
// Le formulaire d'un lien, partagé par « créer » et « corriger ». Il vit ici
// et non dans un module de route : un composant exporté depuis `app/routes/`
// partirait dans le bundle avec tout ce qu'il traîne, et
// `tests/exports-routes.test.ts` le refuserait.
//
// Module NEUTRE — aucun import `.server`. Les zones et les systèmes arrivent
// déjà réduits à ce que l'écran affiche, la validation vit dans
// `lireSaisiePartage`, et les deux écrans lisent le même formulaire.
import { Form } from "react-router";
import { ChoixNiveau } from "../ChoixNiveau";

export type ChoixZone = { id: number; nom: string; chemin: string };
export type ChoixSysteme = { id: number; nom: string };
export type ChoixIntervenantPartage = { id: number; nom: string; metier: string | null };

export type ValeursPartage = {
  nom: string;
  niveauMax: number;
  porteeZones: number[];
  porteeSystemes: number[];
  /** `YYYY-MM-DD`, ou null. Découpé côté serveur : `new Date(…)` se lit en UTC. */
  expireLe: string | null;
  intervenantId: number | null;
};

export const PARTAGE_VIERGE: ValeursPartage = {
  nom: "",
  // Le défaut est « usage », pas « public » : un lien se crée pour quelqu'un
  // de précis, et le cran le plus ouvert se décide, il ne s'hérite pas.
  niveauMax: 1,
  porteeZones: [],
  porteeSystemes: [],
  expireLe: null,
  intervenantId: null,
};

export function FormulairePartage({
  valeurs,
  zones,
  systemes,
  intervenants,
  erreur,
  libelleBouton,
  /** Rendu en champ caché quand l'écran a déjà choisi la personne (la fiche
   *  d'un intervenant) : il n'y a alors rien à lui redemander. */
  intervenantImpose,
  actionCachee,
}: {
  valeurs: ValeursPartage;
  zones: ChoixZone[];
  systemes: ChoixSysteme[];
  intervenants: ChoixIntervenantPartage[];
  erreur?: string;
  libelleBouton: string;
  intervenantImpose?: number;
  /** Posé quand l'écran sert plusieurs formulaires (la fiche d'un
   *  intervenant) : sans lui, l'action lirait cette saisie comme l'autre. */
  actionCachee?: string;
}) {
  return (
    <Form method="post" className="formulaire">
      {actionCachee && <input type="hidden" name="_action" value={actionCachee} />}
      <label>
        Nom (pour vous seul)
        <input type="text" name="nom" defaultValue={valeurs.nom} required maxLength={120} placeholder="Jardinier Marc" />
        <span className="champ-aide">Ce nom ne sort d'aucune page de partage.</span>
      </label>

      {intervenantImpose === undefined ? (
        <label>
          Personne du carnet (optionnel)
          <select name="intervenantId" defaultValue={valeurs.intervenantId ?? ""}>
            <option value="">— personne en particulier —</option>
            {intervenants.map((i) => (
              <option key={i.id} value={i.id}>
                {[i.nom, i.metier].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
          <span className="champ-aide">
            Rattacher le lien à quelqu'un du carnet permet de le retrouver depuis sa fiche, et de le corriger plus tard
            sans lui en renvoyer un nouveau.
          </span>
        </label>
      ) : (
        <input type="hidden" name="intervenantId" value={intervenantImpose} />
      )}

      <ChoixNiveau
        nom="niveauMax"
        valeur={valeurs.niveauMax}
        etiquette="Plafond de visibilité"
        aide="Le lien montre les fiches jusqu'à ce niveau, jamais au-dessus."
      />

      <label>
        Expiration (optionnelle)
        <input type="date" name="expireLe" defaultValue={valeurs.expireLe ?? ""} />
      </label>

      <fieldset className="portee-choix">
        <legend className="cote">Portée — ne rien cocher donne toute la propriété</legend>
        <div className="portee-groupe">
          <h3 className="cote facettes-titre">Zones</h3>
          <div className="portee-cases">
            {zones.map((z) => (
              <label key={z.id} className="portee-case">
                <input
                  type="checkbox"
                  name="zone"
                  value={z.id}
                  defaultChecked={valeurs.porteeZones.includes(z.id)}
                />
                {z.nom} <span className="selecteur-secondaire">{z.chemin}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="portee-groupe">
          <h3 className="cote facettes-titre">Systèmes</h3>
          {systemes.length === 0 ? (
            <p className="resultats-vide">Aucun système.</p>
          ) : (
            <div className="portee-cases">
              {systemes.map((s) => (
                <label key={s.id} className="portee-case">
                  <input
                    type="checkbox"
                    name="systeme"
                    value={s.id}
                    defaultChecked={valeurs.porteeSystemes.includes(s.id)}
                  />
                  {s.nom}
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

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
