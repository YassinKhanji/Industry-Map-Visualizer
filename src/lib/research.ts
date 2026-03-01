import OpenAI from "openai";
import { IndustryMapSchema } from "@/types";
import type {
  IndustryMap,
  IndustryBlock,
  MapEdge,
  Category,
  Archetype,
} from "@/types";
import { ARCHETYPE_PROFILES, getArchetypeProfile } from "./archetypes";

/**
 * Deep Research Pipeline — Industry Reverse-Engineering Engine
 *
 * Step A: Archetype Classifier   (gpt-4.1-mini, 1 call)
 * Step B: Structure Agent        (gpt-4.1, 1 call) → 10-16 enriched root nodes
 * Step C: Detail Agents          (gpt-4.1-mini × N, parallel) → 3-level subtrees per root
 * Step D: Edge Agent             (gpt-4.1-mini, 1 call) → cross-root connections
 * Step E: Assemble + validate
 */

const VALID_CATEGORIES: Category[] = [
  "capital",
  "inputs",
  "production",
  "processing",
  "distribution",
  "customer",
  "compliance",
  "infrastructure",
];

const NODE_METADATA_SCHEMA = `Each node MUST include:
- "id": lowercase kebab-case (unique, descriptive)
- "label": human-readable name (2-5 words)
- "category": one of: ${VALID_CATEGORIES.join(", ")}
- "description": one-sentence factual description (15-30 words)
- "objective": what this actor/function is trying to achieve (1 sentence)
- "revenueModel": how this actor generates income (1 sentence, use "N/A" if non-revenue)
- "keyTools": array of 2-4 real tools, platforms, or systems (e.g. "SAP ERP", "Bloomberg Terminal")
- "keyActors": array of 2-4 real companies or organizations active here
- "painPoints": array of 2-3 known friction points, bottlenecks, or inefficiencies
- "costDrivers": array of 2-3 major operating cost categories
- "regulatoryNotes": one sentence on applicable regulations, standards, or licenses (use "None specific" if minimal)`;

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function sanitizeCategory(cat: string, fallback: Category = "production"): Category {
  return VALID_CATEGORIES.includes(cat as Category)
    ? (cat as Category)
    : fallback;
}

// ─── Step A: Archetype Classifier ───

interface ClassificationResult {
  archetype: Archetype;
  industryName: string;
  jurisdiction: string;
}

async function classifyArchetype(query: string): Promise<ClassificationResult> {
  const client = getClient();
  const archetypeList = Object.entries(ARCHETYPE_PROFILES)
    .map(([key, p]) => `"${key}": ${p.description}`)
    .join("\n");

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an economic engine classifier. Given a product, service, or industry query, determine:

1. Which economic archetype best describes how this industry generates value.
2. A professional industry display name.
3. The primary jurisdiction (country or "Global" if not location-specific).

Available archetypes:
${archetypeList}

Return JSON:
{
  "archetype": "<archetype-key>",
  "industryName": "<Professional Industry Name>",
  "jurisdiction": "<Country or Global>"
}

Pick the SINGLE best-fit archetype. If the query mentions a specific country/region, use that as jurisdiction.
Return ONLY valid JSON.`,
      },
      { role: "user", content: query },
    ],
  });

  const raw = res.choices[0]?.message?.content || "{}";
  let parsed: ClassificationResult;
  try {
    parsed = JSON.parse(raw) as ClassificationResult;
  } catch {
    console.warn("classifyArchetype: JSON parse failed, using defaults");
    parsed = { archetype: "asset-manufacturing", industryName: query, jurisdiction: "Global" };
  }

  // Validate archetype
  if (!ARCHETYPE_PROFILES[parsed.archetype]) {
    parsed.archetype = "asset-manufacturing"; // safe default
  }

  return parsed;
}

// ─── Step B: Structure Agent (with archetype template) ───

interface RootNodeEnriched {
  id: string;
  label: string;
  category: Category;
  description: string;
  objective: string;
  revenueModel: string;
  keyTools: string[];
  keyActors: string[];
  painPoints: string[];
  costDrivers: string[];
  regulatoryNotes: string;
}

async function researchStructure(
  query: string,
  archetype: Archetype,
  industryName: string,
  jurisdiction: string
): Promise<RootNodeEnriched[]> {
  const client = getClient();
  const profile = getArchetypeProfile(archetype)!;

  const res = await client.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0.3,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an industry reverse-engineering expert building a structural map of "${industryName}" (jurisdiction: ${jurisdiction}).

${profile.promptTemplate}

Produce a JSON object with:
- "roots": array of 10-16 root nodes representing the major segments of the value chain

${NODE_METADATA_SCHEMA}

Guidelines:
- Cover the FULL value chain: capital → inputs → production → processing → distribution → customer
- Include compliance and infrastructure nodes
- Use specific, domain-relevant names (never "Other" or "Miscellaneous")
- Order nodes logically along the value chain flow
- All actors, tools, and pain points must be real and specific to this industry
- Think like a McKinsey analyst mapping the industry for a founder entering this space

Return ONLY valid JSON: { "roots": [...] }`,
      },
      { role: "user", content: query },
    ],
  });

  const raw = res.choices[0]?.message?.content || '{"roots":[]}';
  let parsed: { roots: RootNodeEnriched[] };
  try {
    parsed = JSON.parse(raw) as { roots: RootNodeEnriched[] };
  } catch {
    console.warn("researchStructure: JSON parse failed, returning empty roots");
    parsed = { roots: [] };
  }

  return (parsed.roots || []).map((r) => ({
    ...r,
    category: sanitizeCategory(r.category),
    keyTools: r.keyTools || [],
    keyActors: r.keyActors || [],
    painPoints: r.painPoints || [],
    costDrivers: r.costDrivers || [],
    regulatoryNotes: r.regulatoryNotes || "None specific",
  }));
}

// ─── Step C: Detail Agents (parallel, producing multi-level sub-trees) ───

interface SubTreeNode {
  id: string;
  label: string;
  category: Category;
  description: string;
  objective?: string;
  revenueModel?: string;
  keyTools?: string[];
  keyActors?: string[];
  painPoints?: string[];
  costDrivers?: string[];
  regulatoryNotes?: string;
  subNodes?: SubTreeNode[];
}

async function researchSubTree(
  query: string,
  industryName: string,
  jurisdiction: string,
  archetypeKey: Archetype,
  root: RootNodeEnriched
): Promise<SubTreeNode[]> {
  const client = getClient();

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    max_tokens: 6000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a deep industry research agent for "${industryName}" (${jurisdiction}).
Archetype: ${archetypeKey}.

Given a root VALUE CHAIN segment, produce a 3-level deep sub-tree:
- Level 1: 4-8 direct children (sub-segments)
- Level 2: Each Level-1 node has 2-5 children (specific functions/actors)
- Level 3: (optional) Key Level-2 nodes may have 1-3 leaf children for critical details

Return JSON:
{
  "subNodes": [
    {
      ... node fields ...,
      "subNodes": [
        {
          ... node fields ...,
          "subNodes": [ ... optional leaf nodes ... ]
        }
      ]
    }
  ]
}

${NODE_METADATA_SCHEMA}

Guidelines:
- Be SPECIFIC to "${query}" — no generic filler
- Include real companies, tools, standards, regulations specific to ${jurisdiction} where relevant
- Each node must represent a distinct function, role, or entity
- IDs must be globally unique — prefix with parent context (e.g. "${root.id}-supply-chain")
- Deeper nodes should be more specific and actionable
- Pain points at leaf level = opportunity signals for founders

Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Root segment: "${root.label}" (${root.category}) — ${root.description}
Objective: ${root.objective}
Revenue model: ${root.revenueModel}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || '{"subNodes":[]}';
  let parsed: { subNodes: SubTreeNode[] };
  try {
    parsed = JSON.parse(raw) as { subNodes: SubTreeNode[] };
  } catch {
    console.warn(`researchSubTree(${root.id}): JSON parse failed, returning empty`);
    parsed = { subNodes: [] };
  }

  // Recursively sanitize categories
  function sanitizeTree(nodes: SubTreeNode[], fallback: Category): SubTreeNode[] {
    return (nodes || []).map((n) => ({
      ...n,
      category: sanitizeCategory(n.category, fallback),
      keyTools: n.keyTools || [],
      keyActors: n.keyActors || [],
      painPoints: n.painPoints || [],
      costDrivers: n.costDrivers || [],
      regulatoryNotes: n.regulatoryNotes || "",
      subNodes: n.subNodes ? sanitizeTree(n.subNodes, sanitizeCategory(n.category, fallback)) : undefined,
    }));
  }

  return sanitizeTree(parsed.subNodes, root.category);
}

// ─── Step D: Edge Agent ───

async function researchEdges(
  industryName: string,
  archetype: Archetype,
  rootNodes: Array<{ id: string; label: string; category: string }>
): Promise<MapEdge[]> {
  const client = getClient();
  const profile = getArchetypeProfile(archetype)!;

  const nodeList = rootNodes.map((n) => `"${n.id}" (${n.label} [${n.category}])`).join("\n");

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an industry analyst mapping relationships between root segments of the "${industryName}" value chain.
Archetype: ${archetype}.
Flow pattern: ${profile.edgeFlowHint}

Given root nodes, produce edges showing how value, data, materials, or money flow between them.

Return JSON: { "edges": [{ "source": "<id>", "target": "<id>" }] }

Guidelines:
- Create 15-30 meaningful directed edges
- Follow the archetype flow pattern described above
- Compliance and infrastructure nodes connect to multiple segments
- No self-loops, no duplicate edges
- Every node must have at least one connection

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
  let parsed: { edges: MapEdge[] };
  try {
    parsed = JSON.parse(raw) as { edges: MapEdge[] };
  } catch {
    console.warn("researchEdges: JSON parse failed, returning empty edges");
    parsed = { edges: [] };
  }

  const validIds = new Set(rootNodes.map((n) => n.id));
  return (parsed.edges || []).filter(
    (e) =>
      e.source !== e.target &&
      validIds.has(e.source) &&
      validIds.has(e.target)
  );
}

// ─── Step E: Assemble ───

export interface ResearchProgress {
  step: string;
  message: string;
  pct: number;
}

/**
 * Build an IndustryBlock tree from root + subtree results.
 */
function buildBlock(root: RootNodeEnriched, subTree: SubTreeNode[]): IndustryBlock {
  function convertSubTree(nodes: SubTreeNode[]): IndustryBlock[] {
    return nodes.map((n) => ({
      id: n.id,
      label: n.label,
      category: n.category,
      description: n.description,
      objective: n.objective,
      revenueModel: n.revenueModel,
      keyTools: n.keyTools,
      keyActors: n.keyActors,
      painPoints: n.painPoints,
      costDrivers: n.costDrivers,
      regulatoryNotes: n.regulatoryNotes,
      subNodes: n.subNodes && n.subNodes.length > 0 ? convertSubTree(n.subNodes) : undefined,
    }));
  }

  return {
    id: root.id,
    label: root.label,
    category: root.category,
    description: root.description,
    objective: root.objective,
    revenueModel: root.revenueModel,
    keyTools: root.keyTools,
    keyActors: root.keyActors,
    painPoints: root.painPoints,
    costDrivers: root.costDrivers,
    regulatoryNotes: root.regulatoryNotes,
    subNodes: subTree.length > 0 ? convertSubTree(subTree) : undefined,
  };
}

/**
 * Run the full deep research pipeline.
 * @param query - User's search query
 * @param onProgress - Callback for real-time progress updates
 * @returns Validated IndustryMap with archetype, jurisdiction, and rich per-node metadata
 */
export async function deepResearch(
  query: string,
  onProgress?: (p: ResearchProgress) => void
): Promise<IndustryMap> {
  const report = (step: string, message: string, pct: number) => {
    if (onProgress) onProgress({ step, message, pct });
  };

  // Step A: Classify archetype
  report("classify", "Classifying economic engine archetype\u2026", 5);
  const { archetype, industryName, jurisdiction } = await classifyArchetype(query);
  const profile = getArchetypeProfile(archetype)!;
  report("classify-done", `${profile.label} \u2014 ${jurisdiction}`, 12);

  // Step B: Structure (enriched root nodes)
  report("structure", "Researching industry structure\u2026", 15);
  const roots = await researchStructure(query, archetype, industryName, jurisdiction);
  report("structure-done", `Mapped ${roots.length} segments`, 28);

  // Step C: Detail sub-trees (all in parallel)
  report("details", `Deep-diving ${roots.length} segments in parallel\u2026`, 30);

  const subTreeResults = await Promise.all(
    roots.map(async (root, i) => {
      const subTree = await researchSubTree(
        query,
        industryName,
        jurisdiction,
        archetype,
        root
      );
      report(
        "detail-progress",
        `Researched ${root.label} (${i + 1}/${roots.length})`,
        30 + Math.round(((i + 1) / roots.length) * 40)
      );
      return { root, subTree };
    })
  );

  // Step D: Edges (root-to-root connections)
  report("edges", "Mapping value chain connections\u2026", 75);
  const edges = await researchEdges(industryName, archetype, roots);
  report("edges-done", `Found ${edges.length} connections`, 85);

  // Step E: Assemble
  report("assembling", "Assembling final map\u2026", 90);

  const rootNodes: IndustryBlock[] = subTreeResults.map(({ root, subTree }) =>
    buildBlock(root, subTree)
  );

  const map: IndustryMap = {
    industry: industryName,
    archetype,
    jurisdiction,
    rootNodes,
    edges,
  };

  // Validate with Zod — attempt to fix common issues
  report("validating", "Validating map\u2026", 95);
  try {
    IndustryMapSchema.parse(map);
  } catch (e) {
    console.warn("Zod validation failed, attempting to fix:", e);
    // Remove invalid edges (referencing non-existent nodes)
    const allIds = new Set<string>();
    function collectIds(nodes: IndustryBlock[]) {
      for (const n of nodes) {
        allIds.add(n.id);
        if (n.subNodes) collectIds(n.subNodes);
      }
    }
    collectIds(map.rootNodes);
    map.edges = map.edges.filter(
      (e) => e.source !== e.target && allIds.has(e.source) && allIds.has(e.target)
    );
    // Re-sanitize all categories
    function fixCategories(nodes: IndustryBlock[]) {
      for (const n of nodes) {
        n.category = sanitizeCategory(n.category);
        if (n.subNodes) fixCategories(n.subNodes);
      }
    }
    fixCategories(map.rootNodes);
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
