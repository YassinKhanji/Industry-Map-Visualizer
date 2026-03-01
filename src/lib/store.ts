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
  hoveredNodeId: null,
  correctedQuery: null,
  progress: null,
  triggerSearch: null,
  userProfile: "",
  highlightedNodeIds: [],
  profileHighlightOn: false,
  profilePanelOpen: false,
  focusNodeId: null,
  nodeChatHistories: {},
  activeDetailTab: "details" as const,
  pendingQuote: null,

  setQuery: (query: string) => set({ query }),
  setMapData: (data: IndustryMap | null) => set({ mapData: data }),
  setIsLoading: (loading: boolean) => set({ isLoading: loading }),
  setAutoExpand: (expand: boolean) => set({ autoExpand: expand }),
  setIsCached: (cached: boolean) => set({ isCached: cached }),
  setSource: (source: AppState["source"]) => set({ source }),
  setError: (error: string | null) => set({ error }),
  setDarkMode: (dark: boolean) => set({ darkMode: dark }),
  setSelectedNodeId: (id: string | null) => set({ selectedNodeId: id }),
  setHoveredNodeId: (id: string | null) => set({ hoveredNodeId: id }),
  setCorrectedQuery: (q: string | null) => set({ correctedQuery: q }),
  setProgress: (p: ProgressStep | null) => set({ progress: p }),
  setTriggerSearch: (q: string | null) => set({ triggerSearch: q }),
  setUserProfile: (profile: string) => set({ userProfile: profile }),
  setHighlightedNodeIds: (ids: string[]) => set({ highlightedNodeIds: ids }),
  setProfileHighlightOn: (on: boolean) => set({ profileHighlightOn: on }),
  setProfilePanelOpen: (open: boolean) => set({ profilePanelOpen: open }),
  setFocusNodeId: (id: string | null) => set({ focusNodeId: id }),
  appendChatMessage: (nodeId: string, msg) =>
    set((state) => {
      const prev = state.nodeChatHistories[nodeId] || [];
      return { nodeChatHistories: { ...state.nodeChatHistories, [nodeId]: [...prev, msg] } };
    }),
  updateLastAssistantMessage: (nodeId: string, content: string) =>
    set((state) => {
      const msgs = state.nodeChatHistories[nodeId];
      if (!msgs || msgs.length === 0) return state;
      const updated = [...msgs];
      const last = updated[updated.length - 1];
      if (last.role === "assistant") {
        updated[updated.length - 1] = { ...last, content };
      }
      return { nodeChatHistories: { ...state.nodeChatHistories, [nodeId]: updated } };
    }),
  setActiveDetailTab: (tab) => set({ activeDetailTab: tab }),
  setPendingQuote: (quote: string | null) => set({ pendingQuote: quote }),
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
      highlightedNodeIds: [],
      profileHighlightOn: false,
      profilePanelOpen: false,
      activeDetailTab: "details",
    }),
}));
