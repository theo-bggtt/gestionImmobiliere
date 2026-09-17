// app/lib/coffre/chiffrement.ts
// Le chiffrement du coffre. Module NEUTRE : aucun import, ni drizzle ni Node —
// il tourne dans le navigateur (c'est là que tout se chiffre et se déchiffre)
// et sous Node pour les tests, sur le même `globalThis.crypto.subtle`. Même
// règle que `app/lib/forms/types.ts` : le serveur ne l'importe que pour lire
// les formes (longueurs, versions), jamais pour ouvrir quoi que ce soit.
//
// Ce que le module sait faire, et rien de plus :
//
//   - une CLÉ DE DONNÉES aléatoire (256 bits) chiffre les secrets. Elle ne
//     dérive de rien : changer de phrase ne la change pas, donc ne rechiffre
//     aucun secret ;
//   - elle est ENVELOPPÉE deux fois, par la clé dérivée de la phrase et par
//     celle dérivée de la clé de secours (PBKDF2-SHA256 → AES-256-GCM). Ouvrir
//     le coffre, c'est désenvelopper avec l'une ou l'autre. Une mauvaise
//     phrase ÉCHOUE ici, sur l'étiquette GCM — elle ne rend jamais une clé
//     fausse qui irait déchiffrer du bruit ;
//   - le sel et le nombre d'itérations sont stockés dans `coffre` et relus à
//     l'ouverture : ce module ne les code pas en dur, et c'est ce qui permet de
//     monter `ITERATIONS_COFFRE` plus tard sans deviner lequel a servi, et aux
//     tests de tourner avec 1 000.
//
// FORMAT D'UN BLOC (enveloppe ou secret) — un octet de version, puis le nonce
// de 12 octets, puis le texte chiffré suivi de son étiquette de 16 octets ; le
// tout en base64url, stocké en `text`. L'octet de version est là pour changer
// d'algorithme un jour sans casser les blocs existants : un lecteur qui trouve
// une version qu'il ne connaît pas refuse avant de tenter quoi que ce soit.
// Pas de `bytea` : drizzle n'en a pas de natif, un `customType` pour des
// valeurs de quelques dizaines d'octets n'apporte rien, et du texte se relit
// dans un dump.

export const ITERATIONS_COFFRE = 600_000;
export const VERSION_BLOC = 1;
export const LONGUEUR_SEL = 16;
export const LONGUEUR_NONCE = 12;
export const LONGUEUR_CLE = 32;
export const LONGUEUR_ETIQUETTE = 16;

/**
 * Des octets sur un `ArrayBuffer` ordinaire. TypeScript 5.9 type `Uint8Array`
 * sur `ArrayBufferLike`, que WebCrypto refuse (`BufferSource` exclut un
 * `SharedArrayBuffer`) ; tout ce que ce module crée ou reçoit en est un.
 */
export type Octets = Uint8Array<ArrayBuffer>;

/** Ce que le navigateur reçoit d'un coffre existant, et tout ce qu'il lui faut pour l'ouvrir. */
export type CoffreOuvrable = {
  sel: string;
  iterations: number;
  cleParPhrase: string;
  cleParSecours: string;
};

const subtle = () => globalThis.crypto.subtle;

// ---------------------------------------------------------------------------
// base64url — sans `Buffer`, parce que le navigateur n'en a pas.

const ALPHABET_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encoderBase64url(octets: Octets): string {
  let sortie = "";
  for (let i = 0; i < octets.length; i += 3) {
    const a = octets[i];
    const b = octets[i + 1];
    const c = octets[i + 2];
    sortie += ALPHABET_B64[a >> 2];
    sortie += ALPHABET_B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) sortie += ALPHABET_B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) sortie += ALPHABET_B64[c & 63];
  }
  return sortie;
}

export function decoderBase64url(texte: string): Octets {
  if (!/^[A-Za-z0-9_-]*$/.test(texte) || texte.length % 4 === 1) {
    throw new Error("Ce n'est pas du base64url.");
  }
  const sortie = new Uint8Array(Math.floor((texte.length * 3) / 4));
  let tampon = 0;
  let bits = 0;
  let k = 0;
  for (const caractere of texte) {
    tampon = (tampon << 6) | ALPHABET_B64.indexOf(caractere);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      sortie[k++] = (tampon >> bits) & 0xff;
    }
  }
  return sortie;
}

// ---------------------------------------------------------------------------
// Les clés.

export function genererCleDonnees(): Octets {
  return crypto.getRandomValues(new Uint8Array(LONGUEUR_CLE));
}

export function genererSel(): Octets {
  return crypto.getRandomValues(new Uint8Array(LONGUEUR_SEL));
}

// base32 (RFC 4648), sans `0`, `1`, `8` ni `9` : ce qui s'imprime et se retape
// sans confondre un O et un zéro. 160 bits → 32 caractères → huit groupes.
const ALPHABET_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** La clé de secours telle que le propriétaire la voit : `XXXX-XXXX-…`, huit groupes de quatre. */
export function genererCleSecours(): string {
  const octets = crypto.getRandomValues(new Uint8Array(20));
  let texte = "";
  let tampon = 0;
  let bits = 0;
  for (const o of octets) {
    tampon = (tampon << 8) | o;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      texte += ALPHABET_B32[(tampon >> bits) & 31];
    }
  }
  return texte.match(/.{4}/g)!.join("-");
}

/**
 * Ce qu'on tape n'est jamais ce qu'on a imprimé : minuscules, espaces à la
 * place des tirets, un espace de trop. On ne garde que les caractères de
 * l'alphabet, en majuscules — et c'est CETTE forme qui dérive la clé, à la
 * création comme à l'ouverture.
 */
export function normaliserCleSecours(brut: string): string {
  return brut.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

/** PBKDF2-SHA256 → clé AES-256-GCM, non extractible : elle ne sert qu'à envelopper. */
export async function deriverCleEnveloppe(phraseOuSecours: string, sel: Octets, iterations: number): Promise<CryptoKey> {
  const matiere = await subtle().importKey("raw", new TextEncoder().encode(phraseOuSecours), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: sel, iterations },
    matiere,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------------------
// Les blocs.

export type Bloc = { version: number; nonce: Octets; corps: Octets };

/**
 * Découpe un bloc et refuse avant toute cryptographie ce qui n'a pas la forme :
 * version inconnue, ou trop court pour porter un nonce et une étiquette. C'est
 * aussi ce que le serveur appelle pour vérifier la FORME de ce qu'il stocke —
 * il ne peut rien vérifier d'autre, et n'essaie pas.
 */
export function lireBloc(texte: string): Bloc {
  const octets = decoderBase64url(texte);
  if (octets.length < 1 + LONGUEUR_NONCE + LONGUEUR_ETIQUETTE) throw new Error("Bloc trop court.");
  if (octets[0] !== VERSION_BLOC) throw new Error(`Version de bloc inconnue : ${octets[0]}.`);
  return {
    version: octets[0],
    nonce: octets.slice(1, 1 + LONGUEUR_NONCE),
    corps: octets.slice(1 + LONGUEUR_NONCE),
  };
}

async function chiffrerOctets(cle: CryptoKey, clair: Octets): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(LONGUEUR_NONCE));
  const corps = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce }, cle, clair));
  const bloc = new Uint8Array(1 + LONGUEUR_NONCE + corps.length);
  bloc[0] = VERSION_BLOC;
  bloc.set(nonce, 1);
  bloc.set(corps, 1 + LONGUEUR_NONCE);
  return encoderBase64url(bloc);
}

/** Lance sur une mauvaise clé ou un bloc altéré : c'est l'étiquette GCM qui refuse. */
async function dechiffrerOctets(cle: CryptoKey, texte: string): Promise<Octets> {
  const { nonce, corps } = lireBloc(texte);
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: nonce }, cle, corps));
}

export function envelopper(cleDonnees: Octets, cleEnveloppe: CryptoKey): Promise<string> {
  return chiffrerOctets(cleEnveloppe, cleDonnees);
}

export async function desenvelopper(enveloppe: string, cleEnveloppe: CryptoKey): Promise<Octets> {
  const cle = await dechiffrerOctets(cleEnveloppe, enveloppe);
  if (cle.length !== LONGUEUR_CLE) throw new Error("L'enveloppe ne porte pas une clé de données.");
  return cle;
}

async function importerCleDonnees(cleDonnees: Octets): Promise<CryptoKey> {
  return subtle().importKey("raw", cleDonnees, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function chiffrer(cleDonnees: Octets, texte: string): Promise<string> {
  return chiffrerOctets(await importerCleDonnees(cleDonnees), new TextEncoder().encode(texte));
}

export async function dechiffrer(cleDonnees: Octets, bloc: string): Promise<string> {
  return new TextDecoder().decode(await dechiffrerOctets(await importerCleDonnees(cleDonnees), bloc));
}

// ---------------------------------------------------------------------------
// Les gestes des écrans, écrits une fois pour que les tests jouent EXACTEMENT
// ce que le navigateur joue — avec 1 000 itérations au lieu de 600 000.

/** Ce que le navigateur POSTe à la création : les paramètres et les deux enveloppes, jamais la phrase. */
export type CoffreCompose = {
  sel: string;
  iterations: number;
  cleParPhrase: string;
  cleParSecours: string;
};

/**
 * Composer un coffre : tirer la clé de données et la clé de secours, dériver,
 * envelopper deux fois. La clé de secours rendue ici est affichée UNE fois
 * par l'écran et n'est ni stockée, ni renvoyée par un loader, ni gardée dans
 * l'état après navigation.
 */
export async function composerCoffre(
  phrase: string,
  iterations = ITERATIONS_COFFRE,
): Promise<{ coffre: CoffreCompose; secours: string; cleDonnees: Octets }> {
  const sel = genererSel();
  const cleDonnees = genererCleDonnees();
  const secours = genererCleSecours();
  const cleParPhrase = await envelopper(cleDonnees, await deriverCleEnveloppe(phrase, sel, iterations));
  const cleParSecours = await envelopper(
    cleDonnees,
    await deriverCleEnveloppe(normaliserCleSecours(secours), sel, iterations),
  );
  return {
    coffre: { sel: encoderBase64url(sel), iterations, cleParPhrase, cleParSecours },
    secours,
    cleDonnees,
  };
}

/**
 * Changer la phrase : ouvrir avec l'actuelle (ou la clé de secours), puis
 * réenvelopper la MÊME clé de données avec la nouvelle. Ce qui en sort est la
 * seule enveloppe par phrase ; ni le sel, ni les itérations, ni l'enveloppe
 * par secours, ni un secret ne changent.
 */
export async function reenvelopperParPhrase(
  coffre: CoffreOuvrable,
  saisieActuelle: string,
  nouvellePhrase: string,
): Promise<string> {
  const cleDonnees = await ouvrirCoffre(coffre, saisieActuelle);
  return envelopper(cleDonnees, await deriverCleEnveloppe(nouvellePhrase, decoderBase64url(coffre.sel), coffre.iterations));
}

// ---------------------------------------------------------------------------
// Ouvrir.

/**
 * Rend la clé de données, par la phrase ou par la clé de secours — ce qu'on a
 * tapé est essayé comme phrase d'abord, puis, normalisé, comme clé de secours.
 * Un seul champ à l'écran, donc une seule fonction ici. Lance si ni l'une ni
 * l'autre n'ouvre ; le message ne dit pas laquelle des deux a été essayée.
 */
export async function ouvrirCoffre(coffre: CoffreOuvrable, saisie: string): Promise<Octets> {
  const sel = decoderBase64url(coffre.sel);
  try {
    return await desenvelopper(coffre.cleParPhrase, await deriverCleEnveloppe(saisie, sel, coffre.iterations));
  } catch {
    // Une clé de secours a 32 caractères utiles ; en deçà, inutile de dériver
    // une seconde fois pour échouer pareil.
    const secours = normaliserCleSecours(saisie);
    if (secours.length !== 32) throw new Error("Phrase ou clé de secours incorrecte.");
    try {
      return await desenvelopper(coffre.cleParSecours, await deriverCleEnveloppe(secours, sel, coffre.iterations));
    } catch {
      throw new Error("Phrase ou clé de secours incorrecte.");
    }
  }
}
