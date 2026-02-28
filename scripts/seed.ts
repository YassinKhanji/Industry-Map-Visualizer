/**
 * Seed script — loads the prebuilt financial-services map into Neon
 * and creates embedding entries for all known aliases so fuzzy matches
 * resolve instantly from the database.
 *
 * Run with: npx tsx scripts/seed.ts
 */

import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const BATCH_SIZE = 20; // OpenAI embedding batch limit is generous, but keep it sane

async function embedBatch(client: OpenAI, texts: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts.map((t) => t.toLowerCase().trim()),
  });
  return res.data.map((d) => d.embedding);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!dbUrl) { console.error("DATABASE_URL not set"); process.exit(1); }
  if (!apiKey) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

  const sql = neon(dbUrl);
  const openai = new OpenAI({ apiKey });

  // ── 1. Load the prebuilt map JSON ──
  const mapPath = path.resolve(
    process.cwd(),
    "src/data/blocks/financial-services.json"
  );
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf-8"));
  const mapData = {
    industry: raw.industry,
    rootNodes: raw.rootNodes,
    edges: raw.edges,
  };

  const slug = "financial-services-investment-products";
  const industryName = raw.industry as string; // "Financial Services & Investment Products"

  console.log(`Seeding map: ${industryName} (slug: ${slug})`);

  // ── 2. Upsert the map row ──
  const mapRows = await sql`
    INSERT INTO industry_maps (slug, industry_name, map_data)
    VALUES (${slug}, ${industryName}, ${JSON.stringify(mapData)}::jsonb)
    ON CONFLICT (slug) DO UPDATE SET
      map_data = EXCLUDED.map_data,
      industry_name = EXCLUDED.industry_name
    RETURNING id
  `;
  const mapId = mapRows[0].id as number;
  console.log(`Map row upserted — id=${mapId}`);

  // ── 3. Load aliases ──
  const aliasPath = path.resolve(process.cwd(), "src/data/aliases.json");
  const allAliases = JSON.parse(fs.readFileSync(aliasPath, "utf-8"));
  const financialAliases: string[] = allAliases["financial-services"] ?? [];

  // Also add the industry name itself as a query
  const queries = [industryName.toLowerCase(), ...financialAliases];
  // Deduplicate
  const uniqueQueries = [...new Set(queries.map((q) => q.toLowerCase().trim()))];

  // ── 3b. Check which queries already have embeddings (resume support) ──
  const existingRows = await sql`
    SELECT query_text FROM map_queries WHERE map_id = ${mapId}
  `;
  const existingSet = new Set(existingRows.map((r) => r.query_text as string));
  const pendingQueries = uniqueQueries.filter((q) => !existingSet.has(q));

  if (pendingQueries.length === 0) {
    console.log(`All ${uniqueQueries.length} queries already seeded. Nothing to do.`);
    return;
  }

  console.log(
    `Embedding ${pendingQueries.length} queries (${existingSet.size} already done)...`
  );

  // ── 4. Generate embeddings in batches, one query at a time for resilience ──
  let inserted = 0;
  for (let i = 0; i < pendingQueries.length; i += BATCH_SIZE) {
    const batch = pendingQueries.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`  Batch ${batchNum}: ${batch.length} queries`);

    let embeddings: number[][];
    try {
      embeddings = await embedBatch(openai, batch);
    } catch (err: unknown) {
      const msg = (err as Error).message || String(err);
      if (msg.includes("429") || msg.includes("quota") || msg.includes("rate")) {
        console.warn(`  Rate limited at batch ${batchNum}. Waiting 60s then retrying...`);
        await sleep(60_000);
        try {
          embeddings = await embedBatch(openai, batch);
        } catch (retryErr) {
          console.error(`  Retry failed. ${inserted} queries seeded so far. Re-run to resume.`);
          break;
        }
      } else {
        console.error(`  Embedding error: ${msg}`);
        console.error(`  ${inserted} queries seeded so far. Re-run to resume.`);
        break;
      }
    }

    // Insert each query
    for (let j = 0; j < batch.length; j++) {
      const queryText = batch[j];
      const embeddingStr = `[${embeddings![j].join(",")}]`;

      try {
        await sql`
          INSERT INTO map_queries (map_id, query_text, embedding)
          VALUES (${mapId}, ${queryText}, ${embeddingStr}::vector)
          ON CONFLICT (query_text) DO NOTHING
        `;
        inserted++;
      } catch (err) {
        console.warn(`  Skipped "${queryText}": ${(err as Error).message}`);
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < pendingQueries.length) {
      await sleep(500);
    }
  }

  console.log(`Inserted ${inserted}/${pendingQueries.length} query embeddings.`);
  console.log("Seed complete! Re-run if any were skipped.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
