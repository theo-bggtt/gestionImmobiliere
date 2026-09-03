// app/lib/capture/synchro.ts
// Il n'y a pas de Background Sync sur iOS : on ne peut compter sur aucun
// réveil en arrière-plan. Les seuls déclencheurs fiables sont le retour du
// réseau, le retour au premier plan, et le démarrage de l'app.
import { listerFile, majEntree, retirerDeLaFile, type EntreeFile } from "./file";

/** Au-delà, l'envoi automatique laisse tomber et l'entrée devient visible en erreur. */
const TENTATIVES_MAX = 5;
const RESOLUS_GARDES = 20;
/**
 * Mesuré : `navigator.onLine` peut rester à vrai alors que tout `fetch`
 * échoue, et dans ce cas l'événement `online` ne part jamais au retour du
 * réseau. Sans ce filet, une file pleine attend le prochain passage au
 * premier plan, qui peut ne jamais venir si l'app reste à l'écran.
 */
const RETENTE_MS = 30_000;

export type EtatFile = {
  enAttente: number;
  envoiEnCours: boolean;
  /** Entrées que l'envoi automatique a abandonnées : l'utilisateur doit les voir. */
  bloquees: EntreeFile[];
  /** captureId → id de la fiche créée, pour activer le lien « compléter ». */
  resolus: Record<string, number>;
  /** Compteur monotone d'envois confirmés, pour rafraîchir les écrans ouverts. */
  envoyes: number;
};

let etat: EtatFile = { enAttente: 0, envoiEnCours: false, bloquees: [], resolus: {}, envoyes: 0 };
const abonnes = new Set<(e: EtatFile) => void>();
const resolus = new Map<string, number>();

function diffuser(modif: Partial<EtatFile>) {
  etat = { ...etat, ...modif, resolus: Object.fromEntries(resolus) };
  for (const abonne of abonnes) abonne(etat);
}

export function etatCourant(): EtatFile {
  return etat;
}

export function souscrire(abonne: (e: EtatFile) => void): () => void {
  abonnes.add(abonne);
  abonne(etat);
  return () => abonnes.delete(abonne);
}

async function rafraichirEtat() {
  const entrees = await listerFile();
  diffuser({
    enAttente: entrees.length,
    bloquees: entrees.filter((e) => e.tentatives >= TENTATIVES_MAX),
  });
}

async function envoyerUne(entree: EntreeFile): Promise<"envoyee" | "reessayer" | "definitif"> {
  const corps = new FormData();
  corps.set("captureId", entree.id);
  corps.set("cibleGenre", entree.cible.genre);
  if (entree.cible.genre === "element") {
    corps.set("elementId", String(entree.cible.elementId));
  } else {
    corps.set("zoneId", String(entree.zoneId ?? ""));
    corps.set("typeId", String(entree.typeId ?? ""));
    corps.set("nom", entree.nom);
  }
  corps.set("datePrise", String(entree.datePrise));
  corps.set("photo", entree.photo, `${entree.id}.jpg`);

  const reponse = await fetch(`/proprietes/${entree.proprieteId}/capture/envoyer`, {
    method: "POST",
    body: corps,
  });

  // Session expirée : la redirection vers /connexion revient en 200 HTML.
  // Supprimer l'entrée ici perdrait la capture pour de bon.
  if (reponse.redirected || !reponse.headers.get("Content-Type")?.includes("application/json")) {
    await majEntree(entree.id, { echec: "Session expirée — reconnecte-toi puis réessaie." });
    return "reessayer";
  }

  const charge = (await reponse.json()) as { elementId?: number; erreur?: string };

  if (reponse.ok && charge.elementId) {
    // Purger dès l'accusé de réception, pas plus tard (règle #7).
    await retirerDeLaFile(entree.id);
    resolus.set(entree.id, charge.elementId);
    while (resolus.size > RESOLUS_GARDES) resolus.delete(resolus.keys().next().value!);
    diffuser({ envoyes: etat.envoyes + 1 });
    return "envoyee";
  }

  // 4xx : la requête ne passera jamais telle quelle, inutile d'insister.
  const definitif = reponse.status >= 400 && reponse.status < 500;
  await majEntree(entree.id, {
    echec: charge.erreur ?? `Le serveur a répondu ${reponse.status}.`,
    tentatives: definitif ? TENTATIVES_MAX : entree.tentatives + 1,
  });
  return definitif ? "definitif" : "reessayer";
}

let enCours: Promise<void> | null = null;
let retente: ReturnType<typeof setTimeout> | null = null;

function programmerRetente() {
  if (retente !== null || etat.enAttente === 0) return;
  retente = setTimeout(() => {
    retente = null;
    void envoyerFile();
  }, RETENTE_MS);
}

export function envoyerFile(): Promise<void> {
  enCours ??= (async () => {
    diffuser({ envoiEnCours: true });
    try {
      for (const entree of await listerFile()) {
        if (entree.tentatives >= TENTATIVES_MAX) continue;
        try {
          const issue = await envoyerUne(entree);
          // Réseau debout mais serveur en vrac : inutile de brûler la file entière.
          if (issue === "reessayer") break;
        } catch {
          // `fetch` qui lève = pas de connexion. Ce n'est pas une tentative
          // ratée, c'est une tentative qui n'a pas eu lieu : la compter
          // finirait par marquer « bloquée » une capture qui attend juste
          // qu'on remonte de la cave. L'entrée reste intacte.
          break;
        }
      }
    } finally {
      await rafraichirEtat();
      diffuser({ envoiEnCours: false });
      enCours = null;
      programmerRetente();
    }
  })();
  return enCours;
}

/** Réessai manuel : remet à zéro le compteur des entrées abandonnées. */
export async function relancerBloquees(): Promise<void> {
  for (const entree of await listerFile()) {
    if (entree.tentatives >= TENTATIVES_MAX) await majEntree(entree.id, { tentatives: 0, echec: null });
  }
  await envoyerFile();
}

export function demarrerSynchro(): () => void {
  // `navigator.onLine` ment (mesuré : vrai alors que tout `fetch` échoue, cas
  // du portail captif). Il sert à déclencher, jamais à décider.
  const auRetour = () => {
    if (document.visibilityState === "visible") void envoyerFile();
  };
  const enLigne = () => void envoyerFile();

  document.addEventListener("visibilitychange", auRetour);
  window.addEventListener("online", enLigne);
  void rafraichirEtat().then(() => {
    if (navigator.onLine) void envoyerFile();
  });

  return () => {
    document.removeEventListener("visibilitychange", auRetour);
    window.removeEventListener("online", enLigne);
  };
}
