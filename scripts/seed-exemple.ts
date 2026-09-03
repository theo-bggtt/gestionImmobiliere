// scripts/seed-exemple.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import pg from "pg";
import * as schema from "../app/db/schema/index";
import { hacherMotDePasse } from "../app/lib/auth/password.server";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const NOM_PROPRIETE = "Maison d'exemple";
const EMAIL_DEMO = "demo@gestion-immobiliere.local";
const MOT_DE_PASSE_DEMO = "demo1234";

async function idType(nom: string) {
  const [t] = await db.select().from(schema.typeElement)
    .where(and(eq(schema.typeElement.nom, nom), eq(schema.typeElement.origine, "systeme")));
  if (!t) throw new Error(`Type "${nom}" introuvable — lancer "npm run seed:catalogue" avant "npm run seed:exemple".`);
  return t.id;
}

async function main() {
  const [existe] = await db.select().from(schema.propriete).where(eq(schema.propriete.nom, NOM_PROPRIETE));
  if (existe) {
    console.log(`"${NOM_PROPRIETE}" existe déjà (id ${existe.id}) — rien à faire.`);
    await pool.end();
    return;
  }

  let [demo] = await db.select().from(schema.utilisateur).where(eq(schema.utilisateur.email, EMAIL_DEMO));
  if (!demo) {
    [demo] = await db.insert(schema.utilisateur).values({
      email: EMAIL_DEMO,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE_DEMO),
    }).returning();
    console.log(`Utilisateur de démonstration créé : ${EMAIL_DEMO} / ${MOT_DE_PASSE_DEMO} (À NE JAMAIS UTILISER EN PRODUCTION)`);
  }

  const [propriete] = await db.insert(schema.propriete).values({
    proprietaireId: demo.id,
    nom: NOM_PROPRIETE,
    adresse: "12 chemin des Vignes, 1260 Nyon",
  }).returning();

  const [maison] = await db.insert(schema.batiment).values({ proprieteId: propriete.id, nom: "Maison principale", type: "principal", ordre: 0 }).returning();
  const [garage] = await db.insert(schema.batiment).values({ proprieteId: propriete.id, nom: "Garage", type: "garage", ordre: 1 }).returning();

  const [cave] = await db.insert(schema.niveau).values({ batimentId: maison.id, nom: "Cave", ordinal: -1, ordre: 0 }).returning();
  const [rez] = await db.insert(schema.niveau).values({ batimentId: maison.id, nom: "Rez-de-chaussée", ordinal: 0, ordre: 1 }).returning();
  const [etage] = await db.insert(schema.niveau).values({ batimentId: maison.id, nom: "Étage", ordinal: 1, ordre: 2 }).returning();
  const [rezGarage] = await db.insert(schema.niveau).values({ batimentId: garage.id, nom: "Rez", ordinal: 0, ordre: 0 }).returning();

  const zonesInterieures = await db.insert(schema.zone).values([
    { proprieteId: propriete.id, niveauId: cave.id, nom: "Cave", type: "interieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: cave.id, nom: "Local technique", type: "technique", ordre: 1 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "Cuisine", type: "interieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "Salon", type: "interieur", ordre: 1 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "Entrée", type: "interieur", ordre: 2 },
    { proprieteId: propriete.id, niveauId: rez.id, nom: "WC", type: "interieur", ordre: 3 },
    { proprieteId: propriete.id, niveauId: etage.id, nom: "Chambre 1", type: "interieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: etage.id, nom: "Chambre 2", type: "interieur", ordre: 1 },
    { proprieteId: propriete.id, niveauId: etage.id, nom: "Salle de bain", type: "interieur", ordre: 2 },
    { proprieteId: propriete.id, niveauId: rezGarage.id, nom: "Garage", type: "interieur", ordre: 0 },
  ]).returning();

  const [jardin] = await db.insert(schema.zone).values({ proprieteId: propriete.id, niveauId: null, nom: "Jardin", type: "exterieur", ordre: 0 }).returning();
  const zonesExterieures = await db.insert(schema.zone).values([
    { proprieteId: propriete.id, niveauId: null, nom: "Potager", parentId: jardin.id, type: "exterieur", ordre: 0 },
    { proprieteId: propriete.id, niveauId: null, nom: "Terrasse", type: "exterieur", ordre: 1 },
  ]).returning();

  const zone = (nom: string) => [...zonesInterieures, jardin, ...zonesExterieures].find((z) => z.nom === nom)!;

  const [electricite, sanitaire, chauffage] = await db.insert(schema.systeme).values([
    { proprieteId: propriete.id, nom: "Électricité", icone: "zap" },
    { proprieteId: propriete.id, nom: "Sanitaire", icone: "droplet" },
    { proprieteId: propriete.id, nom: "Chauffage", icone: "flame" },
  ]).returning();

  // Le `niveau` de chaque fiche est explicite : 1 (usage) pour ce qu'un
  // locataire doit savoir faire marcher, 2 (technique) pour ce qui relève de
  // l'artisan. Sans cette répartition, toutes les fiches resteraient à 3
  // (privé, la valeur par défaut) et un lien de partage de niveau « usage »
  // — le cas le plus courant — ne montrerait rien du tout sur ce jeu.
  const elements: Array<{ nom: string; type: string; zoneNom: string; systemeId?: number; details?: Record<string, unknown>; niveau?: number }> = [
    { nom: "Prise plan de travail", type: "Prise 230V", zoneNom: "Cuisine", systemeId: electricite.id, niveau: 1 },
    { nom: "Interrupteur entrée cuisine", type: "Interrupteur", zoneNom: "Cuisine", systemeId: electricite.id, niveau: 1 },
    { nom: "Four encastrable", type: "Four", zoneNom: "Cuisine", details: { marque: "Bosch" }, niveau: 1 },
    { nom: "Hotte aspirante", type: "Hotte", zoneNom: "Cuisine", niveau: 1 },
    { nom: "Robinet évier", type: "Robinet", zoneNom: "Cuisine", systemeId: sanitaire.id, niveau: 1 },
    { nom: "Prise RJ45 salon", type: "Prise RJ45", zoneNom: "Salon", systemeId: electricite.id, niveau: 1 },
    { nom: "Luminaire suspension", type: "Luminaire", zoneNom: "Salon", systemeId: electricite.id, niveau: 1 },
    { nom: "Radiateur salon", type: "Radiateur", zoneNom: "Salon", systemeId: chauffage.id, niveau: 1 },
    { nom: "Porte d'entrée", type: "Porte", zoneNom: "Entrée", details: { materiau: "bois massif" }, niveau: 1 },
    { nom: "Tableau électrique principal", type: "Tableau électrique", zoneNom: "Local technique", systemeId: electricite.id, niveau: 2 },
    { nom: "Disjoncteur général", type: "Disjoncteur", zoneNom: "Local technique", systemeId: electricite.id, niveau: 2 },
    { nom: "Chaudière", type: "Chaudière", zoneNom: "Local technique", systemeId: chauffage.id, details: { type_energie: "gaz", marque: "Viessmann" }, niveau: 2 },
    { nom: "Vanne d'arrêt générale", type: "Vanne d'arrêt", zoneNom: "Local technique", systemeId: sanitaire.id, niveau: 2 },
    { nom: "Compteur d'eau", type: "Compteur d'eau", zoneNom: "Cave", systemeId: sanitaire.id, niveau: 2 },
    { nom: "Compteur électrique", type: "Compteur électrique", zoneNom: "Cave", systemeId: electricite.id, niveau: 2 },
    { nom: "Gaine technique cave-étage", type: "Gaine technique", zoneNom: "Cave", niveau: 2 },
    { nom: "Chauffe-eau", type: "Chauffe-eau", zoneNom: "Cave", systemeId: sanitaire.id, details: { volume: 200 }, niveau: 2 },
    { nom: "Prise établi", type: "Prise 230V", zoneNom: "Garage", systemeId: electricite.id, niveau: 1 },
    { nom: "Interrupteur portail", type: "Interrupteur", zoneNom: "Garage", systemeId: electricite.id, niveau: 1 },
    { nom: "Fenêtre chambre 1", type: "Fenêtre", zoneNom: "Chambre 1", details: { type_vitrage: "double" }, niveau: 1 },
    { nom: "Radiateur chambre 1", type: "Radiateur", zoneNom: "Chambre 1", systemeId: chauffage.id, niveau: 1 },
    { nom: "Fenêtre chambre 2", type: "Fenêtre", zoneNom: "Chambre 2", niveau: 1 },
    { nom: "Thermostat étage", type: "Thermostat", zoneNom: "Chambre 2", systemeId: chauffage.id, niveau: 1 },
    { nom: "Robinet salle de bain", type: "Robinet", zoneNom: "Salle de bain", systemeId: sanitaire.id, niveau: 1 },
    { nom: "Siphon douche", type: "Siphon", zoneNom: "Salle de bain", systemeId: sanitaire.id, niveau: 2 },
    { nom: "Bouche VMC salle de bain", type: "Bouche de VMC", zoneNom: "Salle de bain", niveau: 1 },
    { nom: "Vanne d'arrosage jardin", type: "Vanne d'arrosage", zoneNom: "Jardin", systemeId: sanitaire.id, niveau: 1 },
    { nom: "Programmateur d'arrosage", type: "Programmateur d'arrosage", zoneNom: "Local technique", systemeId: sanitaire.id, niveau: 2 },
    { nom: "Éclairage terrasse", type: "Éclairage extérieur", zoneNom: "Terrasse", systemeId: electricite.id, niveau: 1 },
    { nom: "Prise extérieure terrasse", type: "Prise extérieure", zoneNom: "Terrasse", systemeId: electricite.id, niveau: 1 },
    { nom: "Portail motorisé", type: "Portail motorisé", zoneNom: "Jardin", niveau: 1 },
  ];

  const elementsInseres: Record<string, number> = {};
  for (const e of elements) {
    const [inserted] = await db.insert(schema.element).values({
      proprieteId: propriete.id,
      nom: e.nom,
      typeId: await idType(e.type),
      zoneId: zone(e.zoneNom).id,
      systemeId: e.systemeId,
      niveau: e.niveau ?? 3,
      details: e.details ?? {},
    }).returning();
    elementsInseres[e.nom] = inserted.id;
  }

  const [plombier, electricien] = await db.insert(schema.intervenant).values([
    { proprieteId: propriete.id, nom: "Jean Dupont", metier: "Plombier", tel: "+41 79 000 00 00", niveau: 2 },
    { proprieteId: propriete.id, nom: "Atelier Martin", metier: "Électricien", tel: "+41 79 111 11 11", niveau: 2 },
  ]).returning();

  const [remplacementChauffeEau] = await db.insert(schema.evenement).values({
    proprieteId: propriete.id,
    titre: "Remplacement du chauffe-eau",
    dateDebut: "2024-03-12",
    dateFin: "2024-03-12",
    type: "renovation",
    description: "Ancien chauffe-eau remplacé après fuite.",
    cout: "1450.00",
  }).returning();

  await db.insert(schema.evenementElement).values({ evenementId: remplacementChauffeEau.id, elementId: elementsInseres["Chauffe-eau"] });
  await db.insert(schema.evenementIntervenant).values({ evenementId: remplacementChauffeEau.id, intervenantId: plombier.id });

  const [tableauElectrique] = await db.insert(schema.evenement).values({
    proprieteId: propriete.id,
    titre: "Mise aux normes du tableau électrique",
    dateDebut: "2023-09-01",
    dateFin: "2023-09-03",
    type: "renovation",
    description: "Ajout d'un différentiel 30mA et remplacement de deux disjoncteurs.",
    cout: "890.00",
  }).returning();

  await db.insert(schema.evenementElement).values({ evenementId: tableauElectrique.id, elementId: elementsInseres["Tableau électrique principal"] });
  await db.insert(schema.evenementIntervenant).values({ evenementId: tableauElectrique.id, intervenantId: electricien.id });

  console.log(`"${NOM_PROPRIETE}" créée (id ${propriete.id}) avec ${elements.length} éléments, 3 systèmes, 2 intervenants, 2 événements.`);
  await pool.end();
}

main();
