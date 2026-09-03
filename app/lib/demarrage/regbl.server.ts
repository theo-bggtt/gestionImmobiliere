// app/lib/demarrage/regbl.server.ts
// Enrichissement optionnel : une adresse suisse pré-remplit deux réponses du
// démarrage. Rien ici n'est une condition d'existence du squelette — quand ce
// module ne rend rien, l'écran est celui du chemin manuel.
//
// Vérifié le 3 septembre 2026, voir `.decisions/note-2026-09-03-regbl.md` :
// gratuit, sans clé ni compte, usage commercial autorisé, attribution
// recommandée et non obligatoire (contrairement à swisstopo).
//
// CE MODULE EST SERVEUR, et pas seulement par habitude. Le RegBL renvoie
// `egrid` et `lparz`, c'est-à-dire le bien-fonds et le NUMÉRO DE PARCELLE.
// Les faire transiter par le navigateur pour trier ensuite, ce serait les
// avoir déjà sortis. Ce qui remonte à l'écran est construit ici, et ne
// contient ni EGID, ni parcelle, ni coordonnées.
import type { CandidatBatiment, ReponsesDemarrage, ResultatRegbl } from "./types";
import { NIVEAUX_HABITABLES_MAX, NIVEAUX_HABITABLES_MIN } from "./types";

export type { CandidatBatiment, ResultatRegbl };

const RACINE = "https://api3.geo.admin.ch/rest/services";
const COUCHE = "ch.bfs.gebaeude_wohnungs_register";

/** Court volontairement : le chemin manuel attend derrière, il ne doit pas attendre longtemps. */
const DELAI_MS = 3500;
/** Cinq candidats à résoudre, cinq requêtes. Au-delà la liste ne se lit plus. */
const MAX_CANDIDATS = 5;

type ResultatRecherche = {
  fuzzy?: boolean | string;
  results?: Array<{
    attrs?: {
      label?: string;
      origin?: string;
      links?: Array<{ title?: string; href?: string }>;
    };
  }>;
};

type AttributsRegbl = {
  /** Classe : 1110 maison individuelle, 1121 deux logements, 1122 trois et plus. */
  gklas?: number | null;
  /** Nombre de niveaux, rez compris. NE COMPTE PAS LES CAVES : voir `deduireReponses`. */
  gastw?: number | null;
  /** Nombre de logements. */
  ganzwhg?: number | null;
  /** Année de construction. */
  gbauj?: number | null;
};

async function lireJson<T>(url: string): Promise<T | null> {
  const reponse = await fetch(url, {
    signal: AbortSignal.timeout(DELAI_MS),
    headers: { accept: "application/json" },
  });
  if (!reponse.ok) return null;
  return (await reponse.json()) as T;
}

/** Enlève le gras que le service met autour du NPA et de la localité. */
function sansBalises(etiquette: string): string {
  return etiquette.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * `EGID_EDID` extrait du lien vers la couche RegBL. C'est le seul endroit où
 * l'identifiant existe, et il ne quitte pas ce module.
 */
function identifiantRegbl(liens: Array<{ title?: string; href?: string }> | undefined): string | null {
  const lien = liens?.find((l) => l.title === COUCHE)?.href;
  if (!lien) return null;
  const dernier = lien.split("/").pop();
  return dernier && /^\d+_\d+$/.test(dernier) ? dernier : null;
}

function nombre(valeur: unknown): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

/**
 * Traduit les attributs du registre en pré-remplissage.
 *
 * `sousSol` n'est délibérément PAS déduit : le catalogue des caractères définit
 * `gastw` comme le nombre d'étages rez compris, où combles et sous-sols ne
 * comptent que s'ils sont aménagés pour l'habitation, et où les caves ne
 * comptent jamais. Déduire un sous-sol de `gastw` serait faux sur une majorité
 * de maisons ; la question est posée au propriétaire.
 */
export function deduireReponses(attrs: AttributsRegbl): CandidatBatiment["reponses"] {
  const gklas = nombre(attrs.gklas);
  const logements = nombre(attrs.ganzwhg);

  // 1110 est la maison individuelle. Sans classe, on retombe sur le nombre de
  // logements, et sans lui non plus sur la maison — le cas dominant du produit.
  const forme: ReponsesDemarrage["forme"] =
    gklas === 1110 ? "maison" : gklas !== null ? "appartement" : logements !== null && logements > 1 ? "appartement" : "maison";

  const etages = nombre(attrs.gastw);
  const niveauxHabitables =
    etages === null ? 2 : Math.min(NIVEAUX_HABITABLES_MAX, Math.max(NIVEAUX_HABITABLES_MIN, Math.trunc(etages)));

  return { forme, niveauxHabitables };
}

export function decrire(attrs: AttributsRegbl): string {
  const gklas = nombre(attrs.gklas);
  const logements = nombre(attrs.ganzwhg);
  const etages = nombre(attrs.gastw);
  const annee = nombre(attrs.gbauj);

  const morceaux: string[] = [];
  if (gklas === 1110) morceaux.push("Maison individuelle");
  else if (logements !== null && logements > 1) morceaux.push(`Immeuble, ${logements} logements`);
  else morceaux.push("Bâtiment d'habitation");
  if (etages !== null) morceaux.push(`${etages} niveau${etages > 1 ? "x" : ""}`);
  if (annee !== null) morceaux.push(`construit en ${annee}`);
  return morceaux.join(" · ");
}

/**
 * Cherche une adresse et rend des candidats déjà résolus.
 *
 * Trois pièges du service, tous mesurés, tous traités ici — chacun produit
 * sinon une donnée fausse et plausible, ce qui est le pire cas :
 *
 * 1. `fuzzy: true` est un repli silencieux, pas une erreur. « 10 rue de Rivoli
 *    Paris » renvoie « Ruelle de Paris 10, 3966 Chalais ». Le service ne dit
 *    JAMAIS « pas trouvé » : on le dit pour lui.
 * 2. `origin=address` n'est pas un filtre. Sans correspondance, le service
 *    répond quand même, avec des régions et des communes (`origin: gazetteer`).
 * 3. Un résultat sans lien vers la couche RegBL n'a pas de bâtiment derrière.
 *
 * Et c'est pour cela que l'appelant ne doit jamais sélectionner tout seul : même
 * sans `fuzzy`, « Dorfstrasse 10 Interlaken » rend en tête « Unterdorfstrasse
 * 10, Matten b. Interlaken ». Le choix appartient au propriétaire.
 */
export async function chercherBatiments(adresse: string): Promise<ResultatRegbl> {
  const saisie = adresse.trim();
  if (saisie.length < 4) return { statut: "aucun" };

  try {
    const url =
      `${RACINE}/api/SearchServer?type=locations&origin=address` +
      `&limit=${MAX_CANDIDATS}&searchText=${encodeURIComponent(saisie)}`;
    const recherche = await lireJson<ResultatRecherche>(url);
    if (!recherche) return { statut: "indisponible" };

    // Piège 1. `fuzzy` arrive en booléen ou en chaîne "true" selon les routes.
    if (recherche.fuzzy === true || recherche.fuzzy === "true") return { statut: "aucun" };

    const identifiants = (recherche.results ?? [])
      // Pièges 2 et 3.
      .filter((r) => r.attrs?.origin === "address")
      .map((r) => ({ etiquette: sansBalises(r.attrs?.label ?? ""), id: identifiantRegbl(r.attrs?.links) }))
      .filter((r): r is { etiquette: string; id: string } => r.id !== null && r.etiquette.length > 0)
      .slice(0, MAX_CANDIDATS);

    if (identifiants.length === 0) return { statut: "aucun" };

    const resolus = await Promise.all(
      identifiants.map(async ({ etiquette, id }) => {
        const detail = await lireJson<{ feature?: { attributes?: AttributsRegbl } }>(
          `${RACINE}/ech/MapServer/${COUCHE}/${encodeURIComponent(id)}?lang=fr`,
        );
        const attrs = detail?.feature?.attributes;
        return attrs ? { etiquette, attrs } : null;
      }),
    );

    const candidats = resolus
      .filter((r): r is { etiquette: string; attrs: AttributsRegbl } => r !== null)
      .map((r, rang) => ({
        rang,
        etiquette: r.etiquette,
        description: decrire(r.attrs),
        reponses: deduireReponses(r.attrs),
      }));

    return candidats.length > 0 ? { statut: "ok", candidats } : { statut: "aucun" };
  } catch (erreur) {
    // Réseau coupé, délai dépassé, JSON illisible. On journalise (le silence
    // rendrait une panne durable invisible) et l'écran reste utilisable.
    console.error("[demarrage] RegBL injoignable :", erreur);
    return { statut: "indisponible" };
  }
}
