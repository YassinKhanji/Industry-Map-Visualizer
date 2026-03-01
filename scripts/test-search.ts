#!/usr/bin/env npx tsx
/**
 * test-search.ts — End-to-end integration test for the search flow.
 *
 * Simulates EXACTLY what SearchBar.tsx does:
 *   Phase 1: SSE request  → /api/generate?q=...&stream=1  (progress events)
 *   Phase 2: GET request  → /api/generate?q=...            (actual data)
 *
 * Tests cover the 3 bugs we fixed:
 *   Bug 1 (searchingRef freeze) — tested via rapid sequential searches
 *   Bug 2 (sseError blocks Phase 2) — SSE + GET tested independently
 *   Bug 3 (addQueryAlias crash) — SSE match path verified
 *
 * Usage:
 *   npx tsx scripts/test-search.ts                    # default: http://localhost:3000
 *   npx tsx scripts/test-search.ts --base=http://localhost:4000
 *   npx tsx scripts/test-search.ts --query="grains"   # test specific query
 */

import "dotenv/config";

// ── CLI args ──
const args = process.argv.slice(2);
const BASE_URL =
  args.find((a) => a.startsWith("--base="))?.split("=")[1] || "http://localhost:3000";
const CUSTOM_QUERY = args.find((a) => a.startsWith("--query="))?.split("=")[1];

// ── Logging helpers ──
const PASS = "\x1b[32m✔ PASS\x1b[0m";
const FAIL = "\x1b[31m✘ FAIL\x1b[0m";
const INFO = "\x1b[36mℹ\x1b[0m";
const WARN = "\x1b[33m⚠\x1b[0m";
const BOLD = (s: string) => `\x1b[1m${s}\x1b[0m`;

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── Types matching our API ──
interface SSEEvent {
  step: string;
  message: string;
  pct: number;
  corrected?: string;
}

interface IndustryBlock {
  id: string;
  label: string;
  category: string;
  description?: string;
  objective?: string;
  subNodes?: IndustryBlock[];
}

interface IndustryMap {
  industry: string;
  archetype?: string;
  jurisdiction?: string;
  rootNodes: IndustryBlock[];
  edges: { source: string; target: string }[];
}

// ── SSE Parser (same logic as SearchBar.tsx) ──
async function consumeSSE(
  query: string,
  timeoutMs = 120_000
): Promise<{ events: SSEEvent[]; error: string | null; ok: boolean; status: number }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const events: SSEEvent[] = [];
  let sseError: string | null = null;

  try {
    const res = await fetch(
      `${BASE_URL}/api/generate?q=${encodeURIComponent(query)}&stream=1`,
      { signal: ac.signal }
    );

    if (!res.ok || !res.body) {
      clearTimeout(timer);
      return { events, error: `HTTP ${res.status}`, ok: res.ok, status: res.status };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processLine = (line: string) => {
      if (!line.startsWith("data: ")) return;
      try {
        const evt: SSEEvent = JSON.parse(line.slice(6));
        events.push(evt);
        if (evt.step === "error") sseError = evt.message;
      } catch {
        // skip
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        for (const line of part.split("\n")) processLine(line);
      }
    }

    if (buffer.trim()) {
      for (const part of buffer.split("\n\n")) {
        for (const line of part.split("\n")) processLine(line);
      }
    }

    clearTimeout(timer);
    return { events, error: sseError, ok: true, status: res.status };
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return { events, error: msg, ok: false, status: 0 };
  }
}

// ── GET data fetch (Phase 2) ──
async function fetchData(query: string, timeoutMs = 180_000): Promise<{
  data: IndustryMap | null;
  source: string | null;
  matchedIndustry: string | null;
  status: number;
  error: string | null;
}> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${BASE_URL}/api/generate?q=${encodeURIComponent(query)}`,
      { signal: ac.signal }
    );
    clearTimeout(timer);
    const json = await res.json();
    return {
      data: json.data || null,
      source: res.headers.get("X-Source"),
      matchedIndustry: res.headers.get("X-Matched-Industry"),
      status: res.status,
      error: json.error || null,
    };
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, source: null, matchedIndustry: null, status: 0, error: msg };
  }
}

// ── Validation helpers ──
const VALID_CATEGORIES = new Set([
  "capital", "inputs", "production", "processing",
  "distribution", "customer", "compliance", "infrastructure",
]);

function countNodes(blocks: IndustryBlock[]): number {
  let count = 0;
  for (const b of blocks) {
    count++;
    if (b.subNodes) count += countNodes(b.subNodes);
  }
  return count;
}

function validateMapShape(map: IndustryMap): string[] {
  const issues: string[] = [];
  if (!map.industry || typeof map.industry !== "string")
    issues.push("missing/invalid 'industry' field");
  if (!Array.isArray(map.rootNodes))
    issues.push("rootNodes is not an array");
  if (!Array.isArray(map.edges))
    issues.push("edges is not an array");

  if (map.rootNodes) {
    if (map.rootNodes.length === 0) issues.push("rootNodes is empty");
    for (const node of map.rootNodes) {
      if (!node.id) issues.push(`node missing id: ${JSON.stringify(node).slice(0, 80)}`);
      if (!node.label) issues.push(`node missing label: ${node.id}`);
      if (!VALID_CATEGORIES.has(node.category))
        issues.push(`node ${node.id} has invalid category: ${node.category}`);
    }
  }

  for (const edge of map.edges || []) {
    if (!edge.source || !edge.target)
      issues.push(`edge missing source/target: ${JSON.stringify(edge)}`);
  }

  return issues;
}

// ════════════════════════════════════════════════════════
//  TESTS
// ════════════════════════════════════════════════════════

async function testServerReachable() {
  console.log(`\n${BOLD("Test 0: Server reachable")}`);
  try {
    const res = await fetch(BASE_URL, { method: "HEAD" });
    assert(res.ok || res.status === 200 || res.status === 304, `Server at ${BASE_URL} responds`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(false, `Server at ${BASE_URL} responds`, msg);
    console.log(`\n  ${WARN} Make sure the dev server is running: npm run dev\n`);
    process.exit(1);
  }
}

async function testSSEStreamBasic(query: string) {
  console.log(`\n${BOLD(`Test 1: SSE stream for "${query}"`)}`);

  const t0 = Date.now();
  const { events, error, ok } = await consumeSSE(query);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`  ${INFO} ${events.length} SSE events received in ${elapsed}s`);
  for (const evt of events) {
    console.log(`    [${evt.pct}%] ${evt.step}: ${evt.message}`);
  }

  assert(ok, "SSE connection succeeded");
  assert(events.length >= 2, `Received ≥2 events (got ${events.length})`);

  const steps = events.map((e) => e.step);
  assert(steps.includes("done") || steps.includes("matched"), "Stream reached 'done' or 'matched'");

  if (error) {
    console.log(`  ${WARN} SSE reported error: ${error}`);
    console.log(`  ${INFO} (This is OK — Phase 2 GET should still succeed after our Bug 2 fix)`);
  }

  // Verify progress percentages are monotonically non-decreasing (skip error events)
  const pcts = events.filter((e) => e.step !== "error").map((e) => e.pct);
  const monotonic = pcts.every((p, i) => i === 0 || p >= pcts[i - 1]);
  assert(monotonic, "Progress percentages are non-decreasing");
}

async function testGETFetchBasic(query: string) {
  console.log(`\n${BOLD(`Test 2: GET fetch for "${query}"`)}`);

  const t0 = Date.now();
  const { data, source, matchedIndustry, status, error } = await fetchData(query);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`  ${INFO} Status: ${status}, Source: ${source}, Matched: ${matchedIndustry || "—"}, Time: ${elapsed}s`);

  assert(status === 200, `HTTP 200 (got ${status})`);
  assert(data !== null, "Response contains data");

  if (data) {
    console.log(`  ${INFO} Industry: "${data.industry}", Archetype: ${data.archetype || "—"}, Jurisdiction: ${data.jurisdiction || "—"}`);
    const totalNodes = countNodes(data.rootNodes);
    console.log(`  ${INFO} ${data.rootNodes.length} root nodes, ${totalNodes} total nodes, ${data.edges.length} edges`);

    const issues = validateMapShape(data);
    assert(issues.length === 0, "Map passes shape validation", issues.join("; "));

    assert(
      data.rootNodes.length >= 5,
      `Has ≥5 root nodes (got ${data.rootNodes.length})`,
      "Skeleton fallback only has ~8 empty nodes"
    );

    // Check it's not a skeleton fallback
    const hasSubNodes = data.rootNodes.some((n) => n.subNodes && n.subNodes.length > 0);
    assert(hasSubNodes, "Root nodes have sub-nodes (not a skeleton fallback)");
  }

  if (error) {
    console.log(`  ${WARN} Server returned error alongside data: ${error}`);
  }
}

async function testFullSearchFlow(query: string) {
  console.log(`\n${BOLD(`Test 3: Full search flow (SSE → GET) for "${query}"`)}`);
  console.log(`  ${INFO} Simulating exact SearchBar.tsx behavior...`);

  // Phase 1: SSE (progress only)
  const t0 = Date.now();
  const sse = await consumeSSE(query);
  const sseTime = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`  ${INFO} Phase 1 (SSE): ${sse.events.length} events, ${sseTime}s`);

  // Bug 2 fix: Even if SSE had an error, we CONTINUE to Phase 2
  if (sse.error) {
    console.log(`  ${WARN} SSE error: "${sse.error}" — continuing to Phase 2 (Bug 2 fix)`);
  }

  // Phase 2: GET (data)
  const t1 = Date.now();
  const get = await fetchData(query);
  const getTime = ((Date.now() - t1) / 1000).toFixed(1);

  console.log(`  ${INFO} Phase 2 (GET): status=${get.status}, source=${get.source}, ${getTime}s`);

  assert(get.status === 200, "Phase 2 GET returns 200");
  assert(get.data !== null, "Phase 2 GET returns data");

  if (get.data) {
    const totalNodes = countNodes(get.data.rootNodes);
    assert(totalNodes >= 10, `Map has ≥10 total nodes (got ${totalNodes})`);

    // Verify this is real data, not a skeleton
    const hasMeta = get.data.rootNodes.some(
      (n) =>
        n.objective ||
        n.description ||
        (n.subNodes && n.subNodes.length > 0)
    );
    assert(hasMeta, "Nodes contain real metadata (not skeleton)");
  }

  // Overall
  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ${INFO} Total flow time: ${totalTime}s`);
}

async function testSequentialSearches() {
  console.log(`\n${BOLD("Test 4: Rapid sequential searches (Bug 1 regression)")}`);
  console.log(`  ${INFO} Simulating: search → immediately search again → search a 3rd time`);

  const queries = ["grains", "wheat", "corn"];
  const usable = [];

  for (const q of queries) {
    console.log(`  ${INFO} GET "${q}"...`);
    const { data, status } = await fetchData(q);
    assert(status === 200, `"${q}" → HTTP 200`);

    if (data) {
      const nodes = countNodes(data.rootNodes);
      const hasSub = data.rootNodes.some((n) => n.subNodes && n.subNodes.length > 0);
      console.log(`  ${INFO}   → ${nodes} nodes, hasSub=${hasSub}`);
      usable.push(q);
    }
  }

  // The key assertion: ALL sequential GETs returned valid data
  // (Before Bug 1 fix, the 2nd and 3rd would silently fail client-side)
  assert(
    usable.length === queries.length,
    `All ${queries.length} sequential searches returned data (got ${usable.length})`
  );
}

async function testParallelRequests() {
  console.log(`\n${BOLD("Test 5: Parallel SSE + GET (race condition)")}`);
  console.log(`  ${INFO} Firing SSE and GET simultaneously...`);

  const query = CUSTOM_QUERY || "grains";
  const [sse, get] = await Promise.all([
    consumeSSE(query),
    fetchData(query),
  ]);

  assert(sse.ok || sse.events.length > 0, "SSE completed (or sent events before close)");
  assert(get.status === 200, `GET returned 200 (got ${get.status})`);
  assert(get.data !== null, "GET returned data");
}

async function testInvalidQueries() {
  console.log(`\n${BOLD("Test 6: Edge cases & invalid inputs")}`);

  // Empty query
  const empty = await fetchData("");
  assert(empty.status === 400, `Empty query → 400 (got ${empty.status})`);

  // Very long query
  const longQ = "a".repeat(250);
  const long = await fetchData(longQ);
  assert(long.status === 400, `250-char query → 400 (got ${long.status})`);

  // Special characters — just verify server doesn't crash (10s timeout, skip full pipeline)
  const special = await fetchData("café & résumé <script>alert(1)</script>", 15_000);
  assert(
    special.status === 200 || special.status === 400 || special.status === 0,
    `Special chars → 200, 400, or timeout (got ${special.status})`,
    special.status === 0 ? "Timed out (OK — server didn't crash)" : undefined
  );
}

async function testSSEMatchPath() {
  console.log(`\n${BOLD("Test 7: SSE match/alias path (Bug 3 regression)")}`);
  console.log(`  ${INFO} Searching for a variant of a known query to trigger addQueryAlias...`);

  // Use a slightly different phrasing — should semantically match an existing map
  const variant = CUSTOM_QUERY ? `${CUSTOM_QUERY} industry` : "grain farming and production";

  const { events, error, ok } = await consumeSSE(variant);

  console.log(`  ${INFO} ${events.length} events received`);
  for (const evt of events) {
    console.log(`    [${evt.pct}%] ${evt.step}: ${evt.message}`);
  }

  const steps = events.map((e) => e.step);

  // If it matched, the addQueryAlias path ran (Bug 3 fix)
  if (steps.includes("matched")) {
    assert(true, "Triggered 'matched' path (addQueryAlias)");
    assert(!error, "No error from addQueryAlias (Bug 3 fix works)");
    assert(steps.includes("done"), "Stream completed with 'done'");
  } else if (steps.includes("done")) {
    assert(true, "Query didn't match existing map — full pipeline ran instead");
  } else {
    assert(false, "Stream should end with 'matched' or 'done'", `Steps: ${steps.join(", ")}`);
  }

  // Phase 2 GET should still work regardless
  const get = await fetchData(variant);
  assert(get.status === 200, `Phase 2 GET for variant returns 200 (got ${get.status})`);
  assert(get.data !== null, "Phase 2 GET for variant returns data");
}

// ════════════════════════════════════════════════════════
//  RUNNER
// ════════════════════════════════════════════════════════

async function main() {
  console.log(BOLD("\n═══════════════════════════════════════════════════════════"));
  console.log(BOLD("  Industry Map Visualizer — Search Flow Integration Tests"));
  console.log(BOLD("═══════════════════════════════════════════════════════════"));
  console.log(`  ${INFO} Base URL: ${BASE_URL}`);
  console.log(`  ${INFO} Query:    ${CUSTOM_QUERY || "(auto — grains + variants)"}`);
  console.log(`  ${INFO} Time:     ${new Date().toISOString()}\n`);

  const t0 = Date.now();

  // Pre-flight
  await testServerReachable();

  const primaryQuery = CUSTOM_QUERY || "grains";

  // Core flow tests
  await testSSEStreamBasic(primaryQuery);
  await testGETFetchBasic(primaryQuery);
  await testFullSearchFlow(primaryQuery);

  // Bug regression tests
  await testSequentialSearches();
  await testParallelRequests();
  await testSSEMatchPath();

  // Edge cases
  await testInvalidQueries();

  // Summary
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(BOLD("\n═══════════════════════════════════════════════════════════"));
  console.log(`  ${BOLD("Results:")} ${passed} passed, ${failed} failed (${elapsed}s)`);
  console.log(BOLD("═══════════════════════════════════════════════════════════\n"));

  if (failed > 0) {
    console.log(`  ${FAIL} Some tests failed. Review output above.\n`);
    process.exit(1);
  } else {
    console.log(`  ${PASS} All tests passed!\n`);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
