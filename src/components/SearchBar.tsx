"use client";

import { useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import type { IndustryMap } from "@/types";

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

export default function SearchBar() {
  const [input, setInput] = useState("");

  const setQuery = useAppStore((s) => s.setQuery);
  const setMapData = useAppStore((s) => s.setMapData);
  const setIsLoading = useAppStore((s) => s.setIsLoading);
  const setIsCached = useAppStore((s) => s.setIsCached);
  const setSource = useAppStore((s) => s.setSource);
  const setError = useAppStore((s) => s.setError);
  const isLoading = useAppStore((s) => s.isLoading);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;

      setQuery(trimmed);
      setError(null);
      setIsCached(false);

      // Check localStorage cache first
      const cacheKey = `imv:${normalize(trimmed)}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed: IndustryMap = JSON.parse(cached);
          setMapData(parsed);
          setIsCached(true);
          setSource("prebuilt");
          return;
        } catch {
          localStorage.removeItem(cacheKey);
        }
      }

      // Hit API
      setIsLoading(true);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Something went wrong");
          return;
        }

        const source = res.headers.get("X-Source") as
          | "prebuilt"
          | "assemble"
          | "generate"
          | null;

        setMapData(json.data);
        setSource(source);

        // Cache in localStorage
        try {
          localStorage.setItem(cacheKey, JSON.stringify(json.data));
        } catch {
          // localStorage full, ignore
        }
      } catch {
        setError("Failed to connect to the server");
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, setQuery, setMapData, setIsLoading, setIsCached, setSource, setError]
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
