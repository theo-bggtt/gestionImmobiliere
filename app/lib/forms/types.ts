// app/lib/forms/types.ts
// La définition d'un champ dynamique, seule source de vérité.
//
// Fichier neutre : aucun import de drizzle, pour la même raison que
// `app/lib/plans/types.ts`. `CHAMP_GENRES` est une **valeur**, dérivée par
// `ChampEditor.tsx` et `types.nouveau.tsx` qui s'exécutent dans le navigateur ;
// tant qu'elle vivait dans `app/db/schema/types.ts`, à côté de `pgTable`, en
// importer la liste emportait le schéma de la base — 43 Ko de chunk client
// pour six chaînes de caractères. `npm run verifier:bundle` l'a constaté.
//
// Le schéma, lui, importe `ChampDefinition` d'ici pour typer sa colonne jsonb :
// la dépendance va de la base vers cette définition, jamais l'inverse.

// Liste fermée de six genres (règle non négociable #4) — seule source de
// vérité, dérivée par ChampEditor.tsx et types.nouveau.tsx pour éviter que
// les deux littéraux divergent.
export const CHAMP_GENRES = ["texte", "nombre", "date", "booleen", "choix", "fichier"] as const;
export type ChampGenre = (typeof CHAMP_GENRES)[number];

export type ChampDefinition = {
  cle: string;
  label: string;
  genre: ChampGenre;
  unite?: string;
  niveauMin: number; // 0 à 3, appliqué par `champsVisibles` depuis l'étape 3
  obligatoire: boolean;
  // Requis quand genre === "choix" : liste des valeurs possibles.
  // Extension non listée dans le prompt, nécessaire pour que "choix" valide quoi que ce soit.
  options?: string[];
};
