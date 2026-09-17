// tests/coffre/routes.test.ts
// Les gestes du coffre, joués contre les routes du propriétaire avec le même
// module de chiffrement que le navigateur : créer, poser un secret, changer
// la phrase, rouvrir par la clé de secours, vider. Et ce que chaque geste ne
// fait PAS — toucher un secret, sortir de sa propriété, dire qu'une chose
// existe ailleurs (404, jamais 403).
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { coffre as tableCoffre } from "../../app/db/schema/index";
import {
  chiffrer,
  composerCoffre,
  dechiffrer,
  ouvrirCoffre,
  reenvelopperParPhrase,
} from "../../app/lib/coffre/chiffrement";
import { chargerCoffre, ITERATIONS_MIN } from "../../app/lib/coffre/coffre.server";
import { ITERATIONS_TEST, coffrePour, compteConnecte, empreintesDesSecrets, formulaire, requete } from "./aides";

const routeCoffre = await import("../../app/routes/_app/coffre");
const routeFiche = await import("../../app/routes/_app/elements.$elementId.modifier");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

type Jeu = Awaited<ReturnType<typeof compteConnecte>>;

function appelCoffre(jeu: Jeu, corps?: FormData) {
  const args = {
    request: requete(`/proprietes/${jeu.p.id}/coffre`, jeu.cookie, corps),
    params: { proprieteId: String(jeu.p.id) },
    context: {},
  } as never;
  return corps ? routeCoffre.action(args) : routeCoffre.loader(args);
}

function appelFiche(jeu: Jeu, corps: FormData, elementId = jeu.e.id) {
  return routeFiche.action({
    request: requete(`/proprietes/${jeu.p.id}/elements/${elementId}/modifier`, jeu.cookie, corps),
    params: { proprieteId: String(jeu.p.id), elementId: String(elementId) },
    context: {},
  } as never);
}

async function poserSecret(jeu: Jeu, cleDonnees: Uint8Array<ArrayBuffer>, libelle: string, valeur: string) {
  const bloc = await chiffrer(cleDonnees, valeur);
  expect(await appelFiche(jeu, formulaire({ _action: "secret-creer", libelle, valeur: bloc }))).toEqual({ ok: true });
  return bloc;
}

describe("créer le coffre, par la route", () => {
  it("écrit ce que le navigateur envoie et refuse un second coffre", async () => {
    const jeu = await compteConnecte();
    const { coffre } = await composerCoffre("une phrase assez longue", ITERATIONS_MIN);
    const corps = formulaire({ _action: "creer", ...coffre, iterations: String(coffre.iterations) });

    expect(await appelCoffre(jeu, corps)).toEqual({ ok: true, geste: "creer" });
    expect(await chargerCoffre(jeu.p.id)).toEqual(coffre);
    expect(await appelCoffre(jeu, corps)).toMatchObject({ erreur: expect.stringContaining("déjà") });
  });

  it("refuse les formes fausses : itérations trop basses, absentes, sel court, enveloppe tronquée", async () => {
    const jeu = await compteConnecte();
    const { coffre } = await composerCoffre("une phrase assez longue", ITERATIONS_MIN);
    const base = { _action: "creer", ...coffre, iterations: String(coffre.iterations) };

    for (const [nom, variante] of Object.entries({
      "itérations sous le plancher": { ...base, iterations: String(ITERATIONS_TEST) },
      // `Number("")` vaut 0 : refusé, jamais replié.
      "itérations vides": { ...base, iterations: "" },
      "itérations non entières": { ...base, iterations: "600000.5" },
      "sel trop court": { ...base, sel: "AAAA" },
      "enveloppe tronquée": { ...base, cleParPhrase: coffre.cleParPhrase.slice(0, -8) },
      "enveloppe hors alphabet": { ...base, cleParSecours: `${coffre.cleParSecours}+` },
    })) {
      expect(await appelCoffre(jeu, formulaire(variante)), nom).toMatchObject({ erreur: expect.any(String) });
    }
    expect(await chargerCoffre(jeu.p.id)).toBeNull();
  });

  it("ne rend jamais la clé de secours : le loader ne porte que le sel, les itérations et les deux enveloppes", async () => {
    const jeu = await compteConnecte();
    const { secours } = await coffrePour(jeu.p.id, "ma phrase");
    const donnees = await appelCoffre(jeu);
    expect(Object.keys((donnees as { coffre: object }).coffre).sort()).toEqual(["cleParPhrase", "cleParSecours", "iterations", "sel"]);
    expect(JSON.stringify(donnees)).not.toContain(secours.slice(0, 9));
    expect(JSON.stringify(donnees)).not.toContain("ma phrase");
  });
});

describe("les secrets, depuis la fiche", () => {
  it("s'enregistrent, se relisent avec la phrase, et se retirent", async () => {
    const jeu = await compteConnecte();
    const { cleDonnees } = await coffrePour(jeu.p.id, "ma phrase");
    await poserSecret(jeu, cleDonnees, "Code du portail", "4821");

    const coffre = (await chargerCoffre(jeu.p.id))!;
    const secrets = await db.execute<{ id: number; libelle: string; valeur: string }>(sql`SELECT id, libelle, valeur FROM secret`);
    expect(secrets.rows).toHaveLength(1);
    expect(await dechiffrer(await ouvrirCoffre(coffre, "ma phrase"), secrets.rows[0].valeur)).toBe("4821");

    expect(await appelFiche(jeu, formulaire({ _action: "secret-supprimer", secretId: String(secrets.rows[0].id) }))).toEqual({ ok: true });
    expect((await db.execute(sql`SELECT id FROM secret`)).rows).toHaveLength(0);
  });

  it("refuse un secret sans coffre, un libellé vide, un bloc qui n'en est pas un", async () => {
    const jeu = await compteConnecte();
    const bloc = await chiffrer((await composerCoffre("x", ITERATIONS_TEST)).cleDonnees, "4821");
    expect(await appelFiche(jeu, formulaire({ _action: "secret-creer", libelle: "Code", valeur: bloc }))).toMatchObject({
      erreur: expect.stringContaining("coffre"),
    });

    await coffrePour(jeu.p.id, "ma phrase");
    expect(await appelFiche(jeu, formulaire({ _action: "secret-creer", libelle: "  ", valeur: bloc }))).toMatchObject({ erreur: expect.any(String) });
    expect(await appelFiche(jeu, formulaire({ _action: "secret-creer", libelle: "Code", valeur: "4821 en clair" }))).toMatchObject({ erreur: expect.any(String) });
    expect(await appelFiche(jeu, formulaire({ _action: "secret-creer", libelle: "Code", valeur: bloc.slice(0, 20) }))).toMatchObject({ erreur: expect.any(String) });
    expect((await db.execute(sql`SELECT id FROM secret`)).rows).toHaveLength(0);
  });

  it("répond 404 RENDU, pas lancé, sur le secret d'une autre propriété — et ne le retire pas", async () => {
    const moi = await compteConnecte();
    const autre = await compteConnecte();
    const { cleDonnees } = await coffrePour(autre.p.id, "sa phrase");
    await poserSecret(autre, cleDonnees, "Son code", "9999");
    const [{ id }] = (await db.execute<{ id: number }>(sql`SELECT id FROM secret`)).rows;

    await coffrePour(moi.p.id, "ma phrase");
    // Un fetcher ne rattrape pas une Response lancée : elle remplacerait la page.
    const reponse = (await appelFiche(moi, formulaire({ _action: "secret-supprimer", secretId: String(id) }))) as Response;
    expect(reponse).toBeInstanceOf(Response);
    expect(reponse.status).toBe(404);
    expect((await db.execute(sql`SELECT id FROM secret`)).rows).toHaveLength(1);
  });

  it("répond 404 sur l'objet d'une autre propriété, sans y poser de secret", async () => {
    const moi = await compteConnecte();
    const autre = await compteConnecte();
    const { cleDonnees } = await coffrePour(moi.p.id, "ma phrase");
    const bloc = await chiffrer(cleDonnees, "4821");
    // L'objet est vérifié avant tout par la fiche elle-même, et cette
    // vérification-là lance : c'est la page, pas un geste dans la page.
    await expect(
      appelFiche(moi, formulaire({ _action: "secret-creer", libelle: "Code", valeur: bloc }), autre.e.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await db.execute(sql`SELECT id FROM secret`)).rows).toHaveLength(0);
  });
});

describe("changer la phrase", () => {
  it("laisse chaque secret.valeur identique à l'octet près (md5 avant/après), et l'enveloppe par secours aussi", async () => {
    const jeu = await compteConnecte();
    const { cleDonnees, secours } = await coffrePour(jeu.p.id, "ancienne phrase");
    await poserSecret(jeu, cleDonnees, "Portail", "4821");
    await poserSecret(jeu, cleDonnees, "Alarme", "1234*");
    const avant = await empreintesDesSecrets(jeu.p.id);
    const coffreAvant = (await chargerCoffre(jeu.p.id))!;
    expect(avant).toHaveLength(2);

    const cleParPhrase = await reenvelopperParPhrase(coffreAvant, "ancienne phrase", "nouvelle phrase");
    expect(await appelCoffre(jeu, formulaire({ _action: "changer-phrase", cleParPhrase }))).toEqual({ ok: true, geste: "changer-phrase" });

    expect(await empreintesDesSecrets(jeu.p.id)).toEqual(avant);
    const coffreApres = (await chargerCoffre(jeu.p.id))!;
    expect(coffreApres.cleParSecours).toBe(coffreAvant.cleParSecours);
    expect(coffreApres.sel).toBe(coffreAvant.sel);
    expect(coffreApres.cleParPhrase).not.toBe(coffreAvant.cleParPhrase);

    // La nouvelle ouvre, l'ancienne n'ouvre plus, la clé de secours ouvre toujours.
    const secrets = await db.execute<{ valeur: string }>(sql`SELECT valeur FROM secret ORDER BY id`);
    expect(await dechiffrer(await ouvrirCoffre(coffreApres, "nouvelle phrase"), secrets.rows[0].valeur)).toBe("4821");
    await expect(ouvrirCoffre(coffreApres, "ancienne phrase")).rejects.toThrow();
    expect(await dechiffrer(await ouvrirCoffre(coffreApres, secours), secrets.rows[1].valeur)).toBe("1234*");
  });

  it("phrase oubliée : la clé de secours rouvre après une phrase fausse, et une nouvelle phrase se pose depuis là", async () => {
    const jeu = await compteConnecte();
    const { cleDonnees, secours } = await coffrePour(jeu.p.id, "phrase perdue");
    await poserSecret(jeu, cleDonnees, "Portail", "4821");
    const coffre = (await chargerCoffre(jeu.p.id))!;

    await expect(reenvelopperParPhrase(coffre, "je ne sais plus", "toute neuve")).rejects.toThrow();
    const cleParPhrase = await reenvelopperParPhrase(coffre, secours.toLowerCase(), "toute neuve");
    expect(await appelCoffre(jeu, formulaire({ _action: "changer-phrase", cleParPhrase }))).toEqual({ ok: true, geste: "changer-phrase" });

    const apres = (await chargerCoffre(jeu.p.id))!;
    const [{ valeur }] = (await db.execute<{ valeur: string }>(sql`SELECT valeur FROM secret`)).rows;
    expect(await dechiffrer(await ouvrirCoffre(apres, "toute neuve"), valeur)).toBe("4821");
  });

  it("refuse une enveloppe mal formée, et ne touche à rien", async () => {
    const jeu = await compteConnecte();
    await coffrePour(jeu.p.id, "ma phrase");
    const avant = await chargerCoffre(jeu.p.id);
    expect(await appelCoffre(jeu, formulaire({ _action: "changer-phrase", cleParPhrase: "pas-une-enveloppe" }))).toMatchObject({ erreur: expect.any(String) });
    expect(await chargerCoffre(jeu.p.id)).toEqual(avant);
  });
});

describe("vider", () => {
  it("supprime le coffre et tous les secrets de la propriété, et seulement de celle-là", async () => {
    const moi = await compteConnecte();
    const autre = await compteConnecte();
    const mien = await coffrePour(moi.p.id, "ma phrase");
    const sien = await coffrePour(autre.p.id, "sa phrase");
    await poserSecret(moi, mien.cleDonnees, "Portail", "4821");
    await poserSecret(moi, mien.cleDonnees, "Alarme", "1234");
    await poserSecret(autre, sien.cleDonnees, "Son portail", "9999");

    const reponse = (await appelCoffre(moi, formulaire({ _action: "vider", confirme: "oui" }))) as Response;
    expect(reponse.status).toBe(302);

    expect(await chargerCoffre(moi.p.id)).toBeNull();
    expect(await empreintesDesSecrets(moi.p.id)).toEqual([]);
    expect(await chargerCoffre(autre.p.id)).not.toBeNull();
    expect(await empreintesDesSecrets(autre.p.id)).toHaveLength(1);
    expect((await db.select().from(tableCoffre)).map((c) => c.proprieteId)).toEqual([autre.p.id]);
  });

  it("exige la case cochée", async () => {
    const jeu = await compteConnecte();
    await coffrePour(jeu.p.id, "ma phrase");
    expect(await appelCoffre(jeu, formulaire({ _action: "vider" }))).toMatchObject({ erreur: expect.stringContaining("Cochez") });
    expect(await chargerCoffre(jeu.p.id)).not.toBeNull();
  });
});

describe("l'écran du coffre", () => {
  it("répond 404 sur la propriété de quelqu'un d'autre, en lecture comme en écriture", async () => {
    const moi = await compteConnecte();
    const autre = await compteConnecte();
    await coffrePour(autre.p.id, "sa phrase");
    const args = (corps?: FormData) => ({
      request: requete(`/proprietes/${autre.p.id}/coffre`, moi.cookie, corps),
      params: { proprieteId: String(autre.p.id) },
      context: {},
    }) as never;
    await expect(routeCoffre.loader(args())).rejects.toMatchObject({ status: 404 });
    await expect(routeCoffre.action(args(formulaire({ _action: "vider", confirme: "oui" })))).rejects.toMatchObject({ status: 404 });
    expect(await chargerCoffre(autre.p.id)).not.toBeNull();
  });

  it("ne rend aucun champ nommé phrase, valeur ou secours, avec ou sans coffre", async () => {
    for (const avecCoffre of [false, true]) {
      const jeu = await compteConnecte();
      if (avecCoffre) await coffrePour(jeu.p.id, "ma phrase");
      const donnees = await appelCoffre(jeu);
      const Ecran = createRoutesStub([{ path: "/proprietes/:proprieteId/coffre", Component: routeCoffre.default, loader: () => donnees }]);
      const html = renderToStaticMarkup(
        createElement(Ecran, { initialEntries: [`/proprietes/${jeu.p.id}/coffre`], hydrationData: { loaderData: { "0": donnees } } }),
      );
      expect(html).toContain('type="password"');
      for (const nom of ["phrase", "valeur", "secours", "cleDonnees", "nouvelle", "actuelle"]) {
        expect(html, `name="${nom}" (coffre : ${avecCoffre})`).not.toMatch(new RegExp(`name="${nom}"`));
      }
      // Le seul formulaire natif est « vider », et il n'existe qu'avec un coffre.
      expect(html.includes('name="confirme"')).toBe(avecCoffre);
    }
  });
});
