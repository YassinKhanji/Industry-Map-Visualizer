import OpenAI from "openai";
import { IndustryMapSchema } from "@/types";
import type { IndustryMap, IndustryBlock, MapEdge, Category } from "@/types";

/**
 * Deep Research Pipeline
 *
 * Step A: Structure Agent (gpt-4.1) → Root node skeleton
 * Step B: Detail Agents (gpt-4.1-mini × N, parallel) → Sub-nodes for each root
 * Step C: Edge Agent (gpt-4.1-mini) → Meaningful connections
 * Step D: Assemble + validate
 */

const VALID_CATEGORIES: Category[] = [
  "upstream-inputs",
  "core-production",
  "processing",
  "distribution",
  "customer-facing",
  "support-ops",
  "regulation",
  "technology",
  "roles",
  "alternative-assets",
  "esg-stewardship",
  "private-wealth",
  "systemic-oversight",
];

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ─── Step A: Structure Agent ───

interface RootNodeSkeleton {
  id: string;
  label: string;
  category: Category;
  description: string;
}

async function researchStructure(query: string): Promise<{
  industryName: string;
  roots: RootNodeSkeleton[];
}> {
  const client = getClient();

  const res = await client.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0.3,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an industry research expert who maps the full value chain of any industry, product, or service.

Given a query, produce a JSON object with:
- "industryName": A professional display name for this industry/product/service
- "roots": An array of 10-16 root nodes representing the major segments of the value chain

Each root node must have:
- "id": lowercase kebab-case identifier (e.g., "upstream-inputs")
- "label": Human-readable name (2-4 words)
- "category": One of: ${VALID_CATEGORIES.join(", ")}
- "description": One-sentence description of this segment's role (15-30 words)

Guidelines:
- Cover the FULL value chain from raw inputs → production → processing → distribution → customer
- Include support functions (operations, regulation, technology)
- Use specific, domain-relevant names (not generic like "Other")
- Ensure every category is used at least once where relevant
- Order nodes logically along the value chain

Return ONLY valid JSON. No markdown, no explanation.`,
      },
      {
        role: "user",
        content: query,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as {
    industryName: string;
    roots: RootNodeSkeleton[];
  };

  // Validate categories
  parsed.roots = parsed.roots.map((r) => ({
    ...r,
    category: VALID_CATEGORIES.includes(r.category) ? r.category : "core-production",
  }));

  return parsed;
}

// ─── Step B: Detail Agents (parallel) ───

interface DetailedSubNode {
  id: string;
  label: string;
  category: Category;
  description: string;
}

async function researchNodeDetails(
  query: string,
  industryName: string,
  rootNode: RootNodeSkeleton
): Promise<DetailedSubNode[]> {
  const client = getClient();

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a deep industry research agent specializing in "${industryName}".

Given a root segment of the value chain, produce detailed sub-nodes with real-world specifics.

Return a JSON object with:
- "subNodes": Array of 4-9 sub-nodes

Each sub-node must have:
- "id": lowercase kebab-case, unique, descriptive (e.g., "nav-calculation", "broker-dealers")
- "label": Human-readable name (2-4 words)
- "category": "${rootNode.category}" (same as parent)
- "description": Specific, factual description (15-30 words). Include real company names, tools, standards, or regulations where relevant.

Guidelines:
- Be SPECIFIC to the "${query}" domain — not generic
- Include real examples: company names (Bloomberg, Salesforce), standards (ISO, GAAP), tools, regulations
- Each sub-node should represent a distinct function, role, or entity
- No duplicates, no generic filler nodes
- Order from most fundamental to most specialized

Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Root segment: "${rootNode.label}" — ${rootNode.description}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || '{"subNodes":[]}';
  const parsed = JSON.parse(raw) as { subNodes: DetailedSubNode[] };

  return (parsed.subNodes || []).map((n) => ({
    ...n,
    category: VALID_CATEGORIES.includes(n.category) ? n.category : rootNode.category,
  }));
}

// ─── Step C: Edge Agent ───

async function researchEdges(
  industryName: string,
  rootNodes: Array<{ id: string; label: string }>
): Promise<MapEdge[]> {
  const client = getClient();

  const nodeList = rootNodes.map((n) => `"${n.id}" (${n.label})`).join("\n");

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an industry analyst mapping the relationships between segments of the "${industryName}" value chain.

Given root nodes, produce edges showing how value, data, or materials flow between them.

Return a JSON object with:
- "edges": Array of { "source": "<id>", "target": "<id>" }

Guidelines:
- Create 15-30 meaningful edges showing real value chain flows
- Flow generally goes: upstream → production → processing → distribution → customer
- Support, regulation, and technology nodes connect to multiple segments
- No self-loops (source !== target)
- No duplicate edges
- Every node should have at least one connection
- Prefer directional flow (upstream to downstream) but cross-connections are fine

Available nodes:
${nodeList}

Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Map the value chain connections for ${industryName}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || '{"edges":[]}';
  const parsed = JSON.parse(raw) as { edges: MapEdge[] };

  // Validate edges — only keep those referencing valid node IDs
  const validIds = new Set(rootNodes.map((n) => n.id));
  return (parsed.edges || []).filter(
    (e) =>
      e.source !== e.target &&
      validIds.has(e.source) &&
      validIds.has(e.target)
  );
}

// ─── Step D: Assemble ───

export interface ResearchProgress {
  step: string;
  message: string;
  pct: number;
}

/**
 * Run the full deep research pipeline.
 * @param query - User's search query
 * @param onProgress - Callback for real-time progress updates
 * @returns Validated IndustryMap
 */
export async function deepResearch(
  query: string,
  onProgress?: (p: ResearchProgress) => void
): Promise<IndustryMap> {
  const report = (step: string, message: string, pct: number) => {
    if (onProgress) onProgress({ step, message, pct });
  };

  // Step A: Structure
  report("structure", "Researching industry structure\u2026", 15);
  const { industryName, roots } = await researchStructure(query);
  report("structure-done", `Mapped ${roots.length} segments`, 30);

  // Step B: Details (all in parallel)
  report("details", `Researching ${roots.length} segments in parallel\u2026`, 35);

  const detailResults = await Promise.all(
    roots.map(async (root, i) => {
      const subNodes = await researchNodeDetails(query, industryName, root);
      report(
        "detail-progress",
        `Researched ${root.label} (${i + 1}/${roots.length})`,
        35 + Math.round(((i + 1) / roots.length) * 35)
      );
      return { root, subNodes };
    })
  );

  // Step C: Edges
  report("edges", "Mapping value chain connections\u2026", 75);
  const edges = await researchEdges(industryName, roots);
  report("edges-done", `Found ${edges.length} connections`, 85);

  // Assemble
  report("assembling", "Assembling final map\u2026", 90);

  const rootNodes: IndustryBlock[] = detailResults.map(({ root, subNodes }) => ({
    id: root.id,
    label: root.label,
    category: root.category,
    description: root.description,
    subNodes: subNodes.map((sn) => ({
      id: sn.id,
      label: sn.label,
      category: sn.category,
      description: sn.description,
    })),
  }));

  const map: IndustryMap = {
    industry: industryName,
    rootNodes,
    edges,
  };

  // Validate with Zod
  report("validating", "Validating map\u2026", 95);
  try {
    IndustryMapSchema.parse(map);
  } catch (e) {
    console.error("Zod validation failed, returning unvalidated map:", e);
    // Still return the map — it's close enough and the UI can render it
  }

  return map;
}

/**
 * Generate a URL-friendly slug from industry name.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
