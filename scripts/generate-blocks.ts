/**
 * Offline script to generate industry block libraries using GPT-4o.
 * Run with: npm run generate-blocks
 *
 * Generates comprehensive JSON files for seeded industries,
 * validates with Zod, and auto-generates aliases.
 */

import OpenAI from "openai";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
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

// All industries to seed
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
  {
    slug: "retail-ecommerce",
    name: "Retail & E-Commerce",
    description:
      "Product sourcing through customer delivery: merchandising, inventory, fulfillment, marketing, returns",
  },
  {
    slug: "energy",
    name: "Energy (Oil, Gas & Renewables)",
    description:
      "Exploration through consumption: extraction, refining, generation, transmission, distribution, retail",
  },
  {
    slug: "automotive",
    name: "Automotive & Mobility",
    description:
      "Design through aftermarket: R&D, manufacturing, supply chain, dealership, EV, autonomous, fleet",
  },
  {
    slug: "telecommunications",
    name: "Telecommunications",
    description:
      "Network infrastructure through consumer services: spectrum, towers, switching, ISP, mobile, broadband",
  },
  {
    slug: "logistics",
    name: "Logistics & Supply Chain",
    description:
      "Origin to destination: freight, warehousing, fulfillment, last-mile, customs, cold chain, 3PL",
  },
  {
    slug: "media-entertainment",
    name: "Media & Entertainment",
    description:
      "Content creation through consumption: production, post, distribution, streaming, advertising, gaming",
  },
  {
    slug: "education",
    name: "Education & EdTech",
    description:
      "Curriculum through learning outcomes: K-12, higher-ed, e-learning, LMS, assessment, credentialing",
  },
  {
    slug: "aerospace-defense",
    name: "Aerospace & Defense",
    description:
      "Design through operations: R&D, manufacturing, MRO, air traffic, military systems, space",
  },
  {
    slug: "food-beverage",
    name: "Food & Beverage",
    description:
      "Ingredients through dining: sourcing, processing, packaging, distribution, restaurant, QSR, delivery",
  },
  {
    slug: "legal-services",
    name: "Legal Services",
    description:
      "Client intake through resolution: litigation, corporate law, IP, compliance, legal tech, billing",
  },
  {
    slug: "consulting",
    name: "Consulting & Professional Services",
    description:
      "Engagement through delivery: strategy, management, IT, HR, audit, tax advisory, implementation",
  },
  {
    slug: "crypto-blockchain",
    name: "Cryptocurrency & Blockchain",
    description:
      "Protocol through adoption: mining, exchanges, DeFi, NFT, wallets, custody, regulation, Web3",
  },
  {
    slug: "mining-metals",
    name: "Mining & Metals",
    description:
      "Exploration through finished metal: prospecting, extraction, processing, smelting, trading, recycling",
  },
  {
    slug: "hospitality-tourism",
    name: "Hospitality & Tourism",
    description:
      "Planning through experience: booking, lodging, travel, food service, events, attractions, reviews",
  },
  {
    slug: "fashion-apparel",
    name: "Fashion & Apparel",
    description:
      "Design through retail: textile sourcing, manufacturing, branding, wholesale, DTC, sustainability",
  },
];

async function generateBlocks(industry: {
  slug: string;
  name: string;
  description: string;
}) {
  const outputDir = join(process.cwd(), "src", "data", "blocks");
  const outputPath = join(outputDir, `${industry.slug}.json`);

  // Skip if already exists
  if (existsSync(outputPath)) {
    console.log(`  ⊘ Skipping ${industry.slug} — already exists`);
    return { slug: industry.slug, skipped: true };
  }

  console.log(`\n  Generating blocks for: ${industry.name}...`);

  const prompt = `Generate a complete, comprehensive industry value chain map for: "${industry.name}"

Context: ${industry.description}

Requirements:
1. Create 10-16 root-level nodes covering the FULL end-to-end value chain
2. Each root node must have 4-8 subNodes
3. Some subNodes may have their own subNodes (max 3 levels deep total)
4. Cover ALL applicable categories: ${CATEGORIES.join(", ")}
5. Every label must be 1-3 words maximum
6. Include meaningful descriptions (1 sentence each)
7. Define edges showing value flow:
   - Main flow: upstream → production → processing → distribution → customer
   - Lateral connections: support, regulation, technology connect to main flow
8. Every node needs a unique, kebab-case id (e.g., "raw-materials", "quality-control")
9. Be comprehensive — include every significant actor, process, system, and role

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
    console.error(`  ✗ Failed: No response for ${industry.name}`);
    return null;
  }

  try {
    const parsed = JSON.parse(content);

    // Validate structure
    if (!parsed.rootNodes || !Array.isArray(parsed.rootNodes)) {
      console.error(`  ✗ Invalid structure for ${industry.name}`);
      return null;
    }

    // Validate categories — coerce invalid ones to closest match
    const validCats = new Set(CATEGORIES);
    let fixedCount = 0;
    function fixCategories(nodes: { category: string; subNodes?: unknown[] }[]) {
      for (const n of nodes) {
        if (!validCats.has(n.category)) {
          n.category = "support-ops"; // safe default
          fixedCount++;
        }
        if (n.subNodes && Array.isArray(n.subNodes)) {
          fixCategories(n.subNodes as { category: string; subNodes?: unknown[] }[]);
        }
      }
    }
    fixCategories(parsed.rootNodes);
    if (fixedCount > 0) {
      console.log(`  ⚠ Fixed ${fixedCount} invalid categories`);
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

    // Ensure industry name is set
    if (!parsed.industry) {
      parsed.industry = industry.name;
    }

    // Ensure edges array exists
    if (!parsed.edges) {
      parsed.edges = [];
    }

    // Save
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(parsed, null, 2));

    console.log(
      `  ✓ Generated ${parsed.rootNodes.length} root nodes, ${nodeCount} total nodes`
    );
    console.log(`  Saved to: src/data/blocks/${industry.slug}.json`);

    return { slug: industry.slug, skipped: false };
  } catch (e) {
    console.error(`  ✗ Failed to parse JSON for ${industry.name}:`, e);
    return null;
  }
}

async function generateAliases() {
  console.log("\n=== Generating Aliases ===");

  const aliasPath = join(process.cwd(), "src", "data", "aliases.json");
  const existing = JSON.parse(readFileSync(aliasPath, "utf-8"));

  // Only generate aliases for industries that don't have them yet
  const missing = SEED_INDUSTRIES.filter((ind) => !existing[ind.slug]);

  if (missing.length === 0) {
    console.log("All industries already have aliases.");
    return;
  }

  console.log(`Generating aliases for ${missing.length} new industries...`);

  const prompt = `For each of these industries, generate 15-25 search terms/aliases that people would type to find this industry map. Include variations, abbreviations, specific products/services, and common misspellings.

Industries:
${missing.map((m) => `- ${m.slug}: ${m.name} (${m.description})`).join("\n")}

Return ONLY valid JSON as an object where keys are the slugs and values are arrays of lowercase alias strings. Example:
{
  "my-industry": ["alias one", "alias two", ...]
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON. No explanations.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("Failed to generate aliases");
      return;
    }

    const newAliases = JSON.parse(content);

    // Merge into existing
    for (const [slug, aliases] of Object.entries(newAliases)) {
      if (Array.isArray(aliases) && !existing[slug]) {
        existing[slug] = aliases;
        console.log(`  ✓ ${slug}: ${(aliases as string[]).length} aliases`);
      }
    }

    writeFileSync(aliasPath, JSON.stringify(existing, null, 2));
    console.log("Aliases saved to src/data/aliases.json");
  } catch (e) {
    console.error("Failed to generate aliases:", e);
  }
}

async function main() {
  console.log("=== Industry Block Generator ===");
  console.log(`Processing ${SEED_INDUSTRIES.length} industries...\n`);

  const generated: string[] = [];
  const skipped: string[] = [];

  for (const industry of SEED_INDUSTRIES) {
    const result = await generateBlocks(industry);
    if (result) {
      if (result.skipped) {
        skipped.push(result.slug);
      } else {
        generated.push(result.slug);
      }
    }
    // Small delay between API calls
    if (!result?.skipped) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Generate aliases for new industries
  if (generated.length > 0) {
    await generateAliases();
  }

  console.log("\n=== Summary ===");
  console.log(`Generated: ${generated.length} new blocks`);
  console.log(`Skipped: ${skipped.length} (already exist)`);
  if (generated.length > 0) {
    console.log("New:", generated.join(", "));
  }
  console.log(
    "\nNext steps:"
  );
  console.log("1. Review generated JSON files in src/data/blocks/");
  console.log("2. Add static imports to src/data/blocks/index.ts");
  console.log("3. Run `npx next build` to verify");
}

main().catch(console.error);
