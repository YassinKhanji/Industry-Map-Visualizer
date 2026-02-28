import OpenAI from "openai";
import { getSQL } from "./db";
import type { IndustryMap } from "@/types";

const SIMILARITY_THRESHOLD = 0.82; // cosine similarity — higher = stricter match

/**
 * Generate embedding vector for a text query using text-embedding-3-small.
 */
export async function embed(text: string): Promise<number[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text.toLowerCase().trim(),
  });
  return res.data[0].embedding;
}

/**
 * Search Neon for the most semantically similar stored map.
 * Returns the map + source info if similarity ≥ threshold, else null.
 */
export async function findSimilarMap(
  queryEmbedding: number[]
): Promise<{ mapId: number; slug: string; industryName: string; mapData: IndustryMap } | null> {
  const sql = getSQL();

  // pgvector cosine distance: 1 - similarity. Lower = more similar.
  // So we want distance < (1 - threshold)
  const maxDistance = 1 - SIMILARITY_THRESHOLD;
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const rows = await sql`
    SELECT
      mq.map_id,
      im.slug,
      im.industry_name,
      im.map_data,
      mq.embedding <=> ${embeddingStr}::vector AS distance
    FROM map_queries mq
    JOIN industry_maps im ON im.id = mq.map_id
    ORDER BY mq.embedding <=> ${embeddingStr}::vector
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0];
  const distance = parseFloat(row.distance as string);
  if (distance > maxDistance) return null;

  return {
    mapId: row.map_id as number,
    slug: row.slug as string,
    industryName: row.industry_name as string,
    mapData: row.map_data as IndustryMap,
  };
}

/**
 * Store a newly generated map and its query embedding in Neon.
 */
export async function storeMap(
  slug: string,
  industryName: string,
  mapData: IndustryMap,
  queryText: string,
  queryEmbedding: number[]
): Promise<number> {
  const sql = getSQL();
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Insert the map
  const mapRows = await sql`
    INSERT INTO industry_maps (slug, industry_name, map_data)
    VALUES (${slug}, ${industryName}, ${JSON.stringify(mapData)}::jsonb)
    ON CONFLICT (slug) DO UPDATE SET
      map_data = EXCLUDED.map_data,
      industry_name = EXCLUDED.industry_name
    RETURNING id
  `;

  const mapId = mapRows[0].id as number;

  // Insert the query → map link with embedding
  await sql`
    INSERT INTO map_queries (map_id, query_text, embedding)
    VALUES (${mapId}, ${queryText.toLowerCase().trim()}, ${embeddingStr}::vector)
    ON CONFLICT (query_text) DO NOTHING
  `;

  return mapId;
}

/**
 * Add an additional query alias to an existing map.
 */
export async function addQueryAlias(
  mapId: number,
  queryText: string,
  queryEmbedding: number[]
): Promise<void> {
  const sql = getSQL();
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  await sql`
    INSERT INTO map_queries (map_id, query_text, embedding)
    VALUES (${mapId}, ${queryText.toLowerCase().trim()}, ${embeddingStr}::vector)
    ON CONFLICT (query_text) DO NOTHING
  `;
}
