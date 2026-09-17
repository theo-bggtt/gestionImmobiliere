// app/lib/zones/deplacement.server.ts
// Changer une zone d'étage. Le geste se dit en une phrase — « la buanderie est
// au sous-sol, pas au rez » — et il touche trois choses dont deux ne se voient
// pas depuis le formulaire. C'est pour ça qu'il vit ici et non dans l'action.
//
// Ce qu'il ne touche PAS, et c'est délibéré : `element.zone_id`. Les objets
// suivent leur zone sans être réécrits, donc la portée d'un lien de partage
// (règle #1) se recalcule toute seule et rien n'entre ni ne sort d'un partage
// à l'insu de qui que ce soit. Les `point` non plus : un objet porte déjà un
// point par plan, y compris sur un plan d'un autre niveau (étape 4, « une
// colonne de chute traverse les étages »), donc un point laissé sur l'ancien
// plan est une pose ordinaire, pas une donnée devenue fausse.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { zone, zoneGeom } from "../../db/schema/index";
import { clauseCouverturePlan } from "../plans/plans.server";

/**
 * La zone et toute sa descendance, elle comprise.
 *
 * Une sous-zone SUIT sa zone parente, et ce n'est pas une commodité :
 * `chargerArbreZones` groupe les zones par niveau AVANT de reconstruire
 * l'arbre, donc un placard resté au rez sous une cuisine montée au premier ne
 * s'afficherait pas « mal rangé » — il s'afficherait comme une zone racine du
 * rez, détaché en silence. C'est exactement ce que `zoneParenteValide`
 * interdit à la création, tenu ici à la modification.
 */
export async function descendanceDeZone(proprieteId: number, zoneId: number): Promise<number[]> {
  const lignes = await db.execute<{ id: number }>(sql`
    WITH RECURSIVE descendance AS (
      SELECT id FROM zone WHERE id = ${zoneId} AND propriete_id = ${proprieteId}
      UNION ALL
      SELECT z.id FROM zone z JOIN descendance d ON z.parent_id = d.id
    )
    SELECT id FROM descendance
  `);
  return lignes.rows.map((l) => l.id);
}

/**
 * Le nouveau rattachement de la zone, de sa descendance, et le ménage des
 * contours que le déplacement rend faux. En une transaction : un déplacement à
 * moitié écrit laisserait des enfants à l'ancien étage, c'est-à-dire l'arbre
 * cassé que la fonction ci-dessus existe pour éviter.
 */
export async function deplacerZone(
  proprieteId: number,
  zoneId: number,
  niveauId: number | null,
  parentId: number | null,
) {
  const concernees = await descendanceDeZone(proprieteId, zoneId);
  const enfants = concernees.filter((id) => id !== zoneId);

  await db.transaction(async (tx) => {
    await tx
      .update(zone)
      .set({ niveauId, parentId })
      .where(and(eq(zone.id, zoneId), eq(zone.proprieteId, proprieteId)));

    // Les enfants changent d'étage et RIEN d'autre : leur `parentId` est ce qui
    // les tient ensemble, le réécrire aplatirait l'arbre qu'on déplace.
    if (enfants.length > 0) {
      await tx
        .update(zone)
        .set({ niveauId })
        .where(and(inArray(zone.id, enfants), eq(zone.proprieteId, proprieteId)));
    }

    // Un contour tracé sur le plan du rez ne devient pas seulement périmé quand
    // sa zone monte au premier : `chargerPolygonesDuPlan` ne filtre PAS par
    // couverture (son filtre est celui de la portée), donc `zoneDuPoint`
    // continuerait de proposer « Cuisine » pour un point posé sur le plan du
    // rez — c'est-à-dire de proposer d'écrire `element.zone_id` depuis une zone
    // qui n'est plus à cet étage. On efface plutôt qu'on ne filtre à la
    // lecture : un contour se retrace en quelques clics, et une géométrie
    // fausse qui dort en base est pire qu'une géométrie absente.
    //
    // `coalesce(…, false)` et pas seulement `NOT` : la couverture d'un plan
    // d'étage compare `z.niveau_id = p.niveau_id`, qui vaut NULL — et non
    // `false` — dès que la zone devient extérieure. `NOT NULL` vaut NULL, donc
    // sans cette enveloppe le contour le plus certainement faux des trois
    // serait le seul à survivre. Même piège, et même correction, que la
    // négation de `clausePortee` (voir `clauseEvenementVisible`).
    await tx.execute(sql`
      DELETE FROM zone_geom g
      USING plan p, zone z
      WHERE g.plan_id = p.id
        AND g.zone_id = z.id
        AND g.zone_id = ANY(${sql.param(concernees)}::int[])
        AND z.propriete_id = ${proprieteId}
        AND NOT coalesce(${clauseCouverturePlan()}, false)
    `);
  });
}
