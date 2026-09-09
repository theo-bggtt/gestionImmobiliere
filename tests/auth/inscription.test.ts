// tests/auth/inscription.test.ts
// La porte de l'inscription (issue #26) : ouverte pour le premier compte,
// fermée ensuite, rouverte par une décision explicite — et un refus qui ne
// dit pas si l'adresse existe.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur } from "../../app/db/schema/index";
import { MESSAGE_INSCRIPTION_FERMEE } from "../../app/lib/auth/inscription";
import { inscrire } from "../../app/lib/auth/inscription.server";
import * as routeInscription from "../../app/routes/_public/register";
import * as routeConnexion from "../../app/routes/_public/login";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
  delete process.env.AUTORISER_INSCRIPTION;
});
afterEach(() => {
  delete process.env.AUTORISER_INSCRIPTION;
});

function envoi(email: string, motDePasse = "motdepasse-long") {
  const corps = new URLSearchParams({ email, motDePasse });
  return {
    request: new Request("http://test/inscription", {
      method: "POST",
      body: corps,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }),
    params: {},
    context: {},
  } as unknown as ActionFunctionArgs;
}

async function comptes() {
  return (await db.select({ email: utilisateur.email }).from(utilisateur)).map((u) => u.email).sort();
}

describe("inscription", () => {
  it("accepte le premier compte et ouvre sa session", async () => {
    const r = await routeInscription.action(envoi("moi@x.local"));
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(302);
    expect((r as Response).headers.get("Set-Cookie")).toContain("gi_session=");
    expect(await comptes()).toEqual(["moi@x.local"]);
  });

  it("refuse le second, avec le même message qu'une adresse déjà prise", async () => {
    await routeInscription.action(envoi("moi@x.local"));

    const nouvelle = await routeInscription.action(envoi("autre@x.local"));
    const prise = await routeInscription.action(envoi("moi@x.local"));
    expect(nouvelle).toEqual({ erreur: MESSAGE_INSCRIPTION_FERMEE });
    expect(prise).toEqual(nouvelle);
    expect(await comptes()).toEqual(["moi@x.local"]);

    expect(await routeInscription.loader()).toEqual({ ouverte: false });
    expect(await routeConnexion.loader()).toEqual({ inscriptionOuverte: false });
  });

  it("ne laisse passer qu'une seule de deux premières inscriptions simultanées", async () => {
    const [a, b] = await Promise.all([inscrire("a@x.local", "x"), inscrire("b@x.local", "x")]);
    expect([a.statut, b.statut].sort()).toEqual(["cree", "fermee"]);
    expect(await comptes()).toHaveLength(1);
  });

  it("rouvre sur AUTORISER_INSCRIPTION=1, et là seulement dit qu'une adresse est prise", async () => {
    await routeInscription.action(envoi("moi@x.local"));
    process.env.AUTORISER_INSCRIPTION = "1";

    expect(await routeInscription.loader()).toEqual({ ouverte: true });
    expect(await routeInscription.action(envoi("moi@x.local"))).toEqual({ erreur: "Un compte existe déjà avec cet email." });
    const r = await routeInscription.action(envoi("second@x.local"));
    expect((r as Response).status).toBe(302);
    expect(await comptes()).toEqual(["moi@x.local", "second@x.local"]);
  });

  it("valide toujours le mot de passe, porte ouverte", async () => {
    expect(await routeInscription.action(envoi("moi@x.local", "court"))).toMatchObject({ erreur: expect.stringContaining("8 caractères") });
    expect(await comptes()).toEqual([]);
  });

  it("rend une page sans formulaire quand c'est fermé, et la connexion sans lien vers l'inscription", () => {
    const Inscription = createRoutesStub([
      { path: "/inscription", Component: routeInscription.default, loader: () => ({ ouverte: false }) },
    ]);
    const html = renderToStaticMarkup(
      createElement(Inscription, { initialEntries: ["/inscription"], hydrationData: { loaderData: { "0": { ouverte: false } } } }),
    );
    expect(html).toContain(MESSAGE_INSCRIPTION_FERMEE);
    expect(html).not.toContain("<form");

    const Connexion = createRoutesStub([
      { path: "/connexion", Component: routeConnexion.default, loader: () => ({ inscriptionOuverte: false }) },
    ]);
    const page = renderToStaticMarkup(
      createElement(Connexion, { initialEntries: ["/connexion"], hydrationData: { loaderData: { "0": { inscriptionOuverte: false } } } }),
    );
    expect(page).toContain("<form");
    expect(page).not.toContain("/inscription");
  });
});
