// app/components/DynamicElementFields.tsx
import type { ChampDefinition } from "../db/schema/types";

export function DynamicElementFields({ champs, valeurs = {} }: { champs: ChampDefinition[]; valeurs?: Record<string, unknown> }) {
  return (
    <>
      {champs.map((champ) => {
        const nomChamp = `details.${champ.cle}`;
        const valeur = valeurs[champ.cle];

        if (champ.genre === "fichier") {
          // Décision verrouillée #6 : téléversement non construit à cette étape.
          return <p key={champ.cle}>{champ.label} : téléversement de fichier à venir (étape 6).</p>;
        }

        return (
          <label key={champ.cle}>
            {champ.label}
            {champ.unite ? ` (${champ.unite})` : ""}
            {champ.genre === "texte" && (
              <input type="text" name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire} />
            )}
            {champ.genre === "nombre" && (
              <input type="number" name={nomChamp} defaultValue={typeof valeur === "number" ? valeur : ""} required={champ.obligatoire} step="any" />
            )}
            {champ.genre === "date" && (
              <input type="date" name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire} />
            )}
            {champ.genre === "booleen" && (
              <input type="checkbox" name={nomChamp} defaultChecked={Boolean(valeur)} value="true" />
            )}
            {champ.genre === "choix" && (
              <select name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire}>
                <option value="">—</option>
                {(champ.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            )}
          </label>
        );
      })}
    </>
  );
}
