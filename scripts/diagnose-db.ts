/**
 * Quick diagnostic: test Neon DB connection, check index type, and run vector search.
 */
import "dotenv/config";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Test 1: Basic connection + row count
  console.log("── Test 1: Basic connection ──");
  const t0 = Date.now();
  const r1 = await sql`SELECT count(*) as cnt FROM map_queries`;
  console.log(`  map_queries rows: ${r1[0].cnt} (${Date.now() - t0}ms)`);

  const r1b = await sql`SELECT count(*) as cnt FROM industry_maps`;
  console.log(`  industry_maps rows: ${r1b[0].cnt}`);

  // Test 2: Check index type
  console.log("\n── Test 2: Index check ──");
  const r2 = await sql`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'map_queries' AND indexname LIKE '%embedding%'
  `;
  if (r2.length === 0) {
    console.log("  ⚠ NO embedding index found!");
  } else {
    for (const idx of r2) {
      console.log(`  ${idx.indexname}: ${idx.indexdef}`);
    }
  }

  // Test 3: Vector search for "grains"
  console.log("\n── Test 3: Vector search for 'grains' ──");
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: "grains",
  });
  const vec = emb.data[0].embedding;
  const embStr = `[${vec.join(",")}]`;

  const t1 = Date.now();
  const r3 = await sql`
    SELECT mq.map_id, im.industry_name, im.slug,
           mq.embedding <=> ${embStr}::vector AS distance
    FROM map_queries mq
    JOIN industry_maps im ON im.id = mq.map_id
    ORDER BY mq.embedding <=> ${embStr}::vector
    LIMIT 5
  `;
  console.log(`  Query took ${Date.now() - t1}ms, ${r3.length} results:`);
  for (const r of r3) {
    const dist = parseFloat(r.distance as string);
    const sim = (1 - dist).toFixed(4);
    console.log(`    ${r.industry_name} (${r.slug}) — distance: ${dist.toFixed(4)}, similarity: ${sim}`);
  }

  // Test 4: Check what industry_maps exist
  console.log("\n── Test 4: All stored maps ──");
  const r4 = await sql`SELECT id, slug, industry_name FROM industry_maps ORDER BY id`;
  for (const r of r4) {
    console.log(`  [${r.id}] ${r.slug} → ${r.industry_name}`);
  }

  // Test 5: Sample query texts
  console.log("\n── Test 5: Sample query aliases ──");
  const r5 = await sql`SELECT map_id, query_text FROM map_queries ORDER BY map_id, query_text LIMIT 20`;
  for (const r of r5) {
    console.log(`  map_id=${r.map_id}: "${r.query_text}"`);
  }

  console.log("\n✔ Diagnostic complete");
}

main().catch((e) => {
  console.error("Diagnostic failed:", e);
  process.exit(1);
});
