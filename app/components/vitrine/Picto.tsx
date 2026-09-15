// app/components/vitrine/Picto.tsx
// Dix pictogrammes, un par capacité de « Ce que ça fait » et un pour le
// partage, dessinés dans le vocabulaire du relevé : trait d'encre pour ce
// qui est là, tireté graphite pour ce qui est proposé ou hors de vue, un
// seul aplat d'encre pour un point. Du SVG écrit dans la page — la politique
// de cet arbre n'a ni `img-src` externe ni `data:`, et
// `tests/vitrine/discours.test.ts` interdit `<img` et `url(` dans ses
// routes. Chaque trait est une CLASSE, jamais un attribut `style` : pas
// d'`'unsafe-inline'` ici.
//
// Module NEUTRE : aucun import. `tests/vitrine/etancheite.test.ts` suit les
// imports depuis les routes de la vitrine.
//
// `aria-hidden` : le titre de la capacité est écrit juste à côté.
import type { ReactNode } from "react";

export type NomPicto =
  | "photographier"
  | "retrouver"
  | "types"
  | "plan"
  | "contour"
  | "historique"
  | "garantie"
  | "intervenants"
  | "demarrage"
  | "partager";

const TRACES: Record<NomPicto, ReactNode> = {
  photographier: (
    <>
      <rect x="6" y="12" width="32" height="24" />
      <circle cx="22" cy="24" r="6" />
      <path d="M16 12l3-4h6l3 4" />
    </>
  ),
  retrouver: (
    <>
      <circle cx="19" cy="19" r="11" />
      <path d="M27 27l11 11" />
      <path className="p-tirete" d="M12 19h14" />
    </>
  ),
  types: (
    <>
      <rect x="6" y="8" width="14" height="14" />
      <rect x="24" y="8" width="14" height="14" />
      <rect x="6" y="26" width="14" height="14" />
      <rect className="p-tirete" x="24" y="26" width="14" height="14" />
    </>
  ),
  plan: (
    <>
      <rect x="6" y="8" width="32" height="28" />
      <path d="M6 22h32M22 8v14" />
      <circle className="p-plein" cx="30" cy="29" r="3.5" />
    </>
  ),
  contour: (
    <>
      <path className="p-tirete" d="M8 12l20-4 8 14-6 14-22-2z" />
      <circle className="p-plein" cx="8" cy="12" r="2.2" />
      <circle className="p-plein" cx="28" cy="8" r="2.2" />
      <circle className="p-plein" cx="36" cy="22" r="2.2" />
      <circle className="p-plein" cx="30" cy="36" r="2.2" />
      <circle className="p-plein" cx="8" cy="34" r="2.2" />
    </>
  ),
  historique: (
    <>
      <path d="M6 22h32" />
      <path d="M12 22v-8M22 22v-12M32 22v-6" />
      <circle className="p-plein" cx="12" cy="14" r="2.2" />
      <circle className="p-plein" cx="22" cy="10" r="2.2" />
      <circle className="p-plein" cx="32" cy="16" r="2.2" />
      <path className="p-tirete" d="M6 30h32" />
    </>
  ),
  garantie: (
    <>
      <rect x="8" y="10" width="28" height="26" />
      <path d="M8 18h28M15 6v8M29 6v8" />
      <path d="M15 27l4 4 8-8" />
    </>
  ),
  intervenants: (
    <>
      <circle cx="22" cy="15" r="7" />
      <path d="M8 38c2-8 7-12 14-12s12 4 14 12" />
      <path className="p-tirete" d="M31 30h9" />
    </>
  ),
  demarrage: (
    <>
      <path d="M6 20L22 8l16 12" />
      <path d="M10 18v18h24V18" />
      <path className="p-tirete" d="M10 27h24M22 27v9" />
    </>
  ),
  partager: (
    <>
      <rect x="6" y="8" width="20" height="28" />
      <rect className="p-tirete" x="26" y="8" width="12" height="28" />
      <path d="M11 16h10M11 22h10M11 28h6" />
    </>
  ),
};

export function Picto({ nom }: { nom: NomPicto }) {
  return (
    <svg className="v-picto" viewBox="0 0 44 44" aria-hidden="true">
      {TRACES[nom]}
    </svg>
  );
}
