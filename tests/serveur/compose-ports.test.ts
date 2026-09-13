import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

// La cible de production est un VPS (décision #142) : l'adresse est publique,
// donc tout ce que le compose publie sur `0.0.0.0` est sur Internet. Et le
// pare-feu ne rattrape pas une erreur ici — Docker écrit ses propres règles
// dans la chaîne iptables `DOCKER`, traversée AVANT celles d'`ufw` : un port
// publié reste joignable pendant qu'`ufw status` affiche « deny ». Ce qui
// tient la base hors d'Internet est donc le `127.0.0.1:` devant le port, et
// rien d'autre ; ce garde statique le tient, sur le modèle de
// `vocabulaire.test.ts` et `exports-routes.test.ts`.
//
// Lecture par balayage indenté plutôt que par un analyseur YAML : il n'y en a
// pas dans le projet, et en ajouter un pour vingt lignes de compose serait une
// dépendance de plus dans l'image. Le balayage ne comprend que ce que ce
// fichier-ci écrit — deux niveaux d'indentation et des entrées de liste en
// chaînes —, ce qui est assumé : le test de contrôle plus bas prouve qu'il
// détecte bien un port publié à tort, sans quoi « aucun » ne voudrait rien
// dire.
const SERVICE_PUBLIC = "caddy";

/** Une entrée `ports:` telle qu'écrite, avec le service qui la porte. */
type Publication = { service: string; entree: string };

/**
 * Les entrées `ports:` de chaque service d'un docker-compose.
 *
 * @param {string} texte contenu du fichier compose
 * @returns {Publication[]} une entrée par ligne de `ports:`
 */
function publications(texte: string): Publication[] {
  const trouvees: Publication[] = [];
  let service: string | null = null;
  let dansPorts = false;

  for (const ligne of texte.split("\n")) {
    if (/^\S/.test(ligne)) {
      // Retour à la colonne 0 : on quitte `services:`.
      service = null;
      dansPorts = false;
      continue;
    }
    const debutService = ligne.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
    if (debutService) {
      service = debutService[1];
      dansPorts = false;
      continue;
    }
    if (/^ {4}ports:\s*$/.test(ligne)) {
      dansPorts = true;
      continue;
    }
    // Toute autre clé du service ferme la liste en cours.
    if (/^ {4}[A-Za-z0-9_.-]+:/.test(ligne)) {
      dansPorts = false;
      continue;
    }
    const element = ligne.match(/^\s*-\s*["']?([^"'#]+?)["']?\s*$/);
    if (dansPorts && element && service) {
      trouvees.push({ service, entree: element[1] });
    }
  }
  return trouvees;
}

/** Vrai si l'entrée ne sort pas de la boucle locale de la machine. */
function resteSurLaBoucleLocale(entree: string): boolean {
  return entree.startsWith("127.0.0.1:") || entree.startsWith("::1:");
}

describe("docker-compose : ce qui est publié est sur Internet", () => {
  it("seul caddy publie hors de la boucle locale", async () => {
    const texte = await readFile("docker-compose.yml", "utf-8");
    const trouvees = publications(texte);

    // Le balayage doit voir quelque chose, sinon il passerait sur un fichier
    // qu'il n'a pas su lire.
    expect(trouvees.length).toBeGreaterThan(0);

    const fautives = trouvees.filter(
      (p) => p.service !== SERVICE_PUBLIC && !resteSurLaBoucleLocale(p.entree),
    );
    expect(fautives).toEqual([]);

    // Et la base, elle, ne doit pas y être du tout.
    const postgres = trouvees.filter((p) => p.service === "postgres");
    expect(postgres.every((p) => resteSurLaBoucleLocale(p.entree))).toBe(true);
  });

  it("détecte un port publié à tort (contrôle du balayage)", () => {
    const compose = [
      "services:",
      "  postgres:",
      "    image: postgres:16-alpine",
      "    ports:",
      '      - "5432:5432"',
      "  caddy:",
      "    ports:",
      '      - "443:443"',
      "",
    ].join("\n");

    const trouvees = publications(compose);
    expect(trouvees).toEqual([
      { service: "postgres", entree: "5432:5432" },
      { service: "caddy", entree: "443:443" },
    ]);
    expect(
      trouvees.filter((p) => p.service !== SERVICE_PUBLIC && !resteSurLaBoucleLocale(p.entree)),
    ).toHaveLength(1);
  });
});
