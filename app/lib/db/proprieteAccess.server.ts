// app/lib/db/proprieteAccess.server.ts
import { eq, and } from "drizzle-orm";
import { db } from "../../db/client";
import { propriete } from "../../db/schema/index";

export async function requireProprieteAccess(utilisateurId: number, proprieteIdParam: string | undefined) {
  const proprieteId = Number(proprieteIdParam);
  if (!proprieteIdParam || Number.isNaN(proprieteId)) {
    throw new Response("Propriété introuvable", { status: 404 });
  }

  const [ligne] = await db.select().from(propriete)
    .where(and(eq(propriete.id, proprieteId), eq(propriete.proprietaireId, utilisateurId)));

  if (!ligne) {
    // Le filtre de permission est dans la requête : ne jamais confirmer par
    // un écran "accès refusé" qu'une propriété existe pour quelqu'un d'autre.
    throw new Response("Propriété introuvable", { status: 404 });
  }

  return ligne;
}
