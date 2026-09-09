// tests/erreurs/page-erreur.test.ts
// La page d'erreur racine : en français, sans script, et muette sur ce
// qu'elle ne doit pas dire.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageErreur, decrireErreur } from "../../app/components/PageErreur";

// La forme d'un `ErrorResponse` de React Router, telle que `useRouteError`
// la rend pour une `Response` levée par un loader.
const reponse = (status: number) => ({ status, statusText: "", internal: false, data: "Introuvable" });

describe("decrireErreur", () => {
  it("ne dit d'un 404 que « introuvable », sans distinguer inconnu de refusé", () => {
    expect(decrireErreur(reponse(404))).toMatchObject({ status: 404, titre: "Introuvable" });
    expect(decrireErreur(reponse(404)).message).not.toMatch(/accès|refus|droit/i);
  });

  it("traite une erreur quelconque comme un 500, sans en rendre le contenu", () => {
    const e = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    const d = decrireErreur(e);
    expect(d.status).toBe(500);
    expect(JSON.stringify(d)).not.toContain("ECONNREFUSED");
    expect(decrireErreur(undefined).status).toBe(500);
    expect(decrireErreur(reponse(503)).status).toBe(500);
  });

  it("nomme le 429 du limiteur et un autre 4xx", () => {
    expect(decrireErreur(reponse(429)).titre).toBe("Trop de demandes");
    expect(decrireErreur(reponse(403)).status).toBe(403);
  });
});

describe("PageErreur", () => {
  it("rend un document français complet, sans aucun script ni style inline", () => {
    const html = renderToStaticMarkup(createElement(PageErreur, { erreur: decrireErreur(reponse(404)) }));
    expect(html).toMatch(/^<html lang="fr">/);
    expect(html).toContain("<h1>Introuvable</h1>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("style=");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('href="/"');
  });
});
