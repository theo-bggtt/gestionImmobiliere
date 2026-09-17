// tests/coffre/aides.ts
// Le jeu de données des tests du coffre : un compte connecté, une propriété
// avec une zone et un objet, et de quoi appeler les routes du propriétaire.
// Partagé par `etancheite.test.ts` et `routes.test.ts`, qui jouent les mêmes
// gestes sous deux angles.
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur, propriete, batiment, niveau, zone, element, session } from "../../app/db/schema/index";
import { sessionCookie } from "../../app/lib/auth/cookie.server";
import { composerCoffre } from "../../app/lib/coffre/chiffrement";
import { creerCoffre } from "../../app/lib/coffre/coffre.server";

/** 1 000 et non 600 000 : stocké dans `coffre`, relu à l'ouverture, donc libre ici. */
export const ITERATIONS_TEST = 1_000;

export async function compteConnecte(nomPropriete = "Chez moi") {
  const marque = `${Date.now()}-${Math.random()}`;
  const [u] = await db.insert(utilisateur).values({ email: `c-${marque}@x.local`, motDePasseHash: "x" }).returning();
  const [p] = await db.insert(propriete).values({ proprietaireId: u.id, nom: nomPropriete }).returning();
  const [b] = await db.insert(batiment).values({ proprieteId: p.id, nom: "Maison" }).returning();
  const [n] = await db.insert(niveau).values({ batimentId: b.id, nom: "Rez", ordinal: 0 }).returning();
  const [z] = await db.insert(zone).values({ proprieteId: p.id, niveauId: n.id, nom: "Entrée", type: "interieur" }).returning();
  const [e] = await db.insert(element).values({ proprieteId: p.id, nom: "Portail", zoneId: z.id, niveau: 0 }).returning();

  const jeton = randomBytes(32).toString("hex");
  await db.insert(session).values({ id: jeton, utilisateurId: u.id, expireLe: new Date(Date.now() + 3600_000) });
  const cookie = (await sessionCookie.serialize(jeton)).split(";")[0];
  return { u, p, z, e, cookie };
}

export function requete(url: string, cookie: string, corps?: FormData) {
  return new Request(`http://test.local${url}`, {
    method: corps ? "POST" : "GET",
    headers: { cookie },
    body: corps,
  });
}

export function formulaire(champs: Record<string, string>) {
  const corps = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) corps.set(cle, valeur);
  return corps;
}

/**
 * Crée un coffre COMME LE NAVIGATEUR LE FERAIT — par le module de chiffrement,
 * puis par la fonction serveur qui écrit — et rend ce que le navigateur
 * garderait pour lui : la clé de secours et la clé de données.
 */
export async function coffrePour(proprieteId: number, phrase: string) {
  const compose = await composerCoffre(phrase, ITERATIONS_TEST);
  expectVrai(await creerCoffre(proprieteId, compose.coffre), "le coffre n'a pas été créé");
  return compose;
}

function expectVrai(v: boolean, message: string) {
  if (!v) throw new Error(message);
}

/** `md5` de chaque `secret.valeur` de la propriété, calculé par PostgreSQL : c'est l'octet qu'on compare. */
export async function empreintesDesSecrets(proprieteId: number): Promise<Array<{ id: number; md5: string }>> {
  const lignes = await db.execute<{ id: number; md5: string }>(sql`
    SELECT s.id, md5(s.valeur) AS md5
    FROM secret s JOIN element e ON e.id = s.element_id
    WHERE e.propriete_id = ${proprieteId}
    ORDER BY s.id
  `);
  return lignes.rows;
}
