// app/db/schema/partage.ts
import { pgTable, serial, integer, text, smallint, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";
import { intervenant } from "./historique";

export const partage = pgTable("partage", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  // À qui ce lien a été donné, quand c'est quelqu'un du carnet. Nullable : un
  // lien peut viser un voisin de passage qui n'y figure pas, et le carnet n'a
  // pas à se remplir pour partager.
  //
  // `SET NULL` et non `CASCADE` : retirer le plombier du carnet ne doit pas
  // effacer la trace de ce qui lui a été ouvert. C'est le même raisonnement que
  // `revoqueLe`, daté et jamais supprimé — la trace de ce qui a été partagé, et
  // à qui, est précisément ce qu'on garde.
  intervenantId: integer("intervenant_id").references(() => intervenant.id, { onDelete: "set null" }),
  jeton: text("jeton").notNull().unique(),
  niveauMax: smallint("niveau_max").notNull(),
  porteeZones: integer("portee_zones").array().notNull().default(sql`'{}'::integer[]`),
  porteeSystemes: integer("portee_systemes").array().notNull().default(sql`'{}'::integer[]`),
  expireLe: timestamp("expire_le", { withTimezone: true }),
  revoqueLe: timestamp("revoque_le", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  niveauMaxValide: check("partage_niveau_max_valide", sql`${table.niveauMax} BETWEEN 0 AND 3`),
  // Le seul sens de lecture est « les liens de cette personne », depuis sa
  // fiche du carnet.
  intervenantIdx: index("idx_partage_intervenant").on(table.intervenantId),
}));
