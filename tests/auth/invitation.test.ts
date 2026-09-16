// tests/auth/invitation.test.ts
// L'invitation (issue #62) : la seule chose qui rouvre la porte de
// l'inscription une fois le premier compte créé. Ce que ces tests tiennent,
// et qu'aucun typecheck ne voit :
//
//  - les quatre façons d'être inutilisable (absente, inconnue, expirée,
//    révoquée) et la cinquième (déjà consommée) se répondent TOUTES comme une
//    porte fermée ;
//  - la consommation et la création du compte sont atomiques, donc deux
//    inscriptions simultanées sur le même jeton ne font pas deux comptes ;
//  - une adresse déjà prise ne BRÛLE PAS l'invitation — l'ordre des deux
//    vérifications est la seule chose qui l'assure.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { invitation, session, utilisateur } from "../../app/db/schema/index";
import { MESSAGE_INSCRIPTION_FERMEE } from "../../app/lib/auth/inscription";
import { inscrire } from "../../app/lib/auth/inscription.server";
import { creerInvitation, revoquerInvitation } from "../../app/lib/auth/invitations.server";
import * as routeInscription from "../../app/routes/_public/register";
import * as routeInvitations from "../../app/routes/_app/invitations._index";

const { sessionCookie } = await import("../../app/lib/auth/cookie.server");

const DANS_UNE_SEMAINE = () => new Date(Date.now() + 7 * 86_400_000);
const HIER = () => new Date(Date.now() - 86_400_000);

beforeEach(async () => {
  // `DELETE` et non `TRUNCATE` : celui-ci viderait aussi le catalogue que le
  // setup charge (voir CLAUDE.md). Les invitations partent en cascade avec
  // leur auteur.
  await db.execute(sql`DELETE FROM utilisateur`);
});

/** Le propriétaire, déjà installé : la porte est donc fermée. */
async function proprietaire() {
  const [u] = await db.insert(utilisateur).values({ email: "moi@x.local", motDePasseHash: "x" }).returning();
  return u;
}

async function cookieDe(utilisateurId: number) {
  const jeton = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: jeton, utilisateurId, expireLe: new Date(Date.now() + 3600_000) });
  return (await sessionCookie.serialize(jeton)).split(";")[0];
}

function envoi(email: string, jeton: string, motDePasse = "motdepasse-long") {
  const corps = new URLSearchParams({ email, motDePasse, invitation: jeton });
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

const visite = (jeton: string) =>
  ({
    request: new Request(`http://test/inscription?invitation=${encodeURIComponent(jeton)}`),
    params: {},
    context: {},
  }) as unknown as LoaderFunctionArgs;

const emails = async () =>
  (await db.select({ email: utilisateur.email }).from(utilisateur)).map((u) => u.email).sort();

const relire = async (id: number) => (await db.select().from(invitation).where(eq(invitation.id, id)))[0];

describe("une invitation ouvre la porte", () => {
  it("laisse créer le compte, et marque l'invitation avec le compte qui en est sorti", async () => {
    const moi = await proprietaire();
    const inv = await creerInvitation(moi.id, "mon frère", DANS_UNE_SEMAINE());

    expect(await routeInscription.loader(visite(inv.jeton))).toEqual({ ouverte: true, jeton: inv.jeton });

    const r = await routeInscription.action(envoi("frere@x.local", inv.jeton));
    expect((r as Response).status).toBe(302);
    expect((r as Response).headers.get("Set-Cookie")).toContain("gi_session=");
    expect(await emails()).toEqual(["frere@x.local", "moi@x.local"]);

    const apres = await relire(inv.id);
    const [frere] = await db.select().from(utilisateur).where(eq(utilisateur.email, "frere@x.local"));
    expect(apres.utiliseeLe).not.toBeNull();
    expect(apres.utiliseeParId).toBe(frere.id);
    // Consommée, pas annulée : les deux états ne se confondent pas.
    expect(apres.revoqueLe).toBeNull();
  });

  it("n'est plus utilisable une seconde fois", async () => {
    const moi = await proprietaire();
    const inv = await creerInvitation(moi.id, null, DANS_UNE_SEMAINE());
    await routeInscription.action(envoi("frere@x.local", inv.jeton));

    expect(await routeInscription.action(envoi("cousin@x.local", inv.jeton))).toEqual({
      erreur: MESSAGE_INSCRIPTION_FERMEE,
    });
    expect(await emails()).toEqual(["frere@x.local", "moi@x.local"]);
  });
});

describe("les façons d'être inutilisable se répondent toutes pareil", () => {
  it("jeton absent, inconnu, expiré ou révoqué : le même message, et aucun compte", async () => {
    const moi = await proprietaire();
    const expiree = await creerInvitation(moi.id, null, HIER());
    const revoquee = await creerInvitation(moi.id, null, DANS_UNE_SEMAINE());
    await revoquerInvitation(revoquee.id);

    for (const jeton of ["", "jeton-qui-n-existe-pas", expiree.jeton, revoquee.jeton]) {
      expect(await routeInscription.loader(visite(jeton))).toEqual({ ouverte: false, jeton });
      expect(await routeInscription.action(envoi("inconnu@x.local", jeton))).toEqual({
        erreur: MESSAGE_INSCRIPTION_FERMEE,
      });
    }
    expect(await emails()).toEqual(["moi@x.local"]);
  });

  it("un jeton démesuré est refusé sans aller le comparer en base", async () => {
    await proprietaire();
    const enorme = "a".repeat(5_000);
    expect(await routeInscription.loader(visite(enorme))).toEqual({ ouverte: false, jeton: enorme });
  });
});

describe("la consommation est atomique", () => {
  it("ne laisse passer qu'une seule de deux inscriptions simultanées sur le même jeton", async () => {
    const moi = await proprietaire();
    const inv = await creerInvitation(moi.id, null, DANS_UNE_SEMAINE());

    const [a, b] = await Promise.all([inscrire("a@x.local", "x", inv.jeton), inscrire("b@x.local", "x", inv.jeton)]);
    expect([a.statut, b.statut].sort()).toEqual(["cree", "fermee"]);
    // Le propriétaire, et un seul invité.
    expect(await emails()).toHaveLength(2);
  });

  it("ne brûle pas l'invitation quand l'adresse est déjà prise", async () => {
    // L'ordre des deux vérifications est tout ce qui l'assure : consommer
    // avant de regarder l'adresse ferait perdre son lien à qui se trompe.
    const moi = await proprietaire();
    const inv = await creerInvitation(moi.id, null, DANS_UNE_SEMAINE());

    expect(await routeInscription.action(envoi("moi@x.local", inv.jeton))).toEqual({
      erreur: "Un compte existe déjà avec cet email.",
    });
    expect((await relire(inv.id)).utiliseeLe).toBeNull();

    const r = await routeInscription.action(envoi("frere@x.local", inv.jeton));
    expect((r as Response).status).toBe(302);
  });

  it("refuse de révoquer une invitation déjà consommée", async () => {
    // Révoquer ne fermerait rien — le compte existe — et ferait mentir la ligne.
    const moi = await proprietaire();
    const inv = await creerInvitation(moi.id, null, DANS_UNE_SEMAINE());
    await routeInscription.action(envoi("frere@x.local", inv.jeton));

    await revoquerInvitation(inv.id);
    expect((await relire(inv.id)).revoqueLe).toBeNull();
  });
});

describe("l'écran des invitations", () => {
  const visiteEcran = (cookie: string) =>
    ({
      request: new Request("http://test/proprietes/invitations", { headers: { Cookie: cookie } }),
      params: {},
      context: {},
    }) as unknown as LoaderFunctionArgs;

  it("montre le lien d'une invitation active, et jamais celui d'une révoquée", async () => {
    const moi = await proprietaire();
    const active = await creerInvitation(moi.id, "mon frère", DANS_UNE_SEMAINE());
    const revoquee = await creerInvitation(moi.id, "erreur", DANS_UNE_SEMAINE());
    await revoquerInvitation(revoquee.id);

    const donnees = await routeInvitations.loader(visiteEcran(await cookieDe(moi.id)));
    const Ecran = createRoutesStub([
      { path: "/proprietes/invitations", Component: routeInvitations.default, loader: () => donnees },
    ]);
    const html = renderToStaticMarkup(
      createElement(Ecran, {
        initialEntries: ["/proprietes/invitations"],
        hydrationData: { loaderData: { "0": donnees } },
      }),
    );

    expect(html).toContain(active.jeton);
    expect(html).not.toContain(revoquee.jeton);
    expect(html).toContain("mon frère");
    expect(html).toContain("révoquée");
  });

  it("exige une date d'expiration future", async () => {
    const moi = await proprietaire();
    const cookie = await cookieDe(moi.id);
    const poster = (expireLe: string) =>
      routeInvitations.action({
        request: new Request("http://test/proprietes/invitations", {
          method: "POST",
          body: new URLSearchParams({ note: "x", expireLe }),
          headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
        }),
        params: {},
        context: {},
      } as unknown as ActionFunctionArgs);

    expect(await poster("")).toMatchObject({ erreur: expect.stringContaining("obligatoire") });
    expect(await poster("2020-01-01")).toMatchObject({ erreur: expect.stringContaining("futur") });
    expect(await db.select().from(invitation)).toHaveLength(0);
  });
});
