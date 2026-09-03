// app/lib/partage/champs.ts
// La dette de l'étape 0 arrive à échéance : `type_element.champs[].niveauMin`
// était capturé et jamais appliqué, faute de partage. Il l'est ici.
//
// Le filtrage se fait côté serveur, dans le loader, et ce qui est filtré n'est
// jamais envoyé au client : masquer à l'affichage laisserait la valeur dans le
// HTML rendu, c'est-à-dire dans la source de la page, à un clic droit.
import type { ChampDefinition } from "../../db/schema/types";

export type ChampRendu = { cle: string; label: string; valeur: string };

function formater(champ: ChampDefinition, valeur: unknown): string | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (champ.genre === "booleen") return valeur ? "Oui" : "Non";
  const texte = String(valeur).trim();
  if (texte === "") return null;
  return champ.unite ? `${texte} ${champ.unite}` : texte;
}

/**
 * Les champs qu'un porteur de lien a le droit de lire, dans l'ordre du type.
 * Un champ dont le `niveauMin` dépasse le plafond disparaît, alors que sa
 * fiche reste visible : le locataire voit la chaudière, pas son numéro de
 * série.
 *
 * Deux exclusions de plus, sans rapport avec la permission : le genre
 * `fichier` (le téléversement n'existe qu'à l'étape 6, il n'y a rien à
 * montrer) et les valeurs vides, qui n'apprendraient qu'une chose — que le
 * champ existe. Les clés de `details` absentes du type ne sont jamais rendues
 * non plus : un champ retiré est masqué et non effacé (règle non négociable
 * #5), et sans définition il n'a plus de `niveauMin` à respecter.
 */
export function champsVisibles(
  champs: ChampDefinition[],
  details: Record<string, unknown>,
  niveauMax: number,
): ChampRendu[] {
  const rendus: ChampRendu[] = [];
  for (const champ of champs) {
    if (champ.niveauMin > niveauMax) continue;
    if (champ.genre === "fichier") continue;
    const valeur = formater(champ, details[champ.cle]);
    if (valeur === null) continue;
    rendus.push({ cle: champ.cle, label: champ.label, valeur });
  }
  return rendus;
}
