/**
 * Offline script to generate industry block libraries using GPT-4o.
 * Run with: npm run generate-blocks
 *
 * This generates comprehensive, pre-built JSON files for seeded industries.
 * Each file is then reviewed, edited if needed, and committed.
 */

import OpenAI from "openai";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is required.");
  console.error("Set it with: $env:OPENAI_API_KEY = 'sk-...'");
  process.exit(1);
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

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

// Industries to seed (add more as needed)
const SEED_INDUSTRIES = [
  {
    slug: "agriculture",
    name: "Agriculture & Food Production",
    description:
      "Farm-to-table value chain: seeds, farming, harvesting, processing, distribution, retail, consumer",
  },
  {
    slug: "healthcare",
    name: "Healthcare & Pharmaceuticals",
    description:
      "Drug discovery through patient care: R&D, clinical trials, manufacturing, distribution, hospitals, patient",
  },
  {
    slug: "technology-saas",
    name: "Technology / SaaS",
    description:
      "Software product lifecycle: ideation, development, cloud infrastructure, distribution, customer success",
  },
  {
    slug: "real-estate",
    name: "Real Estate & Construction",
    description:
      "Land acquisition through property management: development, construction, financing, sales, management",
  },
  {
    slug: "manufacturing",
    name: "Manufacturing & Industrial",
    description:
      "Raw materials through finished goods: sourcing, production, quality, logistics, distribution",
  },
];

async function generateBlocks(industry: {
  slug: string;
  name: string;
  description: string;
}) {
  console.log(`\nGenerating blocks for: ${industry.name}...`);

  const prompt = `Generate a complete, comprehensive industry value chain map for: "${industry.name}"

Context: ${industry.description}

Requirements:
1. Create 10-18 root-level nodes covering the FULL end-to-end value chain
2. Each root node must have 4-10 subNodes
3. Some subNodes may have their own subNodes (max 3 levels deep total)
4. Cover ALL applicable categories: ${CATEGORIES.join(", ")}
5. Every label must be 1-3 words maximum
6. Include meaningful descriptions (1 sentence each)
7. Define edges showing value flow:
   - Main flow: upstream → production → processing → distribution → customer
   - Lateral connections: support, regulation, technology connect to main flow
8. Every node needs a unique, kebab-case id (e.g., "raw-materials", "quality-control")
9. Be comprehensive — include every significant actor, process, system, and role in this industry

Return ONLY valid JSON matching this exact schema:
{
  "industry": "string — full industry name",
  "rootNodes": [
    {
      "id": "string — unique kebab-case",
      "label": "string — 1-3 words",
      "category": "string — one of the categories listed above",
      "description": "string — 1 sentence",
      "subNodes": [
        {
          "id": "string",
          "label": "string — 1-3 words",
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

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are an expert industry analyst and systems architect. Generate comprehensive, accurate industry value chain maps. Return ONLY valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 8000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error(`  Failed: No response for ${industry.name}`);
    return;
  }

  try {
    const parsed = JSON.parse(content);

    // Basic validation
    if (!parsed.rootNodes || !Array.isArray(parsed.rootNodes)) {
      console.error(`  Failed: Invalid structure for ${industry.name}`);
      return;
    }

    // Count nodes
    let nodeCount = 0;
    function count(nodes: unknown[]) {
      for (const n of nodes) {
        nodeCount++;
        const node = n as { subNodes?: unknown[] };
        if (node.subNodes) count(node.subNodes);
      }
    }
    count(parsed.rootNodes);

    // Save
    const outputDir = join(process.cwd(), "src", "data", "blocks");
    mkdirSync(outputDir, { recursive: true });

    const outputPath = join(outputDir, `${industry.slug}.json`);
    writeFileSync(outputPath, JSON.stringify(parsed, null, 2));

    console.log(
      `  ✓ Generated ${parsed.rootNodes.length} root nodes, ${nodeCount} total nodes`
    );
    console.log(`  Saved to: src/data/blocks/${industry.slug}.json`);

    // Update aliases
    return {
      slug: industry.slug,
      name: industry.name,
    };
  } catch (e) {
    console.error(`  Failed to parse JSON for ${industry.name}:`, e);
  }
}

async function main() {
  console.log("=== Industry Block Generator ===");
  console.log(`Generating blocks for ${SEED_INDUSTRIES.length} industries...\n`);

  const generated: string[] = [];

  for (const industry of SEED_INDUSTRIES) {
    const result = await generateBlocks(industry);
    if (result) {
      generated.push(result.slug);
    }
    // Small delay between API calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n=== Summary ===");
  console.log(`Successfully generated: ${generated.length}/${SEED_INDUSTRIES.length}`);
  console.log("Industries:", generated.join(", "));
  console.log(
    "\nNext steps:"
  );
  console.log("1. Review generated JSON files in src/data/blocks/");
  console.log("2. Update src/data/aliases.json with aliases for each new industry");
  console.log("3. Commit the files");
}

main().catch(console.error);
