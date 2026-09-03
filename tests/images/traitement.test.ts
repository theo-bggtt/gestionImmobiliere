import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { traiterImage, LARGEUR_VIGNETTE } from "../../app/lib/images/traitement.server";

// Une photo de téléphone tenue à la verticale sort du capteur en paysage avec
// un tag d'orientation ; c'est exactement ce cas qu'on reproduit ici.
async function photoAvecExif() {
  return sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 90, b: 150 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestPhone", Model: "TP-1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 31/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "6/1 14/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

// "Aucune métadonnée EXIF" se vérifie sur les octets, pas à l'œil : un JPEG
// porte son EXIF dans un segment APP1 (0xFFE1) commençant par "Exif\0\0".
function contientSegmentExif(jpeg: Buffer): boolean {
  if (jpeg.includes(Buffer.from("Exif\0\0", "latin1"))) return true;
  for (let i = 0; i < jpeg.length - 1; i++) {
    if (jpeg[i] === 0xff && jpeg[i + 1] === 0xe1) return true;
  }
  return false;
}

describe("traitement des images capturées", () => {
  it("la photo de départ porte bien un EXIF (sinon le test ne prouve rien)", async () => {
    const source = await photoAvecExif();
    const meta = await sharp(source).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.orientation).toBe(6);
    expect(contientSegmentExif(source)).toBe(true);
  });

  it("applique l'orientation puis efface toute métadonnée", async () => {
    const { original, vignette, largeur, hauteur } = await traiterImage(await photoAvecExif());

    // Orientation 6 = quart de tour : le paysage 1200x800 devient un portrait.
    expect(largeur).toBe(800);
    expect(hauteur).toBe(1200);

    for (const image of [original, vignette]) {
      const meta = await sharp(image).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(contientSegmentExif(image)).toBe(false);
    }

    const metaVignette = await sharp(vignette).metadata();
    expect(Math.max(metaVignette.width!, metaVignette.height!)).toBe(LARGEUR_VIGNETTE);
  });

  it("ne contient plus la marque ni les coordonnées de la source", async () => {
    const { original } = await traiterImage(await photoAvecExif());
    expect(original.includes(Buffer.from("TestPhone"))).toBe(false);
    expect(original.includes(Buffer.from("GPS"))).toBe(false);
  });
});
