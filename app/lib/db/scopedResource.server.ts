// app/lib/db/scopedResource.server.ts
import type { InferSelectModel, SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../../db/client";

// Factorise le pattern répété par batiment/zone/systeme/element : charger une
// ressource dont la table porte directement proprieteId, ou 404 sinon (ne
// jamais distinguer "n'existe pas" de "n'est pas à vous", cf.
// proprieteAccess.server.ts). Le cas niveau (proprieteId atteint par jointure
// sur batiment) ne rentre pas dans cette forme et reste géré localement.
export async function chargerRessourceOu404<T extends PgTable>(
  table: T,
  condition: SQL | undefined,
  messageErreur: string,
): Promise<InferSelectModel<T>> {
  // `table` générique : drizzle ne peut pas résoudre .from() sur un type de
  // table non concret, d'où le cast local sur cette seule ligne.
  const [ligne] = await db.select().from(table as PgTable).where(condition);
  if (!ligne) throw new Response(messageErreur, { status: 404 });
  return ligne as InferSelectModel<T>;
}
