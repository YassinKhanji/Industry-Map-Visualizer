import { neon } from "@neondatabase/serverless";

/**
 * Neon serverless SQL client.
 * Uses HTTP-based queries (no persistent connection pool needed).
 */
export function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}
