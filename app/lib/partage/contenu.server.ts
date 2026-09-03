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
import type { ChampDefinition } from "../../db/schema/types";
import {
  chargerFacettes,
  chargerZonesVignettes,
  cheminZone,
  clausePortee,
  rechercher,
} from "../recherche/recherche.server";
import type { FacettesActives, FacettesDisponibles, ReponseRecherche, ZoneVignette } from "../recherche/types";
import { lireParamsRecherche, rechercheActive } from "../recherche/params";
import { champsVisibles, type ChampRendu } from "./champs";
import { porteeDuPartage, type Partage } from "./partage.server";

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
};

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

  const [recherche, facettesDisponibles, zones] = await Promise.all([
    rechercher({ proprieteId: p.proprieteId, q, portee, facettes, decalage }),
    chargerFacettes(p.proprieteId, portee),
    chargerZonesVignettes(p.proprieteId, portee),
  ]);

  return {
    proprieteNom,
    q,
    facettes,
    liste: rechercheActive(q, facettes),
    recherche,
    facettesDisponibles,
    zones,
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
  };
}

/**
 * Le droit de lire un octet d'image vient de la fiche à laquelle il est
 * rattaché : au moins un élément lié doit passer le filtre. Un fichier
 * rattaché à une fiche filtrée répond 404, jamais 403.
 */
export async function chargerFichierPartage(p: Partage, fichierIdBrut: string | undefined) {
  const fichierId = idOu404(fichierIdBrut);
  const portee = porteeDuPartage(p);

  const lignes = await db.execute<{ id: number; chemin: string; typeMime: string }>(sql`
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
          AND ${clausePortee(portee)}
      )
  `);

  const f = lignes.rows[0];
  if (!f) throw new Response("Introuvable", { status: 404 });
  return f;
}
