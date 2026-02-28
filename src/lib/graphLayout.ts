import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { IndustryMap, IndustryBlock, FlowNodeData } from "@/types";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 44;
const RANK_SEP = 80;
const NODE_SEP = 30;

/**
 * Convert IndustryMap data into React Flow nodes and edges,
 * with Dagre auto-layout (left-to-right).
 *
 * @param mapData - The industry map
 * @param expandedIds - Set of node IDs that are currently expanded
 * @param maxDepth - Maximum depth to auto-expand (0 = root only)
 */
export function buildFlowGraph(
  mapData: IndustryMap,
  expandedIds: Set<string>,
  maxDepth: number = 0
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const flowNodes: Node<FlowNodeData>[] = [];
  const flowEdges: Edge[] = [];

  // Recursively add nodes
  function addNodes(
    blocks: IndustryBlock[],
    depth: number,
    parentId?: string
  ) {
    for (const block of blocks) {
      const hasChildren = !!block.subNodes && block.subNodes.length > 0;
      const isExpanded = expandedIds.has(block.id);
      const shouldShow =
        depth === 0 || (parentId && expandedIds.has(parentId));

      if (!shouldShow && depth > 0) continue;

      flowNodes.push({
        id: block.id,
        type: "industryNode",
        position: { x: 0, y: 0 }, // Dagre will set this
        data: {
          label: block.label,
          category: block.category,
          description: block.description,
          hasChildren,
          isExpanded,
          depth,
          parentId,
        },
      });

      // If expanded, add children and edges from parent to children
      if (hasChildren && isExpanded && block.subNodes) {
        for (const child of block.subNodes) {
          flowEdges.push({
            id: `${block.id}->${child.id}`,
            source: block.id,
            target: child.id,
            type: "default",
            style: { stroke: "#d1d5db", strokeWidth: 1 },
            animated: false,
          });
        }
        addNodes(block.subNodes, depth + 1, block.id);
      }
    }
  }

  addNodes(mapData.rootNodes, 0);

  // Add top-level edges from the map data
  const nodeIdSet = new Set(flowNodes.map((n) => n.id));
  for (const edge of mapData.edges) {
    if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
      flowEdges.push({
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: "default",
        style: { stroke: "#d1d5db", strokeWidth: 1.2 },
        animated: false,
      });
    }
  }

  // Apply Dagre layout
  return applyDagreLayout(flowNodes, flowEdges);
}

/**
 * Apply Dagre layout algorithm to position nodes left-to-right
 */
function applyDagreLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[]
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Count total visible nodes at a given max depth
 */
export function countNodesAtDepth(
  blocks: IndustryBlock[],
  maxDepth: number,
  currentDepth: number = 0
): number {
  let count = 0;
  for (const block of blocks) {
    count++;
    if (block.subNodes && currentDepth < maxDepth) {
      count += countNodesAtDepth(block.subNodes, maxDepth, currentDepth + 1);
    }
  }
  return count;
}

/**
 * Get all node IDs up to a certain depth (for auto-expand)
 */
export function getIdsToDepth(
  blocks: IndustryBlock[],
  maxDepth: number,
  currentDepth: number = 0
): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (currentDepth < maxDepth && block.subNodes && block.subNodes.length > 0) {
      ids.add(block.id);
      const childIds = getIdsToDepth(block.subNodes, maxDepth, currentDepth + 1);
      childIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}
