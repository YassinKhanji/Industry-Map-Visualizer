import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/enrich/score
 *
 * Agent 3: Opportunity Scorer
 * Synthesis only — NO web search.
 * Input: full node context + Agent 1 + Agent 2 output.
 * Returns: opportunity score, node relevance, connection insights, financials, value chain position, opportunities.
 */

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractJSON(text: string): any {
  let s = text;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  return JSON.parse(s.trim());
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });
    }

    const body = await req.json();
    const {
      label, category, description, objective, revenueModel,
      industry, jurisdiction, archetype, archetypeDescription,
      connections, parent, children,
      existingOpportunities,
      // Agent 1 output
      research,
      // Agent 2 output
      analysis,
    } = body;

    if (!label || !industry) {
      return NextResponse.json({ error: "label and industry are required" }, { status: 400 });
    }

    // Build context block
    const ctx = [
      `SEGMENT: "${label}" (${category})`,
      `INDUSTRY: "${industry}"${jurisdiction ? ` — ${jurisdiction}` : ""}`,
      archetype ? `ARCHETYPE: ${archetype}${archetypeDescription ? ` — ${archetypeDescription}` : ""}` : "",
      description ? `DESCRIPTION: ${description}` : "",
      objective ? `OBJECTIVE: ${objective}` : "",
      revenueModel ? `REVENUE MODEL: ${revenueModel}` : "",
      parent ? `PARENT NODE: "${parent.label}" (${parent.category})` : "",
      children?.length ? `SUB-COMPONENTS: ${children.map((c: any) => `"${c.label}"`).join(", ")}` : "",
      connections?.length ? `CONNECTIONS:\n${connections.map((c: any) => `  ${c.direction === "inbound" ? "←" : "→"} "${c.label}" (${c.category}): ${c.edgeLabel || "connected"}`).join("\n")}` : "",
      existingOpportunities?.length ? `EXISTING OPPORTUNITIES (verify/update): ${existingOpportunities.join("; ")}` : "",
    ].filter(Boolean).join("\n");

    // Collect all sources from Agents 1 & 2
    const allSources: { url: string; title: string }[] = [
      ...(Array.isArray(research?.sources) ? research.sources : []),
      ...(Array.isArray(analysis?.sources) ? analysis.sources : []),
    ];
    // Deduplicate by URL
    const sourceMap = new Map<string, string>();
    for (const s of allSources) { if (s.url) sourceMap.set(s.url, s.title || ""); }
    const dedupedSources = Array.from(sourceMap.entries()).map(([url, title]) => ({ url, title }));

    const researchBlock = research
      ? `\nAGENT 1 — MARKET RESEARCH (web-verified):
Key Actors: ${research.keyActors?.join(", ") || "none"}
Key Tools: ${research.keyTools?.join(", ") || "none"}
Typical Clients: ${research.typicalClients?.join(", ") || "none"}
Cost Drivers: ${research.costDrivers?.join(", ") || "none"}
Regulatory: ${research.regulatoryNotes || "none"}`
      : "";

    const analysisBlock = analysis
      ? `\nAGENT 2 — HONEST ANALYSIS:
Demand Trend: ${analysis.demandTrend || "unknown"}
Competitive Saturation: ${analysis.competitiveSaturation || "unknown"}
Entry Barriers: ${analysis.entryBarriers || "unknown"}
Pain Points: ${analysis.painPoints?.join("; ") || "none"}
Unmet Needs: ${analysis.unmetNeeds?.join("; ") || "none"}
Disruption Risk: ${analysis.disruptionRisk || "unknown"}
Margin Profile: ${analysis.marginProfile || "unknown"}
Client Switching Costs: ${analysis.clientSwitchingCosts || "unknown"}`
      : "";

    const sourcesBlock = dedupedSources.length > 0
      ? `\nSOURCES FROM WEB RESEARCH (use these to attribute opportunities):\n${dedupedSources.map((s, i) => `  [${i + 1}] ${s.title} — ${s.url}`).join("\n")}`
      : "";

    const prompt = `You are a senior opportunity scorer performing VC-grade due diligence.

YOUR RULES:
- Synthesize ONLY from the research and analysis already provided. Do NOT invent new facts.
- If the analysis says "saturated" but you see unmet needs, FLAG the contradiction — do not resolve it.
- The opportunity score must reflect REAL opportunity, not hype. Use this formula:
    Score = (demand + unmet_needs + underserved_niches) × (margins + switching_costs) ÷ (barriers + saturation + disruption_risk)
    Scale: 1-10 where 1 = terrible, 5 = average, 10 = exceptional
- If the research is thin or contradictory, LOWER the score, don't inflate it.
- nodeRelevance: How important is this specific node to someone exploring the "${industry}" industry? ("critical" / "important" / "peripheral" / "tangential")
- For each opportunity, include the most relevant source URL from the SOURCES list below. If no source is relevant, set sourceUrl to null.

NODE CONTEXT:
${ctx}
${researchBlock}
${analysisBlock}
${sourcesBlock}

TASK: Synthesize all data and produce a final scoring. Return:

{
  "opportunityScore": <number 1-10>,
  "nodeRelevance": "<critical | important | peripheral | tangential — explain in 1 sentence why>",
  "connectionInsights": [
    ${connections?.length ? connections.map((_: any, i: number) => `"<insight about connection ${i + 1}: how it creates value or dependency>"`).join(",\n    ") : '"No connections to analyze"'}
  ],
  "expenseRange": "<realistic USD range for a new entrant to this segment, e.g. '$50K-$200K/year'>",
  "incomeRange": "<realistic USD revenue range once established, e.g. '$200K-$1M/year'>",
  "valueChainPosition": "<one of: upstream | midstream | downstream | cross-cutting — with 1 sentence why>",
  "opportunities": [
    { "description": "<specific, actionable opportunity — 1-2 sentences, grounded in the data above>", "sourceUrl": "<URL from SOURCES list or null>" }
  ]
}

CRITICAL: The "opportunities" array must contain 3-6 objects, each with "description" (string) and "sourceUrl" (string or null). Each opportunity must describe REAL, SPECIFIC opportunities — not vague advice. Each should reference facts from the research/analysis.

Return ONLY valid JSON.`;

    const client = getClient();
    // Agent 3 does NOT use web search — pure synthesis
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const outputText = response.choices?.[0]?.message?.content || "";

    if (!outputText) {
      return NextResponse.json({ error: "No response from scoring agent" }, { status: 502 });
    }

    const raw = extractJSON(outputText);

    const result = {
      opportunityScore: typeof raw.opportunityScore === "number" ? Math.max(1, Math.min(10, raw.opportunityScore)) : 5,
      nodeRelevance: typeof raw.nodeRelevance === "string" ? raw.nodeRelevance : "unknown",
      connectionInsights: Array.isArray(raw.connectionInsights) ? raw.connectionInsights : [],
      expenseRange: typeof raw.expenseRange === "string" ? raw.expenseRange : "data unavailable",
      incomeRange: typeof raw.incomeRange === "string" ? raw.incomeRange : "data unavailable",
      valueChainPosition: typeof raw.valueChainPosition === "string" ? raw.valueChainPosition : "data unavailable",
      opportunities: Array.isArray(raw.opportunities)
        ? raw.opportunities.map((opp: any) => {
            // Support both new object format and legacy string format
            if (typeof opp === "string") return { description: opp, sourceUrl: null };
            return {
              description: typeof opp.description === "string" ? opp.description : String(opp),
              sourceUrl: typeof opp.sourceUrl === "string" ? opp.sourceUrl : null,
            };
          })
        : [],
      sources: dedupedSources,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Enrich/score error:", err);
    return NextResponse.json({ error: err.message || "Scoring agent failed" }, { status: 500 });
  }
}
