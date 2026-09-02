// app/lib/auth/session.server.ts
import { randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { redirect } from "react-router";
import { db } from "../../db/client";
import { session as sessionTable } from "../../db/schema/index";
import { sessionCookie } from "./cookie.server";

const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export async function creerSession(utilisateurId: number, redirectTo: string): Promise<Response> {
  const jeton = randomBytes(32).toString("hex");
  const expireLe = new Date(Date.now() + DUREE_SESSION_MS);

  await db.insert(sessionTable).values({ id: jeton, utilisateurId, expireLe });

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionCookie.serialize(jeton) },
  });
}

async function lireJetonCookie(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie");
  const valeur = await sessionCookie.parse(cookieHeader);
  return typeof valeur === "string" ? valeur : null;
}

export async function getUtilisateurId(request: Request): Promise<number | null> {
  const jeton = await lireJetonCookie(request);
  if (!jeton) return null;

  const [ligne] = await db.select().from(sessionTable)
    .where(and(eq(sessionTable.id, jeton), gt(sessionTable.expireLe, new Date())));

  return ligne?.utilisateurId ?? null;
}

export async function requireUtilisateurId(request: Request): Promise<number> {
  const utilisateurId = await getUtilisateurId(request);
  if (!utilisateurId) {
    throw redirect(`/connexion?depuis=${encodeURIComponent(new URL(request.url).pathname)}`);
  }
  return utilisateurId;
}

export async function detruireSession(request: Request): Promise<Response> {
  const jeton = await lireJetonCookie(request);
  if (jeton) {
    await db.delete(sessionTable).where(eq(sessionTable.id, jeton));
  }
  return redirect("/connexion", {
    headers: { "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }) },
  });
}
