/**
 * P7 (D-154): the 1900 occupation distribution of every territory (docs/P7_OCCUPATIONS_1900.md,
 * rules R1-R11, decided by the designer on 2026-11-09). Every number comes from a keyed row of
 * historical/p7/sources_1900.json (`distributionRows`, `occupationRows`) or from a named
 * provisional constant below.
 *
 * Census territories: Webb's census groups (CENSUS_RECIPES), corrected by the status-in-
 * employment, farm-holding and army sources. Other territories: each profession's share by
 * least squares on [1, ln real GDP per head, urban share] over the census territories, then the
 * agricultural block (peasants + farmers + aristocrats + farm hands) re-split by the same
 * agrarian rules, so that every territory's agrarian structure follows one rule set.
 *
 * Output per territory: `shares` over the sixteen professions with the interim placement
 * (servicemen in laborers, officers in bureaucrats, clergy in academics), `raw` shares before
 * it, and `farmHandShare` (farm employees as a share of the territory's people), which the
 * job remap uses for the hired jobs of peasant farms.
 */
import { CENSUS_RECIPES, censusGroups, ESTATE_TERRITORIES, GROUP_TO_PROFESSIONS, INTERIM_PLACEMENT, P7_PROFESSIONS } from "./labour.mjs";

const KEYS = P7_PROFESSIONS.map((profession) => profession.key);
const TARGETS = [...KEYS, "farmhands"];
const sum = (values) => values.reduce((acc, value) => acc + value, 0);
const norm = (object) => {
  const total = sum(Object.values(object));
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, total > 0 ? value / total : 0]));
};
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Hectares per acre (exact, international acre). */
export const HECTARES_PER_ACRE = 0.40468564224;

/**
 * R1 (P7 provisional): holding-size classes of the owner-operators. Holdings of 2-5 ha are
 * peasants (household production mainly for own use), 5 ha and over farmers (commercial family
 * holdings: about the smallest that kept a draught team and sold a regular surplus in central
 * Europe), 100 ha and over estates; holdings under 2 ha are labourers' plots and do not enter
 * the split. Units: hectares. A size class straddling a bound is divided by log-area overlap
 * (log-uniform within the class); an open lower class starts at OPEN_CLASS_FLOOR_HA.
 */
export const HOLDING_BOUNDS_HA = { peasant: 2, farmer: 5, estate: 100 };
export const OPEN_CLASS_FLOOR_HA = 0.25;

/**
 * R5 (P7 provisional): Russia's farmer layer from the 1899-1901 horse census. Commune
 * households with at least this many horses (the "well-to-do" group of the period's
 * statistics) and non-commune owners with 1 to (estate threshold − 1) horses are farmers;
 * non-commune owners with at least RUSSIA_ESTATE_HORSES are estates (aristocrats).
 */
export const RUSSIA_FARMER_HORSES = 3;
export const RUSSIA_ESTATE_HORSES = 5;

/**
 * R7 (P7 provisional): officers' share of the army and navy (the step-3 `defence` mapping,
 * 0.07; Webb gives no rank split for most countries).
 */
export const OFFICER_SHARE_OF_ARMY = GROUP_TO_PROFESSIONS.defence.officers;

/** R6 (P7 provisional): aristocrats as a share of agriculture where no estate source exists and the territory is not an estate territory. */
export const OTHER_ARISTOCRAT_SHARE = 0.002;

/** R6: territories that take Japan's landowners of 10 cho and over as their landlord share (East Asian analog). */
export const EAST_ASIA_LANDLORD_TERRITORIES = new Set(["jpn-home", "chn-home", "kor-home", "twn"]);

/** R9 (P7 provisional): territories that take another territory's sourced agrarian status shares. */
export const AGRARIAN_ANALOGS = { "esp-home": "ita-home", "prt-home": "ita-home" };

/** Holdings tables by territory (R1): source tag(s) of `holdings-<tag>-<lo>-<hi>` rows. */
const HOLDING_TAGS = { "gbr-home": ["gbr", "irl"], "bel-home": ["bel"], "nld-home": ["nld"], "can-home": ["can"], "aus-home": ["aus"], "nzl-home": ["nzl"], hun: ["hun"] };

/** Army and navy (R7): the census group that holds them in Webb's tables, and the row tag. */
const DEFENCE_CARVE = {
  "deu-home": ["public-professions", ["deu"]], "aut-home": ["public-professions", ["aut"]], "rus-home": ["public-professions", ["rus"]],
  "che-home": ["public-professions", ["che"]], "bel-home": ["public-administration", ["bel"]], "nld-home": ["public-professions", ["nld"]],
  "swe-home": ["public-professions", ["swe"]], "nor-home": ["public-professions", ["nor"]], "usa-home": ["manufacturing", ["usa"]],
};

/** Keyed access to the distribution rows; a missing key is an error. */
export function distributionTable(rows) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const get = (key) => {
    const row = byKey.get(key);
    if (row === undefined) throw new Error(`P7 occupations: missing distribution row ${key}`);
    return row.value;
  };
  const has = (key) => byKey.has(key);
  const prefixed = (prefix) => rows.filter((row) => row.key.startsWith(prefix));
  return { get, has, prefixed };
}

/** R1: peasant, farmer and estate shares of one holdings table (classes in acres). */
export function holdingSplit(classes) {
  let peasants = 0;
  let farmers = 0;
  let estates = 0;
  const part = (lo, hi, a, b) => {
    const low = Math.max(lo, a);
    const high = Math.min(hi, b);
    return high > low ? Math.log(high / low) / Math.log(hi / lo) : 0;
  };
  for (const [loAcres, hiAcres, holdings] of classes) {
    const lo = Math.max(loAcres * HECTARES_PER_ACRE, OPEN_CLASS_FLOOR_HA);
    const hi = hiAcres === null ? lo * 10 : hiAcres * HECTARES_PER_ACRE;
    peasants += holdings * part(lo, hi, HOLDING_BOUNDS_HA.peasant, HOLDING_BOUNDS_HA.farmer);
    farmers += holdings * part(lo, hi, HOLDING_BOUNDS_HA.farmer, HOLDING_BOUNDS_HA.estate);
    estates += holdings * part(lo, hi, HOLDING_BOUNDS_HA.estate, Infinity);
  }
  const total = peasants + farmers + estates;
  return { peasantShare: peasants / total, estateShare: estates / total };
}

function holdingsOf(table, tags) {
  const classes = [];
  for (const tag of tags) {
    for (const row of table.prefixed(`holdings-${tag}-`)) {
      const [lo, hi] = row.key.slice(`holdings-${tag}-`.length).split("-");
      classes.push([Number(lo), hi === "up" ? null : Number(hi), row.value]);
    }
  }
  if (classes.length === 0) throw new Error(`P7 occupations: no holdings rows for ${tags.join("+")}`);
  return holdingSplit(classes);
}

/**
 * Sourced agrarian status by territory: e = farm hands ÷ agriculture; peasantShare of the
 * owner-operators; a = aristocrats ÷ agriculture (or aOfOwners). Each from the rows.
 */
export function agrarianStatus(table) {
  const g = table.get;
  const status = {};
  // USA (R2, R3): family farm labourers go to the holders; no subsistence class.
  status["usa-home"] = {
    e: (g("usa-1900-agri-labourers") - g("usa-1900-farm-family")) / g("usa-1900-agri-pursuits"),
    peasantShare: 0,
    note: "US census 1900: family farm labourers to the holders; no subsistence class (market orientation)",
  };
  // Germany (R1, R3, R6): farm census 1907 by holding size.
  const heads = (c) => g(`deu-1907-farm-heads-${c}`) + g(`deu-1907-farm-family-${c}`);
  const deuOwners = heads("lt2ha") + heads("2-5ha") + heads("5-100ha");
  const deuEstates = heads("ge100ha");
  const deuHired = g("deu-1907-farm-servants") + g("deu-1907-farm-day-labourers") + g("deu-1907-farm-supervisors");
  const deuTotal = deuOwners + deuEstates + deuHired;
  status["deu-home"] = {
    e: deuHired / deuTotal,
    peasantShare: (heads("lt2ha") + heads("2-5ha")) / deuOwners,
    a: deuEstates / deuTotal,
    note: "farm census 1907 by holding size: under 5 ha peasants, 5-100 ha farmers, 100 ha and over estates",
  };
  // France (R2): census 1901 status; isolés and heads of farms without employees are peasants.
  const chefs = g("fra-1901-agri-chefs");
  const isoles = g("fra-1901-agri-isoles");
  const estabWith = g("fra-1901-agri-estab-0") + g("fra-1901-agri-estab-1-20") + g("fra-1901-agri-estab-gt20");
  const fraAgri = g("fra-1901-agri-undeclared") + chefs + g("fra-1901-agri-employees") + g("fra-1901-agri-unemployed") + isoles;
  status["fra-home"] = {
    e: (g("fra-1901-agri-employees") + g("fra-1901-agri-unemployed")) / fraAgri,
    peasantShare: (isoles + chefs * (g("fra-1901-agri-estab-0") / estabWith)) / (chefs + isoles),
    note: "census 1901 status: isolés and heads of farms without employees are peasants",
  };
  // India: farm servants, field labourers, tea-garden labourers.
  status.bin = {
    e: (g("ind-1901-farm-servants") + g("ind-1901-field-labourers") + g("ind-1901-tea-labourers")) / g("ind-1901-agriculture"),
    note: "census 1901 Subsidiary Table V: farm servants, field labourers, tea-garden labourers",
  };
  // Russia (R5): horse census 1899-1901 (44 guberniias).
  const horses = (owner, n) => g(`rus-1900-${owner}-${n}`);
  const levels = ["h1", "h2", "h3", "h4", "h5", "gt5"];
  const count = (owner, from, to) => levels.slice(from - 1, to).reduce((acc, level) => acc + horses(owner, level), 0);
  const communeWithHorses = count("commune", 1, 6);
  const commune = communeWithHorses / (1 - g("rus-1900-commune-horseless-share"));
  const communeFarmers = count("commune", RUSSIA_FARMER_HORSES, 6);
  const uezdFarmers = count("uezd", 1, RUSSIA_ESTATE_HORSES - 1);
  const uezdEstates = count("uezd", RUSSIA_ESTATE_HORSES, 6);
  const ownersAll = commune + uezdFarmers + uezdEstates;
  status["rus-home"] = {
    peasantShare: (commune - communeFarmers) / (commune + uezdFarmers),
    aOfOwners: uezdEstates / ownersAll,
    note: `census 1897 wage-earners; horse census 1899-1901: commune households with ${RUSSIA_FARMER_HORSES}+ horses and non-commune owners with 1-${RUSSIA_ESTATE_HORSES - 1} horses farmers, non-commune owners with ${RUSSIA_ESTATE_HORSES}+ horses estates`,
  };
  // Italy (R2): census 1901 classes.
  const it = (k) => g(`ita-1901-${k}`);
  const itOwners = it("owner-cultivators") + it("emphyteutic") + it("cash-tenants") + it("sharecroppers") + it("gardeners-masters") + it("woodcutters-masters") + it("breeders-masters") + it("small-livestock") + it("gatherers");
  const itCommercial = it("cash-tenants") + it("gardeners-masters");
  const itEmployees = it("bound-hands") + it("day-labourers") + it("field-guards") + it("gardeners-employees") + it("woodsmen") + it("woodcutters-employees") + it("herdsmen") + it("breeders-employees") + it("farm-agents");
  status["ita-home"] = {
    e: itEmployees / it("agri-total"),
    peasantShare: 1 - itCommercial / itOwners,
    note: "census 1901: day labourers, bound farm hands, shepherds employees; cash tenants and market gardeners farmers; owner-cultivators and sharecroppers peasants",
  };
  const estateDefaultOfOwners = (deuEstates / (deuOwners + deuEstates) + holdingsOf(table, HOLDING_TAGS.hun).estateShare + uezdEstates / ownersAll) / 3;
  const landlordsOfFarmFamilies = g("jpn-1926-landowners-ge10cho") / g("jpn-1926-farm-families");
  return { status, estateDefaultOfOwners, landlordsOfFarmFamilies, horseCensus: { commune, communeFarmers, uezdFarmers, uezdEstates } };
}

function lsq(X, y) {
  const k = X[0].length;
  const M = Array.from({ length: k }, (_, i) => [...Array.from({ length: k }, (_, j) => sum(X.map((row) => row[i] * row[j]))), sum(X.map((row, n) => row[i] * y[n]))]);
  for (let c = 0; c < k; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < k; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    const d = M[c][c];
    for (let j = c; j <= k; j += 1) M[c][j] /= d;
    for (let r = 0; r < k; r += 1) {
      if (r === c) continue;
      const f = M[r][c];
      for (let j = c; j <= k; j += 1) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[k]);
}

/**
 * Shares by territory (all sixteen professions), the method per territory, the agrarian
 * rules fitted on the sourced points and the leave-one-out error of the proxy.
 */
export function occupationDistribution({ territories, occupationRows, distributionRows, realGdpPerHead, urbanShareOf }) {
  const table = distributionTable(distributionRows);
  const { status, estateDefaultOfOwners, landlordsOfFarmFamilies } = agrarianStatus(table);
  const holdings = Object.fromEntries(Object.entries(HOLDING_TAGS).map(([key, tags]) => [key, holdingsOf(table, tags)]));
  const H = (key) => holdings[key === "aut-home" ? "hun" : key];
  // Webb p.428 agriculture of Hungary and Austria (the Austria-Hungary recipe's weights).
  const webb = (subject, group) => occupationRows.find((row) => row.subject === subject && row.group === group && row.locator.startsWith("p.428")).value;
  const hunAgri = webb("HUN", "agriculture");
  const autAgri = webb("AUT", "agriculture");

  // R8: agrarian rules on real GDP per head, fitted on the sourced points.
  const empPts = [
    ...Object.entries(status).filter(([, s]) => s.e !== undefined).map(([key, s]) => [key, s.e]),
    ["rus-home", null],
    ["gbr-home", null],
  ];
  const russia = occupationRows.find((row) => row.subject === "RUS" && row.group === "agri-labourers").value;
  const rusAgri = webb("RUS", "agriculture");
  const gbr = (group) => occupationRows.find((row) => row.subject === "GBR" && row.group === group).value;
  empPts[empPts.length - 2][1] = russia / rusAgri;
  empPts[empPts.length - 1][1] = gbr("agri-labourers") / (gbr("agri-owners") + gbr("agri-relatives") + gbr("agri-labourers"));
  const farmPts = [
    ...Object.entries(status).filter(([key, s]) => s.peasantShare !== undefined && key !== "usa-home").map(([key, s]) => [key, 1 - s.peasantShare]),
    ...["gbr-home", "bel-home", "nld-home", "aut-home"].map((key) => [key, 1 - H(key).peasantShare]),
  ];
  const empFit = lsq(empPts.map(([key]) => [1, Math.log(realGdpPerHead(key))]), empPts.map(([, value]) => value));
  const farmFit = lsq(farmPts.map(([key]) => [1, Math.log(realGdpPerHead(key))]), farmPts.map(([, value]) => value));
  const eRule = (key) => clamp01(empFit[0] + empFit[1] * Math.log(realGdpPerHead(key)));
  const fRule = (key) => clamp01(farmFit[0] + farmFit[1] * Math.log(realGdpPerHead(key)));

  const statusOf = (key) => status[key] ?? (AGRARIAN_ANALOGS[key] ? { ...status[AGRARIAN_ANALOGS[key]], a: undefined, note: `analog of ${AGRARIAN_ANALOGS[key]}` } : {});
  const splitAgri = (key, total, eCensus) => {
    const s = statusOf(key);
    const e = s.e ?? eCensus ?? eRule(key);
    let f;
    let fNote;
    if (s.peasantShare !== undefined) {
      f = 1 - s.peasantShare;
      fNote = "sourced";
    } else if (key === "aut-home") {
      f = (hunAgri * (1 - H(key).peasantShare) + autAgri * fRule(key)) / (hunAgri + autAgri);
      fNote = "Hungary holdings, Austria rule";
    } else if (H(key)) {
      f = 1 - H(key).peasantShare;
      fNote = "holdings";
    } else {
      f = fRule(key);
      fNote = "rule";
    }
    let a;
    if (s.a !== undefined) a = s.a;
    else if (s.aOfOwners !== undefined) a = s.aOfOwners * (1 - e);
    else if (key === "aut-home") a = ((hunAgri * H(key).estateShare + autAgri * estateDefaultOfOwners) / (hunAgri + autAgri)) * (1 - e);
    else if (EAST_ASIA_LANDLORD_TERRITORIES.has(key)) a = landlordsOfFarmFamilies * (1 - e);
    else if (ESTATE_TERRITORIES.has(key)) a = estateDefaultOfOwners * (1 - e);
    else a = OTHER_ARISTOCRAT_SHARE;
    const owners = Math.max(0, 1 - e - a);
    return { farmhands: e * total, aristocrats: a * total, farmers: owners * f * total, peasants: owners * (1 - f) * total, e, f, a, fNote, note: s.note };
  };

  // R4 (Germany, France) and R10 (Belgium): status splits of the non-farm groups.
  const g = table.get;
  const fromWage = (wage, mapping) => {
    const m = norm(Object.fromEntries(Object.entries(mapping).filter(([key]) => key !== "shopkeepers" && key !== "capitalists")));
    return Object.fromEntries(Object.entries(m).map(([key, value]) => [key, value * wage]));
  };
  const add = (...objects) => {
    const out = {};
    for (const object of objects) for (const [key, value] of Object.entries(object)) out[key] = (out[key] ?? 0) + value;
    return out;
  };
  const fra = (sec, field) => g(`fra-1901-${sec}-${field}`);
  const fraGroup = (sec, mapping) => norm(add(
    { capitalists: g(`fra-1901-${sec}-estab-ge5`), shopkeepers: fra(sec, "chefs") - g(`fra-1901-${sec}-estab-ge5`) + fra(sec, "isoles"), laborers: fra(sec, "undeclared") },
    fromWage(fra(sec, "employees") + fra(sec, "unemployed"), mapping),
  ));
  const fraArmy = g("fra-army-navy") / g("fra-1901-public-service");
  // R10: France 1901 liberal professions against personal service and unspecified (Annuaire 1905 p.170).
  const frLib = g("fra-1901-liberal-professions") / (g("fra-1901-liberal-professions") + g("fra-1901-personal-services") + g("fra-1901-unspecified"));
  const overrides = {
    "deu-home": {
      manufacturing: norm(add(
        { capitalists: g("deu-1907-B-estab-gt5"), shopkeepers: g("deu-1907-B-a") - g("deu-1907-B-estab-gt5") + g("deu-1907-B-family-helpers"), laborers: g("deu-1907-B-c") - g("deu-1907-B-family-helpers") },
        fromWage(g("deu-1907-B-b"), { clerks: 5, engineers: 2 }),
      )),
      "trade-transport": norm(add(
        { capitalists: g("deu-1907-C-estab-gt5"), shopkeepers: g("deu-1907-C-a") - g("deu-1907-C-estab-gt5") + g("deu-1907-C-family-helpers"), clerks: g("deu-1907-C-b") },
        fromWage(g("deu-1907-C-c") - g("deu-1907-C-family-helpers"), { attendants: 0.33, laborers: 0.24 }),
      )),
    },
    "fra-home": {
      manufacturing: fraGroup("transf", GROUP_TO_PROFESSIONS.manufacturing),
      building: fraGroup("transf", GROUP_TO_PROFESSIONS.building),
      mining: fraGroup("extr", GROUP_TO_PROFESSIONS.mining),
      transport: fraGroup("transport", GROUP_TO_PROFESSIONS.transport),
      trade: fraGroup("commerce", GROUP_TO_PROFESSIONS.trade),
      "public-administration:override": { servicemen: fraArmy * (1 - OFFICER_SHARE_OF_ARMY), officers: fraArmy * OFFICER_SHARE_OF_ARMY, bureaucrats: 1 - fraArmy },
    },
    "bel-home": {
      other: Object.fromEntries([...new Set([...Object.keys(GROUP_TO_PROFESSIONS.professions), ...Object.keys(GROUP_TO_PROFESSIONS.other)])].map((key) => [key, frLib * (GROUP_TO_PROFESSIONS.professions[key] ?? 0) + (1 - frLib) * (GROUP_TO_PROFESSIONS.other[key] ?? 0)])),
    },
  };

  // Census territories.
  const sourced = new Map();
  for (const [key, recipe] of Object.entries(CENSUS_RECIPES)) {
    const census = censusGroups(recipe, occupationRows);
    const groups = new Map(census.groups);
    const carve = DEFENCE_CARVE[key];
    if (carve !== undefined) {
      const [group, tags] = carve;
      const army = sum(tags.map((tag) => g(`${tag}-army-navy`)));
      if (!((groups.get(group) ?? 0) > army)) throw new Error(`P7 occupations: army of ${key} exceeds census group ${group}`);
      groups.set(group, groups.get(group) - army);
      groups.set("defence", (groups.get("defence") ?? 0) + army);
    }
    const persons = Object.fromEntries(TARGETS.map((target) => [target, 0]));
    const owners = (groups.get("agri-owners") ?? 0) + (groups.get("agri-relatives") ?? 0);
    const labourers = groups.get("agri-labourers") ?? 0;
    const agriculture = (groups.get("agriculture") ?? 0) + (groups.get("fishing") ?? 0) + owners + labourers;
    let eCensus;
    if (statusOf(key).e === undefined) {
      if (labourers > 0 && owners > 0) eCensus = labourers / (owners + labourers);
      else if (labourers > 0) eCensus = Math.min(1, labourers / agriculture);
    }
    const agri = splitAgri(key, agriculture, eCensus);
    for (const target of ["farmhands", "aristocrats", "farmers", "peasants"]) persons[target] += agri[target];
    for (const [group, value] of groups) {
      if (group === "agriculture" || group === "fishing" || group.startsWith("agri-")) continue;
      const mapping = overrides[key]?.[group] ?? census.overrideMappings[group] ?? GROUP_TO_PROFESSIONS[group];
      if (mapping === undefined) throw new Error(`P7 occupations: no profession mapping for census group ${group}`);
      for (const [target, weight] of Object.entries(mapping)) persons[target] += value * weight;
    }
    const total = sum(Object.values(persons));
    const shares = Object.fromEntries(TARGETS.map((target) => [target, persons[target] / total]));
    const method = `census ${recipe.subjects.join("+")} ${recipe.census} (${recipe.source ?? "Webb 1911"}); farm hands ${(agri.e * 100).toFixed(1)} % of agriculture (${agri.note ?? (eCensus !== undefined ? "census labourer row" : "rule R8")}); farmers ${(agri.f * 100).toFixed(1)} % of owner-operators (${agri.fNote})${overrides[key] ? `; status tables: ${Object.keys(overrides[key]).join(", ")}` : ""}${carve ? "; army and navy carved out" : ""}`;
    sourced.set(key, { shares, method, rows: census.rows, notes: census.notes, occupied: census.total });
  }

  // R11: proxy regression over the census territories, then the agrarian re-split.
  const feature = (key) => [1, Math.log(realGdpPerHead(key)), urbanShareOf(key)];
  const points = [...sourced.keys()];
  const fit = (keys) => Object.fromEntries(TARGETS.map((target) => [target, lsq(keys.map(feature), keys.map((key) => sourced.get(key).shares[target]))]));
  const predict = (coefficients, key) => norm(Object.fromEntries(TARGETS.map((target) => [target, Math.max(0, sum(coefficients[target].map((c, i) => c * feature(key)[i])))])));
  const resplit = (key, predicted) => {
    const total = predicted.peasants + predicted.farmers + predicted.aristocrats + predicted.farmhands;
    const s = splitAgri(key, total);
    return { shares: { ...predicted, peasants: s.peasants, farmers: s.farmers, aristocrats: s.aristocrats, farmhands: s.farmhands }, agri: s };
  };
  const misallocated = (p, q) => sum(KEYS.map((key) => Math.abs((key === "laborers" ? p.laborers + p.farmhands : p[key]) - (key === "laborers" ? q.laborers + q.farmhands : q[key])))) / 2;
  const leaveOneOut = {};
  for (const key of points) leaveOneOut[key] = misallocated(resplit(key, predict(fit(points.filter((other) => other !== key)), key)).shares, sourced.get(key).shares);
  const coefficients = fit(points);

  const result = new Map();
  for (const key of territories) {
    const entry = sourced.get(key);
    let raw;
    let method;
    if (entry !== undefined) {
      raw = entry.shares;
      method = entry.method;
    } else {
      const { shares, agri } = resplit(key, predict(coefficients, key));
      raw = shares;
      method = `proxy: least squares on ln real GDP per head and urban share over the ${points.length} census territories (R11); agriculture re-split: farm hands ${(agri.e * 100).toFixed(1)} %, farmers ${(agri.f * 100).toFixed(1)} % of owner-operators (${agri.fNote}), landed ${(agri.a * 100).toFixed(2)} %`;
    }
    const farmHandShare = raw.farmhands;
    const sixteen = { ...raw, laborers: raw.laborers + raw.farmhands };
    delete sixteen.farmhands;
    const rawShares = norm(sixteen);
    const placed = { ...rawShares };
    for (const [from, to] of Object.entries(INTERIM_PLACEMENT)) {
      placed[to] += placed[from];
      placed[from] = 0;
    }
    const agriculture = raw.peasants + raw.farmers + raw.aristocrats + raw.farmhands;
    result.set(key, {
      shares: placed,
      raw: rawShares,
      farmHandShare,
      farmHandShareOfAgriculture: agriculture > 0 ? raw.farmhands / agriculture : 0,
      method,
      rows: entry?.rows ?? [],
      notes: entry?.notes ?? [],
      ...(entry ? { occupied: entry.occupied, interim: Object.fromEntries(Object.keys(INTERIM_PLACEMENT).map((key) => [key, rawShares[key] * entry.occupied])) } : {}),
    });
  }
  return {
    byTerritory: result,
    proxyCoefficients: coefficients,
    fits: { farmHands: empFit, farmers: farmFit, farmHandPoints: empPts, farmerPoints: farmPts, estateDefaultOfOwners, landlordsOfFarmFamilies },
    leaveOneOut,
  };
}

/**
 * P7 (D-154, docs/P7_EMPLOYERS_PROPOSAL.md §4.1): domestic servants per occupied person by
 * territory. Sourced where the census counts them (Statistisches Jahrbuch 1909 p.14* for twelve
 * countries, Webb p.443 for the USA, Census of India 1901 Subsidiary Table V for India), over
 * the census occupied (Webb p.428 and the national totals); elsewhere a least-squares line on
 * ln real GDP per head through those points, clamped to [0, the largest sourced share].
 */
export function domesticServiceShares({ territories, occupationRows, distributionRows, realGdpPerHead }) {
  const table = distributionTable(distributionRows);
  const total = (subject) => {
    const row = occupationRows.find((entry) => entry.subject === subject && entry.group === "total");
    if (row === undefined) throw new Error(`P7: no census total for ${subject}`);
    return row.value;
  };
  const sourced = {
    "deu-home": table.get("deu-domestic-servants") / table.get("deu-occupied"),
    "aut-home": (table.get("aut-domestic-servants") + table.get("hun-domestic-servants")) / (occupationRows.find((r) => r.subject === "AUT" && r.group === "total" && r.locator.startsWith("p.428")).value + occupationRows.find((r) => r.subject === "HUN" && r.group === "total" && r.locator.startsWith("p.428")).value),
    "rus-home": table.get("rus-domestic-servants") / occupationRows.find((r) => r.subject === "RUS" && r.group === "total" && r.locator.startsWith("p.428")).value,
    "ita-home": table.get("ita-domestic-servants") / occupationRows.find((r) => r.subject === "ITA" && r.group === "total" && r.locator.startsWith("p.428")).value,
    "che-home": table.get("che-domestic-servants") / total("CHE"),
    "fra-home": table.get("fra-domestic-servants") / occupationRows.find((r) => r.subject === "FRA" && r.group === "total" && r.locator.startsWith("p.428")).value,
    "nld-home": table.get("nld-domestic-servants") / occupationRows.find((r) => r.subject === "NLD" && r.group === "total" && r.locator.startsWith("p.428")).value,
    "dnk-home": table.get("dnk-domestic-servants") / total("DNK"),
    "swe-home": table.get("swe-domestic-servants") / total("SWE"),
    "nor-home": table.get("nor-domestic-servants") / total("NOR"),
    "gbr-home": table.get("gbr-domestic-servants") / total("GBR"),
    "usa-home": table.get("usa-domestic-servants") / occupationRows.find((r) => r.subject === "USA" && r.group === "total" && r.locator.startsWith("p.443")).value,
    bin: table.get("ind-1901-domestic") / table.get("ind-1901-occupied"),
  };
  const points = Object.entries(sourced);
  const xs = points.map(([key]) => Math.log(realGdpPerHead(key)));
  const ys = points.map(([, share]) => share);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0) / xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  const intercept = my - slope * mx;
  const ceiling = Math.max(...ys);
  const byTerritory = new Map();
  for (const key of territories) {
    const share = sourced[key] ?? Math.min(ceiling, Math.max(0, intercept + slope * Math.log(realGdpPerHead(key))));
    byTerritory.set(key, { share, method: sourced[key] !== undefined ? "census" : "fit on ln real GDP per head" });
  }
  return { byTerritory, fit: { intercept, slope, points: sourced } };
}
