// tests/auth/compte.test.ts
// `npm run compte` (issue #64) : le seul chemin pour un mot de passe oublié.
// Ce qui est tenu ici, c'est qu'il REMET sans dupliquer — un second compte
// créé à côté du premier laisserait le propriétaire dehors en croyant l'avoir
// réparé, et c'est précisément le cas que la normalisation de l'adresse ferme.
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../setup/test-db";
import { utilisateur } from "../../app/db/schema/index";
import { verifierMotDePasse } from "../../app/lib/auth/password.server";
import { MOT_DE_PASSE_MIN, poserMotDePasse } from "../../scripts/compte";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM utilisateur`);
});

const comptes = async () => db.select().from(utilisateur);

describe("poser un mot de passe", () => {
  it("crée le compte absent, puis remet son mot de passe sans en créer un second", async () => {
    expect(await poserMotDePasse("moi@x.local", "premier-mot-de-passe")).toBe("cree");
    expect(await poserMotDePasse("moi@x.local", "second-mot-de-passe")).toBe("remis");

    const lignes = await comptes();
    expect(lignes).toHaveLength(1);
    // L'ancien ne passe plus, le nouveau passe : c'est tout ce qu'on demande.
    expect(await verifierMotDePasse(lignes[0].motDePasseHash, "premier-mot-de-passe")).toBe(false);
    expect(await verifierMotDePasse(lignes[0].motDePasseHash, "second-mot-de-passe")).toBe(true);
  });

  it("normalise l'adresse comme l'écran d'inscription", async () => {
    // Sans ça, `Theo@X.local ` créerait un compte À CÔTÉ de `theo@x.local` :
    // la commande dirait « créé », et le propriétaire resterait dehors.
    await poserMotDePasse("moi@x.local", "premier-mot-de-passe");
    expect(await poserMotDePasse("  MOI@X.Local  ", "second-mot-de-passe")).toBe("remis");

    const lignes = await comptes();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].email).toBe("moi@x.local");
  });

  it("refuse un mot de passe trop court et une adresse sans arobase, sans rien écrire", async () => {
    await expect(poserMotDePasse("moi@x.local", "a".repeat(MOT_DE_PASSE_MIN - 1))).rejects.toThrow("trop court");
    await expect(poserMotDePasse("pas-une-adresse", "mot-de-passe-assez-long")).rejects.toThrow("invalide");
    expect(await comptes()).toHaveLength(0);
  });

  it("garde le même plancher de longueur que l'écran d'inscription", async () => {
    // Duplication assumée (la constante est écrite ici et dans `register.tsx`),
    // donc épinglée : si l'un des deux bouge, ce test dit lequel.
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/routes/_public/register.tsx", "utf-8"),
    );
    expect(source).toContain(`motDePasse.length < ${MOT_DE_PASSE_MIN}`);
  });
});
