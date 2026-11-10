/**
 * P7 (D-154): the 1900 labour market of the 1900 world — sixteen professions, sourced
 * 1900 occupation shares, the job, owner and institution remaps, 1900 wages and the
 * blocks' urban shares. Called by scripts/p5b/build-goods-1900.mjs before placement
 * (the pops it returns size and place the buildings) and after it (owners, incomes).
 *
 * Method (docs/P7_PLAN.md §3, §9; every provisional value is a named constant below or a
 * provisional row of historical/p7/sources_1900.json, and is listed in
 * docs/P7_LABOUR_PROVENANCE.md):
 *  1. Professions (plan §3.2): ids 0-4 keep the 1900 world's professions; 5-15 are new.
 *     Roles, gates, entry and settlement as the plan's table. Participation of the new
 *     professions is that of the profession they are carved from (P7 provisional;
 *     re-deriving it from dependants by group is possible only for Germany 1907, reported).
 *     Reference wages: the US laborer wage × the US 1900 ratio of the profession's
 *     earnings to the laborer's (P2b method; Historical Statistics of the United States
 *     series D 739-764 and D 779-793, or a provisional ratio row).
 *  2. Occupation shares (plan §3.3; docs/P7_OCCUPATIONS_1900.md R1-R11, implemented in
 *     scripts/p7/occupations.mjs): each census territory's groups (Webb 1911) are mapped to
 *     professions through GROUP_TO_PROFESSIONS, corrected by the status-in-employment,
 *     farm-holding and army rows; territories without a census take a least-squares fit on
 *     ln real GDP per head and urban share, with their agriculture re-split by the same
 *     agrarian rules.
 *  3. Within a territory (plan §3.3): rural professions by rural population, urban by urban
 *     population, by-job by total population (the P2 rule generalised); integer people by
 *     largest remainder, so each territory's population is exact.
 *  4. Servicemen, officers and clergy (plan Q2a) are placed in laborers, bureaucrats and
 *     academics until their stages; their census counts are reported.
 */

export const P7_PROFESSIONS = [
  { id: 0, key: "peasants", name: "Peasants", stratum: "lower", from: "peasants", roles: ["subsistence"], gates: [], settlement: "rural", wage: { ratioOf: "peasants" } },
  { id: 1, key: "laborers", name: "Laborers", stratum: "lower", from: "laborers", roles: ["wage-labour"], gates: [], settlement: "by-job", wage: { ratioOf: "laborers" } },
  { id: 2, key: "clerks", name: "Clerks", stratum: "middle", from: "clerks", roles: ["wage-labour"], gates: ["literacy"], settlement: "urban", wage: { ratioOf: "clerks" } },
  { id: 3, key: "capitalists", name: "Capitalists", stratum: "upper", from: "capitalists", roles: ["owns-capital", "management"], gates: ["capital"], settlement: "urban", wage: { ratioOf: "capitalists" } },
  { id: 4, key: "academics", name: "Academics", stratum: "middle", from: "academics", roles: ["research", "training"], gates: ["literacy", "training"], courseLengthYears: 5, settlement: "urban", wage: { usd: "us-earn-clerical-1900", provisional: "academic-to-clerical-wage" } },
  { id: 5, key: "farmers", name: "Farmers", stratum: "middle", from: "peasants", roles: ["owner-operator"], gates: ["capital"], settlement: "rural", wage: { ratioOf: "laborers", provisional: "farmer-to-laborer-wage" } },
  { id: 6, key: "attendants", name: "Attendants", stratum: "lower", from: "laborers", roles: ["wage-labour"], gates: [], settlement: "urban", wage: { usd: "us-earn-personal-services-1900" } },
  { id: 7, key: "servicemen", name: "Servicemen", stratum: "lower", from: "laborers", roles: ["military-enlisted"], gates: ["law"], settlement: "by-job", wage: { ratioOf: "laborers", provisional: "serviceman-to-laborer-wage" } },
  { id: 8, key: "officers", name: "Officers", stratum: "middle", from: "clerks", roles: ["military-command"], gates: ["literacy", "training", "law"], courseLengthYears: 3, settlement: "by-job", wage: { usd: "us-earn-federal-1900", provisional: "officer-to-federal-wage" } },
  { id: 9, key: "shopkeepers", name: "Shopkeepers", stratum: "middle", from: "clerks", roles: ["owner-operator"], gates: ["capital"], settlement: "urban", wage: { usd: "us-earn-trade-1900", provisional: "shopkeeper-to-trade-wage" } },
  { id: 10, key: "teachers", name: "Teachers", stratum: "middle", from: "academics", roles: ["education"], gates: ["literacy", "training"], courseLengthYears: 2, settlement: "by-job", wage: { ratioOf: "academics" } },
  { id: 11, key: "medics", name: "Medics", stratum: "middle", from: "academics", roles: ["health"], gates: ["literacy", "training"], courseLengthYears: 5, settlement: "by-job", wage: { usd: "us-earn-clerical-1900", provisional: "medic-to-clerical-wage" } },
  { id: 12, key: "engineers", name: "Engineers", stratum: "middle", from: "academics", roles: ["wage-labour", "technical"], gates: ["literacy", "training"], courseLengthYears: 4, settlement: "urban", wage: { usd: "us-earn-clerical-1900", provisional: "engineer-to-clerical-wage" } },
  { id: 13, key: "bureaucrats", name: "Bureaucrats", stratum: "middle", from: "clerks", roles: ["administration"], gates: ["literacy"], settlement: "urban", wage: { usd: "us-earn-federal-1900" } },
  { id: 14, key: "clergy", name: "Clergy", stratum: "middle", from: "academics", roles: ["clergy"], gates: ["literacy", "law"], settlement: "by-job", wage: { usd: "us-earn-ministers-1900" } },
  { id: 15, key: "aristocrats", name: "Aristocrats", stratum: "upper", from: "capitalists", roles: ["owns-land"], gates: [], entry: "closed", settlement: "rural", wage: { ratioOf: "capitalists", provisional: "aristocrat-to-capitalist-wage" } },
];

/** Professions populated in 1900 (plan Q2a: servicemen, officers and clergy wait). */
export const INTERIM_PLACEMENT = { servicemen: "laborers", officers: "bureaucrats", clergy: "academics" };

/**
 * Literacy of a literacy-gated new block (teachers, medics, engineers, bureaucrats):
 * P7 provisional. The census professions that need reading were literate almost to a
 * person; the old source block's literacy (a profession mix) understates it.
 */
export const LITERATE_PROFESSION_LITERACY = 0.98;

/**
 * Status-in-employment splits of census groups into professions (plan §3.3). All
 * PROVISIONAL (no census with employment status was transcribed for these groups); each
 * row sums to 1. Agriculture is handled by `splitAgriculture`.
 */
export const GROUP_TO_PROFESSIONS = {
  mining: { laborers: 0.97, clerks: 0.02, engineers: 0.01 },
  manufacturing: { laborers: 0.72, shopkeepers: 0.18, clerks: 0.05, capitalists: 0.03, engineers: 0.02 },
  building: { laborers: 0.85, shopkeepers: 0.12, capitalists: 0.03 },
  trade: { shopkeepers: 0.45, attendants: 0.35, clerks: 0.15, capitalists: 0.05 },
  transport: { laborers: 0.6, attendants: 0.3, clerks: 0.1 },
  "trade-transport": { shopkeepers: 0.27, attendants: 0.33, clerks: 0.13, capitalists: 0.03, laborers: 0.24 },
  "commercial-clerks": { clerks: 1 },
  "domestic-service": { attendants: 1 },
  "personal-service": { attendants: 1 },
  "public-administration": { bureaucrats: 1 },
  defence: { servicemen: 0.93, officers: 0.07 },
  teaching: { teachers: 1 },
  medicine: { medics: 1 },
  clergy: { clergy: 1 },
  law: { academics: 1 },
  /** "Professions" without teachers and doctors split out: US 1900 professional service (Webb p.443). */
  professions: { teachers: 0.38, medics: 0.11, academics: 0.42, clergy: 0.09 },
  /** Remaining professions where teaching, medicine and clergy are rows of their own (censusGroups re-derives it from `professions` when only some are). */
  "professions-other": { academics: 1 },
  /** Webb p.428 "public service and professions", US 1900 composition (pp. 428, 443). */
  "public-professions": { bureaucrats: 0.16, teachers: 0.32, medics: 0.095, academics: 0.34, clergy: 0.085 },
  "general-labourers": { laborers: 1 },
  /** Webb's "others": mostly domestic and personal service and unspecified labour. */
  other: { attendants: 0.7, laborers: 0.3 },
  /** Mexico 1900 "propietarios y rentistas" (P7 provisional): owners of capital; landed estates come from the agrarian rule. */
  "owners-rentiers": { capitalists: 1 },
};

/**
 * Estate territories (plan §3.4): large estates owned by landed households in 1900 (Russia, the
 * Prussian east, the United Kingdom, Latin America, India's zamindari). Their aristocrat share
 * is sourced (Germany, Hungary, Russia) or the mean of those sources (scripts/p7/occupations.mjs
 * R6); the owner remap gives their estates to aristocrats.
 */
export const ESTATE_TERRITORIES = new Set(["rus-home", "deu-home", "gbr-home", "bin", "mex-home", "arg-home", "chl-home", "bra-home", "pru-home", "col-home", "ven-home", "ecu-home", "bol-home", "gua-home", "ury-home", "pry-home", "cub-home", "aut-home"]);

/**
 * Which census table serves each sourced territory, and how its rows nest. `table`
 * values match the page in the row locators. A detail row is carved out of its parent
 * aggregate; what remains of an aggregate keeps the aggregate's mapping.
 */
export const CENSUS_RECIPES = {
  "usa-home": { subjects: ["USA"], census: "1900", table: "p.443" },
  "gbr-home": { subjects: ["GBR"], census: "1901", table: "pp.430-431" },
  // p.428 (1907): the 1895 and 1907 "others" of p.439 include persons without occupation.
  "deu-home": { subjects: ["DEU"], census: "1907", table: "p.428" },
  // France's public service includes the army (Webb p.438); half of it is counted as
  // servicemen (P7 provisional, about the 1901 army's share).
  // Webb's note (a): France's manufactures include transport, so transport is carved out of them.
  "fra-home": { subjects: ["FRA"], census: "1901", table: ["p.428", "p.438"], parentOverrides: { transport: "manufacturing" }, groupOverrides: { "public-administration": { bureaucrats: 0.5, servicemen: 0.5 } } },
  "nld-home": { subjects: ["NLD"], census: "1899", table: ["p.428", "p.437"] },
  "bel-home": { subjects: ["BEL"], census: "1900", table: "p.438" },
  "che-home": { subjects: ["CHE"], census: "1900", table: "p.428" },
  "swe-home": { subjects: ["SWE"], census: "1900", table: "p.428" },
  "nor-home": { subjects: ["NOR"], census: "1900", table: "p.428" },
  "dnk-home": { subjects: ["DNK"], census: "1901", table: "p.428" },
  "rus-home": { subjects: ["RUS"], census: "1897", table: ["p.428", "p.442"] },
  "ita-home": { subjects: ["ITA"], census: "1901", table: ["p.428", "p.441"] },
  "aut-home": { subjects: ["AUT", "HUN"], census: "1900", table: "p.441" },
  bin: { subjects: ["IND"], census: "1901", table: "p.446" },
  cap: { subjects: ["ZAF-CAPE"], census: "1904", table: "p.446" },
  // Mexico 1900, Bertillon classes (not in Webb): mining is a class of its own, not part of
  // industry, and domestic work is not part of "diversas ocupaciones" (null: no parent).
  "mex-home": { subjects: ["MEX"], census: "1900", table: "Resumen 1900", source: "Censo 1900", parentOverrides: { mining: null, "domestic-service": null } },
  "aus-home": { subjects: ["AUS"], census: "1901", table: "p.447" },
};

/** Parent aggregate of each detail group. */
const PARENT = {
  "agri-owners": "agriculture",
  "agri-labourers": "agriculture",
  "agri-relatives": "agriculture",
  fishing: "agriculture",
  mining: "manufacturing",
  building: "manufacturing",
  trade: "trade-transport",
  transport: "trade-transport",
  "commercial-clerks": "trade",
  teaching: "public-professions",
  medicine: "public-professions",
  clergy: "public-professions",
  law: "public-professions",
  "public-administration": "public-professions",
  defence: "public-professions",
  professions: "public-professions",
  "domestic-service": "other",
  "personal-service": "other",
  "general-labourers": "other",
};

const sum = (values) => values.reduce((acc, value) => acc + value, 0);

/**
 * The census groups of one territory as a flat map that sums to its occupied population:
 * aggregates hold only what their detail rows did not take. Returns null when the rows
 * cannot be nested (reported).
 */
export function censusGroups(recipe, rows) {
  const tables = Array.isArray(recipe.table) ? recipe.table : [recipe.table];
  const own = rows.filter((row) => recipe.subjects.includes(row.subject) && row.census === recipe.census && tables.some((table) => row.locator.startsWith(table)));
  const groups = new Map();
  for (const row of own) groups.set(row.group, (groups.get(row.group) ?? 0) + row.value);
  let total = groups.get("total") ?? 0;
  groups.delete("total");
  const created = new Set();
  // A table that lists details but not their aggregate: the aggregate starts empty.
  for (const [group, parent] of Object.entries(PARENT)) {
    if (!groups.has(group) || groups.has(parent)) continue;
    const grand = PARENT[parent];
    if (grand !== undefined && groups.has(grand)) continue;
    groups.set(parent, 0);
    created.add(parent);
  }
  // Carve details out of their parents (commercial clerks out of trade first).
  const order = ["commercial-clerks", ...Object.keys(PARENT).filter((group) => group !== "commercial-clerks")];
  const notes = [];
  for (const group of order) {
    const value = groups.get(group);
    if (value === undefined) continue;
    let parent = recipe.parentOverrides !== undefined && group in recipe.parentOverrides ? (recipe.parentOverrides[group] ?? undefined) : PARENT[group];
    while (parent !== undefined && !groups.has(parent)) parent = PARENT[parent];
    if (parent === undefined) continue;
    const left = (groups.get(parent) ?? 0) - value;
    if (left < 0 && !created.has(parent) && left < -1) notes.push(`${group} exceeds what is left of ${parent} by ${String(Math.round(-left))}`);
    groups.set(parent, Math.max(0, left));
  }
  const listed = sum([...groups.values()].filter((value) => value > 0));
  if (total === 0) total = listed;
  // What no row names (a detail table that is not exhaustive) is manufacturing.
  if (total > listed * (1 + 1e-9)) groups.set("manufacturing", (groups.get("manufacturing") ?? 0) + (total - listed));
  for (const [group, value] of groups) if (!(value > 0)) groups.delete(group);
  // Professions in a table that also lists teaching or medicine are the remainder: the US
  // composition of "professions" without the professions that have rows of their own (the UK
  // 1901 row is "professional less clergy and teachers", so its medical men stay in it).
  let remainderMapping;
  if (groups.has("professions") && (groups.has("teaching") || groups.has("medicine"))) {
    groups.set("professions-other", groups.get("professions"));
    groups.delete("professions");
    const ownRow = { teachers: "teaching", medics: "medicine", clergy: "clergy" };
    const kept = Object.entries(GROUP_TO_PROFESSIONS.professions).filter(([profession]) => ownRow[profession] === undefined || !groups.has(ownRow[profession]));
    const keptSum = sum(kept.map(([, share]) => share));
    remainderMapping = Object.fromEntries(kept.map(([profession, share]) => [profession, share / keptSum]));
  }
  for (const [group, override] of Object.entries(recipe.groupOverrides ?? {})) {
    const value = groups.get(group);
    if (value === undefined) continue;
    groups.delete(group);
    groups.set(`${group}:override`, value);
    (recipe.overrideMappings ??= {})[`${group}:override`] = override;
  }
  const overrideMappings = { ...(recipe.overrideMappings ?? {}) };
  if (remainderMapping !== undefined) overrideMappings["professions-other"] = remainderMapping;
  return { groups, total: sum([...groups.values()]), notes, rows: own.map((row) => row.id), overrideMappings };
}

/** Largest remainder of an integer total over non-negative weights (ties: lower index). */
export function largestRemainder(total, weights) {
  const weightSum = sum(weights);
  if (!(weightSum > 0)) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / weightSum);
  const out = exact.map(Math.floor);
  let left = total - sum(out);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let k = 0; k < order.length && left > 0; k += 1, left -= 1) out[order[k].index] += 1;
  return out;
}
