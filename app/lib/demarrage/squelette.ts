// app/lib/demarrage/squelette.ts
// La proposition de structure, fonction PURE : mêmes réponses, même squelette,
// et rien qui touche la base. Elle tourne dans le navigateur pendant que le
// propriétaire corrige, et le serveur ne la rejoue pas — il reçoit ce qui a
// été corrigé, pas ce qui a été proposé. Neutre comme `types.ts`.
import {
  NIVEAUX_HABITABLES_MAX,
  NIVEAUX_HABITABLES_MIN,
  type BatimentPropose,
  type NiveauPropose,
  type ReponsesDemarrage,
  type SquelettePropose,
  type ZoneProposee,
} from "./types";

let compteur = 0;
/** Clé d'écran, pas d'identifiant de données : la base attribuera les siens. */
function cle(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${compteur}`;
}

function zones(type: ZoneProposee["type"], ...noms: string[]): ZoneProposee[] {
  return noms.map((nom) => ({ cle: cle("z"), nom, type }));
}

/**
 * Nom d'un niveau à partir de son ordinal. Le nom est une étiquette libre, il
 * ne sert jamais à trier (règle non négociable #11) : deux niveaux nommés
 * « Combles » et « Étage » se rangent par leur ordinal, pas par leur initiale.
 */
function nommerNiveau(ordinal: number): string {
  if (ordinal < 0) return "Sous-sol";
  if (ordinal === 0) return "Rez-de-chaussée";
  if (ordinal === 1) return "1er étage";
  return `${ordinal}e étage`;
}

/**
 * Zones typiques d'un niveau. Volontairement courtes : la proposition est une
 * amorce que le propriétaire corrige, et une liste trop longue se relit moins
 * bien qu'elle ne se complète. « Local technique » n'est pas décoratif, c'est
 * là que vivent la vanne d'arrêt et le tableau, donc la moitié des partages
 * à l'artisan.
 */
function zonesDuNiveau(ordinal: number, forme: ReponsesDemarrage["forme"]): ZoneProposee[] {
  if (ordinal < 0) {
    return [...zones("interieur", "Cave", "Buanderie"), ...zones("technique", "Local technique")];
  }
  if (ordinal === 0) {
    // Un logement n'a qu'un niveau : il porte tout, chambres comprises.
    return forme === "appartement"
      ? zones("interieur", "Entrée", "Cuisine", "Séjour", "Chambre 1", "Salle de bain", "WC")
      : zones("interieur", "Entrée", "Cuisine", "Séjour", "WC");
  }
  // Les étages d'une maison : deux chambres au premier, une par étage ensuite.
  return ordinal === 1
    ? zones("interieur", "Chambre 1", "Chambre 2", "Salle de bain")
    : zones("interieur", `Chambre ${ordinal + 1}`, "Salle de bain");
}

function borner(valeur: number, min: number, max: number): number {
  if (!Number.isFinite(valeur)) return min;
  return Math.min(max, Math.max(min, Math.trunc(valeur)));
}

/**
 * Compose la structure proposée. Rien n'est écrit ici : le retour est une
 * valeur que l'écran affiche et laisse corriger, et l'écriture n'a lieu qu'à
 * la confirmation.
 */
export function composerSquelette(reponses: ReponsesDemarrage): SquelettePropose {
  const habitables = borner(reponses.niveauxHabitables, NIVEAUX_HABITABLES_MIN, NIVEAUX_HABITABLES_MAX);
  const logement = reponses.forme === "appartement";

  // Un logement n'a pas d'étages à lui : ce qui monte, c'est l'immeuble.
  const ordinaux: number[] = logement ? [0] : Array.from({ length: habitables }, (_, i) => i);

  if (reponses.sousSol) ordinaux.unshift(-1);
  if (reponses.combles && !logement) ordinaux.push(habitables);

  const niveaux: NiveauPropose[] = ordinaux
    .sort((a, b) => a - b)
    .map((ordinal) => ({
      cle: cle("n"),
      // Le dernier niveau s'appelle « Combles » quand c'en sont, mais garde
      // l'ordinal qui le place au-dessus des étages.
      nom: reponses.combles && !logement && ordinal === habitables ? "Combles" : nommerNiveau(ordinal),
      ordinal,
      zones: zonesDuNiveau(ordinal, reponses.forme),
    }));

  const batiments: BatimentPropose[] = [
    {
      cle: cle("b"),
      nom: logement ? "Logement" : "Maison",
      type: "principal",
      niveaux,
    },
  ];

  // Le garage est un bâtiment, pas une zone : il a sa propre enveloppe, et le
  // modèle prévoit plusieurs bâtiments sur une parcelle. Il porte un niveau,
  // parce qu'une zone rattachée à un bâtiment doit passer par un niveau.
  if (reponses.garage) {
    batiments.push({
      cle: cle("b"),
      nom: "Garage",
      type: "garage",
      niveaux: [{ cle: cle("n"), nom: "Rez-de-chaussée", ordinal: 0, zones: zones("interieur", "Garage") }],
    });
  }

  // `niveau_id` nul, le seul cas admis. Sans elles, un lien de partage au
  // jardinier n'aurait littéralement rien à montrer (règle non négociable #12).
  const zonesExterieures = reponses.exterieur
    ? logement
      ? zones("exterieur", "Balcon")
      : zones("exterieur", "Jardin", "Terrasse")
    : [];

  return { batiments, zonesExterieures };
}
