"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { CATEGORY_ACCENTS, CATEGORY_LABELS } from "./NodeCard";
import type { IndustryBlock, MapEdge } from "@/types";
import { ARCHETYPE_PROFILES } from "@/lib/archetypes";
import { buildEnrichPayload } from "@/lib/enrichContext";
import type { ConnectionInfo } from "@/lib/enrichContext";
import NodeChatPanel from "./NodeChatPanel";

/* ── Quote-to-Chat floating tooltip ── */
function QuoteTooltip({
  x,
  y,
  onQuote,
}: {
  x: number;
  y: number;
  onQuote: () => void;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault(); // prevent selection from clearing
        e.stopPropagation();
        onQuote();
      }}
      className="fixed z-[100] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg transition-all animate-quote-pop"
      style={{
        left: x,
        top: y,
        background: "var(--accent)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.2)",
        cursor: "pointer",
        pointerEvents: "auto",
        transform: "translate(-50%, -100%)",
        whiteSpace: "nowrap",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
      Quote to Chat
    </button>
  );
}

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 360;
const EXPANDED_WIDTH = 640;
const MAX_WIDTH_RATIO = 0.6; // max 60% of viewport

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
  const activeDetailTab = useAppStore((s) => s.activeDetailTab);
  const setActiveDetailTab = useAppStore((s) => s.setActiveDetailTab);
  const setPendingQuote = useAppStore((s) => s.setPendingQuote);

  const [enrichStage, setEnrichStage] = useState<
    "idle" | "researching" | "analyzing" | "scoring" | "done" | "error"
  >("idle");
  const [enrichError, setEnrichError] = useState<string | null>(null);

  /* ── Resize / expand state ── */
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [expanded, setExpanded] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      setPanelWidth(next ? EXPANDED_WIDTH : DEFAULT_WIDTH);
      return next;
    });
  }, []);

  // Drag-to-resize from left edge
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelWidth]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;
      const maxW = window.innerWidth * MAX_WIDTH_RATIO;
      const newW = Math.min(maxW, Math.max(MIN_WIDTH, dragStartWidth.current + delta));
      setPanelWidth(newW);
      setExpanded(newW > (DEFAULT_WIDTH + EXPANDED_WIDTH) / 2);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  /* ── Quote-to-Chat selection tracking ── */
  const detailsContentRef = useRef<HTMLDivElement>(null);
  const [quotePos, setQuotePos] = useState<{ x: number; y: number } | null>(null);
  const [quoteText, setQuoteText] = useState("");

  const handleTextSelect = useCallback(() => {
    // Only on the details tab
    if (useAppStore.getState().activeDetailTab !== "details") return;

    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 3) {
      setQuotePos(null);
      setQuoteText("");
      return;
    }

    // Ensure the selection is inside the details content area
    if (detailsContentRef.current && sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      if (!detailsContentRef.current.contains(range.commonAncestorContainer)) {
        setQuotePos(null);
        return;
      }
    }

    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setQuotePos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    setQuoteText(text.length > 300 ? text.slice(0, 300) + "…" : text);
  }, []);

  const handleQuoteToChat = useCallback(() => {
    if (!quoteText) return;
    setPendingQuote(quoteText);
    setActiveDetailTab("chat");
    setQuotePos(null);
    setQuoteText("");
    window.getSelection()?.removeAllRanges();
  }, [quoteText, setPendingQuote, setActiveDetailTab]);

  // Listen for mouseup + key selection on document (for when selection ends)
  useEffect(() => {
    const onMouseUp = () => {
      // Small delay to let the browser finalize the selection
      setTimeout(handleTextSelect, 10);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key === "Shift") {
        setTimeout(handleTextSelect, 10);
      }
    };
    // Clear tooltip when clicking outside
    const onMouseDown = (e: MouseEvent) => {
      // If clicking on the quote tooltip, don't clear
      const target = e.target as HTMLElement;
      if (target.closest(".animate-quote-pop")) return;
      setQuotePos(null);
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [handleTextSelect]);

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
  const isEnriching = enrichStage !== "idle" && enrichStage !== "done" && enrichStage !== "error";

  // Archetype info from map-level data
  const archetypeKey = mapData?.archetype;
  const archetypeProfile = archetypeKey
    ? ARCHETYPE_PROFILES[archetypeKey]
    : undefined;
  const jurisdiction = mapData?.jurisdiction;

  /* ── 3-stage enrichment pipeline ── */
  const handleEnrich = async () => {
    if (isEnriching || !mapData) return;
    setEnrichError(null);

    // Build the shared payload
    const payload = buildEnrichPayload(
      block,
      connections as ConnectionInfo[],
      parentBlock,
      mapData,
      archetypeProfile
    );

    try {
      // ── Stage 1: Market Research ──
      setEnrichStage("researching");
      const researchRes = await fetch("/api/enrich/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!researchRes.ok) {
        const e = await researchRes.json().catch(() => ({ error: "Research failed" }));
        throw new Error(e.error || `Research HTTP ${researchRes.status}`);
      }
      const research = await researchRes.json();

      // Progressive update: show research results immediately
      updateNode(block.id, {
        keyActors: research.keyActors,
        keyTools: research.keyTools,
        typicalClients: research.typicalClients,
        costDrivers: research.costDrivers,
        regulatoryNotes: research.regulatoryNotes,
      });

      // Track sources from Agent 1
      const allSources: { url: string; title: string }[] = [
        ...(Array.isArray(research.sources) ? research.sources : []),
      ];

      // ── Stage 2: Analysis ──
      setEnrichStage("analyzing");
      const analyzeRes = await fetch("/api/enrich/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, research }),
      });
      if (!analyzeRes.ok) {
        const e = await analyzeRes.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(e.error || `Analysis HTTP ${analyzeRes.status}`);
      }
      const analysis = await analyzeRes.json();

      // Progressive update: show analysis results
      // Parse structured fields from analysis strings
      const demandDir = analysis.demandTrend?.split(" — ") || [analysis.demandTrend];
      const satParts = analysis.competitiveSaturation?.split(" — ") || [analysis.competitiveSaturation];
      const marginParts = analysis.marginProfile?.split(" — ") || [analysis.marginProfile];
      const disruptParts = analysis.disruptionRisk?.split(" — ") || [analysis.disruptionRisk];
      const switchPart = analysis.clientSwitchingCosts?.split(" — ")?.[0]?.toLowerCase().trim();
      const barrierParts = analysis.entryBarriers?.split(" — ") || [analysis.entryBarriers];

      updateNode(block.id, {
        painPoints: analysis.painPoints,
        unmetNeeds: analysis.unmetNeeds,
        demandTrend: {
          direction: (["growing", "declining", "stable", "emerging"].includes(demandDir[0]?.toLowerCase().trim())
            ? demandDir[0].toLowerCase().trim()
            : "stable") as "growing" | "declining" | "stable" | "emerging",
          rationale: demandDir[1] || demandDir[0] || "",
        },
        competitiveSaturation: {
          level: (["underserved", "moderate", "oversaturated"].includes(satParts[0]?.toLowerCase().trim())
            ? satParts[0].toLowerCase().trim()
            : "moderate") as "underserved" | "moderate" | "oversaturated",
          playerEstimate: satParts[1] || satParts[0] || "",
        },
        entryBarriers: barrierParts.length > 0 ? barrierParts : [analysis.entryBarriers],
        marginProfile: {
          gross: marginParts[0] || "",
          net: "",
          verdict: marginParts[1] || marginParts[0] || "",
        },
        disruptionRisk: {
          level: (["low", "medium", "high"].includes(disruptParts[0]?.toLowerCase().trim())
            ? disruptParts[0].toLowerCase().trim()
            : "medium") as "low" | "medium" | "high",
          threats: disruptParts.slice(1).length > 0 ? disruptParts.slice(1) : [analysis.disruptionRisk || ""],
        },
        clientSwitchingCosts: (["low", "medium", "high"].includes(switchPart)
          ? switchPart
          : "medium") as "low" | "medium" | "high",
      });

      // Collect sources from Agent 2
      if (Array.isArray(analysis.sources)) {
        allSources.push(...analysis.sources);
      }

      // ── Stage 3: Scoring ──
      setEnrichStage("scoring");
      const scoreRes = await fetch("/api/enrich/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, research, analysis }),
      });
      if (!scoreRes.ok) {
        const e = await scoreRes.json().catch(() => ({ error: "Scoring failed" }));
        throw new Error(e.error || `Scoring HTTP ${scoreRes.status}`);
      }
      const scoring = await scoreRes.json();

      // Parse value chain position
      const vcpParts = scoring.valueChainPosition?.split(" — ") || [scoring.valueChainPosition];
      const vcpVal = vcpParts[0]?.toLowerCase().replace(/[^a-z-]/g, "").trim();

      // Split nodeRelevance into keyword + explanation
      const nrParts = (scoring.nodeRelevance || "").split(" — ");
      const nrKeyword = nrParts[0]?.trim() || "unknown";
      const nrExplanation = nrParts.slice(1).join(" — ").trim() || nrParts[0]?.trim() || "";

      // Final update with scoring results
      updateNode(block.id, {
        opportunityScore: {
          score: scoring.opportunityScore,
          reasoning: nrExplanation,
        },
        nodeRelevance: nrKeyword,
        connectionInsights: Array.isArray(scoring.connectionInsights)
          ? scoring.connectionInsights.map((ci: string, i: number) => ({
              connectionLabel: connections[i]?.label || `Connection ${i + 1}`,
              insight: ci,
            }))
          : [],
        expenseRange: {
          monthly: "",
          annual: scoring.expenseRange || "",
        },
        incomeRange: {
          low: scoring.incomeRange || "",
          high: "",
        },
        valueChainPosition: (["upstream", "midstream", "downstream"].includes(vcpVal)
          ? vcpVal
          : "midstream") as "upstream" | "midstream" | "downstream",
        opportunities: Array.isArray(scoring.opportunities)
          ? scoring.opportunities.map((opp: any) => {
              // Support both object format (new) and plain string (legacy)
              const desc = typeof opp === "string" ? opp : (opp.description || String(opp));
              const srcUrl = typeof opp === "object" && opp.sourceUrl ? opp.sourceUrl : undefined;
              return {
                title: desc.substring(0, 60) + (desc.length > 60 ? "..." : ""),
                description: desc,
                sourceUrl: srcUrl,
              };
            })
          : [],
        // Deduplicate and store all sources from Agents 1, 2, and scoring
        sources: (() => {
          const scoreSources = Array.isArray(scoring.sources) ? scoring.sources : [];
          const combined = [...allSources, ...scoreSources];
          const seen = new Map<string, string>();
          for (const s of combined) { if (s.url) seen.set(s.url, s.title || ""); }
          return Array.from(seen.entries()).map(([url, title]) => ({ url, title }));
        })(),
        enrichedAt: new Date().toISOString(),
      });

      setEnrichStage("done");
    } catch (err: any) {
      setEnrichError(err.message || "Enrichment failed");
      setEnrichStage("error");
    }
  };

  return (
    <div
      className="fixed top-0 right-0 h-full z-50 detail-panel-enter detail-scrollbar"
      style={{
        width: panelWidth,
        background: darkMode ? "var(--card-bg)" : "#ffffff",
        borderLeft: `1px solid var(--border)`,
        overflowY: "auto",
        transition: isDragging.current ? "none" : "width 0.25s ease",
      }}
    >
      {/* Drag handle on left edge – full height, wide hit area */}
      <div
        onMouseDown={onMouseDown}
        className="resize-handle group absolute top-0 left-[-4px] h-full z-20 flex items-center"
        style={{
          width: 12,
          cursor: "col-resize",
        }}
      >
        {/* Thin accent line that appears on hover */}
        <div
          className="resize-indicator absolute left-[4px] top-0 h-full transition-opacity"
          style={{
            width: 3,
            borderRadius: 2,
            background: "var(--accent)",
            opacity: 0,
          }}
        />
      </div>

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
        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
          {/* Expand / collapse toggle */}
          <button
            onClick={toggleExpanded}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            style={{ color: muted }}
            title={expanded ? "Collapse panel" : "Expand panel"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {expanded ? (
                <path d="M10 3l-4 5 4 5" />
              ) : (
                <path d="M6 3l4 5-4 5" />
              )}
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={close}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
      </div>

      {/* Tab bar */}
      <div
        className="sticky z-10 flex px-5"
        style={{
          top: 0,
          background: darkMode ? "var(--card-bg)" : "#ffffff",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          onClick={() => setActiveDetailTab("details")}
          className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors relative"
          style={{
            color: activeDetailTab === "details" ? "var(--accent)" : "var(--muted)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" opacity={0.7}>
            <path d="M3 1h10a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2zm1 3v2h8V4H4zm0 4v2h5V8H4z" />
          </svg>
          Details
          {activeDetailTab === "details" && (
            <span
              className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
              style={{ background: "var(--accent)" }}
            />
          )}
        </button>
        <button
          onClick={() => setActiveDetailTab("chat")}
          className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors relative"
          style={{
            color: activeDetailTab === "chat" ? "var(--accent)" : "var(--muted)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity={0.7}>
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Chat
          {activeDetailTab === "chat" && (
            <span
              className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
              style={{ background: "var(--accent)" }}
            />
          )}
        </button>
      </div>

      {/* Chat tab */}
      {activeDetailTab === "chat" && (
        <div className="flex-1" style={{ height: "calc(100% - 120px)" }}>
          <NodeChatPanel />
        </div>
      )}

      {/* Details tab */}
      {activeDetailTab === "details" && (
      <div ref={detailsContentRef} className="px-5 py-4 space-y-5">
        {/* Find Opportunities button — 3-stage */}
        <button
          onClick={handleEnrich}
          disabled={isEnriching}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: isEnriching
              ? darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6"
              : isEnriched
              ? darkMode ? "rgba(22,163,74,0.12)" : "rgba(22,163,74,0.08)"
              : `${accent}18`,
            color: isEnriching
              ? (darkMode ? "#9ca3af" : "#6b7280")
              : isEnriched ? "#16a34a" : accent,
            border: `1px solid ${isEnriching ? "transparent" : isEnriched ? "rgba(22,163,74,0.25)" : `${accent}30`}`,
            cursor: isEnriching ? "wait" : "pointer",
            opacity: isEnriching ? 0.7 : 1,
          }}
        >
          {isEnriching ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {enrichStage === "researching"
                ? "Researching market..."
                : enrichStage === "analyzing"
                ? "Analyzing industry..."
                : "Scoring opportunities..."}
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
        {/* Stage progress indicator */}
        {isEnriching && (
          <div className="flex gap-1 -mt-3">
            {(["researching", "analyzing", "scoring"] as const).map((stage) => {
              const stageIdx = ["researching", "analyzing", "scoring"].indexOf(stage);
              const currentIdx = ["researching", "analyzing", "scoring"].indexOf(enrichStage as string);
              const isActive = stage === enrichStage;
              const isDone = currentIdx > stageIdx;
              return (
                <div
                  key={stage}
                  className="flex-1 h-1 rounded-full transition-all"
                  style={{
                    background: isDone
                      ? "#16a34a"
                      : isActive
                      ? accent
                      : darkMode
                      ? "rgba(255,255,255,0.08)"
                      : "#e5e7eb",
                    opacity: isActive ? 1 : isDone ? 0.7 : 0.4,
                  }}
                />
              );
            })}
          </div>
        )}
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

        {/* ─── NEW ENRICHMENT SECTIONS ─── */}

        {/* Opportunity Score — colored badge */}
        {block.opportunityScore && (
          <div>
            <SectionHeading muted={muted}>Opportunity Score</SectionHeading>
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold"
                style={{
                  background:
                    block.opportunityScore.score >= 7
                      ? "rgba(22,163,74,0.15)"
                      : block.opportunityScore.score >= 4
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(220,38,38,0.15)",
                  color:
                    block.opportunityScore.score >= 7
                      ? "#16a34a"
                      : block.opportunityScore.score >= 4
                      ? "#f59e0b"
                      : "#dc2626",
                }}
              >
                {block.opportunityScore.score}
              </span>
              <p
                className="text-xs leading-relaxed flex-1"
                style={{ color: darkMode ? "#d1d5db" : "#374151" }}
              >
                {block.opportunityScore.reasoning}
              </p>
            </div>
          </div>
        )}

        {/* Node Relevance — shown as a badge */}
        {block.nodeRelevance && (
          <div>
            <SectionHeading muted={muted}>Node Relevance</SectionHeading>
            <span
              className="px-2 py-1 text-xs rounded font-medium capitalize"
              style={{
                background:
                  block.nodeRelevance.toLowerCase().startsWith("critical")
                    ? "rgba(22,163,74,0.12)"
                    : block.nodeRelevance.toLowerCase().startsWith("important")
                    ? "rgba(99,102,241,0.12)"
                    : block.nodeRelevance.toLowerCase().startsWith("peripheral")
                    ? "rgba(245,158,11,0.12)"
                    : darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6",
                color:
                  block.nodeRelevance.toLowerCase().startsWith("critical")
                    ? "#16a34a"
                    : block.nodeRelevance.toLowerCase().startsWith("important")
                    ? "#6366f1"
                    : block.nodeRelevance.toLowerCase().startsWith("peripheral")
                    ? "#f59e0b"
                    : darkMode ? "#9ca3af" : "#6b7280",
              }}
            >
              {block.nodeRelevance}
            </span>
          </div>
        )}

        {/* Market Indicators row */}
        {(block.demandTrend || block.competitiveSaturation || block.valueChainPosition) && (
          <div>
            <SectionHeading muted={muted}>Market Indicators</SectionHeading>
            <div className="flex flex-wrap gap-2">
              {block.demandTrend && (
                <span
                  className="px-2 py-1 text-xs rounded"
                  style={{
                    background:
                      block.demandTrend.direction === "growing"
                        ? "rgba(22,163,74,0.12)"
                        : block.demandTrend.direction === "declining"
                        ? "rgba(220,38,38,0.12)"
                        : block.demandTrend.direction === "emerging"
                        ? "rgba(99,102,241,0.12)"
                        : darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6",
                    color:
                      block.demandTrend.direction === "growing"
                        ? "#16a34a"
                        : block.demandTrend.direction === "declining"
                        ? "#dc2626"
                        : block.demandTrend.direction === "emerging"
                        ? "#6366f1"
                        : darkMode ? "#9ca3af" : "#6b7280",
                  }}
                  title={block.demandTrend.rationale}
                >
                  {block.demandTrend.direction === "growing" ? "↑" : block.demandTrend.direction === "declining" ? "↓" : "→"}{" "}
                  Demand: {block.demandTrend.direction}
                </span>
              )}
              {block.competitiveSaturation && (
                <span
                  className="px-2 py-1 text-xs rounded"
                  style={{
                    background:
                      block.competitiveSaturation.level === "underserved"
                        ? "rgba(22,163,74,0.12)"
                        : block.competitiveSaturation.level === "oversaturated"
                        ? "rgba(220,38,38,0.12)"
                        : darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6",
                    color:
                      block.competitiveSaturation.level === "underserved"
                        ? "#16a34a"
                        : block.competitiveSaturation.level === "oversaturated"
                        ? "#dc2626"
                        : darkMode ? "#9ca3af" : "#6b7280",
                  }}
                  title={block.competitiveSaturation.playerEstimate}
                >
                  Competition: {block.competitiveSaturation.level}
                </span>
              )}
              {block.valueChainPosition && (
                <span
                  className="px-2 py-1 text-xs rounded"
                  style={{
                    background: darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6",
                    color: darkMode ? "#9ca3af" : "#6b7280",
                  }}
                >
                  {block.valueChainPosition}
                </span>
              )}
              {block.clientSwitchingCosts && (
                <span
                  className="px-2 py-1 text-xs rounded"
                  style={{
                    background:
                      block.clientSwitchingCosts === "high"
                        ? "rgba(22,163,74,0.12)"
                        : block.clientSwitchingCosts === "low"
                        ? "rgba(220,38,38,0.12)"
                        : darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6",
                    color:
                      block.clientSwitchingCosts === "high"
                        ? "#16a34a"
                        : block.clientSwitchingCosts === "low"
                        ? "#dc2626"
                        : darkMode ? "#9ca3af" : "#6b7280",
                  }}
                >
                  Switching: {block.clientSwitchingCosts}
                </span>
              )}
            </div>
            {/* Rationale texts below badges */}
            {block.demandTrend?.rationale && (
              <p className="text-xs mt-2 leading-relaxed" style={{ color: muted }}>
                {block.demandTrend.rationale}
              </p>
            )}
            {block.competitiveSaturation?.playerEstimate && (
              <p className="text-xs mt-1 leading-relaxed" style={{ color: muted }}>
                {block.competitiveSaturation.playerEstimate}
              </p>
            )}
          </div>
        )}

        {/* Financials card */}
        {(block.expenseRange || block.incomeRange || block.marginProfile) && (
          <div
            className="px-3 py-3 rounded-lg"
            style={{
              background: darkMode ? "rgba(255,255,255,0.03)" : "#f9fafb",
              border: `1px solid var(--border)`,
            }}
          >
            <SectionHeading muted={muted}>Financials</SectionHeading>
            <div className="space-y-2 text-sm">
              {block.expenseRange?.annual && (
                <div className="flex justify-between">
                  <span style={{ color: muted }}>Expenses</span>
                  <span style={{ color: darkMode ? "#f87171" : "#dc2626" }}>
                    {block.expenseRange.annual}
                  </span>
                </div>
              )}
              {block.incomeRange?.low && (
                <div className="flex justify-between">
                  <span style={{ color: muted }}>Revenue</span>
                  <span style={{ color: darkMode ? "#4ade80" : "#16a34a" }}>
                    {block.incomeRange.low}
                  </span>
                </div>
              )}
              {block.marginProfile?.verdict && (
                <div className="flex justify-between">
                  <span style={{ color: muted }}>Margins</span>
                  <span style={{ color: darkMode ? "#d1d5db" : "#374151" }}>
                    {block.marginProfile.verdict}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Typical Clients */}
        {block.typicalClients && block.typicalClients.length > 0 && (
          <div>
            <SectionHeading muted={muted}>Typical Clients</SectionHeading>
            <PillList items={block.typicalClients} darkMode={darkMode} accent={accent} />
          </div>
        )}

        {/* Unmet Needs */}
        {block.unmetNeeds && block.unmetNeeds.length > 0 && (
          <div>
            <SectionHeading muted={muted}>
              Unmet Needs{" "}
              <span className="normal-case font-normal tracking-normal">— gaps in the market</span>
            </SectionHeading>
            <BulletList items={block.unmetNeeds} darkMode={darkMode} accent="#f59e0b" highlight />
          </div>
        )}

        {/* Entry Barriers */}
        {block.entryBarriers && block.entryBarriers.length > 0 && (
          <div>
            <SectionHeading muted={muted}>Entry Barriers</SectionHeading>
            <BulletList items={block.entryBarriers} darkMode={darkMode} accent={accent} />
          </div>
        )}

        {/* Disruption Risk */}
        {block.disruptionRisk && (
          <div>
            <SectionHeading muted={muted}>Disruption Risk</SectionHeading>
            <span
              className="px-2 py-1 text-xs rounded font-medium"
              style={{
                background:
                  block.disruptionRisk.level === "high"
                    ? "rgba(220,38,38,0.12)"
                    : block.disruptionRisk.level === "low"
                    ? "rgba(22,163,74,0.12)"
                    : "rgba(245,158,11,0.12)",
                color:
                  block.disruptionRisk.level === "high"
                    ? "#dc2626"
                    : block.disruptionRisk.level === "low"
                    ? "#16a34a"
                    : "#f59e0b",
              }}
            >
              {block.disruptionRisk.level} risk
            </span>
            {block.disruptionRisk.threats?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {block.disruptionRisk.threats.map((t, i) => (
                  <li key={i} className="text-xs" style={{ color: darkMode ? "#d1d5db" : "#374151" }}>
                    • {t}
                  </li>
                ))}
              </ul>
            )}
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
              {connections.map((conn) => {
                const insight = block.connectionInsights?.find(
                  (ci) => ci.connectionLabel === conn.label
                );
                return (
                  <div
                    key={`${conn.direction}-${conn.id}`}
                    className="px-3 py-1.5 rounded text-sm"
                    style={{
                      background: darkMode
                        ? "rgba(255,255,255,0.03)"
                        : "#f9fafb",
                    }}
                  >
                    <div className="flex items-center gap-2">
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
                    {insight && (
                      <p className="text-[11px] mt-1 ml-7 leading-relaxed" style={{ color: muted }}>
                        {insight.insight}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Research Sources */}
        {block.sources && block.sources.length > 0 && (
          <div>
            <SectionHeading muted={muted}>
              Sources{" "}
              <span className="normal-case font-normal tracking-normal">
                ({block.sources.length})
              </span>
            </SectionHeading>
            <div className="space-y-1.5">
              {block.sources.map((src, i) => (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:underline"
                  style={{
                    background: darkMode
                      ? "rgba(96,165,250,0.06)"
                      : "rgba(37,99,235,0.04)",
                    border: `1px solid ${darkMode ? "rgba(96,165,250,0.12)" : "rgba(37,99,235,0.12)"}`,
                    color: darkMode ? "#93bbfd" : "#2563eb",
                  }}
                >
                  <span
                    className="shrink-0 mt-px text-[10px] font-medium opacity-50"
                  >
                    [{i + 1}]
                  </span>
                  <span className="break-all leading-relaxed">
                    {src.title || new URL(src.url).hostname}
                  </span>
                </a>
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
      )}

      {/* Quote-to-Chat floating tooltip */}
      {quotePos && activeDetailTab === "details" && (
        <QuoteTooltip x={quotePos.x} y={quotePos.y} onQuote={handleQuoteToChat} />
      )}
    </div>
  );
}
