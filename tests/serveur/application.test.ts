// tests/serveur/application.test.ts
// Ce que le serveur Express ajoute autour de React Router, éprouvé sur de
// vraies connexions HTTP avec un gestionnaire factice : d'où vient l'adresse
// du client selon `trust proxy`, quels en-têtes partent sur quel arbre, qui
// est freiné et qui ne l'est jamais, et ce qu'un envoi trop gros reçoit
// avant d'être lu.
import { describe, it, expect, afterEach } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { RequestHandler } from "express";
import { creerApplication, LIMITES, TAILLE_MAX_CORPS } from "../../server/application.js";

type Vu = { ip: string; secure: boolean; protocole: string; nonce: string | null; chemin: string };

const serveurs: Server[] = [];
afterEach(async () => {
  await Promise.all(serveurs.splice(0).map((s) => new Promise((r) => s.close(r))));
});

function horloge() {
  let t = 1_000_000;
  return { maintenant: () => t, avancer: (ms: number) => (t += ms) };
}

async function demarrer(options: Partial<Parameters<typeof creerApplication>[0]> = {}) {
  const appels: Vu[] = [];
  const gestionnaire: RequestHandler = (req, res) => {
    const vu: Vu = {
      ip: req.ip ?? "",
      secure: req.secure,
      protocole: req.protocol,
      nonce: res.locals.nonce ?? null,
      chemin: req.path,
    };
    appels.push(vu);
    res.json(vu);
  };
  const app = creerApplication({ gestionnaire, ...options });
  const serveur = app.listen(0, "127.0.0.1");
  serveurs.push(serveur);
  await once(serveur, "listening");
  const { port } = serveur.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const appeler = (chemin: string, init?: RequestInit) => fetch(url + chemin, init);
  return { appeler, appels };
}

describe("trust proxy", () => {
  it("sans proxy de confiance, ignore X-Forwarded-* : l'adresse est celle du socket, rien n'est sûr", async () => {
    const { appeler } = await demarrer({ proxysDeConfiance: 0 });
    const r = await appeler("/", {
      headers: { "X-Forwarded-For": "203.0.113.9", "X-Forwarded-Proto": "https" },
    });
    const vu = (await r.json()) as Vu;
    expect(vu.ip).toMatch(/127\.0\.0\.1$/);
    expect(vu.secure).toBe(false);
    expect(vu.protocole).toBe("http");
    expect(r.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("avec un saut, lit l'adresse écrite par le dernier proxy — jamais celle que le client a mise devant", async () => {
    const { appeler } = await demarrer({ proxysDeConfiance: 1 });
    const r = await appeler("/", {
      // Le client a écrit 203.0.113.9 ; Caddy a ajouté ce qu'il voit, 198.51.100.7.
      headers: { "X-Forwarded-For": "203.0.113.9, 198.51.100.7", "X-Forwarded-Proto": "https" },
    });
    const vu = (await r.json()) as Vu;
    expect(vu.ip).toBe("198.51.100.7");
    expect(vu.secure).toBe(true);
    expect(vu.protocole).toBe("https");
    expect(r.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("avec un saut mais sans en-tête, retombe sur le socket, en HTTP", async () => {
    const { appeler } = await demarrer({ proxysDeConfiance: 1 });
    const vu = (await (await appeler("/")).json()) as Vu;
    expect(vu.ip).toMatch(/127\.0\.0\.1$/);
    expect(vu.secure).toBe(false);
  });
});

describe("en-têtes de sécurité", () => {
  it("couvrent l'arbre authentifié, avec un nonce par réponse que le gestionnaire reçoit", async () => {
    const { appeler } = await demarrer();
    const r1 = await appeler("/proprietes/1/recherche");
    const r2 = await appeler("/proprietes/1/recherche");
    const v1 = (await r1.json()) as Vu;
    const v2 = (await r2.json()) as Vu;

    expect(r1.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r1.headers.get("X-Frame-Options")).toBe("DENY");
    expect(r1.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(r1.headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(r1.headers.get("X-Powered-By")).toBeNull();
    expect(r1.headers.get("X-Robots-Tag")).toBeNull();

    const csp = r1.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(v1.nonce).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
    expect(csp).toContain(`script-src 'self' 'nonce-${v1.nonce}'`);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    // Un nonce sert une fois.
    expect(v2.nonce).not.toBe(v1.nonce);
  });

  it("sur /P/ aussi : le routeur ne distingue pas la casse, ce garde-fou non plus", async () => {
    // Le test de chemin était sensible à la casse quand le routeur de React
    // Router ne l'est pas (`caseSensitive: false` par défaut) : `/P/<jeton>`
    // servait la page de partage avec la politique de l'arbre AUTHENTIFIÉ —
    // `default-src 'self'` au lieu de `'none'` — et un 404 de jeton inconnu en
    // casse haute partait sans `X-Robots-Tag` ni `Cache-Control`, l'URL
    // portant pourtant le jeton.
    const { appeler } = await demarrer();
    for (const chemin of ["/P/jeton-quelconque", "/P/JETON/HISTORIQUE", "/P"]) {
      const r = await appeler(chemin);
      const csp = r.headers.get("Content-Security-Policy") ?? "";
      expect(csp, chemin).toContain("default-src 'none'");
      expect(csp, chemin).not.toContain("script-src");
      expect(r.headers.get("X-Robots-Tag"), chemin).toBe("noindex, nofollow");
      expect(r.headers.get("Cache-Control"), chemin).toBe("private, no-store");
      expect(r.headers.get("Referrer-Policy"), chemin).toBe("no-referrer");
    }
  });

  it("sur /p/, interdisent tout script, et refusent cache, référent et indexation même hors des routes", async () => {
    const { appeler } = await demarrer();
    for (const chemin of ["/p/jeton-quelconque", "/p/jeton/fichiers/12?taille=vignette", "/p"]) {
      const r = await appeler(chemin);
      const vu = (await r.json()) as Vu;
      const csp = r.headers.get("Content-Security-Policy") ?? "";
      expect(csp, chemin).toContain("default-src 'none'");
      expect(csp, chemin).not.toContain("script-src");
      expect(csp, chemin).not.toContain("nonce");
      expect(csp, chemin).toContain("frame-ancestors 'none'");
      expect(r.headers.get("X-Robots-Tag"), chemin).toBe("noindex, nofollow");
      expect(r.headers.get("Cache-Control"), chemin).toBe("private, no-store");
      expect(r.headers.get("Referrer-Policy"), chemin).toBe("no-referrer");
      expect(r.headers.get("X-Content-Type-Options"), chemin).toBe("nosniff");
      // Pas de nonce généré : il n'y a rien à autoriser.
      expect(vu.nonce, chemin).toBeNull();
    }
  });

  it("laissent la route remplacer le défaut du serveur, sans empiler, et laissent `append` aux cookies", async () => {
    const gestionnaire: RequestHandler = (_req, res) => {
      // Ce que fait l'adaptateur de React Router pour chaque en-tête de la
      // réponse d'une route : `append`, jamais `set`.
      res.append("Cache-Control", "private, max-age=300");
      res.append("X-Robots-Tag", "noindex, nofollow");
      res.append("Set-Cookie", "a=1; Path=/");
      res.append("Set-Cookie", "b=2; Path=/");
      res.end("ok");
    };
    const app = creerApplication({ gestionnaire });
    const serveur = app.listen(0, "127.0.0.1");
    serveurs.push(serveur);
    await once(serveur, "listening");
    const { port } = serveur.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}/p/jeton/fichiers/1`);
    expect(r.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(r.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(r.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("n'admettent le WebSocket du rechargement à chaud qu'en développement", async () => {
    const prod = await demarrer();
    expect((await prod.appeler("/")).headers.get("Content-Security-Policy")).toContain("connect-src 'self';");
    const dev = await demarrer({ developpement: true });
    const csp = (await dev.appeler("/")).headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("connect-src 'self' ws:");
    expect(csp).toContain("script-src 'self' 'nonce-");
    // Le développement ne relâche rien d'autre, et rien sur /p/.
    expect(csp).not.toContain("unsafe-eval");
    expect((await dev.appeler("/p/x")).headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("ne confondent pas /p/ avec un chemin qui commence par p", async () => {
    const { appeler } = await demarrer();
    const r = await appeler("/proprietes/3");
    expect(r.headers.get("X-Robots-Tag")).toBeNull();
    expect(r.headers.get("Content-Security-Policy")).toContain("script-src 'self' 'nonce-");
  });
});

describe("limite de débit", () => {
  const limites = {
    partage: { fenetreMs: 60_000, maximum: 3 },
    connexion: { fenetreMs: 60_000, maximum: 2 },
  };

  it("rend 429 sur /p/ après le seuil, par adresse et non par jeton, et rouvre à la fenêtre suivante", async () => {
    const h = horloge();
    const { appeler, appels } = await demarrer({ limites, maintenant: h.maintenant });

    for (let i = 0; i < 3; i++) expect((await appeler(`/p/jeton-${i}`)).status).toBe(200);
    const refus = await appeler("/p/un-autre-jeton/objets/4");
    expect(refus.status).toBe(429);
    expect(refus.headers.get("Retry-After")).toBe("60");
    expect(refus.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(refus.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(await refus.text()).not.toContain("<script");
    // Le gestionnaire n'a rien vu de la quatrième.
    expect(appels).toHaveLength(3);

    h.avancer(60_000);
    expect((await appeler("/p/jeton-0")).status).toBe(200);
  });

  it("ne freine JAMAIS l'usage authentifié, même quand /p/ et /connexion sont épuisés", async () => {
    const { appeler } = await demarrer({ limites });
    for (let i = 0; i < 4; i++) await appeler("/p/x");
    for (let i = 0; i < 3; i++) await appeler("/connexion", { method: "POST" });

    for (let i = 0; i < 25; i++) {
      const chemin = ["/", "/proprietes/1", "/proprietes/1/capture/envoyer", "/proprietes/1/fichiers/9", "/deconnexion"][i % 5];
      const r = await appeler(chemin, { method: i % 5 === 2 ? "POST" : "GET" });
      expect(r.status, chemin).toBe(200);
    }
  });

  it("compte les envois de /connexion et /inscription ensemble, et jamais leur affichage", async () => {
    const { appeler } = await demarrer({ limites });
    expect((await appeler("/connexion", { method: "POST" })).status).toBe(200);
    expect((await appeler("/inscription", { method: "POST" })).status).toBe(200);
    expect((await appeler("/connexion", { method: "POST" })).status).toBe(429);
    expect((await appeler("/inscription", { method: "POST" })).status).toBe(429);
    // Afficher le formulaire ne coûte pas un argon2 : jamais compté.
    expect((await appeler("/connexion")).status).toBe(200);
    expect((await appeler("/inscription")).status).toBe(200);
  });

  it("a des seuils par défaut assez larges pour une page de partage, assez serrés pour argon2", () => {
    // Une page de partage charge une vingtaine de ressources ; dix envois de
    // mot de passe par minute suffisent à quiconque connaît le sien.
    expect(LIMITES.partage.maximum).toBeGreaterThanOrEqual(300);
    expect(LIMITES.connexion.maximum).toBeLessThanOrEqual(10);
    expect(LIMITES.connexion.fenetreMs).toBe(60_000);
  });
});

describe("borne de taille des envois", () => {
  it("rend 413 sur la longueur annoncée, sans que le gestionnaire voie la requête", async () => {
    const { appeler, appels } = await demarrer({ tailleMaxCorps: 100 });
    const gros = await appeler("/proprietes/1/capture/envoyer", { method: "POST", body: "x".repeat(200) });
    expect(gros.status).toBe(413);
    expect(appels).toHaveLength(0);

    const petit = await appeler("/proprietes/1/capture/envoyer", { method: "POST", body: "x".repeat(50) });
    expect(petit.status).toBe(200);
    expect(appels).toHaveLength(1);
  });

  it("laisse passer par défaut l'image de plan la plus grosse qu'une route accepte", () => {
    // 25 Mo pour un plan (`plans.nouveau.tsx`), plus l'enveloppe multipart.
    expect(TAILLE_MAX_CORPS).toBeGreaterThan(25 * 1024 * 1024);
    expect(TAILLE_MAX_CORPS).toBeLessThanOrEqual(32 * 1024 * 1024);
  });
});
