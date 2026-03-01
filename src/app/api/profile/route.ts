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
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You are a profile-to-industry-node matcher. Given a user's professional background and an industry map, you find which nodes are most relevant to that person's skills, experience, or interests.

IMPORTANT RULES:
1. Be generous and creative with matching. The user may describe their background informally, with typos, in shorthand, or using different terminology than the node labels. Look for semantic overlap, transferable skills, and indirect relevance — not just exact keyword matches.
2. For example: "finance" can match accounting nodes, trading nodes, risk management, etc. "Tech" can match IT, software, data, infrastructure nodes. "Marketing" can match sales, advertising, branding nodes.
3. If the user's background has SOME relevance to ANY nodes — even indirect or partial — return those matches with honest explanations of the connection.
4. BE HONEST: If the user's background genuinely has NO meaningful connection to the industry map nodes (e.g. a pastry chef looking at a semiconductor map), return an empty matches array AND a "noMatchMessage" explaining honestly why there are no good matches and what kinds of backgrounds would be relevant.
5. Return 3-8 matches ranked by relevance (best first). Each reason should be 1 concise sentence.
6. Only use node IDs from the provided list.

Return ONLY valid JSON in this exact format:
{ "matches": [{ "id": "<node_id>", "reason": "<why>" }], "noMatchMessage": "<optional: explain if no matches>" }

Omit noMatchMessage if there ARE matches. Include it only when matches is empty.`,
        },
        {
          role: "user",
          content: `USER PROFILE:
${userProfile.trim()}

INDUSTRY MAP NODES:
${nodeList}

Return JSON with matches (and noMatchMessage if no good matches exist):`,
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

    // Support both { matches: [...] } wrapper and raw array
    const matchesArr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.matches)
      ? parsed.matches
      : [];
    const noMatchMessage =
      typeof parsed?.noMatchMessage === "string" ? parsed.noMatchMessage : null;

    // Validate: only keep entries whose IDs exist in the input node list
    const validIds = new Set(nodes.map((n) => n.id));
    const matches = matchesArr
      .filter(
        (m: any) =>
          typeof m.id === "string" &&
          typeof m.reason === "string" &&
          validIds.has(m.id)
      )
      .slice(0, 8)
      .map((m: any) => ({ id: m.id, reason: m.reason }));

    return NextResponse.json({ matches, ...(noMatchMessage && matches.length === 0 ? { noMatchMessage } : {}) });
  } catch (err: any) {
    console.error("Profile matcher error:", err);
    return NextResponse.json(
      { error: err.message || "Profile matching failed" },
      { status: 500 }
    );
  }
}
