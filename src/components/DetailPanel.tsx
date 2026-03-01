"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { CATEGORY_ACCENTS, CATEGORY_LABELS } from "./NodeCard";
import type { IndustryBlock, MapEdge } from "@/types";
import { ARCHETYPE_PROFILES } from "@/lib/archetypes";

/* ──────── helpers ──────── */

function findBlock(
  nodes: IndustryBlock[],
  id: string
): IndustryBlock | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.subNodes) {
      const found = findBlock(n.subNodes, id);
      if (found) return found;
    }
  }
  return undefined;
}

function findParentBlock(
  nodes: IndustryBlock[],
  childId: string,
  parent?: IndustryBlock
): IndustryBlock | undefined {
  for (const n of nodes) {
    if (n.id === childId) return parent;
    if (n.subNodes) {
      const found = findParentBlock(n.subNodes, childId, n);
      if (found) return found;
    }
  }
  return undefined;
}

/* ──────── small UI components ──────── */

function SectionHeading({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted: string;
}) {
  return (
    <h3
      className="text-[11px] font-semibold uppercase tracking-wider mb-2"
      style={{ color: muted }}
    >
      {children}
    </h3>
  );
}

function PillList({
  items,
  darkMode,
  accent,
}: {
  items: string[];
  darkMode: boolean;
  accent?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="px-2 py-1 text-xs rounded"
          style={{
            background: accent
              ? `${accent}18`
              : darkMode
              ? "rgba(255,255,255,0.06)"
              : "#f3f4f6",
            color: accent || (darkMode ? "#9ca3af" : "#6b7280"),
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function BulletList({
  items,
  darkMode,
  accent,
  highlight,
}: {
  items: string[];
  darkMode: boolean;
  accent: string;
  highlight?: boolean;
}) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li
          key={item}
          className="text-sm flex items-start gap-2"
          style={{
            color: highlight
              ? "#dc2626"
              : darkMode
              ? "#d1d5db"
              : "#374151",
          }}
        >
          <span
            style={{ color: highlight ? "#dc2626" : accent }}
            className="mt-0.5 flex-shrink-0"
          >
            {highlight ? "⚠" : "•"}
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ──────── main component ──────── */

interface Connection {
  id: string;
  label: string;
  direction: "inbound" | "outbound";
}

export default function DetailPanel() {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);
  const mapData = useAppStore((s) => s.mapData);
  const darkMode = useAppStore((s) => s.darkMode);
  const updateNode = useAppStore((s) => s.updateNode);

  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const close = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);

  const { block, connections, parentBlock } = useMemo(() => {
    if (!mapData || !selectedNodeId)
      return {
        block: undefined,
        connections: [] as Connection[],
        parentBlock: undefined,
      };

    const block = findBlock(mapData.rootNodes, selectedNodeId);
    const parentBlock = findParentBlock(mapData.rootNodes, selectedNodeId);

    // label lookup
    const labelMap = new Map<string, string>();
    function buildLabelMap(nodes: IndustryBlock[]) {
      for (const n of nodes) {
        labelMap.set(n.id, n.label);
        if (n.subNodes) buildLabelMap(n.subNodes);
      }
    }
    buildLabelMap(mapData.rootNodes);

    // connections from edges
    const connections: Connection[] = [];
    for (const edge of mapData.edges as MapEdge[]) {
      if (edge.source === selectedNodeId) {
        connections.push({
          id: edge.target,
          label: labelMap.get(edge.target) || edge.target,
          direction: "outbound",
        });
      }
      if (edge.target === selectedNodeId) {
        connections.push({
          id: edge.source,
          label: labelMap.get(edge.source) || edge.source,
          direction: "inbound",
        });
      }
    }

    return { block, connections, parentBlock };
  }, [mapData, selectedNodeId]);

  if (!selectedNodeId || !block) return null;

  const accent = CATEGORY_ACCENTS[block.category] || "#2563eb";
  const catLabel = CATEGORY_LABELS[block.category] || block.category;
  const subCount = block.subNodes?.length || 0;
  const muted = "var(--muted)";
  const isEnriched = !!block.enrichedAt;

  // Archetype info from map-level data
  const archetypeKey = mapData?.archetype;
  const archetypeProfile = archetypeKey
    ? ARCHETYPE_PROFILES[archetypeKey]
    : undefined;
  const jurisdiction = mapData?.jurisdiction;

  const handleEnrich = async () => {
    if (enriching || !mapData) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: block.id,
          label: block.label,
          category: block.category,
          description: block.description,
          objective: block.objective,
          industry: mapData.industry,
          jurisdiction: mapData.jurisdiction,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      updateNode(block.id, {
        keyActors: data.keyActors,
        keyTools: data.keyTools,
        painPoints: data.painPoints,
        costDrivers: data.costDrivers,
        regulatoryNotes: data.regulatoryNotes,
        opportunities: data.opportunities,
        enrichedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setEnrichError(err.message || "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div
      className="fixed top-0 right-0 h-full z-50 detail-panel-enter detail-scrollbar"
      style={{
        width: 360,
        background: darkMode ? "var(--card-bg)" : "#ffffff",
        borderLeft: `1px solid var(--border)`,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-5 py-4 flex items-start justify-between"
        style={{
          background: darkMode ? "var(--card-bg)" : "#ffffff",
          borderBottom: `1px solid var(--border)`,
        }}
      >
        <div className="flex-1 min-w-0">
          {/* Archetype + jurisdiction badges */}
          {(archetypeProfile || jurisdiction) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {archetypeProfile && (
                <span
                  className="px-2 py-0.5 text-[10px] font-medium rounded"
                  style={{
                    background: darkMode
                      ? "rgba(99,102,241,0.15)"
                      : "rgba(99,102,241,0.1)",
                    color: "#6366f1",
                  }}
                >
                  {archetypeProfile.label}
                </span>
              )}
              {jurisdiction && (
                <span
                  className="px-2 py-0.5 text-[10px] font-medium rounded"
                  style={{
                    background: darkMode
                      ? "rgba(255,255,255,0.06)"
                      : "#f3f4f6",
                    color: darkMode ? "#9ca3af" : "#6b7280",
                  }}
                >
                  {jurisdiction}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: accent }}
            />
            <span className="text-xs font-medium" style={{ color: accent }}>
              {catLabel}
            </span>
          </div>
          <h2
            className="text-base font-semibold truncate"
            style={{ color: darkMode ? "#f3f4f6" : "#111827" }}
          >
            {block.label}
          </h2>
        </div>
        <button
          onClick={close}
          className="ml-3 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          style={{ color: muted }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Find Opportunities button */}
        <button
          onClick={handleEnrich}
          disabled={enriching}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: enriching
              ? darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6"
              : isEnriched
              ? darkMode ? "rgba(22,163,74,0.12)" : "rgba(22,163,74,0.08)"
              : `${accent}18`,
            color: enriching
              ? (darkMode ? "#9ca3af" : "#6b7280")
              : isEnriched ? "#16a34a" : accent,
            border: `1px solid ${enriching ? "transparent" : isEnriched ? "rgba(22,163,74,0.25)" : `${accent}30`}`,
            cursor: enriching ? "wait" : "pointer",
            opacity: enriching ? 0.7 : 1,
          }}
        >
          {enriching ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching the web...
            </>
          ) : isEnriched ? (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8.5l3.5 3.5 6.5-7" />
              </svg>
              Enriched — click to refresh
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5" />
                <path d="M11 11l3.5 3.5" />
              </svg>
              Find Opportunities
            </>
          )}
        </button>
        {enrichError && (
          <p className="text-xs text-red-500 -mt-3">{enrichError}</p>
        )}

        {/* Description */}
        {block.description && (
          <p
            className="text-sm leading-relaxed"
            style={{ color: muted }}
          >
            {block.description}
          </p>
        )}

        {/* Objective */}
        {block.objective && (
          <div>
            <SectionHeading muted={muted}>Objective</SectionHeading>
            <p
              className="text-sm leading-relaxed"
              style={{ color: darkMode ? "#e5e7eb" : "#111827" }}
            >
              {block.objective}
            </p>
          </div>
        )}

        {/* Revenue Model */}
        {block.revenueModel && (
          <div>
            <SectionHeading muted={muted}>Revenue Model</SectionHeading>
            <p
              className="text-sm leading-relaxed"
              style={{ color: darkMode ? "#d1d5db" : "#374151" }}
            >
              {block.revenueModel}
            </p>
          </div>
        )}

        {/* Key Actors */}
        {block.keyActors && block.keyActors.length > 0 && (
          <div>
            <SectionHeading muted={muted}>Key Actors</SectionHeading>
            <PillList
              items={block.keyActors}
              darkMode={darkMode}
              accent={accent}
            />
          </div>
        )}

        {/* Key Tools */}
        {block.keyTools && block.keyTools.length > 0 && (
          <div>
            <SectionHeading muted={muted}>Key Tools & Platforms</SectionHeading>
            <PillList items={block.keyTools} darkMode={darkMode} />
          </div>
        )}

        {/* Pain Points — opportunity signals */}
        {block.painPoints && block.painPoints.length > 0 && (
          <div>
            <SectionHeading muted={muted}>
              Pain Points{" "}
              <span className="normal-case font-normal tracking-normal">
                — opportunity signals
              </span>
            </SectionHeading>
            <BulletList
              items={block.painPoints}
              darkMode={darkMode}
              accent={accent}
              highlight
            />
          </div>
        )}

        {/* Business Opportunities (from web enrichment) */}
        {block.opportunities && block.opportunities.length > 0 && (
          <div>
            <SectionHeading muted={muted}>
              Opportunities{" "}
              <span className="normal-case font-normal tracking-normal">
                — web-verified
              </span>
            </SectionHeading>
            <div className="space-y-3">
              {block.opportunities.map((opp, i) => (
                <div
                  key={i}
                  className="px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: darkMode
                      ? "rgba(245,158,11,0.06)"
                      : "rgba(245,158,11,0.05)",
                    border: `1px solid ${darkMode ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.2)"}`,
                  }}
                >
                  <div
                    className="font-medium mb-1"
                    style={{ color: "#f59e0b" }}
                  >
                    {opp.title}
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: darkMode ? "#d1d5db" : "#374151" }}
                  >
                    {opp.description}
                  </p>
                  {opp.sourceUrl && (
                    <a
                      href={opp.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1.5 text-[11px] hover:underline"
                      style={{ color: darkMode ? "#60a5fa" : "#2563eb" }}
                    >
                      Source →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost Drivers */}
        {block.costDrivers && block.costDrivers.length > 0 && (
          <div>
            <SectionHeading muted={muted}>Cost Drivers</SectionHeading>
            <BulletList
              items={block.costDrivers}
              darkMode={darkMode}
              accent={accent}
            />
          </div>
        )}

        {/* Regulatory Notes */}
        {block.regulatoryNotes &&
          block.regulatoryNotes !== "None specific" && (
            <div>
              <SectionHeading muted={muted}>Regulatory Notes</SectionHeading>
              <p
                className="text-sm leading-relaxed"
                style={{ color: darkMode ? "#d1d5db" : "#374151" }}
              >
                {block.regulatoryNotes}
              </p>
            </div>
          )}

        {/* Parent */}
        {parentBlock && (
          <div>
            <SectionHeading muted={muted}>Parent</SectionHeading>
            <button
              onClick={() => setSelectedNodeId(parentBlock.id)}
              className="text-sm hover:underline"
              style={{ color: accent }}
            >
              ← {parentBlock.label}
            </button>
          </div>
        )}

        {/* Sub-components */}
        {subCount > 0 && (
          <div>
            <SectionHeading muted={muted}>
              Sub-components ({subCount})
            </SectionHeading>
            <div className="space-y-1">
              {block.subNodes!.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setSelectedNodeId(sub.id)}
                  className="block w-full text-left px-3 py-1.5 rounded text-sm transition-colors"
                  style={{
                    color: darkMode ? "#d1d5db" : "#374151",
                    background: darkMode
                      ? "rgba(255,255,255,0.03)"
                      : "#f9fafb",
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Connections */}
        {connections.length > 0 && (
          <div>
            <SectionHeading muted={muted}>
              Connections ({connections.length})
            </SectionHeading>
            <div className="space-y-1.5">
              {connections.map((conn) => (
                <div
                  key={`${conn.direction}-${conn.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded text-sm"
                  style={{
                    background: darkMode
                      ? "rgba(255,255,255,0.03)"
                      : "#f9fafb",
                  }}
                >
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      background:
                        conn.direction === "outbound"
                          ? "rgba(37,99,235,0.1)"
                          : "rgba(22,163,74,0.1)",
                      color:
                        conn.direction === "outbound" ? "#2563eb" : "#16a34a",
                    }}
                  >
                    {conn.direction === "outbound" ? "→ out" : "← in"}
                  </span>
                  <button
                    onClick={() => setSelectedNodeId(conn.id)}
                    className="truncate hover:underline"
                    style={{ color: darkMode ? "#d1d5db" : "#374151" }}
                  >
                    {conn.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta footer */}
        <div
          className="pt-3 text-[11px] space-y-1"
          style={{
            borderTop: `1px solid var(--border)`,
            color: muted,
          }}
        >
          <div>ID: {block.id}</div>
          <div className="opacity-60 mt-2">
            Right-click another node to switch
          </div>
        </div>
      </div>
    </div>
  );
}
