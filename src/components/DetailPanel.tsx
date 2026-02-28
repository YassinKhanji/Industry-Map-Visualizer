"use client";

import { useCallback, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { CATEGORY_ACCENTS, CATEGORY_LABELS } from "./NodeCard";
import type { IndustryBlock, IndustryMap, MapEdge, Category } from "@/types";

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

function collectAllIds(blocks: IndustryBlock[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    ids.push(b.id);
    if (b.subNodes) ids.push(...collectAllIds(b.subNodes));
  }
  return ids;
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

/** For a given category, return representative example operations. */
function exampleOps(category: Category): string[] {
  const map: Record<string, string[]> = {
    "upstream-inputs": [
      "Capital sourcing & allocation",
      "Raw material procurement",
      "Input supply chain management",
    ],
    "core-production": [
      "Product design & structuring",
      "Manufacturing / underwriting",
      "Quality assurance & testing",
    ],
    processing: [
      "Transaction processing",
      "Settlement & clearing",
      "Record keeping & reconciliation",
    ],
    distribution: [
      "Wholesale distribution",
      "Retail channel management",
      "Platform & marketplace integration",
    ],
    "customer-facing": [
      "Client onboarding (KYC/AML)",
      "Advisory & consultation",
      "Relationship management",
    ],
    "support-ops": [
      "Operations & middle-office",
      "Finance & accounting",
      "HR & talent management",
    ],
    regulation: [
      "License & registration management",
      "Regulatory reporting",
      "Compliance monitoring & audit",
    ],
    technology: [
      "Core system architecture",
      "Data engineering & analytics",
      "Cybersecurity & resilience",
    ],
    roles: [
      "Industry-specific specialists",
      "Cross-functional leadership",
      "External advisors & auditors",
    ],
    "alternative-assets": [
      "Fund structuring & launch",
      "Portfolio management",
      "Investor relations & reporting",
    ],
    "esg-stewardship": [
      "ESG scoring & reporting",
      "Impact measurement",
      "Stewardship & engagement",
    ],
    "private-wealth": [
      "Wealth planning & advisory",
      "Portfolio construction",
      "Trust & estate administration",
    ],
    "systemic-oversight": [
      "Macro-prudential monitoring",
      "Stress-testing frameworks",
      "Systemic risk assessment",
    ],
  };
  return map[category] || ["Specialised operations", "Coordination & management"];
}

/** Common tools / platforms per category */
function commonTools(category: Category): string[] {
  const map: Record<string, string[]> = {
    "upstream-inputs": ["Bloomberg Terminal", "Refinitiv Eikon", "SAP"],
    "core-production": ["Calypso", "Murex", "FIS"],
    processing: ["SWIFT", "DTCC", "Broadridge"],
    distribution: ["Salesforce", "Fidelity WealthCentral", "iShares"],
    "customer-facing": ["Salesforce CRM", "Temenos", "nCino"],
    "support-ops": ["ServiceNow", "Workday", "Oracle ERP"],
    regulation: ["AxiomSL", "Wolters Kluwer", "NICE Actimize"],
    technology: ["AWS / Azure", "Snowflake", "Splunk"],
    roles: ["LinkedIn Recruiter", "Workday HCM", "Greenhouse"],
    "alternative-assets": ["Allvue", "eFront", "Carta"],
    "esg-stewardship": ["MSCI ESG", "Sustainalytics", "CDP"],
    "private-wealth": ["Addepar", "Black Diamond", "eMoney"],
    "systemic-oversight": ["FedWire", "BIS statistics", "IMF SDDS"],
  };
  return map[category] || [];
}

/* ──────── component ──────── */

interface Connection {
  id: string;
  label: string;
  direction: "inbound" | "outbound";
  reason?: string;
}

export default function DetailPanel() {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);
  const mapData = useAppStore((s) => s.mapData);
  const darkMode = useAppStore((s) => s.darkMode);

  const close = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);

  const { block, connections, parentBlock } = useMemo(() => {
    if (!mapData || !selectedNodeId)
      return { block: undefined, connections: [] as Connection[], parentBlock: undefined };

    const block = findBlock(mapData.rootNodes, selectedNodeId);
    const parentBlock = findParentBlock(mapData.rootNodes, selectedNodeId);

    // Build a label lookup from all blocks
    const allIds = collectAllIds(mapData.rootNodes);
    const labelMap = new Map<string, string>();
    function buildLabelMap(nodes: IndustryBlock[]) {
      for (const n of nodes) {
        labelMap.set(n.id, n.label);
        if (n.subNodes) buildLabelMap(n.subNodes);
      }
    }
    buildLabelMap(mapData.rootNodes);

    // Find connections from edges
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
  const ops = exampleOps(block.category);
  const tools = commonTools(block.category);
  const subCount = block.subNodes?.length || 0;

  return (
    <>
      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 detail-panel-enter detail-scrollbar"
        style={{
          width: 340,
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
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: accent }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: accent }}
              >
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
            style={{ color: "var(--muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Description */}
          {block.description && (
            <div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                {block.description}
              </p>
            </div>
          )}

          {/* Parent */}
          {parentBlock && (
            <div>
              <h3
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--muted)" }}
              >
                Parent
              </h3>
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
              <h3
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--muted)" }}
              >
                Sub-components ({subCount})
              </h3>
              <div className="space-y-1">
                {block.subNodes!.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedNodeId(sub.id)}
                    className="block w-full text-left px-3 py-1.5 rounded text-sm transition-colors"
                    style={{
                      color: darkMode ? "#d1d5db" : "#374151",
                      background: darkMode ? "rgba(255,255,255,0.03)" : "#f9fafb",
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
              <h3
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--muted)" }}
              >
                Connections ({connections.length})
              </h3>
              <div className="space-y-1.5">
                {connections.map((conn) => (
                  <div
                    key={`${conn.direction}-${conn.id}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-sm"
                    style={{
                      background: darkMode ? "rgba(255,255,255,0.03)" : "#f9fafb",
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

          {/* Example operations */}
          <div>
            <h3
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--muted)" }}
            >
              Example Operations
            </h3>
            <ul className="space-y-1">
              {ops.map((op) => (
                <li
                  key={op}
                  className="text-sm flex items-start gap-2"
                  style={{ color: darkMode ? "#d1d5db" : "#374151" }}
                >
                  <span style={{ color: accent }} className="mt-0.5">
                    •
                  </span>
                  {op}
                </li>
              ))}
            </ul>
          </div>

          {/* Common tools */}
          {tools.length > 0 && (
            <div>
              <h3
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--muted)" }}
              >
                Common Tools
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-1 text-xs rounded"
                    style={{
                      background: darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6",
                      color: darkMode ? "#9ca3af" : "#6b7280",
                    }}
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div
            className="pt-3 text-[11px] space-y-1"
            style={{
              borderTop: `1px solid var(--border)`,
              color: "var(--muted)",
            }}
          >
            <div>ID: {block.id}</div>
            <div>Depth: {(block as unknown as { depth?: number }).depth ?? "—"}</div>
            <div className="opacity-60 mt-2">Right-click another node to switch</div>
          </div>
        </div>
      </div>
    </>
  );
}
