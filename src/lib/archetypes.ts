import type { Archetype, Category } from "@/types";

/**
 * Each archetype defines:
 *  - label: human-readable name
 *  - description: one-liner explaining the engine
 *  - structuralHint: categories most relevant (used to weight root node generation)
 *  - promptTemplate: injected into the structure agent prompt so GPT produces
 *    industry-appropriate root nodes and metadata
 *  - exampleActors: representative real-world companies (used in prompt examples)
 *  - typicalPainPoints: common friction across this archetype
 *  - edgeFlowHint: default flow direction description for the edge agent
 */
export interface ArchetypeProfile {
  label: string;
  description: string;
  structuralHint: Category[];
  promptTemplate: string;
  exampleActors: string[];
  typicalPainPoints: string[];
  edgeFlowHint: string;
}

export const ARCHETYPE_PROFILES: Record<Archetype, ArchetypeProfile> = {
  "asset-manufacturing": {
    label: "Asset Manufacturing",
    description:
      "Converts raw materials into finished goods through capital-intensive production processes.",
    structuralHint: [
      "capital",
      "inputs",
      "production",
      "processing",
      "distribution",
      "customer",
    ],
    promptTemplate: `This industry follows an ASSET MANUFACTURING archetype.
Focus on: raw material sourcing → transformation/assembly → quality control → warehousing → distribution → end customer.
Ensure root nodes cover: capital equipment, raw inputs & suppliers, core manufacturing/assembly, post-production processing (QA, packaging), logistics & distribution, customer channels, regulatory compliance (safety, environmental), and supporting infrastructure (IT, maintenance, energy).
Each node should reflect real-world actors, revenue models (e.g. unit margin, OEM contracts), tooling (MES, ERP, PLCs), and pain points (yield loss, supply chain disruption, tariffs).`,
    exampleActors: ["Toyota", "Caterpillar", "Foxconn", "BASF"],
    typicalPainPoints: [
      "Supply chain disruption",
      "Yield/scrap loss",
      "Capital expenditure intensity",
      "Tariff and trade barriers",
      "Environmental compliance costs",
    ],
    edgeFlowHint:
      "Materials flow left-to-right from inputs through production, processing, distribution, to customer. Capital and compliance connect vertically.",
  },

  "asset-aggregation": {
    label: "Asset Aggregation",
    description:
      "Pools assets or deposits to generate returns through spread, allocation, or portfolio management.",
    structuralHint: [
      "capital",
      "inputs",
      "processing",
      "distribution",
      "customer",
      "compliance",
    ],
    promptTemplate: `This industry follows an ASSET AGGREGATION archetype (like banking, insurance, fund management).
Focus on: capital sourcing/deposits → risk assessment & underwriting → portfolio/fund allocation → returns distribution → client relationship.
Ensure root nodes cover: capital raising (deposits, premiums, LP commitments), risk management & underwriting, asset allocation & investment, processing (settlements, claims), distribution (advisory, branches, platforms), customer segments, regulatory compliance (prudential, fiduciary), and infrastructure (core banking, data).
Each node should reflect real actors, revenue models (spread income, AUM fees, premiums), tools (Bloomberg, Murex, actuarial platforms), and pain points (credit risk, liquidity mismatch, regulatory burden).`,
    exampleActors: ["JPMorgan", "BlackRock", "Allianz", "Vanguard"],
    typicalPainPoints: [
      "Credit/counterparty risk",
      "Liquidity mismatch",
      "Regulatory capital requirements",
      "Fee compression",
      "Legacy system modernization",
    ],
    edgeFlowHint:
      "Capital flows inward from sources, through processing and risk, then outward through allocation and returns. Compliance overlays all stages.",
  },

  "labor-leverage-service": {
    label: "Labor-Leverage Service",
    description:
      "Monetizes human expertise and time through billable engagements or retainers.",
    structuralHint: [
      "inputs",
      "production",
      "distribution",
      "customer",
      "infrastructure",
    ],
    promptTemplate: `This industry follows a LABOR-LEVERAGE SERVICE archetype (consulting, legal, healthcare, staffing).
Focus on: talent acquisition/training → engagement scoping → service delivery → quality assurance → client management.
Ensure root nodes cover: talent pipeline (recruiting, training, credentials), project/engagement management, core service delivery, quality & peer review, sales & business development, client/patient segments, compliance (licensing, malpractice, data privacy), and infrastructure (practice management systems, knowledge bases).
Each node should reflect real actors, revenue models (hourly billing, retainers, per-procedure, subscription advisory), tools (Salesforce, practice management, EHR), and pain points (talent retention, utilization rates, scope creep, burnout).`,
    exampleActors: ["McKinsey", "Deloitte", "Mayo Clinic", "Heidrick & Struggles"],
    typicalPainPoints: [
      "Talent retention and burnout",
      "Utilization rate pressure",
      "Scope creep in engagements",
      "Knowledge management across teams",
      "Scalability limited by headcount",
    ],
    edgeFlowHint:
      "Talent flows into delivery teams, services flow outward to clients. Business development feeds the pipeline. Infrastructure supports all nodes.",
  },

  "marketplace-coordination": {
    label: "Marketplace / Coordination Platform",
    description:
      "Connects supply and demand sides, earning through transaction fees, commissions, or listing charges.",
    structuralHint: [
      "inputs",
      "production",
      "processing",
      "distribution",
      "customer",
      "infrastructure",
    ],
    promptTemplate: `This industry follows a MARKETPLACE COORDINATION archetype (e-commerce, ride-sharing, freelance platforms, auction houses).
Focus on: supply onboarding → matching/discovery → transaction execution → fulfillment → demand-side experience.
Ensure root nodes cover: supply-side acquisition & management, matching/search/recommendation engine, transaction processing (payments, escrow), fulfillment & logistics, demand-side acquisition & retention, trust & safety (reviews, dispute resolution), regulatory compliance (consumer protection, tax), and infrastructure (platform engineering, data/ML).
Each node should reflect real actors, revenue models (take rate, listing fees, promoted placements, subscription tiers), tools (Stripe, Algolia, fraud detection), and pain points (chicken-and-egg, disintermediation, regulatory fragmentation).`,
    exampleActors: ["Amazon Marketplace", "Uber", "Airbnb", "Upwork"],
    typicalPainPoints: [
      "Chicken-and-egg supply/demand problem",
      "Disintermediation risk",
      "Trust and safety at scale",
      "Regulatory fragmentation across markets",
      "Take-rate pressure from competition",
    ],
    edgeFlowHint:
      "Supply and demand converge at the matching/transaction layer. Fulfillment flows from supply to demand. Infrastructure underpins the platform.",
  },

  "saas-automation": {
    label: "SaaS / Automation",
    description:
      "Delivers software-as-a-service to automate business functions, earning through subscriptions.",
    structuralHint: [
      "inputs",
      "production",
      "distribution",
      "customer",
      "infrastructure",
    ],
    promptTemplate: `This industry follows a SAAS / AUTOMATION archetype (cloud software, workflow tools, AI platforms).
Focus on: R&D/product development → platform engineering → go-to-market → customer success → expansion.
Ensure root nodes cover: product & engineering (R&D, UX, DevOps), data & AI/ML, go-to-market (sales, marketing, partnerships), customer onboarding & success, customer segments (SMB, mid-market, enterprise), compliance (data privacy, SOC2, GDPR), capital (venture funding, ARR reinvestment), and infrastructure (cloud, security, observability).
Each node should reflect real actors, revenue models (MRR/ARR, usage-based, freemium, seat licensing), tools (AWS, Datadog, HubSpot, Intercom), and pain points (churn, CAC payback, feature bloat, multi-tenancy complexity).`,
    exampleActors: ["Salesforce", "Snowflake", "HubSpot", "Notion"],
    typicalPainPoints: [
      "Customer churn and retention",
      "CAC payback period",
      "Feature bloat vs. simplicity",
      "Multi-tenant architecture complexity",
      "Security and compliance certification costs",
    ],
    edgeFlowHint:
      "Product flows from R&D through platform to customers. Revenue cycles back through customer success to fund R&D. Infrastructure supports all layers.",
  },

  "infrastructure-utility": {
    label: "Infrastructure / Utility",
    description:
      "Provides essential shared infrastructure (energy, telecom, water, transport) with regulated or usage-based pricing.",
    structuralHint: [
      "capital",
      "inputs",
      "production",
      "processing",
      "distribution",
      "customer",
      "compliance",
      "infrastructure",
    ],
    promptTemplate: `This industry follows an INFRASTRUCTURE / UTILITY archetype (energy, telecom, water, transport, data centers).
Focus on: asset development → resource procurement → generation/production → transmission/transport → distribution → metering & billing → end consumers.
Ensure root nodes cover: capital projects & asset development, resource procurement (fuel, spectrum, water), generation/production, transmission & transport networks, local distribution, metering/billing/customer service, regulatory & tariff compliance, and supporting infrastructure (SCADA, network ops, cybersecurity).
Each node should reflect real actors, revenue models (regulated tariffs, usage fees, capacity charges, interconnection), tools (SCADA, GIS, billing systems, NERC), and pain points (capex intensity, regulatory lag, aging infrastructure, demand forecasting).`,
    exampleActors: ["Duke Energy", "AT&T", "Thames Water", "Equinix"],
    typicalPainPoints: [
      "Capital expenditure intensity",
      "Regulatory rate-setting lag",
      "Aging infrastructure maintenance",
      "Demand forecasting accuracy",
      "Climate resilience requirements",
    ],
    edgeFlowHint:
      "Resources flow from procurement through generation, transmission, distribution to end consumers. Capital and compliance connect to all stages. Metering feeds back data.",
  },

  "licensing-ip": {
    label: "Licensing / IP Monetization",
    description:
      "Creates and licenses intellectual property (patents, content, brands, formulas) for royalty income.",
    structuralHint: [
      "capital",
      "inputs",
      "production",
      "distribution",
      "customer",
      "compliance",
    ],
    promptTemplate: `This industry follows a LICENSING / IP MONETIZATION archetype (pharma, media/entertainment, franchising, patent portfolios).
Focus on: IP creation/R&D → IP protection → licensing/partnerships → commercialization → royalty collection.
Ensure root nodes cover: R&D & content creation, IP protection (patents, copyrights, trademarks), licensing & partnership management, commercialization channels (studios, publishers, franchisees), customer/audience segments, compliance (IP law, FDA/regulatory approval, content regulation), capital (R&D funding, catalog valuation), and infrastructure (rights management, analytics).
Each node should reflect real actors, revenue models (royalties, licensing fees, franchise fees, milestone payments), tools (rights management systems, patent databases, CRM), and pain points (IP theft/piracy, long R&D cycles, regulatory approval delays, catalog depreciation).`,
    exampleActors: [
      "Pfizer",
      "Walt Disney",
      "Qualcomm",
      "McDonald's (franchise model)",
    ],
    typicalPainPoints: [
      "IP theft and piracy",
      "Long R&D or approval cycles",
      "Patent cliff / catalog depreciation",
      "Licensing contract complexity",
      "Jurisdictional IP law variation",
    ],
    edgeFlowHint:
      "IP flows from creation through protection to licensing and commercialization. Royalties flow back to fund R&D. Compliance gates each stage.",
  },

  "brokerage-intermediation": {
    label: "Brokerage / Intermediation",
    description:
      "Facilitates transactions between parties without taking principal risk, earning commissions or spreads.",
    structuralHint: [
      "inputs",
      "processing",
      "distribution",
      "customer",
      "compliance",
      "infrastructure",
    ],
    promptTemplate: `This industry follows a BROKERAGE / INTERMEDIATION archetype (real estate brokers, insurance brokers, securities brokers, import/export agents).
Focus on: client acquisition → needs assessment → product sourcing/matching → transaction facilitation → settlement/closing → ongoing service.
Ensure root nodes cover: client acquisition & relationship management, needs analysis & advisory, product/counterparty sourcing, transaction execution & negotiation, settlement & documentation, client segments (institutional, retail, commercial), compliance (licensing, fiduciary duty, AML), and infrastructure (CRM, trading/listing platforms, comparison engines).
Each node should reflect real actors, revenue models (commissions, brokerage fees, trailing fees, spread), tools (MLS, trading platforms, comparison APIs), and pain points (disintermediation threat, commission compression, regulatory licensing, market transparency).`,
    exampleActors: ["CBRE", "Marsh McLennan", "Charles Schwab", "Cargill brokerage"],
    typicalPainPoints: [
      "Disintermediation by direct channels",
      "Commission rate compression",
      "Regulatory licensing requirements",
      "Market transparency enabling bypass",
      "Client loyalty and switching costs",
    ],
    edgeFlowHint:
      "Clients connect through the broker to products/counterparties. Information flows bidirectionally. Settlement flows from execution to documentation.",
  },

  "asset-ownership-leasing": {
    label: "Asset Ownership / Leasing",
    description:
      "Owns high-value assets and monetizes through leasing, rental, or usage fees.",
    structuralHint: [
      "capital",
      "inputs",
      "production",
      "distribution",
      "customer",
      "compliance",
    ],
    promptTemplate: `This industry follows an ASSET OWNERSHIP / LEASING archetype (commercial real estate, equipment leasing, fleet management, co-working).
Focus on: asset acquisition → asset management → tenant/lessee sourcing → lease execution → ongoing operations → disposition.
Ensure root nodes cover: capital & acquisitions, asset management & maintenance, tenant/lessee acquisition & screening, lease structuring & execution, property/asset operations, customer segments (commercial, residential, industrial), compliance (building codes, lease law, safety), and infrastructure (property management systems, IoT monitoring, accounting).
Each node should reflect real actors, revenue models (rental income, lease payments, CAM charges, residual value), tools (Yardi, MRI, fleet management), and pain points (vacancy risk, maintenance costs, interest rate sensitivity, tenant default).`,
    exampleActors: ["Prologis", "GATX", "WeWork", "United Rentals"],
    typicalPainPoints: [
      "Vacancy and occupancy risk",
      "Maintenance and depreciation costs",
      "Interest rate sensitivity",
      "Tenant/lessee default risk",
      "Asset obsolescence or market shifts",
    ],
    edgeFlowHint:
      "Capital flows into asset acquisition. Assets flow through management to tenants/lessees. Revenue flows back through lease payments. Compliance overlays operations.",
  },
};

/**
 * Helper: get the archetype profile or undefined
 */
export function getArchetypeProfile(
  archetype: Archetype | undefined
): ArchetypeProfile | undefined {
  if (!archetype) return undefined;
  return ARCHETYPE_PROFILES[archetype];
}
