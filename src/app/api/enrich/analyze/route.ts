import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/enrich/analyze
 *
 * Agent 2: Industry Analyst
 * Brutally honest analysis with independent web search.
 * Input: full node context + Agent 1 research output.
 * Returns: demand, saturation, barriers, pain points, unmet needs, disruption, margins, switching costs.
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
      existingPainPoints,
      // Agent 1 output
      research,
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
      connections?.length ? `CONNECTIONS:\n${connections.map((c: any) => `  ${c.direction === "inbound" ? "←" : "→"} ${c.label}`).join("\n")}` : "",
      existingPainPoints?.length ? `EXISTING PAIN POINTS (verify): ${existingPainPoints.join(", ")}` : "",
    ].filter(Boolean).join("\n");

    const researchBlock = research
      ? `\nRESEARCH FROM AGENT 1 (verified facts — use as context but challenge where warranted):
Key Actors: ${research.keyActors?.join(", ") || "none"}
Key Tools: ${research.keyTools?.join(", ") || "none"}
Typical Clients: ${research.typicalClients?.join(", ") || "none"}
Cost Drivers: ${research.costDrivers?.join(", ") || "none"}
Regulatory: ${research.regulatoryNotes || "none"}`
      : "";

    const prompt = `You are a brutally honest industry analyst. Your job is to challenge assumptions and give the unvarnished truth.

YOUR RULES:
- Be pessimistic rather than optimistic — if the data is ambiguous, lean negative.
- Every claim must have reasoning. No vague platitudes.
- If a segment is genuinely saturated, say so. If barriers are high, say so.
- Use web search to independently verify market conditions.
- Never hallucinate statistics. If exact numbers aren't findable, give qualified ranges or say "data unavailable".
- Specific to ${jurisdiction || "this market"}.

NODE CONTEXT:
${ctx}
${researchBlock}

TASK: Analyze this segment honestly. Search the web for market conditions, competition data, and trend signals. Return:

{
  "demandTrend": "<one of: growing | stable | declining | volatile — with 1-sentence justification>",
  "competitiveSaturation": "<one of: low | moderate | high | oversaturated — with 1-sentence justification>",
  "entryBarriers": "<one of: low | moderate | high | extreme — with 2-3 specific barriers>",
  "painPoints": ["<4-6 genuine pain points operators face — be specific, not generic>"],
  "unmetNeeds": ["<3-5 real unmet needs or underserved niches — must be plausible, not aspirational>"],
  "disruptionRisk": "<one of: low | moderate | high — what could disrupt this segment in the next 3-5 years>",
  "marginProfile": "<one of: thin (<10%) | moderate (10-25%) | healthy (25-50%) | high (>50%) — with justification>",
  "clientSwitchingCosts": "<one of: low | moderate | high — why clients stay or leave>"
}

Return ONLY valid JSON.`;

    const client = getClient();
    const response = await (client as any).responses.create({
      model: "gpt-4.1-mini",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
      text: { format: { type: "text" } },
    });

    // Extract text output
    let outputText = "";
    if (response.output) {
      for (const item of response.output) {
        if (item.type === "message" && item.content) {
          for (const block of item.content) {
            if (block.type === "output_text") outputText += block.text;
          }
        }
      }
    }

    if (!outputText) {
      return NextResponse.json({ error: "No response from analysis agent" }, { status: 502 });
    }

    const raw = extractJSON(outputText);

    const result = {
      demandTrend: typeof raw.demandTrend === "string" ? raw.demandTrend : "data unavailable",
      competitiveSaturation: typeof raw.competitiveSaturation === "string" ? raw.competitiveSaturation : "data unavailable",
      entryBarriers: typeof raw.entryBarriers === "string" ? raw.entryBarriers : "data unavailable",
      painPoints: Array.isArray(raw.painPoints) ? raw.painPoints : [],
      unmetNeeds: Array.isArray(raw.unmetNeeds) ? raw.unmetNeeds : [],
      disruptionRisk: typeof raw.disruptionRisk === "string" ? raw.disruptionRisk : "data unavailable",
      marginProfile: typeof raw.marginProfile === "string" ? raw.marginProfile : "data unavailable",
      clientSwitchingCosts: typeof raw.clientSwitchingCosts === "string" ? raw.clientSwitchingCosts : "data unavailable",
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Enrich/analyze error:", err);
    return NextResponse.json({ error: err.message || "Analysis agent failed" }, { status: 500 });
  }
}
