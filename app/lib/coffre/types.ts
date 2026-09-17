// app/lib/coffre/types.ts
// Ce que les écrans du coffre et le serveur se partagent sans qu'un import de
// drizzle ne descende au navigateur. Module NEUTRE, même règle que
// `app/lib/forms/types.ts`.

/** Un secret tel que la fiche le reçoit : le bloc chiffré, jamais le clair. */
export type SecretRendu = {
  id: number;
  libelle: string;
  valeur: string;
};

/** Le libellé est en clair, en base : court, comme un nom de champ. */
export const LIBELLE_MAX = 120;

/**
 * Le clair d'un secret, borné AVANT chiffrement, dans le navigateur : un code,
 * une combinaison, un mot de passe, l'emplacement d'une clé. Un document n'a
 * rien à faire ici (un secret n'a pas de fichier, et le nombre de droits
 * nommés sur les fichiers reste à trois).
 */
export const VALEUR_MAX = 500;

/** Une phrase de coffre trop courte se devine ; la borne est la même que le mot de passe du compte. */
export const PHRASE_MIN = 8;
