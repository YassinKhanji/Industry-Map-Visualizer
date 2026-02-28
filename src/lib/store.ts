import { create } from "zustand";
import type { AppState, IndustryMap } from "@/types";

export const useAppStore = create<AppState>((set) => ({
  query: "",
  mapData: null,
  isLoading: false,
  autoExpand: true,
  isCached: false,
  source: null,
  error: null,
  darkMode: false,
  selectedNodeId: null,
  correctedQuery: null,

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
  reset: () =>
    set({
      query: "",
      mapData: null,
      isLoading: false,
      isCached: false,
      source: null,
      error: null,
      correctedQuery: null,
    }),
}));
