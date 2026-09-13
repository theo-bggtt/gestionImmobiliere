// app/lib/partage/niveaux.ts
// Les quatre niveaux de visibilité du plan, nommés une seule fois. Ils
// servent au formulaire de création d'un partage et au résumé de sa portée.
export const LIBELLES_NIVEAU = ["public", "usage", "technique", "privé"] as const;

export const libelleNiveau = (niveau: number) => LIBELLES_NIVEAU[niveau] ?? String(niveau);

/**
 * Lit un niveau saisi dans un formulaire. Rend `null` — c'est-à-dire un REFUS
 * — quand le champ est absent, vide ou hors bornes, et jamais un repli sur 0.
 *
 * `Number("")` vaut 0, c'est-à-dire « public » : un formulaire amputé de ce
 * champ publierait au cran le plus ouvert. Le piège avait déjà été rencontré
 * sur les événements (`evenements.server.ts`) ; il est ici pire, parce que
 * `element.niveau` est ce que le plafond d'un lien de partage compare.
 */
export function lireNiveauSaisi(brut: FormDataEntryValue | null): number | null {
  const texte = String(brut ?? "").trim();
  return /^[0-3]$/.test(texte) ? Number(texte) : null;
}
