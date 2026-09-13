// tests/vitrine/liste-attente.test.ts
// La propriété qui compte : une adresse déjà inscrite et une adresse nouvelle
// donnent LA MÊME réponse. « Vous êtes déjà inscrit » serait un oracle —
// n'importe qui pourrait tester, une adresse à la fois, si quelqu'un figure
// sur cette liste. Même famille que « filtré = 404, jamais 403 » : ce n'est
// pas la réponse qu'on masque, c'est la différence qu'on supprime.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { interesse } from "../../app/db/schema/index";
import {
  adressePlausible,
  enregistrerInteresse,
  normaliser,
} from "../../app/lib/vitrine/liste-attente.server";

const route = await import("../../app/routes/_vitrine/accueil");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM interesse`);
});

const envoyer = (email: string) =>
  route.action({
    request: new Request("http://test.local/", {
      method: "POST",
      body: new URLSearchParams({ email }),
    }),
    params: {},
    context: {} as never,
  } as never);

/** Ce que l'appelant voit vraiment : le corps ET les en-têtes. */
async function reponse(email: string) {
  const r = (await envoyer(email)) as { data: unknown; init?: ResponseInit };
  return { corps: r.data, init: r.init };
}

describe("l'insertion est idempotente et ne dit pas si elle a inséré", () => {
  it("enregistrerInteresse ne rend RIEN, dans les deux cas", async () => {
    // La fermeture est ici et pas dans l'écran : un appelant ne peut pas
    // divulguer ce qu'il n'a pas reçu, et le prochain écran qui s'en servira
    // n'aura pas à connaître le piège.
    expect(await enregistrerInteresse("neuve@exemple.test")).toBeUndefined();
    expect(await enregistrerInteresse("neuve@exemple.test")).toBeUndefined();
  });

  it("deux envois de la même adresse laissent UNE ligne, sans lever", async () => {
    await enregistrerInteresse("double@exemple.test");
    await enregistrerInteresse("double@exemple.test");
    const lignes = await db.select().from(interesse);
    expect(lignes).toHaveLength(1);
  });

  it("la réponse est identique, octet pour octet, que la ligne soit neuve ou non", async () => {
    const premiere = await reponse("oracle@exemple.test");
    const seconde = await reponse("oracle@exemple.test");
    // C'est LA propriété de cette issue. Comparée en entier — corps et
    // en-têtes — parce qu'un oracle passe aussi bien par un en-tête.
    expect(seconde).toEqual(premiere);
    expect(JSON.stringify(seconde)).toBe(JSON.stringify(premiere));
  });

  it("une adresse déjà là n'est pas distinguable d'une adresse neuve", async () => {
    await enregistrerInteresse("connue@exemple.test");
    const connue = await reponse("connue@exemple.test");
    const inconnue = await reponse("inconnue@exemple.test");
    expect(connue).toEqual(inconnue);
  });
});

describe("ce qui est écrit, et rien de plus", () => {
  it("la table ne porte qu'une adresse et une date", async () => {
    const colonnes = await db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'interesse'
      ORDER BY column_name
    `);
    // Pas d'IP, pas de `User-Agent`, pas de provenance, pas de champ libre :
    // ce qu'on ne stocke pas ne fuit pas et n'a pas à se justifier.
    expect(colonnes.rows.map((c) => c.column_name)).toEqual(["cree_le", "email", "id"]);
  });

  it("l'adresse est normalisée avant d'être écrite", async () => {
    // Sinon `UNIQUE` ne servirait à rien : il compare des octets, et une
    // adresse tapée sur un téléphone arrive avec une majuscule initiale.
    await enregistrerInteresse(normaliser("  Theo@Exemple.TEST "));
    await enregistrerInteresse(normaliser("theo@exemple.test"));
    const lignes = await db.select().from(interesse);
    expect(lignes.map((l) => l.email)).toEqual(["theo@exemple.test"]);
  });

  it("une adresse invalide n'écrit rien", async () => {
    const r = await reponse("pas-une-adresse");
    expect(r.corps).toEqual({ issue: "adresse-invalide" });
    expect(await db.select().from(interesse)).toHaveLength(0);
  });
});

describe("la validation reste pauvre, à dessein", () => {
  it("accepte ce qui ressemble à une adresse, refuse ce qui n'y ressemble pas", () => {
    for (const bonne of ["a@b.co", "theo.be+liste@exemple.test"]) {
      expect(adressePlausible(bonne), bonne).toBe(true);
    }
    for (const mauvaise of ["", "theo", "theo@", "@exemple.test", "theo@exemple", "a b@c.de", `${"x".repeat(250)}@exemple.test`]) {
      expect(adressePlausible(mauvaise), JSON.stringify(mauvaise.slice(0, 20))).toBe(false);
    }
  });
});

describe("la réponse d'un envoi ne se met pas en cache", () => {
  it("elle porte `no-store`, alors que la page est en cache public", async () => {
    // La page est servie en `public, max-age=300` : la réponse à un envoi,
    // elle, ne concerne que celui qui vient de l'envoyer.
    const r = await reponse("cache@exemple.test");
    expect(new Headers(r.init?.headers).get("Cache-Control")).toBe("no-store");
  });

  it("et c'est cette valeur-là que la route pose", async () => {
    const entetes = route.headers({
      actionHeaders: new Headers({ "Cache-Control": "no-store" }),
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
      errorHeaders: undefined,
    } as never);
    expect(entetes["Cache-Control"]).toBe("no-store");

    // Sans action — une simple visite — la page retrouve son cache public.
    const visite = route.headers({
      actionHeaders: new Headers(),
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
      errorHeaders: undefined,
    } as never);
    expect(visite["Cache-Control"]).toBe("public, max-age=300");
  });
});
