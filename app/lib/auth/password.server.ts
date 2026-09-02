// app/lib/auth/password.server.ts
import { hash, verify } from "@node-rs/argon2";

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse);
}

export async function verifierMotDePasse(hashStocke: string, motDePasse: string): Promise<boolean> {
  return verify(hashStocke, motDePasse);
}
