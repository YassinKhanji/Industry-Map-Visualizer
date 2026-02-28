import { IndustryMapSchema } from "@/types";
import type { IndustryMap } from "@/types";

/**
 * Three-layer defense for parsing LLM JSON output:
 * 1. Direct JSON.parse + Zod validation
 * 2. Extract from markdown code blocks + Zod validation
 * 3. Return null (caller should retry or use fallback)
 */
export function parseMapResponse(raw: string): IndustryMap | null {
  // Layer 1: direct parse
  try {
    const parsed = JSON.parse(raw);
    const validated = IndustryMapSchema.parse(parsed);
    return postProcess(validated);
  } catch {
    // continue to layer 2
  }

  // Layer 2: extract from markdown code blocks
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      const validated = IndustryMapSchema.parse(parsed);
      return postProcess(validated);
    } catch {
      // continue to layer 3
    }
  }

  // Layer 3: try to find any JSON object in the string
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = IndustryMapSchema.parse(parsed);
      return postProcess(validated);
    } catch {
      // give up
    }
  }

  return null;
}

/**
 * Post-process a validated IndustryMap:
 * - Remove circular edges
 * - Remove orphaned edges (referencing non-existent nodes)
 * - Ensure unique IDs
 */
function postProcess(map: IndustryMap): IndustryMap {
  // Collect all node IDs (recursive)
  const allIds = new Set<string>();
  function collectIds(nodes: IndustryMap["rootNodes"]) {
    for (const node of nodes) {
      allIds.add(node.id);
      if (node.subNodes) collectIds(node.subNodes);
    }
  }
  collectIds(map.rootNodes);

  // Filter edges: remove self-loops and edges referencing missing nodes
  const cleanEdges = map.edges.filter(
    (edge) =>
      edge.source !== edge.target &&
      allIds.has(edge.source) &&
      allIds.has(edge.target)
  );

  // Deduplicate edges
  const edgeSet = new Set<string>();
  const uniqueEdges = cleanEdges.filter((edge) => {
    const key = `${edge.source}->${edge.target}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  return {
    ...map,
    edges: uniqueEdges,
  };
}

/**
 * Generate a fallback skeleton map when everything fails
 */
export function fallbackMap(query: string): IndustryMap {
  return {
    industry: query,
    rootNodes: [
      {
        id: "upstream",
        label: "Upstream Inputs",
        category: "upstream-inputs",
        description: "Raw materials, data, and resources",
      },
      {
        id: "production",
        label: "Core Production",
        category: "core-production",
        description: "Primary transformation or service delivery",
      },
      {
        id: "processing",
        label: "Processing",
        category: "processing",
        description: "Operations, quality control, logistics",
      },
      {
        id: "distribution",
        label: "Distribution",
        category: "distribution",
        description: "Channels to reach the end customer",
      },
      {
        id: "customer",
        label: "Customer",
        category: "customer-facing",
        description: "End users and their experience",
      },
      {
        id: "support",
        label: "Support Operations",
        category: "support-ops",
        description: "Administrative and operational backbone",
      },
      {
        id: "regulation",
        label: "Regulation",
        category: "regulation",
        description: "Legal and compliance requirements",
      },
      {
        id: "technology",
        label: "Technology",
        category: "technology",
        description: "Systems and tools enabling operations",
      },
    ],
    edges: [
      { source: "upstream", target: "production" },
      { source: "production", target: "processing" },
      { source: "processing", target: "distribution" },
      { source: "distribution", target: "customer" },
      { source: "support", target: "production" },
      { source: "support", target: "processing" },
      { source: "regulation", target: "production" },
      { source: "technology", target: "production" },
      { source: "technology", target: "distribution" },
    ],
  };
}
