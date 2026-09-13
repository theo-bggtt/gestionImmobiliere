// app/db/schema/vitrine.ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Les gens qui ont laissé leur adresse sur la vitrine. Une adresse, une date,
 * et RIEN D'AUTRE : pas d'IP, pas de `User-Agent`, pas de champ libre, pas de
 * provenance. Ce qu'on ne stocke pas ne fuit pas et n'a pas à se justifier.
 *
 * C'est la seule table du schéma qui contienne des données de gens qui ne
 * sont pas le propriétaire. Conséquence directe, écrite aussi dans le README
 * sous « Mise en service » : un `pg_dump` porte désormais des adresses de
 * tiers en plus des jetons de partage en clair, et les permissions des
 * fichiers de sauvegarde cessent d'être une formalité.
 *
 * `email` est UNIQUE, et c'est ce qui permet à l'insertion d'être idempotente
 * sans jamais avoir à DIRE si la ligne existait — voir
 * `app/lib/vitrine/liste-attente.server.ts` : le fait qu'une adresse figure
 * ou non sur cette liste ne doit se lire dans aucune réponse.
 */
export const interesse = pgTable("interesse", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});
