// tests/historique/photos.test.ts
// Le chemin d'ÉCRITURE des photos d'événement.
//
// La PR 1 avait livré les deux lectures — `chargerPhotosDeLEvenement` et le
// droit `photoDUnEvenement` — sans jamais écrire la ligne qu'elles lisent :
// aucun `fichier_lien` ne portait `cible_type = 'evenement'`. Les tests de
// `routes.test.ts` inséraient la ligne à la main, ce qui prouvait la lecture
// et masquait l'absence de l'écriture. C'est ce que ce fichier ferme.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element,
  evenement, evenementElement, fichier, garantie,
} from "../../app/db/schema/index";
import {
  attacherDocumentAGarantie,
  attacherPhotoAEvenement,
  chargerPhotosProprietaire,
  detacherDocumentDeGarantie,
  detacherPhotoDEvenement,
} from "../../app/lib/historique/photos.server";
import { chargerGarantiesProprietaire } from "../../app/lib/historique/garanties.server";
import { lire, cheminVignette } from "../../app/lib/stockage/fichiers.server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

/**
 * Une photo de chantier comme il en entre vraiment : orientation EXIF et
 * coordonnées GPS. Les deux doivent avoir disparu de ce qui est stocké — une
 * photo d'événement part sur un lien de partage comme une autre (règle #3).
 */
const photoDeChantier = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 190, b: 180 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestPhone" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 31/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();

async function creerJeu() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `ph-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison de test" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({
    origine: "perso", proprieteId: p.id, nom: `Appareil-${marque}`, champs: [], alias: [],
  }).returning();
  const [e] = await db.insert(element).values({
    proprieteId: p.id, nom: "Induction", typeId: t.id, zoneId: z.id, niveau: 0,
  }).returning();
  const [ev] = await db.insert(evenement).values({
    proprieteId: p.id, titre: "Renovation cuisine", dateDebut: "2026-03-01", type: "renovation", niveau: 0,
  }).returning();
  await db.insert(evenementElement).values({ evenementId: ev.id, elementId: e.id });
  const [g] = await db.insert(garantie).values({
    elementId: e.id, debut: "2024-01-01", fin: "2099-01-01",
  }).returning();
  return { p, ev, e, g };
}

describe("attacher une photo à un événement", () => {
  it("écrit le lien polymorphe que les lectures attendaient", async () => {
    const j = await creerJeu();
    const id = await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "avant");

    const liens = await db.execute<{ cibleType: string; cibleId: number; role: string }>(sql`
      SELECT cible_type AS "cibleType", cible_id AS "cibleId", role
      FROM fichier_lien WHERE fichier_id = ${id}
    `);
    expect(liens.rows).toEqual([{ cibleType: "evenement", cibleId: j.ev.id, role: "avant" }]);
  });

  it("efface l'EXIF et applique l'orientation, dans cet ordre", async () => {
    const j = await creerJeu();
    const id = await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "general");

    const [f] = (await db.execute<{ chemin: string; exifEfface: boolean }>(sql`
      SELECT chemin, exif_efface AS "exifEfface" FROM fichier WHERE id = ${id}
    `)).rows;
    const octets = await lire(f.chemin);

    // L'orientation 6 est un quart de tour : l'image stockée est en portrait,
    // preuve qu'elle a été redressée et pas seulement dépouillée.
    const meta = await sharp(octets).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(800);
    expect(octets.includes(Buffer.from("TestPhone"))).toBe(false);
    expect(f.exifEfface).toBe(true);
    // Et la vignette existe : c'est elle que rend une galerie.
    await expect(lire(cheminVignette(f.chemin))).resolves.toBeInstanceOf(Buffer);
  });

  it("range l'avant devant l'après, quel que soit l'ordre d'envoi", async () => {
    const j = await creerJeu();
    // Envoyé dans le désordre exprès : l'ordre du récit ne doit pas dépendre
    // de celui des envois ni des dates de prise.
    await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "general");
    await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "apres");
    await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "avant");

    const photos = await chargerPhotosProprietaire(j.p.id, j.ev.id);
    expect(photos.map((p) => p.role)).toEqual(["avant", "apres", "general"]);
  });

  it("refuse un événement d'une autre propriété, en 404", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    await expect(
      attacherPhotoAEvenement(j.p.id, autre.ev.id, await photoDeChantier(), "avant"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("`fichier.niveau` vaut 3, comme toute image du produit", async () => {
    const j = await creerJeu();
    const id = await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "avant");
    const [f] = (await db.execute<{ niveau: number }>(sql`SELECT niveau FROM fichier WHERE id = ${id}`)).rows;
    // La route à jeton l'ignore délibérément : c'est la visibilité de
    // l'événement qui autorise l'octet. Y écrire autre chose donnerait
    // l'illusion d'un réglage que rien ne lit.
    expect(f.niveau).toBe(3);
  });
});

describe("détacher une photo", () => {
  it("supprime le lien ET le fichier : des octets que rien n'autorise ne restent pas", async () => {
    const j = await creerJeu();
    const id = await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "apres");
    const [avant] = (await db.execute<{ chemin: string }>(sql`SELECT chemin FROM fichier WHERE id = ${id}`)).rows;

    await detacherPhotoDEvenement(j.p.id, j.ev.id, id);

    expect(await chargerPhotosProprietaire(j.p.id, j.ev.id)).toEqual([]);
    const restant = await db.execute(sql`SELECT id FROM fichier WHERE id = ${id}`);
    expect(restant.rows).toHaveLength(0);
    await expect(lire(avant.chemin)).rejects.toBeDefined();
  });

  it("refuse de détacher une photo qui n'est pas celle de cet événement", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    const id = await attacherPhotoAEvenement(autre.p.id, autre.ev.id, await photoDeChantier(), "avant");
    await expect(detacherPhotoDEvenement(j.p.id, j.ev.id, id)).rejects.toMatchObject({ status: 404 });
    // Et la photo de l'autre propriété est toujours là.
    const restant = await db.execute(sql`SELECT id FROM fichier WHERE id = ${id}`);
    expect(restant.rows).toHaveLength(1);
  });
});

describe("le fichier n'est pas orphelin", () => {
  it("aucune ligne `fichier` n'est écrite sans son lien", async () => {
    const j = await creerJeu();
    await attacherPhotoAEvenement(j.p.id, j.ev.id, await photoDeChantier(), "avant");
    // Les deux écritures sont dans une transaction : si la seconde échoue, la
    // première ne reste pas. Le contrôle porte sur ce jeu, qui n'a que des
    // photos d'événement — le document d'une garantie, lui, est rattaché par
    // `garantie.fichier_id` et n'a légitimement pas de `fichier_lien`.
    const orphelins = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM fichier f
      WHERE f.propriete_id = ${j.p.id}
        AND NOT EXISTS (SELECT 1 FROM fichier_lien fl WHERE fl.fichier_id = f.id)
    `);
    expect(orphelins.rows[0].n).toBe(0);
  });
});

describe("le document d'une garantie", () => {
  it("est rattaché par `garantie.fichier_id`, sans `fichier_lien`", async () => {
    const j = await creerJeu();
    const id = await attacherDocumentAGarantie(j.p.id, j.g.id, await photoDeChantier());

    const [g] = await chargerGarantiesProprietaire(j.p.id, j.e.id);
    expect(g.fichierId).toBe(id);

    // AUCUN lien polymorphe : c'est ce qui garantit qu'il n'y a pas de
    // quatrième droit sur les fichiers à écrire. Le document n'en a aucun, il
    // ne sort d'aucun partage.
    const liens = await db.execute(sql`SELECT 1 FROM fichier_lien WHERE fichier_id = ${id}`);
    expect(liens.rows).toHaveLength(0);
  });

  it("remplacer efface l'ancien, et seulement après que le nouveau est en base", async () => {
    const j = await creerJeu();
    const premier = await attacherDocumentAGarantie(j.p.id, j.g.id, await photoDeChantier());
    const [avant] = (await db.execute<{ chemin: string }>(sql`
      SELECT chemin FROM fichier WHERE id = ${premier}
    `)).rows;

    const second = await attacherDocumentAGarantie(j.p.id, j.g.id, await photoDeChantier());
    expect(second).not.toBe(premier);

    const [g] = await chargerGarantiesProprietaire(j.p.id, j.e.id);
    expect(g.fichierId).toBe(second);
    // L'ancienne ligne et ses octets sont partis.
    expect((await db.execute(sql`SELECT id FROM fichier WHERE id = ${premier}`)).rows).toHaveLength(0);
    await expect(lire(avant.chemin)).rejects.toBeDefined();
  });

  it("le retrait délie et efface", async () => {
    const j = await creerJeu();
    const id = await attacherDocumentAGarantie(j.p.id, j.g.id, await photoDeChantier());
    await detacherDocumentDeGarantie(j.p.id, j.g.id);

    const [g] = await chargerGarantiesProprietaire(j.p.id, j.e.id);
    expect(g.fichierId).toBeNull();
    expect((await db.execute(sql`SELECT id FROM fichier WHERE id = ${id}`)).rows).toHaveLength(0);
  });

  it("refuse une garantie d'une autre propriété, en 404", async () => {
    const j = await creerJeu();
    const autre = await creerJeu();
    await expect(
      attacherDocumentAGarantie(j.p.id, autre.g.id, await photoDeChantier()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(detacherDocumentDeGarantie(j.p.id, autre.g.id)).rejects.toMatchObject({ status: 404 });
  });

  it("l'EXIF est effacé là aussi : une photo de contrat porte du GPS comme une autre", async () => {
    const j = await creerJeu();
    const id = await attacherDocumentAGarantie(j.p.id, j.g.id, await photoDeChantier());
    const [f] = (await db.execute<{ chemin: string }>(sql`SELECT chemin FROM fichier WHERE id = ${id}`)).rows;
    const octets = await lire(f.chemin);
    expect(octets.includes(Buffer.from("TestPhone"))).toBe(false);
  });
});
