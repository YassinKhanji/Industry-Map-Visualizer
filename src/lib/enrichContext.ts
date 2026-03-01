import type { IndustryBlock, IndustryMap } from "@/types";
import type { ArchetypeProfile } from "./archetypes";

/**
 * Connection info available in DetailPanel.
 */
export interface ConnectionInfo {
  label: string;
  direction: "inbound" | "outbound";
}

/**
 * Full context payload sent to the enrichment pipeline.
 */
export interface EnrichPayload {
  // Node basics
  nodeId: string;
  label: string;
  category: string;
  description?: string;
  objective?: string;
  revenueModel?: string;
  // Industry context
  industry: string;
  jurisdiction?: string;
  archetype?: string;
  archetypeDescription?: string;
  // Structural context
  connections: ConnectionInfo[];
  parent?: { label: string; category: string; objective?: string };
  children?: { label: string; category: string }[];
  // Existing metadata (for the AI to verify/correct)
  existingKeyActors?: string[];
  existingKeyTools?: string[];
  existingPainPoints?: string[];
  existingCostDrivers?: string[];
  existingRegulatoryNotes?: string;
  existingOpportunities?: string[];
}

/**
 * Build the full enrichment payload from DetailPanel data.
 */
export function buildEnrichPayload(
  block: IndustryBlock,
  connections: ConnectionInfo[],
  parentBlock: IndustryBlock | undefined,
  mapData: IndustryMap,
  archetypeProfile?: ArchetypeProfile
): EnrichPayload {
  return {
    nodeId: block.id,
    label: block.label,
    category: block.category,
    description: block.description,
    objective: block.objective,
    revenueModel: block.revenueModel,
    industry: mapData.industry,
    jurisdiction: mapData.jurisdiction,
    archetype: mapData.archetype,
    archetypeDescription: archetypeProfile?.description,
    connections: connections.map((c) => ({
      label: c.label,
      direction: c.direction,
    })),
    parent: parentBlock
      ? {
          label: parentBlock.label,
          category: parentBlock.category,
          objective: parentBlock.objective,
        }
      : undefined,
    children: block.subNodes?.map((s) => ({
      label: s.label,
      category: s.category,
    })),
    existingKeyActors: block.keyActors,
    existingKeyTools: block.keyTools,
    existingPainPoints: block.painPoints,
    existingCostDrivers: block.costDrivers,
    existingRegulatoryNotes: block.regulatoryNotes,
    existingOpportunities: block.opportunities?.map((o) => `${o.title}: ${o.description}`),
  };
}
