// app/lib/forms/champSchema.ts
import { z } from "zod";
import type { ChampDefinition } from "./types";

export function schemaPourChamps(champs: ChampDefinition[]) {
  const forme: Record<string, z.ZodTypeAny> = {};

  for (const champ of champs) {
    if (champ.genre === "fichier") {
      // Décision verrouillée #6 : le téléversement n'existe pas encore
      // (étape 6). Toujours optionnel, quel que soit `obligatoire`.
      forme[champ.cle] = z.any().optional();
      continue;
    }

    let base: z.ZodTypeAny;
    switch (champ.genre) {
      case "texte":
        base = z.string().min(1);
        break;
      case "nombre":
        base = z.coerce.number();
        break;
      case "date":
        base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)");
        break;
      case "booleen":
        base = z.coerce.boolean();
        break;
      case "choix": {
        if (!champ.options || champ.options.length === 0) {
          throw new Error(`Le champ "${champ.cle}" est de genre "choix" mais ne définit aucune option.`);
        }
        base = z.enum(champ.options as [string, ...string[]]);
        break;
      }
      default: {
        const _exhaustive: never = champ.genre;
        throw new Error(`Genre inconnu pour le champ "${champ.cle}": ${_exhaustive}`);
      }
    }

    forme[champ.cle] = champ.obligatoire ? base : base.optional().nullable();
  }

  // .passthrough() : un `details` existant peut porter la valeur d'un champ
  // retiré du type depuis (règle non négociable #3 — masqué, jamais effacé).
  return z.object(forme).passthrough();
}

export function validerDetails(champs: ChampDefinition[], details: unknown) {
  return schemaPourChamps(champs).safeParse(details);
}
