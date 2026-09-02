// app/db/schema/historique.ts
import { pgTable, serial, integer, text, date, numeric, smallint, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";
import { element } from "./elements";
import { fichier } from "./fichiers";

export const evenement = pgTable("evenement", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  titre: text("titre").notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  // Pas de liste fermée fournie par la spécification pour ce champ : texte libre.
  type: text("type"),
  niveau: smallint("niveau").notNull().default(3),
  description: text("description"),
  cout: numeric("cout", { precision: 10, scale: 2 }),
}, (table) => ({
  niveauValide: check("evenement_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
}));

export const evenementElement = pgTable("evenement_element", {
  evenementId: integer("evenement_id").notNull().references(() => evenement.id, { onDelete: "cascade" }),
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.evenementId, table.elementId] }),
}));

export const intervenant = pgTable("intervenant", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  metier: text("metier"),
  tel: text("tel"),
  email: text("email"),
  niveau: smallint("niveau").notNull().default(3),
  notes: text("notes"),
}, (table) => ({
  niveauValide: check("intervenant_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
}));

export const evenementIntervenant = pgTable("evenement_intervenant", {
  evenementId: integer("evenement_id").notNull().references(() => evenement.id, { onDelete: "cascade" }),
  intervenantId: integer("intervenant_id").notNull().references(() => intervenant.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.evenementId, table.intervenantId] }),
}));

export const garantie = pgTable("garantie", {
  id: serial("id").primaryKey(),
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
  evenementId: integer("evenement_id").references(() => evenement.id, { onDelete: "set null" }),
  debut: date("debut").notNull(),
  fin: date("fin"),
  reference: text("reference"),
  fichierId: integer("fichier_id").references(() => fichier.id, { onDelete: "set null" }),
});
