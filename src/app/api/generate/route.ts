import { NextRequest, NextResponse } from "next/server";
import { embed, findSimilarMap, storeMap, addQueryAlias } from "@/lib/embeddings";
import { deepResearch, slugify } from "@/lib/research";
import { fallbackMap } from "@/lib/parseResponse";

// Allow up to 60s for deep research on Vercel (max for Hobby plan).
// SSE streaming connections already get extended time, but this covers
// the GET fallback path too.
export const maxDuration = 60;

/* ────── SSE streaming handler — progress + data delivery ────── */
async function handleStream(_request: NextRequest, query: string) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (
        step: string,
        message: string,
        pct: number,
        extra?: Record<string, unknown>
      ) => {
        try {
          const event = JSON.stringify({ step, message, pct, ...extra });
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        } catch {
          // controller may be closed
        }
      };

      try {
        // 1. Embed the query
        send("embedding", "Understanding your query\u2026", 5);
        const queryEmbedding = await embed(query);

        // 2. Semantic search in Neon
        send("searching", "Searching knowledge base\u2026", 15);
        const match = await findSimilarMap(queryEmbedding);

        if (match) {
          // Found a semantic match — link this query to existing map
          try {
            await addQueryAlias(match.mapId, query, queryEmbedding);
          } catch (e) {
            console.warn("addQueryAlias failed (non-fatal):", e);
          }
          // Send the map data in the done event
          send("done", "Complete", 100, {
            data: match.mapData,
            source: "database",
            matchedIndustry: match.industryName,
          });
          controller.close();
          return;
        }

        // 3. Deep research pipeline with progress callbacks
        send("researching", "Starting deep research\u2026", 18);

        const result = await deepResearch(query, (p) =>
          send(p.step, p.message, p.pct)
        );

        // 4. Store in Neon
        send("storing", "Saving to knowledge base\u2026", 96);
        const slug = slugify(result.industry);
        await storeMap(slug, result.industry, result, query, queryEmbedding);

        // Send the map data in the done event
        send("done", "Complete", 100, {
          data: result,
          source: "research",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Stream error:", error);

        // Send fallback skeleton with the error so the client has something to show
        send("error", `Research failed: ${msg}`, 0, {
          data: fallbackMap(query),
          source: "fallback",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/* ────── GET handler ────── */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    if (query.length > 200) {
      return NextResponse.json(
        { error: "Query too long (max 200 characters)" },
        { status: 400 }
      );
    }

    // Stream mode — SSE with progress + data delivery
    if (searchParams.get("stream") === "1") {
      return handleStream(request, query);
    }

    // ─── Non-stream mode: lightweight DB-only lookup (for direct API consumers) ───
    const queryEmbedding = await embed(query);
    const match = await findSimilarMap(queryEmbedding);

    if (match) {
      try {
        await addQueryAlias(match.mapId, query, queryEmbedding);
      } catch (e) {
        console.warn("addQueryAlias failed (non-fatal):", e);
      }

      return NextResponse.json(
        { data: match.mapData },
        {
          headers: {
            "X-Source": "database",
            "X-Matched-Industry": match.industryName,
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    }

    // No DB match — run deep research inline (used by GET fallback)
    const result = await deepResearch(query);
    const slug = slugify(result.industry);
    await storeMap(slug, result.industry, result, query, queryEmbedding);

    return NextResponse.json(
      { data: result },
      {
        headers: {
          "X-Source": "research",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("API error:", error);
    const query = new URL(request.url).searchParams.get("q") || "Unknown Industry";
    return NextResponse.json(
      {
        data: fallbackMap(query),
        error: `Research failed: ${msg}`,
      },
      {
        status: 503,
        headers: { "X-Source": "fallback" },
      }
    );
  }
}

/* ────── POST — backward-compatible alias ────── */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query?.trim();
    const url = new URL(request.url);
    url.searchParams.set("q", query || "");
    const getRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });
    return GET(getRequest);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
