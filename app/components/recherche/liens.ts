// app/components/recherche/liens.ts
// Les composants de résultats et de grille sont rendus par deux arbres de
// routes qui n'ont pas les mêmes URL : `/proprietes/:id/...` pour le
// propriétaire, `/p/:jeton/...` pour un lien de partage. Plutôt que de leur
// passer un identifiant de propriété et de laisser chacun recomposer ses
// chemins, ils reçoivent les liens déjà fabriqués.
//
// Ce n'est pas de la souplesse gratuite : la page de partage ne doit
// mentionner ni identifiant de propriété (règle non négociable #5) ni route
// protégée. En lui donnant `liensPartage`, elle n'a plus les moyens d'en
// écrire une.
// « moyenne » n'existe que pour les images de plan : c'est la seule qu'un
// porteur de lien reçoit en pleine résolution, et la seule qui pèse des méga-
// octets. Les autres images sont déjà bornées à 2000 px.
export type Taille = "vignette" | "moyenne" | "pleine";

export type Liens = {
  fiche: (elementId: number) => string;
  zone: (zoneId: number) => string;
  /** Vignette par défaut ; un plan se regarde en « moyenne », voir types.ts. */
  image: (fichierId: number, taille?: Taille) => string;
  /** Le plan d'un niveau. Le sélecteur est une liste de liens, sans script. */
  plan: (planId: number) => string;
  /** La chronologie. Le filtre par type y est un formulaire GET, sans script. */
  historique: string;
  /** Un événement. Côté propriétaire, c'est son écran de modification (décision #22). */
  evenement: (evenementId: number) => string;
  /** Création d'un objet. Absente d'un partage : la route est protégée. */
  ajout?: string;
};

const suffixe = (taille: Taille) => (taille === "pleine" ? "" : `?taille=${taille}`);

export const liensPropriete = (proprieteId: number): Liens => ({
  // La fiche est l'écran « modifier » (décision #22 de l'étape 1).
  fiche: (id) => `/proprietes/${proprieteId}/elements/${id}/modifier`,
  zone: (id) => `/proprietes/${proprieteId}/recherche?zone=${id}`,
  image: (id, taille = "vignette") => `/proprietes/${proprieteId}/fichiers/${id}${suffixe(taille)}`,
  plan: (id) => `/proprietes/${proprieteId}/plans?plan=${id}`,
  historique: `/proprietes/${proprieteId}/evenements`,
  evenement: (id) => `/proprietes/${proprieteId}/evenements/${id}/modifier`,
  ajout: `/proprietes/${proprieteId}/elements/nouveau`,
});

export const liensPartage = (jeton: string): Liens => ({
  fiche: (id) => `/p/${jeton}/objets/${id}`,
  zone: (id) => `/p/${jeton}?zone=${id}`,
  image: (id, taille = "vignette") => `/p/${jeton}/fichiers/${id}${suffixe(taille)}`,
  plan: (id) => `/p/${jeton}?plan=${id}`,
  historique: `/p/${jeton}/historique`,
  evenement: (id) => `/p/${jeton}/evenements/${id}`,
});
