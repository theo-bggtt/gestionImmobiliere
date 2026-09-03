import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import type { ActionFunctionArgs } from "react-router";
import { db } from "../setup/test-db";
import {
  utilisateur, propriete, batiment, niveau, zone, typeElement, element, fichier, fichierLien, session,
} from "../../app/db/schema/index";

// La couche de stockage résout sa racine à l'import : la fixer avant de
// charger la route, sinon le test écrirait dans le volume de développement.
process.env.STOCKAGE_RACINE = await mkdtemp(join(tmpdir(), "gi-capture-"));
const { action } = await import("../../app/routes/_app/capture.envoyer");
const { sessionCookie } = await import("../../app/lib/auth/cookie.server");

async function photoAvecExif() {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 40, g: 90, b: 60 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestPhone" } })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

async function creerJeu() {
  const [u] = await db.insert(utilisateur).values({ email: `envoi-${Date.now()}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Maison" }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison", type: "principal" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Cuisine", type: "interieur" }).returning();
  const [t] = await db.insert(typeElement).values({ origine: "systeme", nom: `Prise-${Date.now()}`, champs: [] }).returning();

  const jeton = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: jeton, utilisateurId: u.id, expireLe: new Date(Date.now() + 3600_000) });
  const cookie = (await sessionCookie.serialize(jeton)).split(";")[0];

  return { u, p, z, t, cookie };
}

async function envoyer(cookie: string, proprieteId: number, champs: Record<string, string>, photo: Buffer) {
  const corps = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) corps.set(cle, valeur);
  corps.set("photo", new File([new Uint8Array(photo)], "p.jpg", { type: "image/jpeg" }), "p.jpg");

  const requete = new Request(`http://test/proprietes/${proprieteId}/capture/envoyer`, {
    method: "POST",
    body: corps,
    headers: { Cookie: cookie },
  });
  // L'action n'utilise que `request` et `params` ; le reste de la signature
  // React Router (url, pattern, context) n'a pas de sens hors routeur.
  return action({ request: requete, params: { proprieteId: String(proprieteId) } } as unknown as ActionFunctionArgs);
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE utilisateur, propriete CASCADE`);
});

describe("réception d'une capture", () => {
  it("crée une fiche sans aucun champ du type et sans EXIF", async () => {
    const { p, z, t, cookie } = await creerJeu();
    const reponse = await envoyer(cookie, p.id, {
      captureId: "aaaaaaaa-1111-2222-3333-444444444444",
      cibleGenre: "nouveau",
      zoneId: String(z.id),
      typeId: String(t.id),
      nom: "",
      datePrise: String(Date.now()),
    }, await photoAvecExif());

    expect(reponse.status).toBe(200);
    const { elementId } = (await reponse.json()) as { elementId: number };

    const [e] = await db.select().from(element).where(eq(element.id, elementId));
    // Aucun champ du type n'est demandé à la capture : `details` reste vide.
    expect(e.details).toEqual({});
    expect(e.niveau).toBe(3);
    // Nom absent côté client : régénéré depuis le type et la zone.
    expect(e.nom).toBe(`${t.nom} — ${z.nom}`);

    const [f] = await db.select().from(fichier).where(eq(fichier.proprieteId, p.id));
    expect(f.exifEfface).toBe(true);
    expect(f.zoneId).toBe(z.id);

    const [lien] = await db.select().from(fichierLien).where(eq(fichierLien.fichierId, f.id));
    expect(lien).toMatchObject({ cibleType: "element", cibleId: elementId, role: "general" });

    // Orientation appliquée (1200x800 pivoté) et métadonnées effacées sur
    // l'octet, pas seulement d'après la bibliothèque.
    const octets = await readFile(join(process.env.STOCKAGE_RACINE!, f.chemin));
    const meta = await sharp(octets).metadata();
    expect([meta.width, meta.height]).toEqual([800, 1200]);
    expect(meta.exif).toBeUndefined();
    expect(octets.includes(Buffer.from("Exif\0\0", "latin1"))).toBe(false);

    // Original + vignette.
    expect((await readdir(join(process.env.STOCKAGE_RACINE!, `propriete-${p.id}`))).length).toBe(2);
  });

  it("rejoue le même captureId sans créer de doublon", async () => {
    const { p, z, t, cookie } = await creerJeu();
    const champs = {
      captureId: "bbbbbbbb-1111-2222-3333-444444444444",
      cibleGenre: "nouveau",
      zoneId: String(z.id),
      typeId: String(t.id),
      nom: "Prise du fond",
      datePrise: String(Date.now()),
    };
    const photo = await photoAvecExif();

    const premier = (await (await envoyer(cookie, p.id, champs, photo)).json()) as { elementId: number };
    const second = (await (await envoyer(cookie, p.id, champs, photo)).json()) as { elementId: number; rejoue?: boolean };

    expect(second.elementId).toBe(premier.elementId);
    expect(second.rejoue).toBe(true);
    expect(await db.select().from(element).where(eq(element.proprieteId, p.id))).toHaveLength(1);
    expect(await db.select().from(fichier).where(eq(fichier.proprieteId, p.id))).toHaveLength(1);
  });

  it("refuse une zone qui appartient à quelqu'un d'autre", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();

    const reponse = await envoyer(mien.cookie, mien.p.id, {
      captureId: "cccccccc-1111-2222-3333-444444444444",
      cibleGenre: "nouveau",
      zoneId: String(autre.z.id),
      typeId: String(mien.t.id),
      nom: "",
      datePrise: String(Date.now()),
    }, await photoAvecExif());

    expect(reponse.status).toBe(400);
    expect(await db.select().from(element)).toHaveLength(0);
    expect(await db.select().from(fichier)).toHaveLength(0);
  });

  it("répond 404 sur la propriété d'un autre sans dire si elle existe", async () => {
    const mien = await creerJeu();
    const autre = await creerJeu();

    await expect(
      envoyer(mien.cookie, autre.p.id, {
        captureId: "dddddddd-1111-2222-3333-444444444444",
        cibleGenre: "nouveau",
        zoneId: String(autre.z.id),
        typeId: String(autre.t.id),
        nom: "",
        datePrise: String(Date.now()),
      }, await photoAvecExif()),
    ).rejects.toMatchObject({ status: 404 });
  });
});
