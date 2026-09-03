import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { traiterImage, LARGEUR_MAX, LARGEUR_VIGNETTE } from "../../app/lib/images/traitement.server";
import { LARGEUR_MAX_PLAN, QUALITE_PLAN } from "../../app/lib/plans/types";

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

// Un plan photographié sur une table : le propriétaire coupe les bords et
// redresse. Le calcul est fait ici et non dans le navigateur, pour n'encoder
// qu'une seule fois — et parce que « recadré et pivoté comme demandé » se
// vérifie alors sans navigateur.
async function planDeuxMoities() {
  const bleu = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 20, g: 20, b: 220 } } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 220, g: 20, b: 20 } } })
    .composite([{ input: bleu, left: 600, top: 0 }])
    .jpeg()
    .toBuffer();
}

// Moyennes par canal : après un JPEG de qualité 90 les valeurs bougent de
// quelques unités, jamais de cent.
async function dominante(image: Buffer) {
  const { channels } = await sharp(image).stats();
  return { rouge: channels[0].mean, bleu: channels[2].mean };
}

describe("recadrage et rotation d'un plan", () => {
  it("recadre la moitié demandée, et rien d'autre", async () => {
    const { original, largeur, hauteur } = await traiterImage(await planDeuxMoities(), {
      recadrage: { x: 50, y: 0, largeur: 50, hauteur: 100 },
      largeurMax: LARGEUR_MAX_PLAN,
      qualite: QUALITE_PLAN,
    });

    expect(largeur).toBe(600);
    expect(hauteur).toBe(800);
    const { rouge, bleu } = await dominante(original);
    expect(bleu).toBeGreaterThan(200);
    expect(rouge).toBeLessThan(60);
  });

  it("pivote avant de recadrer : le même rectangle ne découpe plus la même chose", async () => {
    // Un quart de tour horaire amène le bord gauche (rouge) sur le bord haut.
    const { original, largeur, hauteur } = await traiterImage(await planDeuxMoities(), {
      rotation: 90,
      recadrage: { x: 0, y: 0, largeur: 100, hauteur: 50 },
      largeurMax: LARGEUR_MAX_PLAN,
      qualite: QUALITE_PLAN,
    });

    expect(largeur).toBe(800);
    expect(hauteur).toBe(600);
    const { rouge, bleu } = await dominante(original);
    expect(rouge).toBeGreaterThan(200);
    expect(bleu).toBeLessThan(60);
  });

  it("efface l'EXIF d'un plan comme de toute autre image, géométrie comprise", async () => {
    const { original, vignette } = await traiterImage(await photoAvecExif(), {
      rotation: 3,
      recadrage: { x: 5, y: 5, largeur: 90, hauteur: 90 },
      largeurMax: LARGEUR_MAX_PLAN,
    });

    for (const image of [original, vignette]) {
      const meta = await sharp(image).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(contientSegmentExif(image)).toBe(false);
    }
  });

  it("plafonne un plan à sa résolution et non à celle d'une photo d'objet", async () => {
    const grand = await sharp({ create: { width: 5000, height: 3000, channels: 3, background: { r: 250, g: 250, b: 250 } } })
      .jpeg()
      .toBuffer();

    const plan = await traiterImage(grand, { largeurMax: LARGEUR_MAX_PLAN, qualite: QUALITE_PLAN });
    expect(plan.largeur).toBe(LARGEUR_MAX_PLAN);

    const objet = await traiterImage(grand);
    expect(objet.largeur).toBe(LARGEUR_MAX);
  });

  it("ne produit la dérivée moyenne que si elle est demandée", async () => {
    const grand = await sharp({ create: { width: 5000, height: 3000, channels: 3, background: { r: 250, g: 250, b: 250 } } })
      .jpeg()
      .toBuffer();

    // Une photo d'objet n'en a pas l'usage : la lui donner doublerait le
    // volume de chaque capture pour une image que personne ne demande.
    expect((await traiterImage(grand)).moyenne).toBeUndefined();

    const plan = await traiterImage(grand, {
      largeurMax: LARGEUR_MAX_PLAN,
      qualite: QUALITE_PLAN,
      largeurMoyenne: 1400,
    });
    expect((await sharp(plan.moyenne!).metadata()).width).toBe(1400);
  });
});
