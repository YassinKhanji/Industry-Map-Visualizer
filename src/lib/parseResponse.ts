import type { IndustryMap } from "@/types";

/**
 * Generate a fallback skeleton map when everything fails
 */
export function fallbackMap(query: string): IndustryMap {
  return {
    industry: query,
    rootNodes: [
      {
        id: "capital",
        label: "Capital",
        category: "capital",
        description: "Funding, investment, and financial resources",
        objective: "Provide financial resources to enable operations",
      },
      {
        id: "inputs",
        label: "Inputs",
        category: "inputs",
        description: "Raw materials, data, and supply chain resources",
        objective: "Source and deliver essential inputs for production",
      },
      {
        id: "production",
        label: "Production",
        category: "production",
        description: "Primary transformation or service delivery",
        objective: "Transform inputs into core products or services",
      },
      {
        id: "processing",
        label: "Processing",
        category: "processing",
        description: "Quality control, packaging, and post-production",
        objective: "Refine and prepare output for distribution",
      },
      {
        id: "distribution",
        label: "Distribution",
        category: "distribution",
        description: "Channels to reach the end customer",
        objective: "Deliver products or services to customer segments",
      },
      {
        id: "customer",
        label: "Customer",
        category: "customer",
        description: "End users and their experience",
        objective: "Acquire, serve, and retain customers",
      },
      {
        id: "compliance",
        label: "Compliance",
        category: "compliance",
        description: "Legal, regulatory, and standards requirements",
        objective: "Ensure operations meet regulatory obligations",
      },
      {
        id: "infrastructure",
        label: "Infrastructure",
        category: "infrastructure",
        description: "Technology, systems, and operational backbone",
        objective: "Provide shared platforms and tools for all functions",
      },
    ],
    edges: [
      { source: "capital", target: "inputs" },
      { source: "inputs", target: "production" },
      { source: "production", target: "processing" },
      { source: "processing", target: "distribution" },
      { source: "distribution", target: "customer" },
      { source: "compliance", target: "production" },
      { source: "compliance", target: "distribution" },
      { source: "infrastructure", target: "production" },
      { source: "infrastructure", target: "distribution" },
      { source: "capital", target: "production" },
    ],
  };
}
