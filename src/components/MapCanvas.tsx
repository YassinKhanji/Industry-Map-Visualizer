"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import type { Node, Edge, NodeMouseHandler } from "@xyflow/react";
import NodeCard, { CATEGORY_ACCENTS } from "./NodeCard";
import AutoExpandToggle from "./AutoExpandToggle";
import DetailPanel from "./DetailPanel";
import { buildFlowGraph, countNodesAtDepth, getIdsToDepth } from "@/lib/graphLayout";
import { useAppStore } from "@/lib/store";
import type { FlowNodeData } from "@/types";

const nodeTypes = { industryNode: NodeCard };

function MapCanvasInner() {
  const mapData = useAppStore((s) => s.mapData);
  const autoExpand = useAppStore((s) => s.autoExpand);
  const darkMode = useAppStore((s) => s.darkMode);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const hoveredNodeId = useAppStore((s) => s.hoveredNodeId);
  const focusNodeId = useAppStore((s) => s.focusNodeId);
  const setFocusNodeId = useAppStore((s) => s.setFocusNodeId);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { fitView, getNode, setCenter } = useReactFlow();

  // Calculate total nodes at depth 2 for the auto-expand guard
  const totalNodesAtDepth2 = useMemo(() => {
    if (!mapData) return 0;
    return countNodesAtDepth(mapData.rootNodes, 2);
  }, [mapData]);

  // Build graph when mapData, expandedIds, or autoExpand changes
  useEffect(() => {
    if (!mapData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Determine which nodes should be expanded
    let activeExpandedIds = expandedIds;

    if (autoExpand && totalNodesAtDepth2 <= 150) {
      // Auto-expand to depth 2
      const autoIds = getIdsToDepth(mapData.rootNodes, 2);
      activeExpandedIds = new Set([...expandedIds, ...autoIds]);
    }

    const { nodes: newNodes, edges: newEdges } = buildFlowGraph(
      mapData,
      activeExpandedIds
    );

    setNodes(newNodes);
    setEdges(newEdges);

    // Fit view after layout with a small delay for rendering
    setTimeout(() => {
      fitView({ duration: 400, padding: 0.15 });
    }, 50);
  }, [mapData, expandedIds, autoExpand, totalNodesAtDepth2, setNodes, setEdges, fitView]);

  // Edge highlighting: brighten edges connected to the active (hovered or selected) node
  const styledEdges = useMemo(() => {
    const activeId = hoveredNodeId || selectedNodeId;
    if (!activeId) return edges;

    const highlightColor = darkMode ? "#ffffff" : "#111827";

    return edges.map((e) => {
      const isConnected = e.source === activeId || e.target === activeId;
      if (!isConnected) return e;
      return {
        ...e,
        style: { ...e.style, stroke: highlightColor, strokeWidth: 2 },
        zIndex: 10,
      };
    });
  }, [edges, darkMode, hoveredNodeId, selectedNodeId]);

  // Pan & zoom to the focused node (triggered by profile matcher clicks, etc.)
  useEffect(() => {
    if (!focusNodeId) return;
    // Small delay so layout can settle if expanded
    const timer = setTimeout(() => {
      const n = getNode(focusNodeId);
      if (n) {
        setCenter(n.position.x + 90, n.position.y + 22, {
          duration: 500,
          zoom: 1.2,
        });
      }
      // Clear after focusing so re-clicking the same node works again
      setFocusNodeId(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [focusNodeId, getNode, setCenter, setFocusNodeId]);

  // Handle node click: toggle expand/collapse
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const data = node.data as unknown as FlowNodeData;
      if (!data.hasChildren) return;

      const willExpand = !expandedIds.has(node.id);

      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          // Collapse: remove this node and all descendants
          next.delete(node.id);
          removeDescendants(next, node.id, mapData!);
        } else {
          next.add(node.id);
        }
        return next;
      });

      // Auto-pan to the expanded node after layout settles
      if (willExpand) {
        setTimeout(() => {
          const n = getNode(node.id);
          if (n) {
            setCenter(n.position.x + 90, n.position.y + 22, {
              duration: 400,
              zoom: 1,
            });
          }
        }, 150);
      }
    },
    [mapData, expandedIds, getNode, setCenter]
  );

  // Collapse all
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  if (!mapData) return null;

  return (
    <div className="relative w-full h-full">
      <AutoExpandToggle
        totalNodesAtDepth2={totalNodesAtDepth2}
        onCollapseAll={handleCollapseAll}
      />
      {/* Hint */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-[11px] pointer-events-none select-none"
        style={{
          background: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
          color: darkMode ? "#9ca3af" : "#6b7280",
        }}
      >
        Right-click a node for details &amp; opportunities
      </div>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: darkMode ? "var(--background)" : "#ffffff" }}
        defaultEdgeOptions={{
          type: "default",
          style: { stroke: "var(--edge-dim)", strokeWidth: 1 },
        }}
      >
        <Controls
          showInteractive={false}
          className="!shadow-none"
        />
        <MiniMap
          nodeColor={(node) => {
            const cat = (node.data as Record<string, unknown>)?.category as string;
            return CATEGORY_ACCENTS[cat] || (darkMode ? "#4b5563" : "#9ca3af");
          }}
          maskColor={darkMode ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.12)"}
          className="!shadow-none minimap-enhanced"
          pannable
          zoomable
          style={{ width: 200, height: 140 }}
          nodeStrokeWidth={3}
        />
      </ReactFlow>
      <DetailPanel />
    </div>
  );
}

/**
 * Remove all descendant IDs from the expanded set when collapsing a node
 */
function removeDescendants(
  expandedIds: Set<string>,
  parentId: string,
  mapData: { rootNodes: Array<{ id: string; subNodes?: Array<unknown> }> }
) {
  function findAndRemove(
    nodes: Array<{ id: string; subNodes?: Array<unknown> }>
  ) {
    for (const node of nodes) {
      const n = node as { id: string; subNodes?: Array<{ id: string; subNodes?: Array<unknown> }> };
      if (n.id === parentId && n.subNodes) {
        for (const child of n.subNodes) {
          expandedIds.delete(child.id);
          if (child.subNodes) {
            removeDescendants(expandedIds, child.id, { rootNodes: n.subNodes });
          }
        }
        return;
      }
      if (n.subNodes) {
        findAndRemove(n.subNodes);
      }
    }
  }
  findAndRemove(mapData.rootNodes);
}

// Wrap with ReactFlowProvider
export default function MapCanvas() {
  return (
    <ReactFlowProvider>
      <MapCanvasInner />
    </ReactFlowProvider>
  );
}
