// app/lib/partage/niveaux.ts
// Les quatre niveaux de visibilité du plan, nommés une seule fois. Ils
// servent au formulaire de création d'un partage et au résumé de sa portée.
export const LIBELLES_NIVEAU = ["public", "usage", "technique", "privé"] as const;

export const libelleNiveau = (niveau: number) => LIBELLES_NIVEAU[niveau] ?? String(niveau);
