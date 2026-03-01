import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/enrich/research
 *
 * Agent 1: Market Researcher
 * Pure factual gathering via web search.
 * Returns verified actors, tools, clients, regulations, cost drivers.
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
      existingKeyActors, existingKeyTools, existingCostDrivers, existingRegulatoryNotes,
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
      parent ? `PARENT NODE: "${parent.label}" (${parent.category})${parent.objective ? ` — ${parent.objective}` : ""}` : "",
      children?.length ? `SUB-COMPONENTS: ${children.map((c: any) => `"${c.label}" (${c.category})`).join(", ")}` : "",
      connections?.length ? `CONNECTIONS:\n${connections.map((c: any) => `  ${c.direction === "inbound" ? "←" : "→"} ${c.label}`).join("\n")}` : "",
      existingKeyActors?.length ? `EXISTING ACTORS (verify these): ${existingKeyActors.join(", ")}` : "",
      existingKeyTools?.length ? `EXISTING TOOLS (verify these): ${existingKeyTools.join(", ")}` : "",
      existingCostDrivers?.length ? `EXISTING COST DRIVERS (verify these): ${existingCostDrivers.join(", ")}` : "",
      existingRegulatoryNotes ? `EXISTING REGULATORY NOTES (verify): ${existingRegulatoryNotes}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `You are a market research analyst specializing in ${industry}.

YOUR RULES:
- You ONLY report verifiable facts found via web search.
- If you cannot verify something, write "unverified" next to it.
- Never invent company names, tool names, or statistics.
- If existing data (actors, tools, etc.) is provided, CHECK if it's still accurate. Correct or remove anything wrong.
- Be specific to ${jurisdiction || "this market"}, not generic.

NODE CONTEXT:
${ctx}

TASK: Search the web for current, real information about the "${label}" segment. Return a JSON object:

{
  "keyActors": ["<4-8 real company names currently active in this specific segment — web-verified>"],
  "keyTools": ["<4-8 real software, platforms, systems, or technologies actually used today — web-verified>"],
  "typicalClients": ["<3-6 types of clients or specific named companies that buy from this segment>"],
  "costDrivers": ["<3-5 real cost factors for operators in this segment, with approximate figures where findable>"],
  "regulatoryNotes": "<specific current regulations, standards, licenses, or compliance requirements — not generic>"
}

Return ONLY valid JSON.`;

    const client = getClient();
    const response = await (client as any).responses.create({
      model: "gpt-4.1-mini",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
      text: { format: { type: "text" } },
    });

    // Extract text output and url_citation annotations
    let outputText = "";
    const citationMap = new Map<string, string>(); // url -> title
    if (response.output) {
      for (const item of response.output) {
        if (item.type === "message" && item.content) {
          for (const block of item.content) {
            if (block.type === "output_text") {
              outputText += block.text;
              // Extract url_citation annotations from this block
              if (Array.isArray(block.annotations)) {
                for (const ann of block.annotations) {
                  if (ann.type === "url_citation" && ann.url) {
                    citationMap.set(ann.url, ann.title || new URL(ann.url).hostname);
                  }
                }
              }
            }
          }
        }
      }
    }

    if (!outputText) {
      return NextResponse.json({ error: "No response from research agent" }, { status: 502 });
    }

    const raw = extractJSON(outputText);

    // Deduplicated sources from web search citations
    const sources = Array.from(citationMap.entries()).map(([url, title]) => ({ url, title }));

    const result = {
      keyActors: Array.isArray(raw.keyActors) ? raw.keyActors : [],
      keyTools: Array.isArray(raw.keyTools) ? raw.keyTools : [],
      typicalClients: Array.isArray(raw.typicalClients) ? raw.typicalClients : [],
      costDrivers: Array.isArray(raw.costDrivers) ? raw.costDrivers : [],
      regulatoryNotes: typeof raw.regulatoryNotes === "string" ? raw.regulatoryNotes : "None specific",
      sources,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Enrich/research error:", err);
    return NextResponse.json({ error: err.message || "Research agent failed" }, { status: 500 });
  }
}
