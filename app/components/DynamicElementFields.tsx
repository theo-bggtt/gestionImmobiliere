// app/components/DynamicElementFields.tsx
import type { ReactNode } from "react";
import type { ChampDefinition } from "../lib/forms/types";

export function DynamicElementFields({ champs, valeurs = {} }: { champs: ChampDefinition[]; valeurs?: Record<string, unknown> }) {
  return (
    <>
      {champs.map((champ) => {
        const nomChamp = `details.${champ.cle}`;
        const valeur = valeurs[champ.cle];

        if (champ.genre === "fichier") {
          // Le genre existe dans la liste fermée (décision verrouillée #6), le
          // téléversement d'un champ de fiche n'est construit dans AUCUNE
          // étape : il attend un besoin réel, voir le plan d'implémentation.
          // La capture, elle, sait photographier — c'est autre chose.
          return <p key={champ.cle}>{champ.label} : le téléversement de fichier n'est pas encore construit.</p>;
        }

        let input: ReactNode;
        switch (champ.genre) {
          case "texte":
            input = <input type="text" name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire} />;
            break;
          case "nombre":
            input = <input type="number" name={nomChamp} defaultValue={typeof valeur === "number" ? valeur : ""} required={champ.obligatoire} step="any" />;
            break;
          case "date":
            input = <input type="date" name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire} />;
            break;
          case "booleen":
            input = <input type="checkbox" name={nomChamp} defaultChecked={Boolean(valeur)} value="true" />;
            break;
          case "choix":
            input = (
              <select name={nomChamp} defaultValue={typeof valeur === "string" ? valeur : ""} required={champ.obligatoire}>
                <option value="">—</option>
                {(champ.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            );
            break;
          default: {
            // Même garde qu'app/lib/forms/champSchema.ts (durci au Task 8) :
            // un genre inconnu doit échouer bruyamment, jamais rendre un
            // champ vide sans avertissement.
            const _exhaustive: never = champ.genre;
            throw new Error(`Genre inconnu pour le champ "${champ.cle}": ${_exhaustive}`);
          }
        }

        return (
          <label key={champ.cle}>
            {champ.label}
            {champ.unite ? ` (${champ.unite})` : ""}
            {input}
          </label>
        );
      })}
    </>
  );
}
