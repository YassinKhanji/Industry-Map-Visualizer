"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import type { IndustryMap } from "@/types";

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

/* ──── localStorage LRU with TTL ──── */
const CACHE_PREFIX = "imv:";
const CACHE_MAX = 30;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedEntry {
  data: IndustryMap;
  source: string;
  ts: number;
}

function localGet(key: string): CachedEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CachedEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function localSet(key: string, data: IndustryMap, source: string) {
  // Don't cache fallback skeletons (they have exactly 8 root nodes with no subNodes)
  if (
    data.rootNodes.length <= 8 &&
    data.rootNodes.every((n) => !n.subNodes || n.subNodes.length === 0)
  ) {
    return;
  }

  const entry: CachedEntry = { data, source, ts: Date.now() };

  // Evict oldest if at capacity
  try {
    const keys: { key: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) {
        try {
          const v = JSON.parse(localStorage.getItem(k)!);
          keys.push({ key: k, ts: v.ts || 0 });
        } catch {
          keys.push({ key: k, ts: 0 });
        }
      }
    }
    // If at capacity, remove oldest entries
    if (keys.length >= CACHE_MAX) {
      keys.sort((a, b) => a.ts - b.ts);
      const toRemove = keys.length - CACHE_MAX + 1;
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(keys[i].key);
      }
    }
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage full, ignore
  }
}

export default function SearchBar() {
  const [input, setInput] = useState("");

  const setQuery = useAppStore((s) => s.setQuery);
  const setMapData = useAppStore((s) => s.setMapData);
  const setIsLoading = useAppStore((s) => s.setIsLoading);
  const setIsCached = useAppStore((s) => s.setIsCached);
  const setSource = useAppStore((s) => s.setSource);
  const setError = useAppStore((s) => s.setError);
  const setCorrectedQuery = useAppStore((s) => s.setCorrectedQuery);
  const setProgress = useAppStore((s) => s.setProgress);
  const isLoading = useAppStore((s) => s.isLoading);
  const progress = useAppStore((s) => s.progress);
  const triggerSearch = useAppStore((s) => s.triggerSearch);
  const setTriggerSearch = useAppStore((s) => s.setTriggerSearch);

  /* searchingRef prevents re-entrancy */
  const searchingRef = useRef(false);

  /* Core search logic — can be called from form submit or taxonomy trigger */
  const executeSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || searchingRef.current) return;
      searchingRef.current = true;

      setQuery(trimmed);
      setError(null);
      setIsCached(false);
      setCorrectedQuery(null);

      // Check localStorage cache first
      const cacheKey = `${CACHE_PREFIX}${normalize(trimmed)}`;
      const cached = localGet(cacheKey);
      if (cached) {
        setMapData(cached.data);
        setIsCached(true);
        setSource(cached.source as "prebuilt" | "assemble" | "generate");
        return;
      }

      setIsLoading(true);
      setProgress({ step: "starting", message: "Starting\u2026", pct: 0 });

      try {
        // ── Phase 1: SSE for real-time progress (ignore data payloads) ──
        const sseAbort = new AbortController();
        const sseTimeout = setTimeout(() => sseAbort.abort(), 45000);
        let sseError: string | null = null;

        try {
          const res = await fetch(
            `/api/generate?q=${encodeURIComponent(trimmed)}&stream=1`,
            { signal: sseAbort.signal }
          );

          if (res.ok && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            const processLine = (line: string) => {
              if (!line.startsWith("data: ")) return;
              try {
                const evt = JSON.parse(line.slice(6)) as {
                  step: string;
                  message: string;
                  pct: number;
                  corrected?: string;
                };
                if (evt.step === "error") {
                  sseError = evt.message;
                } else if (evt.step === "done") {
                  // Capture corrected query from SSE, but don't rely on data blob
                  if (evt.corrected) setCorrectedQuery(evt.corrected);
                  setProgress({ step: "done", message: "Loading results\u2026", pct: 95 });
                } else {
                  setProgress({ step: evt.step, message: evt.message, pct: evt.pct });
                }
              } catch {
                // skip unparseable lines
              }
            };

            // Read SSE events for progress updates only
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                buffer += decoder.decode();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const parts = buffer.split("\n\n");
              buffer = parts.pop() || "";
              for (const part of parts) {
                for (const line of part.split("\n")) processLine(line);
              }
            }
            // Process any remaining buffer
            if (buffer.trim()) {
              for (const part of buffer.split("\n\n")) {
                for (const line of part.split("\n")) processLine(line);
              }
            }
          }
        } catch {
          // SSE failed (timeout / network) — that's OK, we'll fetch data below
        }

        clearTimeout(sseTimeout);

        if (sseError) {
          setError(sseError);
          setProgress(null);
          return;
        }

        // ── Phase 2: Fetch actual data via regular GET (reliable HTTP) ──
        // The SSE handler already ran the full pipeline and cached the result,
        // so this GET hits server cache immediately (~1ms).
        setProgress({ step: "fetching", message: "Fetching results\u2026", pct: 98 });

        const dataRes = await fetch(
          `/api/generate?q=${encodeURIComponent(trimmed)}`
        );

        if (!dataRes.ok) {
          setError("Something went wrong");
          setProgress(null);
          return;
        }

        const json = await dataRes.json();
        if (json.data) {
          const rawSrc = dataRes.headers.get("X-Source") || "research";
          const src = rawSrc as "prebuilt" | "assemble" | "generate";
          const matchedIndustry = dataRes.headers.get("X-Matched-Industry");
          if (matchedIndustry) setCorrectedQuery(matchedIndustry);
          setMapData(json.data);
          setSource(src);
          localSet(cacheKey, json.data, rawSrc);
          setProgress(null);
        } else {
          setError(json.error || "No data received");
          setProgress(null);
        }
      } catch {
        setError("Failed to connect to the server");
        setProgress(null);
      } finally {
        setIsLoading(false);
        searchingRef.current = false;
      }
    },
    [setQuery, setMapData, setIsLoading, setIsCached, setSource, setError, setCorrectedQuery, setProgress]
  );

  /* Form submit handler */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      executeSearch(input);
    },
    [input, executeSearch]
  );

  /* Watch triggerSearch from store (set by TaxonomyBrowser) */
  useEffect(() => {
    if (triggerSearch) {
      setInput(triggerSearch);
      setTriggerSearch(null);
      executeSearch(triggerSearch);
    }
  }, [triggerSearch, setTriggerSearch, executeSearch]);

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto relative">
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter any industry, product, or service..."
          style={{
            width: "100%",
            padding: "14px 80px 14px 20px",
            fontSize: "16px",
            backgroundColor: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--foreground)",
            outline: "none",
            transition: "border-color 200ms",
            cursor: "text",
          }}
          disabled={isLoading}
          autoFocus
        />

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            px-4 py-2 text-sm font-medium
            rounded-md
            transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed
          "
          style={{
            backgroundColor: "var(--foreground)",
            color: "var(--background)",
            cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Mapping..." : "Map it"}
        </button>
      </div>

      {/* Progress bar — real percentage when streaming, animated fallback */}
      {isLoading && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden rounded-b-lg" style={{ background: "var(--border)" }}>
          <div
            className={`h-full rounded-full ${progress ? "" : "loading-bar w-1/4"}`}
            style={{
              backgroundColor: "var(--accent)",
              ...(progress
                ? { width: `${progress.pct}%`, transition: "width 400ms ease-out" }
                : {}),
            }}
          />
        </div>
      )}
    </form>
  );
}
