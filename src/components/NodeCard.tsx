"use client";

import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@/types";
import { useAppStore } from "@/lib/store";

export const CATEGORY_ACCENTS: Record<string, string> = {
  capital: "#6366f1",
  inputs: "#2563eb",
  production: "#0891b2",
  processing: "#059669",
  distribution: "#d97706",
  customer: "#e11d48",
  compliance: "#dc2626",
  infrastructure: "#7c3aed",
};

export const CATEGORY_LABELS: Record<string, string> = {
  capital: "Capital",
  inputs: "Inputs",
  production: "Production",
  processing: "Processing",
  distribution: "Distribution",
  customer: "Customer",
  compliance: "Compliance",
  infrastructure: "Infrastructure",
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

  // Compute vertically-spread handle offsets so parallel edges fan out
  const MAX_SPREAD = 30; // max ±px from center
  function offsets(count: number): number[] {
    if (count <= 1) return [0];
    const totalSpread = Math.min(MAX_SPREAD * 2, (count - 1) * 8);
    return Array.from({ length: count }, (_, i) =>
      (i / (count - 1) - 0.5) * totalSpread
    );
  }

  const srcCount = nodeData.sourceHandleCount || 1;
  const tgtCount = nodeData.targetHandleCount || 1;
  const srcOffsets = offsets(srcCount);
  const tgtOffsets = offsets(tgtCount);

  return (
    <div
      className="group relative select-none"
      style={{ minWidth: 140, cursor: "pointer" }}
      onContextMenu={handleContextMenu}
    >
      {/* Target handles (left side) */}
      {tgtOffsets.map((off, i) => (
        <Handle
          key={`target-${i}`}
          id={`target-${i}`}
          type="target"
          position={Position.Left}
          className="!w-1.5 !h-1.5 !border-0 !-left-1"
          style={{
            backgroundColor: isLeaf ? "#111827" : "#d1d5db",
            top: `calc(50% + ${off}px)`,
          }}
        />
      ))}

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

        {/* Tooltip on hover — show objective if available, else description */}
        {(nodeData.objective || nodeData.description) && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded max-w-[220px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-normal leading-relaxed">
            {nodeData.objective || nodeData.description}
            <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        )}
      </div>

      {/* Source handles (right side) */}
      {srcOffsets.map((off, i) => (
        <Handle
          key={`source-${i}`}
          id={`source-${i}`}
          type="source"
          position={Position.Right}
          className="!w-1.5 !h-1.5 !border-0 !-right-1"
          style={{
            backgroundColor: isLeaf ? "#111827" : "#d1d5db",
            top: `calc(50% + ${off}px)`,
          }}
        />
      ))}
    </div>
  );
}

export default memo(NodeCard);
