import { z } from "zod/v4";

// ─── 8 Universal Value-Chain Categories ───
export const CategoryEnum = z.enum([
  "capital",
  "inputs",
  "production",
  "processing",
  "distribution",
  "customer",
  "compliance",
  "infrastructure",
]);

export type Category = z.infer<typeof CategoryEnum>;

// ─── 9 Economic Engine Archetypes ───
export const ArchetypeEnum = z.enum([
  "asset-manufacturing",
  "asset-aggregation",
  "labor-leverage-service",
  "marketplace-coordination",
  "saas-automation",
  "infrastructure-utility",
  "licensing-ip",
  "brokerage-intermediation",
  "asset-ownership-leasing",
]);

export type Archetype = z.infer<typeof ArchetypeEnum>;

// ─── IndustryBlock (recursive, enriched) ───
export interface IndustryBlock {
  id: string;
  label: string;
  category: Category;
  description?: string;
  /** What this actor/function is trying to achieve */
  objective?: string;
  /** How this actor generates income */
  revenueModel?: string;
  /** Real tools, platforms, systems used */
  keyTools?: string[];
  /** Known friction points, bottlenecks, inefficiencies */
  painPoints?: string[];
  /** Applicable regulations, standards, licenses */
  regulatoryNotes?: string;
  /** What drives operating costs */
  costDrivers?: string[];
  /** Real company or organization examples */
  keyActors?: string[];
  /** Business opportunities / inefficiencies found via web search */
  opportunities?: { title: string; description: string; sourceUrl?: string }[];
  /** ISO date when node was web-enriched */
  enrichedAt?: string;
  // ─── Enrichment-only fields (set by /api/enrich pipeline) ───
  /** Is this node essential, redundant, or automatable? */
  nodeRelevance?: string;
  /** Per-connection assessment: necessary or bypassable? */
  connectionInsights?: { connectionLabel: string; insight: string }[];
  /** What it takes to enter this segment */
  entryBarriers?: string[];
  /** Who buys from / uses this segment */
  typicalClients?: string[];
  /** Operating expense ranges */
  expenseRange?: { monthly: string; annual: string };
  /** Revenue range for a typical player */
  incomeRange?: { low: string; high: string };
  /** Market demand direction + rationale */
  demandTrend?: { direction: "growing" | "declining" | "stable" | "emerging"; rationale: string };
  /** How crowded this segment is */
  competitiveSaturation?: { level: "underserved" | "moderate" | "oversaturated"; playerEstimate: string };
  /** Problems nobody is solving yet */
  unmetNeeds?: string[];
  /** Gross/net margin profile */
  marginProfile?: { gross: string; net: string; verdict: string };
  /** AI/automation disruption risk */
  disruptionRisk?: { level: "low" | "medium" | "high"; threats: string[] };
  /** How sticky clients are */
  clientSwitchingCosts?: "low" | "medium" | "high";
  /** Position in the value chain */
  valueChainPosition?: "upstream" | "midstream" | "downstream";
  /** Synthesized 1-10 opportunity score */
  opportunityScore?: { score: number; reasoning: string };
  subNodes?: IndustryBlock[];
}

// Zod schema for IndustryBlock (recursive via z.lazy)
export const IndustryBlockSchema: z.ZodType<IndustryBlock> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    category: CategoryEnum,
    description: z.string().optional(),
    objective: z.string().optional(),
    revenueModel: z.string().optional(),
    keyTools: z.array(z.string()).optional(),
    painPoints: z.array(z.string()).optional(),
    regulatoryNotes: z.string().optional(),
    costDrivers: z.array(z.string()).optional(),
    keyActors: z.array(z.string()).optional(),
    opportunities: z.array(z.object({
      title: z.string(),
      description: z.string(),
      sourceUrl: z.string().optional(),
    })).optional(),
    enrichedAt: z.string().optional(),
    nodeRelevance: z.string().optional(),
    connectionInsights: z.array(z.object({
      connectionLabel: z.string(),
      insight: z.string(),
    })).optional(),
    entryBarriers: z.array(z.string()).optional(),
    typicalClients: z.array(z.string()).optional(),
    expenseRange: z.object({ monthly: z.string(), annual: z.string() }).optional(),
    incomeRange: z.object({ low: z.string(), high: z.string() }).optional(),
    demandTrend: z.object({
      direction: z.enum(["growing", "declining", "stable", "emerging"]),
      rationale: z.string(),
    }).optional(),
    competitiveSaturation: z.object({
      level: z.enum(["underserved", "moderate", "oversaturated"]),
      playerEstimate: z.string(),
    }).optional(),
    unmetNeeds: z.array(z.string()).optional(),
    marginProfile: z.object({ gross: z.string(), net: z.string(), verdict: z.string() }).optional(),
    disruptionRisk: z.object({
      level: z.enum(["low", "medium", "high"]),
      threats: z.array(z.string()),
    }).optional(),
    clientSwitchingCosts: z.enum(["low", "medium", "high"]).optional(),
    valueChainPosition: z.enum(["upstream", "midstream", "downstream"]).optional(),
    opportunityScore: z.object({ score: z.number(), reasoning: z.string() }).optional(),
    subNodes: z.array(IndustryBlockSchema).optional(),
  })
);

// ─── Edge ───
export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
});

export type MapEdge = z.infer<typeof EdgeSchema>;

// ─── IndustryMap (top-level response) ───
export const IndustryMapSchema = z.object({
  industry: z.string(),
  archetype: ArchetypeEnum.optional(),
  jurisdiction: z.string().optional(),
  rootNodes: z.array(IndustryBlockSchema),
  edges: z.array(EdgeSchema),
});

export type IndustryMap = z.infer<typeof IndustryMapSchema>;

// ─── Source modes (how the map was obtained) ───
export type SourceMode = "database" | "research" | "fallback";

// ─── React Flow node data ───
export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  category: Category;
  description?: string;
  objective?: string;
  revenueModel?: string;
  keyTools?: string[];
  painPoints?: string[];
  regulatoryNotes?: string;
  costDrivers?: string[];
  keyActors?: string[];
  opportunities?: { title: string; description: string; sourceUrl?: string }[];
  enrichedAt?: string;
  nodeRelevance?: string;
  connectionInsights?: { connectionLabel: string; insight: string }[];
  entryBarriers?: string[];
  typicalClients?: string[];
  expenseRange?: { monthly: string; annual: string };
  incomeRange?: { low: string; high: string };
  demandTrend?: { direction: "growing" | "declining" | "stable" | "emerging"; rationale: string };
  competitiveSaturation?: { level: "underserved" | "moderate" | "oversaturated"; playerEstimate: string };
  unmetNeeds?: string[];
  marginProfile?: { gross: string; net: string; verdict: string };
  disruptionRisk?: { level: "low" | "medium" | "high"; threats: string[] };
  clientSwitchingCosts?: "low" | "medium" | "high";
  valueChainPosition?: "upstream" | "midstream" | "downstream";
  opportunityScore?: { score: number; reasoning: string };
  hasChildren: boolean;
  isExpanded: boolean;
  depth: number;
  parentId?: string;
}

// ─── Progress tracking ───
export interface ProgressStep {
  step: string;
  message: string;
  pct: number;
}

// ─── Store state ───
export interface AppState {
  query: string;
  mapData: IndustryMap | null;
  isLoading: boolean;
  autoExpand: boolean;
  isCached: boolean;
  source: SourceMode | null;
  error: string | null;
  darkMode: boolean;
  selectedNodeId: string | null;
  correctedQuery: string | null;
  progress: ProgressStep | null;
  triggerSearch: string | null;
  setQuery: (query: string) => void;
  setMapData: (data: IndustryMap | null) => void;
  setIsLoading: (loading: boolean) => void;
  setAutoExpand: (expand: boolean) => void;
  setIsCached: (cached: boolean) => void;
  setSource: (source: AppState["source"]) => void;
  setError: (error: string | null) => void;
  setDarkMode: (dark: boolean) => void;
  setSelectedNodeId: (id: string | null) => void;
  setCorrectedQuery: (q: string | null) => void;
  setProgress: (p: ProgressStep | null) => void;
  setTriggerSearch: (q: string | null) => void;
  updateNode: (nodeId: string, patch: Partial<IndustryBlock>) => void;
  reset: () => void;
}
