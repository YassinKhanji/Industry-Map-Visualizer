"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import {
  INDUSTRY_TAXONOMY,
  type TaxonomyNode,
} from "@/data/taxonomy-industries";
import { JOBS_TAXONOMY } from "@/data/taxonomy-jobs";

/* ── Tabs ─────────────────────────────────────────── */
type Tab = "industries" | "jobs";

const TABS: { key: Tab; label: string }[] = [
  { key: "industries", label: "Industries" },
  { key: "jobs", label: "Jobs" },
];

/* ── Icons (inline SVG) ────────────────────────────── */
const ChevronRight = () => (
  <svg
    className="inline-block w-3.5 h-3.5 mx-0.5 opacity-50"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const FolderIcon = () => (
  <svg
    className="w-4 h-4 shrink-0 opacity-60"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const LeafIcon = () => (
  <svg
    className="w-4 h-4 shrink-0 text-emerald-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
    />
  </svg>
);

/* ── Component ─────────────────────────────────────── */
export default function TaxonomyBrowser({ compact }: { compact?: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("industries");
  // breadcrumb path: each entry is the node the user drilled into
  const [path, setPath] = useState<TaxonomyNode[]>([]);
  const isLoading = useAppStore((s) => s.isLoading);
  const setTriggerSearch = useAppStore((s) => s.setTriggerSearch);

  const rootNodes = activeTab === "industries" ? INDUSTRY_TAXONOMY : JOBS_TAXONOMY;
  const rootLabel = activeTab === "industries" ? "All Industries" : "All Jobs";

  /* Current level children */
  const currentChildren: TaxonomyNode[] = useMemo(() => {
    if (path.length === 0) return rootNodes;
    const last = path[path.length - 1];
    return last.children ?? [];
  }, [path, rootNodes]);

  /* Navigate into a node */
  const drillInto = useCallback(
    (node: TaxonomyNode) => {
      if (isLoading) return;
      // If it's a leaf → trigger the search
      if (!node.children || node.children.length === 0) {
        setTriggerSearch(node.searchQuery ?? node.label);
        return;
      }
      setPath((prev) => [...prev, node]);
    },
    [isLoading, setTriggerSearch]
  );

  /* Navigate via breadcrumb */
  const goTo = useCallback(
    (index: number) => {
      if (isLoading) return;
      if (index < 0) {
        setPath([]);
      } else {
        setPath((prev) => prev.slice(0, index + 1));
      }
    },
    [isLoading]
  );

  /* Switch tab → reset path */
  const switchTab = useCallback(
    (tab: Tab) => {
      if (isLoading) return;
      setActiveTab(tab);
      setPath([]);
    },
    [isLoading]
  );

  return (
    <div
      className={`taxonomy-browser w-full rounded-xl border transition-all duration-300 ${
        compact ? "max-h-[260px]" : "max-h-[420px]"
      }`}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--border)",
      }}
    >
      {/* ── Tabs ── */}
      <div
        className="flex border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? "text-[var(--accent)]"
                : "text-[var(--foreground)] opacity-60 hover:opacity-100"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: "var(--accent)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Breadcrumb ── */}
      <div
        className="flex items-center gap-0.5 px-3 py-2 text-xs border-b overflow-x-auto"
        style={{
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
      >
        <button
          onClick={() => goTo(-1)}
          disabled={isLoading}
          className={`hover:text-[var(--accent)] transition-colors shrink-0 ${
            path.length === 0 ? "font-semibold text-[var(--accent)]" : "opacity-70"
          }`}
        >
          {rootLabel}
        </button>
        {path.map((node, i) => (
          <span key={node.id} className="flex items-center shrink-0">
            <ChevronRight />
            <button
              onClick={() => goTo(i)}
              disabled={isLoading}
              className={`hover:text-[var(--accent)] transition-colors truncate max-w-[200px] ${
                i === path.length - 1
                  ? "font-semibold text-[var(--accent)]"
                  : "opacity-70"
              }`}
              title={node.label}
            >
              {node.label.replace(/^\d+\s*-\s*/, "")}
            </button>
          </span>
        ))}
      </div>

      {/* ── Grid ── */}
      <div
        className={`taxonomy-grid overflow-y-auto overscroll-contain px-3 py-2 ${
          compact ? "max-h-[180px]" : "max-h-[340px]"
        }`}
      >
        {currentChildren.length === 0 ? (
          <p className="text-sm opacity-50 py-4 text-center">No items</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
            {currentChildren.map((node) => {
              const isLeaf = !node.children || node.children.length === 0;
              const count = node.children?.length ?? 0;
              // Clean ISCO code prefix for display
              const displayLabel = node.label.replace(/^\d+\s*-\s*/, "");
              return (
                <button
                  key={node.id}
                  onClick={() => drillInto(node)}
                  disabled={isLoading}
                  className="taxonomy-card group flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all duration-150 border hover:border-[var(--accent)] hover:shadow-sm disabled:opacity-40"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                  title={node.label}
                >
                  {isLeaf ? <LeafIcon /> : <FolderIcon />}
                  <span className="truncate flex-1">{displayLabel}</span>
                  {!isLeaf && (
                    <span className="text-[10px] opacity-40 shrink-0">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
