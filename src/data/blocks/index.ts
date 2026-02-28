import type { IndustryMap } from "@/types";

/**
 * Static block registry — imports all prebuilt industry block files.
 * When new .json files are generated, add them here.
 */

import financialServices from "@/data/blocks/financial-services.json";

// Map slug → prebuilt IndustryMap
const registry = new Map<string, IndustryMap>();

registry.set("financial-services", financialServices as unknown as IndustryMap);

/**
 * Try to dynamically load a block file that might have been generated
 * but not yet added to the static registry.
 */
async function dynamicLoad(slug: string): Promise<IndustryMap | null> {
  try {
    const data = await import(`@/data/blocks/${slug}.json`);
    const map = (data.default || data) as IndustryMap;
    registry.set(slug, map); // cache for future calls
    return map;
  } catch {
    return null;
  }
}

export function getBlock(slug: string): IndustryMap | undefined {
  return registry.get(slug);
}

export async function getBlockAsync(
  slug: string
): Promise<IndustryMap | null> {
  const static_ = registry.get(slug);
  if (static_) return static_;
  return dynamicLoad(slug);
}

export function hasBlock(slug: string): boolean {
  return registry.has(slug);
}

export function listSlugs(): string[] {
  return Array.from(registry.keys());
}
