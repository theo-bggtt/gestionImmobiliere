// app/lib/images/traitement.server.ts
import sharp from "sharp";

export const LARGEUR_MAX = 2000;
export const LARGEUR_VIGNETTE = 400;

export type ImageTraitee = {
  original: Buffer;
  vignette: Buffer;
  largeur: number;
  hauteur: number;
};

// Règle non négociable #5 : orientation appliquée PUIS métadonnées effacées.
// `rotate()` sans argument lit l'orientation EXIF et pivote les pixels ; sharp
// n'écrit aucune métadonnée en sortie tant qu'on n'appelle pas keepMetadata(),
// donc les coordonnées GPS ne survivent pas au ré-encodage. L'ordre est porté
// par la bibliothèque : pivoter après avoir effacé serait impossible ici.
export async function traiterImage(entree: Buffer): Promise<ImageTraitee> {
  const source = sharp(entree, { failOn: "error" }).rotate();

  const { data: original, info } = await source
    .clone()
    .resize({ width: LARGEUR_MAX, height: LARGEUR_MAX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const vignette = await source
    .clone()
    .resize({ width: LARGEUR_VIGNETTE, height: LARGEUR_VIGNETTE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  return { original, vignette, largeur: info.width, hauteur: info.height };
}
