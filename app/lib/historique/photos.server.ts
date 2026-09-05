// app/lib/historique/photos.server.ts
// L'attachement d'une photo à un événement.
//
// La PR 1 a livré les DEUX lectures — `chargerPhotosDeLEvenement` et le droit
// `photoDUnEvenement` de la route à jeton — sans jamais écrire la ligne
// qu'elles lisent : aucun `fichier_lien` ne portait `cible_type =
// 'evenement'`. Le chemin d'écriture manquait tout entier, et l'avant/après le
// suppose. C'est lui.
//
// Il ne passe PAS par la boîte d'envoi hors ligne de l'étape 1, et c'est
// délibéré. Celle-ci sert la capture opportuniste — trente secondes, debout
// devant l'objet, règle non négociable #8. Photographier l'avant d'un chantier
// est l'inverse : c'est un geste posé, souvent depuis un dossier déjà
// constitué, et souvent une photo qu'on retrouve plutôt qu'on ne prend. Un
// simple envoi de formulaire suffit, et il évite d'apprendre à la boîte
// d'envoi une seconde forme de cible.
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/client";
import { fichier, fichierLien, garantie } from "../../db/schema/index";
import { traiterImage } from "../images/traitement.server";
import { sauvegarder, supprimer, cheminVignette } from "../stockage/fichiers.server";
import type { PhotoEvenement, RolePhotoEvenement } from "./types";

/** L'événement doit être de la propriété : un id de formulaire n'entre jamais tel quel. */
async function verifierEvenement(proprieteId: number, evenementId: number) {
  const lignes = await db.execute<{ id: number }>(sql`
    SELECT id FROM evenement WHERE id = ${evenementId} AND propriete_id = ${proprieteId}
  `);
  if (!lignes.rows[0]) throw new Response("Introuvable", { status: 404 });
}

/**
 * Enregistre une photo et la rattache à un événement.
 *
 * `fichier.niveau` vaut 3, comme toute image du produit depuis la capture, et
 * la route à jeton l'ignore délibérément (décision #55) : ce qui autorise
 * l'octet est la visibilité de l'ÉVÉNEMENT. Y écrire un autre niveau ici
 * donnerait l'illusion d'un réglage qui n'est lu nulle part.
 *
 * L'EXIF est effacé par `traiterImage` — orientation appliquée puis balise
 * supprimée, dans cet ordre (règle non négociable #3). Une photo de chantier
 * porte des coordonnées GPS comme une autre, et elle part sur un lien de
 * partage comme une autre.
 */
export async function attacherPhotoAEvenement(
  proprieteId: number,
  evenementId: number,
  image: Buffer,
  role: RolePhotoEvenement,
): Promise<number> {
  await verifierEvenement(proprieteId, evenementId);

  const traitee = await traiterImage(image);
  const chemin = `propriete-${proprieteId}/evenements/${randomUUID()}.jpg`;
  await sauvegarder(chemin, traitee.original);
  await sauvegarder(cheminVignette(chemin), traitee.vignette);

  try {
    return await db.transaction(async (tx) => {
      const [f] = await tx
        .insert(fichier)
        .values({
          proprieteId,
          chemin,
          typeMime: "image/jpeg",
          taille: traitee.original.byteLength,
          niveau: 3,
          exifEfface: true,
        })
        .returning({ id: fichier.id });

      await tx.insert(fichierLien).values({
        fichierId: f.id,
        cibleType: "evenement",
        cibleId: evenementId,
        role,
      });
      return f.id;
    });
  } catch (e) {
    // Ne pas laisser d'image orpheline sur le volume si la base a refusé,
    // même raisonnement que l'image d'un plan.
    await supprimer(chemin);
    await supprimer(cheminVignette(chemin));
    throw e;
  }
}

/**
 * Détache une photo d'un événement et efface ses octets.
 *
 * La ligne `fichier_lien` est ce qui donne le droit de lire l'octet : la
 * supprimer sans supprimer le fichier laisserait des octets que plus rien
 * n'autorise ni ne nettoie. Les deux vont ensemble.
 */
export async function detacherPhotoDEvenement(proprieteId: number, evenementId: number, fichierId: number) {
  await verifierEvenement(proprieteId, evenementId);

  const lignes = await db.execute<{ chemin: string }>(sql`
    SELECT f.chemin
    FROM fichier_lien fl
    JOIN fichier f ON f.id = fl.fichier_id
    WHERE fl.cible_type = 'evenement'
      AND fl.cible_id = ${evenementId}
      AND fl.fichier_id = ${fichierId}
      AND f.propriete_id = ${proprieteId}
  `);
  const ligne = lignes.rows[0];
  if (!ligne) throw new Response("Introuvable", { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(fichierLien).where(
      and(
        eq(fichierLien.cibleType, "evenement"),
        eq(fichierLien.cibleId, evenementId),
        eq(fichierLien.fichierId, fichierId),
      ),
    );
    await tx.delete(fichier).where(eq(fichier.id, fichierId));
  });

  await supprimer(ligne.chemin);
  await supprimer(cheminVignette(ligne.chemin));
}

/**
 * Les photos d'un événement pour son écran de modification. Même ordre que la
 * lecture servie aux partages : l'avant devant l'après, parce que c'est le
 * sens du récit et pas celui des dates de prise.
 */
export async function chargerPhotosProprietaire(
  proprieteId: number,
  evenementId: number,
): Promise<PhotoEvenement[]> {
  const lignes = await db.execute<PhotoEvenement>(sql`
    SELECT f.id, fl.role
    FROM fichier_lien fl
    JOIN fichier f ON f.id = fl.fichier_id
    WHERE fl.cible_type = 'evenement'
      AND fl.cible_id = ${evenementId}
      AND f.propriete_id = ${proprieteId}
    ORDER BY
      CASE fl.role WHEN 'avant' THEN 0 WHEN 'apres' THEN 1 ELSE 2 END,
      f.date_prise DESC NULLS LAST,
      f.id DESC
  `);
  return lignes.rows;
}

// ---------------------------------------------------------------------------
// Le document d'une garantie.
//
// `garantie.fichier_id` existe depuis la migration 0000 et était, lui aussi,
// une colonne lue et jamais écrite. Elle l'est ici, et il n'y a PAS de
// `fichier_lien` : la garantie porte l'identifiant directement, donc rien ne
// vient s'ajouter à la table polymorphe et **le nombre de droits nommés sur
// les fichiers reste à trois**. Ce document ne sort d'aucun partage — un
// contrat ou une facture de garantie est du `cout` sous un autre nom
// (décision #106) — et il est servi par la route authentifiée du propriétaire,
// comme n'importe quelle image des siennes.

/**
 * Attache un document à une garantie, en remplaçant le précédent.
 *
 * `traiterImage` refuse ce qui n'est pas une image, et c'est assumé : un PDF
 * de contrat n'est pas encore stockable ici. La photo du contrat l'est, elle,
 * et c'est ce que fait quelqu'un qui a le papier sous la main — le même geste
 * que photographier une plaque signalétique.
 */
export async function attacherDocumentAGarantie(
  proprieteId: number,
  garantieId: number,
  image: Buffer,
): Promise<number> {
  const existante = await db.execute<{ fichierId: number | null }>(sql`
    SELECT g.fichier_id AS "fichierId"
    FROM garantie g
    JOIN element e ON e.id = g.element_id
    WHERE g.id = ${garantieId} AND e.propriete_id = ${proprieteId}
  `);
  const ligne = existante.rows[0];
  if (!ligne) throw new Response("Introuvable", { status: 404 });

  const traitee = await traiterImage(image);
  const chemin = `propriete-${proprieteId}/garanties/${randomUUID()}.jpg`;
  await sauvegarder(chemin, traitee.original);
  await sauvegarder(cheminVignette(chemin), traitee.vignette);

  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      const [f] = await tx
        .insert(fichier)
        .values({
          proprieteId,
          chemin,
          typeMime: "image/jpeg",
          taille: traitee.original.byteLength,
          niveau: 3,
          exifEfface: true,
        })
        .returning({ id: fichier.id });
      await tx.update(garantie).set({ fichierId: f.id }).where(eq(garantie.id, garantieId));
      return f.id;
    });
  } catch (e) {
    await supprimer(chemin);
    await supprimer(cheminVignette(chemin));
    throw e;
  }

  // L'ancien document part APRÈS que le nouveau est en base : si l'écriture
  // avait échoué, la garantie aurait perdu son document sans en gagner un.
  if (ligne.fichierId !== null) await effacerFichier(ligne.fichierId);
  return id;
}

/** Détache le document d'une garantie et efface ses octets. */
export async function detacherDocumentDeGarantie(proprieteId: number, garantieId: number) {
  const lignes = await db.execute<{ fichierId: number | null }>(sql`
    SELECT g.fichier_id AS "fichierId"
    FROM garantie g
    JOIN element e ON e.id = g.element_id
    WHERE g.id = ${garantieId} AND e.propriete_id = ${proprieteId}
  `);
  const ligne = lignes.rows[0];
  if (!ligne) throw new Response("Introuvable", { status: 404 });
  if (ligne.fichierId === null) return;

  // `fichier_id` porte `ON DELETE SET NULL` : effacer le fichier suffirait à
  // délier. On le fait quand même explicitement, pour que l'ordre soit lisible
  // sans aller chercher la contrainte.
  await db.update(garantie).set({ fichierId: null }).where(eq(garantie.id, garantieId));
  await effacerFichier(ligne.fichierId);
}

/** Efface une ligne `fichier` et ses octets. Sans lien polymorphe à défaire. */
async function effacerFichier(fichierId: number) {
  const lignes = await db.execute<{ chemin: string }>(sql`
    SELECT chemin FROM fichier WHERE id = ${fichierId}
  `);
  const ligne = lignes.rows[0];
  if (!ligne) return;
  await db.delete(fichier).where(eq(fichier.id, fichierId));
  await supprimer(ligne.chemin);
  await supprimer(cheminVignette(ligne.chemin));
}
