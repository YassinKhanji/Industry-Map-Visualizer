#!/usr/bin/env npx tsx
/**
 * test-enrich-pipeline.ts
 *
 * Comprehensive integration test for the 3-agent enrichment pipeline.
 * Tests against the production Vercel deployment.
 *
 * Usage:
 *   npx tsx scripts/test-enrich-pipeline.ts
 *   npx tsx scripts/test-enrich-pipeline.ts --base=http://localhost:3000
 */

const BASE =
  process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ||
  "https://industrymapvisualizer.vercel.app";

/* ─── colours ─── */
const G = "\x1b[32m";
const R = "\x1b[31m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const DIM = "\x1b[2m";
const B = "\x1b[1m";
const RST = "\x1b[0m";

let passed = 0;
let failed = 0;
let warnings = 0;
const failures: string[] = [];

function ok(name: string) {
  passed++;
  console.log(`  ${G}✔${RST} ${name}`);
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
function section(name: string) {
  console.log(`\n${C}${B}━━━ ${name} ━━━${RST}`);
}

async function post(path: string, body: any): Promise<{ status: number; data: any; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, ms };
}

/* ═══════════════════════════════════════════
   TEST PAYLOADS — 2 realistic industry nodes
   ═══════════════════════════════════════════ */

const PAYLOAD_LOGISTICS = {
  label: "Last-Mile Delivery",
  category: "distribution",
  description: "Final leg of the supply chain — parcels from local hub to customer doorstep.",
  objective: "Deliver parcels within same/next-day windows at lowest unit cost.",
  revenueModel: "Per-parcel delivery fees, monthly subscription tiers for frequent shippers.",
  industry: "E-Commerce Logistics",
  jurisdiction: "United States",
  archetype: "infrastructure-utility",
  archetypeDescription: "Heavy-asset network with economies of scale and recurring utilization.",
  connections: [
    { label: "Warehouse Management", direction: "inbound", category: "infrastructure" },
    { label: "Customer Returns", direction: "outbound", category: "customer" },
  ],
  parent: { label: "Fulfillment Network", category: "distribution", objective: "Get goods from seller to buyer" },
  children: [
    { label: "Route Optimization", category: "infrastructure" },
    { label: "Proof of Delivery", category: "compliance" },
  ],
  existingKeyActors: ["UPS", "FedEx", "Amazon Logistics"],
  existingKeyTools: ["Onfleet", "Bringg"],
  existingCostDrivers: ["fuel costs", "driver wages"],
  existingRegulatoryNotes: "DOT regulations for commercial vehicles",
  existingPainPoints: ["failed deliveries", "high driver turnover"],
};

const PAYLOAD_FINTECH = {
  label: "Payment Processing",
  category: "infrastructure",
  description: "Handles credit/debit card and digital wallet transaction authorization, clearing, and settlement.",
  objective: "Process transactions securely with low latency and minimal fraud loss.",
  revenueModel: "Per-transaction fees (interchange + markup), monthly gateway fees.",
  industry: "Financial Technology",
  jurisdiction: "European Union",
  archetype: "saas-automation",
  archetypeDescription: "Software platform with recurring revenue and high gross margins.",
  connections: [
    { label: "KYC/AML Compliance", direction: "outbound", category: "compliance" },
    { label: "Merchant Onboarding", direction: "inbound", category: "customer" },
    { label: "Banking API Layer", direction: "inbound", category: "infrastructure" },
  ],
  parent: { label: "Digital Payments Stack", category: "infrastructure" },
  children: [
    { label: "Fraud Detection", category: "compliance" },
    { label: "Settlement Engine", category: "processing" },
  ],
  existingKeyActors: ["Stripe", "Adyen", "Worldline"],
  existingKeyTools: ["PCI DSS tooling"],
  existingPainPoints: ["chargebacks", "cross-border fees"],
};

/* ═══════════════════════════════════════
   1. VALIDATION TESTS (fast, no LLM)
   ═══════════════════════════════════════ */

async function testValidation() {
  section("1. Input Validation");

  // Missing both label and industry → 400
  const r1 = await post("/api/enrich/research", {});
  r1.status === 400 ? ok("research: empty body → 400") : fail("research: empty body", `expected 400, got ${r1.status}`);

  const r2 = await post("/api/enrich/analyze", { label: "Test" });
  r2.status === 400 ? ok("analyze: missing industry → 400") : fail("analyze: missing industry", `expected 400, got ${r2.status}`);

  const r3 = await post("/api/enrich/score", { industry: "Test" });
  r3.status === 400 ? ok("score: missing label → 400") : fail("score: missing label", `expected 400, got ${r3.status}`);

  // Only label → 400 (no industry)
  const r4 = await post("/api/enrich/research", { label: "Test" });
  r4.status === 400 ? ok("research: label only → 400") : fail("research: label only", `expected 400, got ${r4.status}`);

  // Only industry → 400 (no label)
  const r5 = await post("/api/enrich/analyze", { industry: "Test" });
  r5.status === 400 ? ok("analyze: industry only → 400") : fail("analyze: industry only", `expected 400, got ${r5.status}`);
}

/* ═══════════════════════════════════════
   2. AGENT 1 — Market Researcher
   ═══════════════════════════════════════ */

async function testResearch() {
  section("2. Agent 1 — Market Researcher (Logistics)");

  console.log(`  ${DIM}Calling /api/enrich/research …${RST}`);
  const { status, data, ms } = await post("/api/enrich/research", PAYLOAD_LOGISTICS);
  console.log(`  ${DIM}Response in ${ms}ms (status ${status})${RST}`);

  if (status !== 200) {
    fail("research: HTTP status", `expected 200, got ${status} — ${JSON.stringify(data)}`);
    return null;
  }
  ok(`research: HTTP 200 (${ms}ms)`);

  // Shape checks
  const checks: [string, boolean][] = [
    ["keyActors is array", Array.isArray(data.keyActors)],
    ["keyActors has 2+ items", data.keyActors?.length >= 2],
    ["keyTools is array", Array.isArray(data.keyTools)],
    ["keyTools has 2+ items", data.keyTools?.length >= 2],
    ["typicalClients is array", Array.isArray(data.typicalClients)],
    ["typicalClients has 1+ items", data.typicalClients?.length >= 1],
    ["costDrivers is array", Array.isArray(data.costDrivers)],
    ["costDrivers has 1+ items", data.costDrivers?.length >= 1],
    ["regulatoryNotes is string", typeof data.regulatoryNotes === "string"],
    ["regulatoryNotes not empty", data.regulatoryNotes?.length > 5],
  ];
  for (const [name, pass] of checks) {
    pass ? ok(`research: ${name}`) : fail(`research: ${name}`, JSON.stringify(data[name.split(" ")[0]]));
  }

  // Quality: check that at least one existing actor was kept or corrected
  const hasExistingActors = ["UPS", "FedEx", "Amazon"].some((a) =>
    data.keyActors?.some((ka: string) => ka.toLowerCase().includes(a.toLowerCase()))
  );
  hasExistingActors ? ok("research: verified existing actors (UPS/FedEx/Amazon)") : warn("research: existing actors", "None of the existing actors were returned — may have been corrected");

  console.log(`  ${DIM}keyActors: ${data.keyActors?.join(", ")}${RST}`);
  console.log(`  ${DIM}keyTools: ${data.keyTools?.join(", ")}${RST}`);
  console.log(`  ${DIM}typicalClients: ${data.typicalClients?.join(", ")}${RST}`);
  console.log(`  ${DIM}costDrivers: ${data.costDrivers?.join(", ")}${RST}`);
  console.log(`  ${DIM}regulatoryNotes: ${data.regulatoryNotes?.substring(0, 120)}…${RST}`);

  return data;
}

/* ═══════════════════════════════════════
   3. AGENT 2 — Industry Analyst
   ═══════════════════════════════════════ */

async function testAnalyze(research: any) {
  section("3. Agent 2 — Industry Analyst (Logistics)");

  const payload = { ...PAYLOAD_LOGISTICS, research };
  console.log(`  ${DIM}Calling /api/enrich/analyze …${RST}`);
  const { status, data, ms } = await post("/api/enrich/analyze", payload);
  console.log(`  ${DIM}Response in ${ms}ms (status ${status})${RST}`);

  if (status !== 200) {
    fail("analyze: HTTP status", `expected 200, got ${status} — ${JSON.stringify(data)}`);
    return null;
  }
  ok(`analyze: HTTP 200 (${ms}ms)`);

  // Shape checks
  const stringFields = ["demandTrend", "competitiveSaturation", "entryBarriers", "disruptionRisk", "marginProfile", "clientSwitchingCosts"];
  for (const f of stringFields) {
    typeof data[f] === "string" && data[f].length > 3
      ? ok(`analyze: ${f} is non-empty string`)
      : fail(`analyze: ${f}`, `expected non-empty string, got: ${JSON.stringify(data[f])}`);
  }

  const arrayFields = ["painPoints", "unmetNeeds"];
  for (const f of arrayFields) {
    Array.isArray(data[f]) && data[f].length >= 2
      ? ok(`analyze: ${f} has 2+ items`)
      : fail(`analyze: ${f}`, `expected array with 2+, got: ${JSON.stringify(data[f])}`);
  }

  // Quality: demandTrend should start with growing/stable/declining/volatile
  const demandMatch = /^(growing|stable|declining|volatile)/i.test(data.demandTrend || "");
  demandMatch ? ok("analyze: demandTrend starts with valid direction") : warn("analyze: demandTrend format", `"${data.demandTrend?.substring(0, 40)}"`);

  // Quality: competitiveSaturation direction
  const satMatch = /^(low|moderate|high|oversaturated)/i.test(data.competitiveSaturation || "");
  satMatch ? ok("analyze: competitiveSaturation starts with valid level") : warn("analyze: saturation format", `"${data.competitiveSaturation?.substring(0, 40)}"`);

  // Quality: marginProfile direction
  const marginMatch = /^(thin|moderate|healthy|high)/i.test(data.marginProfile || "");
  marginMatch ? ok("analyze: marginProfile starts with valid tier") : warn("analyze: margin format", `"${data.marginProfile?.substring(0, 40)}"`);

  console.log(`  ${DIM}demandTrend: ${data.demandTrend?.substring(0, 100)}${RST}`);
  console.log(`  ${DIM}saturation: ${data.competitiveSaturation?.substring(0, 100)}${RST}`);
  console.log(`  ${DIM}barriers: ${data.entryBarriers?.substring(0, 100)}${RST}`);
  console.log(`  ${DIM}margin: ${data.marginProfile?.substring(0, 100)}${RST}`);
  console.log(`  ${DIM}disruption: ${data.disruptionRisk?.substring(0, 100)}${RST}`);
  console.log(`  ${DIM}switching: ${data.clientSwitchingCosts?.substring(0, 100)}${RST}`);
  console.log(`  ${DIM}painPoints (${data.painPoints?.length}): ${data.painPoints?.[0]?.substring(0, 80)}…${RST}`);
  console.log(`  ${DIM}unmetNeeds (${data.unmetNeeds?.length}): ${data.unmetNeeds?.[0]?.substring(0, 80)}…${RST}`);

  return data;
}

/* ═══════════════════════════════════════
   4. AGENT 3 — Opportunity Scorer
   ═══════════════════════════════════════ */

async function testScore(research: any, analysis: any) {
  section("4. Agent 3 — Opportunity Scorer (Logistics)");

  const payload = { ...PAYLOAD_LOGISTICS, research, analysis };
  console.log(`  ${DIM}Calling /api/enrich/score …${RST}`);
  const { status, data, ms } = await post("/api/enrich/score", payload);
  console.log(`  ${DIM}Response in ${ms}ms (status ${status})${RST}`);

  if (status !== 200) {
    fail("score: HTTP status", `expected 200, got ${status} — ${JSON.stringify(data)}`);
    return null;
  }
  ok(`score: HTTP 200 (${ms}ms)`);

  // opportunityScore: number 1-10
  typeof data.opportunityScore === "number" && data.opportunityScore >= 1 && data.opportunityScore <= 10
    ? ok(`score: opportunityScore = ${data.opportunityScore} (valid 1-10)`)
    : fail("score: opportunityScore", `expected number 1-10, got: ${data.opportunityScore}`);

  // nodeRelevance: string
  typeof data.nodeRelevance === "string" && data.nodeRelevance.length > 5
    ? ok(`score: nodeRelevance is non-empty`)
    : fail("score: nodeRelevance", `expected string, got: ${JSON.stringify(data.nodeRelevance)}`);

  // nodeRelevance should contain one of: critical, important, peripheral, tangential
  const relMatch = /critical|important|peripheral|tangential/i.test(data.nodeRelevance || "");
  relMatch ? ok("score: nodeRelevance contains valid level") : warn("score: nodeRelevance format", `"${data.nodeRelevance?.substring(0, 60)}"`);

  // connectionInsights: array
  Array.isArray(data.connectionInsights)
    ? ok(`score: connectionInsights is array (${data.connectionInsights.length} items)`)
    : fail("score: connectionInsights", `expected array, got: ${typeof data.connectionInsights}`);

  // expenseRange: string with $
  typeof data.expenseRange === "string" && data.expenseRange.includes("$")
    ? ok(`score: expenseRange has $ sign — "${data.expenseRange}"`)
    : warn("score: expenseRange", `expected $ in range, got: "${data.expenseRange}"`);

  // incomeRange: string with $
  typeof data.incomeRange === "string" && data.incomeRange.includes("$")
    ? ok(`score: incomeRange has $ sign — "${data.incomeRange}"`)
    : warn("score: incomeRange", `expected $ in range, got: "${data.incomeRange}"`);

  // valueChainPosition: string containing upstream/midstream/downstream/cross-cutting
  const vcpMatch = /upstream|midstream|downstream|cross-cutting/i.test(data.valueChainPosition || "");
  vcpMatch ? ok(`score: valueChainPosition valid`) : warn("score: valueChainPosition", `"${data.valueChainPosition?.substring(0, 60)}"`);

  // opportunities: array of strings with 2+
  Array.isArray(data.opportunities) && data.opportunities.length >= 2
    ? ok(`score: opportunities has ${data.opportunities.length} items`)
    : fail("score: opportunities", `expected array 2+, got ${Array.isArray(data.opportunities) ? data.opportunities.length : typeof data.opportunities}`);

  // Quality: opportunities should be non-trivially long
  if (Array.isArray(data.opportunities) && data.opportunities.length > 0) {
    const avgLen = data.opportunities.reduce((sum: number, o: string) => sum + (o?.length || 0), 0) / data.opportunities.length;
    avgLen > 30
      ? ok(`score: avg opportunity length = ${Math.round(avgLen)} chars (good detail)`)
      : warn("score: opportunity detail", `avg only ${Math.round(avgLen)} chars — may be too vague`);
  }

  console.log(`  ${DIM}opportunityScore: ${data.opportunityScore}${RST}`);
  console.log(`  ${DIM}nodeRelevance: ${data.nodeRelevance?.substring(0, 100)}${RST}`);
  console.log(`  ${DIM}valueChainPos: ${data.valueChainPosition?.substring(0, 80)}${RST}`);
  console.log(`  ${DIM}expenses: ${data.expenseRange}${RST}`);
  console.log(`  ${DIM}income: ${data.incomeRange}${RST}`);
  console.log(`  ${DIM}connectionInsights: ${data.connectionInsights?.length} items${RST}`);
  for (const ci of data.connectionInsights || []) {
    console.log(`    ${DIM}• ${(typeof ci === "string" ? ci : JSON.stringify(ci)).substring(0, 100)}${RST}`);
  }
  console.log(`  ${DIM}opportunities:${RST}`);
  for (const opp of data.opportunities || []) {
    console.log(`    ${DIM}• ${(typeof opp === "string" ? opp : JSON.stringify(opp)).substring(0, 120)}${RST}`);
  }

  return data;
}

/* ═══════════════════════════════════════
   5. FULL PIPELINE — FinTech (EU) E2E
   ═══════════════════════════════════════ */

async function testFullPipeline() {
  section("5. Full 3-Stage Pipeline — FinTech (EU)");

  const t0 = Date.now();

  // Stage 1
  console.log(`  ${DIM}[Stage 1] Calling /api/enrich/research …${RST}`);
  const r1 = await post("/api/enrich/research", PAYLOAD_FINTECH);
  console.log(`  ${DIM}[Stage 1] Done in ${r1.ms}ms (${r1.status})${RST}`);
  if (r1.status !== 200) {
    fail("pipeline: research stage", `HTTP ${r1.status}: ${JSON.stringify(r1.data)}`);
    return;
  }
  ok(`pipeline: Stage 1 complete (${r1.ms}ms)`);

  // Verify EU-specific content (jurisdiction awareness)
  const euRegex = /EU|PSD2|GDPR|MiFID|EBA|ECB|euro|european|SEPA|SCA/i;
  const regText = r1.data.regulatoryNotes || "";
  euRegex.test(regText)
    ? ok("pipeline: research is EU-specific (regulatory)")
    : warn("pipeline: EU specificity", `regulatoryNotes doesn't mention EU regs: "${regText.substring(0, 60)}"`);

  // Stage 2
  console.log(`  ${DIM}[Stage 2] Calling /api/enrich/analyze …${RST}`);
  const r2 = await post("/api/enrich/analyze", { ...PAYLOAD_FINTECH, research: r1.data });
  console.log(`  ${DIM}[Stage 2] Done in ${r2.ms}ms (${r2.status})${RST}`);
  if (r2.status !== 200) {
    fail("pipeline: analyze stage", `HTTP ${r2.status}: ${JSON.stringify(r2.data)}`);
    return;
  }
  ok(`pipeline: Stage 2 complete (${r2.ms}ms)`);

  // Stage 3
  console.log(`  ${DIM}[Stage 3] Calling /api/enrich/score …${RST}`);
  const r3 = await post("/api/enrich/score", { ...PAYLOAD_FINTECH, research: r1.data, analysis: r2.data });
  console.log(`  ${DIM}[Stage 3] Done in ${r3.ms}ms (${r3.status})${RST}`);
  if (r3.status !== 200) {
    fail("pipeline: score stage", `HTTP ${r3.status}: ${JSON.stringify(r3.data)}`);
    return;
  }
  ok(`pipeline: Stage 3 complete (${r3.ms}ms)`);

  const totalMs = Date.now() - t0;
  console.log(`  ${DIM}Total pipeline time: ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)${RST}`);

  // Pipeline-level assertions
  totalMs < 120_000
    ? ok(`pipeline: total < 120s (${(totalMs / 1000).toFixed(1)}s)`)
    : warn("pipeline: slow", `${(totalMs / 1000).toFixed(1)}s — might timeout in UI`);

  // Score should reflect high-barrier fintech reality
  const score = r3.data.opportunityScore;
  typeof score === "number"
    ? ok(`pipeline: fintech opportunityScore = ${score}`)
    : fail("pipeline: opportunityScore type", `expected number, got ${typeof score}`);

  // Connections: 3 connections → should have 3 (or close) insights
  const insights = r3.data.connectionInsights;
  if (Array.isArray(insights)) {
    insights.length >= 2
      ? ok(`pipeline: ${insights.length} connection insights for 3 connections`)
      : warn("pipeline: connection insights", `only ${insights.length} insights for 3 connections`);
  }

  // Cross-check: if analysis says "oversaturated", score should be ≤ 6
  if (/oversaturated/i.test(r2.data.competitiveSaturation || "") && score > 6) {
    warn("pipeline: score-vs-saturation", `saturation=oversaturated but score=${score} — contradiction?`);
  }

  // Print full fintech results summary
  console.log(`\n  ${B}── FinTech Pipeline Results ──${RST}`);
  console.log(`  ${DIM}Actors: ${r1.data.keyActors?.join(", ")}${RST}`);
  console.log(`  ${DIM}Tools: ${r1.data.keyTools?.join(", ")}${RST}`);
  console.log(`  ${DIM}Clients: ${r1.data.typicalClients?.join(", ")}${RST}`);
  console.log(`  ${DIM}Demand: ${r2.data.demandTrend?.substring(0, 80)}${RST}`);
  console.log(`  ${DIM}Saturation: ${r2.data.competitiveSaturation?.substring(0, 80)}${RST}`);
  console.log(`  ${DIM}Barriers: ${r2.data.entryBarriers?.substring(0, 80)}${RST}`);
  console.log(`  ${DIM}Margins: ${r2.data.marginProfile?.substring(0, 80)}${RST}`);
  console.log(`  ${DIM}Disruption: ${r2.data.disruptionRisk?.substring(0, 80)}${RST}`);
  console.log(`  ${DIM}Score: ${r3.data.opportunityScore}/10${RST}`);
  console.log(`  ${DIM}Relevance: ${r3.data.nodeRelevance?.substring(0, 80)}${RST}`);
  console.log(`  ${DIM}Expenses: ${r3.data.expenseRange}${RST}`);
  console.log(`  ${DIM}Income: ${r3.data.incomeRange}${RST}`);
  console.log(`  ${DIM}VCP: ${r3.data.valueChainPosition?.substring(0, 80)}${RST}`);
}

/* ═══════════════════════════════════════
   6. EDGE CASES
   ═══════════════════════════════════════ */

async function testEdgeCases() {
  section("6. Edge Cases");

  // Minimal payload — just label + industry, no optional fields
  console.log(`  ${DIM}Calling research with minimal payload …${RST}`);
  const r1 = await post("/api/enrich/research", { label: "Solar Panel Installation", industry: "Renewable Energy" });
  r1.status === 200
    ? ok(`edge: minimal payload → 200 (${r1.ms}ms)`)
    : fail("edge: minimal payload", `expected 200, got ${r1.status}`);

  if (r1.status === 200) {
    Array.isArray(r1.data.keyActors)
      ? ok("edge: minimal still returns keyActors")
      : fail("edge: minimal keyActors", `got: ${typeof r1.data.keyActors}`);
  }

  // Score with no research/analysis → should still work (empty synthesis)
  console.log(`  ${DIM}Calling score with no prior agents …${RST}`);
  const r2 = await post("/api/enrich/score", {
    label: "Solar Panel Installation",
    industry: "Renewable Energy",
  });
  r2.status === 200
    ? ok(`edge: score without research/analysis → 200 (${r2.ms}ms)`)
    : fail("edge: score without prior", `expected 200, got ${r2.status}`);

  if (r2.status === 200) {
    typeof r2.data.opportunityScore === "number"
      ? ok(`edge: score still returns number (${r2.data.opportunityScore})`)
      : fail("edge: score type", `expected number, got ${typeof r2.data.opportunityScore}`);
  }

  // Analyze with research but no existing pain points
  console.log(`  ${DIM}Calling analyze with research, no existingPainPoints …${RST}`);
  const r3 = await post("/api/enrich/analyze", {
    label: "Solar Panel Installation",
    industry: "Renewable Energy",
    research: {
      keyActors: ["SunPower", "Enphase"],
      keyTools: ["Aurora Solar"],
      typicalClients: ["Homeowners"],
      costDrivers: ["panel costs"],
      regulatoryNotes: "NEC codes, net metering policies",
    },
  });
  r3.status === 200
    ? ok(`edge: analyze without existingPainPoints → 200 (${r3.ms}ms)`)
    : fail("edge: analyze without existing", `expected 200, got ${r3.status}`);
}

/* ═══════════════════════════════════════
   7. RESPONSE TIME BENCHMARKS
   ═══════════════════════════════════════ */

async function testTimings() {
  section("7. Response Time Benchmarks");

  const benchPayload = {
    label: "Crop Insurance Underwriting",
    industry: "Agricultural Finance",
    jurisdiction: "United States",
  };

  console.log(`  ${DIM}Benchmarking research …${RST}`);
  const r1 = await post("/api/enrich/research", benchPayload);
  r1.ms < 30000 ? ok(`research: ${r1.ms}ms < 30s`) : warn("research timing", `${r1.ms}ms`);

  console.log(`  ${DIM}Benchmarking analyze …${RST}`);
  const r2 = await post("/api/enrich/analyze", {
    ...benchPayload,
    research: r1.status === 200 ? r1.data : { keyActors: [], keyTools: [], typicalClients: [], costDrivers: [], regulatoryNotes: "" },
  });
  r2.ms < 30000 ? ok(`analyze: ${r2.ms}ms < 30s`) : warn("analyze timing", `${r2.ms}ms`);

  console.log(`  ${DIM}Benchmarking score …${RST}`);
  const r3 = await post("/api/enrich/score", {
    ...benchPayload,
    research: r1.status === 200 ? r1.data : {},
    analysis: r2.status === 200 ? r2.data : {},
  });
  r3.ms < 20000 ? ok(`score: ${r3.ms}ms < 20s (no web search)`) : warn("score timing", `${r3.ms}ms`);

  const total = r1.ms + r2.ms + r3.ms;
  console.log(`  ${DIM}Sequential total: ${total}ms (${(total / 1000).toFixed(1)}s)${RST}`);
}

/* ═══════════════════════════════════════
   RUNNER
   ═══════════════════════════════════════ */

async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════════╗${RST}`);
  console.log(`${B}║   3-Agent Enrichment Pipeline — Full Test    ║${RST}`);
  console.log(`${B}╚══════════════════════════════════════════════╝${RST}`);
  console.log(`${DIM}Target: ${BASE}${RST}`);
  console.log(`${DIM}Time: ${new Date().toISOString()}${RST}\n`);

  // 1. Validation (fast)
  await testValidation();

  // 2-4. Individual agents (Logistics payload)
  const research = await testResearch();
  const analysis = research ? await testAnalyze(research) : null;
  if (research && analysis) await testScore(research, analysis);

  // 5. Full pipeline (FinTech EU payload)
  await testFullPipeline();

  // 6. Edge cases
  await testEdgeCases();

  // 7. Timings
  await testTimings();

  // Summary
  section("SUMMARY");
  console.log(`  ${G}Passed: ${passed}${RST}`);
  console.log(`  ${Y}Warnings: ${warnings}${RST}`);
  console.log(`  ${R}Failed: ${failed}${RST}`);
  if (failures.length > 0) {
    console.log(`\n  ${R}${B}Failures:${RST}`);
    for (const f of failures) console.log(`    ${R}• ${f}${RST}`);
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n${R}Fatal error:${RST}`, err);
  process.exit(2);
});
