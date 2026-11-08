/**
 * P5b (D-146): the authored catalogue of the 1900 world — the 58 goods (docs/P5B_PLAN.md
 * §1) and the building recipes that make them. Every quantity here is a provisional
 * planning value with its reasoning in the comment or in `docs/P5B_PLAN.md` §1; the
 * builder (`build-goods-1900.mjs`) turns them into validated definitions, derives the
 * reference prices from the cited source rows and sizes outputs per throughput unit.
 *
 * Goods 0-7 keep the ids, keys and P2b prices of the existing catalogue (C-18); only
 * their names change. Goods 8-56 follow the plan's catalogue order; good 57, jewellery and
 * plate, was added by the designer's decision of 2026-11-08 (D-152).
 */

/** Goods: [id, key, name, unit, category, group, storable, tradeable]. */
export const GOODS = [
  [0, "grain", "Grain", "kg", "food", "food-agriculture"],
  [1, "livestock", "Meat", "kg", "food", "food-agriculture"],
  [2, "fish", "Fish", "kg", "food", "food-agriculture"],
  [3, "cotton", "Cotton", "kg", "raw", "fibres-forest"],
  [4, "wool", "Wool", "kg", "raw", "fibres-forest"],
  [5, "textiles", "Textiles", "kg", "industrial", "industrial-materials"],
  [6, "clothing", "Clothing", "garment", "industrial", "consumer-manufactures"],
  [7, "food-products", "Processed food and drink", "kg", "food", "food-agriculture"],
  [8, "dairy", "Dairy and eggs", "kg milk-eq.", "food", "food-agriculture"],
  [9, "produce", "Fruit and vegetables", "kg", "food", "food-agriculture"],
  [10, "sugar", "Sugar", "kg", "food", "food-agriculture"],
  [11, "coffee-tea-cocoa", "Coffee, tea and cocoa", "kg", "food", "food-agriculture"],
  [12, "tobacco", "Tobacco", "kg", "raw", "food-agriculture"],
  [13, "rubber", "Rubber", "kg", "raw", "fibres-forest"],
  [14, "timber", "Timber", "m³", "raw", "fibres-forest"],
  [15, "paper", "Paper", "t", "industrial", "fibres-forest"],
  [16, "coal", "Coal", "t", "raw", "mining"],
  [17, "crude-oil", "Crude oil", "t", "raw", "mining"],
  [18, "natural-gas", "Natural gas", "1,000 m³", "raw", "mining", true, true, "pipelines"],
  [19, "iron-ore", "Iron ore", "t Fe", "raw", "mining"],
  [20, "copper-ore", "Copper ore", "t Cu", "raw", "mining"],
  [21, "bauxite", "Bauxite", "t", "raw", "mining"],
  [22, "nitrates", "Nitrates", "t N", "raw", "mining"],
  [23, "uranium", "Uranium", "t U", "raw", "mining"],
  [24, "tin", "Tin", "t", "raw", "mining"],
  [25, "gold", "Gold", "kg", "raw", "mining"],
  [26, "silver", "Silver", "kg", "raw", "mining"],
  [27, "kerosene", "Kerosene", "t", "industrial", "energy"],
  [28, "petrol", "Petrol", "t", "industrial", "energy"],
  [29, "fuel-oil", "Diesel and fuel oil", "t", "industrial", "energy"],
  [30, "electricity", "Electricity", "MWh", "industrial", "energy", false, false],
  [31, "steel", "Steel", "t", "industrial", "industrial-materials"],
  [32, "copper", "Copper", "t", "industrial", "industrial-materials"],
  [33, "aluminium", "Aluminium", "t", "industrial", "industrial-materials"],
  [34, "chemicals", "Chemicals", "t", "industrial", "industrial-materials"],
  [35, "fertiliser", "Fertiliser", "t nutrient", "industrial", "industrial-materials"],
  [36, "plastics", "Plastics", "t", "industrial", "industrial-materials"],
  [37, "construction-materials", "Construction materials", "t", "industrial", "industrial-materials"],
  [38, "machinery", "Machinery", "t", "industrial", "capital-equipment"],
  [39, "electrical-equipment", "Electrical equipment", "t", "industrial", "capital-equipment"],
  [40, "electronic-components", "Electronic components", "unit-eq.", "industrial", "capital-equipment"],
  [41, "motor-vehicles", "Motor vehicles", "vehicle", "industrial", "capital-equipment"],
  [42, "aircraft", "Aircraft", "t airframe", "industrial", "capital-equipment"],
  [43, "ships", "Ships", "gross tonne", "industrial", "capital-equipment"],
  [44, "armaments", "Armaments", "equipment unit", "industrial", "capital-equipment"],
  [45, "household-goods", "Household goods", "unit-eq.", "industrial", "consumer-manufactures"],
  [46, "appliances", "Household appliances", "appliance", "luxury", "consumer-manufactures"],
  [47, "radios", "Radios", "device", "luxury", "consumer-manufactures"],
  [48, "televisions", "Televisions", "device", "luxury", "consumer-manufactures"],
  [49, "computers", "Computers", "device", "luxury", "consumer-manufactures"],
  [50, "mobile-phones", "Mobile phones", "device", "luxury", "consumer-manufactures"],
  [51, "pharmaceuticals", "Pharmaceuticals", "dose-eq.", "industrial", "consumer-manufactures"],
  [52, "commerce", "Commerce", "service unit", "service", "services", false, false],
  [53, "transport-services", "Transport services", "service unit", "service", "services", false, false],
  [54, "communication", "Communication", "service unit", "service", "services", false, false],
  [55, "finance-services", "Finance and professional services", "service unit", "service", "services", false, false],
  [56, "personal-services", "Personal and recreation services", "service unit", "service", "services", false, false],
  // D-152: jewellery, plate and watch cases, made from gold and silver by jewellers; a
  // luxury need. 1 unit = 1 US dollar of 1900 wares at wholesale.
  [57, "jewellery", "Jewellery and plate", "unit-eq.", "luxury", "consumer-manufactures"],
];

/**
 * Maintenance of electrical plant (power stations, post and telegraph): electrical
 * equipment, the rest as the default mix (provisional; D-146 A6, D-148).
 */
/** Output elasticity of a minor optional material (D-148, provisional). */
const MINOR_INPUT_ELASTICITY = 0.05;

const ELECTRICAL_MAINTENANCE = { "electrical-equipment": 0.5, machinery: 0.25, "construction-materials": 0.25 };

/**
 * New building definitions. Recipes are per unit of the first output (`perOutput`):
 * inputs, further joint outputs and optional inputs are physical units per unit of the
 * main output; the builder sizes the main output per throughput unit (1,000 jobs) so
 * that a level at US 1900 wages and reference prices earns its wage bill ÷ labour
 * share + upkeep (the P2b rule, D-135 A3), i.e. technique 1 in the United States.
 *
 * Fields: key, name, sector, main output, inputs {good: perOutput}, jobs {profession:
 * share}, gate (technology key or null), extracts, landUse, maxAbsLatitudeDeg,
 * jointOutputs {good: perOutput}, optionalInputs {good: [perOutput, elasticity]},
 * maintenanceMix {good: share of the maintenance value} where it differs from
 * MAINTENANCE_MIX.
 *
 * Minor materials are optional inputs (bought when the market has them; output falls by
 * MINOR_INPUT_ELASTICITY when it has none), so one missing import does not stop a works
 * (D-148). 1900 buyers (D-148, provisional quantities): rubber goes to belting, hose and tyres
 * (transport companies, 0.5 g per service unit, about 1.7 % of its value; world 1900 use was about 53 kt) and to cable insulation (electrical works,
 * 10 kg per t); aluminium to cooking utensils (housewares, 10 g per unit, about 1 % of
 * its value); tin to bearing metal and solder (machine and electrical works, 5 kg per t).
 */
export const BUILDINGS = [
  // Food and agriculture
  { key: "dairy-farm", name: "Dairy Farm", sector: "agriculture", output: "dairy", inputs: { grain: 0.3 }, jobs: { peasants: 1 }, landUse: "pasture" },
  { key: "market-garden", name: "Market Garden", sector: "agriculture", output: "produce", inputs: {}, jobs: { peasants: 1 }, landUse: "cropland" },
  { key: "sugar-estate", name: "Sugar Estate", sector: "agriculture", output: "sugar", inputs: {}, jobs: { peasants: 0.8, laborers: 0.2 }, landUse: "cropland", maxAbsLatitudeDeg: 32 },
  { key: "beet-sugar-works", name: "Beet Sugar Works", sector: "food-processing", output: "sugar", inputs: { coal: 0.0005 }, jobs: { peasants: 0.5, laborers: 0.5 }, landUse: "cropland" },
  { key: "plantation", name: "Plantation (coffee, tea, cocoa)", sector: "agriculture", output: "coffee-tea-cocoa", inputs: {}, jobs: { peasants: 1 }, landUse: "cropland", maxAbsLatitudeDeg: 36 },
  { key: "tobacco-farm", name: "Tobacco Farm", sector: "agriculture", output: "tobacco", inputs: {}, jobs: { peasants: 1 }, landUse: "cropland" },
  { key: "cotton-farm", name: "Cotton Farm", sector: "agriculture", output: "cotton", inputs: {}, jobs: { peasants: 1 }, landUse: "cropland", maxAbsLatitudeDeg: 42 },
  { key: "food-and-drink-works", name: "Food and Drink Works", sector: "food-processing", output: "food-products", inputs: { grain: 0.5, sugar: 0.05, produce: 0.2, coal: 0.0003 }, jobs: { laborers: 0.8, clerks: 0.2 } },
  // Fibres and forest
  { key: "rubber-estate", name: "Rubber Estate", sector: "agriculture", output: "rubber", inputs: {}, jobs: { peasants: 1 }, maxAbsLatitudeDeg: 15 },
  { key: "synthetic-rubber-plant", name: "Synthetic Rubber Plant", sector: "manufacturing", output: "rubber", inputs: { chemicals: 0.0008, "crude-oil": 0.0015 }, jobs: { laborers: 0.8, clerks: 0.2 }, gate: "petrochemicals" },
  { key: "logging-camp", name: "Logging Camp and Sawmill", sector: "mining", output: "timber", inputs: {}, jobs: { laborers: 1 }, extracts: "timber" },
  { key: "paper-mill", name: "Paper Mill", sector: "manufacturing", output: "paper", inputs: { timber: 3, chemicals: 0.15, coal: 1.5 }, jobs: { laborers: 0.9, clerks: 0.1 } },
  // Mining
  { key: "coal-mine", name: "Coal Mine", sector: "mining", output: "coal", inputs: {}, jobs: { laborers: 1 }, extracts: "coal" },
  { key: "oil-field", name: "Oil Field", sector: "mining", output: "crude-oil", inputs: {}, jobs: { laborers: 1 }, extracts: "oil" },
  { key: "gas-field", name: "Gas Field", sector: "mining", output: "natural-gas", inputs: {}, jobs: { laborers: 1 }, extracts: "gas" },
  { key: "iron-mine", name: "Iron Mine", sector: "mining", output: "iron-ore", inputs: {}, jobs: { laborers: 1 }, extracts: "iron" },
  { key: "copper-mine", name: "Copper Mine", sector: "mining", output: "copper-ore", inputs: { coal: 2 }, jobs: { laborers: 1 }, extracts: "copper" },
  { key: "bauxite-mine", name: "Bauxite Mine", sector: "mining", output: "bauxite", inputs: {}, jobs: { laborers: 1 }, extracts: "bauxite" },
  { key: "nitrate-works", name: "Nitrate Works (oficina)", sector: "mining", output: "nitrates", inputs: { coal: 3 }, jobs: { laborers: 1 }, extracts: "nitrate" },
  { key: "uranium-mine", name: "Uranium Mine", sector: "mining", output: "uranium", inputs: {}, jobs: { laborers: 1 }, extracts: "uranium", gate: "nuclear-power" },
  { key: "tin-mine", name: "Tin Mine and Smelter", sector: "mining", output: "tin", inputs: { coal: 2 }, jobs: { laborers: 1 }, extracts: "tin" },
  { key: "gold-mine", name: "Gold Mine", sector: "mining", output: "gold", inputs: { chemicals: 0.05 }, jobs: { laborers: 1 }, extracts: "gold" },
  { key: "silver-mine", name: "Silver Mine", sector: "mining", output: "silver", inputs: { chemicals: 0.005 }, jobs: { laborers: 1 }, extracts: "silver" },
  // Energy (refinery joint yields: Census 1900 refining is about 58 % illuminating oil,
  // 13 % naphtha and gasoline, the rest fuel oil, residuum and lubricants; provisional)
  { key: "oil-refinery", name: "Oil Refinery", sector: "energy", output: "kerosene", inputs: { "crude-oil": 1 / 0.58 }, jointOutputs: { petrol: 0.13 / 0.58, "fuel-oil": 0.25 / 0.58 }, jobs: { laborers: 0.9, clerks: 0.1 } },
  { key: "coal-power-station", name: "Coal Power Station", sector: "energy", output: "electricity", inputs: { coal: 3 }, jobs: { laborers: 0.8, clerks: 0.2 }, gate: "electrical-generation", maintenanceMix: ELECTRICAL_MAINTENANCE },
  { key: "oil-power-station", name: "Oil Power Station", sector: "energy", output: "electricity", inputs: { "fuel-oil": 0.6 }, jobs: { laborers: 0.8, clerks: 0.2 }, gate: "electrical-generation", maintenanceMix: ELECTRICAL_MAINTENANCE },
  { key: "gas-power-station", name: "Gas Power Station", sector: "energy", output: "electricity", inputs: { "natural-gas": 0.6 }, jobs: { laborers: 0.8, clerks: 0.2 }, gate: "electrical-generation", maintenanceMix: ELECTRICAL_MAINTENANCE },
  { key: "hydro-station", name: "Hydroelectric Station", sector: "energy", output: "electricity", inputs: {}, jobs: { laborers: 0.8, clerks: 0.2 }, gate: "electrical-generation", maintenanceMix: ELECTRICAL_MAINTENANCE, usesHydroPotential: true },
  { key: "nuclear-station", name: "Nuclear Power Station", sector: "energy", output: "electricity", inputs: { uranium: 0.00003 }, jobs: { laborers: 0.6, clerks: 0.2, academics: 0.2 }, gate: "nuclear-power", maintenanceMix: ELECTRICAL_MAINTENANCE },
  // Industrial materials
  { key: "steel-works", name: "Steel Works", sector: "manufacturing", output: "steel", inputs: { "iron-ore": 1.05, coal: 2 }, jobs: { laborers: 0.95, clerks: 0.05 }, gate: "steelmaking" },
  { key: "copper-smelter", name: "Copper Smelter and Refinery", sector: "manufacturing", output: "copper", inputs: { "copper-ore": 1.02, coal: 1.5 }, jobs: { laborers: 0.95, clerks: 0.05 } },
  { key: "aluminium-works", name: "Aluminium Works", sector: "manufacturing", output: "aluminium", inputs: { bauxite: 4, electricity: 22, coal: 0.6 }, jobs: { laborers: 0.9, clerks: 0.1 }, gate: "electrical-generation" },
  { key: "alkali-and-acid-works", name: "Alkali and Acid Works", sector: "manufacturing", output: "chemicals", inputs: { coal: 2 }, optionalInputs: { nitrates: [0.02, MINOR_INPUT_ELASTICITY] }, jobs: { laborers: 0.85, clerks: 0.1, academics: 0.05 } },
  { key: "petrochemical-plant", name: "Petrochemical Plant", sector: "manufacturing", output: "chemicals", inputs: { "crude-oil": 1.2 }, jobs: { laborers: 0.8, clerks: 0.1, academics: 0.1 }, gate: "petrochemicals" },
  { key: "fertiliser-works", name: "Fertiliser Works", sector: "manufacturing", output: "fertiliser", inputs: { nitrates: 0.8, chemicals: 0.5 }, jobs: { laborers: 0.9, clerks: 0.1 }, gate: "chemical-fertilizer" },
  { key: "nitrogen-fixation-plant", name: "Nitrogen Fixation Plant", sector: "manufacturing", output: "fertiliser", inputs: { "natural-gas": 1.5, electricity: 2 }, jobs: { laborers: 0.8, clerks: 0.1, academics: 0.1 }, gate: "nitrogen-fixation" },
  { key: "plastics-plant", name: "Plastics Plant", sector: "manufacturing", output: "plastics", inputs: { chemicals: 1.2, "crude-oil": 0.3 }, jobs: { laborers: 0.8, clerks: 0.1, academics: 0.1 }, gate: "plastics" },
  { key: "cement-and-brick-works", name: "Cement and Brick Works", sector: "manufacturing", output: "construction-materials", inputs: { coal: 0.25 }, jobs: { laborers: 1 } },
  { key: "synthetic-fibre-plant", name: "Synthetic Fibre Plant", sector: "textiles", output: "textiles", inputs: { chemicals: 0.0012 }, jobs: { laborers: 0.8, clerks: 0.1, academics: 0.1 }, gate: "synthetic-fibers" },
  // Capital and transport equipment
  { key: "machine-works", name: "Machine Works", sector: "manufacturing", output: "machinery", inputs: { steel: 1.1, coal: 1 }, optionalInputs: { copper: [0.03, MINOR_INPUT_ELASTICITY], tin: [0.005, MINOR_INPUT_ELASTICITY] }, jobs: { laborers: 0.85, clerks: 0.15 } },
  { key: "electrical-works", name: "Electrical Works", sector: "manufacturing", output: "electrical-equipment", inputs: { copper: 0.4, steel: 0.7 }, optionalInputs: { rubber: [10, MINOR_INPUT_ELASTICITY], tin: [0.005, MINOR_INPUT_ELASTICITY] }, jobs: { laborers: 0.8, clerks: 0.15, academics: 0.05 }, gate: "electrical-generation" },
  { key: "electronics-plant", name: "Electronics Plant", sector: "manufacturing", output: "electronic-components", inputs: { chemicals: 0.00002, plastics: 0.00002, copper: 0.00001 }, jobs: { laborers: 0.6, clerks: 0.2, academics: 0.2 }, gate: "transistors" },
  { key: "motor-works", name: "Motor Works", sector: "manufacturing", output: "motor-vehicles", inputs: { steel: 1.0, rubber: 50, machinery: 0.1, textiles: 10, "construction-materials": 0.03 }, jobs: { laborers: 0.85, clerks: 0.15 }, gate: "internal-combustion" },
  { key: "aircraft-works", name: "Aircraft Works", sector: "manufacturing", output: "aircraft", inputs: { aluminium: 0.7, machinery: 0.3, "electronic-components": 20000 }, jobs: { laborers: 0.7, clerks: 0.15, academics: 0.15 }, gate: "air-transport" },
  { key: "shipyard", name: "Shipyard", sector: "manufacturing", output: "ships", inputs: { steel: 0.45, machinery: 0.1, timber: 0.3 }, jobs: { laborers: 0.9, clerks: 0.1 } },
  { key: "arsenal", name: "Arsenal", sector: "manufacturing", output: "armaments", inputs: { steel: 0.5, chemicals: 0.05, machinery: 0.05 }, jobs: { laborers: 0.85, clerks: 0.15 } },
  // Consumer manufactures
  { key: "furniture-works", name: "Furniture and Housewares Works", sector: "manufacturing", output: "household-goods", inputs: { timber: 0.02, textiles: 0.3 }, optionalInputs: { steel: [0.0002, MINOR_INPUT_ELASTICITY], aluminium: [0.00001, MINOR_INPUT_ELASTICITY] }, jobs: { laborers: 0.9, clerks: 0.1 } },
  { key: "appliance-works", name: "Appliance Works", sector: "manufacturing", output: "appliances", inputs: { steel: 0.06, "electrical-equipment": 0.01, plastics: 0.01 }, jobs: { laborers: 0.85, clerks: 0.15 }, gate: "refrigeration" },
  { key: "radio-works", name: "Radio Works", sector: "manufacturing", output: "radios", inputs: { "electrical-equipment": 0.003, plastics: 0.001 }, jobs: { laborers: 0.8, clerks: 0.2 }, gate: "radio" },
  { key: "television-works", name: "Television Works", sector: "manufacturing", output: "televisions", inputs: { "electronic-components": 60, plastics: 0.005 }, jobs: { laborers: 0.8, clerks: 0.2 }, gate: "television" },
  { key: "computer-works", name: "Computer Works", sector: "manufacturing", output: "computers", inputs: { "electronic-components": 600, plastics: 0.005 }, jobs: { laborers: 0.6, clerks: 0.2, academics: 0.2 }, gate: "personal-computers" },
  { key: "phone-works", name: "Mobile Phone Works", sector: "manufacturing", output: "mobile-phones", inputs: { "electronic-components": 150, plastics: 0.0002 }, jobs: { laborers: 0.6, clerks: 0.2, academics: 0.2 }, gate: "mobile-telephony" },
  // D-152: the jewellers' work is the value added; the gold and silver per unit come from
  // the Director of the Mint's 1900 industrial consumption (new metal only) and the
  // provisional metal share of value (`metalRecipe`, filled by the builder). Jewellers
  // are labourers and clerks until P7 adds artisan professions (provisional).
  { key: "jewellery-workshop", name: "Jeweller and Silversmith", sector: "manufacturing", output: "jewellery", inputs: {}, metalRecipe: true, jobs: { laborers: 0.8, clerks: 0.2 } },
  { key: "pharmaceutical-works", name: "Pharmaceutical Works", sector: "manufacturing", output: "pharmaceuticals", inputs: { chemicals: 0.00001 }, jobs: { laborers: 0.6, clerks: 0.2, academics: 0.2 } },
  // Services (jobs from the five current professions; P7 adds the rest)
  { key: "trading-house", name: "Trading House", sector: "services", output: "commerce", inputs: { paper: 0.000002 }, jobs: { clerks: 0.6, laborers: 0.4 } },
  { key: "transport-company", name: "Railway and Shipping Company", sector: "services", output: "transport-services", inputs: { coal: 0.004 }, optionalInputs: { rubber: [0.0005, MINOR_INPUT_ELASTICITY] }, jobs: { laborers: 0.8, clerks: 0.2 }, maintenanceMix: { ships: 0.4, machinery: 0.4, "construction-materials": 0.2 } },
  { key: "post-and-telegraph", name: "Post and Telegraph Office", sector: "services", output: "communication", inputs: {}, jobs: { clerks: 0.7, laborers: 0.3 }, maintenanceMix: ELECTRICAL_MAINTENANCE },
  { key: "bank-and-office", name: "Bank and Office", sector: "services", output: "finance-services", inputs: { paper: 0.000003 }, jobs: { clerks: 0.7, capitalists: 0.15, academics: 0.15 } },
  { key: "personal-services", name: "Personal and Recreation Services", sector: "services", output: "personal-services", inputs: {}, jobs: { laborers: 0.7, clerks: 0.3 } },
];

/**
 * Maintenance (D-146 A6): the share of a building's money upkeep that is bought as
 * goods, and how that value splits between goods (provisional). The rest stays money.
 */
export const MAINTENANCE_SHARE_OF_UPKEEP = 0.5;
export const MAINTENANCE_MIX = { machinery: 0.5, "construction-materials": 0.5 };
/** Construction materials of a new building, as a share of its construction cost at reference prices. */
export const CONSTRUCTION_MATERIAL_SHARE = 0.2;
export const CONSTRUCTION_MATERIAL_MIX = { "construction-materials": 0.6, machinery: 0.4 };

/** Fertiliser as an optional input of the farms that can use it (C-9): kg N per kg grain, elasticity. */
export const FERTILISER_OPTIONAL = { buildings: ["commercial-farm", "commercial-farm-peasant", "mechanized-farm"], perOutput: 0.002, outputElasticity: 0.2 };

/** Technologies the catalogue adds (data version m3-economy-v13). */
export const NEW_TECHNOLOGIES = [
  { key: "pipelines", name: "Pipelines", era: 2, prerequisites: ["steelmaking"], description: "Long-distance pipelines: natural gas can be traded between markets (P5b, C-15)." },
  { key: "nuclear-power", name: "Nuclear power", era: 3, prerequisites: ["electrification", "industrial-laboratories"], description: "Nuclear fission power: uranium mines and nuclear power stations (P5b)." },
];
