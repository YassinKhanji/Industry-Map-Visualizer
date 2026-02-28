import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { IndustryMap } from "@/types";

/* ──────── Config ──────── */
const MAX_MEMORY_ENTRIES = 100;
const FILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  data: IndustryMap;
  source: string;
  ts: number;
}

/* ──────── In-memory LRU (Map insertion order) ──────── */
const memoryCache = new Map<string, CacheEntry>();

function memGet(key: string): CacheEntry | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  // Move to end (most recently used)
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry;
}

function memSet(key: string, entry: CacheEntry) {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    // Delete oldest (first key)
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, entry);
}

/* ──────── File cache ──────── */
function getCacheDir(): string {
  // Vercel/serverless: use /tmp. Local dev: use .cache/ in project root
  const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";
  if (isVercel) return "/tmp/imv-cache";
  return join(process.cwd(), ".cache");
}

function filePath(key: string): string {
  return join(getCacheDir(), `${key}.json`);
}

function fileGet(key: string): CacheEntry | undefined {
  try {
    const fp = filePath(key);
    if (!existsSync(fp)) return undefined;
    const raw = readFileSync(fp, "utf-8");
    const entry: CacheEntry = JSON.parse(raw);
    // Check TTL
    if (Date.now() - entry.ts > FILE_TTL_MS) return undefined;
    return entry;
  } catch {
    return undefined;
  }
}

function fileSet(key: string, entry: CacheEntry) {
  try {
    const dir = getCacheDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath(key), JSON.stringify(entry));
  } catch {
    // Non-critical: log and continue
    console.warn(`[cache] Failed to write file cache for key: ${key}`);
  }
}

/* ──────── Normalize key ──────── */
export function cacheKey(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "-");
}

/* ──────── Public API ──────── */

export function cacheGet(query: string): CacheEntry | undefined {
  const key = cacheKey(query);

  // 1. Memory hit
  const mem = memGet(key);
  if (mem) return mem;

  // 2. File hit → promote to memory
  const file = fileGet(key);
  if (file) {
    memSet(key, file);
    return file;
  }

  return undefined;
}

export function cacheSet(
  query: string,
  data: IndustryMap,
  source: string
): void {
  const key = cacheKey(query);
  const entry: CacheEntry = { data, source, ts: Date.now() };
  memSet(key, entry);
  fileSet(key, entry);
}

/* ──────── Request deduplication ──────── */
const inFlight = new Map<string, Promise<IndustryMap>>();

export function dedup(
  query: string,
  generator: () => Promise<IndustryMap>
): Promise<IndustryMap> {
  const key = cacheKey(query);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = generator().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}
