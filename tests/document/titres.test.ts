// tests/document/titres.test.ts
// Un titre par page — le mécanisme, pas les titres eux-mêmes.
//
// `root.tsx` rendait `<Meta />` puis un `<title>` en dur, et le second
// gagnait : aucune route ne pouvait donner le sien, et un `meta` de route qui
// en aurait exporté un aurait été ignoré EN SILENCE. Rien ne le signalait,
// parce qu'aucune route n'en exportait.
//
// Ce qui rend le défaut possible est une règle de React Router v7 qu'on ne
// voit pas depuis le code de l'application : le `meta` d'une route REMPLACE
// celui de son parent au lieu de s'y ajouter (vérifié dans le composant
// `Meta` de la version installée : `meta = [...routeMeta]`, et une route sans
// `meta` hérite de `leafMeta`). Une route de `/p/` qui exporte `META_PARTAGE`
// perd donc le titre par défaut de la racine, et il faut qu'il soit dedans.
import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { META_PARTAGE, TITRE_PARTAGE } from "../../app/lib/partage/document";

const titreDe = (meta: Array<Record<string, unknown>>) =>
  meta.find((m) => "title" in m)?.title;

describe("le document de partage dit les deux choses à la fois", () => {
  it("META_PARTAGE porte un titre ET robots", () => {
    // Les deux ensemble, pour qu'on ne puisse pas en oublier un : sans titre
    // la page n'en a aucun, sans `robots` un jeton peut entrer dans un index.
    expect(titreDe(META_PARTAGE)).toBe(TITRE_PARTAGE);
    expect(META_PARTAGE).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });

  it("le titre d'un partage ne vient d'aucune donnée", () => {
    // Neutre et FIXE. Un titre d'onglet part dans toutes les captures
    // d'écran, et `propriete.nom` est le champ le plus exposé du modèle.
    expect(typeof TITRE_PARTAGE).toBe("string");
    expect(TITRE_PARTAGE.length).toBeGreaterThan(0);
    // `META_PARTAGE` est une constante, pas une fonction d'un loader : elle
    // n'a structurellement rien à quoi puiser.
    expect(Array.isArray(META_PARTAGE)).toBe(true);
  });
});

describe("la racine laisse les routes parler", () => {
  it("root.tsx ne rend plus de <title> en dur, et exporte un meta", async () => {
    const source = await readFile("app/root.tsx", "utf-8");
    // Un `<title>` littéral dans le `<head>` regagnerait sur `<Meta />` et
    // reprendrait leur titre à toutes les routes, sans rien casser de visible.
    expect(source).not.toMatch(/<title>/);
    expect(source).toMatch(/export const meta\b/);
  });
});

describe("toutes les routes de partage passent par la même constante", () => {
  it("aucune n'écrit son meta à la main", async () => {
    const dossier = "app/routes/_partage";
    const fautives: string[] = [];
    for (const nom of await readdir(dossier)) {
      const source = await readFile(join(dossier, nom), "utf-8");
      const exporte = /export const meta\b[^\n]*/.exec(source)?.[0];
      if (!exporte) continue;
      // Une route qui construirait son tableau sur place pourrait en oublier
      // la moitié — c'est exactement ce qui était arrivé au titre.
      if (!exporte.includes("META_PARTAGE")) fautives.push(`${nom} : ${exporte}`);
    }
    expect(fautives).toEqual([]);
    // Le balayage doit voir quelque chose, sinon « aucune fautive » ne
    // voudrait rien dire.
    const avecMeta = (
      await Promise.all(
        (await readdir(dossier)).map(async (n) => /export const meta\b/.test(await readFile(join(dossier, n), "utf-8"))),
      )
    ).filter(Boolean);
    expect(avecMeta.length).toBeGreaterThanOrEqual(4);
  });
});
