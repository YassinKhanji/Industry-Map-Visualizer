import { NextRequest, NextResponse } from "next/server";
import { resolveMode } from "@/lib/resolver";
import { assembleFromBlocks, generateFromScratch } from "@/lib/assembler";
import { fallbackMap } from "@/lib/parseResponse";
import type { IndustryMap } from "@/types";

// Simple rate limiting: Map of IP → timestamps
const rateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour
const RATE_LIMIT_MAX = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimit.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  rateLimit.set(ip, recent);
  return recent.length < RATE_LIMIT_MAX;
}

// Load prebuilt blocks
async function loadPrebuiltBlocks(
  industrySlug: string
): Promise<IndustryMap | null> {
  try {
    // Dynamic import for JSON files
    const data = await import(
      `@/data/blocks/${industrySlug}.json`
    );
    return data.default || data;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
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

    const body = await request.json();
    const query = body.query?.trim();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    if (query.length > 200) {
      return NextResponse.json(
        { error: "Query too long (max 200 characters)" },
        { status: 400 }
      );
    }

    // Resolve mode
    const { mode, industrySlug } = resolveMode(query);
    let result: IndustryMap;

    switch (mode) {
      case "prebuilt": {
        if (industrySlug) {
          const prebuilt = await loadPrebuiltBlocks(industrySlug);
          if (prebuilt) {
            result = prebuilt;
            break;
          }
        }
        // Fall through to generate if prebuilt not found
        result = await generateFromScratch(query);
        break;
      }

      case "assemble": {
        if (industrySlug) {
          const blocks = await loadPrebuiltBlocks(industrySlug);
          if (blocks) {
            result = await assembleFromBlocks(query, blocks);
            break;
          }
        }
        result = await generateFromScratch(query);
        break;
      }

      case "generate":
      default: {
        result = await generateFromScratch(query);
        break;
      }
    }

    // Track rate limit
    const timestamps = rateLimit.get(ip) || [];
    timestamps.push(Date.now());
    rateLimit.set(ip, timestamps);

    return NextResponse.json(
      { data: result },
      {
        headers: {
          "X-Source": mode,
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("API error:", error);

    // Return fallback map so UI never shows empty state
    const query =
      (await request.json().catch(() => ({}))).query || "Unknown Industry";
    return NextResponse.json(
      {
        data: fallbackMap(query),
        error: "Generation failed, showing skeleton map",
      },
      {
        status: 200,
        headers: { "X-Source": "fallback" },
      }
    );
  }
}
