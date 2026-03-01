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
        id: "capital",
        label: "Capital",
        category: "capital",
        description: "Funding, investment, and financial resources",
        objective: "Provide financial resources to enable operations",
      },
      {
        id: "inputs",
        label: "Inputs",
        category: "inputs",
        description: "Raw materials, data, and supply chain resources",
        objective: "Source and deliver essential inputs for production",
      },
      {
        id: "production",
        label: "Production",
        category: "production",
        description: "Primary transformation or service delivery",
        objective: "Transform inputs into core products or services",
      },
      {
        id: "processing",
        label: "Processing",
        category: "processing",
        description: "Quality control, packaging, and post-production",
        objective: "Refine and prepare output for distribution",
      },
      {
        id: "distribution",
        label: "Distribution",
        category: "distribution",
        description: "Channels to reach the end customer",
        objective: "Deliver products or services to customer segments",
      },
      {
        id: "customer",
        label: "Customer",
        category: "customer",
        description: "End users and their experience",
        objective: "Acquire, serve, and retain customers",
      },
      {
        id: "compliance",
        label: "Compliance",
        category: "compliance",
        description: "Legal, regulatory, and standards requirements",
        objective: "Ensure operations meet regulatory obligations",
      },
      {
        id: "infrastructure",
        label: "Infrastructure",
        category: "infrastructure",
        description: "Technology, systems, and operational backbone",
        objective: "Provide shared platforms and tools for all functions",
      },
    ],
    edges: [
      { source: "capital", target: "inputs" },
      { source: "inputs", target: "production" },
      { source: "production", target: "processing" },
      { source: "processing", target: "distribution" },
      { source: "distribution", target: "customer" },
      { source: "compliance", target: "production" },
      { source: "compliance", target: "distribution" },
      { source: "infrastructure", target: "production" },
      { source: "infrastructure", target: "distribution" },
      { source: "capital", target: "production" },
    ],
  };
}
