import { describe, it, expect, vi, afterEach } from "vitest";
import { chercherBatiments, decrire, deduireReponses } from "../../app/lib/demarrage/regbl.server";

// Aucun appel réseau réel : `fetch` est remplacé. Les charges utiles sont
// celles relevées le 3 septembre 2026 sur api3.geo.admin.ch, y compris les
// réponses pièges (voir `.decisions/note-2026-09-03-regbl.md`).

const LIEN_REGBL = {
  title: "ch.bfs.gebaeude_wohnungs_register",
  href: "/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/2037304_3",
};

/** Relevé réel : Rue du Rhône 14, Genève. */
const ATTRS_IMMEUBLE = {
  egid: "2037304", gklas: 1122, gkat: 1030, gbauj: 1920, gastw: 8, ganzwhg: 21,
  egrid: "CH296589536314", lparz: "7013", gkode: 2500184.8, gkodn: 1117799.44,
};

const ATTRS_VILLA = { egid: "785458", gklas: 1110, gbauj: 1974, gastw: 2, ganzwhg: 1 };

function reponse(corps: unknown, ok = true) {
  return { ok, json: async () => corps } as Response;
}

/** Répond à la recherche, puis au détail de chaque candidat. */
function simulerFetch(recherche: unknown, attributs: unknown[] = [ATTRS_IMMEUBLE]) {
  let appelDetail = 0;
  return vi.fn(async (url: string | URL) => {
    if (String(url).includes("SearchServer")) return reponse(recherche);
    const attrs = attributs[appelDetail % attributs.length];
    appelDetail += 1;
    return reponse({ feature: { attributes: attrs } });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("deduireReponses", () => {
  it("reconnaît la maison individuelle à sa classe 1110", () => {
    expect(deduireReponses(ATTRS_VILLA)).toEqual({ forme: "maison", niveauxHabitables: 2 });
  });

  it("traite un immeuble de 3 logements et plus comme un logement", () => {
    expect(deduireReponses(ATTRS_IMMEUBLE).forme).toBe("appartement");
  });

  it("retombe sur le nombre de logements quand la classe manque", () => {
    expect(deduireReponses({ ganzwhg: 12 }).forme).toBe("appartement");
    expect(deduireReponses({ ganzwhg: 1 }).forme).toBe("maison");
  });

  it("retombe sur la maison quand tout manque, le cas dominant", () => {
    expect(deduireReponses({})).toEqual({ forme: "maison", niveauxHabitables: 2 });
  });

  it("borne le nombre de niveaux : un immeuble de 8 étages ne fait pas 8 niveaux de saisie", () => {
    expect(deduireReponses({ gastw: 59 }).niveauxHabitables).toBe(8);
    expect(deduireReponses({ gastw: 0 }).niveauxHabitables).toBe(1);
  });

  it("ne déduit JAMAIS le sous-sol : gastw ne compte pas les caves", () => {
    // La propriété qui compte : aucune combinaison d'attributs ne produit une
    // réponse `sousSol`. Le champ n'existe pas dans ce que le RegBL pré-remplit,
    // il est demandé au propriétaire.
    for (const attrs of [ATTRS_VILLA, ATTRS_IMMEUBLE, { gastw: 1 }, { gastw: 8 }, {}]) {
      expect(Object.keys(deduireReponses(attrs)).sort()).toEqual(["forme", "niveauxHabitables"]);
    }
  });
});

describe("decrire", () => {
  it("donne de quoi reconnaître son bâtiment", () => {
    expect(decrire(ATTRS_VILLA)).toBe("Maison individuelle · 2 niveaux · construit en 1974");
    expect(decrire(ATTRS_IMMEUBLE)).toBe("Immeuble, 21 logements · 8 niveaux · construit en 1920");
  });

  it("ne divulgue ni parcelle ni coordonnées", () => {
    const texte = decrire(ATTRS_IMMEUBLE);
    expect(texte).not.toContain("7013");
    expect(texte).not.toContain("CH296589536314");
    expect(texte).not.toContain("2500184");
  });
});

describe("chercherBatiments", () => {
  it("rend des candidats sans EGID, sans parcelle, sans coordonnées", async () => {
    vi.stubGlobal("fetch", simulerFetch({
      results: [{ attrs: { label: "Rue du Rhône 14 <b>1204 Genève</b>", origin: "address", links: [LIEN_REGBL] } }],
    }));

    const resultat = await chercherBatiments("Rue du Rhone 14 Geneve");
    expect(resultat.statut).toBe("ok");
    if (resultat.statut !== "ok") return;

    expect(resultat.candidats).toHaveLength(1);
    const [candidat] = resultat.candidats;
    expect(candidat.etiquette).toBe("Rue du Rhône 14 1204 Genève");
    expect(candidat.rang).toBe(0);

    // Le contrat qui compte : rien du registre au-delà du pré-remplissage.
    const serialise = JSON.stringify(candidat);
    for (const secret of ["2037304", "CH296589536314", "7013", "2500184", "1117799"]) {
      expect(serialise).not.toContain(secret);
    }
    expect(Object.keys(candidat).sort()).toEqual(["description", "etiquette", "rang", "reponses"]);
  });

  it("traite `fuzzy: true` comme aucun résultat — sinon Paris devient le Valais", async () => {
    // Relevé réel : « 10 rue de Rivoli Paris » renvoie « Ruelle de Paris 10,
    // 3966 Chalais ». Sans ce rejet, un propriétaire parisien recevrait le
    // squelette d'une maison valaisanne.
    vi.stubGlobal("fetch", simulerFetch({
      fuzzy: true,
      results: [{ attrs: { label: "Ruelle de Paris 10 <b>3966 Chalais</b>", origin: "address", links: [LIEN_REGBL] } }],
    }));

    expect(await chercherBatiments("10 rue de Rivoli Paris")).toEqual({ statut: "aucun" });
  });

  it("traite aussi la variante chaîne de `fuzzy`", async () => {
    vi.stubGlobal("fetch", simulerFetch({
      fuzzy: "true",
      results: [{ attrs: { label: "Chemin de Rive 999 <b>1350 Orbe</b>", origin: "address", links: [LIEN_REGBL] } }],
    }));

    expect(await chercherBatiments("zzzzqqq 999")).toEqual({ statut: "aucun" });
  });

  it("écarte les résultats qui ne sont pas des adresses — `origin=address` n'est pas un filtre", async () => {
    // Relevé réel : sans correspondance, le service rend une « Grossregion ».
    vi.stubGlobal("fetch", simulerFetch({
      results: [
        { attrs: { label: "<i>Grossregion</i> <b>Mittelland</b>", origin: "gazetteer", links: [] } },
        { attrs: { label: "Rue du Rhône 14 <b>1204 Genève</b>", origin: "address", links: [LIEN_REGBL] } },
      ],
    }));

    const resultat = await chercherBatiments("Mittelland");
    expect(resultat.statut).toBe("ok");
    if (resultat.statut !== "ok") return;
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].etiquette).toContain("Rue du Rhône");
  });

  it("écarte une adresse sans bâtiment derrière", async () => {
    vi.stubGlobal("fetch", simulerFetch({
      results: [{ attrs: { label: "Quelque part", origin: "address", links: [{ title: "ch.swisstopo.autre", href: "/x/1" }] } }],
    }));

    expect(await chercherBatiments("Quelque part")).toEqual({ statut: "aucun" });
  });

  it("rend plusieurs candidats numérotés, pour que le choix reste au propriétaire", async () => {
    vi.stubGlobal("fetch", simulerFetch(
      {
        results: [
          { attrs: { label: "Unterdorfstrasse 10 <b>3800 Matten</b>", origin: "address", links: [LIEN_REGBL] } },
          { attrs: { label: "Alte Unterdorfstrasse 10 <b>3800 Matten</b>", origin: "address", links: [LIEN_REGBL] } },
        ],
      },
      [ATTRS_VILLA, ATTRS_IMMEUBLE],
    ));

    const resultat = await chercherBatiments("Dorfstrasse 10 3800 Interlaken");
    expect(resultat.statut).toBe("ok");
    if (resultat.statut !== "ok") return;
    // Aucune sélection automatique : les deux remontent, avec leur rang.
    expect(resultat.candidats.map((c) => c.rang)).toEqual([0, 1]);
    expect(resultat.candidats[0].reponses.forme).toBe("maison");
    expect(resultat.candidats[1].reponses.forme).toBe("appartement");
  });

  it("dit « indisponible » quand le registre ne répond pas, sans lever", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ETIMEDOUT"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await chercherBatiments("Rue du Rhone 14 Geneve")).toEqual({ statut: "indisponible" });
  });

  it("dit « indisponible » sur une erreur HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(null, false)));
    expect(await chercherBatiments("Rue du Rhone 14 Geneve")).toEqual({ statut: "indisponible" });
  });

  it("n'appelle rien pour une saisie trop courte", async () => {
    const espion = vi.fn();
    vi.stubGlobal("fetch", espion);

    expect(await chercherBatiments("ab")).toEqual({ statut: "aucun" });
    expect(espion).not.toHaveBeenCalled();
  });
});
