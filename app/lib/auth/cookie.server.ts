// app/lib/auth/cookie.server.ts
import { createCookie } from "react-router";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET manquant (voir .env.example).");
}

export const sessionCookie = createCookie("gi_session", {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  secrets: [process.env.SESSION_SECRET],
  maxAge: 60 * 60 * 24 * 30, // 30 jours
  path: "/",
});
