import { NextRequest } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * POST /api/chat
 *
 * Streaming chat endpoint scoped to a specific industry node.
 * Supports optional web search via the Responses API.
 *
 * Body: { messages: {role,content}[], nodeContext: string, webSearch: boolean }
 * Returns: text/event-stream with `data: {"delta":"..."}` chunks + `data: {"done":true}`
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not set" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { messages, nodeContext, webSearch } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!nodeContext || typeof nodeContext !== "string") {
      return new Response(
        JSON.stringify({ error: "nodeContext is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a specialist analyst assigned to ONE specific industry node. Below is every piece of data known about this node. Use it as your primary knowledge base.

=== NODE DATA ===
${nodeContext}
=== END NODE DATA ===

YOUR RULES:
1. Answer questions ONLY about this node, its business opportunities, market dynamics, competitive landscape, entry strategies, revenue models, and related operational details.
2. If the user asks about something outside this node's scope, politely redirect: "That's outside my scope — I'm specialized in [node label]. Ask me about its opportunities, market dynamics, or entry strategies."
3. Be specific and data-driven. Reference the node data provided above when answering.
4. Keep answers concise but substantive. Use bullet points for lists.
5. If you used web search, cite sources inline.
6. Never fabricate company names, statistics, or facts. Say "I don't have that data" if unsure.`;

    const client = getClient();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        try {
          if (webSearch) {
            // ── Responses API with web_search_preview (streamed) ──
            const inputMessages = [
              { role: "system" as const, content: systemPrompt },
              ...messages.map((m: { role: string; content: string }) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
            ];

            const response = await (client as any).responses.create({
              model: "gpt-4.1-mini",
              tools: [{ type: "web_search_preview" }],
              input: inputMessages,
              stream: true,
            });

            for await (const event of response) {
              if (
                event.type === "response.output_text.delta" &&
                typeof event.delta === "string"
              ) {
                send({ delta: event.delta });
              }
            }
          } else {
            // ── Chat Completions API (streamed) ──
            const completionStream = await client.chat.completions.create({
              model: "gpt-4.1-mini",
              temperature: 0.4,
              stream: true,
              messages: [
                { role: "system", content: systemPrompt },
                ...messages.map((m: { role: string; content: string }) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content,
                })),
              ],
            });

            for await (const chunk of completionStream) {
              const delta = chunk.choices[0]?.delta?.content;
              if (delta) {
                send({ delta });
              }
            }
          }

          send({ done: true });
        } catch (err: any) {
          send({ error: err.message || "Chat failed", done: true });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
