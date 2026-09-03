// app/lib/capture/instantane.server.ts
import { desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, zone } from "../../db/schema/index";
import { chargerArbreZones, type ZoneAvecEnfants } from "../zoneTree";
import type { InstantaneCapture, ZoneCapture } from "./types";

// La liste d'objets sert au cas B (photo sur un objet existant) et voyage
// dans IndexedDB : on la borne pour ne pas transformer la boîte d'envoi en
// copie de la base.
const MAX_ELEMENTS = 300;

function aplatirZones(zones: ZoneAvecEnfants[], prefixe: string, sortie: ZoneCapture[]) {
  for (const z of zones) {
    sortie.push({ id: z.id, nom: z.nom, chemin: prefixe });
    if (z.enfants.length) aplatirZones(z.enfants, `${prefixe} · ${z.nom}`, sortie);
  }
}

export async function chargerInstantaneCapture(proprieteId: number, proprieteNom: string): Promise<InstantaneCapture> {
  const [arbre, types, usages, elements] = await Promise.all([
    chargerArbreZones(proprieteId),
    db
      .select({ id: typeElement.id, nom: typeElement.nom, alias: typeElement.alias })
      .from(typeElement)
      .where(or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, proprieteId))),
    // Une seule agrégation sert les trois classements construits plus bas.
    db
      .select({
        zoneId: element.zoneId,
        typeId: element.typeId,
        nombre: sql<number>`count(*)::int`,
        dernier: sql<string>`max(${element.creeLe})`,
      })
      .from(element)
      .where(eq(element.proprieteId, proprieteId))
      .groupBy(element.zoneId, element.typeId)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ id: element.id, nom: element.nom, zoneNom: zone.nom })
      .from(element)
      .innerJoin(zone, eq(element.zoneId, zone.id))
      .where(eq(element.proprieteId, proprieteId))
      .orderBy(desc(element.majLe))
      .limit(MAX_ELEMENTS),
  ]);

  const zones: ZoneCapture[] = [];
  for (const { batiment, niveaux } of arbre.arbre) {
    for (const { niveau, zones: zonesNiveau } of niveaux) {
      aplatirZones(zonesNiveau, `${batiment.nom} · ${niveau.nom}`, zones);
    }
  }
  aplatirZones(arbre.zonesExterieures, "Extérieur", zones);

  const typesParZone: Record<string, number[]> = {};
  const derniereParZone = new Map<number, string>();
  const derniereParType = new Map<number, string>();

  // `usages` arrive déjà trié par fréquence décroissante : empiler suffit.
  for (const u of usages) {
    (typesParZone[u.zoneId] ??= []).push(u.typeId);
    const zonePrec = derniereParZone.get(u.zoneId);
    if (!zonePrec || u.dernier > zonePrec) derniereParZone.set(u.zoneId, u.dernier);
    const typePrec = derniereParType.get(u.typeId);
    if (!typePrec || u.dernier > typePrec) derniereParType.set(u.typeId, u.dernier);
  }

  const parRecence = (m: Map<number, string>) =>
    [...m.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)).map(([id]) => id);

  return {
    proprieteId,
    proprieteNom,
    genereLe: new Date().toISOString(),
    zones,
    types: types.sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    elements,
    zonesRecentes: parRecence(derniereParZone),
    typesRecents: parRecence(derniereParType),
    typesParZone,
  };
}
