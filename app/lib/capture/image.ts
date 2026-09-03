// app/lib/capture/image.ts
// Règle non négociable #4 : compresser AVANT d'écrire dans IndexedDB.
// Le quota par origine tourne autour de 50 à 200 Mo sur iOS ; une photo de
// téléphone brute (4 Mo) épuiserait la boîte d'envoi en quelques captures.

export const LARGEUR_MAX = 2000;
export const QUALITE = 0.8;

export type PhotoCompressee = { blob: Blob; largeur: number; hauteur: number };

// `imageOrientation: "from-image"` fait pivoter les pixels d'après l'EXIF.
// Le canvas, lui, n'écrit aucune métadonnée : la photo qui entre dans la file
// est donc déjà droite et déjà nettoyée. Le serveur refait le travail de son
// côté, parce qu'on ne fait pas confiance à ce qui arrive du réseau.
async function decoder(fichier: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    // Safari ancien : `<img>` applique l'orientation EXIF par défaut.
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function compresser(fichier: File): Promise<PhotoCompressee> {
  const source = await decoder(fichier);
  const largeurSource = "naturalWidth" in source ? source.naturalWidth : source.width;
  const hauteurSource = "naturalHeight" in source ? source.naturalHeight : source.height;

  const facteur = Math.min(1, LARGEUR_MAX / Math.max(largeurSource, hauteurSource));
  const largeur = Math.round(largeurSource * facteur);
  const hauteur = Math.round(hauteurSource * facteur);

  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const contexte = canvas.getContext("2d");
  if (!contexte) throw new Error("Canvas indisponible : impossible de compresser la photo.");
  contexte.drawImage(source as CanvasImageSource, 0, 0, largeur, hauteur);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resoudre) =>
    canvas.toBlob(resoudre, "image/jpeg", QUALITE),
  );
  if (!blob) throw new Error("Compression impossible : le navigateur n'a rien produit.");

  return { blob, largeur, hauteur };
}
