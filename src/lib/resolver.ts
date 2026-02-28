import Fuse from "fuse.js";
import aliasesData from "@/data/aliases.json";
import type { ResolveMode } from "@/types";

// Build a flat list of { industry, alias } for Fuse.js
interface AliasEntry {
  industry: string;
  alias: string;
}

const aliasEntries: AliasEntry[] = [];
for (const [industry, aliases] of Object.entries(aliasesData)) {
  for (const alias of aliases) {
    aliasEntries.push({ industry, alias });
  }
}

const fuse = new Fuse(aliasEntries, {
  keys: ["alias"],
  threshold: 0.4,
  includeScore: true,
});

/**
 * Normalize a query string for comparison
 */
export function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

/**
 * Resolve the query into one of three modes:
 * - "prebuilt": exact or close match to a seeded industry → load static JSON
 * - "assemble": partial match → LLM picks from closest seeded blocks
 * - "generate": no match → LLM builds from scratch
 */
export function resolveMode(query: string): {
  mode: ResolveMode;
  industrySlug: string | null;
} {
  const normalized = normalize(query);

  if (!normalized) {
    return { mode: "generate", industrySlug: null };
  }

  const results = fuse.search(normalized);

  if (results.length === 0) {
    return { mode: "generate", industrySlug: null };
  }

  const best = results[0];
  const score = best.score ?? 1;

  // score < 0.3 = very close match → prebuilt
  if (score < 0.3) {
    return { mode: "prebuilt", industrySlug: best.item.industry };
  }

  // score < 0.5 = partial match → assemble from blocks
  if (score < 0.5) {
    return { mode: "assemble", industrySlug: best.item.industry };
  }

  // weak match → generate from scratch
  return { mode: "generate", industrySlug: null };
}

/**
 * Get the list of available seeded industry slugs
 */
export function getSeededIndustries(): string[] {
  return Object.keys(aliasesData);
}
