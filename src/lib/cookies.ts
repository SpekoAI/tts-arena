/**
 * Anonymous cookie helpers for the TTS Arena.
 *
 * Identity in this arena is intentionally non-identifying: a random UUID stored
 * in the `anon_id` cookie (rate-limit / dedup / streak only) and a declared
 * native language in the `lang` cookie (one-tap, no verification). There is no
 * account, no login, and no PII.
 *
 * Server helpers use `next/headers` cookies(); the client helper uses
 * `document.cookie`. Keep this file isomorphic-safe — the client export does not
 * touch `next/headers`.
 */

import { cookies } from "next/headers";

export const ANON_COOKIE = "anon_id";
export const LANG_COOKIE = "lang";

/** One year, in seconds — these cookies are long-lived and harmless. */
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

/* ------------------------------------------------------------------ */
/* Server-side (next/headers)                                          */
/* ------------------------------------------------------------------ */

/** Read the anon id from the request cookies, or `null` if unset. */
export async function readAnonId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ANON_COOKIE)?.value ?? null;
}

/**
 * Read the existing anon id, or mint + persist a new UUID. Returns the id and
 * whether it was freshly created (callers may use this to decide whether the
 * Set-Cookie matters). Note: in Next.js Route Handlers the cookie write only
 * takes effect when set during a request that returns a response; mutating the
 * `cookies()` store inside a GET/POST handler is supported.
 */
export async function ensureAnonId(): Promise<{ anonId: string; created: boolean }> {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  if (existing) return { anonId: existing, created: false };

  const anonId = crypto.randomUUID();
  store.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
  return { anonId, created: true };
}

/** Read the declared native language from the `lang` cookie, or `null`. */
export async function readLang(): Promise<string | null> {
  const store = await cookies();
  return store.get(LANG_COOKIE)?.value ?? null;
}

/**
 * Persist the declared language server-side. The picker primarily sets this via
 * the client helper; this exists for completeness / route-handler use.
 * Not httpOnly so the client can read it for redirect/UI decisions.
 */
export async function writeLang(code: string): Promise<void> {
  const store = await cookies();
  store.set(LANG_COOKIE, code, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
}

/* ------------------------------------------------------------------ */
/* Client-side (document.cookie)                                       */
/* ------------------------------------------------------------------ */

/**
 * Set the declared language from a client component (the language picker).
 * Mirrors {@link writeLang}'s attributes. No-op on the server.
 */
export function setLangCookieClient(code: string): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${LANG_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${ONE_YEAR_SEC}; SameSite=Lax${secure}`;
}

/** Read a cookie value from a client component. Returns `null` if absent. */
export function readCookieClient(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}
