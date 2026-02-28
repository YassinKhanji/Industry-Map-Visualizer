/**
 * Industry taxonomy — 19 NAICS-aligned sectors with Products & Services sub-trees.
 * Sources: NAICS (BLS), ISIC Rev 4 (UN), StatCan NAICS 2022.
 *
 * Structure: TaxonomyNode[] → each sector has "Products" and/or "Services" children,
 * which in turn have sub-categories, which have leaf items (searchQuery).
 */

export interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
  /** Present only on leaf nodes — the query string sent to map generation */
  searchQuery?: string;
}

/* helper: convert label to kebab-id */
function n(parent: string, label: string): string {
  return `${parent}--${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function leaf(parent: string, label: string, query?: string): TaxonomyNode {
  return { id: n(parent, label), label, searchQuery: query ?? label };
}

function branch(parent: string, label: string, children: TaxonomyNode[]): TaxonomyNode {
  return { id: n(parent, label), label, children };
}

/* ────────────────────── Sector builders ────────────────────── */

const agriculture: TaxonomyNode = {
  id: "agriculture",
  label: "Agriculture, Forestry, Fishing & Hunting",
  children: [
    branch("agriculture", "Products", [
      branch("agriculture-products", "Crops", [
        leaf("agri-crops", "Grains (wheat, corn, rice)"),
        leaf("agri-crops", "Oilseeds (soybeans, canola)"),
        leaf("agri-crops", "Vegetables"),
        leaf("agri-crops", "Fruits and nuts"),
        leaf("agri-crops", "Flowers, ornamental plants"),
      ]),
      branch("agriculture-products", "Livestock", [
        leaf("agri-livestock", "Cattle and calves"),
        leaf("agri-livestock", "Poultry and eggs"),
        leaf("agri-livestock", "Hogs"),
        leaf("agri-livestock", "Sheep and goats"),
        leaf("agri-livestock", "Aquaculture products"),
      ]),
      branch("agriculture-products", "Forestry", [
        leaf("agri-forestry", "Timber and logs"),
        leaf("agri-forestry", "Fuelwood"),
        leaf("agri-forestry", "Wood chips"),
        leaf("agri-forestry", "Nursery stock"),
      ]),
      branch("agriculture-products", "Fishing & Wildlife", [
        leaf("agri-fishing", "Fish (freshwater, saltwater)"),
        leaf("agri-fishing", "Shellfish"),
        leaf("agri-fishing", "Other marine products"),
        leaf("agri-fishing", "Wild game"),
      ]),
    ]),
    branch("agriculture", "Services", [
      branch("agriculture-services", "Agricultural Support", [
        leaf("agri-support", "Soil preparation and cultivation"),
        leaf("agri-support", "Planting and seeding"),
        leaf("agri-support", "Crop spraying and pest control"),
        leaf("agri-support", "Harvesting"),
        leaf("agri-support", "Farm labor contracting"),
        leaf("agri-support", "Agricultural consultancy"),
      ]),
      branch("agriculture-services", "Forestry Services", [
        leaf("agri-forestry-svc", "Tree planting"),
        leaf("agri-forestry-svc", "Logging and forest harvesting"),
        leaf("agri-forestry-svc", "Forest fire management"),
      ]),
      branch("agriculture-services", "Fishing Services", [
        leaf("agri-fishing-svc", "Fish hatcheries and aquaculture management"),
        leaf("agri-fishing-svc", "Fishing trip charters"),
      ]),
      branch("agriculture-services", "Veterinary Services", [
        leaf("agri-vet", "Animal health and breeding services"),
      ]),
    ]),
  ],
};

const mining: TaxonomyNode = {
  id: "mining",
  label: "Mining, Quarrying & Oil/Gas Extraction",
  children: [
    branch("mining", "Products", [
      branch("mining-products", "Metallic Minerals", [
        leaf("mining-metals", "Gold ore"),
        leaf("mining-metals", "Copper ore"),
        leaf("mining-metals", "Iron ore"),
        leaf("mining-metals", "Bauxite (aluminum ore)"),
        leaf("mining-metals", "Other metal ores"),
      ]),
      branch("mining-products", "Coal", [
        leaf("mining-coal", "Thermal coal"),
        leaf("mining-coal", "Metallurgical coal"),
      ]),
      branch("mining-products", "Oil & Natural Gas", [
        leaf("mining-oil", "Crude petroleum"),
        leaf("mining-oil", "Natural gas"),
        leaf("mining-oil", "Natural gas liquids"),
      ]),
      branch("mining-products", "Industrial Minerals", [
        leaf("mining-industrial", "Sand"),
        leaf("mining-industrial", "Gravel"),
        leaf("mining-industrial", "Limestone"),
        leaf("mining-industrial", "Gypsum"),
        leaf("mining-industrial", "Salt"),
        leaf("mining-industrial", "Potash"),
      ]),
      branch("mining-products", "Stone & Aggregates", [
        leaf("mining-stone", "Crushed stone"),
        leaf("mining-stone", "Dimension stone"),
      ]),
    ]),
    branch("mining", "Services", [
      branch("mining-services", "Mining Operations", [
        leaf("mining-ops", "Mine development and operation"),
        leaf("mining-ops", "Oil well drilling"),
        leaf("mining-ops", "Quarrying services"),
      ]),
      branch("mining-services", "Support Activities", [
        leaf("mining-support", "Geological surveying"),
        leaf("mining-support", "Exploration drilling"),
        leaf("mining-support", "Mine site preparation"),
        leaf("mining-support", "Ore beneficiating (processing)"),
      ]),
      branch("mining-services", "Oil & Gas Services", [
        leaf("mining-oilgas", "Offshore drilling services"),
        leaf("mining-oilgas", "Pipeline services"),
        leaf("mining-oilgas", "Oilfield equipment supply"),
      ]),
    ]),
  ],
};

const construction: TaxonomyNode = {
  id: "construction",
  label: "Construction",
  children: [
    branch("construction", "Products", [
      branch("construction-products", "Building Materials", [
        leaf("constr-materials", "Cement and concrete"),
        leaf("constr-materials", "Bricks and blocks"),
        leaf("constr-materials", "Lumber and plywood"),
        leaf("constr-materials", "Glass and glazing"),
        leaf("constr-materials", "Roofing materials"),
        leaf("constr-materials", "Insulation"),
        leaf("constr-materials", "Paints and coatings"),
      ]),
      branch("construction-products", "Construction Equipment", [
        leaf("constr-equip", "Cranes"),
        leaf("constr-equip", "Excavators"),
        leaf("constr-equip", "Bulldozers"),
        leaf("constr-equip", "Concrete mixers"),
        leaf("constr-equip", "Hand tools"),
        leaf("constr-equip", "Scaffolding"),
      ]),
      branch("construction-products", "Fixtures & Hardware", [
        leaf("constr-fixtures", "Doors and windows"),
        leaf("constr-fixtures", "Plumbing fixtures"),
        leaf("constr-fixtures", "Electrical fixtures"),
        leaf("constr-fixtures", "Ceramic tiles"),
        leaf("constr-fixtures", "Floor coverings"),
      ]),
    ]),
    branch("construction", "Services", [
      branch("construction-services", "Construction Services", [
        leaf("constr-svc", "Residential building construction"),
        leaf("constr-svc", "Commercial building construction"),
        leaf("constr-svc", "Industrial construction"),
        leaf("constr-svc", "Heavy and civil engineering (roads, bridges, infrastructure)"),
        leaf("constr-svc", "Specialty trades (electrical, plumbing, HVAC, carpentry)"),
      ]),
      branch("construction-services", "Design & Engineering", [
        leaf("constr-design", "Architectural design"),
        leaf("constr-design", "Structural engineering"),
        leaf("constr-design", "Civil engineering"),
        leaf("constr-design", "Construction project management"),
      ]),
      branch("construction-services", "Site Preparation", [
        leaf("constr-site", "Land clearing and grading"),
        leaf("constr-site", "Excavation"),
        leaf("constr-site", "Foundation drilling and laying"),
      ]),
    ]),
  ],
};

const manufacturing: TaxonomyNode = {
  id: "manufacturing",
  label: "Manufacturing",
  children: [
    branch("manufacturing", "Products", [
      branch("mfg-products", "Food & Beverage", [
        leaf("mfg-food", "Processed meats"),
        leaf("mfg-food", "Dairy products"),
        leaf("mfg-food", "Baked goods"),
        leaf("mfg-food", "Confectionery"),
        leaf("mfg-food", "Soft drinks"),
        leaf("mfg-food", "Alcoholic beverages"),
      ]),
      branch("mfg-products", "Textiles & Apparel", [
        leaf("mfg-textiles", "Yarns and fabrics"),
        leaf("mfg-textiles", "Home textiles (linen, drapery)"),
        leaf("mfg-textiles", "Clothing and garments"),
        leaf("mfg-textiles", "Footwear"),
      ]),
      branch("mfg-products", "Wood & Paper", [
        leaf("mfg-wood", "Lumber"),
        leaf("mfg-wood", "Wood panels"),
        leaf("mfg-wood", "Furniture"),
        leaf("mfg-wood", "Paper and paperboard"),
        leaf("mfg-wood", "Printing and related products"),
      ]),
      branch("mfg-products", "Chemicals & Pharmaceuticals", [
        leaf("mfg-chem", "Basic chemicals"),
        leaf("mfg-chem", "Fertilizers"),
        leaf("mfg-chem", "Plastic resins"),
        leaf("mfg-chem", "Pharmaceutical drugs"),
        leaf("mfg-chem", "Soaps and cosmetics"),
      ]),
      branch("mfg-products", "Rubber & Plastics", [
        leaf("mfg-rubber", "Tires"),
        leaf("mfg-rubber", "Rubber products"),
        leaf("mfg-rubber", "Plastic pipes and containers"),
      ]),
      branch("mfg-products", "Glass, Cement & Ceramics", [
        leaf("mfg-glass", "Flat glass"),
        leaf("mfg-glass", "Glassware"),
        leaf("mfg-glass", "Cement"),
        leaf("mfg-glass", "Clay and concrete products"),
        leaf("mfg-glass", "Ceramic tiles"),
      ]),
      branch("mfg-products", "Primary Metals", [
        leaf("mfg-metals", "Steel"),
        leaf("mfg-metals", "Aluminum"),
        leaf("mfg-metals", "Copper"),
        leaf("mfg-metals", "Other metal ingots and alloys"),
      ]),
      branch("mfg-products", "Fabricated Metal Products", [
        leaf("mfg-fab-metal", "Metal doors and windows"),
        leaf("mfg-fab-metal", "Cutlery"),
        leaf("mfg-fab-metal", "Hardware"),
        leaf("mfg-fab-metal", "Coatings"),
      ]),
      branch("mfg-products", "Machinery", [
        leaf("mfg-machinery", "Agricultural machinery"),
        leaf("mfg-machinery", "Industrial machinery"),
        leaf("mfg-machinery", "Mining machinery"),
        leaf("mfg-machinery", "Construction machinery"),
        leaf("mfg-machinery", "Material handling equipment"),
      ]),
      branch("mfg-products", "Electronics & Electrical", [
        leaf("mfg-electronics", "Computers"),
        leaf("mfg-electronics", "Telecom equipment"),
        leaf("mfg-electronics", "Semiconductors"),
        leaf("mfg-electronics", "Electric motors"),
        leaf("mfg-electronics", "Generators"),
        leaf("mfg-electronics", "Lighting fixtures"),
      ]),
      branch("mfg-products", "Transportation Equipment", [
        leaf("mfg-transport", "Automobiles"),
        leaf("mfg-transport", "Trucks"),
        leaf("mfg-transport", "Aircraft"),
        leaf("mfg-transport", "Ships and boats"),
        leaf("mfg-transport", "Railroad locomotives"),
      ]),
      branch("mfg-products", "Furniture & Related", [
        leaf("mfg-furniture", "Home furniture"),
        leaf("mfg-furniture", "Office furniture"),
        leaf("mfg-furniture", "Mattresses"),
        leaf("mfg-furniture", "Wooden cabinets"),
      ]),
      branch("mfg-products", "Miscellaneous", [
        leaf("mfg-misc", "Jewelry"),
        leaf("mfg-misc", "Sports equipment"),
        leaf("mfg-misc", "Toys"),
        leaf("mfg-misc", "Medical devices"),
        leaf("mfg-misc", "Musical instruments"),
        leaf("mfg-misc", "Other consumer goods"),
      ]),
    ]),
    branch("manufacturing", "Services", [
      branch("mfg-services", "Manufacturing Support", [
        leaf("mfg-support", "Research and development"),
        leaf("mfg-support", "Product design"),
        leaf("mfg-support", "Quality control and testing"),
        leaf("mfg-support", "Logistics and distribution"),
        leaf("mfg-support", "After-sales maintenance"),
      ]),
    ]),
  ],
};

const wholesale: TaxonomyNode = {
  id: "wholesale",
  label: "Wholesale Trade",
  children: [
    branch("wholesale", "Products", [
      branch("wholesale-products", "Durable Goods", [
        leaf("wholesale-durable", "Industrial machinery"),
        leaf("wholesale-durable", "Construction equipment"),
        leaf("wholesale-durable", "Vehicles and auto parts"),
        leaf("wholesale-durable", "Furniture and appliances"),
        leaf("wholesale-durable", "Metal and mineral products"),
        leaf("wholesale-durable", "Medical equipment"),
      ]),
      branch("wholesale-products", "Nondurable Goods", [
        leaf("wholesale-nondurable", "Paper and office supplies"),
        leaf("wholesale-nondurable", "Chemicals and plastics"),
        leaf("wholesale-nondurable", "Drugs and sundries"),
        leaf("wholesale-nondurable", "Apparel and accessories"),
        leaf("wholesale-nondurable", "Groceries and beverages"),
        leaf("wholesale-nondurable", "Petroleum products"),
      ]),
      branch("wholesale-products", "Electronic Markets", [
        leaf("wholesale-electronic", "Intermediary (brokerage) services"),
        leaf("wholesale-electronic", "Online wholesale platforms"),
      ]),
    ]),
    branch("wholesale", "Services", [
      branch("wholesale-services", "Wholesale Distribution", [
        leaf("wholesale-dist", "Bulk warehousing and storage"),
        leaf("wholesale-dist", "Intermediary and brokerage services"),
        leaf("wholesale-dist", "Import/export distribution"),
        leaf("wholesale-dist", "Supply chain management"),
      ]),
    ]),
  ],
};

const retail: TaxonomyNode = {
  id: "retail",
  label: "Retail Trade",
  children: [
    branch("retail", "Products", [
      branch("retail-products", "Motor Vehicles & Parts", [
        leaf("retail-auto", "New and used cars"),
        leaf("retail-auto", "Trucks"),
        leaf("retail-auto", "Motorcycles"),
        leaf("retail-auto", "Auto parts and tires"),
      ]),
      branch("retail-products", "Furniture & Home Furnishings", [
        leaf("retail-furniture", "Furniture"),
        leaf("retail-furniture", "Home décor"),
        leaf("retail-furniture", "Mattresses"),
        leaf("retail-furniture", "Window treatments"),
      ]),
      branch("retail-products", "Electronics & Appliances", [
        leaf("retail-electronics", "TVs"),
        leaf("retail-electronics", "Computers"),
        leaf("retail-electronics", "Smartphones"),
        leaf("retail-electronics", "Refrigerators"),
        leaf("retail-electronics", "Air conditioners"),
      ]),
      branch("retail-products", "Building Material & Garden", [
        leaf("retail-building", "Lumber"),
        leaf("retail-building", "Paint"),
        leaf("retail-building", "Tools"),
        leaf("retail-building", "Lawn and garden equipment"),
        leaf("retail-building", "Plants"),
      ]),
      branch("retail-products", "Food & Beverage Stores", [
        leaf("retail-food", "Groceries"),
        leaf("retail-food", "Meat"),
        leaf("retail-food", "Produce"),
        leaf("retail-food", "Bakeries"),
        leaf("retail-food", "Alcoholic beverages"),
      ]),
      branch("retail-products", "Health & Personal Care", [
        leaf("retail-health", "Pharmacy products"),
        leaf("retail-health", "Health foods"),
        leaf("retail-health", "Cosmetics"),
        leaf("retail-health", "Vision products"),
      ]),
      branch("retail-products", "Gasoline Stations", [
        leaf("retail-gas", "Fuel (gasoline, diesel)"),
        leaf("retail-gas", "Convenience store items"),
      ]),
      branch("retail-products", "Clothing & Accessories", [
        leaf("retail-clothing", "Men's apparel"),
        leaf("retail-clothing", "Women's apparel"),
        leaf("retail-clothing", "Children's clothing"),
        leaf("retail-clothing", "Footwear"),
        leaf("retail-clothing", "Accessories"),
      ]),
      branch("retail-products", "Sporting Goods & Hobby", [
        leaf("retail-sports", "Sports equipment"),
        leaf("retail-sports", "Bicycles"),
        leaf("retail-sports", "Books"),
        leaf("retail-sports", "Musical instruments"),
      ]),
      branch("retail-products", "General Merchandise", [
        leaf("retail-general", "Department store items"),
        leaf("retail-general", "Discount store merchandise"),
      ]),
      branch("retail-products", "Miscellaneous Retailers", [
        leaf("retail-misc", "Flower shops"),
        leaf("retail-misc", "Office supply stores"),
        leaf("retail-misc", "Pet supplies"),
        leaf("retail-misc", "Used goods"),
      ]),
      branch("retail-products", "Nonstore Retailers", [
        leaf("retail-nonstore", "E-commerce goods"),
        leaf("retail-nonstore", "Direct mail-order products"),
        leaf("retail-nonstore", "Vending machine products"),
      ]),
    ]),
    branch("retail", "Services", [
      branch("retail-services", "Retail Sales", [
        leaf("retail-sales", "In-store sales services"),
        leaf("retail-sales", "Online retailing and e-commerce"),
        leaf("retail-sales", "Direct marketing"),
        leaf("retail-sales", "Customer loyalty and delivery services"),
      ]),
      branch("retail-services", "Logistics", [
        leaf("retail-logistics", "Inventory management"),
        leaf("retail-logistics", "Order fulfillment"),
        leaf("retail-logistics", "Last-mile delivery"),
      ]),
    ]),
  ],
};

const transportation: TaxonomyNode = {
  id: "transportation",
  label: "Transportation & Warehousing",
  children: [
    branch("transportation", "Products", [
      branch("transport-products", "Transport Equipment", [
        leaf("transport-equip", "Vehicles (used in transportation)"),
        leaf("transport-equip", "Containers and packaging for transport"),
      ]),
    ]),
    branch("transportation", "Services", [
      branch("transport-services", "Air Transportation", [
        leaf("transport-air", "Passenger airlines"),
        leaf("transport-air", "Air cargo services"),
      ]),
      branch("transport-services", "Rail Transportation", [
        leaf("transport-rail", "Freight rail services"),
        leaf("transport-rail", "Passenger rail (commuter trains)"),
      ]),
      branch("transport-services", "Water Transportation", [
        leaf("transport-water", "Cargo shipping (container, bulk)"),
        leaf("transport-water", "Passenger ships and ferries"),
        leaf("transport-water", "Charter boats"),
      ]),
      branch("transport-services", "Truck Transportation", [
        leaf("transport-truck", "Freight trucking (long-haul, local)"),
        leaf("transport-truck", "Delivery and courier trucking"),
      ]),
      branch("transport-services", "Transit & Ground Passenger", [
        leaf("transport-transit", "Urban transit buses"),
        leaf("transport-transit", "Taxi and ride-hailing"),
        leaf("transport-transit", "Intercity bus"),
      ]),
      branch("transport-services", "Pipeline Transportation", [
        leaf("transport-pipeline", "Crude oil pipelines"),
        leaf("transport-pipeline", "Natural gas pipelines"),
        leaf("transport-pipeline", "Other liquid product pipelines"),
      ]),
      branch("transport-services", "Scenic & Sightseeing", [
        leaf("transport-scenic", "Tour buses"),
        leaf("transport-scenic", "Boat tours"),
        leaf("transport-scenic", "Helicopter rides"),
      ]),
      branch("transport-services", "Support Activities", [
        leaf("transport-support", "Freight forwarding"),
        leaf("transport-support", "Aircraft maintenance"),
        leaf("transport-support", "Warehouse services"),
        leaf("transport-support", "Cargo handling"),
      ]),
      branch("transport-services", "Postal & Courier", [
        leaf("transport-postal", "Postal mail services"),
        leaf("transport-postal", "Express courier delivery"),
      ]),
      branch("transport-services", "Warehousing & Storage", [
        leaf("transport-warehouse", "General merchandise warehousing"),
        leaf("transport-warehouse", "Specialized storage (refrigerated, bulk)"),
      ]),
    ]),
  ],
};

const utilities: TaxonomyNode = {
  id: "utilities",
  label: "Utilities",
  children: [
    branch("utilities", "Products", [
      branch("utilities-products", "Energy & Utilities", [
        leaf("util-energy", "Electricity"),
        leaf("util-energy", "Natural gas"),
        leaf("util-energy", "Steam (district heating)"),
      ]),
      branch("utilities-products", "Water & Waste", [
        leaf("util-water", "Treated water supply"),
        leaf("util-water", "Sewage water"),
      ]),
    ]),
    branch("utilities", "Services", [
      branch("utilities-services", "Electricity Supply", [
        leaf("util-elec-svc", "Electric power generation"),
        leaf("util-elec-svc", "Transmission and distribution of electricity"),
      ]),
      branch("utilities-services", "Gas Supply", [
        leaf("util-gas-svc", "Natural gas distribution"),
      ]),
      branch("utilities-services", "Steam Supply", [
        leaf("util-steam-svc", "District heating (steam)"),
      ]),
      branch("utilities-services", "Water Supply", [
        leaf("util-water-svc", "Water treatment and distribution"),
      ]),
      branch("utilities-services", "Wastewater & Sewage", [
        leaf("util-waste-svc", "Sewage collection and treatment"),
      ]),
    ]),
  ],
};

const information: TaxonomyNode = {
  id: "information",
  label: "Information",
  children: [
    branch("information", "Products", [
      branch("info-products", "Published & Digital Content", [
        leaf("info-published", "Books"),
        leaf("info-published", "Newspapers"),
        leaf("info-published", "Magazines"),
        leaf("info-published", "Software applications"),
        leaf("info-published", "Databases"),
      ]),
      branch("info-products", "Audio/Visual Media", [
        leaf("info-av", "Movies"),
        leaf("info-av", "Music recordings"),
        leaf("info-av", "Video games"),
        leaf("info-av", "Broadcast content"),
      ]),
      branch("info-products", "Advertising Products", [
        leaf("info-ads", "Advertisements"),
        leaf("info-ads", "Digital ad content"),
      ]),
    ]),
    branch("information", "Services", [
      branch("info-services", "Publishing & Production", [
        leaf("info-pub-svc", "Book publishing"),
        leaf("info-pub-svc", "Newspaper/magazine publishing"),
        leaf("info-pub-svc", "Software publishing"),
        leaf("info-pub-svc", "Motion picture and video production"),
        leaf("info-pub-svc", "Music recording"),
      ]),
      branch("info-services", "Broadcasting & Telecom", [
        leaf("info-broadcast", "TV broadcasting"),
        leaf("info-broadcast", "Radio broadcasting"),
        leaf("info-broadcast", "Internet streaming"),
        leaf("info-broadcast", "Telecommunications (fixed and mobile)"),
        leaf("info-broadcast", "Cable and satellite TV"),
        leaf("info-broadcast", "Internet service provision"),
      ]),
      branch("info-services", "IT & Data Services", [
        leaf("info-it", "Data processing and hosting"),
        leaf("info-it", "Cloud computing"),
        leaf("info-it", "Web search portals"),
        leaf("info-it", "Information services (libraries, archives)"),
      ]),
    ]),
  ],
};

const finance: TaxonomyNode = {
  id: "finance",
  label: "Finance & Insurance",
  children: [
    branch("finance", "Products", [
      branch("finance-products", "Financial Products", [
        leaf("fin-products", "Checking and savings accounts"),
        leaf("fin-products", "Certificates of deposit"),
        leaf("fin-products", "Bonds"),
        leaf("fin-products", "Stocks"),
        leaf("fin-products", "Mutual fund shares"),
        leaf("fin-products", "Insurance policies"),
        leaf("fin-products", "Retirement/pension plans"),
      ]),
      branch("finance-products", "Credit Products", [
        leaf("fin-credit", "Mortgages"),
        leaf("fin-credit", "Auto loans"),
        leaf("fin-credit", "Credit cards"),
        leaf("fin-credit", "Personal loans"),
      ]),
      branch("finance-products", "Insurance Products", [
        leaf("fin-insurance", "Life insurance"),
        leaf("fin-insurance", "Health insurance"),
        leaf("fin-insurance", "Property and casualty insurance"),
        leaf("fin-insurance", "Reinsurance"),
      ]),
    ]),
    branch("finance", "Services", [
      branch("finance-services", "Banking Services", [
        leaf("fin-banking", "Deposit services"),
        leaf("fin-banking", "Loan origination"),
        leaf("fin-banking", "Credit analysis"),
        leaf("fin-banking", "Payment processing"),
      ]),
      branch("finance-services", "Investment Services", [
        leaf("fin-invest", "Brokerage and trading"),
        leaf("fin-invest", "Asset management"),
        leaf("fin-invest", "Underwriting of securities"),
        leaf("fin-invest", "Financial consulting"),
      ]),
      branch("finance-services", "Insurance Services", [
        leaf("fin-ins-svc", "Policy underwriting"),
        leaf("fin-ins-svc", "Claims adjustment and payment"),
        leaf("fin-ins-svc", "Actuarial services"),
        leaf("fin-ins-svc", "Insurance brokerage"),
      ]),
      branch("finance-services", "Payment & Clearing", [
        leaf("fin-payment", "Payment processing systems"),
        leaf("fin-payment", "Clearinghouse services"),
      ]),
      branch("finance-services", "Risk Management", [
        leaf("fin-risk", "Investment advisory"),
        leaf("fin-risk", "Financial planning"),
        leaf("fin-risk", "Credit counseling"),
      ]),
    ]),
  ],
};

const realEstate: TaxonomyNode = {
  id: "real-estate",
  label: "Real Estate & Rental/Leasing",
  children: [
    branch("real-estate", "Products", [
      branch("re-products", "Real Estate", [
        leaf("re-property", "Residential property"),
        leaf("re-property", "Commercial property"),
        leaf("re-property", "Industrial property"),
        leaf("re-property", "Land leases"),
      ]),
      branch("re-products", "Rental Goods", [
        leaf("re-rental", "Vehicles for rent"),
        leaf("re-rental", "Construction equipment rental"),
        leaf("re-rental", "Machinery rental"),
        leaf("re-rental", "Consumer goods rental (tools, party supplies)"),
      ]),
    ]),
    branch("real-estate", "Services", [
      branch("re-services", "Real Estate Services", [
        leaf("re-svc", "Property brokerage"),
        leaf("re-svc", "Real estate development"),
        leaf("re-svc", "Property management"),
        leaf("re-svc", "Appraisal and valuation"),
        leaf("re-svc", "Landlord services"),
      ]),
      branch("re-services", "Rental & Leasing Services", [
        leaf("re-lease", "Automotive rental"),
        leaf("re-lease", "Heavy equipment leasing"),
        leaf("re-lease", "Office equipment rental"),
        leaf("re-lease", "Video/party equipment rental"),
      ]),
    ]),
  ],
};

const professional: TaxonomyNode = {
  id: "professional",
  label: "Professional, Scientific & Technical Services",
  children: [
    branch("professional", "Products", [
      branch("prof-products", "Professional Outputs", [
        leaf("prof-outputs", "Consulting reports"),
        leaf("prof-outputs", "Blueprints and technical drawings"),
        leaf("prof-outputs", "Software applications"),
        leaf("prof-outputs", "Research findings"),
      ]),
    ]),
    branch("professional", "Services", [
      branch("prof-services", "Legal & Accounting", [
        leaf("prof-legal", "Legal advice and representation"),
        leaf("prof-legal", "Notary services"),
        leaf("prof-legal", "Accounting and bookkeeping"),
        leaf("prof-legal", "Tax preparation"),
        leaf("prof-legal", "Auditing"),
      ]),
      branch("prof-services", "Architectural & Engineering", [
        leaf("prof-arch", "Architectural design"),
        leaf("prof-arch", "Structural engineering"),
        leaf("prof-arch", "Civil engineering"),
        leaf("prof-arch", "Environmental engineering"),
        leaf("prof-arch", "Urban planning"),
      ]),
      branch("prof-services", "Computer & IT", [
        leaf("prof-it", "Software development"),
        leaf("prof-it", "Systems design"),
        leaf("prof-it", "Data analysis"),
        leaf("prof-it", "IT consulting"),
        leaf("prof-it", "Network management"),
      ]),
      branch("prof-services", "Consulting & Research", [
        leaf("prof-consult", "Management consulting"),
        leaf("prof-consult", "Scientific research and development"),
        leaf("prof-consult", "Market research"),
        leaf("prof-consult", "Technical testing"),
      ]),
      branch("prof-services", "Creative & Media", [
        leaf("prof-creative", "Advertising and marketing"),
        leaf("prof-creative", "Graphic design"),
        leaf("prof-creative", "Photography"),
        leaf("prof-creative", "Translation and interpretation"),
      ]),
      branch("prof-services", "Other Professional", [
        leaf("prof-other", "Veterinary services"),
        leaf("prof-other", "Photographic services"),
        leaf("prof-other", "Technical writing"),
      ]),
    ]),
  ],
};

const management: TaxonomyNode = {
  id: "management",
  label: "Management of Companies & Enterprises",
  children: [
    branch("management", "Services", [
      branch("mgmt-services", "Corporate Management", [
        leaf("mgmt-corp", "Head office administration"),
        leaf("mgmt-corp", "Strategic planning"),
        leaf("mgmt-corp", "Corporate finance"),
        leaf("mgmt-corp", "Holding company activities"),
      ]),
    ]),
  ],
};

const admin: TaxonomyNode = {
  id: "admin",
  label: "Administrative, Support & Waste Management",
  children: [
    branch("admin", "Services", [
      branch("admin-services", "Office Administration", [
        leaf("admin-office", "Clerical and secretarial services"),
        leaf("admin-office", "Office management"),
        leaf("admin-office", "Document preparation"),
      ]),
      branch("admin-services", "Employment Services", [
        leaf("admin-employ", "Staffing and recruitment"),
        leaf("admin-employ", "Temporary employment placement"),
        leaf("admin-employ", "Payroll and benefits administration"),
      ]),
      branch("admin-services", "Business Support", [
        leaf("admin-biz", "Call centers and telemarketing"),
        leaf("admin-biz", "Collection agencies"),
        leaf("admin-biz", "Travel agencies"),
        leaf("admin-biz", "Extermination and cleaning services"),
      ]),
      branch("admin-services", "Security & Safety", [
        leaf("admin-security", "Security guarding"),
        leaf("admin-security", "Alarm services"),
        leaf("admin-security", "Fire protection services"),
      ]),
      branch("admin-services", "Waste Management", [
        leaf("admin-waste", "Garbage collection"),
        leaf("admin-waste", "Recycling services"),
        leaf("admin-waste", "Hazardous waste disposal"),
        leaf("admin-waste", "Remediation services"),
      ]),
    ]),
  ],
};

const education: TaxonomyNode = {
  id: "education",
  label: "Educational Services",
  children: [
    branch("education", "Products", [
      branch("edu-products", "Educational Materials", [
        leaf("edu-materials", "Textbooks"),
        leaf("edu-materials", "Instructional videos"),
        leaf("edu-materials", "E-learning courses"),
        leaf("edu-materials", "Curriculum guides"),
        leaf("edu-materials", "Online tutorials"),
      ]),
    ]),
    branch("education", "Services", [
      branch("edu-services", "Education Services", [
        leaf("edu-svc", "Primary and secondary schooling"),
        leaf("edu-svc", "Colleges and universities"),
        leaf("edu-svc", "Vocational and technical training"),
        leaf("edu-svc", "Tutoring and test prep"),
        leaf("edu-svc", "Special education"),
      ]),
      branch("edu-services", "Educational Support", [
        leaf("edu-support", "Libraries and archives services"),
        leaf("edu-support", "Education consulting"),
        leaf("edu-support", "Student transportation"),
      ]),
    ]),
  ],
};

const healthcare: TaxonomyNode = {
  id: "healthcare",
  label: "Health Care & Social Assistance",
  children: [
    branch("healthcare", "Products", [
      branch("hc-products", "Medical Products", [
        leaf("hc-medical", "Prescription drugs"),
        leaf("hc-medical", "Over-the-counter medications"),
        leaf("hc-medical", "Medical devices (syringes, diagnostic kits)"),
        leaf("hc-medical", "Durable medical equipment (wheelchairs, beds)"),
      ]),
      branch("hc-products", "Personal Care Products", [
        leaf("hc-personal", "Infant care products"),
        leaf("hc-personal", "Mobility aids"),
        leaf("hc-personal", "Nutritional supplements"),
      ]),
    ]),
    branch("healthcare", "Services", [
      branch("hc-services", "Healthcare Services", [
        leaf("hc-svc", "Physician and surgeon services"),
        leaf("hc-svc", "Hospital inpatient and outpatient care"),
        leaf("hc-svc", "Nursing care facilities"),
        leaf("hc-svc", "Dental services"),
        leaf("hc-svc", "Outpatient clinics"),
        leaf("hc-svc", "Emergency medical services"),
      ]),
      branch("hc-services", "Social Assistance", [
        leaf("hc-social", "Child care services"),
        leaf("hc-social", "Family and community services"),
        leaf("hc-social", "Elderly care"),
        leaf("hc-social", "Residential rehab facilities"),
        leaf("hc-social", "Counseling and shelter services"),
      ]),
    ]),
  ],
};

const arts: TaxonomyNode = {
  id: "arts",
  label: "Arts, Entertainment & Recreation",
  children: [
    branch("arts", "Products", [
      branch("arts-products", "Cultural Products", [
        leaf("arts-cultural", "Fine arts (paintings, sculptures)"),
        leaf("arts-cultural", "Books and magazines (art, sports)"),
        leaf("arts-cultural", "Music recordings"),
        leaf("arts-cultural", "Films and videos"),
        leaf("arts-cultural", "Sports memorabilia"),
      ]),
    ]),
    branch("arts", "Services", [
      branch("arts-services", "Performing Arts", [
        leaf("arts-performing", "Live theater"),
        leaf("arts-performing", "Music concerts"),
        leaf("arts-performing", "Dance shows"),
        leaf("arts-performing", "Opera"),
        leaf("arts-performing", "Comedy clubs"),
      ]),
      branch("arts-services", "Spectator Sports", [
        leaf("arts-sports", "Professional sports teams"),
        leaf("arts-sports", "Sports leagues"),
        leaf("arts-sports", "Racetracks"),
        leaf("arts-sports", "Physical fitness facilities"),
      ]),
      branch("arts-services", "Recreation & Amusement", [
        leaf("arts-recreation", "Amusement parks"),
        leaf("arts-recreation", "Museums and galleries"),
        leaf("arts-recreation", "Zoos and aquariums"),
        leaf("arts-recreation", "Fitness centers"),
        leaf("arts-recreation", "Gambling (casinos, lotteries)"),
      ]),
      branch("arts-services", "Entertainment Media", [
        leaf("arts-media", "Movie theaters"),
        leaf("arts-media", "Streaming services"),
        leaf("arts-media", "Broadcasting events"),
      ]),
    ]),
  ],
};

const accommodation: TaxonomyNode = {
  id: "accommodation",
  label: "Accommodation & Food Services",
  children: [
    branch("accommodation", "Products", [
      branch("accom-products", "Food & Beverage Products", [
        leaf("accom-food", "Prepared meals"),
        leaf("accom-food", "Packaged foods"),
        leaf("accom-food", "Soft drinks"),
        leaf("accom-food", "Alcoholic beverages"),
      ]),
    ]),
    branch("accommodation", "Services", [
      branch("accom-services", "Accommodation", [
        leaf("accom-svc", "Hotels and motels"),
        leaf("accom-svc", "Bed and breakfasts"),
        leaf("accom-svc", "Campgrounds and RV parks"),
      ]),
      branch("accom-services", "Food Services", [
        leaf("accom-food-svc", "Restaurants"),
        leaf("accom-food-svc", "Cafes"),
        leaf("accom-food-svc", "Fast food services"),
        leaf("accom-food-svc", "Catering services"),
        leaf("accom-food-svc", "Food delivery"),
      ]),
      branch("accom-services", "Beverage Services", [
        leaf("accom-bev", "Bars and taverns"),
        leaf("accom-bev", "Coffee shops"),
      ]),
      branch("accom-services", "Hospitality", [
        leaf("accom-hosp", "Event hosting"),
        leaf("accom-hosp", "Banquet services"),
        leaf("accom-hosp", "Room service"),
      ]),
    ]),
  ],
};

const otherServices: TaxonomyNode = {
  id: "other-services",
  label: "Other Services",
  children: [
    branch("other-services", "Services", [
      branch("other-svc", "Automotive & Machinery Repair", [
        leaf("other-auto", "Auto repair shops"),
        leaf("other-auto", "Electric motor repair"),
        leaf("other-auto", "Plumbing and HVAC repair"),
      ]),
      branch("other-svc", "Personal Care Services", [
        leaf("other-personal", "Barber shops"),
        leaf("other-personal", "Beauty salons"),
        leaf("other-personal", "Dry cleaning"),
        leaf("other-personal", "Photography studios"),
        leaf("other-personal", "Pet care"),
      ]),
      branch("other-svc", "Religious & Civic Organizations", [
        leaf("other-civic", "Places of worship"),
        leaf("other-civic", "Grantmaking and advocacy organizations"),
        leaf("other-civic", "Business and professional associations"),
      ]),
      branch("other-svc", "Private Household Services", [
        leaf("other-household", "Household staffing (nannies, cleaners)"),
        leaf("other-household", "Domestic services"),
      ]),
    ]),
  ],
};

/* ────────────────────── Export ────────────────────── */

export const INDUSTRY_TAXONOMY: TaxonomyNode[] = [
  agriculture,
  mining,
  construction,
  manufacturing,
  wholesale,
  retail,
  transportation,
  utilities,
  information,
  finance,
  realEstate,
  professional,
  management,
  admin,
  education,
  healthcare,
  arts,
  accommodation,
  otherServices,
];

/** Count leaf nodes recursively */
export function countLeaves(node: TaxonomyNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}
