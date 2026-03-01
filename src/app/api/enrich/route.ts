import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/enrich
 *
 * Web-search enrichment for a single node.
 * Uses OpenAI Responses API with web_search_preview to ground
 * node metadata in real-time web results.
 */

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

interface EnrichRequest {
  nodeId: string;
  label: string;
  category: string;
  description?: string;
  objective?: string;
  industry: string;
  jurisdiction?: string;
}

interface Opportunity {
  title: string;
  description: string;
  sourceUrl?: string;
}

interface EnrichResult {
  keyActors: string[];
  keyTools: string[];
  painPoints: string[];
  costDrivers: string[];
  regulatoryNotes: string;
  opportunities: Opportunity[];
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as EnrichRequest;
    const { label, category, description, objective, industry, jurisdiction } =
      body;

    if (!label || !industry) {
      return NextResponse.json(
        { error: "label and industry are required" },
        { status: 400 }
      );
    }

    const client = getClient();

    const prompt = `You are a business analyst researching the "${label}" segment (category: ${category}) within the "${industry}" industry${jurisdiction ? ` (${jurisdiction})` : ""}.

Context:
${description ? `- Description: ${description}` : ""}
${objective ? `- Objective: ${objective}` : ""}

Search the web for CURRENT, REAL information about this specific segment. Then return a JSON object with these fields:

{
  "keyActors": ["<4-8 real company names active in this segment — use web results>"],
  "keyTools": ["<4-8 real software platforms, tools, or systems used — use web results>"],
  "painPoints": ["<3-5 verified current inefficiencies, bottlenecks, or problems — cite specifics>"],
  "costDrivers": ["<3-5 real cost factors with approximate figures where available>"],
  "regulatoryNotes": "<current regulations, standards, or compliance requirements — be specific>",
  "opportunities": [
    {
      "title": "<concise opportunity name>",
      "description": "<2-3 sentences: what the inefficiency is, why it exists, and how a startup/product could address it>",
      "sourceUrl": "<URL of the web source that informed this opportunity, if available>"
    }
  ]
}

Guidelines:
- opportunities: include 2-5 actionable business opportunities derived from real inefficiencies you found
- Every company, tool, and regulation must be REAL and CURRENT — no made-up names
- Prefer specific data points (market size, adoption rates, pricing) when found
- Source URLs should be real pages you found during search
- Return ONLY valid JSON, no markdown fences`;

    // Use Responses API with web_search_preview tool
    const response = await (client as any).responses.create({
      model: "gpt-4.1-mini",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
      text: { format: { type: "text" } },
    });

    // Extract the text output from the response
    let outputText = "";
    if (response.output) {
      for (const item of response.output) {
        if (item.type === "message" && item.content) {
          for (const block of item.content) {
            if (block.type === "output_text") {
              outputText += block.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      return NextResponse.json(
        { error: "No response from enrichment model" },
        { status: 502 }
      );
    }

    // Extract JSON from response (handle markdown fences)
    let jsonStr = outputText;
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    jsonStr = jsonStr.trim();

    const result = JSON.parse(jsonStr) as EnrichResult;

    // Sanitize
    const enriched: EnrichResult = {
      keyActors: Array.isArray(result.keyActors) ? result.keyActors : [],
      keyTools: Array.isArray(result.keyTools) ? result.keyTools : [],
      painPoints: Array.isArray(result.painPoints) ? result.painPoints : [],
      costDrivers: Array.isArray(result.costDrivers) ? result.costDrivers : [],
      regulatoryNotes:
        typeof result.regulatoryNotes === "string"
          ? result.regulatoryNotes
          : "None specific",
      opportunities: Array.isArray(result.opportunities)
        ? result.opportunities.map((o) => ({
            title: o.title || "Untitled",
            description: o.description || "",
            sourceUrl: o.sourceUrl || undefined,
          }))
        : [],
    };

    return NextResponse.json(enriched);
  } catch (err: any) {
    console.error("Enrich error:", err);
    return NextResponse.json(
      { error: err.message || "Enrichment failed" },
      { status: 500 }
    );
  }
}
