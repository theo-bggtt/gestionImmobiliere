// app/lib/plans/pdf.ts
// Un plan arrive souvent en PDF : le plan de l'architecte, l'extrait
// cadastral, le relevé du bureau technique. Il est rastérisé ICI, dans le
// navigateur, avant l'envoi — décision de l'étape 4, détaillée dans le README.
//
// Trois raisons de ne pas le faire côté serveur : l'image Docker ne porte que
// sharp et n'a pas à gagner une dépendance native sensible à l'architecture ;
// un PDF est un format hostile qu'on préfère ouvrir dans le bac à sable du
// navigateur plutôt que dans le processus de l'application ; et l'éditeur de
// recadrage est de toute façon côté client, donc le PDF n'ajoute qu'une
// source d'image à une chaîne qui existe.
//
// Le coût — environ 1,7 Mo non compressé entre l'API et son worker — est
// payé par ce seul module, importé dynamiquement et uniquement quand un PDF
// est réellement ouvert. Téléverser une photo n'en charge pas un octet.
import { LARGEUR_MAX_PLAN } from "./types";

/**
 * La première page du PDF, en PNG. Un plan d'étage tient sur une page ; les
 * suivantes seraient un autre plan, donc un autre téléversement.
 *
 * PNG et non JPEG : c'est du trait, il repassera de toute façon par `sharp`
 * côté serveur, et un JPEG intermédiaire ajouterait une génération de
 * compression pour rien.
 */
export async function rasteriserPdf(fichier: File): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  // La tâche de chargement, et non le document : c'est elle qui porte
  // `destroy()`, donc l'arrêt du worker. Sans ça, ouvrir dix PDF laisse dix
  // workers vivants dans l'onglet.
  const tache = pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) });
  try {
    const document_ = await tache.promise;
    const page = await document_.getPage(1);
    const nature = page.getViewport({ scale: 1 });
    // On rastérise à la résolution que le serveur gardera : plus haut serait
    // jeté au redimensionnement, plus bas ne se rattraperait jamais.
    const echelle = Math.min(LARGEUR_MAX_PLAN / Math.max(nature.width, nature.height), 8);
    const viewport = page.getViewport({ scale: echelle });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const contexte = canvas.getContext("2d");
    if (!contexte) throw new Error("Canvas indisponible : impossible de lire ce PDF.");

    // Un PDF n'a pas de fond. Sans ce blanc, le trait noir arriverait sur du
    // transparent, que l'aplatissement en JPEG rendrait en noir sur noir.
    contexte.fillStyle = "#ffffff";
    contexte.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob | null>((resoudre) => canvas.toBlob(resoudre, "image/png"));
    if (!blob) throw new Error("Le navigateur n'a rien produit à partir de ce PDF.");
    return blob;
  } finally {
    await tache.destroy();
  }
}
