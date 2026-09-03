// app/lib/demarrage/creation.server.ts
// L'écriture du squelette : le seul moment où quoi que ce soit entre en base.
// Tout ce qui précède (les réponses, la proposition, les corrections) vit dans
// l'écran, ce qui rend la proposition annulable en fermant l'onglet.
import { z } from "zod";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau, propriete, zone } from "../../db/schema/index";
import {
  MAX_BATIMENTS,
  MAX_LONGUEUR_NOM,
  MAX_NIVEAUX_PAR_BATIMENT,
  MAX_ZONES,
  type SquelettePropose,
} from "./types";

const nom = z.string().trim().min(1).max(MAX_LONGUEUR_NOM);

const zoneSchema = z.object({
  nom,
  type: z.enum(["interieur", "exterieur", "annexe", "technique"]),
});

const niveauSchema = z.object({
  nom,
  // Entier SIGNÉ, borné : un ordinal est un rang de niveau, pas un entier libre.
  ordinal: z.number().int().min(-9).max(99),
  zones: z.array(zoneSchema).max(MAX_ZONES),
});

const batimentSchema = z.object({
  nom,
  type: z.enum(["principal", "annexe", "garage", "abri"]),
  niveaux: z.array(niveauSchema).max(MAX_NIVEAUX_PAR_BATIMENT),
});

/**
 * Ce que le serveur accepte. Il valide la structure REÇUE, il ne rejoue pas
 * `composerSquelette` : le propriétaire a corrigé entre les deux, et rejouer
 * la proposition écraserait précisément son travail.
 */
export const squeletteSchema = z
  .object({
    batiments: z.array(batimentSchema).max(MAX_BATIMENTS),
    zonesExterieures: z.array(zoneSchema).max(MAX_ZONES),
  })
  .refine(
    (s) =>
      s.batiments.reduce((n, b) => n + b.niveaux.reduce((m, x) => m + x.zones.length, 0), 0) +
        s.zonesExterieures.length <=
      MAX_ZONES,
    { message: "Trop de zones." },
  )
  .refine(
    (s) => s.batiments.some((b) => b.niveaux.length > 0) || s.zonesExterieures.length > 0,
    { message: "Un squelette vide n'a rien à écrire." },
  );

export type ResultatCreation =
  | { statut: "cree"; batiments: number; niveaux: number; zones: number }
  /** La propriété portait déjà une structure : voir `ecrireSquelette`. */
  | { statut: "deja-structuree" }
  | { statut: "invalide"; message: string };

/**
 * Écrit le squelette, une fois, en une transaction.
 *
 * **Rejouabilité : garde applicative, pas contrainte.** Le squelette produit
 * des lignes ordinaires de `batiment`, `niveau` et `zone`, indiscernables de
 * celles créées à la main — il n'y a donc rien à rendre unique. Une contrainte
 * devrait porter sur quelque chose : `UNIQUE (propriete_id, nom)` sur `zone`
 * interdirait deux « Chambre 1 » dans deux bâtiments, ce qui est légitime, et
 * une colonne `issu_du_squelette` marquerait la donnée pour un besoin qui
 * n'existe qu'à l'instant de la création. La condition juste est « cette
 * propriété n'a encore aucune structure », elle se lit en une requête, et elle
 * est vraie pour tous les chemins d'entrée. Même raisonnement que
 * l'idempotence de `seed-exemple.ts`, gardée sur le nom de la propriété.
 *
 * Le `FOR UPDATE` sur la ligne `propriete` sérialise deux soumissions
 * concurrentes : sans lui, un double-clic ouvre deux transactions qui voient
 * chacune zéro bâtiment et écrivent chacune un squelette complet.
 */
export async function ecrireSquelette(
  proprieteId: number,
  propose: SquelettePropose | unknown,
): Promise<ResultatCreation> {
  const valide = squeletteSchema.safeParse(propose);
  if (!valide.success) {
    return { statut: "invalide", message: valide.error.issues[0]?.message ?? "Structure invalide." };
  }
  const squelette = valide.data;

  return db.transaction(async (tx) => {
    await tx.select({ id: propriete.id }).from(propriete).where(eq(propriete.id, proprieteId)).for("update");

    const [{ batiments: dejaBatiments }] = await tx
      .select({ batiments: count() })
      .from(batiment)
      .where(eq(batiment.proprieteId, proprieteId));
    const [{ zones: dejaZones }] = await tx
      .select({ zones: count() })
      .from(zone)
      .where(eq(zone.proprieteId, proprieteId));

    if (dejaBatiments > 0 || dejaZones > 0) return { statut: "deja-structuree" as const };

    let niveauxCrees = 0;
    let zonesCreees = 0;

    for (const [ordreBatiment, b] of squelette.batiments.entries()) {
      const [batimentCree] = await tx
        .insert(batiment)
        .values({ proprieteId, nom: b.nom, type: b.type, ordre: ordreBatiment })
        .returning({ id: batiment.id });

      // `ordre` suit l'ordinal, pas l'ordre de saisie : c'est l'ordinal qui
      // range les niveaux (règle non négociable #11), et les deux colonnes
      // doivent raconter la même histoire.
      const niveauxTries = [...b.niveaux].sort((x, y) => x.ordinal - y.ordinal);

      for (const [ordreNiveau, n] of niveauxTries.entries()) {
        const [niveauCree] = await tx
          .insert(niveau)
          .values({ batimentId: batimentCree.id, nom: n.nom, ordinal: n.ordinal, ordre: ordreNiveau })
          .returning({ id: niveau.id });
        niveauxCrees += 1;

        if (n.zones.length === 0) continue;
        await tx.insert(zone).values(
          n.zones.map((z, ordre) => ({
            proprieteId,
            niveauId: niveauCree.id,
            nom: z.nom,
            type: z.type,
            ordre,
          })),
        );
        zonesCreees += n.zones.length;
      }
    }

    if (squelette.zonesExterieures.length > 0) {
      // `niveauId` nul : le seul cas admis par le schéma, et ce qui donne au
      // partage au jardinier quelque chose à montrer.
      await tx.insert(zone).values(
        squelette.zonesExterieures.map((z, ordre) => ({
          proprieteId,
          niveauId: null,
          nom: z.nom,
          type: z.type,
          ordre,
        })),
      );
      zonesCreees += squelette.zonesExterieures.length;
    }

    return {
      statut: "cree" as const,
      batiments: squelette.batiments.length,
      niveaux: niveauxCrees,
      zones: zonesCreees,
    };
  });
}

/**
 * Vrai quand la propriété n'a encore ni bâtiment ni zone. C'est la même
 * condition que la garde d'écriture, lue avant d'afficher l'écran : proposer
 * un squelette à une propriété déjà meublée n'aurait pas de sens.
 */
export async function proprieteEstVierge(proprieteId: number): Promise<boolean> {
  const [ligne] = await db
    .select({
      batiments: sql<number>`(select count(*) from ${batiment} where ${batiment.proprieteId} = ${proprieteId})`,
      zones: sql<number>`(select count(*) from ${zone} where ${zone.proprieteId} = ${proprieteId})`,
    })
    .from(propriete)
    .where(and(eq(propriete.id, proprieteId)));

  return Number(ligne?.batiments ?? 0) === 0 && Number(ligne?.zones ?? 0) === 0;
}
