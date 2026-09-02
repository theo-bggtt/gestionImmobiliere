// app/lib/zoneTree.ts
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { batiment, niveau, zone } from "../db/schema/index";

export type ZoneAvecEnfants = typeof zone.$inferSelect & { enfants: ZoneAvecEnfants[] };

function grouperParParent(zones: (typeof zone.$inferSelect)[]): ZoneAvecEnfants[] {
  const parId = new Map<number, ZoneAvecEnfants>();
  for (const z of zones) parId.set(z.id, { ...z, enfants: [] });

  const racines: ZoneAvecEnfants[] = [];
  for (const z of parId.values()) {
    if (z.parentId && parId.has(z.parentId)) {
      parId.get(z.parentId)!.enfants.push(z);
    } else {
      racines.push(z);
    }
  }
  return racines;
}

export async function chargerArbreZones(proprieteId: number) {
  const batiments = await db.select().from(batiment).where(eq(batiment.proprieteId, proprieteId)).orderBy(asc(batiment.ordre));
  const idsBatiments = batiments.map((b) => b.id);

  const niveaux = idsBatiments.length
    ? await db.select().from(niveau).where(inArray(niveau.batimentId, idsBatiments)).orderBy(asc(niveau.ordinal))
    : [];

  const zones = await db.select().from(zone).where(eq(zone.proprieteId, proprieteId)).orderBy(asc(zone.ordre));

  const arbre = batiments.map((b) => ({
    batiment: b,
    niveaux: niveaux
      .filter((n) => n.batimentId === b.id)
      .map((n) => ({
        niveau: n,
        zones: grouperParParent(zones.filter((z) => z.niveauId === n.id)),
      })),
  }));

  // niveauId NULL = zone extérieure (le seul cas où il est nul), rattachée
  // à la propriété et non à un niveau.
  const zonesExterieures = grouperParParent(zones.filter((z) => z.niveauId === null));

  return { arbre, zonesExterieures };
}
