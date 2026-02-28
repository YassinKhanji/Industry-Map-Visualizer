import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { resolveMode } from "@/lib/resolver";
import { assembleFromBlocks, generateFromScratch } from "@/lib/assembler";
import { fallbackMap } from "@/lib/parseResponse";
import { cacheGet, cacheSet, dedup } from "@/lib/cache";
import { getBlockAsync } from "@/data/blocks/index";
import type { IndustryMap } from "@/types";

/* ────── Lightweight AI spell-correction ────── */
async function correctQuery(raw: string): Promise<string | null> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a spell-checker for industry, product, and service names. " +
            "Given a possibly misspelled query, return ONLY the corrected version. " +
            "If the query is already correct or is a valid niche term, return it unchanged. " +
            "Return just the corrected text, nothing else — no quotes, no explanation.",
        },
        { role: "user", content: raw },
      ],
      temperature: 0,
      max_tokens: 60,
    });
    const corrected = res.choices[0]?.message?.content?.trim();
    if (!corrected) return null;
    // Only count it as a correction if it actually changed
    if (corrected.toLowerCase() === raw.toLowerCase()) return null;
    return corrected;
  } catch {
    return null; // spell-check is best-effort
  }
}

// Simple rate limiting: Map of IP → timestamps
const rateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour
const RATE_LIMIT_MAX = 60; // raised — cache prevents most LLM calls now

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
      const send = (step: string, message: string, pct: number, extra?: Record<string, unknown>) => {
        try {
          const event = JSON.stringify({ step, message, pct, ...extra });
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        } catch {
          // controller may be closed
        }
      };

      try {
        // 1. Cache check
        send("cache-check", "Checking cache\u2026", 5);
        const cached = cacheGet(query);
        if (cached) {
          send("done", "Loaded from cache", 100, { data: cached.data, source: cached.source });
          controller.close();
          return;
        }

        // 2. Resolve
        send("resolving", "Resolving industry\u2026", 15);
        let { mode, industrySlug } = resolveMode(query);
        let corrected: string | null = null;

        // 3. Spell-check if no alias match
        if (mode === "generate") {
          send("spell-check", "Checking spelling\u2026", 20);
          corrected = await correctQuery(query);
          if (corrected) {
            send("spell-corrected", `Did you mean \u201c${corrected}\u201d?`, 30);
            const correctedCached = cacheGet(corrected);
            if (correctedCached) {
              send("done", "Loaded from cache", 100, {
                data: correctedCached.data,
                source: correctedCached.source,
                corrected,
              });
              controller.close();
              return;
            }
            const reResolved = resolveMode(corrected);
            if (reResolved.mode !== "generate") {
              mode = reResolved.mode;
              industrySlug = reResolved.industrySlug;
            }
          }
        }

        const effectiveQuery = corrected || query;

        // 4a. Prebuilt path
        if (mode === "prebuilt" && industrySlug) {
          send("loading-prebuilt", "Loading prebuilt data\u2026", 50);
          const prebuilt = await getBlockAsync(industrySlug);
          if (prebuilt) {
            send("caching", "Caching results\u2026", 90);
            cacheSet(query, prebuilt, "prebuilt");
            if (corrected) cacheSet(corrected, prebuilt, "prebuilt");
            send("done", "Complete", 100, { data: prebuilt, source: "prebuilt", corrected });
            controller.close();
            return;
          }
        }

        // Rate limit
        const ip =
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown";
        if (!checkRateLimit(ip)) {
          send("error", "Rate limit exceeded. Try again later.", 0);
          controller.close();
          return;
        }

        // 4b. LLM path
        if (mode === "assemble") {
          send("assembling", "Assembling map from library\u2026", 40);
        } else {
          send("generating", "Generating map with AI\u2026", 40);
        }

        const result = await dedup(effectiveQuery, async (): Promise<IndustryMap> => {
          switch (mode) {
            case "assemble": {
              if (industrySlug) {
                const blocks = await getBlockAsync(industrySlug);
                if (blocks) return assembleFromBlocks(effectiveQuery, blocks);
              }
              return generateFromScratch(effectiveQuery);
            }
            default:
              return generateFromScratch(effectiveQuery);
          }
        });

        send("validating", "Validating map\u2026", 80);
        send("caching", "Caching results\u2026", 90);
        addRateLimit(ip);
        cacheSet(query, result, mode);
        if (corrected) cacheSet(corrected, result, mode);

        send("done", "Complete", 100, { data: result, source: mode, corrected });
      } catch (error) {
        console.error("Stream error:", error);
        send("error", "Generation failed", 0, {
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

/* ────── GET handler (cacheable by browsers & CDNs) ────── */
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

    // 1. Check server-side cache first (memory → file)
    const cached = cacheGet(query);
    if (cached) {
      return NextResponse.json(
        { data: cached.data },
        {
          headers: {
            "X-Source": cached.source,
            "X-Cache": "HIT",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    }

    // 2. Rate limit (only for cache misses that will hit LLM)
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Resolve mode to check if prebuilt (no rate limit needed for prebuilt)
    let { mode, industrySlug } = resolveMode(query);
    let corrected: string | null = null;

    // If Fuse.js can't match, try AI spell-correction and re-resolve
    if (mode === "generate") {
      corrected = await correctQuery(query);
      if (corrected) {
        // Check cache for the corrected query too
        const correctedCached = cacheGet(corrected);
        if (correctedCached) {
          return NextResponse.json(
            { data: correctedCached.data },
            {
              headers: {
                "X-Source": correctedCached.source,
                "X-Cache": "HIT",
                "X-Corrected-Query": corrected,
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
              },
            }
          );
        }
        // Re-resolve with the corrected spelling
        const reResolved = resolveMode(corrected);
        if (reResolved.mode !== "generate") {
          mode = reResolved.mode;
          industrySlug = reResolved.industrySlug;
        }
      }
    }

    // The effective query for generation (corrected if available)
    const effectiveQuery = corrected || query;

    // For prebuilt, try the registry directly — no LLM, no rate limit
    if (mode === "prebuilt" && industrySlug) {
      const prebuilt = await getBlockAsync(industrySlug);
      if (prebuilt) {
        cacheSet(query, prebuilt, "prebuilt");
        if (corrected) cacheSet(corrected, prebuilt, "prebuilt");
        return NextResponse.json(
          { data: prebuilt },
          {
            headers: {
              "X-Source": "prebuilt",
              "X-Cache": "MISS",
              ...(corrected ? { "X-Corrected-Query": corrected } : {}),
              "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            },
          }
        );
      }
    }

    // LLM path — rate limit applies
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    // 3. Deduplicated generation
    const result = await dedup(effectiveQuery, async (): Promise<IndustryMap> => {
      switch (mode) {
        case "assemble": {
          if (industrySlug) {
            const blocks = await getBlockAsync(industrySlug);
            if (blocks) {
              return assembleFromBlocks(effectiveQuery, blocks);
            }
          }
          return generateFromScratch(effectiveQuery);
        }

        case "generate":
        default:
          return generateFromScratch(effectiveQuery);
      }
    });

    // 4. Cache the result (under both original and corrected keys)
    addRateLimit(ip);
    cacheSet(query, result, mode);
    if (corrected) cacheSet(corrected, result, mode);

    return NextResponse.json(
      { data: result },
      {
        headers: {
          "X-Source": mode,
          "X-Cache": "MISS",
          ...(corrected ? { "X-Corrected-Query": corrected } : {}),
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    console.error("API error:", error);

    const query = new URL(request.url).searchParams.get("q") || "Unknown Industry";
    return NextResponse.json(
      {
        data: fallbackMap(query),
        error: "Generation failed, showing skeleton map",
      },
      {
        status: 200,
        headers: { "X-Source": "fallback", "X-Cache": "MISS" },
      }
    );
  }
}

/* ────── Keep POST as backward-compatible alias ────── */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query?.trim();

    // Rewrite as a GET to the same handler
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
