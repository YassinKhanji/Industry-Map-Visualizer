import OpenAI from "openai";
import type { IndustryMap, IndustryBlock } from "@/types";
import { parseMapResponse, fallbackMap } from "./parseResponse";

const CATEGORIES = [
  "upstream-inputs",
  "core-production",
  "processing",
  "distribution",
  "customer-facing",
  "support-ops",
  "regulation",
  "technology",
  "roles",
  "alternative-assets",
  "esg-stewardship",
  "private-wealth",
  "systemic-oversight",
];

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Mode A: Assemble from existing blocks
 * Sends top-level block labels to the LLM, asks it to select and arrange
 */
export async function assembleFromBlocks(
  query: string,
  blocks: IndustryMap
): Promise<IndustryMap> {
  const client = getClient();

  // Only send top-level labels + categories (not full trees) to save tokens
  const blockIndex = blocks.rootNodes.map((n) => ({
    id: n.id,
    label: n.label,
    category: n.category,
    subNodeCount: n.subNodes?.length ?? 0,
  }));

  const prompt = `You are an industry mapping engine. Given these prebuilt blocks from the "${blocks.industry}" industry, select and arrange the most relevant ones into a value chain map for: "${query}".

Available blocks:
${JSON.stringify(blockIndex, null, 2)}

Instructions:
- Select the blocks most relevant to "${query}"
- You may add up to 5 NEW root-level blocks if important aspects are missing
- For new blocks, include 3-6 subNodes each with id, label, category, description
- Arrange edges to show the flow from upstream → production → processing → distribution → customer
- Support, regulation, technology, and roles connect laterally to the main flow
- Keep all labels to 1-3 words maximum
- Return ONLY valid JSON matching this exact structure:

{
  "industry": "string",
  "rootNodes": [
    {
      "id": "string",
      "label": "string (1-3 words)",
      "category": "one of: ${CATEGORIES.join(", ")}",
      "description": "string",
      "subNodes": [
        {
          "id": "string",
          "label": "string (1-3 words)",
          "category": "string",
          "description": "string"
        }
      ]
    }
  ],
  "edges": [
    { "source": "node-id", "target": "node-id" }
  ]
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a precise industry mapping engine. Return ONLY valid JSON. No explanations, no markdown.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return blocks; // fall back to full prebuilt data

    const parsed = parseMapResponse(content);
    if (!parsed) return blocks;

    // Merge: for selected blocks that exist in prebuilt, use the full prebuilt subNodes
    const prebuiltMap = new Map<string, IndustryBlock>();
    for (const node of blocks.rootNodes) {
      prebuiltMap.set(node.id, node);
    }

    const enrichedNodes = parsed.rootNodes.map((node) => {
      const prebuilt = prebuiltMap.get(node.id);
      if (prebuilt) {
        return { ...prebuilt, ...node, subNodes: prebuilt.subNodes };
      }
      return node;
    });

    return { ...parsed, rootNodes: enrichedNodes };
  } catch (error) {
    console.error("assembleFromBlocks failed:", error);
    return blocks; // fall back to full prebuilt data
  }
}

/**
 * Mode B: Generate from scratch for unknown industries
 */
export async function generateFromScratch(
  query: string
): Promise<IndustryMap> {
  const client = getClient();

  const prompt = `You are an industry mapping engine. Generate a complete end-to-end value chain map for: "${query}".

The map must cover ALL of these categories (include at least one root node per category that applies):
1. upstream-inputs — Raw materials, data sources, suppliers
2. core-production — Primary transformation, manufacturing, or service creation
3. processing — Operations, quality control, order management, logistics
4. distribution — Channels to reach the end customer
5. customer-facing — End users, their experience, and touchpoints
6. support-ops — Administrative backbone, HR, IT, legal, finance
7. regulation — Laws, standards, regulatory bodies, compliance
8. technology — Systems, platforms, tools enabling the industry
9. roles — Key people and job functions
10. alternative-assets (if applicable)
11. esg-stewardship (if applicable)
12. private-wealth (if applicable)
13. systemic-oversight (if applicable)

Instructions:
- Create 8-12 root-level nodes covering the full value chain
- Each root node should have 3-6 subNodes
- SubNodes can optionally have their own subNodes (max 3 levels deep)
- Keep all labels to 1-3 words maximum
- Define edges showing how value flows: upstream → production → processing → distribution → customer
- Support, regulation, technology connect laterally to the main flow
- Be comprehensive but not redundant

Return ONLY valid JSON matching this structure:
{
  "industry": "string",
  "rootNodes": [
    {
      "id": "string",
      "label": "string (1-3 words)",
      "category": "one of: ${CATEGORIES.join(", ")}",
      "description": "string",
      "subNodes": [
        {
          "id": "string",
          "label": "string (1-3 words)",
          "category": "string",
          "description": "string",
          "subNodes": []
        }
      ]
    }
  ],
  "edges": [
    { "source": "node-id", "target": "node-id" }
  ]
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a precise industry mapping engine. Return ONLY valid JSON. No explanations, no markdown, no code blocks.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallbackMap(query);

    const parsed = parseMapResponse(content);
    if (!parsed) {
      // Retry once with stricter prompt
      return await retryGeneration(query);
    }

    return parsed;
  } catch (error) {
    console.error("generateFromScratch failed:", error);
    return fallbackMap(query);
  }
}

/**
 * Retry with a stricter, example-based prompt
 */
async function retryGeneration(query: string): Promise<IndustryMap> {
  const client = getClient();

  const prompt = `Generate an industry value chain map for "${query}" as JSON.

Example of the exact format required:
{
  "industry": "Example Industry",
  "rootNodes": [
    {
      "id": "raw-materials",
      "label": "Raw Materials",
      "category": "upstream-inputs",
      "description": "Source materials",
      "subNodes": [
        {
          "id": "supplier-a",
          "label": "Supplier A",
          "category": "upstream-inputs",
          "description": "Primary supplier"
        }
      ]
    }
  ],
  "edges": [
    { "source": "raw-materials", "target": "manufacturing" }
  ]
}

Now generate the complete map for "${query}" with 8-12 root nodes, each with 3-6 subNodes. Categories: upstream-inputs, core-production, processing, distribution, customer-facing, support-ops, regulation, technology, roles. Labels: 1-3 words max.`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON. Nothing else.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallbackMap(query);

    const parsed = parseMapResponse(content);
    return parsed ?? fallbackMap(query);
  } catch {
    return fallbackMap(query);
  }
}
