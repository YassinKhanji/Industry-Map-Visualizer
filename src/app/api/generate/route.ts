import { NextRequest, NextResponse } from "next/server";
import { resolveMode } from "@/lib/resolver";
import { assembleFromBlocks, generateFromScratch } from "@/lib/assembler";
import { fallbackMap } from "@/lib/parseResponse";
import { cacheGet, cacheSet, dedup } from "@/lib/cache";
import { getBlockAsync } from "@/data/blocks/index";
import type { IndustryMap } from "@/types";

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
    const { mode, industrySlug } = resolveMode(query);

    // For prebuilt, try the registry directly — no LLM, no rate limit
    if (mode === "prebuilt" && industrySlug) {
      const prebuilt = await getBlockAsync(industrySlug);
      if (prebuilt) {
        cacheSet(query, prebuilt, "prebuilt");
        return NextResponse.json(
          { data: prebuilt },
          {
            headers: {
              "X-Source": "prebuilt",
              "X-Cache": "MISS",
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
    const result = await dedup(query, async (): Promise<IndustryMap> => {
      switch (mode) {
        case "assemble": {
          if (industrySlug) {
            const blocks = await getBlockAsync(industrySlug);
            if (blocks) {
              return assembleFromBlocks(query, blocks);
            }
          }
          return generateFromScratch(query);
        }

        case "generate":
        default:
          return generateFromScratch(query);
      }
    });

    // 4. Cache the result
    addRateLimit(ip);
    cacheSet(query, result, mode);

    return NextResponse.json(
      { data: result },
      {
        headers: {
          "X-Source": mode,
          "X-Cache": "MISS",
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
