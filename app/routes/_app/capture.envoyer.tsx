// app/routes/_app/capture.envoyer.tsx
// Route de ressource : réception d'une capture sortie de la boîte d'envoi.
// Crée la fiche (cas A) ou la rattache à une fiche existante (cas B), puis
// écrit l'image traitée derrière l'interface de stockage.
import type { ActionFunctionArgs } from "react-router";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../../db/client";
import { element, fichier, fichierLien, typeElement, zone } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { traiterImage } from "../../lib/images/traitement.server";
import { cheminVignette, sauvegarder, supprimer } from "../../lib/stockage/fichiers.server";

const TAILLE_MAX = 15 * 1024 * 1024;
const NOM_MAX = 200;

function erreur(message: string, status = 400) {
  return Response.json({ erreur: message }, { status });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return erreur("Méthode non autorisée.", 405);

  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const captureId = String(form.get("captureId") ?? "");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(captureId)) return erreur("Identifiant de capture invalide.");

  // Idempotence : le réseau mobile coupe volontiers entre l'écriture serveur
  // et l'accusé de réception, et le client rejoue alors l'envoi.
  const [deja] = await db
    .select({ id: fichier.id })
    .from(fichier)
    .where(and(eq(fichier.captureId, captureId), eq(fichier.proprieteId, propriete.id)));
  if (deja) {
    const [lien] = await db
      .select({ cibleId: fichierLien.cibleId })
      .from(fichierLien)
      .where(and(eq(fichierLien.fichierId, deja.id), eq(fichierLien.cibleType, "element")));
    return Response.json({ elementId: lien?.cibleId ?? null, fichierId: deja.id, rejoue: true });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return erreur("Photo absente.");
  if (photo.size > TAILLE_MAX) return erreur("Photo trop volumineuse.");

  const datePriseMs = Number(form.get("datePrise"));
  const datePrise = Number.isFinite(datePriseMs) && datePriseMs > 0 ? new Date(datePriseMs) : null;

  // Résolution de la cible : jamais confiance à un id venu du client sans
  // vérifier qu'il appartient à cette propriété (règle non négociable #4).
  let elementExistantId: number | null = null;
  let zoneId: number;
  let typeIdRetenu = 0;
  let nomRetenu = "";

  if (form.get("cibleGenre") === "element") {
    const [cible] = await db
      .select({ id: element.id, zoneId: element.zoneId })
      .from(element)
      .where(and(eq(element.id, Number(form.get("elementId"))), eq(element.proprieteId, propriete.id)));
    if (!cible) return erreur("Fiche introuvable.", 404);
    elementExistantId = cible.id;
    zoneId = cible.zoneId;
  } else {
    const [zoneCible] = await db
      .select({ id: zone.id, nom: zone.nom })
      .from(zone)
      .where(and(eq(zone.id, Number(form.get("zoneId"))), eq(zone.proprieteId, propriete.id)));
    if (!zoneCible) return erreur("Zone invalide.");

    const [type] = await db
      .select({ id: typeElement.id, nom: typeElement.nom })
      .from(typeElement)
      .where(
        and(
          eq(typeElement.id, Number(form.get("typeId"))),
          or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, propriete.id)),
        ),
      );
    if (!type) return erreur("Type invalide.");

    zoneId = zoneCible.id;
    typeIdRetenu = type.id;
    // Le nom proposé par le client peut avoir été écrasé par l'utilisateur ;
    // s'il est vide, on le regénère ici plutôt que de faire confiance.
    nomRetenu = String(form.get("nom") ?? "").trim().slice(0, NOM_MAX) || `${type.nom} — ${zoneCible.nom}`;
  }

  const traitee = await traiterImage(Buffer.from(await photo.arrayBuffer()));
  const chemin = `propriete-${propriete.id}/${captureId}.jpg`;
  await sauvegarder(chemin, traitee.original);
  await sauvegarder(cheminVignette(chemin), traitee.vignette);

  try {
    const resultat = await db.transaction(async (tx) => {
      let elementId = elementExistantId;
      if (elementId === null) {
        // `details` reste vide : aucun champ du type n'est demandé à la
        // capture (règle non négociable #7 de l'étape). Niveau 3 = privé.
        const [cree] = await tx
          .insert(element)
          .values({ proprieteId: propriete.id, nom: nomRetenu, typeId: typeIdRetenu, zoneId, niveau: 3 })
          .returning({ id: element.id });
        elementId = cree.id;
      }

      const [f] = await tx
        .insert(fichier)
        .values({
          proprieteId: propriete.id,
          chemin,
          typeMime: "image/jpeg",
          taille: traitee.original.byteLength,
          datePrise,
          zoneId,
          niveau: 3,
          exifEfface: true,
          captureId,
        })
        .returning({ id: fichier.id });

      await tx.insert(fichierLien).values({
        fichierId: f.id,
        cibleType: "element",
        cibleId: elementId,
        role: "general",
      });

      return { elementId, fichierId: f.id };
    });

    return Response.json(resultat);
  } catch (e) {
    // Ne pas laisser d'image orpheline sur le volume si la base a refusé.
    await supprimer(chemin);
    await supprimer(cheminVignette(chemin));
    throw e;
  }
}
