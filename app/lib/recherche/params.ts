// app/lib/recherche/params.ts
// Lecture et écriture des paramètres d'URL de la recherche, partagées par la
// route de ressource JSON et par l'écran de recherche (dont l'URL EST l'état).
import type { FacettesActives } from "./types";

const ids = (valeurs: string[]) => valeurs.map(Number).filter((n) => Number.isInteger(n) && n > 0);

export function lireParamsRecherche(sp: URLSearchParams): {
  q: string;
  facettes: FacettesActives;
  decalage: number;
} {
  return {
    q: sp.get("q") ?? "",
    facettes: {
      zones: ids(sp.getAll("zone")),
      systemes: ids(sp.getAll("systeme")),
      types: ids(sp.getAll("type")),
    },
    decalage: Math.max(Number(sp.get("decalage")) || 0, 0),
  };
}

export function ecrireParamsRecherche(q: string, facettes: FacettesActives): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set("q", q.trim());
  for (const id of facettes.zones) sp.append("zone", String(id));
  for (const id of facettes.systemes) sp.append("systeme", String(id));
  for (const id of facettes.types) sp.append("type", String(id));
  return sp;
}

/** Une recherche « active » : sans texte ni facette, il n'y a rien à afficher. */
export const rechercheActive = (q: string, f: FacettesActives) =>
  q.trim().length > 0 || f.zones.length > 0 || f.systemes.length > 0 || f.types.length > 0;
