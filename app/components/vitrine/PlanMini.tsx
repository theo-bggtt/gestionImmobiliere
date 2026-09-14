// app/components/vitrine/PlanMini.tsx
// Le même plan, dessiné une fois par lecteur, avec en TIRETÉS ce que cette
// personne-là ne voit pas.
//
// C'est l'argument central du produit rendu par une convention de dessin
// plutôt que par un tableau : sur un relevé, un trait interrompu est ce qui
// existe mais n'est pas visible d'où l'on se tient. Il n'y a rien à lire pour
// comprendre qu'un lien de jardinier ne montre pas la chambre — ce qui est
// précisément ce que le produit prétend faire.
//
// Module NEUTRE, comme tout ce que cet arbre touche : aucun import de drizzle
// ni du schéma. `tests/vitrine/etancheite.test.ts` balaye les imports depuis
// les routes de la vitrine et n'autorise qu'une seule porte vers la base.
//
// Aucun attribut `style` : chaque trait est une CLASSE (`m-vu`, `m-hors`), car
// la politique de sécurité de cet arbre n'a pas d'`'unsafe-inline'`. La
// géométrie, elle, est en dur dans le fichier — c'est un schéma, pas la
// maison de quelqu'un.

/** Les six zones du plan de démonstration. Aucun rapport avec la base : ce
 *  sont des noms de dessin, choisis pour qu'un lecteur reconnaisse une
 *  habitation ordinaire en une seconde. */
export type ZoneMini = "cuisine" | "sejour" | "technique" | "entree" | "chambre" | "jardin";

/** Une zone du dessin : son rectangle, et l'endroit où se pose son nom. */
const ZONES: ReadonlyArray<{ cle: ZoneMini; x: number; y: number; l: number; h: number }> = [
  { cle: "cuisine", x: 12, y: 12, l: 46, h: 38 },
  { cle: "sejour", x: 58, y: 12, l: 46, h: 38 },
  { cle: "technique", x: 12, y: 50, l: 32, h: 38 },
  { cle: "entree", x: 44, y: 50, l: 28, h: 38 },
  { cle: "chambre", x: 72, y: 50, l: 32, h: 38 },
  { cle: "jardin", x: 114, y: 12, l: 48, h: 76 },
];

/** Les trois objets repérés, et la zone dont ils tiennent leur visibilité :
 *  un point suit sa zone, exactement comme `element.zone_id` décide de ce que
 *  voit un lien. */
const OBJETS: ReadonlyArray<{ zone: ZoneMini; x: number; y: number }> = [
  { zone: "technique", x: 28, y: 69 },
  { zone: "entree", x: 58, y: 69 },
  { zone: "jardin", x: 138, y: 50 },
];

export function PlanMini({ visibles, titre }: { visibles: readonly ZoneMini[]; titre: string }) {
  const voit = (zone: ZoneMini) => visibles.includes(zone);

  return (
    <div className="v-mini">
      <svg viewBox="0 0 174 100" role="img" aria-label={titre}>
        {/* La limite de parcelle, en trait mixte : elle n'appartient à
            personne et ne se masque pas. */}
        <rect className="m-parcelle" x="2" y="2" width="170" height="96" />

        {ZONES.map(({ cle, x, y, l, h }) => (
          <rect
            key={cle}
            className={
              (voit(cle) ? "m-vu" : "m-hors") + (cle === "jardin" ? " m-exterieur" : "")
            }
            x={x}
            y={y}
            width={l}
            height={h}
          />
        ))}

        {OBJETS.map(({ zone, x, y }) => (
          <circle
            key={`${zone}-${x}`}
            className={voit(zone) ? "m-objet" : "m-objet-hors"}
            cx={x}
            cy={y}
            r="3.4"
          />
        ))}
      </svg>
    </div>
  );
}
