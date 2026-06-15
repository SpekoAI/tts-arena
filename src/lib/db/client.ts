/**
 * Drizzle client over the Neon HTTP serverless driver.
 *
 * The HTTP driver issues stateless fetch-based queries — no connection pool,
 * no VPC — which is exactly what Cloud Run wants for short-lived requests.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
const demoMode = process.env.DEMO_MODE === "1";
if (!databaseUrl && !demoMode) {
  throw new Error("DATABASE_URL is not set");
}

// In DEMO_MODE the API routes short-circuit before touching `db`, so a missing
// connection string is fine — `db` is never used. We still export a typed value
// so route modules import-resolve cleanly.
const sql = databaseUrl ? neon(databaseUrl) : null;

export const db = (
  sql ? drizzle(sql, { schema }) : (null as unknown)
) as ReturnType<typeof drizzle<typeof schema>>;

export { schema };
