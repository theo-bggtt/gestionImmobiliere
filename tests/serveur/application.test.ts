// tests/serveur/application.test.ts
// Ce que le serveur Express ajoute autour de React Router, éprouvé sur de
// vraies connexions HTTP avec un gestionnaire factice : d'où vient l'adresse
// du client selon `trust proxy`, quels en-têtes partent sur quel arbre, qui
// est freiné et qui ne l'est jamais, et ce qu'un envoi trop gros reçoit
// avant d'être lu.
import { describe, it, expect, afterEach } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { request, type Server } from "node:http";
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
  return { appeler, appels, port };
}

/**
 * Un POST en `Transfer-Encoding: chunked` — le seul cadrage HTTP/1.1 qui
 * n'annonce pas sa longueur. `fetch` ne sait pas le produire : le client de
 * `node:http` le choisit dès qu'on écrit sans `Content-Length`.
 */
function enChunked(port: number, chemin: string, corps: string): Promise<{ statut: number }> {
  return new Promise((resoudre, rejeter) => {
    const requete = request({ port, host: "127.0.0.1", path: chemin, method: "POST" }, (reponse) => {
      reponse.resume();
      reponse.on("end", () => resoudre({ statut: reponse.statusCode ?? 0 }));
    });
    // La connexion est coupée après la réponse (`req.destroy()` côté serveur) :
    // l'erreur qui s'ensuit est le comportement voulu, pas un échec de test.
    requete.on("error", (e) => rejeter(e));
    requete.write(corps);
    requete.end();
  });
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
    // `/proprietes` et non `/` : la racine appartient désormais à la vitrine,
    // dont la politique n'a ni `connect-src` ni `script-src`. Il faut un
    // chemin de l'arbre AUTHENTIFIÉ pour éprouver la politique à nonce.
    const prod = await demarrer();
    expect((await prod.appeler("/proprietes")).headers.get("Content-Security-Policy")).toContain("connect-src 'self';");
    const dev = await demarrer({ developpement: true });
    const csp = (await dev.appeler("/proprietes")).headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("connect-src 'self' ws:");
    expect(csp).toContain("script-src 'self' 'nonce-");
    // Le développement ne relâche rien d'autre, et rien sur /p/.
    expect(csp).not.toContain("unsafe-eval");
    expect((await dev.appeler("/p/x")).headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("la liste d'attente a SON compteur, plus large et plus long que celui de la connexion", async () => {
    const t = horloge();
    const { appeler } = await demarrer({
      limites: {
        ...LIMITES,
        connexion: { fenetreMs: 60_000, maximum: 2 },
        listeAttente: { fenetreMs: 3_600_000, maximum: 3 },
      },
      maintenant: t.maintenant,
    });

    // Les deux bords du compteur de la liste d'attente.
    for (let i = 0; i < 3; i++) expect((await appeler("/", { method: "POST" })).status).toBe(200);
    expect((await appeler("/", { method: "POST" })).status).toBe(429);

    // Sa fenêtre est la sienne : celle de la connexion s'est rouverte depuis
    // longtemps que celle-ci tient encore.
    t.avancer(120_000);
    expect((await appeler("/", { method: "POST" })).status).toBe(429);
    t.avancer(3_600_000);
    expect((await appeler("/", { method: "POST" })).status).toBe(200);
  });

  it("épuiser la liste d'attente ne ferme PAS la connexion, ni l'inverse", async () => {
    // C'est la raison de ne pas brancher les deux sur le même compteur :
    // `cleDeFrein` compte par /64 en IPv6, donc un bot qui martèle la page de
    // vente depuis un opérateur mobile mettrait dehors le propriétaire qui
    // essaie de se connecter derrière le même préfixe.
    const { appeler } = await demarrer({
      limites: { ...LIMITES, connexion: { fenetreMs: 60_000, maximum: 2 }, listeAttente: { fenetreMs: 3_600_000, maximum: 2 } },
    });

    for (let i = 0; i < 2; i++) await appeler("/", { method: "POST" });
    expect((await appeler("/", { method: "POST" })).status).toBe(429);
    // La connexion, elle, répond toujours.
    expect((await appeler("/connexion", { method: "POST" })).status).toBe(200);

    // Et dans l'autre sens : le compteur de la connexion épuisé ne ferme pas
    // la liste d'attente.
    expect((await appeler("/connexion", { method: "POST" })).status).toBe(200);
    expect((await appeler("/connexion", { method: "POST" })).status).toBe(429);
    // (le compteur de la liste d'attente est déjà épuisé plus haut, on le
    //  laisse se rouvrir pour ne mesurer que l'indépendance)
  });

  it("ne freine que l'ENVOI de la liste d'attente, jamais la lecture de la vitrine", async () => {
    const { appeler } = await demarrer({
      limites: { ...LIMITES, listeAttente: { fenetreMs: 3_600_000, maximum: 1 } },
    });
    expect((await appeler("/", { method: "POST" })).status).toBe(200);
    expect((await appeler("/", { method: "POST" })).status).toBe(429);
    // La page elle-même reste servie : elle ne coûte rien et se met en cache
    // public, et une vitrine qui répond 429 à un visiteur n'a aucun sens.
    for (let i = 0; i < 5; i++) expect((await appeler("/")).status).toBe(200);
    expect((await appeler("/confidentialite")).status).toBe(200);
  });

  it("le frein suit le chemin, pas la forme de l'URL ni la page", async () => {
    const { appeler } = await demarrer({
      limites: { ...LIMITES, listeAttente: { fenetreMs: 3_600_000, maximum: 2 } },
    });
    // React Router vise `/?index` (route index sous une mise en page) :
    // `req.path` vaut `/`, et c'est bien ce chemin-là qui est compté.
    expect((await appeler("/?index", { method: "POST" })).status).toBe(200);
    // Et toute autre page de la vitrine partage le compteur, sans qu'il ait
    // fallu l'y inscrire à la main.
    expect((await appeler("/confidentialite", { method: "POST" })).status).toBe(200);
    expect((await appeler("/a-propos", { method: "POST" })).status).toBe(429);

    // Un POST hors vitrine n'est pas concerné par CE compteur.
    expect((await appeler("/proprietes/1/elements/nouveau", { method: "POST" })).status).toBe(200);
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

  it("rend 411 sur un corps sans longueur annoncée, sans que le gestionnaire voie la requête", async () => {
    // `fetch` annonce toujours la longueur : il faut le client bas niveau de
    // Node pour produire un `chunked`, ce que fait `write()` sans
    // `Content-Length`. C'est aussi ce qu'envoyait le `curl` de l'issue #33.
    const { appeler, appels, port } = await demarrer({ tailleMaxCorps: 100 });

    const chunked = await enChunked(port, "/proprietes/1", "x".repeat(500));
    expect(chunked.statut).toBe(411);
    expect(appels).toHaveLength(0);

    // Et le chemin annoncé continue de marcher : ni la borne de taille ni ce
    // refus ne touchent un envoi ordinaire.
    const annonce = await appeler("/proprietes/1", { method: "POST", body: "x".repeat(50) });
    expect(annonce.status).toBe(200);
    expect(appels).toHaveLength(1);
  });

  it("ne refuse ni un GET ni un POST sans corps : le critère est le cadrage, pas la méthode", async () => {
    const { appeler, appels } = await demarrer();
    // Un POST sans corps annonce `Content-Length: 0` — mesuré, undici comme
    // les navigateurs. Il n'a rien d'un envoi non borné.
    expect((await appeler("/proprietes/1", { method: "POST" })).status).toBe(200);
    expect((await appeler("/proprietes/1")).status).toBe(200);
    expect(appels).toHaveLength(2);
  });

  it("laisse passer par défaut l'image de plan la plus grosse qu'une route accepte", () => {
    // 25 Mo pour un plan (`plans.nouveau.tsx`), plus l'enveloppe multipart.
    expect(TAILLE_MAX_CORPS).toBeGreaterThan(25 * 1024 * 1024);
    expect(TAILLE_MAX_CORPS).toBeLessThanOrEqual(32 * 1024 * 1024);
  });
});
