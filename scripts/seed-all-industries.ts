/**
 * Bulk seed script — generates maps for every leaf in the industry taxonomy.
 *
 * Run:  npx tsx scripts/seed-all-industries.ts
 * Opts: --concurrency=3  (parallel workers, default 3)
 *       --dry-run        (list queries without calling APIs)
 *       --start=100      (skip first N leaves — resume after crash)
 *
 * The script is resume-friendly: it embeds each query first and checks Neon
 * for a semantic match. If the map already exists it skips and moves on.
 *
 * Progress is logged to stdout AND written to scripts/seed-progress.json
 * so you can ctrl-C and resume later.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { INDUSTRY_TAXONOMY } from "../src/data/taxonomy-industries";
import type { TaxonomyNode } from "../src/data/taxonomy-industries";
import { embed, findSimilarMap, storeMap } from "../src/lib/embeddings";
import { deepResearch, slugify } from "../src/lib/research";

// ─── CLI args ───
const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : fallback;
}
const CONCURRENCY = parseInt(getArg("concurrency", "3"), 10);
const DRY_RUN = args.includes("--dry-run");
const START_INDEX = parseInt(getArg("start", "0"), 10);

// ─── Collect all leaf queries ───
function collectLeaves(nodes: TaxonomyNode[], breadcrumb: string[] = []): { query: string; path: string }[] {
  const results: { query: string; path: string }[] = [];
  for (const node of nodes) {
    const crumb = [...breadcrumb, node.label];
    if (node.searchQuery) {
      results.push({ query: node.searchQuery, path: crumb.join(" > ") });
    }
    if (node.children) {
      results.push(...collectLeaves(node.children, crumb));
    }
  }
  return results;
}

const ALL_LEAVES = collectLeaves(INDUSTRY_TAXONOMY);

// ─── Progress tracking ───
const PROGRESS_FILE = path.resolve(__dirname, "seed-progress.json");

interface ProgressState {
  total: number;
  completed: string[];    // query strings already done
  skipped: string[];      // already existed in DB
  failed: string[];       // errored
  startedAt: string;
  lastUpdated: string;
}

function loadProgress(): ProgressState {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    } catch { /* corrupted — start fresh */ }
  }
  return {
    total: ALL_LEAVES.length,
    completed: [],
    skipped: [],
    failed: [],
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

function saveProgress(state: ProgressState) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
}

// ─── Delay helper ───
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Process one leaf ───
async function processLeaf(
  leaf: { query: string; path: string },
  index: number,
  total: number,
  state: ProgressState
): Promise<"completed" | "skipped" | "failed"> {
  const tag = `[${index + 1}/${total}]`;

  try {
    // 1. Embed
    const queryEmbedding = await embed(leaf.query);

    // 2. Check if map already exists
    const existing = await findSimilarMap(queryEmbedding);
    if (existing) {
      console.log(`${tag} SKIP (matched "${existing.industryName}") — ${leaf.query}`);
      state.skipped.push(leaf.query);
      saveProgress(state);
      return "skipped";
    }

    // 3. Deep research
    console.log(`${tag} RESEARCHING — ${leaf.query}`);
    console.log(`    ${leaf.path}`);
    const t0 = Date.now();

    const map = await deepResearch(leaf.query, (p) => {
      process.stdout.write(`    ${p.pct}% ${p.message}\r`);
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const nodeCount = countNodes(map.rootNodes);
    console.log(
      `${tag} DONE in ${elapsed}s — "${map.industry}" (${nodeCount} nodes, ${map.edges.length} edges, archetype: ${map.archetype || "?"})`
    );

    // 4. Store
    const slug = slugify(map.industry);
    await storeMap(slug, map.industry, map, leaf.query, queryEmbedding);

    state.completed.push(leaf.query);
    saveProgress(state);
    return "completed";
  } catch (err: any) {
    console.error(`${tag} FAILED — ${leaf.query}: ${err.message || err}`);
    state.failed.push(leaf.query);
    saveProgress(state);

    // Back off on rate limit errors
    if (err?.status === 429 || err?.message?.includes("429")) {
      console.log("    Rate limited — waiting 60s...");
      await sleep(60_000);
    }

    return "failed";
  }
}

function countNodes(blocks: any[]): number {
  let c = 0;
  for (const b of blocks) {
    c++;
    if (b.subNodes) c += countNodes(b.subNodes);
  }
  return c;
}

// ─── Concurrency-limited runner ───
async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
) {
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx], idx);
      // Small delay between requests to be polite to APIs
      await sleep(1000);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

// ─── Main ───
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Industry Map Bulk Seed");
  console.log(`  Total leaves: ${ALL_LEAVES.length}`);
  console.log(`  Concurrency:  ${CONCURRENCY}`);
  console.log(`  Start index:  ${START_INDEX}`);
  console.log(`  Dry run:      ${DRY_RUN}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (DRY_RUN) {
    ALL_LEAVES.forEach((l, i) => {
      console.log(`  ${String(i + 1).padStart(3)}. ${l.query}`);
      console.log(`       ${l.path}`);
    });
    console.log(`\nTotal: ${ALL_LEAVES.length} queries`);
    return;
  }

  const state = loadProgress();
  const alreadyDone = new Set([...state.completed, ...state.skipped]);

  // Filter to only pending leaves
  const pending = ALL_LEAVES.slice(START_INDEX).filter((l) => !alreadyDone.has(l.query));

  console.log(`Already completed: ${state.completed.length}`);
  console.log(`Already skipped:   ${state.skipped.length}`);
  console.log(`Previously failed: ${state.failed.length}`);
  console.log(`Pending this run:  ${pending.length}\n`);

  if (pending.length === 0) {
    console.log("Nothing to do — all leaves already processed!");
    return;
  }

  // Clear failed list for retry
  state.failed = [];
  saveProgress(state);

  const t0 = Date.now();

  await runPool(pending, CONCURRENCY, async (leaf, i) => {
    await processLeaf(leaf, START_INDEX + i, ALL_LEAVES.length, state);
  });

  const totalTime = ((Date.now() - t0) / 1000 / 60).toFixed(1);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  COMPLETE");
  console.log(`  Completed: ${state.completed.length}`);
  console.log(`  Skipped:   ${state.skipped.length}`);
  console.log(`  Failed:    ${state.failed.length}`);
  console.log(`  Time:      ${totalTime} minutes`);
  console.log("═══════════════════════════════════════════════════════════");

  if (state.failed.length > 0) {
    console.log("\nFailed queries:");
    state.failed.forEach((q) => console.log(`  - ${q}`));
    console.log("\nRe-run the script to retry failed queries.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
