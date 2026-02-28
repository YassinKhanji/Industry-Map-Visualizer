"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/types";

const CATEGORY_ACCENTS: Record<string, string> = {
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

function NodeCard({ data }: NodeProps) {
  const nodeData = data as unknown as FlowNodeData;
  const accentColor = CATEGORY_ACCENTS[nodeData.category] || "#2563eb";

  return (
    <div
      className="group relative cursor-pointer select-none"
      style={{ minWidth: 140 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1.5 !h-1.5 !bg-gray-300 !border-0 !-left-1"
      />

      <div
        className="px-4 py-2.5 bg-white border border-gray-200 rounded transition-all duration-200 hover:border-gray-400"
        style={{
          borderLeftWidth: 3,
          borderLeftColor: accentColor,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
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
        className="!w-1.5 !h-1.5 !bg-gray-300 !border-0 !-right-1"
      />
    </div>
  );
}

export default memo(NodeCard);
