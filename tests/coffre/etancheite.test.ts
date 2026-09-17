// tests/coffre/etancheite.test.ts
// Le contrat du coffre : après l'enregistrement d'un secret, NI la phrase, NI
// la clé de secours, NI la valeur en clair n'existent nulle part en base —
// `element.recherche` compris — ni dans ce qu'un lien de partage sert, ni
// dans le HTML de la fiche du propriétaire.
//
// Même mécanique que `tests/demarrage/etancheite.test.ts` : le balayage lit
// la liste des tables dans `information_schema`, et un test de contrôle
// prouve qu'il détecte bien un motif réellement présent (le libellé, qui est
// en clair par conception). Sans ce contrôle, « rien trouvé » ne distinguerait
// pas une base propre d'un balayage cassé.
//
// Les sentinelles ne sont PAS du base64url valide (apostrophes, espaces,
// accents) : un bloc chiffré ne peut pas les contenir par construction, et
// c'est exactement ce que le test constate. Une sentinelle qui serait
// elle-même du base64url serait indétectable sans que ça prouve rien.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { partage } from "../../app/db/schema/index";
import { chiffrer } from "../../app/lib/coffre/chiffrement";
import { creerJeton } from "../../app/lib/partage/partage.server";
import { chargerContenuPartage } from "../../app/lib/partage/contenu.server";
import { compteConnecte, coffrePour, formulaire, requete } from "./aides";

const routeFiche = await import("../../app/routes/_app/elements.$elementId.modifier");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const PHRASE = "ma phrase d'entrée, côté jardin";
const VALEUR = "code 4821# puis l'étoile";
const LIBELLE = "Code du portail (sentinelle-libellé)";

/** Cherche un motif dans TOUTE la base : chaque colonne de chaque table, castée en texte. */
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

/** Le parcours complet : un coffre, puis un secret posé par l'action de la fiche, comme le navigateur le ferait. */
async function poserUnSecret() {
  const jeu = await compteConnecte();
  const { secours, cleDonnees } = await coffrePour(jeu.p.id, PHRASE);
  const bloc = await chiffrer(cleDonnees, VALEUR);

  const reponse = await routeFiche.action({
    request: requete(
      `/proprietes/${jeu.p.id}/elements/${jeu.e.id}/modifier`,
      jeu.cookie,
      formulaire({ _action: "secret-creer", libelle: LIBELLE, valeur: bloc }),
    ),
    params: { proprieteId: String(jeu.p.id), elementId: String(jeu.e.id) },
    context: {},
  } as never);
  expect(reponse).toEqual({ ok: true });
  return { ...jeu, secours, bloc };
}

describe("le balayage lui-même", () => {
  it("trouve le libellé, qui est en clair par conception, dans secret.libelle", async () => {
    await poserUnSecret();
    expect(await chercherPartout("sentinelle-libellé")).toEqual(["secret.libelle"]);
  });

  it("voit les deux tables du coffre", async () => {
    const tables = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('coffre', 'secret')
    `);
    expect(tables.rows.map((t) => t.table_name).sort()).toEqual(["coffre", "secret"]);
  });
});

describe("rien du coffre ne s'écrit en clair", () => {
  it("ni la phrase, ni la clé de secours, ni la valeur, dans aucune colonne d'aucune table", async () => {
    const { secours, p } = await poserUnSecret();

    // Le secret est bien là : l'absence de trace n'est pas obtenue en n'ayant rien fait.
    const n = await db.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM secret s JOIN element e ON e.id = s.element_id WHERE e.propriete_id = ${p.id}
    `);
    expect(Number(n.rows[0].n)).toBe(1);

    // Chaque sentinelle, sous plusieurs formes : entière, par morceau, et
    // pour la clé de secours telle qu'imprimée et sans ses tirets.
    for (const motif of [
      PHRASE, "phrase d'entrée", "côté jardin",
      VALEUR, "4821#", "puis l'étoile",
      secours, secours.replaceAll("-", ""), secours.slice(0, 9),
    ]) {
      expect(await chercherPartout(motif), `« ${motif} » retrouvé en base`).toEqual([]);
    }
  });

  it("n'entre pas dans element.recherche, ni en clair ni sous forme de bloc", async () => {
    const { e, bloc } = await poserUnSecret();
    const [ligne] = (await db.execute<{ recherche: string }>(sql`
      SELECT recherche::text AS recherche FROM element WHERE id = ${e.id}
    `)).rows;
    expect(ligne.recherche).toContain("portail");
    expect(ligne.recherche).not.toContain("4821");
    // Le bloc est du base64url, donc découpé en lexèmes par le trigger s'il
    // entrait dans `details` : il n'y est pas, et c'est la raison d'une table.
    expect(ligne.recherche).not.toContain(bloc.slice(0, 12).toLowerCase());
    expect(ligne.recherche).not.toContain("sentinelle");
  });
});

describe("un lien de partage ne voit rien du coffre", () => {
  it("à plafond 3, portée entière, la sortie de chargerContenuPartage ne porte ni libellé, ni bloc, ni le mot coffre", async () => {
    const { p, bloc } = await poserUnSecret();
    const [lien] = await db.insert(partage).values({
      proprieteId: p.id, nom: "Tout", jeton: creerJeton(), niveauMax: 3,
    }).returning();

    const contenu = await chargerContenuPartage(lien, p.nom, new URL(`http://test.local/p/${lien.jeton}`));
    const serialise = JSON.stringify(contenu);
    // Le lien voit bien la maison : ce n'est pas un contenu vide qui passe.
    expect(serialise).toContain("Portail");
    for (const motif of [LIBELLE, "sentinelle", bloc, bloc.slice(0, 16), VALEUR, "4821"]) {
      expect(serialise, `« ${motif} » servi à un partage`).not.toContain(motif);
    }
    expect(serialise.toLowerCase()).not.toContain("coffre");
    expect(serialise.toLowerCase()).not.toContain("secret");
  });
});

describe("la fiche du propriétaire", () => {
  it("sert le bloc et jamais le clair, et aucun champ sensible n'a de name", async () => {
    const { p, e, cookie, bloc } = await poserUnSecret();

    const donnees = await routeFiche.loader({
      request: requete(`/proprietes/${p.id}/elements/${e.id}/modifier`, cookie),
      params: { proprieteId: String(p.id), elementId: String(e.id) },
      context: {},
    } as never);

    // Ce que le loader rend EST ce que le navigateur reçoit.
    const charge = JSON.stringify(donnees);
    expect(charge).toContain(bloc);
    expect(charge).toContain(LIBELLE);
    for (const motif of [VALEUR, "4821", PHRASE]) expect(charge, `« ${motif} » descendu au navigateur`).not.toContain(motif);

    // Le rendu serveur de l'écran, avec ces données.
    const Fiche = createRoutesStub([
      { path: "/proprietes/:proprieteId/elements/:elementId/modifier", Component: routeFiche.default, loader: () => donnees },
    ]);
    const html = renderToStaticMarkup(
      createElement(Fiche, {
        initialEntries: [`/proprietes/${p.id}/elements/${e.id}/modifier`],
        hydrationData: { loaderData: { "0": donnees } },
      }),
    );

    expect(html).toContain("Coffre");
    expect(html).toContain(LIBELLE);
    expect(html).not.toContain(VALEUR);
    expect(html).not.toContain("4821");
    // Le piège concret : un champ nommé dans un formulaire natif partirait au
    // serveur le jour où le JavaScript échoue avant l'hydratation.
    for (const nom of ["phrase", "valeur", "secours", "cleDonnees"]) {
      expect(html, `un champ name="${nom}" dans le HTML servi`).not.toMatch(new RegExp(`name="${nom}"`));
    }
    // Et les champs sensibles existent bien, sans name : le test ne passe pas
    // parce que la section serait absente.
    expect(html).toMatch(/<input type="password"(?![^>]*\sname=)[^>]*>/);
  });

  it("sans coffre, la section renvoie vers sa création et ne rend aucun champ", async () => {
    const { p, e, cookie } = await compteConnecte();
    const donnees = await routeFiche.loader({
      request: requete(`/proprietes/${p.id}/elements/${e.id}/modifier`, cookie),
      params: { proprieteId: String(p.id), elementId: String(e.id) },
      context: {},
    } as never);
    expect(donnees.coffre).toBeNull();
    expect(donnees.secrets).toEqual([]);

    const Fiche = createRoutesStub([
      { path: "/proprietes/:proprieteId/elements/:elementId/modifier", Component: routeFiche.default, loader: () => donnees },
    ]);
    const html = renderToStaticMarkup(
      createElement(Fiche, {
        initialEntries: [`/proprietes/${p.id}/elements/${e.id}/modifier`],
        hydrationData: { loaderData: { "0": donnees } },
      }),
    );
    expect(html).toContain(`/proprietes/${p.id}/coffre`);
    expect(html).not.toContain('type="password"');
  });
});
