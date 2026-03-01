import { create } from "zustand";
import type { AppState, IndustryMap, IndustryBlock, ProgressStep } from "@/types";

// Recursively patch a node by ID inside a block tree
function patchNode(nodes: IndustryBlock[], id: string, patch: Partial<IndustryBlock>): IndustryBlock[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.subNodes) return { ...n, subNodes: patchNode(n.subNodes, id, patch) };
    return n;
  });
}

export const useAppStore = create<AppState>((set) => ({
  query: "",
  mapData: null,
  isLoading: false,
  autoExpand: false,
  isCached: false,
  source: null,
  error: null,
  darkMode: true,
  selectedNodeId: null,
  correctedQuery: null,
  progress: null,
  triggerSearch: null,

  setQuery: (query: string) => set({ query }),
  setMapData: (data: IndustryMap | null) => set({ mapData: data }),
  setIsLoading: (loading: boolean) => set({ isLoading: loading }),
  setAutoExpand: (expand: boolean) => set({ autoExpand: expand }),
  setIsCached: (cached: boolean) => set({ isCached: cached }),
  setSource: (source: AppState["source"]) => set({ source }),
  setError: (error: string | null) => set({ error }),
  setDarkMode: (dark: boolean) => set({ darkMode: dark }),
  setSelectedNodeId: (id: string | null) => set({ selectedNodeId: id }),
  setCorrectedQuery: (q: string | null) => set({ correctedQuery: q }),
  setProgress: (p: ProgressStep | null) => set({ progress: p }),
  setTriggerSearch: (q: string | null) => set({ triggerSearch: q }),
  updateNode: (nodeId: string, patch: Partial<IndustryBlock>) =>
    set((state) => {
      if (!state.mapData) return state;
      return {
        mapData: {
          ...state.mapData,
          rootNodes: patchNode(state.mapData.rootNodes, nodeId, patch),
        },
      };
    }),
  reset: () =>
    set({
      query: "",
      mapData: null,
      isLoading: false,
      isCached: false,
      source: null,
      error: null,
      correctedQuery: null,
      progress: null,
      triggerSearch: null,
    }),
}));
