import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/profile
 *
 * Profile Matcher Agent
 * Matches a user's skills/background against visible industry map nodes.
 * Returns ranked list of most relevant node IDs with reasons.
 * NOT a conversational agent — single-shot structured extraction only.
 */

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

interface NodeSummary {
  id: string;
  label: string;
  category: string;
  description?: string;
  objective?: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });
    }

    const body = await req.json();
    const { userProfile, nodes } = body as {
      userProfile: string;
      nodes: NodeSummary[];
    };

    // Validate input
    if (!userProfile || userProfile.trim().length < 10) {
      return NextResponse.json({ matches: [] });
    }
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return NextResponse.json({ matches: [] });
    }

    // Build compact node list for the prompt
    const nodeList = nodes
      .map(
        (n) =>
          `- [${n.id}] "${n.label}" (${n.category})${n.objective ? ` — ${n.objective}` : n.description ? ` — ${n.description}` : ""}`
      )
      .join("\n");

    const client = getClient();
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a node relevance matcher. You ONLY analyze the user's professional profile against the provided industry map nodes and return a JSON array of matching node IDs with short reasons.

You do NOT answer questions, have conversations, provide career advice, or respond to anything that is not a professional skills/background description. If the user input is not a profile or skills description, return an empty array [].

Rules:
- Return 5-8 nodes that best match the user's background, skills, or expertise
- Rank by relevance (best match first)
- Each reason must be 1 short sentence explaining why this node matches
- Only use node IDs from the provided list — never invent IDs
- Return ONLY valid JSON, no other text`,
        },
        {
          role: "user",
          content: `USER PROFILE:
${userProfile.trim()}

INDUSTRY MAP NODES:
${nodeList}

Return a JSON array of the most relevant nodes for this person:
[{ "id": "<node_id>", "reason": "<why this matches>" }]`,
        },
      ],
    });

    const outputText = response.choices?.[0]?.message?.content || "";

    if (!outputText.trim()) {
      return NextResponse.json({ matches: [] });
    }

    // Parse JSON — handle fenced code blocks
    let parsed: any;
    try {
      let s = outputText;
      const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) s = fence[1];
      parsed = JSON.parse(s.trim());
    } catch {
      return NextResponse.json({ matches: [] });
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ matches: [] });
    }

    // Validate: only keep entries whose IDs exist in the input node list
    const validIds = new Set(nodes.map((n) => n.id));
    const matches = parsed
      .filter(
        (m: any) =>
          typeof m.id === "string" &&
          typeof m.reason === "string" &&
          validIds.has(m.id)
      )
      .slice(0, 8)
      .map((m: any) => ({ id: m.id, reason: m.reason }));

    return NextResponse.json({ matches });
  } catch (err: any) {
    console.error("Profile matcher error:", err);
    return NextResponse.json(
      { error: err.message || "Profile matching failed" },
      { status: 500 }
    );
  }
}
