import { NextRequest, NextResponse } from "next/server";
import { embed, findSimilarMap, storeMap, addQueryAlias } from "@/lib/embeddings";
import { deepResearch, slugify } from "@/lib/research";
import { fallbackMap } from "@/lib/parseResponse";
import type { IndustryMap } from "@/types";

// ─── In-memory deduplication for concurrent requests ───
const inflight = new Map<string, Promise<IndustryMap>>();

function dedup(key: string, fn: () => Promise<IndustryMap>): Promise<IndustryMap> {
  const normalized = key.toLowerCase().trim();
  const existing = inflight.get(normalized);
  if (existing) return existing;

  const promise = fn().finally(() => inflight.delete(normalized));
  inflight.set(normalized, promise);
  return promise;
}

// ─── Simple rate limiting ───
const rateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour
const RATE_LIMIT_MAX = 30; // per hour — deep research is expensive

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimit.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  rateLimit.set(ip, recent);
  return recent.length < RATE_LIMIT_MAX;
}

function addRateLimit(ip: string) {
  const timestamps = rateLimit.get(ip) || [];
  timestamps.push(Date.now());
  rateLimit.set(ip, timestamps);
}

/* ────── SSE streaming handler for real-time progress ────── */
async function handleStream(request: NextRequest, query: string) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (step: string, message: string, pct: number) => {
        try {
          const event = JSON.stringify({ step, message, pct });
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
        send("searching", "Searching knowledge base\u2026", 10);
        const match = await findSimilarMap(queryEmbedding);

        if (match) {
          // Found a semantic match — link this query to existing map
          send("matched", `Found match: ${match.industryName}`, 90);
          try {
            await addQueryAlias(match.mapId, query, queryEmbedding);
          } catch (e) {
            console.warn("addQueryAlias failed (non-fatal):", e);
          }
          send("done", "Complete", 100);
          controller.close();
          return;
        }

        // 3. Rate limit check
        const ip =
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown";
        if (!checkRateLimit(ip)) {
          send("error", "Rate limit exceeded. Try again later.", 0);
          controller.close();
          return;
        }

        // 4. Deep research pipeline with progress callbacks
        send("researching", "Starting deep research\u2026", 12);

        const result = await dedup(query, () =>
          deepResearch(query, (p) => send(p.step, p.message, p.pct))
        );

        // 5. Store in Neon
        send("storing", "Saving to knowledge base\u2026", 96);
        const slug = slugify(result.industry);
        await storeMap(slug, result.industry, result, query, queryEmbedding);

        addRateLimit(ip);
        send("done", "Complete", 100);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Stream error:", error);
        send("error", `Research failed: ${msg}`, 0);
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

    // Stream mode — real-time progress via SSE
    if (searchParams.get("stream") === "1") {
      return handleStream(request, query);
    }

    // ─── Non-stream mode: embed → search Neon → return data ───

    // 1. Embed the query
    const queryEmbedding = await embed(query);

    // 2. Semantic search
    const match = await findSimilarMap(queryEmbedding);

    if (match) {
      // Also store this query as an alias for future exact matches
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
            "X-Cache": "HIT",
            "X-Matched-Industry": match.industryName,
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    }

    // 3. Rate limit
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    // 4. Deep research (deduped)
    const result = await dedup(query, () => deepResearch(query));

    // 5. Store in Neon
    const slug = slugify(result.industry);
    await storeMap(slug, result.industry, result, query, queryEmbedding);
    addRateLimit(ip);

    return NextResponse.json(
      { data: result },
      {
        headers: {
          "X-Source": "research",
          "X-Cache": "MISS",
          "X-Archetype": result.archetype || "unknown",
          "X-Jurisdiction": result.jurisdiction || "Global",
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
        headers: { "X-Source": "fallback", "X-Cache": "MISS" },
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
