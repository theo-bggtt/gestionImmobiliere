// app/lib/partage/niveaux.server.ts
// Ce que le niveau d'un objet change, compté avant d'être produit.
//
// Deux écrans du PROPRIÉTAIRE lisent ce module, et aucun loader de `/p/:jeton`
// ne doit jamais le faire : ce qu'on compte ici, ce sont précisément les objets
// qu'un lien ne voit PAS. Un compte de ce qui est masqué dit qu'il existe des
// crans au-dessus, exactement comme une tuile « Local technique · 0 objet ».
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { element } from "../../db/schema/index";
import { clausePortee, PORTEE_PROPRIETAIRE, type Portee } from "../recherche/recherche.server";
import { porteeDuPartage, type Partage } from "./partage.server";

/**
 * La portée d'un lien, plafond retiré : « la zone et le système passent, quel
 * que soit le niveau ». Écrite avec `clausePortee` plutôt qu'à la main pour que
 * la règle de périmètre reste écrite une seule fois — c'est `niveauMax` seul
 * qui distingue les deux clauses, et c'est tout l'objet de ces comptes.
 */
const porteeSansPlafond = (portee: Portee): Portee => ({
  ...portee,
  niveauMax: PORTEE_PROPRIETAIRE.niveauMax,
});

export type ZoneAuDessus = { id: number; nom: string; total: number };

/**
 * Les objets que ce lien couvre par sa portée mais pas par son plafond.
 *
 * Sert le bandeau de l'aperçu — « 12 objets sont au-dessus du plafond » —, et
 * il est calculé ICI, par le loader de l'aperçu, jamais par
 * `chargerContenuPartage` : celui-ci est le loader réel de `/p/:jeton`, et
 * `tests/partage/routes.test.ts` compare les deux champ par champ.
 */
export async function compterObjetsAuDessusDuPlafond(p: Partage): Promise<{ total: number; zones: ZoneAuDessus[] }> {
  const portee = porteeDuPartage(p);
  const lignes = await db.execute<{ id: number; nom: string; total: number }>(sql`
    SELECT z.id, z.nom, count(*)::int AS total
    FROM element e
    JOIN zone z ON z.id = e.zone_id
    WHERE e.propriete_id = ${p.proprieteId}
      AND ${clausePortee(porteeSansPlafond(portee))}
      AND NOT (${clausePortee(portee)})
    GROUP BY z.id, z.nom
    ORDER BY count(*) DESC, z.nom
  `);
  const zones = lignes.rows;
  return { total: zones.reduce((somme, z) => somme + z.total, 0), zones };
}

export type EffetSurPartage = { id: number; nom: string; gagnes: number; perdus: number };

export type ApercuRenivelage = {
  cible: number;
  total: number;
  plusVisibles: number;
  plusMasques: number;
  partages: EffetSurPartage[];
};

/**
 * Ce que « tous les objets de cette zone en <niveau> » changerait, compté avant
 * de l'écrire. C'est l'écran du propriétaire : compter n'y divulgue rien, et
 * c'est le seul endroit où la conséquence se voit avant d'être produite.
 *
 * La zone est prise au pied de la lettre : une sous-zone (Jardin > Potager) est
 * une zone à part, avec son propre écran et sa propre action.
 */
export async function previsualiserRenivelage(
  proprieteId: number,
  zoneId: number,
  cible: number,
  partagesActifs: Partage[],
): Promise<ApercuRenivelage> {
  const [comptes] = (await db.execute<{ total: number; plus_visibles: number; plus_masques: number }>(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE e.niveau > ${cible})::int AS plus_visibles,
           count(*) FILTER (WHERE e.niveau < ${cible})::int AS plus_masques
    FROM element e
    WHERE e.propriete_id = ${proprieteId} AND e.zone_id = ${zoneId}
  `)).rows;

  const partages: EffetSurPartage[] = [];
  for (const p of partagesActifs) {
    const portee = porteeDuPartage(p);
    // Les objets de la zone que ce lien couvre par sa portée, séparés selon
    // qu'il les voit aujourd'hui ou non. Après l'action ils auront TOUS le même
    // niveau, donc le plafond seul décide, en bloc : ceux qu'il ne voyait pas
    // deviennent visibles si la cible passe sous le plafond, et ceux qu'il
    // voyait disparaissent si elle passe au-dessus.
    const [ligne] = (await db.execute<{ caches: number; visibles: number }>(sql`
      SELECT count(*) FILTER (WHERE NOT (${clausePortee(portee)}))::int AS caches,
             count(*) FILTER (WHERE ${clausePortee(portee)})::int AS visibles
      FROM element e
      WHERE e.propriete_id = ${proprieteId} AND e.zone_id = ${zoneId}
        AND ${clausePortee(porteeSansPlafond(portee))}
    `)).rows;

    const sousLePlafond = cible <= p.niveauMax;
    partages.push({
      id: p.id,
      nom: p.nom,
      gagnes: sousLePlafond ? ligne.caches : 0,
      perdus: sousLePlafond ? 0 : ligne.visibles,
    });
  }

  return {
    cible,
    total: comptes.total,
    plusVisibles: comptes.plus_visibles,
    plusMasques: comptes.plus_masques,
    partages,
  };
}

/** Rend le nombre d'objets écrits. Rejouable : le même niveau deux fois ne change rien. */
export async function appliquerRenivelage(proprieteId: number, zoneId: number, cible: number): Promise<number> {
  const ecrits = await db
    .update(element)
    .set({ niveau: cible, majLe: new Date() })
    .where(and(eq(element.proprieteId, proprieteId), eq(element.zoneId, zoneId)))
    .returning({ id: element.id });
  return ecrits.length;
}
