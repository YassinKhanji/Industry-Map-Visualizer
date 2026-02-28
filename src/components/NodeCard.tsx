"use client";

import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/types";
import { useAppStore } from "@/lib/store";

export const CATEGORY_ACCENTS: Record<string, string> = {
  "upstream-inputs": "#6366f1",
  "core-production": "#2563eb",
  "processing": "#0891b2",
  "distribution": "#059669",
  "customer-facing": "#d97706",
  "support-ops": "#6b7280",
  "regulation": "#dc2626",
  "technology": "#7c3aed",
  "roles": "#4f46e5",
  "alternative-assets": "#0d9488",
  "esg-stewardship": "#16a34a",
  "private-wealth": "#ca8a04",
  "systemic-oversight": "#b91c1c",
};

export const CATEGORY_LABELS: Record<string, string> = {
  "upstream-inputs": "Upstream Inputs",
  "core-production": "Core Production",
  "processing": "Processing",
  "distribution": "Distribution",
  "customer-facing": "Customer Facing",
  "support-ops": "Support & Ops",
  "regulation": "Regulation",
  "technology": "Technology",
  "roles": "Key Roles",
  "alternative-assets": "Alternative Assets",
  "esg-stewardship": "ESG & Stewardship",
  "private-wealth": "Private Wealth",
  "systemic-oversight": "Systemic Oversight",
};

function NodeCard({ data, id }: NodeProps) {
  const nodeData = data as unknown as FlowNodeData;
  const darkMode = useAppStore((s) => s.darkMode);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);
  const accentColor = CATEGORY_ACCENTS[nodeData.category] || "#2563eb";
  const isLeaf = !nodeData.hasChildren;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedNodeId(id);
    },
    [id, setSelectedNodeId]
  );

  return (
    <div
      className="group relative select-none"
      style={{ minWidth: 140, cursor: "pointer" }}
      onContextMenu={handleContextMenu}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1.5 !h-1.5 !border-0 !-left-1"
        style={{
          backgroundColor: isLeaf ? "#111827" : "#d1d5db",
        }}
      />

      <div
        className="px-4 py-2.5 rounded transition-all duration-200"
        style={{
          backgroundColor: darkMode ? "var(--card-bg)" : "#ffffff",
          border: isLeaf
            ? "1.5px solid #111827"
            : darkMode
            ? "1px solid var(--border)"
            : "1px solid #e5e7eb",
          borderLeftWidth: isLeaf ? 1.5 : 3,
          borderLeftColor: isLeaf ? "#111827" : accentColor,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium whitespace-nowrap"
            style={{ color: darkMode ? "#e5e7eb" : "#111827" }}
          >
            {nodeData.label}
          </span>
          {nodeData.hasChildren && (
            <span
              className="flex-shrink-0 w-1.5 h-1.5 rounded-full transition-transform duration-200"
              style={{
                backgroundColor: accentColor,
                transform: nodeData.isExpanded ? "scale(1.3)" : "scale(1)",
              }}
            />
          )}
        </div>

        {/* Tooltip on hover */}
        {nodeData.description && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded max-w-[220px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-normal leading-relaxed">
            {nodeData.description}
            <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-1.5 !h-1.5 !border-0 !-right-1"
        style={{
          backgroundColor: isLeaf ? "#111827" : "#d1d5db",
        }}
      />
    </div>
  );
}

export default memo(NodeCard);
