/**
 * Dependency-free anti-gaming primitives for the anonymous TTS Arena.
 *
 * Three concerns, kept tiny and self-contained for the v1 Cloud Run target:
 *   1. `hashIp` — privacy-preserving SHA-256 of the client IP (we never store
 *      the raw address; only an opaque digest used for coarse dedup/abuse work).
 *   2. `rateLimit` — a per-key in-memory token bucket. Good enough to blunt
 *      trivial floods within a single warm instance; not a distributed limiter.
 *   3. `scoreGoldAttempt` — verdict-vs-expected comparison for attention-check
 *      ("gold") pairs, which never count toward the ranking.
 *
 * No external dependencies: hashing uses the Web Crypto API (`globalThis.crypto`),
 * available in the Node.js runtime that the API routes target.
 */

import type { Verdict } from "./types";

/* ------------------------------------------------------------------ */
/* IP hashing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Extract the client IP from a forwarded-for style header value. Proxies append
 * the originating client first, so we take the left-most entry.
 */
export function clientIpFromForwardedFor(
  forwardedFor: string | null | undefined,
): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * SHA-256 the client IP (optionally salted via {@link process.env.IP_HASH_SALT})
 * and return the raw digest bytes as a Buffer — ready to store in the `bytea`
 * `votes.ip_hash` column. Returns `null` when there is no IP to hash.
 *
 * We deliberately store only the digest: it lets us cluster suspicious activity
 * without ever persisting PII.
 */
export async function hashIp(
  ip: string | null | undefined,
): Promise<Buffer | null> {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? "";
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(new Uint8Array(digest));
}

/* ------------------------------------------------------------------ */
/* In-memory token-bucket rate limiter                                 */
/* ------------------------------------------------------------------ */

interface Bucket {
  /** Fractional tokens currently available. */
  tokens: number;
  /** Last refill timestamp (ms epoch). */
  last: number;
}

/**
 * Module-level bucket store. Persists for the life of the warm instance; cold
 * starts reset it, which is acceptable for v1. Keyed by an arbitrary string
 * (we use the IP hash hex, falling back to the anon cookie id).
 */
const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Maximum burst capacity (tokens). Default: 30. */
  capacity?: number;
  /** Sustained refill rate in tokens per minute. Default: 30. */
  refillPerMinute?: number;
}

export interface RateLimitResult {
  /** Whether this request is allowed (a token was available and consumed). */
  allowed: boolean;
  /** Tokens remaining after this check. */
  remaining: number;
  /** Seconds until at least one token is available again (0 if allowed). */
  retryAfterSec: number;
}

/**
 * Consume one token for `key`. Refills continuously at `refillPerMinute`,
 * capped at `capacity`. Pure in-memory, no dependencies — suitable for a single
 * Cloud Run instance. A reverse proxy / Turnstile is the real defense; this is
 * a cheap first gate against naive vote floods.
 */
export function rateLimit(
  key: string,
  opts: RateLimitOptions = {},
): RateLimitResult {
  const capacity = opts.capacity ?? 30;
  const refillPerMinute = opts.refillPerMinute ?? 30;
  const refillPerMs = refillPerMinute / 60_000;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, last: now };
    buckets.set(key, bucket);
  }

  // Continuous refill.
  const elapsed = now - bucket.last;
  if (elapsed > 0) {
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.last = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSec: 0 };
  }

  const needed = 1 - bucket.tokens;
  const retryAfterSec = Math.ceil(needed / refillPerMs / 1000);
  return { allowed: false, remaining: 0, retryAfterSec };
}

/** Best-effort sweep of stale buckets to bound memory on a long-lived instance. */
export function sweepRateLimiter(maxAgeMs = 10 * 60_000): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, bucket] of buckets) {
    if (bucket.last < cutoff) buckets.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* Gold-pair scoring                                                   */
/* ------------------------------------------------------------------ */

/**
 * Score an attention-check vote against the gold pair's expected verdict.
 *
 * A "tie" expected verdict is satisfied only by a "tie" vote. For decisive
 * expected verdicts ("a"/"b") we require an exact match — a tie on a clearly
 * decisive pair is treated as incorrect, which is the conservative choice for
 * an attention check.
 */
export function scoreGoldAttempt(
  verdict: Verdict,
  expected: Verdict,
): boolean {
  return verdict === expected;
}
