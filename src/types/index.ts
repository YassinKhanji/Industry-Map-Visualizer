import { z } from "zod/v4";

// ─── Category enum ───
export const CategoryEnum = z.enum([
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
]);

export type Category = z.infer<typeof CategoryEnum>;

// ─── IndustryBlock (recursive) ───
export interface IndustryBlock {
  id: string;
  label: string;
  category: Category;
  description?: string;
  subNodes?: IndustryBlock[];
}

// Zod schema for IndustryBlock (recursive via z.lazy)
export const IndustryBlockSchema: z.ZodType<IndustryBlock> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    category: CategoryEnum,
    description: z.string().optional(),
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
  reset: () => void;
}
