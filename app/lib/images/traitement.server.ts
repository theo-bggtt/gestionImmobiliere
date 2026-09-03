// app/lib/images/traitement.server.ts
import sharp from "sharp";

export const LARGEUR_MAX = 2000;
export const LARGEUR_VIGNETTE = 400;
export const QUALITE = 82;

// Les plafonds propres au plan vivent dans `app/lib/plans/types.ts` : ce
// module-ci traite une image, il n'a pas à savoir ce qu'elle représente. Le
// navigateur en a besoin aussi (il rastérise les PDF à la même résolution),
// et il ne peut pas importer un module qui charge sharp.

// Le fond des coins découverts par une rotation. Blanc : un plan est du trait
// sur du papier, un fond noir ferait une bordure là où il n'y a rien.
const FOND_ROTATION = "#ffffff";

/** Rectangle de recadrage, en POURCENTAGE de l'image déjà pivotée. */
export type Recadrage = { x: number; y: number; largeur: number; hauteur: number };

export type OptionsTraitement = {
  largeurMax?: number;
  qualite?: number;
  /** Degrés, appliqués après l'orientation EXIF et avant le recadrage. */
  rotation?: number;
  recadrage?: Recadrage;
};

export type ImageTraitee = {
  original: Buffer;
  vignette: Buffer;
  largeur: number;
  hauteur: number;
};

/**
 * Rotation puis recadrage, dans cet ordre : on redresse d'abord, on coupe les
 * bords et les coins de fond ensuite — c'est l'ordre de ce que fait la main
 * sur l'écran d'édition, et l'inverse ne donnerait pas le même résultat.
 *
 * L'intermédiaire est un PNG et non un JPEG : il n'existe que pour connaître
 * les dimensions APRÈS rotation (le recadrage est exprimé en pourcentage de
 * l'image pivotée), et le ré-encoder en JPEG coûterait une génération de
 * compression de plus sur du trait fin.
 */
async function redresser(entree: Buffer, rotation: number, recadrage?: Recadrage): Promise<Buffer> {
  if (rotation === 0 && !recadrage) return entree;

  // `.rotate()` lit l'orientation EXIF, `.rotate(angle)` tourne réellement, et
  // les deux composent dans la même pipeline : un paysage 1200x800 en
  // orientation 6 sort bien à 996x1321 pour 10 degrés, la boîte englobante du
  // portrait 800x1200. Sans ça il faudrait deux passes.
  const pivotee = sharp(entree, { failOn: "error" }).rotate();
  const { data, info } = await (rotation === 0 ? pivotee : pivotee.rotate(rotation, { background: FOND_ROTATION }))
    .png()
    .toBuffer({ resolveWithObject: true });

  if (!recadrage) return data;

  const enPixels = (part: number, total: number) => Math.round((part / 100) * total);
  const borner = (valeur: number, min: number, max: number) => Math.min(Math.max(valeur, min), max);

  // Un rectangle qui déborde ferait échouer `extract` sur une erreur de bas
  // niveau plutôt que sur un message utile : on borne ici.
  const left = borner(enPixels(recadrage.x, info.width), 0, info.width - 1);
  const top = borner(enPixels(recadrage.y, info.height), 0, info.height - 1);
  const width = borner(enPixels(recadrage.largeur, info.width), 1, info.width - left);
  const height = borner(enPixels(recadrage.hauteur, info.height), 1, info.height - top);

  return sharp(data).extract({ left, top, width, height }).png().toBuffer();
}

// Règle non négociable #5 : orientation appliquée PUIS métadonnées effacées.
// `rotate()` sans argument lit l'orientation EXIF et pivote les pixels ; sharp
// n'écrit aucune métadonnée en sortie tant qu'on n'appelle pas keepMetadata(),
// donc les coordonnées GPS ne survivent pas au ré-encodage. L'ordre est porté
// par la bibliothèque : pivoter après avoir effacé serait impossible ici.
export async function traiterImage(entree: Buffer, options: OptionsTraitement = {}): Promise<ImageTraitee> {
  const largeurMax = options.largeurMax ?? LARGEUR_MAX;
  const qualite = options.qualite ?? QUALITE;

  const redressee = await redresser(entree, options.rotation ?? 0, options.recadrage);
  const source = sharp(redressee, { failOn: "error" }).rotate();

  const { data: original, info } = await source
    .clone()
    .resize({ width: largeurMax, height: largeurMax, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: qualite, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const vignette = await source
    .clone()
    .resize({ width: LARGEUR_VIGNETTE, height: LARGEUR_VIGNETTE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  return { original, vignette, largeur: info.width, hauteur: info.height };
}
