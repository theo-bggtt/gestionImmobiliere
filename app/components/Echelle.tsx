// app/components/Echelle.tsx
// Les quatre barreaux d'un plafond de lecture : public, usage, technique,
// privé. Remplis jusqu'au plafond, de un à quatre.
//
// `aria-hidden` : c'est un DESSIN, et la portée est toujours écrite en toutes
// lettres à côté. Un lecteur d'écran qui annoncerait « quatre barreaux dont
// deux pleins » n'apprendrait rien de plus que « jusqu'à l'usage ».
//
// Partagé par la vitrine ET l'application (le choix du niveau d'une fiche,
// `ChoixNiveau`) plutôt que recopié : tous montrent la même échelle, et
// deux copies divergeraient le jour où un cinquième niveau existerait — ce
// qu'il ne doit pas, `element.niveau` étant une liste fermée de quatre
// valeurs. Module NEUTRE, sans import : la vitrine l'atteint.
//
// Rendue en `<span>` et non en `<div>` : sur la page de partage, l'échelle
// vit DANS le `<span>` qui nomme le niveau, et un `<div>` y serait du HTML
// invalide.

/** Le plafond, de 1 (public seul) à 4 (tout). */
export type Plafond = 1 | 2 | 3 | 4;

export function Echelle({ plafond }: { plafond: Plafond }) {
  return (
    <span className="echelle" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={n <= plafond ? "plein" : undefined} />
      ))}
    </span>
  );
}
