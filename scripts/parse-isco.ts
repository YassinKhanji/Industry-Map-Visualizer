/**
 * One-time script: parse "ISCO-08 EN Structure and definitions.xlsx"
 * and emit a TaxonomyNode[] tree (JSON) for taxonomy-jobs.ts.
 *
 * Usage:  npx tsx scripts/parse-isco.ts
 */
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
  searchQuery?: string;
}

const xlsxPath = resolve(__dirname, "../ISCO-08 EN Structure and definitions.xlsx");
const outPath = resolve(__dirname, "isco-output.json");

const buf = readFileSync(xlsxPath);
const wb = XLSX.read(buf, { type: "buffer" });

// Typically the first sheet has the structure
const ws = wb.Sheets[wb.SheetNames[0]];
const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log(`Total rows: ${rows.length}`);
console.log("First 5 rows:", rows.slice(0, 5));

// We expect columns: ISCO 08 Code, Title EN, ...
// Detect columns
const header = rows[0] as string[];
console.log("Header:", header);

// Find code and title columns
let codeCol = -1;
let titleCol = -1;
for (let i = 0; i < header.length; i++) {
  const h = String(header[i] ?? "").toLowerCase();
  if (h.includes("code") || h.includes("isco")) codeCol = i;
  if (h.includes("title") || h.includes("name")) titleCol = i;
}
if (codeCol === -1) codeCol = 0;
if (titleCol === -1) titleCol = 1;
console.log(`Using columns: code=${codeCol}, title=${titleCol}`);

interface RawEntry {
  code: string;
  title: string;
  level: number; // 1=major, 2=sub-major, 3=minor, 4=unit
}

const entries: RawEntry[] = [];

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || !row[codeCol]) continue;
  const rawCode = String(row[codeCol]).trim();
  const title = String(row[titleCol] ?? "").trim();
  if (!rawCode || !title) continue;

  // ISCO codes: 1 digit = major, 2 = sub-major, 3 = minor, 4 = unit
  const code = rawCode.replace(/\D/g, "");
  if (!code) continue;
  const level = code.length;
  if (level < 1 || level > 4) continue;

  entries.push({ code, title, level });
}

console.log(`Parsed ${entries.length} entries`);
console.log(
  `  Major: ${entries.filter((e) => e.level === 1).length}`,
  `  Sub-major: ${entries.filter((e) => e.level === 2).length}`,
  `  Minor: ${entries.filter((e) => e.level === 3).length}`,
  `  Unit: ${entries.filter((e) => e.level === 4).length}`
);

// Build tree
const majors: TaxonomyNode[] = [];
let currentMajor: TaxonomyNode | null = null;
let currentSubMajor: TaxonomyNode | null = null;
let currentMinor: TaxonomyNode | null = null;

for (const entry of entries) {
  const node: TaxonomyNode = {
    id: `isco-${entry.code}`,
    label: `${entry.code} - ${entry.title}`,
  };

  if (entry.level === 1) {
    node.children = [];
    currentMajor = node;
    currentSubMajor = null;
    currentMinor = null;
    majors.push(node);
  } else if (entry.level === 2) {
    node.children = [];
    currentSubMajor = node;
    currentMinor = null;
    if (currentMajor) {
      currentMajor.children = currentMajor.children ?? [];
      currentMajor.children.push(node);
    }
  } else if (entry.level === 3) {
    node.children = [];
    currentMinor = node;
    if (currentSubMajor) {
      currentSubMajor.children = currentSubMajor.children ?? [];
      currentSubMajor.children.push(node);
    }
  } else if (entry.level === 4) {
    // Leaf — add searchQuery
    node.searchQuery = entry.title;
    if (currentMinor) {
      currentMinor.children = currentMinor.children ?? [];
      currentMinor.children.push(node);
    }
  }
}

// Remove empty children arrays
function cleanEmpty(n: TaxonomyNode): void {
  if (n.children) {
    if (n.children.length === 0) {
      delete n.children;
      // Non-leaf without children => treat as leaf
      if (!n.searchQuery) {
        n.searchQuery = n.label.replace(/^\d+\s*-\s*/, "");
      }
    } else {
      n.children.forEach(cleanEmpty);
    }
  }
}
majors.forEach(cleanEmpty);

writeFileSync(outPath, JSON.stringify(majors, null, 2), "utf-8");
console.log(`\nWrote ${outPath}`);
console.log(`Top-level groups: ${majors.length}`);
