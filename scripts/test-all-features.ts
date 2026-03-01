#!/usr/bin/env npx tsx
/**
 * test-all-features.ts
 *
 * Comprehensive production test for ALL features:
 *   1. Search SSE pipeline (/api/generate)
 *   2. Enrichment pipeline (/api/enrich/research, /analyze, /score)
 *   3. Profile Matcher (/api/profile)
 *   4. Node Chat — no web search (/api/chat, stream)
 *   5. Node Chat — with web search (/api/chat, webSearch=true, stream)
 *   6. Validation / edge cases for new endpoints
 *
 * Usage:
 *   npx tsx scripts/test-all-features.ts
 *   npx tsx scripts/test-all-features.ts --base=http://localhost:3000
 */

import "dotenv/config";

const BASE =
  process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ||
  "https://industrymapvisualizer.vercel.app";

/* ─── Colours ─── */
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m";
const DIM = "\x1b[2m", B = "\x1b[1m", RST = "\x1b[0m";

let passed = 0, failed = 0, warnings = 0;
const failures: string[] = [];

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  ${G}✔${RST} ${name}${detail ? ` ${DIM}${detail}${RST}` : ""}`);
}
function fail(name: string, reason: string) {
  failed++;
  failures.push(`${name}: ${reason}`);
  console.log(`  ${R}✘${RST} ${name} — ${R}${reason}${RST}`);
}
function warn(name: string, detail: string) {
  warnings++;
  console.log(`  ${Y}⚠${RST} ${name} — ${Y}${detail}${RST}`);
}
function section(title: string) {
  console.log(`\n${C}${B}━━━ ${title} ━━━${RST}`);
}
function log(msg: string) {
  console.log(`  ${DIM}${msg}${RST}`);
}

/* ─── Helpers ─── */

async function postJSON(path: string, body: any): Promise<{ status: number; data: any; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  let data: any;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, ms };
}

/** POST and consume SSE stream, returning concatenated text + metadata */
async function postSSE(
  path: string,
  body: any,
  timeoutMs = 60_000
): Promise<{ status: number; text: string; events: any[]; error: string | null; ms: number }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = Date.now();
  const events: any[] = [];
  let fullText = "";
  let sseError: string | null = null;

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const ms0 = Date.now() - t0;

    if (!res.ok || !res.body) {
      clearTimeout(timer);
      let errData: any;
      try { errData = await res.json(); } catch { errData = null; }
      return { status: res.status, text: "", events, error: errData?.error || `HTTP ${res.status}`, ms: ms0 };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6));
          events.push(payload);
          if (payload.delta) fullText += payload.delta;
          if (payload.error) sseError = payload.error;
        } catch { /* skip malformed */ }
      }
    }

    clearTimeout(timer);
    return { status: res.status, text: fullText, events, error: sseError, ms: Date.now() - t0 };
  } catch (e: any) {
    clearTimeout(timer);
    return { status: 0, text: fullText, events, error: e.message, ms: Date.now() - t0 };
  }
}

/* ═══════════════════════════════════════════════════════
   1. SEARCH SSE PIPELINE
   ═══════════════════════════════════════════════════════ */

interface IndustryBlock {
  id: string; label: string; category: string;
  description?: string; objective?: string;
  subNodes?: IndustryBlock[];
}
interface IndustryMap {
  industry: string; archetype?: string; jurisdiction?: string;
  rootNodes: IndustryBlock[]; edges: { source: string; target: string }[];
}

function flattenNodes(blocks: IndustryBlock[]): IndustryBlock[] {
  const out: IndustryBlock[] = [];
  for (const b of blocks) {
    out.push(b);
    if (b.subNodes) out.push(...flattenNodes(b.subNodes));
  }
  return out;
}

async function testSearchPipeline(): Promise<IndustryMap | null> {
  section("1. Search Pipeline (SSE → /api/generate)");

  // SSE stream test
  log("Sending SSE search for 'solar energy'...");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  const t0 = Date.now();

  try {
    const res = await fetch(
      `${BASE}/api/generate?q=${encodeURIComponent("solar energy")}&stream=1`,
      { signal: ac.signal }
    );
    clearTimeout(timer);

    res.ok ? ok(`SSE HTTP ${res.status}`) : fail("SSE HTTP status", `got ${res.status}`);

    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const events: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try { events.push(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }

    const ms = Date.now() - t0;
    log(`Received ${events.length} SSE events in ${ms}ms`);

    // Check for progress events
    const progressEvents = events.filter((e) => e.step && e.step !== "done" && e.step !== "error");
    progressEvents.length > 0
      ? ok("SSE progress events received", `(${progressEvents.length} events)`)
      : warn("SSE progress events", "no progress events");

    // Check for done event with data
    const doneEvt = events.find((e) => e.step === "done");
    if (doneEvt?.data) {
      ok("SSE done event with data payload");
      const map: IndustryMap = doneEvt.data;

      map.industry ? ok(`Industry: "${map.industry}"`) : fail("industry field", "missing");
      Array.isArray(map.rootNodes) && map.rootNodes.length > 0
        ? ok(`rootNodes: ${map.rootNodes.length} top-level`)
        : fail("rootNodes", "empty or missing");
      Array.isArray(map.edges)
        ? ok(`edges: ${map.edges.length}`)
        : fail("edges", "missing");

      const allNodes = flattenNodes(map.rootNodes);
      log(`Total nodes (with subNodes): ${allNodes.length}`);

      // Validate categories
      const VALID = new Set(["capital","inputs","production","processing","distribution","customer","compliance","infrastructure"]);
      const badCats = allNodes.filter((n) => !VALID.has(n.category));
      badCats.length === 0
        ? ok("All node categories valid")
        : fail("Invalid categories", badCats.map((n) => `${n.id}:${n.category}`).join(", "));

      return map;
    } else {
      const errorEvt = events.find((e) => e.step === "error");
      if (errorEvt) {
        fail("SSE returned error", errorEvt.message);
        // Try fallback data
        if (errorEvt.data) {
          warn("SSE error had fallback data", "using fallback");
          return errorEvt.data as IndustryMap;
        }
      } else {
        fail("SSE done event", "no done event found");
      }
      return null;
    }
  } catch (e: any) {
    clearTimeout(timer);
    fail("SSE request", e.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   2. ENRICHMENT PIPELINE (3 agents)
   ═══════════════════════════════════════════════════════ */

const ENRICH_PAYLOAD = {
  label: "Solar Panel Manufacturing",
  category: "production",
  description: "Manufacturing photovoltaic panels for residential and commercial solar installations.",
  objective: "Produce high-efficiency solar panels at competitive cost.",
  revenueModel: "B2B sales to installers, direct-to-consumer retail.",
  industry: "Solar Energy",
  jurisdiction: "United States",
  archetype: "asset-manufacturing",
  connections: [
    { label: "Silicon Wafer Supply", direction: "inbound" },
    { label: "Solar Installation Services", direction: "outbound" },
  ],
  parent: { label: "Solar Energy Production", category: "production" },
  children: [
    { label: "Quality Testing", category: "compliance" },
    { label: "Module Assembly", category: "processing" },
  ],
};

async function testEnrichPipeline() {
  section("2. Enrichment Pipeline (3-Agent)");

  // ── Agent 1: Research ──
  log("Agent 1: /api/enrich/research ...");
  const r1 = await postJSON("/api/enrich/research", ENRICH_PAYLOAD);
  log(`Response: ${r1.status} in ${r1.ms}ms`);

  if (r1.status !== 200) {
    fail("Agent 1 HTTP", `${r1.status} — ${JSON.stringify(r1.data)}`);
    return;
  }
  ok(`Agent 1: HTTP 200 (${r1.ms}ms)`);

  const d1 = r1.data;
  Array.isArray(d1.keyActors) && d1.keyActors.length >= 2
    ? ok(`Agent 1: keyActors (${d1.keyActors.length})`, d1.keyActors.slice(0, 3).join(", "))
    : fail("Agent 1: keyActors", `got ${JSON.stringify(d1.keyActors)}`);
  Array.isArray(d1.keyTools) && d1.keyTools.length >= 2
    ? ok(`Agent 1: keyTools (${d1.keyTools.length})`)
    : fail("Agent 1: keyTools", `got ${JSON.stringify(d1.keyTools)}`);
  typeof d1.regulatoryNotes === "string" && d1.regulatoryNotes.length > 5
    ? ok("Agent 1: regulatoryNotes")
    : fail("Agent 1: regulatoryNotes", "missing or too short");

  // Check for sources (URL citations)
  if (Array.isArray(d1.sources) && d1.sources.length > 0) {
    ok(`Agent 1: sources (${d1.sources.length} URLs)`, d1.sources[0]?.url?.substring(0, 60));
  } else {
    warn("Agent 1: sources", "No source URLs returned (web search may not have found citations)");
  }

  // ── Agent 2: Analysis ──
  log("Agent 2: /api/enrich/analyze ...");
  const r2 = await postJSON("/api/enrich/analyze", { ...ENRICH_PAYLOAD, research: d1 });
  log(`Response: ${r2.status} in ${r2.ms}ms`);

  if (r2.status !== 200) {
    fail("Agent 2 HTTP", `${r2.status} — ${JSON.stringify(r2.data)}`);
    return;
  }
  ok(`Agent 2: HTTP 200 (${r2.ms}ms)`);

  const d2 = r2.data;
  const a2checks: [string, boolean][] = [
    ["painPoints is array", Array.isArray(d2.painPoints) && d2.painPoints.length >= 1],
    ["unmetNeeds is array", Array.isArray(d2.unmetNeeds) && d2.unmetNeeds.length >= 1],
    ["demandTrend exists", typeof d2.demandTrend === "string" && d2.demandTrend.length > 3],
    ["competitiveSaturation", typeof d2.competitiveSaturation === "string" && d2.competitiveSaturation.length > 3],
    ["marginProfile", typeof d2.marginProfile === "string" && d2.marginProfile.length > 3],
    ["disruptionRisk", typeof d2.disruptionRisk === "string" && d2.disruptionRisk.length > 3],
    ["entryBarriers", typeof d2.entryBarriers === "string" && d2.entryBarriers.length > 3],
    ["clientSwitchingCosts", typeof d2.clientSwitchingCosts === "string"],
  ];
  for (const [name, pass] of a2checks) {
    pass ? ok(`Agent 2: ${name}`) : fail(`Agent 2: ${name}`, `got ${JSON.stringify(d2[name.split(" ")[0]])}`);
  }

  // ── Agent 3: Scoring ──
  log("Agent 3: /api/enrich/score ...");
  const r3 = await postJSON("/api/enrich/score", { ...ENRICH_PAYLOAD, research: d1, analysis: d2 });
  log(`Response: ${r3.status} in ${r3.ms}ms`);

  if (r3.status !== 200) {
    fail("Agent 3 HTTP", `${r3.status} — ${JSON.stringify(r3.data)}`);
    return;
  }
  ok(`Agent 3: HTTP 200 (${r3.ms}ms)`);

  const d3 = r3.data;
  typeof d3.opportunityScore === "number" && d3.opportunityScore >= 1 && d3.opportunityScore <= 10
    ? ok(`Agent 3: opportunityScore = ${d3.opportunityScore}/10`)
    : fail("Agent 3: opportunityScore", `got ${d3.opportunityScore}`);
  typeof d3.nodeRelevance === "string" && d3.nodeRelevance.length > 3
    ? ok("Agent 3: nodeRelevance")
    : fail("Agent 3: nodeRelevance", `got ${JSON.stringify(d3.nodeRelevance)}`);
  typeof d3.valueChainPosition === "string"
    ? ok(`Agent 3: valueChainPosition = "${d3.valueChainPosition}"`)
    : warn("Agent 3: valueChainPosition", "missing");
  Array.isArray(d3.opportunities) && d3.opportunities.length >= 1
    ? ok(`Agent 3: opportunities (${d3.opportunities.length})`)
    : fail("Agent 3: opportunities", `got ${JSON.stringify(d3.opportunities)}`);
}

/* ═══════════════════════════════════════════════════════
   3. PROFILE MATCHER (/api/profile)
   ═══════════════════════════════════════════════════════ */

async function testProfileMatcher(mapData: IndustryMap | null) {
  section("3. Profile Matcher (/api/profile)");

  // ── Validation tests ──
  log("Testing validation...");

  const v1 = await postJSON("/api/profile", {});
  v1.data?.matches?.length === 0
    ? ok("Empty body → empty matches")
    : fail("Empty body", `expected empty matches, got ${JSON.stringify(v1.data)}`);

  const v2 = await postJSON("/api/profile", { userProfile: "hi", nodes: [] });
  v2.data?.matches?.length === 0
    ? ok("Short profile → empty matches")
    : fail("Short profile", `expected empty matches, got ${JSON.stringify(v2.data)}`);

  const v3 = await postJSON("/api/profile", {
    userProfile: "I have 10 years of experience in nothing",
    nodes: [],
  });
  v3.data?.matches?.length === 0
    ? ok("Empty nodes → empty matches")
    : fail("Empty nodes", `expected empty matches, got ${JSON.stringify(v3.data)}`);

  // ── Real profile matching test ──
  if (!mapData) {
    warn("Profile matcher", "Skipping real test — no map data from search pipeline");
    return;
  }

  const allNodes = flattenNodes(mapData.rootNodes);
  const nodeSummaries = allNodes.map((n) => ({
    id: n.id,
    label: n.label,
    category: n.category,
    description: n.description,
    objective: n.objective,
  }));

  log(`Testing with ${nodeSummaries.length} nodes from "${mapData.industry}" map...`);

  const profile = "I am a mechanical engineer with 8 years of experience in manufacturing process optimization, supply chain management, and quality assurance. I have expertise in lean manufacturing, Six Sigma, and industrial automation. Previously worked at Siemens and General Electric in production engineering roles.";

  const r = await postJSON("/api/profile", { userProfile: profile, nodes: nodeSummaries });
  log(`Response: ${r.status} in ${r.ms}ms`);

  if (r.status !== 200) {
    fail("Profile HTTP", `${r.status} — ${JSON.stringify(r.data)}`);
    return;
  }
  ok(`Profile: HTTP 200 (${r.ms}ms)`);

  const matches = r.data?.matches;
  Array.isArray(matches) && matches.length >= 1
    ? ok(`Profile: ${matches.length} matches returned`)
    : fail("Profile: matches", `expected 1+, got ${JSON.stringify(matches)}`);

  if (Array.isArray(matches) && matches.length > 0) {
    // Validate structure
    const validIds = new Set(nodeSummaries.map((n) => n.id));
    const allValid = matches.every((m: any) => validIds.has(m.id) && typeof m.reason === "string");
    allValid
      ? ok("Profile: all match IDs are valid node IDs")
      : fail("Profile: invalid node IDs", matches.filter((m: any) => !validIds.has(m.id)).map((m: any) => m.id).join(", "));

    matches.length <= 8
      ? ok(`Profile: match count ≤ 8 (cap respected)`)
      : fail("Profile: cap", `got ${matches.length} matches`);

    // Log matches
    for (const m of matches.slice(0, 5)) {
      const node = nodeSummaries.find((n) => n.id === m.id);
      log(`  → [${m.id}] "${node?.label}" — ${m.reason}`);
    }
  }

  // ── Non-profile input test (guardrail) ──
  log("Testing guardrail: non-profile input...");
  const g = await postJSON("/api/profile", {
    userProfile: "What is the meaning of life? Tell me a joke about solar panels.",
    nodes: nodeSummaries.slice(0, 5),
  });
  const gMatches = g.data?.matches || [];
  gMatches.length === 0
    ? ok("Profile guardrail: non-profile input → empty matches")
    : warn("Profile guardrail", `returned ${gMatches.length} matches for non-profile input`);
}

/* ═══════════════════════════════════════════════════════
   4. NODE CHAT — Without Web Search
   ═══════════════════════════════════════════════════════ */

async function testChatNoWebSearch() {
  section("4. Node Chat — No Web Search (/api/chat, stream)");

  // ── Validation tests ──
  log("Testing validation...");

  const v1 = await postJSON("/api/chat", {});
  v1.status === 400
    ? ok("Empty body → 400")
    : fail("Empty body", `expected 400, got ${v1.status}`);

  const v2 = await postJSON("/api/chat", { messages: [{ role: "user", content: "hi" }] });
  v2.status === 400
    ? ok("Missing nodeContext → 400")
    : fail("Missing nodeContext", `expected 400, got ${v2.status}`);

  const v3 = await postJSON("/api/chat", { messages: [], nodeContext: "test" });
  v3.status === 400
    ? ok("Empty messages → 400")
    : fail("Empty messages", `expected 400, got ${v3.status}`);

  // ── Real streaming chat test ──
  log("Testing streaming chat (no web search)...");
  const nodeContext = `NODE: "Solar Panel Manufacturing"
CATEGORY: production
INDUSTRY: Solar Energy
DESCRIPTION: Manufacturing photovoltaic panels for residential and commercial installations.
OBJECTIVE: Produce high-efficiency solar panels at competitive cost.
KEY ACTORS: First Solar, JinkoSolar, Canadian Solar, LONGi Green Energy
KEY TOOLS: PECVD systems, screen printing equipment, EL testing
PAIN POINTS: supply chain disruptions, silicon price volatility
OPPORTUNITY SCORE: 8/10 — Growing demand driven by global renewable energy targets`;

  const result = await postSSE("/api/chat", {
    messages: [{ role: "user", content: "What are the main entry barriers for this segment?" }],
    nodeContext,
    webSearch: false,
  });

  log(`Response: ${result.status} in ${result.ms}ms`);

  result.status === 200
    ? ok(`Chat (no search): HTTP 200`)
    : fail("Chat (no search): HTTP", `${result.status} — ${result.error}`);

  const deltaEvents = result.events.filter((e) => e.delta);
  deltaEvents.length > 0
    ? ok(`Chat (no search): ${deltaEvents.length} delta events`)
    : fail("Chat (no search): deltas", "no delta events received");

  const doneEvent = result.events.find((e) => e.done);
  doneEvent
    ? ok("Chat (no search): done event received")
    : fail("Chat (no search): done event", "missing");

  result.text.length > 50
    ? ok(`Chat (no search): response length=${result.text.length}`)
    : fail("Chat (no search): response", `too short: "${result.text.slice(0, 100)}"`);

  // Check content relevance (should mention solar/manufacturing/barriers)
  const lower = result.text.toLowerCase();
  const relevant = ["solar", "panel", "manufactur", "barrier", "capital", "cost"].some((w) => lower.includes(w));
  relevant
    ? ok("Chat (no search): response mentions solar/manufacturing context")
    : warn("Chat (no search): relevance", "response may not be scoped to the node");

  log(`Preview: "${result.text.slice(0, 200).replace(/\n/g, " ")}..."`);

  // ── Multi-turn test ──
  log("Testing multi-turn conversation...");
  const turn2 = await postSSE("/api/chat", {
    messages: [
      { role: "user", content: "What are the main entry barriers for this segment?" },
      { role: "assistant", content: result.text },
      { role: "user", content: "How much capital would someone need to start small-scale?" },
    ],
    nodeContext,
    webSearch: false,
  });

  turn2.status === 200
    ? ok(`Chat multi-turn: HTTP 200 (${turn2.ms}ms)`)
    : fail("Chat multi-turn: HTTP", `${turn2.status}`);
  turn2.text.length > 30
    ? ok(`Chat multi-turn: response length=${turn2.text.length}`)
    : fail("Chat multi-turn: response", "too short");

  log(`Preview: "${turn2.text.slice(0, 150).replace(/\n/g, " ")}..."`);

  // ── Scope guardrail test ──
  log("Testing scope guardrail...");
  const offTopic = await postSSE("/api/chat", {
    messages: [{ role: "user", content: "Write me a poem about cats. What is the capital of France?" }],
    nodeContext,
    webSearch: false,
  });

  if (offTopic.text.length > 0) {
    const offLower = offTopic.text.toLowerCase();
    // It should redirect, not actually answer about cats/France
    const hasRedirect = offLower.includes("outside") || offLower.includes("scope") ||
      offLower.includes("speciali") || offLower.includes("solar") || offLower.includes("can't help") ||
      offLower.includes("focused on") || offLower.includes("redirect");
    hasRedirect
      ? ok("Chat guardrail: redirected off-topic question")
      : warn("Chat guardrail", `may have answered off-topic: "${offTopic.text.slice(0, 100)}..."`);
  }
}

/* ═══════════════════════════════════════════════════════
   5. NODE CHAT — With Web Search
   ═══════════════════════════════════════════════════════ */

async function testChatWithWebSearch() {
  section("5. Node Chat — With Web Search (/api/chat, webSearch=true)");

  const nodeContext = `NODE: "Solar Panel Manufacturing"
CATEGORY: production
INDUSTRY: Solar Energy
DESCRIPTION: Manufacturing photovoltaic panels for residential and commercial installations.
KEY ACTORS: First Solar, JinkoSolar, Canadian Solar`;

  log("Testing streaming chat with web search...");
  const result = await postSSE("/api/chat", {
    messages: [{ role: "user", content: "What are the latest trends in solar panel efficiency in 2025-2026?" }],
    nodeContext,
    webSearch: true,
  }, 90_000); // longer timeout for web search

  log(`Response: ${result.status} in ${result.ms}ms`);

  result.status === 200
    ? ok(`Chat (web search): HTTP 200`)
    : fail("Chat (web search): HTTP", `${result.status} — ${result.error}`);

  const deltaEvents = result.events.filter((e) => e.delta);
  deltaEvents.length > 0
    ? ok(`Chat (web search): ${deltaEvents.length} delta events`)
    : fail("Chat (web search): deltas", "no delta events");

  const doneEvent = result.events.find((e) => e.done);
  doneEvent
    ? ok("Chat (web search): done event received")
    : fail("Chat (web search): done event", "missing");

  result.text.length > 50
    ? ok(`Chat (web search): response length=${result.text.length}`)
    : fail("Chat (web search): response", `too short: "${result.text.slice(0, 100)}"`);

  // Web search responses tend to be longer and more detailed
  result.text.length > 200
    ? ok("Chat (web search): response is substantive (>200 chars)")
    : warn("Chat (web search): length", `only ${result.text.length} chars`);

  log(`Preview: "${result.text.slice(0, 250).replace(/\n/g, " ")}..."`);
}

/* ═══════════════════════════════════════════════════════
   6. EDGE CASES & CROSS-FEATURE
   ═══════════════════════════════════════════════════════ */

async function testEdgeCases() {
  section("6. Edge Cases & Cross-Feature");

  // Chat with minimal node context
  log("Chat with minimal context (no enrichment)...");
  const minimal = await postSSE("/api/chat", {
    messages: [{ role: "user", content: "What opportunities exist in this area?" }],
    nodeContext: `NODE: "Generic Segment"\nCATEGORY: production\nINDUSTRY: Manufacturing`,
    webSearch: false,
  });
  minimal.status === 200 && minimal.text.length > 20
    ? ok("Minimal context chat works")
    : fail("Minimal context chat", `status=${minimal.status}, text.length=${minimal.text.length}`);

  // Profile matcher with very long profile
  log("Profile with long text...");
  const longProfile = "I am a senior software architect with 15 years of experience. " +
    "My expertise spans distributed systems, cloud infrastructure (AWS, GCP, Azure), " +
    "machine learning pipelines, DevOps practices, microservices, API design, " +
    "database optimization, real-time data processing, security architecture, " +
    "and team leadership. I have led engineering teams of 20+ people and " +
    "delivered enterprise products used by Fortune 500 companies. " +
    "I also have MBA-level business strategy knowledge and experience with " +
    "venture capital fundraising and startup scaling.";

  const longResult = await postJSON("/api/profile", {
    userProfile: longProfile,
    nodes: [
      { id: "n1", label: "Cloud Infrastructure", category: "infrastructure", description: "Cloud computing services" },
      { id: "n2", label: "Software Development", category: "production", description: "Building software products" },
      { id: "n3", label: "Data Analytics", category: "processing", description: "Analyzing business data" },
      { id: "n4", label: "Venture Capital", category: "capital", description: "Investment funding" },
      { id: "n5", label: "Quality Assurance", category: "compliance", description: "Testing and QA" },
    ],
  });
  longResult.status === 200 && longResult.data?.matches?.length >= 1
    ? ok(`Long profile: ${longResult.data.matches.length} matches (${longResult.ms}ms)`)
    : fail("Long profile", `status=${longResult.status}`);

  // Concurrent chat requests (simulate quick tab switches)
  log("Concurrent chat requests (2 parallel)...");
  const ctx1 = 'NODE: "Manufacturing"\nINDUSTRY: Solar Energy\nCATEGORY: production';
  const ctx2 = 'NODE: "Distribution"\nINDUSTRY: Solar Energy\nCATEGORY: distribution';
  const [c1, c2] = await Promise.all([
    postSSE("/api/chat", {
      messages: [{ role: "user", content: "Key challenges?" }],
      nodeContext: ctx1,
      webSearch: false,
    }),
    postSSE("/api/chat", {
      messages: [{ role: "user", content: "Key challenges?" }],
      nodeContext: ctx2,
      webSearch: false,
    }),
  ]);
  c1.status === 200 && c2.status === 200
    ? ok(`Concurrent chats: both 200 (${c1.ms}ms, ${c2.ms}ms)`)
    : fail("Concurrent chats", `status: ${c1.status}, ${c2.status}`);
}

/* ═══════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════ */

async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════════════╗${RST}`);
  console.log(`${B}║  Industry Map Visualizer — Full Feature Test     ║${RST}`);
  console.log(`${B}║  Target: ${BASE.padEnd(39)} ║${RST}`);
  console.log(`${B}╚══════════════════════════════════════════════════╝${RST}`);

  const t0 = Date.now();

  // 1. Search pipeline (also captures map data for profile test)
  const mapData = await testSearchPipeline();

  // 2. Enrichment pipeline
  await testEnrichPipeline();

  // 3. Profile matcher
  await testProfileMatcher(mapData);

  // 4. Chat (no web search)
  await testChatNoWebSearch();

  // 5. Chat (with web search)
  await testChatWithWebSearch();

  // 6. Edge cases
  await testEdgeCases();

  // ═══ Summary ═══
  const totalMs = Date.now() - t0;
  const total = passed + failed;

  console.log(`\n${B}═══════════════════════════════════════════════════${RST}`);
  console.log(`${B}RESULTS:${RST} ${G}${passed} passed${RST}, ${failed > 0 ? R : G}${failed} failed${RST}, ${warnings > 0 ? Y : G}${warnings} warnings${RST}`);
  console.log(`${B}Total:${RST}   ${total} tests in ${(totalMs / 1000).toFixed(1)}s`);

  if (failures.length > 0) {
    console.log(`\n${R}${B}FAILURES:${RST}`);
    for (const f of failures) {
      console.log(`  ${R}✘${RST} ${f}`);
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n${R}Fatal error:${RST}`, e);
  process.exit(2);
});
