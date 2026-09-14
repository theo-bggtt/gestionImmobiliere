// tests/vitrine/discours.test.ts
// Ce que la vitrine n'a pas le droit de dire.
//
// Une page de vente est le seul endroit du dépôt où la tentation d'avancer un
// chiffre est structurelle : un chiffre rassure, et personne ne le recoupe.
// Or deux des chiffres les plus tentants ne sont PAS mesurés — le critère des
// 30 secondes n'a jamais été chronométré sur un téléphone réel, et le
// démarrage sans réseau n'a été constaté qu'au navigateur, jamais sur le
// terrain (issue #25, « ce qui n'a pas pu être vérifié »).
//
// Le mot interdit de la règle #12, lui, est déjà tenu pour tout `app/` par
// `tests/vocabulaire.test.ts` : inutile de le redire ici.
import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const RACINE = "app/routes/_vitrine";

/** Ce qui ne s'écrit pas, et la raison — la raison est dans le message
 *  d'échec, parce qu'un test qui dit « interdit » sans dire pourquoi se fait
 *  contourner par la première personne pressée. */
const INTERDITS = [
  {
    motif: /\b\d+\s*secondes?\b/i,
    pourquoi: "un temps de saisie chiffré : les 30 secondes n'ont jamais été chronométrées sur un téléphone réel",
  },
  {
    motif: /hors[-  ]ligne|offline/i,
    pourquoi: "une promesse de fonctionnement sans réseau : constatée au navigateur seulement, jamais sur le terrain",
  },
  {
    motif: /\b\d+[\s ]*(€|chf|euros?|francs?)\b|\bpar mois\b|\babonnement\b|\bgratuit\b/i,
    pourquoi: "un tarif ou un modèle économique : la décision #1 est à rejouer, il n'y a pas de prix décidé",
  },
  {
    motif: /\brgpd\b|\bconforme (à|au|aux)\b|\bnous garantissons\b|\bconformément à la loi\b/i,
    pourquoi: "une affirmation juridique : le dépôt n'en fait nulle part, ce n'est pas ici que ça commence",
  },
  {
    motif: /\b\d[\d  ]*\s*(utilisateurs?|inscrits?|clients?|maisons?|propriétaires?)\b/i,
    pourquoi: "un compte d'utilisateurs : il n'y en a pas, et il se lirait en base",
  },
];

async function pages(): Promise<Array<{ nom: string; source: string }>> {
  const noms = await readdir(RACINE);
  return Promise.all(noms.map(async (nom) => ({ nom, source: await readFile(join(RACINE, nom), "utf-8") })));
}

describe("la vitrine n'avance rien qui n'ait été mesuré", () => {
  it("aucun des motifs interdits, dans aucune des pages", async () => {
    const fichiers = await pages();
    // Le balayage doit voir les cinq pages et leur charpente.
    expect(fichiers.length).toBeGreaterThanOrEqual(6);

    const fautes: string[] = [];
    for (const { nom, source } of fichiers) {
      source.split("\n").forEach((ligne, i) => {
        // Les commentaires disent justement POURQUOI ces mots sont bannis :
        // les inclure ferait échouer le test sur sa propre explication.
        const nu = ligne.replace(/^\s*(\/\/|\*|\/\*).*$/, "");
        for (const { motif, pourquoi } of INTERDITS) {
          if (motif.test(nu)) fautes.push(`${nom}:${i + 1} — ${pourquoi}\n    ${ligne.trim()}`);
        }
      });
    }
    expect(fautes).toEqual([]);
  });

  it("détecte une phrase fautive (contrôle du balayage)", () => {
    // Sans ce contrôle, « aucune faute » ne distinguerait pas une vitrine
    // sobre d'une expression régulière qui ne s'accroche à rien.
    const echantillon = [
      "Consignez un objet en 30 secondes.",
      "Fonctionne hors ligne, même à la cave.",
      "9 € par mois, et gratuit le premier mois.",
      "Conforme au RGPD.",
      "Déjà 42 utilisateurs.",
    ];
    for (const phrase of echantillon) {
      expect(INTERDITS.some(({ motif }) => motif.test(phrase)), phrase).toBe(true);
    }
    expect(INTERDITS.some(({ motif }) => motif.test("Une fiche par objet, rangée là où il est."))).toBe(false);
  });
});

describe("la vitrine ne montre aucune image", () => {
  it("aucune balise image ni aucun actif de la vraie propriété", async () => {
    // Aucune capture de la vraie maison, et pas d'image du tout aujourd'hui :
    // c'est la forme la plus simple de la règle, et elle se vérifie. Le jour
    // où une illustration arrive, ce test demandera de dire d'où elle vient.
    const fautes = (await pages())
      .filter(({ source }) => /<img\b|backgroundImage|url\(/.test(source))
      .map(({ nom }) => nom);
    expect(fautes).toEqual([]);
  });
});
