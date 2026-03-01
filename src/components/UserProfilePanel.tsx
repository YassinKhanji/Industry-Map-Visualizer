"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/lib/store";
import type { IndustryBlock, ProfileMatch } from "@/types";

const STORAGE_KEY = "imv:userProfile";
const MIN_WIDTH = 280;
const DEFAULT_WIDTH = 340;
const EXPANDED_WIDTH = 520;
const MAX_WIDTH_RATIO = 0.5; // max 50% of viewport

/** Recursively flatten all nodes from the block tree */
function flattenNodes(
  blocks: IndustryBlock[]
): { id: string; label: string; category: string; description?: string; objective?: string }[] {
  const result: { id: string; label: string; category: string; description?: string; objective?: string }[] = [];
  for (const b of blocks) {
    result.push({
      id: b.id,
      label: b.label,
      category: b.category,
      description: b.description,
      objective: b.objective,
    });
    if (b.subNodes) result.push(...flattenNodes(b.subNodes));
  }
  return result;
}

export default function UserProfilePanel() {
  const darkMode = useAppStore((s) => s.darkMode);
  const mapData = useAppStore((s) => s.mapData);
  const userProfile = useAppStore((s) => s.userProfile);
  const setUserProfile = useAppStore((s) => s.setUserProfile);
  const highlightedNodeIds = useAppStore((s) => s.highlightedNodeIds);
  const setHighlightedNodeIds = useAppStore((s) => s.setHighlightedNodeIds);
  const profileHighlightOn = useAppStore((s) => s.profileHighlightOn);
  const setProfileHighlightOn = useAppStore((s) => s.setProfileHighlightOn);
  const setProfilePanelOpen = useAppStore((s) => s.setProfilePanelOpen);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);
  const setFocusNodeId = useAppStore((s) => s.setFocusNodeId);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const setActiveDetailTab = useAppStore((s) => s.setActiveDetailTab);

  const [matches, setMatches] = useState<ProfileMatch[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMatchMessage, setNoMatchMessage] = useState<string | null>(null);

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

  // Drag-to-resize from right edge
  const onResizeMouseDown = useCallback(
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
      const delta = e.clientX - dragStartX.current;
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

  // Load profile from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && !userProfile) setUserProfile(saved);
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist profile to localStorage on change
  const handleProfileChange = useCallback(
    (val: string) => {
      setUserProfile(val);
      try { localStorage.setItem(STORAGE_KEY, val); } catch { /* ignore */ }
    },
    [setUserProfile]
  );

  // Restore matches from highlighted IDs if panel reopens
  // (matches are local state, but IDs persist in store)

  const handleAnalyze = useCallback(async () => {
    if (!mapData || userProfile.trim().length < 10) return;
    setIsAnalyzing(true);
    setError(null);
    setNoMatchMessage(null);

    try {
      const nodes = flattenNodes(mapData.rootNodes);
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProfile: userProfile.trim(), nodes }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const resultMatches: ProfileMatch[] = Array.isArray(data.matches) ? data.matches : [];
      setMatches(resultMatches);
      setHighlightedNodeIds(resultMatches.map((m) => m.id));
      if (resultMatches.length > 0) {
        setProfileHighlightOn(true);
        setNoMatchMessage(null);
      } else {
        setNoMatchMessage(data.noMatchMessage || "No strong matches found for your profile against these industry nodes.");
      }
    } catch (err: any) {
      setError(err.message || "Analysis failed");
      setMatches([]);
      setHighlightedNodeIds([]);
      setNoMatchMessage(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, [mapData, userProfile, setHighlightedNodeIds, setProfileHighlightOn]);

  const muted = darkMode ? "#9ca3af" : "#6b7280";

  return (
    <div
      className="fixed top-0 left-0 h-full z-50 profile-panel-enter detail-scrollbar"
      style={{
        width: panelWidth,
        background: darkMode ? "var(--card-bg)" : "#ffffff",
        borderRight: `1px solid var(--border)`,
        overflowY: "auto",
        transition: isDragging.current ? "none" : "width 0.25s ease",
      }}
    >
      {/* Drag handle on right edge */}
      <div
        onMouseDown={onResizeMouseDown}
        className="resize-handle absolute top-0 right-0 h-full z-20"
        style={{
          width: 5,
          cursor: "col-resize",
        }}
      >
        <div
          className="resize-indicator absolute top-0 right-0 h-full transition-opacity"
          style={{
            width: 3,
            background: "var(--accent)",
            opacity: 0,
          }}
        />
      </div>

      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: darkMode ? "#e5e7eb" : "#111827" }}
          >
            Profile Matcher
          </h2>
          <div className="flex items-center gap-1">
            {/* Expand / collapse toggle */}
            <button
              onClick={toggleExpanded}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{
                color: muted,
                background: darkMode ? "rgba(255,255,255,0.05)" : "#f3f4f6",
              }}
              title={expanded ? "Collapse panel" : "Expand panel"}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                {expanded ? (
                  <path d="M10 3l-4 5 4 5" />
                ) : (
                  <path d="M6 3l4 5-4 5" />
                )}
              </svg>
            </button>
            {/* Close */}
            <button
              onClick={() => setProfilePanelOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{
                color: muted,
                background: darkMode ? "rgba(255,255,255,0.05)" : "#f3f4f6",
              }}
              title="Close panel"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs leading-relaxed" style={{ color: muted }}>
          Describe your skills, experience, and background. The AI will highlight
          the most relevant nodes on the map for you.
        </p>

        {/* Textarea */}
        <textarea
          value={userProfile}
          onChange={(e) => handleProfileChange(e.target.value)}
          placeholder="e.g. I have 5 years of experience in data engineering, Python, cloud infrastructure (AWS), and financial analytics..."
          rows={5}
          className="w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 transition-all"
          style={{
            background: darkMode ? "rgba(255,255,255,0.04)" : "#f9fafb",
            border: `1px solid var(--border)`,
            color: darkMode ? "#e5e7eb" : "#111827",
          }}
        />

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || userProfile.trim().length < 10 || !mapData}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: isAnalyzing
              ? darkMode ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.1)"
              : darkMode ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)",
            color: "#818cf8",
            border: `1px solid ${darkMode ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.15)"}`,
          }}
        >
          {isAnalyzing ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
              Analyzing...
            </span>
          ) : (
            "Find My Matches"
          )}
        </button>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {/* Highlight toggle — only after matches exist */}
        {highlightedNodeIds.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: darkMode ? "#e5e7eb" : "#374151" }}>
              Highlight Matches
            </span>
            <button
              onClick={() => setProfileHighlightOn(!profileHighlightOn)}
              className="relative w-9 h-5 rounded-full transition-colors duration-200"
              style={{
                background: profileHighlightOn
                  ? "#f59e0b"
                  : darkMode ? "rgba(255,255,255,0.12)" : "#d1d5db",
              }}
              title={profileHighlightOn ? "Hide highlights" : "Show highlights"}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{
                  left: 2,
                  transform: profileHighlightOn ? "translateX(16px)" : "translateX(0)",
                }}
              />
            </button>
          </div>
        )}

        {/* Results list */}
        {matches.length > 0 && (
          <div className="space-y-2">
            <h3
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: muted }}
            >
              Matched Nodes ({matches.length})
            </h3>
            {matches.map((m, i) => {
              const isActive = selectedNodeId === m.id;
              return (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedNodeId(m.id);
                  setFocusNodeId(m.id);
                  setActiveDetailTab("details");
                }}
                className="profile-match-card w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 text-sm"
                style={{
                  background: isActive
                    ? darkMode ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)"
                    : darkMode ? "rgba(245,158,11,0.06)" : "rgba(245,158,11,0.04)",
                  border: isActive
                    ? `1.5px solid ${darkMode ? "rgba(245,158,11,0.5)" : "rgba(245,158,11,0.6)"}`
                    : `1px solid ${darkMode ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.15)"}`,
                  boxShadow: isActive
                    ? "0 0 8px rgba(245,158,11,0.2)"
                    : "none",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                <div className="flex items-center gap-2 pointer-events-none">
                  <span
                    className="shrink-0 text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full"
                    style={{
                      background: darkMode ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.1)",
                      color: "#f59e0b",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="font-medium text-xs"
                    style={{ color: darkMode ? "#fbbf24" : "#d97706" }}
                  >
                    {m.id}
                  </span>
                  {/* Arrow indicator */}
                  <svg
                    className="ml-auto shrink-0 opacity-50"
                    width="12" height="12" viewBox="0 0 16 16" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                    style={{ color: darkMode ? "#fbbf24" : "#d97706" }}
                  >
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </div>
                <p
                  className="text-[11px] mt-1 ml-7 leading-relaxed pointer-events-none"
                  style={{ color: muted }}
                >
                  {m.reason}
                </p>
              </button>
              );
            })}
          </div>
        )}

        {/* Empty state after analysis */}
        {!isAnalyzing && matches.length === 0 && highlightedNodeIds.length === 0 && userProfile.trim().length >= 10 && !noMatchMessage && (
          <p className="text-xs text-center py-3" style={{ color: muted }}>
            {mapData
              ? <>Click &quot;Find My Matches&quot; to analyze your profile against the map</>
              : <>Search for an industry first, then match your profile against the map</>}
          </p>
        )}

        {/* Honest no-match message from AI */}
        {!isAnalyzing && noMatchMessage && matches.length === 0 && (
          <div
            className="rounded-lg px-3 py-3 text-xs leading-relaxed"
            style={{
              background: darkMode ? "rgba(255,255,255,0.04)" : "#f9fafb",
              border: `1px solid var(--border)`,
              color: muted,
            }}
          >
            <div className="flex items-start gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 mt-0.5" style={{ color: "#f59e0b" }}>
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.5v4a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0z" />
              </svg>
              <span>{noMatchMessage}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
