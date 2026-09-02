// app/lib/forms/extraireDetails.ts
import type { ChampDefinition } from "../../db/schema/types";

export function extraireDetails(form: FormData, champs: ChampDefinition[]) {
  const details: Record<string, unknown> = {};
  for (const champ of champs) {
    if (champ.genre === "fichier") continue;
    if (champ.genre === "booleen") {
      details[champ.cle] = form.get(`details.${champ.cle}`) === "true";
      continue;
    }
    const valeur = form.get(`details.${champ.cle}`);
    if (valeur === null || valeur === "") continue;
    details[champ.cle] = valeur;
  }
  return details;
}
