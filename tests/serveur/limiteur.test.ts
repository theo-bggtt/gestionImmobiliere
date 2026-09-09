// tests/serveur/limiteur.test.ts
// Le compteur à fenêtre fixe, éprouvé avec une horloge injectée : ce qu'il
// autorise, quand il rouvre, et que sa mémoire est bornée.
import { describe, it, expect } from "vitest";
import { cleDeFrein, creerLimiteur } from "../../server/limiteur.js";

function horloge(depart = 1_000_000) {
  let t = depart;
  return { maintenant: () => t, avancer: (ms: number) => (t += ms) };
}

describe("creerLimiteur", () => {
  it("autorise `maximum` requêtes par fenêtre, puis refuse", () => {
    const h = horloge();
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 3, maintenant: h.maintenant });

    expect(l.consommer("a").autorise).toBe(true);
    expect(l.consommer("a").autorise).toBe(true);
    expect(l.consommer("a")).toMatchObject({ autorise: true, restant: 0 });
    expect(l.consommer("a")).toMatchObject({ autorise: false, restant: 0 });
  });

  it("dit quand réessayer, et rouvre une fois la fenêtre passée", () => {
    const h = horloge();
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 1, maintenant: h.maintenant });

    l.consommer("a");
    h.avancer(15_000);
    expect(l.consommer("a")).toMatchObject({ autorise: false, reessaiDansMs: 45_000 });

    h.avancer(45_000);
    expect(l.consommer("a").autorise).toBe(true);
  });

  it("compte chaque clé à part", () => {
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 1 });
    expect(l.consommer("a").autorise).toBe(true);
    expect(l.consommer("b").autorise).toBe(true);
    expect(l.consommer("a").autorise).toBe(false);
    expect(l.consommer("b").autorise).toBe(false);
  });

  it("oublie les fenêtres closes et ne garde jamais plus de `clesMax` clés", () => {
    const h = horloge();
    const l = creerLimiteur({ fenetreMs: 60_000, maximum: 5, clesMax: 3, maintenant: h.maintenant });

    for (let i = 0; i < 10; i++) l.consommer(`adresse-${i}`);
    expect(l.taille()).toBe(3);
    // La clé en cours n'est jamais celle qu'on évince.
    expect(l.consommer("adresse-9")).toMatchObject({ autorise: true, restant: 3 });

    h.avancer(60_000);
    l.consommer("nouvelle");
    expect(l.taille()).toBe(1);
  });

  it("refuse une configuration qui n'aurait aucun sens", () => {
    expect(() => creerLimiteur({ fenetreMs: 0, maximum: 1 })).toThrow();
    expect(() => creerLimiteur({ fenetreMs: 1000, maximum: 0 })).toThrow();
  });
});

describe("la clé du frein", () => {
  it("regroupe un /64 IPv6, parce qu'un abonné en a 2^64", () => {
    // Compter par adresse complète en IPv6, c'est ne pas compter : le plus
    // petit bloc qu'un fournisseur délègue est un /64, et un VPS en obtient un
    // aussi. Mesuré avant le correctif : 5 000 requêtes depuis 5 000 adresses
    // d'un même /64 passaient une borne de 600.
    const memePrefixe = ["2001:db8::1", "2001:db8::2", "2001:db8:0:0:ffff:ffff:ffff:ffff"];
    expect(new Set(memePrefixe.map(cleDeFrein)).size).toBe(1);

    // Deux abonnés distincts restent distincts.
    expect(cleDeFrein("2001:db8:0:1::1")).not.toBe(cleDeFrein("2001:db8:0:2::1"));
  });

  it("reconnaît deux écritures du même préfixe", () => {
    // `req.ip` rend la forme canonique, mais un préfixe écrit à la main ou
    // relayé autrement ne doit pas ouvrir un second compteur.
    expect(cleDeFrein("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(cleDeFrein("2001:db8::1"));
    expect(cleDeFrein("2001:DB8::9")).toBe(cleDeFrein("2001:db8::1"));
  });

  it("laisse l'IPv4 intacte, mappée comprise", () => {
    // Une adresse IPv4 EST un client : la tronquer regrouperait des abonnés
    // qui n'ont rien à voir.
    expect(cleDeFrein("203.0.113.7")).toBe("203.0.113.7");
    expect(cleDeFrein("::ffff:203.0.113.7")).toBe("::ffff:203.0.113.7");
    expect(cleDeFrein(undefined)).toBe("");
  });

  it("épuise vraiment une borne depuis un /64, ce qui n'arrivait pas avant", () => {
    const limiteur = creerLimiteur({ fenetreMs: 60_000, maximum: 10, maintenant: () => 1_000_000 });
    for (let i = 0; i < 10; i += 1) {
      expect(limiteur.consommer(cleDeFrein(`2001:db8::${i.toString(16)}`)).autorise).toBe(true);
    }
    expect(limiteur.consommer(cleDeFrein("2001:db8::ff")).autorise).toBe(false);
  });
});
