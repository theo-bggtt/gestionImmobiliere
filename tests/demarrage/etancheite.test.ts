// tests/demarrage/etancheite.test.ts
// L'étape 7 fait entrer l'adresse dans l'application. La décision prise est de
// ne la stocker NULLE PART : elle sert à l'appel au registre, puis disparaît
// avec la requête. Un commentaire ne tient pas cette propriété, ces tests si.
//
// Le balayage ci-dessous ne connaît pas la liste des tables : il la lit dans
// `information_schema`. Une table ajoutée demain est donc couverte sans que
// personne ait à penser à ce fichier.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, session, batiment, zone } from "../../app/db/schema/index";
import { composerSquelette } from "../../app/lib/demarrage/squelette";

const { sessionCookie } = await import("../../app/lib/auth/cookie.server");
const routeDemarrer = await import("../../app/routes/_app/demarrer._index");
const routeAdresse = await import("../../app/routes/_app/demarrer.adresse");

/** Une vraie adresse suisse, et l'EGID que le registre lui associe. */
const ADRESSE = "Rue du Rhône 14, 1204 Genève";
const EGID = "2037304";
const PARCELLE = "7013";
const EGRID = "CH296589536314";

const ATTRS = {
  egid: EGID, gklas: 1122, gkat: 1030, gbauj: 1920, gastw: 8, ganzwhg: 21,
  egrid: EGRID, lparz: PARCELLE, gkode: 2500184.8, gkodn: 1117799.44,
  strname_deinr: "Rue du Rhône 14", plz_plz6: "1204/120400", ggdename: "Genève",
};

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});
afterEach(() => vi.unstubAllGlobals());

function simulerRegbl() {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const corps = String(url).includes("SearchServer")
      ? {
          results: [{
            attrs: {
              label: "Rue du Rhône 14 <b>1204 Genève</b>",
              origin: "address",
              links: [{
                title: "ch.bfs.gebaeude_wohnungs_register",
                href: `/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/${EGID}_3`,
              }],
            },
          }],
        }
      : { feature: { attributes: ATTRS } };
    return { ok: true, json: async () => corps } as Response;
  }));
}

async function compteConnecte() {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `e-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: "Chez moi" }).returning();
  const jeton = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: jeton, utilisateurId: u.id, expireLe: new Date(Date.now() + 3600_000) });
  const cookie = (await sessionCookie.serialize(jeton)).split(";")[0];
  return { u, p, cookie };
}

function requete(url: string, cookie: string, corps?: FormData) {
  return new Request(`http://test.local${url}`, {
    method: corps ? "POST" : "GET",
    headers: { cookie },
    body: corps,
  });
}

/**
 * Cherche un motif dans TOUTE la base : chaque colonne de chaque table du
 * schéma public, castée en texte. Rend les emplacements trouvés.
 */
async function chercherPartout(motif: string): Promise<string[]> {
  const colonnes = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  `);

  const trouves: string[] = [];
  for (const { table_name, column_name } of colonnes.rows) {
    const resultat = await db.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n
      FROM ${sql.identifier(table_name)}
      WHERE ${sql.identifier(column_name)}::text ILIKE ${`%${motif}%`}
    `);
    if (Number(resultat.rows[0]?.n ?? 0) > 0) trouves.push(`${table_name}.${column_name}`);
  }
  return trouves;
}

describe("le balayage lui-même", () => {
  // Un test d'absence qui passe peut passer pour de mauvaises raisons. Celui-ci
  // vérifie que le détecteur détecte : sans lui, `chercherPartout` pourrait
  // renvoyer une liste vide à cause d'une requête cassée, et les tests
  // ci-dessous resteraient verts en ne regardant rien.
  it("trouve un motif réellement présent, y compris dans une colonne jsonb", async () => {
    const { p } = await compteConnecte();
    await db.execute(sql`UPDATE propriete SET adresse = ${ADRESSE}, egid = ${EGID} WHERE id = ${p.id}`);

    expect(await chercherPartout(ADRESSE)).toContain("propriete.adresse");
    expect(await chercherPartout(EGID)).toContain("propriete.egid");
    // Et il regarde bien toutes les tables, pas seulement `propriete`.
    const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: `Maison ${EGRID}` }).returning();
    expect(await chercherPartout(EGRID)).toContain("batiment.nom");
    expect(b.id).toBeGreaterThan(0);
  });

  it("balaye un nombre plausible de colonnes, pas zéro", async () => {
    const colonnes = await db.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    `);
    expect(Number(colonnes.rows[0].n)).toBeGreaterThan(50);
  });
});

describe("le parcours complet ne stocke ni adresse ni EGID", () => {
  it("ne laisse aucune trace en base, dans aucune table", async () => {
    simulerRegbl();
    const { p, cookie } = await compteConnecte();

    // 1. Le propriétaire cherche son adresse.
    const trouve = await routeAdresse.loader({
      request: requete(`/proprietes/${p.id}/demarrer/adresse?q=${encodeURIComponent(ADRESSE)}`, cookie),
      params: { proprieteId: String(p.id) },
      context: {},
    } as never);
    expect(trouve.statut).toBe("ok");
    if (trouve.statut !== "ok") return;

    // 2. Il choisit un candidat, corrige, et confirme.
    const squelette = composerSquelette({
      ...trouve.candidats[0].reponses,
      sousSol: true,
      combles: false,
      garage: true,
      exterieur: true,
    });
    const corps = new FormData();
    corps.set("squelette", JSON.stringify(squelette));
    const reponse = await routeDemarrer.action({
      request: requete(`/proprietes/${p.id}/demarrer`, cookie, corps),
      params: { proprieteId: String(p.id) },
      context: {},
    } as never);
    expect((reponse as Response).status).toBe(302);

    // La structure est bien là : le parcours a réellement abouti, ce n'est pas
    // une absence de trace obtenue en n'ayant rien fait.
    expect((await db.select().from(batiment).where(sql`${batiment.proprieteId} = ${p.id}`)).length).toBeGreaterThan(0);
    expect((await db.select().from(zone).where(sql`${zone.proprieteId} = ${p.id}`)).length).toBeGreaterThan(0);

    // 3. Le contrat. Chaque motif est cherché dans chaque colonne de chaque table.
    for (const motif of [ADRESSE, "Rue du Rhône", EGID, EGRID, PARCELLE, "1204", "2500184"]) {
      expect(await chercherPartout(motif), `« ${motif} » retrouvé en base`).toEqual([]);
    }
  });

  it("n'écrit pas dans propriete.adresse ni propriete.egid, qui restent nuls", async () => {
    simulerRegbl();
    const { p, cookie } = await compteConnecte();

    const corps = new FormData();
    corps.set("squelette", JSON.stringify(composerSquelette({
      forme: "maison", niveauxHabitables: 2, sousSol: true, combles: false, garage: false, exterieur: true,
    })));
    await routeDemarrer.action({
      request: requete(`/proprietes/${p.id}/demarrer`, cookie, corps),
      params: { proprieteId: String(p.id) },
      context: {},
    } as never);

    const [apres] = await db.select().from(propriete).where(sql`${propriete.id} = ${p.id}`);
    // Les colonnes existent depuis la migration 0000 et servent de sentinelle
    // aux tests de partage. Le nouveau chemin ne les remplit pas.
    expect(apres.adresse).toBeNull();
    expect(apres.egid).toBeNull();
  });

  it("ne pré-remplit jamais le nom de la propriété avec l'adresse", async () => {
    simulerRegbl();
    const { p, cookie } = await compteConnecte();

    const corps = new FormData();
    corps.set("squelette", JSON.stringify(composerSquelette({
      forme: "maison", niveauxHabitables: 2, sousSol: false, combles: false, garage: false, exterieur: true,
    })));
    await routeDemarrer.action({
      request: requete(`/proprietes/${p.id}/demarrer`, cookie, corps),
      params: { proprieteId: String(p.id) },
      context: {},
    } as never);

    // `propriete.nom` est le <h1> de la page de partage, rendu sans filtrage :
    // l'y écrire publierait l'adresse au jardinier. C'est le piège de
    // `plan.nom` à l'étape 4, en pire, puisque rien ne le filtre en aval.
    const [apres] = await db.select().from(propriete).where(sql`${propriete.id} = ${p.id}`);
    expect(apres.nom).toBe("Chez moi");
  });

  it("ne fait descendre au navigateur ni EGID, ni parcelle, ni coordonnées", async () => {
    simulerRegbl();
    const { p, cookie } = await compteConnecte();

    const resultat = await routeAdresse.loader({
      request: requete(`/proprietes/${p.id}/demarrer/adresse?q=${encodeURIComponent(ADRESSE)}`, cookie),
      params: { proprieteId: String(p.id) },
      context: {},
    } as never);

    // Ce que la route rend EST ce que le navigateur reçoit.
    const charge = JSON.stringify(resultat);
    for (const secret of [EGID, EGRID, PARCELLE, "2500184", "1117799", "120400"]) {
      expect(charge, `« ${secret} » descendu au navigateur`).not.toContain(secret);
    }
  });

  it("ne journalise pas l'adresse cherchée", async () => {
    simulerRegbl();
    const { p, cookie } = await compteConnecte();
    const journal = vi.spyOn(console, "log").mockImplementation(() => {});
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});

    await routeAdresse.loader({
      request: requete(`/proprietes/${p.id}/demarrer/adresse?q=${encodeURIComponent(ADRESSE)}`, cookie),
      params: { proprieteId: String(p.id) },
      context: {},
    } as never);

    const ecrit = [...journal.mock.calls, ...erreurs.mock.calls].flat().join(" ");
    expect(ecrit).not.toContain("Rhône");
    journal.mockRestore();
    erreurs.mockRestore();
  });
});

describe("l'écran de démarrage est scopé comme le reste", () => {
  it("répond 404 sur la propriété de quelqu'un d'autre, sans dire qu'elle existe", async () => {
    const moi = await compteConnecte();
    const autre = await compteConnecte();

    // Règle non négociable #4 : jamais 403, toujours 404.
    for (const appel of [
      () => routeAdresse.loader({
        request: requete(`/proprietes/${autre.p.id}/demarrer/adresse?q=test`, moi.cookie),
        params: { proprieteId: String(autre.p.id) }, context: {},
      } as never),
      () => routeDemarrer.loader({
        request: requete(`/proprietes/${autre.p.id}/demarrer`, moi.cookie),
        params: { proprieteId: String(autre.p.id) }, context: {},
      } as never),
    ]) {
      await expect(appel()).rejects.toMatchObject({ status: 404 });
    }
  });

  it("n'écrit rien dans la propriété d'un autre", async () => {
    const moi = await compteConnecte();
    const autre = await compteConnecte();

    const corps = new FormData();
    corps.set("squelette", JSON.stringify(composerSquelette({
      forme: "maison", niveauxHabitables: 2, sousSol: false, combles: false, garage: false, exterieur: true,
    })));

    await expect(
      routeDemarrer.action({
        request: requete(`/proprietes/${autre.p.id}/demarrer`, moi.cookie, corps),
        params: { proprieteId: String(autre.p.id) }, context: {},
      } as never),
    ).rejects.toMatchObject({ status: 404 });

    expect(await db.select().from(batiment).where(sql`${batiment.proprieteId} = ${autre.p.id}`)).toHaveLength(0);
  });

  it("se dérobe quand la propriété porte déjà une structure", async () => {
    const { p, cookie } = await compteConnecte();
    await db.insert(zone).values({ proprieteId: p.id, niveauId: null, nom: "Jardin", type: "exterieur" });

    const reponse = await routeDemarrer.loader({
      request: requete(`/proprietes/${p.id}/demarrer`, cookie),
      params: { proprieteId: String(p.id) },
      context: {},
    } as never);

    expect((reponse as Response).status).toBe(302);
    expect((reponse as Response).headers.get("location")).toBe(`/proprietes/${p.id}`);
  });
});
