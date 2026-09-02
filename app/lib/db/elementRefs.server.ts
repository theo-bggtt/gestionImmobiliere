// app/lib/db/elementRefs.server.ts
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { zone, systeme } from "../../db/schema/index";

// Un élément référence sa zone et (optionnellement) son système par id brut
// venu du formulaire : jamais de confiance sans revérifier que la ligne
// appartient bien à la propriété courante (sinon un id d'une autre
// propriété s'attache silencieusement à cet élément).
export async function zoneAppartientALaPropriete(proprieteId: number, zoneId: number) {
  const [ligne] = await db.select({ id: zone.id }).from(zone)
    .where(and(eq(zone.id, zoneId), eq(zone.proprieteId, proprieteId)));
  return Boolean(ligne);
}

export async function systemeAppartientALaPropriete(proprieteId: number, systemeId: number) {
  const [ligne] = await db.select({ id: systeme.id }).from(systeme)
    .where(and(eq(systeme.id, systemeId), eq(systeme.proprieteId, proprieteId)));
  return Boolean(ligne);
}
