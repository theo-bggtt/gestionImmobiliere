// app/lib/dates.ts
//
// Le rendu d'une date `YYYY-MM-DD`, écrit une seule fois. Module **neutre** :
// aucun import, donc ni drizzle ni rien de serveur — les composants de
// `_partage/` le chargent comme ceux du propriétaire, même règle que
// `app/lib/forms/types.ts`.
//
// Une seule écriture du découpage, pour la même raison que `CHAMP_GENRES` et
// `TYPES_EVENEMENT` : le piège en dessous est facile à oublier, et il ne se
// voit pas depuis l'écran qui l'a oublié.

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * `YYYY-MM-DD` en date lisible, découpée à la main.
 *
 * `new Date("2026-03-01")` se lit en UTC et rendrait « 28 février » à l'ouest
 * de Greenwich : c'est le même piège que le `to_char` côté serveur, et il se
 * ferme des deux côtés. `toLocaleDateString` ne le ferme pas — il part du même
 * `Date` mal lu.
 *
 * Ce qui n'a pas la forme attendue ressort tel quel plutôt que faux : une date
 * illisible se remarque, une date décalée d'un jour ne se remarque pas.
 */
export function jourLisible(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  const nom = MOIS[Number(mois) - 1];
  return nom ? `${Number(jour)} ${nom} ${annee}` : iso;
}
