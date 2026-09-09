// app/lib/partage/contenu.server.ts
// Le contenu d'un partage : ce que le loader de `/p/:jeton` renvoie, et ce
// que la prévisualisation du propriétaire renvoie aussi. Un seul chemin de
// code — une maquette séparée dériverait du vrai rendu, et mentirait
// exactement le jour où ça compte.
//
// Toute requête écrite ici prend la portée du partage. Il n'y a pas de
// « petite » surface : un compte, une tuile de zone ou le nom d'un fichier
// disent quelque chose de la propriété.
import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import type { ChampDefinition } from "../forms/types";
import {
  chargerFacettes,
  chargerZonesVignettes,
  cheminZone,
  clausePortee,
  rechercher,
} from "../recherche/recherche.server";
import type { FacettesActives, FacettesDisponibles, ReponseRecherche, ZoneVignette } from "../recherche/types";
import { lireParamsRecherche, rechercheActive } from "../recherche/params";
import {
  chargerPlans,
  chargerPointsDuPlan,
  chargerPolygonesDuPlan,
  clausePlanVisible,
  etiqueter,
} from "../plans/plans.server";
import type { PlanEtiquete, PointPlan, PolygoneZone } from "../plans/types";
import { champsVisibles, type ChampRendu } from "./champs";
import { porteeDuPartage, type Partage } from "./partage.server";
import {
  chargerChronologie,
  chargerEvenementDetail,
  chargerEvenementsDeLElement,
  clauseEvenementVisible,
  compterEvenementsVisibles,
} from "../historique/historique.server";
import type { Chronologie } from "../historique/historique.server";
import { chargerGarantiesDeLElement } from "../historique/garanties.server";
import { lirePage } from "../historique/pagination";
import {
  estTypeEvenement,
  type EvenementDetail,
  type EvenementListe,
  type GarantieRendue,
  type TypeEvenement,
} from "../historique/types";

// Le nom du partage (« Jardinier Marc ») n'entre pas dans ces types : c'est
// l'étiquette privée du propriétaire, elle n'a rien à faire sur la page du
// destinataire. L'écran de prévisualisation la lit sur la ligne `partage`
// qu'il a déjà en main.
export type DonneesPartage = {
  proprieteNom: string;
  q: string;
  facettes: FacettesActives;
  /** true dès qu'un texte est tapé ou une facette cochée : on liste au lieu de la grille. */
  liste: boolean;
  recherche: ReponseRecherche;
  facettesDisponibles: FacettesDisponibles;
  zones: ZoneVignette[];
  /** Le sélecteur de niveau, vide dès qu'aucun plan n'est visible pour ce lien. */
  plans: PlanEtiquete[];
  plan: PlanAffiche | null;
  /** Zéro : pas d'entrée « Historique ». Une entrée vers une page vide dit
      qu'il existe un historique, comme une tuile « 0 objet » dit qu'il existe
      une zone. */
  nbEvenements: number;
};

/**
 * Le plan servi à un porteur de lien. Son étiquette vient du niveau et jamais
 * de `plan.nom` : le propriétaire y écrit ce qu'il veut, l'adresse comprise.
 */
export type PlanAffiche = {
  id: number;
  etiquette: string;
  imageFichierId: number | null;
  points: PointPlan[];
  polygones: PolygoneZone[];
};

export type FichePartage = {
  proprieteNom: string;
  id: number;
  nom: string;
  typeNom: string;
  zoneNom: string;
  zoneChemin: string;
  systemeNom: string | null;
  champs: ChampRendu[];
  photos: number[];
  /** L'historique de l'objet, filtré par `clauseEvenementVisible`. */
  evenements: EvenementListe[];
  /**
   * Les garanties de l'objet. `GarantieRendue` ne porte ni `reference` ni
   * document : la première est du texte libre, le second est du `cout` sous un
   * autre nom. Rien à filtrer ici, le type l'a déjà fait.
   */
  garanties: GarantieRendue[];
};

/** La chronologie servie à un lien, et le filtre par type qu'elle porte. */
export type HistoriquePartage = {
  proprieteNom: string;
  types: TypeEvenement[];
} & Chronologie;

/** Un événement déplié, servi à un lien. Ni `cout`, ni `niveau`. */
export type EvenementPartage = {
  proprieteNom: string;
} & EvenementDetail;

function idOu404(brut: string | undefined): number {
  const id = Number(brut);
  if (!Number.isInteger(id) || id <= 0) throw new Response("Introuvable", { status: 404 });
  return id;
}

/**
 * La page d'accueil d'un partage : grille de zones, ou résultats dès qu'on
 * cherche. Exactement les fonctions de l'étape 2, avec une portée non
 * triviale — c'était le pari de l'étape 2 et il tient : aucune de ces trois
 * requêtes ne change.
 */
export async function chargerContenuPartage(
  p: Partage,
  proprieteNom: string,
  url: URL,
): Promise<DonneesPartage> {
  const portee = porteeDuPartage(p);
  const { q, facettes, decalage } = lireParamsRecherche(url.searchParams);
  const liste = rechercheActive(q, facettes);

  const [recherche, facettesDisponibles, zones, nbEvenements] = await Promise.all([
    rechercher({ proprieteId: p.proprieteId, q, portee, facettes, decalage }),
    chargerFacettes(p.proprieteId, portee),
    chargerZonesVignettes(p.proprieteId, portee),
    compterEvenementsVisibles(p.proprieteId, portee),
  ]);

  // Le plan est la seconde entrée pour retrouver un objet, pas un filtre : il
  // accompagne la grille et s'efface dès qu'on cherche. Rien n'est donc chargé
  // pendant une recherche.
  const plans = liste ? [] : etiqueter(await chargerPlans(p.proprieteId, portee));

  return {
    proprieteNom,
    q,
    facettes,
    liste,
    recherche,
    facettesDisponibles,
    zones,
    plans,
    plan: await chargerPlanAffiche(p, plans, url.searchParams.get("plan")),
    nbEvenements,
  };
}

/**
 * Le plan demandé par l'URL, à condition qu'il figure dans la liste déjà
 * filtrée — sinon le premier. Un identifiant écrit à la main dans l'URL ne
 * peut donc pas servir un plan hors portée : il retombe sur le premier plan
 * visible, sans dire qu'il en existait un autre.
 */
async function chargerPlanAffiche(
  p: Partage,
  plans: PlanEtiquete[],
  demande: string | null,
): Promise<PlanAffiche | null> {
  if (plans.length === 0) return null;
  const choisi = plans.find((x) => x.id === Number(demande)) ?? plans[0];
  const portee = porteeDuPartage(p);

  const [complet] = await db.execute<{ imageFichierId: number | null }>(sql`
    SELECT image_fichier_id AS "imageFichierId"
    FROM plan
    WHERE id = ${choisi.id} AND propriete_id = ${p.proprieteId}
  `).then((r) => r.rows);

  const [points, polygones] = await Promise.all([
    chargerPointsDuPlan(p.proprieteId, choisi.id, portee),
    chargerPolygonesDuPlan(p.proprieteId, choisi.id, portee),
  ]);

  return {
    id: choisi.id,
    etiquette: choisi.etiquette,
    imageFichierId: complet?.imageFichierId ?? null,
    points,
    polygones,
  };
}

type LigneFiche = {
  id: number;
  nom: string;
  details: Record<string, unknown>;
  typeNom: string;
  champs: ChampDefinition[];
  zoneNom: string;
  batimentNom: string | null;
  niveauNom: string | null;
  systemeNom: string | null;
};

/**
 * Une fiche, si et seulement si elle passe le filtre. Filtrée = 404, jamais
 * 403 : un 403 confirmerait qu'elle existe.
 */
export async function chargerFichePartage(
  p: Partage,
  proprieteNom: string,
  elementIdBrut: string | undefined,
): Promise<FichePartage> {
  const elementId = idOu404(elementIdBrut);
  const portee = porteeDuPartage(p);

  const lignes = await db.execute<LigneFiche>(sql`
    SELECT
      e.id,
      e.nom,
      e.details,
      t.nom    AS "typeNom",
      t.champs AS "champs",
      z.nom    AS "zoneNom",
      b.nom    AS "batimentNom",
      n.nom    AS "niveauNom",
      s.nom    AS "systemeNom"
    FROM element e
    JOIN zone z ON z.id = e.zone_id
    JOIN type_element t ON t.id = e.type_id
    LEFT JOIN niveau n ON n.id = z.niveau_id
    LEFT JOIN batiment b ON b.id = n.batiment_id
    LEFT JOIN systeme s ON s.id = e.systeme_id
    WHERE e.id = ${elementId}
      AND e.propriete_id = ${p.proprieteId}
      AND ${clausePortee(portee)}
  `);

  const f = lignes.rows[0];
  if (!f) throw new Response("Introuvable", { status: 404 });

  // Les photos d'une fiche visible le sont aussi : c'est la fiche qui porte
  // la permission, `fichier.niveau` vaut 3 pour toute capture et masquerait
  // alors la totalité des photos de tous les partages.
  const photos = await db.execute<{ id: number }>(sql`
    SELECT f.id
    FROM fichier_lien fl
    JOIN fichier f ON f.id = fl.fichier_id
    WHERE fl.cible_type = 'element'
      AND fl.cible_id = ${elementId}
      AND f.propriete_id = ${p.proprieteId}
    ORDER BY f.date_prise DESC NULLS LAST, f.id DESC
  `);

  return {
    proprieteNom,
    id: f.id,
    nom: f.nom,
    typeNom: f.typeNom,
    zoneNom: f.zoneNom,
    zoneChemin: cheminZone(f),
    systemeNom: f.systemeNom,
    champs: champsVisibles(f.champs ?? [], f.details ?? {}, p.niveauMax),
    photos: photos.rows.map((l) => l.id),
    // L'historique de l'objet passe sa PROPRE clause, et non celle de la
    // fiche : un objet visible peut porter un événement qui déborde sur une
    // zone masquée, et c'est justement le cas que le quantificateur universel
    // ferme. Voir `clauseEvenementVisible`.
    evenements: await chargerEvenementsDeLElement(p.proprieteId, elementId, portee),
    // La garantie hérite de la visibilité de son élément — `element_id` est
    // NOT NULL — donc aucune clause propre, seulement `clausePortee` sur
    // l'élément joint. C'est l'inverse exact du problème de l'événement.
    garanties: await chargerGarantiesDeLElement(p.proprieteId, elementId, portee),
  };
}

/**
 * La chronologie d'un lien. Le filtre par type vient de l'URL, parce que la
 * page ne charge aucun script : un formulaire GET, des liens, rien d'autre.
 * Un type inconnu est ignoré et non rejeté — une URL bricolée ne mérite pas
 * une erreur, elle mérite la page entière.
 */
export async function chargerHistoriquePartage(
  p: Partage,
  proprieteNom: string,
  url: URL,
): Promise<HistoriquePartage> {
  const types = [...new Set(url.searchParams.getAll("type"))].filter(estTypeEvenement);
  const chronologie = await chargerChronologie(p.proprieteId, {
    portee: porteeDuPartage(p),
    types,
    page: lirePage(url.searchParams.get("page")),
  });
  return { proprieteNom, types, ...chronologie };
}

/** Un événement, si et seulement s'il passe le filtre. Filtré = 404. */
export async function chargerEvenementPartage(
  p: Partage,
  proprieteNom: string,
  evenementIdBrut: string | undefined,
): Promise<EvenementPartage> {
  const detail = await chargerEvenementDetail(p.proprieteId, idOu404(evenementIdBrut), porteeDuPartage(p));
  return { proprieteNom, ...detail };
}

type FichierServi = { id: number; chemin: string; typeMime: string };

/**
 * Premier droit : la photo d'une fiche. L'octet est lisible parce que la
 * FICHE à laquelle il est rattaché passe le filtre — au moins un élément lié.
 */
async function photoDUneFiche(p: Partage, fichierId: number): Promise<FichierServi | null> {
  const lignes = await db.execute<FichierServi>(sql`
    SELECT f.id, f.chemin, f.type_mime AS "typeMime"
    FROM fichier f
    WHERE f.id = ${fichierId}
      AND f.propriete_id = ${p.proprieteId}
      AND EXISTS (
        SELECT 1
        FROM fichier_lien fl
        JOIN element e ON e.id = fl.cible_id
        WHERE fl.fichier_id = f.id
          AND fl.cible_type = 'element'
          AND e.propriete_id = ${p.proprieteId}
          AND ${clausePortee(porteeDuPartage(p))}
      )
  `);
  return lignes.rows[0] ?? null;
}

/**
 * Second droit : l'image d'un plan. Un plan n'est rattaché par aucun
 * `fichier_lien` — son image pend à `plan.image_fichier_id` — donc le premier
 * droit lui répondrait 404. Ce qui l'autorise n'est pas une fiche mais le
 * PLAN lui-même, s'il est listé dans la portée du partage : exactement le
 * prédicat du sélecteur de niveau, `clausePlanVisible`, et non une seconde
 * écriture de la même idée.
 *
 * Deux fonctions et pas un `OR` dans une requête : les deux droits n'ont ni
 * la même origine ni la même durée de vie, et un `OR` rendrait impossible de
 * dire lequel a ouvert la porte.
 */
async function imageDUnPlan(p: Partage, fichierId: number): Promise<FichierServi | null> {
  const lignes = await db.execute<FichierServi>(sql`
    SELECT f.id, f.chemin, f.type_mime AS "typeMime"
    FROM fichier f
    JOIN plan pl ON pl.image_fichier_id = f.id
    WHERE f.id = ${fichierId}
      AND f.propriete_id = ${p.proprieteId}
      AND pl.propriete_id = ${p.proprieteId}
      AND ${clausePlanVisible(porteeDuPartage(p), sql.raw("pl"))}
    LIMIT 1
  `);
  return lignes.rows[0] ?? null;
}

/**
 * Troisième droit : la photo d'un événement. `fichier_lien` est polymorphe et
 * porte désormais `cible_type = 'evenement'` ; ce qui autorise l'octet n'est
 * ni une fiche ni un plan, mais l'ÉVÉNEMENT, s'il passe `clauseEvenementVisible`.
 *
 * Comme pour les deux autres, `fichier.niveau` est délibérément ignoré : la
 * capture y écrit toujours 3, le lire masquerait toutes les photos de tous les
 * partages. La permission est portée par ce à quoi le fichier est rattaché.
 *
 * Trois fonctions et pas un `OR` : on doit pouvoir dire lequel des trois
 * droits a ouvert la porte, et les trois n'ont ni la même origine ni la même
 * durée de vie.
 *
 * Il n'y a pas de quatrième branche pour `cible_type = 'intervenant'`, et
 * c'est une décision : ce qu'on attache à un artisan est une carte de visite
 * ou une facture, et une facture est du `cout` sous un autre nom. Les fichiers
 * d'un intervenant ne sortent d'aucun lien.
 */
async function photoDUnEvenement(p: Partage, fichierId: number): Promise<FichierServi | null> {
  const lignes = await db.execute<FichierServi>(sql`
    SELECT f.id, f.chemin, f.type_mime AS "typeMime"
    FROM fichier f
    WHERE f.id = ${fichierId}
      AND f.propriete_id = ${p.proprieteId}
      AND EXISTS (
        SELECT 1
        FROM fichier_lien fl
        JOIN evenement ev ON ev.id = fl.cible_id
        WHERE fl.fichier_id = f.id
          AND fl.cible_type = 'evenement'
          AND ev.propriete_id = ${p.proprieteId}
          AND ${clauseEvenementVisible(porteeDuPartage(p))}
      )
    LIMIT 1
  `);
  return lignes.rows[0] ?? null;
}

/**
 * Le droit de lire un octet d'image vient de la fiche qui le porte, du plan
 * dont il est l'image, ou de l'événement qu'il documente. Aucun des trois :
 * 404, jamais 403 — un 403 confirmerait l'existence du fichier.
 */
export async function chargerFichierPartage(p: Partage, fichierIdBrut: string | undefined) {
  const fichierId = idOu404(fichierIdBrut);
  const f =
    (await photoDUneFiche(p, fichierId)) ??
    (await imageDUnPlan(p, fichierId)) ??
    (await photoDUnEvenement(p, fichierId));
  if (!f) throw new Response("Introuvable", { status: 404 });
  return f;
}
