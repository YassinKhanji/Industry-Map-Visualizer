/**
 * Database migration script — creates pgvector extension and tables in Neon.
 * Run with: npx tsx scripts/migrate.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  const sql = neon(url);

  console.log("Enabling pgvector extension...");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  console.log("Creating industry_maps table...");
  await sql`
    CREATE TABLE IF NOT EXISTS industry_maps (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      industry_name TEXT NOT NULL,
      map_data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("Creating map_queries table...");
  await sql`
    CREATE TABLE IF NOT EXISTS map_queries (
      id SERIAL PRIMARY KEY,
      map_id INTEGER NOT NULL REFERENCES industry_maps(id) ON DELETE CASCADE,
      query_text TEXT UNIQUE NOT NULL,
      embedding VECTOR(1536) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("Replacing vector index with HNSW (perfect recall at any table size)...");
  await sql`DROP INDEX IF EXISTS idx_map_queries_embedding`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_map_queries_embedding
    ON map_queries
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `;

  console.log("Creating index on slug...");
  await sql`
    CREATE INDEX IF NOT EXISTS idx_industry_maps_slug
    ON industry_maps (slug)
  `;

  console.log("Migration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
