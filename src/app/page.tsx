"use client";

import dynamic from "next/dynamic";
import SearchBar from "@/components/SearchBar";
import TaxonomyBrowser from "@/components/TaxonomyBrowser";
import { useAppStore } from "@/lib/store";

// Dynamic import for MapCanvas to avoid SSR issues with React Flow
const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
});

// No prefetch needed — Neon DB provides instant retrieval for known industries

export default function Home() {
  const mapData = useAppStore((s) => s.mapData);
  const isCached = useAppStore((s) => s.isCached);
  const source = useAppStore((s) => s.source);
  const error = useAppStore((s) => s.error);
  const query = useAppStore((s) => s.query);
  const correctedQuery = useAppStore((s) => s.correctedQuery);
  const progress = useAppStore((s) => s.progress);
  const isLoading = useAppStore((s) => s.isLoading);
  const darkMode = useAppStore((s) => s.darkMode);
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const hasResults = !!mapData;



  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden ${darkMode ? "dark" : ""}`}
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
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
            <h1
              className="text-2xl font-semibold mb-2"
              style={{ color: "var(--foreground)" }}
            >
              Industry Map Visualizer
            </h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              See the full value chain behind any industry, product, or service
            </p>
          </div>
        )}

        <SearchBar />

        {/* Taxonomy drill-down browser */}
        <div className={`w-full max-w-2xl mx-auto mt-3 transition-all duration-300 ${hasResults ? "hidden" : ""}`}>
          <TaxonomyBrowser compact={hasResults} />
        </div>

        {/* Status indicators */}
        <div className="h-6 mt-2 flex items-center gap-2">
          {/* Real-time progress during loading */}
          {isLoading && progress && (
            <span
              className="text-[11px] font-medium animate-pulse"
              style={{ color: "var(--accent)" }}
            >
              {progress.message}
            </span>
          )}
          {/* Post-load indicators */}
          {!isLoading && correctedQuery && (
            <span
              className="text-[10px]"
              style={{ color: "var(--accent, #6366f1)" }}
            >
              Showing results for <strong>{correctedQuery}</strong>
            </span>
          )}
          {!isLoading && isCached && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                color: "var(--muted)",
                background: darkMode ? "rgba(255,255,255,0.05)" : "#f9fafb",
              }}
            >
              cached
            </span>
          )}
          {!isLoading && source && !isCached && hasResults && (
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
              Deep researched
            </span>
          )}
          {!isLoading && query && hasResults && (
            <span className="text-[10px]" style={{ color: "var(--muted)", opacity: 0.6 }}>
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

      {/* Dark mode toggle */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="fixed bottom-[140px] left-[13px] z-50 w-9 h-9 flex items-center justify-center rounded-full border transition-all duration-200"
        style={{
          background: darkMode ? "var(--card-bg)" : "#ffffff",
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
        title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {darkMode ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="3.5" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.36 10.06A6 6 0 015.94 2.64 6 6 0 1013.36 10.06z" />
          </svg>
        )}
      </button>
    </div>
  );
}
