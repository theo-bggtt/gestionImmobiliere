// app/lib/vitrine/liste-attente.server.ts
// Le seul endroit de la vitrine qui touche la base, et il n'en LIT rien.
//
// `tests/vitrine/etancheite.test.ts` tient cette frontière : aucune route de
// la vitrine n'a de loader, aucune ne rend de donnée issue de la base, et ce
// module-ci est le seul chemin autorisé vers `db` — parce qu'il écrit.
import { db } from "../../db/client";
import { interesse } from "../../db/schema/index";

/** Ce que l'écran a le droit de savoir du résultat. Trois issues, et aucune
 *  ne distingue « créée » de « déjà là » : voir `enregistrerInteresse`. */
export type Issue = "enregistre" | "adresse-invalide";

/**
 * Une validation volontairement pauvre : il y a un `@`, quelque chose avant,
 * quelque chose après, et un point dans le domaine. Valider finement une
 * adresse est un problème qu'on ne gagne pas — la seule vérification qui
 * vaille est d'y envoyer un message, et ce projet n'a pas de mailer. Une
 * borne de longueur protège la colonne, rien de plus.
 */
export function adressePlausible(valeur: string): boolean {
  return valeur.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur);
}

/**
 * Enregistre une adresse, ou ne fait rien si elle y est déjà.
 *
 * NE REND RIEN, et c'est la décision de ce module. Dire à l'appelant si la
 * ligne a été créée lui donnerait les moyens d'écrire « vous êtes déjà
 * inscrit » — c'est-à-dire un ORACLE : n'importe qui pourrait tester si une
 * adresse donnée figure sur la liste, une adresse à la fois. Même famille que
 * « filtré = 404, jamais 403 » : ce n'est pas la réponse qu'on masque, c'est
 * la différence qu'on supprime.
 *
 * La fermer ICI plutôt que dans l'écran est ce qui la ferme pour de bon : un
 * appelant ne peut pas divulguer ce qu'il n'a pas reçu, et le prochain écran
 * qui s'en servira n'aura pas à connaître le piège. `ON CONFLICT DO NOTHING`
 * fait le reste — l'idempotence vient de la contrainte `UNIQUE(email)`, pas
 * d'un `SELECT` préalable qui aurait, lui, une réponse à divulguer.
 */
export async function enregistrerInteresse(email: string): Promise<void> {
  await db
    .insert(interesse)
    .values({ email })
    .onConflictDoNothing({ target: interesse.email });
}

/** Normalise avant d'écrire : une adresse tapée sur un téléphone arrive avec
 *  une majuscule initiale et parfois une espace finale, et deux lignes ne
 *  doivent pas exister pour la même personne — la contrainte `UNIQUE` ne le
 *  saurait pas, elle compare des octets. */
export const normaliser = (brut: unknown): string => String(brut ?? "").trim().toLowerCase();
