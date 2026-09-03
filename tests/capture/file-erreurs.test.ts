import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { EntreeFile } from "../../app/lib/capture/file";

// La boîte d'envoi est remplacée par un magasin en mémoire : ce qu'on veut
// éprouver ici n'est pas IndexedDB mais la décision de garder ou de purger
// une entrée selon ce que répond le serveur.
const magasin = vi.hoisted(() => ({ entrees: [] as EntreeFile[], retires: [] as string[] }));

vi.mock("../../app/lib/capture/file", () => ({
  listerFile: async () => [...magasin.entrees].sort((a, b) => a.creeLe - b.creeLe),
  retirerDeLaFile: async (id: string) => {
    magasin.retires.push(id);
    magasin.entrees = magasin.entrees.filter((e) => e.id !== id);
  },
  majEntree: async (id: string, modif: Partial<EntreeFile>) => {
    magasin.entrees = magasin.entrees.map((e) => (e.id === id ? { ...e, ...modif } : e));
  },
}));

function capture(surcharge: Partial<EntreeFile> = {}): EntreeFile {
  return {
    id: "capture-1",
    proprieteId: 1,
    cible: { genre: "nouveau" },
    zoneId: 3,
    typeId: 7,
    nom: "Prise 230V — Cuisine",
    photo: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    octets: 3,
    datePrise: 1_700_000_000_000,
    creeLe: 1_700_000_000_000,
    tentatives: 0,
    echec: null,
    ...surcharge,
  };
}

/** `Response.redirected` n'est pas assignable : on fabrique la forme utilisée. */
function reponse({ statut = 200, redirigee = false, json }: { statut?: number; redirigee?: boolean; json?: unknown }) {
  return {
    status: statut,
    ok: statut >= 200 && statut < 300,
    redirected: redirigee,
    headers: new Headers({ "Content-Type": json === undefined ? "text/html; charset=utf-8" : "application/json" }),
    json: async () => json,
  } as unknown as Response;
}

// Chaque test repart d'un module neuf : `synchro` porte son état (file en
// attente, minuteur de relance) au niveau du module.
async function chargerSynchro() {
  vi.resetModules();
  return import("../../app/lib/capture/synchro");
}

beforeEach(() => {
  magasin.entrees = [];
  magasin.retires = [];
  // Seuls les minuteurs sont simulés : fausser les microtâches bloquerait
  // les `await` du module testé.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("boîte d'envoi face aux réponses du serveur", () => {
  it("garde la capture quand la session a expiré, et repart seule après reconnexion", async () => {
    magasin.entrees = [capture()];
    const { envoyerFile, etatCourant } = await chargerSynchro();

    let reconnecte = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reconnecte
          // Session expirée : `requireUtilisateurId` redirige vers /connexion
          // et `fetch` suit, donc un 200 HTML marqué `redirected`.
          ? reponse({ statut: 200, json: { elementId: 42 } })
          : reponse({ statut: 200, redirigee: true }),
      ),
    );

    await envoyerFile();

    expect(magasin.retires).toEqual([]);
    expect(magasin.entrees).toHaveLength(1);
    expect(magasin.entrees[0].photo.size).toBe(3);
    // Réparable en se reconnectant : aucune tentative consommée, donc pas
    // d'entrée « bloquée » qui exigerait un geste.
    expect(magasin.entrees[0].tentatives).toBe(0);
    expect(magasin.entrees[0].echec).toMatch(/session expirée/i);
    expect(etatCourant().bloquees).toHaveLength(0);
    expect(etatCourant().enAttente).toBe(1);

    reconnecte = true;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(magasin.entrees).toHaveLength(0);
    expect(magasin.retires).toEqual(["capture-1"]);
    expect(etatCourant().enAttente).toBe(0);
  });

  it("traite un 401 nu comme une session expirée, pas comme un refus définitif", async () => {
    magasin.entrees = [capture()];
    const { envoyerFile, etatCourant } = await chargerSynchro();

    let reconnecte = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reconnecte
          ? reponse({ statut: 200, json: { elementId: 7 } })
          // Un proxy devant l'app peut répondre 401 au lieu de rediriger.
          : reponse({ statut: 401, json: { erreur: "Non authentifié." } }),
      ),
    );

    await envoyerFile();

    expect(magasin.retires).toEqual([]);
    expect(magasin.entrees[0].tentatives).toBe(0);
    expect(etatCourant().bloquees).toHaveLength(0);

    reconnecte = true;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(magasin.entrees).toHaveLength(0);
    expect(magasin.retires).toEqual(["capture-1"]);
  });

  it("garde la capture sur un 413 et la rend visible au lieu de la perdre", async () => {
    magasin.entrees = [capture()];
    const { envoyerFile, etatCourant } = await chargerSynchro();
    // Un proxy qui refuse la taille répond en HTML, sans message exploitable.
    vi.stubGlobal("fetch", vi.fn(async () => reponse({ statut: 413 })));

    await envoyerFile();

    expect(magasin.retires).toEqual([]);
    expect(magasin.entrees).toHaveLength(1);
    expect(magasin.entrees[0].photo.size).toBe(3);
    expect(magasin.entrees[0].echec).toMatch(/trop volumineux/i);
    // Réessayer à l'identique ne changera rien : l'entrée passe en erreur
    // visible plutôt que de tourner en boucle en silence.
    expect(etatCourant().bloquees).toHaveLength(1);
    expect(etatCourant().enAttente).toBe(1);
  });

  it.each([400, 401, 403, 409, 413, 422, 429, 500, 502, 503])(
    "ne supprime jamais la capture quand le serveur répond %i",
    async (statut) => {
      magasin.entrees = [capture()];
      const { envoyerFile, etatCourant } = await chargerSynchro();
      vi.stubGlobal("fetch", vi.fn(async () => reponse({ statut })));

      await envoyerFile();

      expect(magasin.retires).toEqual([]);
      expect(magasin.entrees).toHaveLength(1);
      expect(etatCourant().enAttente).toBe(1);
    },
  );

  it("ne purge que sur un 2xx portant un identifiant de fiche", async () => {
    magasin.entrees = [capture()];
    const { envoyerFile } = await chargerSynchro();

    // 200, mais une page HTML de proxy : pas d'identifiant, donc pas d'accusé
    // de réception, donc on garde.
    vi.stubGlobal("fetch", vi.fn(async () => reponse({ statut: 200 })));
    await envoyerFile();
    expect(magasin.retires).toEqual([]);
    expect(magasin.entrees).toHaveLength(1);

    // 200 avec identifiant : c'est le seul cas qui purge.
    vi.stubGlobal("fetch", vi.fn(async () => reponse({ statut: 200, json: { elementId: 99 } })));
    await envoyerFile();
    expect(magasin.retires).toEqual(["capture-1"]);
    expect(magasin.entrees).toHaveLength(0);
  });
});
