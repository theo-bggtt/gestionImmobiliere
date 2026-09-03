// app/lib/plans/regroupement.ts
// Le regroupement des points quand on dézoome, calculé côté client, sans
// bibliothèque. Une grille en coordonnées ÉCRAN : deux points séparés de
// moins d'une cellule à l'écran fusionnent, et se séparent dès qu'on zoome
// assez pour qu'ils tiennent dans deux cellules. Le résultat ne dépend que
// des entrées, jamais de l'ordre d'arrivée — un rendu qui changerait de
// grappes d'une image à l'autre serait illisible.
import type { PointPlan } from "./types";

/** La taille d'une cible tactile confortable : deux pastilles plus proches se gênent. */
export const SEUIL_REGROUPEMENT = 44;

export type Grappe = {
  cle: string;
  /** Position en pourcentage de l'image : la moyenne des membres. */
  x: number;
  y: number;
  points: PointPlan[];
};

/**
 * `largeurEcran` / `hauteurEcran` sont les dimensions AFFICHÉES de l'image en
 * pixels CSS, zoom compris. C'est ce qui fait de la grille une grille
 * d'écran : à zoom 1 sur 400 px, 1 % vaut 4 px et tout se regroupe ; à zoom 8
 * il vaut 32 px et les points se séparent.
 */
export function regrouper(
  points: PointPlan[],
  largeurEcran: number,
  hauteurEcran: number,
  seuil: number = SEUIL_REGROUPEMENT,
): Grappe[] {
  if (!(largeurEcran > 0) || !(hauteurEcran > 0) || !(seuil > 0)) {
    return points.map((p) => ({ cle: `p${p.id}`, x: p.x, y: p.y, points: [p] }));
  }

  const cellules = new Map<string, { cx: number; cy: number; points: PointPlan[] }>();

  // Tri préalable par identifiant : deux appels sur le même jeu, dans un ordre
  // différent, doivent rendre les mêmes grappes dans le même ordre.
  for (const p of [...points].sort((a, b) => a.id - b.id)) {
    const cx = Math.floor(((p.x / 100) * largeurEcran) / seuil);
    const cy = Math.floor(((p.y / 100) * hauteurEcran) / seuil);
    const cle = `${cx}:${cy}`;
    const cellule = cellules.get(cle);
    if (cellule) cellule.points.push(p);
    else cellules.set(cle, { cx, cy, points: [p] });
  }

  return [...cellules.values()]
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx)
    .map(({ cx, cy, points: membres }) => ({
      cle: `${cx}:${cy}`,
      x: membres.reduce((somme, p) => somme + p.x, 0) / membres.length,
      y: membres.reduce((somme, p) => somme + p.y, 0) / membres.length,
      points: membres,
    }));
}
