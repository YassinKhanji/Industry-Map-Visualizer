"use client";

import { useState, useCallback } from "react";
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
  const isLoading = useAppStore((s) => s.isLoading);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;

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

      // Hit API (GET for cacheability)
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/generate?q=${encodeURIComponent(trimmed)}`
        );

        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Something went wrong");
          return;
        }

        const source = (res.headers.get("X-Source") || "generate") as
          | "prebuilt"
          | "assemble"
          | "generate";

        // Check for spell-correction
        const correctedQ = res.headers.get("X-Corrected-Query");
        if (correctedQ) {
          setCorrectedQuery(correctedQ);
        }

        setMapData(json.data);
        setSource(source);

        // Cache in localStorage (skips fallback skeletons)
        localSet(cacheKey, json.data, source);
      } catch {
        setError("Failed to connect to the server");
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, setQuery, setMapData, setIsLoading, setIsCached, setSource, setError, setCorrectedQuery]
  );

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

      {/* Loading bar */}
      {isLoading && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-lg" style={{ background: "var(--border)" }}>
          <div
            className="h-full w-1/4 rounded-full loading-bar"
            style={{ backgroundColor: "var(--accent)" }}
          />
        </div>
      )}
    </form>
  );
}
