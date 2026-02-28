"use client";

import dynamic from "next/dynamic";
import SearchBar from "@/components/SearchBar";
import { useAppStore } from "@/lib/store";

// Dynamic import for MapCanvas to avoid SSR issues with React Flow
const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
});

export default function Home() {
  const mapData = useAppStore((s) => s.mapData);
  const isCached = useAppStore((s) => s.isCached);
  const source = useAppStore((s) => s.source);
  const error = useAppStore((s) => s.error);
  const query = useAppStore((s) => s.query);
  const hasResults = !!mapData;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      {/* Search area */}
      <div
        className={`
          w-full flex flex-col items-center justify-center px-6
          transition-all duration-300 ease-out
          ${hasResults ? "pt-5 pb-3" : "flex-1"}
        `}
      >
        {!hasResults && (
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Industry Map Visualizer
            </h1>
            <p className="text-sm text-gray-400">
              See the full value chain behind any industry, product, or service
            </p>
          </div>
        )}

        <SearchBar />

        {/* Status indicators */}
        <div className="h-6 mt-2 flex items-center gap-2">
          {isCached && (
            <span className="text-[10px] text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full">
              cached
            </span>
          )}
          {source && !isCached && hasResults && (
            <span className="text-[10px] text-gray-400">
              {source === "prebuilt"
                ? "Loaded from library"
                : source === "assemble"
                ? "Assembled from blocks"
                : "Generated"}
            </span>
          )}
          {query && hasResults && (
            <span className="text-[10px] text-gray-300">
              {mapData?.rootNodes.length} nodes
            </span>
          )}
          {error && (
            <span className="text-[10px] text-red-400">{error}</span>
          )}
        </div>
      </div>

      {/* Map area */}
      {hasResults && (
        <div
          className="flex-1 w-full"
          style={{
            opacity: hasResults ? 1 : 0,
            transition: "opacity 150ms ease-out",
          }}
        >
          <MapCanvas />
        </div>
      )}
    </div>
  );
}
