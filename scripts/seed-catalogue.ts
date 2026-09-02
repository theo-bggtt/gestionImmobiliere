// scripts/seed-catalogue.ts
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../app/db/schema/index";
import type { ChampDefinition } from "../app/db/schema/types";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

export type Entree = { nom: string; icone: string; champs: ChampDefinition[]; alias: string[] };

export const champ = (partial: Omit<ChampDefinition, "niveauMin" | "obligatoire"> & { niveauMin?: number; obligatoire?: boolean }): ChampDefinition => ({
  niveauMin: partial.niveauMin ?? 1,
  obligatoire: partial.obligatoire ?? false,
  ...partial,
});

export const CATALOGUE: Entree[] = [
  // ── Intérieur ──────────────────────────────────────────────────────
  { nom: "Prise 230V", icone: "power-plug", alias: ["prise", "prise électrique", "prise de courant"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "circuit", label: "Circuit / disjoncteur", genre: "texte", niveauMin: 2 }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Prise RJ45", icone: "network", alias: ["prise réseau", "prise ethernet", "prise informatique"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "brasse_vers", label: "Brassée vers", genre: "texte", niveauMin: 2, unite: "panneau de brassage / baie" }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Interrupteur", icone: "toggle-left", alias: ["interrupteur", "va-et-vient", "variateur"], champs: [
    champ({ cle: "type_interrupteur", label: "Type", genre: "choix", options: ["simple", "va-et-vient", "variateur", "détecteur"] }),
    champ({ cle: "commande", label: "Commande quoi", genre: "texte" }),
  ]},
  { nom: "Tableau électrique", icone: "layout-grid", alias: ["tableau électrique", "disjoncteur général", "coffret électrique"], champs: [
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "nombre_disjoncteurs", label: "Nombre de disjoncteurs", genre: "nombre", niveauMin: 2 }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
  ]},
  { nom: "Disjoncteur", icone: "circle-power", alias: ["disjoncteur", "fusible", "coupe-circuit"], champs: [
    champ({ cle: "calibre", label: "Calibre", genre: "nombre", unite: "A", niveauMin: 2 }),
    champ({ cle: "type", label: "Type", genre: "choix", niveauMin: 2, options: ["différentiel", "magnétothermique"] }),
    champ({ cle: "circuit_protege", label: "Circuit protégé", genre: "texte" }),
  ]},
  { nom: "Luminaire", icone: "lightbulb", alias: ["luminaire", "lampe", "plafonnier", "applique"], champs: [
    champ({ cle: "type_ampoule", label: "Type d'ampoule", genre: "texte" }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "W" }),
    champ({ cle: "commande", label: "Commandé par", genre: "texte" }),
  ]},
  { nom: "Vanne d'arrêt", icone: "droplet", alias: ["robinet", "arrêt d'eau", "stop-eau", "vanne"], champs: [
    champ({ cle: "reseau", label: "Réseau", genre: "choix", options: ["eau froide", "eau chaude", "gaz"] }),
    champ({ cle: "coupe_quoi", label: "Coupe quoi", genre: "texte", niveauMin: 2 }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Robinet", icone: "droplet", alias: ["mitigeur", "robinetterie"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["mitigeur", "mélangeur", "simple"] }),
    champ({ cle: "notes", label: "Notes", genre: "texte" }),
  ]},
  { nom: "Siphon", icone: "droplet", alias: ["bonde", "évacuation", "siphon de sol"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "diametre", label: "Diamètre", genre: "nombre", unite: "mm", niveauMin: 2 }),
  ]},
  { nom: "Chauffe-eau", icone: "flame", alias: ["ballon d'eau chaude", "cumulus", "boiler"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["électrique", "thermodynamique", "gaz", "solaire"] }),
    champ({ cle: "volume", label: "Volume", genre: "nombre", unite: "L" }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
    champ({ cle: "numero_serie", label: "Numéro de série", genre: "texte", niveauMin: 2 }),
    champ({ cle: "garantie_jusquau", label: "Garantie jusqu'au", genre: "date" }),
  ]},
  { nom: "Chaudière", icone: "flame", alias: ["chaudière", "chauffage central"], champs: [
    champ({ cle: "type_energie", label: "Énergie", genre: "choix", options: ["gaz", "fioul", "bois", "pompe à chaleur", "électrique"] }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "kW" }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "modele", label: "Modèle", genre: "texte" }),
    champ({ cle: "numero_serie", label: "Numéro de série", genre: "texte", niveauMin: 2 }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
    champ({ cle: "dernier_entretien", label: "Dernier entretien", genre: "date", niveauMin: 2 }),
  ]},
  { nom: "Radiateur", icone: "thermometer", alias: ["radiateur", "chauffage"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["eau chaude", "électrique", "sèche-serviettes"] }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "W" }),
  ]},
  { nom: "Thermostat", icone: "thermometer", alias: ["thermostat", "régulateur de température"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["filaire", "connecté", "mécanique"] }),
    champ({ cle: "zone_regulee", label: "Zone régulée", genre: "texte" }),
  ]},
  { nom: "Bouche de VMC", icone: "wind", alias: ["ventilation", "VMC", "bouche d'aération", "extraction d'air"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["entrée d'air", "extraction"] }),
    champ({ cle: "zone_desservie", label: "Zone desservie", genre: "texte" }),
  ]},
  { nom: "Lave-linge", icone: "washing-machine", alias: ["machine à laver", "lave-linge"], champs: [
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "modele", label: "Modèle", genre: "texte" }),
    champ({ cle: "date_achat", label: "Date d'achat", genre: "date" }),
    champ({ cle: "garantie_jusquau", label: "Garantie jusqu'au", genre: "date" }),
  ]},
  { nom: "Lave-vaisselle", icone: "washing-machine", alias: ["lave-vaisselle"], champs: [
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "modele", label: "Modèle", genre: "texte" }),
    champ({ cle: "date_achat", label: "Date d'achat", genre: "date" }),
    champ({ cle: "garantie_jusquau", label: "Garantie jusqu'au", genre: "date" }),
  ]},
  { nom: "Four", icone: "cooking-pot", alias: ["four", "four encastrable"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["encastrable", "pose libre", "vapeur", "micro-ondes combiné"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "date_achat", label: "Date d'achat", genre: "date" }),
  ]},
  { nom: "Hotte", icone: "fan", alias: ["hotte", "hotte aspirante", "extracteur de cuisine"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["aspirante", "recyclage"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
  ]},
  { nom: "Porte", icone: "door-open", alias: ["porte", "porte d'entrée", "porte-fenêtre"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["intérieure", "extérieure", "blindée", "coulissante"] }),
    champ({ cle: "materiau", label: "Matériau", genre: "texte" }),
    champ({ cle: "a_une_serrure", label: "A une serrure", genre: "booleen" }),
  ]},
  { nom: "Fenêtre", icone: "square", alias: ["fenêtre", "châssis", "baie vitrée"], champs: [
    champ({ cle: "type_vitrage", label: "Vitrage", genre: "choix", options: ["simple", "double", "triple"] }),
    champ({ cle: "materiau_cadre", label: "Matériau du cadre", genre: "texte" }),
    champ({ cle: "annee_pose", label: "Année de pose", genre: "date" }),
  ]},
  { nom: "Compteur électrique", icone: "gauge", alias: ["compteur électrique", "compteur EDF", "compteur d'électricité"], champs: [
    champ({ cle: "numero_compteur", label: "Numéro de compteur", genre: "texte", niveauMin: 2 }),
    champ({ cle: "fournisseur", label: "Fournisseur", genre: "texte" }),
    champ({ cle: "puissance_souscrite", label: "Puissance souscrite", genre: "nombre", unite: "kVA" }),
  ]},
  { nom: "Compteur d'eau", icone: "gauge", alias: ["compteur d'eau", "compteur d'eau froide"], champs: [
    champ({ cle: "numero_compteur", label: "Numéro de compteur", genre: "texte", niveauMin: 2 }),
    champ({ cle: "fournisseur", label: "Fournisseur", genre: "texte" }),
  ]},
  { nom: "Gaine technique", icone: "route", alias: ["gaine", "gaine technique", "chemin de câbles", "colonne montante"], champs: [
    champ({ cle: "contenu", label: "Contenu", genre: "texte", niveauMin: 2 }),
    champ({ cle: "trajet", label: "Trajet", genre: "texte", niveauMin: 2 }),
  ]},
  // ── Extérieur ──────────────────────────────────────────────────────
  { nom: "Vanne d'arrosage", icone: "droplet", alias: ["vanne d'arrosage", "électrovanne", "arrosage"], champs: [
    champ({ cle: "zone_arrosee", label: "Zone arrosée", genre: "texte" }),
    champ({ cle: "type", label: "Type", genre: "choix", options: ["manuelle", "électrovanne"] }),
  ]},
  { nom: "Programmateur d'arrosage", icone: "clock", alias: ["programmateur", "programmateur d'arrosage", "minuterie d'arrosage"], champs: [
    champ({ cle: "nombre_zones", label: "Nombre de zones", genre: "nombre" }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
  ]},
  { nom: "Éclairage extérieur", icone: "lightbulb", alias: ["éclairage extérieur", "spot extérieur", "luminaire extérieur"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["spot", "borne", "guirlande", "détecteur de mouvement"] }),
    champ({ cle: "commande", label: "Commandé par", genre: "texte" }),
  ]},
  { nom: "Portail motorisé", icone: "door-open", alias: ["portail", "portail électrique", "portail automatique"], champs: [
    champ({ cle: "type_motorisation", label: "Motorisation", genre: "choix", options: ["battant", "coulissant"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "telecommandes", label: "Nombre de télécommandes", genre: "nombre" }),
  ]},
  { nom: "Clôture", icone: "fence", alias: ["clôture", "grillage", "haie", "mur de clôture"], champs: [
    champ({ cle: "materiau", label: "Matériau", genre: "texte" }),
    champ({ cle: "hauteur", label: "Hauteur", genre: "nombre", unite: "m" }),
    champ({ cle: "longueur", label: "Longueur", genre: "nombre", unite: "m" }),
  ]},
  { nom: "Regard", icone: "square", alias: ["regard", "regard d'égout", "tampon"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["eaux usées", "eaux pluviales", "mixte"] }),
    champ({ cle: "profondeur", label: "Profondeur", genre: "nombre", unite: "cm", niveauMin: 2 }),
  ]},
  { nom: "Fosse", icone: "container", alias: ["fosse septique", "fosse toutes eaux", "assainissement"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["septique", "toutes eaux", "étanche"] }),
    champ({ cle: "volume", label: "Volume", genre: "nombre", unite: "L" }),
    champ({ cle: "derniere_vidange", label: "Dernière vidange", genre: "date" }),
  ]},
  { nom: "Pompe à chaleur extérieure", icone: "fan", alias: ["pompe à chaleur", "PAC", "unité extérieure"], champs: [
    champ({ cle: "type", label: "Type", genre: "choix", options: ["air-eau", "air-air"] }),
    champ({ cle: "marque", label: "Marque", genre: "texte" }),
    champ({ cle: "puissance", label: "Puissance", genre: "nombre", unite: "kW" }),
    champ({ cle: "date_installation", label: "Date d'installation", genre: "date" }),
  ]},
  { nom: "Prise extérieure", icone: "power-plug", alias: ["prise extérieure", "prise de jardin"], champs: [
    champ({ cle: "emplacement", label: "Emplacement", genre: "texte" }),
    champ({ cle: "etanche", label: "Étanche", genre: "booleen" }),
  ]},
  { nom: "Cuve", icone: "container", alias: ["cuve", "citerne", "réservoir"], champs: [
    champ({ cle: "contenu", label: "Contenu", genre: "choix", options: ["eau de pluie", "fioul", "gaz"] }),
    champ({ cle: "volume", label: "Volume", genre: "nombre", unite: "L" }),
  ]},
];

async function main() {
  const valeurs = CATALOGUE.map((entree) => ({
    nom: entree.nom,
    icone: entree.icone,
    origine: "systeme" as const,
    champs: entree.champs,
    alias: entree.alias,
  }));

  // ON CONFLICT (nom) WHERE origine = 'systeme' cible précisément l'index
  // unique PARTIEL de Task 2 (idx_type_element_nom_systeme_unique). Un index
  // partiel ne peut pas être ciblé par "ON CONFLICT ON CONSTRAINT" (réservé
  // aux contraintes) : la syntaxe target + where est la bonne ici.
  const inserees = await db
    .insert(schema.typeElement)
    .values(valeurs)
    .onConflictDoNothing({ target: schema.typeElement.nom, where: sql`${schema.typeElement.origine} = 'systeme'` })
    .returning({ nom: schema.typeElement.nom });

  console.log(`Catalogue : ${inserees.length} nouveaux types sur ${CATALOGUE.length} (le reste existait déjà).`);
  await pool.end();
}

// Only run main() when the script is executed directly, not when imported
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
