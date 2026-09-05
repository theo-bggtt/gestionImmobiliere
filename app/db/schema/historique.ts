// app/db/schema/historique.ts
import {
  pgTable, serial, integer, text, date, numeric, smallint, primaryKey, check, index, pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propriete } from "./core";
import { element } from "./elements";
import { fichier } from "./fichiers";
import { TYPES_EVENEMENT } from "../../lib/historique/types";

/**
 * Liste fermée, définie une seule fois dans `app/lib/historique/types.ts` et
 * importée ici : le schéma importe la définition, jamais l'inverse (le module
 * neutre est lu par les écrans, l'y faire descendre y ferait descendre
 * drizzle). Même montage que `CHAMP_GENRES`.
 *
 * Ajouter une valeur demande une migration (`ALTER TYPE … ADD VALUE`), et
 * `autre` servira donc de fourre-tout en attendant. C'est le prix d'une
 * colonne qui ne peut pas porter d'adresse.
 */
export const evenementType = pgEnum("evenement_type", TYPES_EVENEMENT);

export const evenement = pgTable("evenement", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  titre: text("titre").notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  type: evenementType("type").notNull().default("autre"),
  // 0 public · 1 usage · 2 technique · 3 privé. Le plafond d'un partage se
  // compare à cette colonne, mais elle ne suffit pas : un événement pend à la
  // propriété et non à une zone, c'est `clauseEvenementVisible` qui le
  // rattache à la portée, par ses éléments liés.
  niveau: smallint("niveau").notNull().default(3),
  description: text("description"),
  // Ne sort d'AUCUN lien de partage, quel que soit le plafond : aucune requête
  // de partage ne sélectionne cette colonne.
  cout: numeric("cout", { precision: 10, scale: 2 }),
}, (table) => ({
  niveauValide: check("evenement_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
  proprieteIdx: index("idx_evenement_propriete").on(table.proprieteId),
  // La chronologie se lit par propriété, du plus récent au plus ancien.
  chronologieIdx: index("idx_evenement_chronologie").on(table.proprieteId, table.dateDebut),
}));

export const evenementElement = pgTable("evenement_element", {
  evenementId: integer("evenement_id").notNull().references(() => evenement.id, { onDelete: "cascade" }),
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.evenementId, table.elementId] }),
  // La clé primaire ne sert que le sens événement → éléments. L'historique
  // d'une fiche lit l'autre sens.
  elementIdx: index("idx_evenement_element_element").on(table.elementId),
}));

export const intervenant = pgTable("intervenant", {
  id: serial("id").primaryKey(),
  proprieteId: integer("propriete_id").notNull().references(() => propriete.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  metier: text("metier"),
  // Données personnelles d'un TIERS. Ces trois colonnes ne sont sélectionnées
  // par aucune requête de partage, quel que soit le plafond : le nom de
  // l'entreprise est un fait sur la maison, un numéro de téléphone est un
  // moyen de joindre quelqu'un qui n'a jamais accepté de figurer sur une URL.
  tel: text("tel"),
  email: text("email"),
  // Défaut à 3 : rien ne sort tant que le propriétaire ne l'a pas décidé,
  // intervenant par intervenant.
  niveau: smallint("niveau").notNull().default(3),
  notes: text("notes"),
}, (table) => ({
  niveauValide: check("intervenant_niveau_valide", sql`${table.niveau} BETWEEN 0 AND 3`),
  proprieteIdx: index("idx_intervenant_propriete").on(table.proprieteId),
}));

export const evenementIntervenant = pgTable("evenement_intervenant", {
  evenementId: integer("evenement_id").notNull().references(() => evenement.id, { onDelete: "cascade" }),
  intervenantId: integer("intervenant_id").notNull().references(() => intervenant.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.evenementId, table.intervenantId] }),
  intervenantIdx: index("idx_evenement_intervenant_intervenant").on(table.intervenantId),
}));

export const garantie = pgTable("garantie", {
  id: serial("id").primaryKey(),
  // NOT NULL : c'est ce qui donne à la garantie la visibilité de son élément,
  // sans clause propre. Elle n'a pas le problème d'`evenement`.
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
  evenementId: integer("evenement_id").references(() => evenement.id, { onDelete: "set null" }),
  debut: date("debut").notNull(),
  fin: date("fin"),
  reference: text("reference"),
  fichierId: integer("fichier_id").references(() => fichier.id, { onDelete: "set null" }),
});
