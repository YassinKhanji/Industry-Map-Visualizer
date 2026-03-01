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

// ─── Resolver modes ───
export type ResolveMode = "prebuilt" | "assemble" | "generate";

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
  source: "prebuilt" | "assemble" | "generate" | null;
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
