"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import type { IndustryMap } from "@/types";

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

/* ──── localStorage LRU with TTL ──── */
const CACHE_VERSION = 2; // bump to invalidate stale entries
const CACHE_PREFIX = `imv${CACHE_VERSION}:`;
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

  // Clean up stale entries from old cache versions on mount
  useEffect(() => {
    try {
      const staleKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("imv:") && !k.startsWith(CACHE_PREFIX)) {
          staleKeys.push(k);
        }
      }
      for (const k of staleKeys) localStorage.removeItem(k);
    } catch { /* ignore */ }
  }, []);

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

  /* Core search logic — single SSE request delivers progress + data */
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
      if (cached && cached.data?.rootNodes && cached.data.rootNodes.length > 0) {
        setMapData(cached.data);
        setIsCached(true);
        setSource(cached.source as "database" | "research" | "fallback");
        searchingRef.current = false;
        return;
      }

      setIsLoading(true);
      setProgress({ step: "starting", message: "Starting\u2026", pct: 0 });

      // Track whether SSE delivered data
      let sseDelivered = false;

      try {
        // ── SSE: progress updates + data delivery in one request ──
        const sseAbort = new AbortController();
        // 90s timeout — deep research pipeline can take 30-60s
        const sseTimeout = setTimeout(() => sseAbort.abort(), 90000);

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
                const evt = JSON.parse(line.slice(6));

                if (evt.step === "error") {
                  // Error with optional fallback data
                  if (evt.data?.rootNodes?.length > 0) {
                    setMapData(evt.data);
                    setSource("fallback");
                    setError(evt.message || "Research failed");
                    sseDelivered = true;
                  } else {
                    setError(evt.message || "Research failed");
                  }
                } else if (evt.step === "done" && evt.data) {
                  // Success — data delivered via SSE
                  setMapData(evt.data);
                  const src = evt.source || "research";
                  setSource(src);
                  if (evt.matchedIndustry) setCorrectedQuery(evt.matchedIndustry);
                  setProgress(null);
                  // Cache the result
                  localSet(cacheKey, evt.data, src);
                  sseDelivered = true;
                } else {
                  // Progress update
                  setProgress({ step: evt.step, message: evt.message, pct: evt.pct });
                }
              } catch {
                // skip unparseable lines
              }
            };

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
            // Process remaining buffer
            if (buffer.trim()) {
              for (const part of buffer.split("\n\n")) {
                for (const line of part.split("\n")) processLine(line);
              }
            }
          }
        } catch {
          // SSE failed (timeout / network) — fall through to GET fallback
        }

        clearTimeout(sseTimeout);

        // ── GET fallback: only if SSE didn't deliver data ──
        if (!sseDelivered) {
          setProgress({ step: "fetching", message: "Fetching results\u2026", pct: 95 });

          const dataRes = await fetch(
            `/api/generate?q=${encodeURIComponent(trimmed)}`
          );
          const json = await dataRes.json();

          if (!dataRes.ok) {
            if (dataRes.status === 503 && json.data) {
              setMapData(json.data);
              setSource("fallback");
              setError(json.error || "Research failed \u2014 showing skeleton map");
            } else {
              setError(json.error || "Something went wrong");
            }
          } else if (json.data) {
            const src = (dataRes.headers.get("X-Source") || "research") as "database" | "research" | "fallback";
            const matchedIndustry = dataRes.headers.get("X-Matched-Industry");
            if (matchedIndustry) setCorrectedQuery(matchedIndustry);
            setMapData(json.data);
            setSource(src);
            if (!json.error) localSet(cacheKey, json.data, src);
          } else {
            setError(json.error || "No data received");
          }
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
