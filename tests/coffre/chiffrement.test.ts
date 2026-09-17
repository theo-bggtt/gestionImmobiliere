// tests/coffre/chiffrement.test.ts
// Le module de chiffrement du coffre, sous Node, sans base ni DOM : c'est le
// même `globalThis.crypto.subtle` que le navigateur, et c'est le seul endroit
// du coffre qui décide de quelque chose. Ce qui est tenu ici :
//
//   - une phrase fausse ÉCHOUE au désenveloppement (étiquette GCM), elle ne
//     rend pas une clé fausse qui déchiffrerait du bruit ;
//   - un bloc altéré d'un octet échoue de la même façon ;
//   - deux chiffrements du même texte donnent deux blocs (nonce tiré) ;
//   - la clé de secours rouvre ce que la phrase a fermé ;
//   - changer la phrase ne touche ni la clé de données, ni un seul secret.
//
// 1 000 itérations et non 600 000 : le nombre est stocké dans `coffre`, lu à
// l'ouverture, et le module ne le code pas en dur — c'est ce qui permet au
// test de tourner vite ET de monter la valeur de production sans casser les
// coffres existants.
import { describe, it, expect } from "vitest";
import {
  ITERATIONS_COFFRE,
  LONGUEUR_CLE,
  LONGUEUR_SEL,
  chiffrer,
  dechiffrer,
  decoderBase64url,
  deriverCleEnveloppe,
  desenvelopper,
  encoderBase64url,
  envelopper,
  genererCleDonnees,
  genererCleSecours,
  genererSel,
  lireBloc,
  normaliserCleSecours,
  ouvrirCoffre,
} from "../../app/lib/coffre/chiffrement";

const ITERATIONS = 1_000;

/** Un coffre complet, tel que le navigateur le composerait à la création. */
async function creerCoffre(phrase: string) {
  const sel = genererSel();
  const cleDonnees = genererCleDonnees();
  const secours = genererCleSecours();
  const cleParPhrase = await envelopper(cleDonnees, await deriverCleEnveloppe(phrase, sel, ITERATIONS));
  const cleParSecours = await envelopper(
    cleDonnees,
    await deriverCleEnveloppe(normaliserCleSecours(secours), sel, ITERATIONS),
  );
  return {
    cleDonnees,
    secours,
    coffre: { sel: encoderBase64url(sel), iterations: ITERATIONS, cleParPhrase, cleParSecours },
  };
}

describe("base64url", () => {
  it("fait l'aller-retour sans remplissage ni caractère hors alphabet", () => {
    const octets = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const texte = encoderBase64url(octets);
    expect(texte).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decoderBase64url(texte)).toEqual(octets);
    // Une longueur qui ne tombe pas sur un multiple de trois.
    for (const n of [1, 2, 3, 4, 5, 31, 32, 33]) {
      const o = crypto.getRandomValues(new Uint8Array(n));
      expect(decoderBase64url(encoderBase64url(o))).toEqual(o);
    }
  });

  it("refuse ce qui n'est pas du base64url", () => {
    expect(() => decoderBase64url("abc+def")).toThrow();
    expect(() => decoderBase64url("abc=")).toThrow();
    expect(() => decoderBase64url("é")).toThrow();
  });
});

describe("les clés", () => {
  it("tire une clé de données de 256 bits, différente à chaque fois", () => {
    const a = genererCleDonnees();
    const b = genererCleDonnees();
    expect(a).toHaveLength(LONGUEUR_CLE);
    expect(LONGUEUR_CLE).toBe(32);
    expect(a).not.toEqual(b);
    expect(genererSel()).toHaveLength(LONGUEUR_SEL);
  });

  it("rend une clé de secours lisible : huit groupes de quatre, en base32", () => {
    const secours = genererCleSecours();
    expect(secours).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(genererCleSecours()).not.toBe(secours);
  });

  it("normalise une clé de secours tapée à la main : casse, espaces, tirets", () => {
    const secours = genererCleSecours();
    const nue = secours.replaceAll("-", "");
    expect(normaliserCleSecours(secours)).toBe(nue);
    expect(normaliserCleSecours(secours.toLowerCase())).toBe(nue);
    expect(normaliserCleSecours(` ${secours.replaceAll("-", " ")} `)).toBe(nue);
  });

  it("expose la valeur de production des itérations, écrite une fois", () => {
    expect(ITERATIONS_COFFRE).toBe(600_000);
  });
});

describe("l'enveloppe", () => {
  it("rend la clé de données à qui a la phrase", async () => {
    const { cleDonnees, coffre } = await creerCoffre("correct horse battery staple");
    const cle = await deriverCleEnveloppe("correct horse battery staple", decoderBase64url(coffre.sel), ITERATIONS);
    expect(await desenvelopper(coffre.cleParPhrase, cle)).toEqual(cleDonnees);
  });

  it("ÉCHOUE sur une phrase fausse, au lieu de rendre une clé fausse", async () => {
    const { coffre } = await creerCoffre("la bonne");
    const cle = await deriverCleEnveloppe("la mauvaise", decoderBase64url(coffre.sel), ITERATIONS);
    await expect(desenvelopper(coffre.cleParPhrase, cle)).rejects.toThrow();
  });

  it("échoue aussi quand les itérations ne sont pas celles de la création", async () => {
    const { coffre } = await creerCoffre("la bonne");
    const cle = await deriverCleEnveloppe("la bonne", decoderBase64url(coffre.sel), ITERATIONS + 1);
    await expect(desenvelopper(coffre.cleParPhrase, cle)).rejects.toThrow();
  });
});

describe("les secrets", () => {
  it("fait l'aller-retour, accents compris", async () => {
    const cle = genererCleDonnees();
    const bloc = await chiffrer(cle, "4821# — côté jardin, la clé est sous le pot");
    expect(await dechiffrer(cle, bloc)).toBe("4821# — côté jardin, la clé est sous le pot");
  });

  it("donne deux blocs différents pour le même texte (nonce tiré à chaque fois)", async () => {
    const cle = genererCleDonnees();
    const a = await chiffrer(cle, "4821");
    const b = await chiffrer(cle, "4821");
    expect(a).not.toBe(b);
    expect(await dechiffrer(cle, a)).toBe("4821");
    expect(await dechiffrer(cle, b)).toBe("4821");
  });

  it("porte un octet de version, puis le nonce, puis le corps", async () => {
    const bloc = lireBloc(await chiffrer(genererCleDonnees(), "x"));
    expect(bloc.version).toBe(1);
    expect(bloc.nonce).toHaveLength(12);
    // Un caractère chiffré et l'étiquette de 16 octets.
    expect(bloc.corps).toHaveLength(17);
  });

  it("échoue sur un bloc altéré d'un octet, où que ce soit", async () => {
    const cle = genererCleDonnees();
    const bloc = await chiffrer(cle, "4821");
    const octets = decoderBase64url(bloc);
    for (const position of [0, 1, 12, 13, octets.length - 1]) {
      const altere = new Uint8Array(octets);
      altere[position] ^= 0x01;
      await expect(dechiffrer(cle, encoderBase64url(altere)), `octet ${position}`).rejects.toThrow();
    }
  });

  it("échoue avec une autre clé de données", async () => {
    const bloc = await chiffrer(genererCleDonnees(), "4821");
    await expect(dechiffrer(genererCleDonnees(), bloc)).rejects.toThrow();
  });

  it("refuse un bloc d'une version inconnue ou trop court, sans même tenter", () => {
    expect(() => lireBloc(encoderBase64url(new Uint8Array([2, ...new Array(40).fill(0)])))).toThrow();
    expect(() => lireBloc(encoderBase64url(new Uint8Array([1, 0, 0, 0])))).toThrow();
  });
});

describe("ouvrir le coffre", () => {
  it("s'ouvre avec la phrase, et avec la clé de secours après une phrase fausse", async () => {
    const { cleDonnees, secours, coffre } = await creerCoffre("ma phrase");
    const secret = await chiffrer(cleDonnees, "4821");

    expect(await ouvrirCoffre(coffre, "ma phrase")).toEqual(cleDonnees);
    await expect(ouvrirCoffre(coffre, "pas ma phrase")).rejects.toThrow();

    // La clé de secours, telle qu'elle a été imprimée, puis telle qu'on la
    // retape : en minuscules, avec des espaces à la place des tirets.
    const parSecours = await ouvrirCoffre(coffre, secours);
    expect(parSecours).toEqual(cleDonnees);
    expect(await ouvrirCoffre(coffre, secours.toLowerCase().replaceAll("-", " "))).toEqual(cleDonnees);
    expect(await dechiffrer(parSecours, secret)).toBe("4821");
  });

  it("changer la phrase ne change ni la clé de données ni un seul secret", async () => {
    const { cleDonnees, secours, coffre } = await creerCoffre("ancienne");
    const secret = await chiffrer(cleDonnees, "4821");

    // Le geste de l'écran : ouvrir (ici par la clé de secours, le cas
    // « phrase oubliée »), réenvelopper avec la nouvelle, remplacer la seule
    // enveloppe par phrase.
    const ouverte = await ouvrirCoffre(coffre, secours);
    const nouvelle = await envelopper(ouverte, await deriverCleEnveloppe("nouvelle", decoderBase64url(coffre.sel), ITERATIONS));
    const apres = { ...coffre, cleParPhrase: nouvelle };

    expect(apres.cleParSecours).toBe(coffre.cleParSecours);
    expect(await ouvrirCoffre(apres, "nouvelle")).toEqual(cleDonnees);
    await expect(ouvrirCoffre(apres, "ancienne")).rejects.toThrow();
    // Le bloc n'a pas bougé, et il se lit toujours.
    expect(await dechiffrer(await ouvrirCoffre(apres, "nouvelle"), secret)).toBe("4821");
  });
});
