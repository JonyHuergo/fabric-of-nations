/**
 * P7 (D-154): the 1900 labour pipeline steps used by scripts/p5b/build-goods-1900.mjs.
 * See scripts/p7/labour.mjs for the method and the provisional constants.
 */
import { occupationDistribution } from "./occupations.mjs";
import { LITERATE_PROFESSION_LITERACY, P7_PROFESSIONS, largestRemainder } from "./labour.mjs";

const sum = (values) => values.reduce((acc, value) => acc + value, 0);

/**
 * R9 (P7_DAY1_LABOUR_PROPOSAL.md §3, approved): institution budgets split by function shares,
 * not by the census wage bill (a wage-bill split gave US health 59 % of administration and
 * research 79 % of education, because the census academics and medics are mostly lawyers,
 * clergy and self-employed physicians, not public posts). Dimensionless shares of the
 * country's budget, from US all-government spending by function in 1902 (HSUS series
 * Y 533-566, keyed rows `usa-1902-gov-*`):
 *  - health posts ÷ administration = (hospitals + health) ÷ the civil part of general
 *    expenditure, i.e. without what the administration budget leaves out (P2b row
 *    administration-share-of-noneducation-revenue: defence, pensions, interest, public works),
 *    and without education and the post office (their own institutions and buildings):
 *    63 ÷ (1,578 − 165 − 126 − 258 − 175 − 22 − 141 − 97) = 63 ÷ 594;
 *  - research posts ÷ education = state institutions of higher education ÷ education:
 *    13 ÷ 258 (public budgets only; private universities are not in the series);
 *  - the E5 training budget ÷ education: TRAINING_OF_EDUCATION, still provisional (the series
 *    has no line for vocational or professional training).
 */
export const TRAINING_OF_EDUCATION = 0.06;
export function institutionFunctionShares(distributionRows) {
  const value = (key) => {
    const found = distributionRows.find((row) => row.key === key);
    if (found === undefined) throw new Error(`P7: missing distribution row ${key}`);
    return found.value;
  };
  const civil =
    value("usa-1902-gov-general") -
    value("usa-1902-gov-defence") -
    value("usa-1902-gov-postal") -
    value("usa-1902-gov-education") -
    value("usa-1902-gov-highways") -
    value("usa-1902-gov-air-water-transport") -
    value("usa-1902-gov-veterans") -
    value("usa-1902-gov-interest");
  if (!(civil > 0)) throw new Error("P7: no civil expenditure in the 1902 rows");
  return Object.freeze({
    /** Health posts, share of the administration budget. */
    healthOfAdministration: Number(((value("usa-1902-gov-hospitals") + value("usa-1902-gov-health")) / civil).toPrecision(6)),
    /** Research posts, share of the education budget (before the training budget is taken). */
    researchOfEducation: Number((value("usa-1902-gov-higher-education") / value("usa-1902-gov-education")).toPrecision(6)),
    /** The E5 training budget, share of the education budget (budget-neutral). */
    trainingOfEducation: TRAINING_OF_EDUCATION,
  });
}

/** Job remap of the 1900 building definitions (plan §3.4). */
const FAMILY_FARMS = new Set(["ranch", "fishery", "dairy-farm", "market-garden", "tobacco-farm", "cotton-farm", "silk-farm"]);
const ESTATES = new Set(["plantation", "sugar-estate", "rubber-estate"]);
const PEASANT_BUILDINGS = new Set(["subsistence-farm", "commercial-farm-peasant", "workshop-peasant"]);
const OWNER_WORKSHOPS = new Set(["workshop", "jewellery-workshop"]);
/** P7 owner-run establishments (docs/P7_EMPLOYERS_PROPOSAL.md §4.2-4.3). */
const SHOPS = new Set(["shop"]);
const PRACTICES = new Set(["professional-practice"]);
/** P7 medic-owned practices (convertToMedicalPractices). */
const MEDICAL_PRACTICES = new Set(["medical-practice"]);
/**
 * Professions of a practice's professional jobs (P7 provisional, after the US 1900 private
 * professions, Webb p.443: lawyers, writers, artists and clergy; physicians; engineers;
 * private teachers). Shares of the professional workers, summing to 1.
 */
export const PRACTICE_PROFESSION_SHARES = { academics: 0.55, medics: 0.25, engineers: 0.12, teachers: 0.08 };
const SERVICE_ATTENDANTS = new Set(["trading-house", "transport-company", "post-and-telegraph", "personal-services"]);
const HEAVY_INDUSTRY = new Set([
  "steel-works", "copper-smelter", "aluminium-works", "alkali-and-acid-works", "petrochemical-plant", "fertiliser-works",
  "nitrogen-fixation-plant", "plastics-plant", "machine-works", "electrical-works", "motor-works", "aircraft-works", "shipyard",
  "arsenal", "oil-refinery", "coal-power-station", "oil-power-station", "gas-power-station", "hydro-station", "nuclear-station",
  "synthetic-fibre-plant", "synthetic-rubber-plant", "electronics-plant", "computer-works", "phone-works", "pharmaceutical-works",
]);
/** Share of a family farm's jobs held by its owner-operators; the rest are farm laborers. PROVISIONAL. */
export const FAMILY_FARM_OWNER_SHARE = 0.6;
/** Domestic service for minimum-wage coverage (plan §4.5). */
export const DOMESTIC_SERVICE_BUILDINGS = ["personal-services"];

/** The sixteen profession definitions with their 1900 US reference wages. */
export function professionDefinitions({ oldProfessions, p2bRatios, usLaborerRUSD, usLaborerUsd, wageRows, provisionalRows }) {
  const oldByKey = new Map(oldProfessions.map((profession) => [profession.key, profession]));
  const ratioOf = (entry) => {
    let ratio;
    let rows = [];
    if (entry.wage.ratioOf !== undefined) {
      ratio = p2bRatios[entry.wage.ratioOf];
      rows.push(`p2b ratio ${entry.wage.ratioOf}`);
    } else {
      const row = wageRows.find((candidate) => candidate.id === entry.wage.usd);
      if (row === undefined) throw new Error(`P7: wage row ${entry.wage.usd} missing`);
      ratio = row.value / usLaborerUsd;
      rows.push(row.id);
    }
    if (entry.wage.provisional !== undefined) {
      const row = provisionalRows.find((candidate) => candidate.id === entry.wage.provisional);
      if (row === undefined) throw new Error(`P7: provisional row ${entry.wage.provisional} missing`);
      ratio *= row.value;
      rows.push(row.id);
    }
    return { ratio, rows };
  };
  const ratios = {};
  const traces = {};
  const professions = P7_PROFESSIONS.map((entry) => {
    const from = oldByKey.get(entry.from);
    if (from === undefined) throw new Error(`P7: source profession ${entry.from} missing`);
    const own = oldByKey.get(entry.key);
    const { ratio, rows } = ratioOf(entry);
    ratios[entry.key] = ratio;
    traces[entry.key] = { ratio, rowIds: rows };
    const wage = Math.round(usLaborerRUSD * ratio * 100) / 100;
    const base = own ?? from;
    return {
      id: entry.id,
      key: entry.key,
      name: entry.name,
      stratum: entry.stratum,
      participationRate: base.participationRate,
      qualificationLiteracy: base.qualificationLiteracy,
      qualificationWealthLevel: base.qualificationWealthLevel,
      baseWage1900RUSDPerYear: wage,
      trainingCostRUSD: 0,
      laborProductivityModifier: base.laborProductivityModifier,
      roles: entry.roles,
      ...(entry.gates.length > 0 ? { gates: entry.gates } : {}),
      ...(entry.entry === undefined ? {} : { entry: entry.entry }),
      settlement: entry.settlement,
      ...(entry.courseLengthYears === undefined ? {} : { courseLengthYears: entry.courseLengthYears }),
      ...(entry.gates.includes("capital") ? { entryCapitalRUSD: wage } : {}),
    };
  });
  return { professions, ratios, traces };
}

/** A territory's sixteen-profession wage table (RUSD a year, keyed by profession). */
export function wageTable16(laborerWage, ratios) {
  return Object.fromEntries(P7_PROFESSIONS.map((entry) => [entry.key, Math.round(laborerWage * ratios[entry.key] * 100) / 100]));
}

/** Shares by territory (scripts/p7/occupations.mjs, rules R1-R11 of docs/P7_OCCUPATIONS_1900.md). */
export function territoryShares({ territories, occupationRows, distributionRows, realGdpPerHead, urbanShareOf }) {
  return occupationDistribution({ territories, occupationRows, distributionRows, realGdpPerHead, urbanShareOf });
}

/**
 * Split each territory's population over the sixteen professions and its provinces
 * (plan §3.3). `oldPops` are the five-profession rows; their attributes seed the new
 * blocks (the block of the source profession in the same province, else the
 * territory's population-weighted mean of that profession).
 */
export function splitPopulation({ oldPops, provinces, shares, professions }) {
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const settlementOf = new Map(P7_PROFESSIONS.map((entry) => [entry.key, entry.settlement]));
  const fromOf = new Map(P7_PROFESSIONS.map((entry) => [entry.key, entry.from]));
  const gated = new Set(professions.filter((profession) => (profession.gates ?? []).includes("literacy")).map((profession) => profession.key));
  const byTerritory = new Map();
  const oldByKey = new Map();
  for (const pop of oldPops) {
    const territory = provinceById.get(pop.provinceId)?.territoryKey;
    if (territory === undefined) throw new Error(`P7: pop in unknown province ${pop.provinceId}`);
    const entry = byTerritory.get(territory) ?? { provinces: new Map(), attributes: new Map() };
    entry.provinces.set(pop.provinceId, (entry.provinces.get(pop.provinceId) ?? 0) + pop.population);
    const attr = entry.attributes.get(pop.professionKey) ?? { population: 0, literacy: 0, wealthLevel: 0, savingsPerCapitaRUSD: 0, militancy: 0 };
    attr.population += pop.population;
    attr.literacy += pop.literacy * pop.population;
    attr.wealthLevel += pop.wealthLevel * pop.population;
    attr.savingsPerCapitaRUSD += pop.savingsPerCapitaRUSD * pop.population;
    attr.militancy += pop.militancy * pop.population;
    entry.attributes.set(pop.professionKey, attr);
    byTerritory.set(territory, entry);
    oldByKey.set(`${pop.provinceId}|${pop.professionKey}`, pop);
  }
  const rows = [];
  for (const [territory, entry] of [...byTerritory].sort((a, b) => a[0].localeCompare(b[0]))) {
    const share = shares.get(territory)?.shares;
    if (share === undefined) throw new Error(`P7: no shares for ${territory}`);
    const total = sum([...entry.provinces.values()]);
    const keys = P7_PROFESSIONS.map((profession) => profession.key);
    const totals = largestRemainder(total, keys.map((key) => share[key] ?? 0));
    const ids = [...entry.provinces.keys()].sort((a, b) => a - b);
    keys.forEach((key, index) => {
      const people = totals[index];
      if (!(people > 0)) return;
      const settlement = settlementOf.get(key);
      let weights = ids.map((id) => {
        const persons = entry.provinces.get(id) ?? 0;
        const urban = provinceById.get(id)?.urbanShare ?? 0;
        return settlement === "rural" ? persons * (1 - urban) : settlement === "urban" ? persons * urban : persons;
      });
      if (!(sum(weights) > 0)) weights = ids.map((id) => entry.provinces.get(id) ?? 0);
      const split = largestRemainder(people, weights);
      const territoryAttr = entry.attributes.get(fromOf.get(key));
      ids.forEach((provinceId, position) => {
        const population = split[position];
        if (!(population > 0)) return;
        const source = oldByKey.get(`${provinceId}|${fromOf.get(key)}`) ?? oldByKey.get(`${provinceId}|${key}`);
        const mean = territoryAttr === undefined || !(territoryAttr.population > 0)
          ? { literacy: 0.5, wealthLevel: 20, savingsPerCapitaRUSD: 0, militancy: 0.05 }
          : {
              literacy: territoryAttr.literacy / territoryAttr.population,
              wealthLevel: territoryAttr.wealthLevel / territoryAttr.population,
              savingsPerCapitaRUSD: territoryAttr.savingsPerCapitaRUSD / territoryAttr.population,
              militancy: territoryAttr.militancy / territoryAttr.population,
            };
        const attr = source ?? mean;
        const literacy = gated.has(key) ? Math.max(attr.literacy, LITERATE_PROFESSION_LITERACY) : attr.literacy; // R8 (D4): clerks and academics too
        rows.push({
          provinceId,
          professionKey: key,
          population,
          literacy: Math.round(literacy * 1e6) / 1e6,
          wealthLevel: Math.round(attr.wealthLevel * 100) / 100,
          savingsPerCapitaRUSD: Math.round(attr.savingsPerCapitaRUSD * 100) / 100,
          militancy: Math.round(attr.militancy * 1e4) / 1e4,
          sourceIds: [...new Set([...(source?.sourceIds ?? ["owid-population", "hyde-3.3"]), "webb-1911", "p7-labour"])],
          calibrationStatus: "provisional",
        });
      });
    });
  }
  rows.sort((a, b) => a.provinceId - b.provinceId || a.professionKey.localeCompare(b.professionKey));
  return rows;
}

/**
 * The blocks' urban shares (plan §3.3, D-142 item 7 superseded): a province's urban
 * people go to its urban professions first, then by-job, then rural ones; within a class
 * every block gets the same share.
 */
export function blockUrbanShares({ pops, provinces }) {
  const settlementOf = new Map(P7_PROFESSIONS.map((entry) => [entry.key, entry.settlement]));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const byProvince = new Map();
  for (const pop of pops) {
    const list = byProvince.get(pop.provinceId) ?? [];
    list.push(pop);
    byProvince.set(pop.provinceId, list);
  }
  const rows = [];
  for (const [provinceId, list] of [...byProvince].sort((a, b) => a[0] - b[0])) {
    const total = sum(list.map((pop) => pop.population));
    let urban = (provinceById.get(provinceId)?.urbanShare ?? 0) * total;
    const shareOf = new Map();
    for (const settlement of ["urban", "by-job", "rural"]) {
      const members = list.filter((pop) => settlementOf.get(pop.professionKey) === settlement);
      const persons = sum(members.map((pop) => pop.population));
      const share = persons > 0 ? Math.min(1, Math.max(0, urban / persons)) : 0;
      for (const pop of members) shareOf.set(pop.professionKey, share);
      urban -= share * persons;
    }
    for (const pop of [...list].sort((a, b) => a.professionKey.localeCompare(b.professionKey))) {
      rows.push({ provinceId, professionKey: pop.professionKey, urbanShare: Math.round((shareOf.get(pop.professionKey) ?? 0) * 1e8) / 1e8 });
    }
  }
  return rows;
}

/** Job slots re-mapped per building definition (plan §3.4), workers per throughput unit kept. */
export function remapDefinitions({ definitions, professions, engineerShare }) {
  const id = new Map(professions.map((profession) => [profession.key, profession.id]));
  const keyOf = (professionId) => P7_PROFESSIONS.find((entry) => entry.id === professionId)?.key;
  return definitions.map((definition) => {
    const jobs = new Map();
    const add = (key, workers) => {
      if (!(workers > 0)) return;
      jobs.set(key, (jobs.get(key) ?? 0) + workers);
    };
    const total = sum(definition.jobs.map((job) => job.workersPerThroughputUnit));
    for (const job of definition.jobs) {
      const key = keyOf(job.professionId);
      const workers = job.workersPerThroughputUnit;
      if (PEASANT_BUILDINGS.has(definition.key)) add("peasants", workers);
      else if (FAMILY_FARMS.has(definition.key)) {
        add("farmers", workers * FAMILY_FARM_OWNER_SHARE);
        add("laborers", workers * (1 - FAMILY_FARM_OWNER_SHARE));
      } else if (ESTATES.has(definition.key)) add("laborers", workers);
      else if (OWNER_WORKSHOPS.has(definition.key)) add(key === "clerks" ? "shopkeepers" : "laborers", workers);
      else if (SHOPS.has(definition.key)) add(key === "clerks" ? "shopkeepers" : "attendants", workers);
      else if (PRACTICES.has(definition.key)) {
        if (key === "academics") for (const [target, share] of Object.entries(PRACTICE_PROFESSION_SHARES)) add(target, workers * share);
        else add(key, workers);
      } else if (MEDICAL_PRACTICES.has(definition.key)) add(key === "academics" ? "medics" : key === "laborers" ? "attendants" : key, workers);
      else if (SERVICE_ATTENDANTS.has(definition.key)) add(key === "laborers" ? "attendants" : key, workers);
      else if (definition.key === "bank-and-office") add(key === "academics" ? "clerks" : key, workers);
      else if (key === "academics") add("engineers", workers);
      else if (key === "clerks" && HEAVY_INDUSTRY.has(definition.key)) {
        add("engineers", workers * engineerShare);
        add("clerks", workers * (1 - engineerShare));
      } else if (key === "peasants") add(definition.sector === "agriculture" || definition.sector === "food-processing" ? "laborers" : "laborers", workers);
      else add(key, workers);
    }
    const remapped = [...jobs].map(([key, workers]) => ({ professionId: id.get(key), workersPerThroughputUnit: Math.round(workers * 1e6) / 1e6 }));
    if (Math.abs(sum(remapped.map((job) => job.workersPerThroughputUnit)) - total) > 1e-3) throw new Error(`P7: job remap of ${definition.key} changed its workers`);
    return { ...definition, jobs: remapped.sort((a, b) => a.professionId - b.professionId) };
  });
}

/**
 * Owners (plan §3.4): workshops and jewellers → shopkeepers; family farms → farmers;
 * estates, plantations and large commercial farms → aristocrats in estate territories,
 * else capitalists; peasant farms stay with peasants. The owner must have a block in the
 * province; otherwise capitalists, else the province's largest block.
 */
export function remapOwners({ buildingRows, pops, provinceTerritory, estateTerritories }) {
  const present = new Set(pops.filter((pop) => pop.population > 0).map((pop) => `${pop.provinceId}|${pop.professionKey}`));
  const largest = new Map();
  for (const pop of pops) {
    const current = largest.get(pop.provinceId);
    if (current === undefined || pop.population > current.population || (pop.population === current.population && pop.professionKey < current.professionKey)) largest.set(pop.provinceId, pop);
  }
  return buildingRows.map((row) => {
    const territory = provinceTerritory(row.provinceId);
    let wanted;
    if (PEASANT_BUILDINGS.has(row.definitionKey)) wanted = present.has(`${row.provinceId}|peasants`) ? "peasants" : "farmers";
    else if (OWNER_WORKSHOPS.has(row.definitionKey) || SHOPS.has(row.definitionKey)) wanted = "shopkeepers";
    else if (PRACTICES.has(row.definitionKey)) wanted = "academics";
    else if (MEDICAL_PRACTICES.has(row.definitionKey)) wanted = "medics";
    else if (FAMILY_FARMS.has(row.definitionKey)) wanted = "farmers";
    else if (ESTATES.has(row.definitionKey) || row.definitionKey === "commercial-farm") wanted = estateTerritories.has(territory) ? "aristocrats" : "capitalists";
    else wanted = row.ownerProfessionKey === "peasants" ? "peasants" : "capitalists";
    for (const candidate of [wanted, row.ownerProfessionKey, "capitalists"]) {
      if (present.has(`${row.provinceId}|${candidate}`)) return candidate === row.ownerProfessionKey ? row : { ...row, ownerProfessionKey: candidate };
    }
    const fallback = largest.get(row.provinceId)?.professionKey;
    if (fallback === undefined) throw new Error(`P7: no owner block for ${row.key}`);
    return { ...row, ownerProfessionKey: fallback };
  });
}

/**
 * Institution policy (plan Q3, Q4; R9) inside the sourced budgets (P2b/P5b): each funding
 * pool is split over its institutions by `shares` (institutionFunctionShares). Administration
 * (bureaucrats) and health (medics) share the administration budget; the training budget is
 * taken out of the education budget, and the rest pays research (academics) and schools
 * (teachers), research holding its share of the whole education budget. The census wage bill
 * per country is still computed and reported for comparison.
 */
export function institutionPolicy({ countries, pops, provinceWage, professions, workingAgeShare, shares }) {
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const countryOf = new Map();
  for (const country of countries) for (const id of country.provinceIds) countryOf.set(id, country.tag);
  const bill = new Map();
  for (const pop of pops) {
    const tag = countryOf.get(pop.provinceId);
    if (tag === undefined) continue;
    const profession = professionByKey.get(pop.professionKey);
    const workers = pop.population * workingAgeShare * profession.participationRate * ((profession.gates ?? []).includes("literacy") ? pop.literacy : 1);
    const entry = bill.get(tag) ?? { bureaucrats: 0, medics: 0, teachers: 0, academics: 0 };
    if (entry[pop.professionKey] !== undefined) entry[pop.professionKey] += workers * provinceWage(pop.provinceId, pop.professionKey);
    bill.set(tag, entry);
  }
  const report = {};
  const rows = countries.map((country) => {
    const entry = bill.get(country.tag) ?? { bureaucrats: 0, medics: 0, teachers: 0, academics: 0 };
    const healthStaffShare = shares.healthOfAdministration;
    const education = country.technology.educationFundingRUSDPerYear ?? 0;
    const training = Math.round(education * shares.trainingOfEducation * 100) / 100;
    const educationLeft = Math.round((education - training) * 100) / 100;
    // Research's share of the education budget left after training, so that research holds
    // `researchOfEducation` of the whole budget.
    const researchStaffShare = Math.round((shares.researchOfEducation / (1 - shares.trainingOfEducation)) * 1e6) / 1e6;
    report[country.tag] = { healthStaffShare, researchStaffShare, trainingBudgetRUSDPerYear: training, censusWageBillRUSDPerYear: entry, administrationFundingRUSDPerYear: country.politics.institutionFundingRUSDPerYear, educationFundingRUSDPerYear: educationLeft };
    return {
      ...country,
      technology: { ...country.technology, educationFundingRUSDPerYear: educationLeft, researchStaffShare },
      labor: { trainingBudgetRUSDPerYear: training, healthStaffShare },
      sourceIds: [...new Set([...country.sourceIds, "p7-labour"])],
    };
  });
  return { countries: rows, report };
}

/**
 * Institution posts per `${province}|${profession}` (mirror of the simulation's
 * planInstitutionSlots): per country and pool, floor(funding ÷ the population-weighted mean
 * wage of the staffing profession), spread over the country's provinces by population with
 * largest remainder. `population` maps province id → people (provinces absent are skipped).
 */
export function institutionPostSlots({ countries, population, provinceWage }) {
  const posts = new Map();
  for (const country of countries) {
    const ids = country.provinceIds.filter((id) => population.has(id));
    const people = sum(ids.map((id) => population.get(id) ?? 0));
    if (!(people > 0)) continue;
    const admin = country.politics?.institutionFundingRUSDPerYear ?? 0;
    const health = country.labor?.healthStaffShare ?? 0;
    const education = country.technology?.educationFundingRUSDPerYear ?? 0;
    const research = country.technology?.researchStaffShare ?? 0;
    const pools = [
      ["bureaucrats", admin * (1 - health)],
      ["medics", admin * health],
      ["teachers", education * (1 - research)],
      ["academics", education * research + (country.labor?.trainingBudgetRUSDPerYear ?? 0)],
    ];
    for (const [key, funding] of pools) {
      if (!(funding > 0)) continue;
      const wage = sum(ids.map((id) => (population.get(id) ?? 0) * provinceWage(id, key))) / people;
      if (!(wage > 0)) continue;
      const slots = Math.floor(funding / wage);
      const split = largestRemainder(slots, ids.map((id) => population.get(id) ?? 0));
      ids.forEach((id, index) => {
        if (split[index] > 0) posts.set(`${id}|${key}`, (posts.get(`${id}|${key}`) ?? 0) + split[index]);
      });
    }
  }
  return posts;
}

/**
 * The day-1 employment rule in the generator (plan §9.2): per (province, profession)
 * employed = min(eligible, offered slots), offered = building slots at full staffing plus
 * the province's share (by population) of its country's institution posts (funding ÷ the
 * country's mean wage). Eligible = persons × working-age share × participation (× literacy
 * for literacy-gated professions). Returns workers by `${province}|${profession}`.
 */
export function dayOneEmployment({ pops, buildings, definitions, professions, countries, provinceWage, workingAgeShare, domesticShares = new Map() }) {
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const professionById = new Map(professions.map((profession) => [profession.id, profession]));
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const offered = new Map();
  const ownOperated = new Map();
  const sharing = new Set();
  const add = (key, value) => offered.set(key, (offered.get(key) ?? 0) + value);
  const selfEmployed = (profession) => (profession.roles ?? []).some((role) => role === "subsistence" || role === "owner-operator");
  for (const row of buildings) {
    const definition = definitionByKey.get(row.definitionKey);
    if (definition === undefined) continue;
    for (const job of row.jobMix ?? definition.jobs) {
      const profession = professionById.get(job.professionId);
      const key = `${row.provinceId}|${profession.key}`;
      const slots = Math.floor(job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * row.level);
      add(key, slots);
      // R2: the owner's own jobs are paid by the residual, and the owner profession (or a
      // self-employed one) shares the work: all its eligible people in the province work.
      if (profession.key === row.ownerProfessionKey) ownOperated.set(key, (ownOperated.get(key) ?? 0) + slots);
      if (slots > 0 && (selfEmployed(profession) || profession.key === row.ownerProfessionKey)) sharing.add(key);
    }
  }
  const population = new Map();
  for (const pop of pops) population.set(pop.provinceId, (population.get(pop.provinceId) ?? 0) + pop.population);
  for (const [key, slots] of institutionPostSlots({ countries, population, provinceWage })) add(key, slots);
  const employed = new Map();
  for (const pop of pops) {
    const profession = professionByKey.get(pop.professionKey);
    const literate = (profession.gates ?? []).includes("literacy") ? pop.literacy : 1;
    const eligible = Math.floor(pop.population * workingAgeShare * profession.participationRate * literate);
    const key = `${pop.provinceId}|${pop.professionKey}`;
    const owner = (profession.roles ?? []).some((role) => role === "owns-capital" || role === "owns-land");
    // R1: owners are outside the labour force (their income is profit).
    employed.set(key, owner ? 0 : sharing.has(key) ? eligible : Math.min(eligible, offered.get(key) ?? 0));
  }
  // §4.1 (mirror of the simulation): households hire servants after firms, from the unemployed
  // of the ungated wage-labour professions, up to the province's domestic-service share of its
  // eligible non-owner workers.
  const domestic = new Map();
  const byProvince = new Map();
  for (const pop of pops) {
    if (!byProvince.has(pop.provinceId)) byProvince.set(pop.provinceId, []);
    byProvince.get(pop.provinceId).push(pop);
  }
  for (const [provinceId, list] of byProvince) {
    const share = domesticShares.get(provinceId) ?? 0;
    if (!(share > 0)) continue;
    let workforce = 0;
    const pool = [];
    for (const pop of list) {
      const profession = professionByKey.get(pop.professionKey);
      const owner = (profession.roles ?? []).some((role) => role === "owns-capital" || role === "owns-land");
      const literate = (profession.gates ?? []).includes("literacy") ? pop.literacy : 1;
      const eligible = Math.floor(pop.population * workingAgeShare * profession.participationRate * literate);
      if (!owner) workforce += eligible;
      const servantCapable = (profession.roles ?? []).includes("wage-labour") && !(profession.gates ?? []).some((gate) => gate === "literacy" || gate === "training");
      const key = `${provinceId}|${pop.professionKey}`;
      if (servantCapable) pool.push([key, Math.max(0, eligible - (employed.get(key) ?? 0))]);
    }
    const free = sum(pool.map(([, value]) => value));
    const hires = Math.min(Math.floor(share * workforce), free);
    if (!(hires > 0)) continue;
    const split = largestRemainder(hires, pool.map(([, value]) => value));
    pool.forEach(([key], index) => {
      if (!(split[index] > 0)) return;
      domestic.set(key, split[index]);
      employed.set(key, (employed.get(key) ?? 0) + split[index]);
    });
  }
  return { employed, offered, ownOperated, domestic };
}

/**
 * R5 (P7 provisional): frictional unemployment u* of the day-1 labour market (between the
 * UK trade-union 2.5 % and the US 5.0 % of 1900, both to be verified on the page).
 */
export const FRICTIONAL_UNEMPLOYMENT = 0.04;
/** §4.1: a servant's cash wage ÷ the paid wage of the servant's profession (HSUS D 757 $240 ÷ D 755 $330; as the simulation's DOMESTIC_WAGE_RATIO). */
export const DOMESTIC_WAGE_RATIO = 240 / 330;
/**
 * R8 (P7 provisional): bounds of a territory's clerk factor (the share of the definitions'
 * clerk jobs a territory's buildings keep), dimensionless.
 */
export const CLERK_FACTOR_BOUNDS = { min: 0.2, max: 1 };
/** Peasant farms that may hire farm hands (the peasant workshop does not). */
const PEASANT_FARMS = new Set(["subsistence-farm", "commercial-farm-peasant"]);
/** Sectors whose wage-labour jobs include the census engineers (R8 step d). */
const ENGINEER_SECTORS = new Set(["mining", "manufacturing", "textiles", "food-processing", "energy"]);
/**
 * R8 step (d), P7 provisional (not sourced): the largest share of an industrial building's
 * laborer jobs that may become engineer jobs. The census engineers of mining and manufacturing
 * (GROUP_TO_PROFESSIONS: 1-2 % of the group: stationary engineers, mechanics, foremen) work in
 * the plants; the bound only keeps a territory with few plants from turning them into offices.
 */
export const ENGINEER_SHARE_CAP = 0.1;
/**
 * R8 step (e), P7 provisional: the smallest share of a practice's professional jobs held by
 * academics (the owners: lawyers, writers, artists, clergy), whatever the other gaps.
 */
export const PRACTICE_ACADEMIC_FLOOR = 0.1;
const PRACTICE_PROFESSIONS = ["academics", "medics", "engineers", "teachers"];
/** Jobs below this many workers per throughput unit are dropped from a job mix (rounding slivers). */
const MIN_JOB_WORKERS = 1e-6;

/**
 * R8 (docs/P7_DAY1_LABOUR_PROPOSAL.md; docs/P7_EMPLOYERS_PROPOSAL.md §4.4, §7): each
 * building's own job mix from its territory's census, workers per throughput unit kept:
 *  (a) clerk factor f_t = (1 − u*) × census clerks ÷ the definitions' clerk slots in the
 *      territory, within CLERK_FACTOR_BOUNDS; the clerk workers removed go to laborers
 *      (attendants in services);
 *  (b) peasant farms hire farm hands: the share h_t of their peasant jobs that closes the gap
 *      between the territory's census farm hands and the farm laborer jobs of its other farm
 *      buildings, at most the territory's farm-hand share of agriculture;
 *  (c) the territory's farm profession: peasant-farm jobs become farmer jobs where the census
 *      has no peasants, family-farm farmer jobs become peasant jobs where it has no farmers.
 *  (d) engineers: the territory's census engineers that no definition job or institution post
 *      holds, (1 − u*) × eligible − slots − posts, take laborer jobs of its mining, manufacturing,
 *      textile, food and energy plants (owner workshops excluded), at most ENGINEER_SHARE_CAP of
 *      those jobs;
 *  (e) practices: a professional practice's professional jobs (academics, medics, engineers,
 *      teachers; workers per throughput unit kept) are re-split by the territory's professionals
 *      left without a job or post, the engineers after step (d); academics keep the rest of the
 *      jobs and at least PRACTICE_ACADEMIC_FLOOR of them.
 * `posts` maps `${province}|${profession}` → institution posts (institutionPostSlots).
 * The building's technique is scaled so that its output per staffed throughput unit is
 * unchanged (professions differ in labour productivity). Returns the rows (with `jobMix`
 * where it differs from the definition) and the factors per territory.
 */
export function assignJobMixes({ buildingRows, definitions, professions, pops, provinceTerritory, territoryShares, workingAgeShare, posts = new Map() }) {
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const professionById = new Map(professions.map((profession) => [profession.id, profession]));
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const keyOf = (id) => professionById.get(id).key;
  const eligibleOf = (pop) => {
    const profession = professionByKey.get(pop.professionKey);
    const literate = (profession.gates ?? []).includes("literacy") ? pop.literacy : 1;
    return pop.population * workingAgeShare * profession.participationRate * literate;
  };
  const eligible = new Map();
  const people = new Map();
  for (const pop of pops) {
    const t = provinceTerritory(pop.provinceId);
    eligible.set(`${t}|${pop.professionKey}`, (eligible.get(`${t}|${pop.professionKey}`) ?? 0) + eligibleOf(pop));
    people.set(t, (people.get(t) ?? 0) + pop.population);
  }
  const present = (t, key) => (eligible.get(`${t}|${key}`) ?? 0) > 0;
  const slotsOf = (row, definition, job) => job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * row.level;
  const clerkSlots = new Map();
  const farmLaborerSlots = new Map();
  const peasantFarmSlots = new Map();
  const tadd = (map, key, value) => map.set(key, (map.get(key) ?? 0) + value);
  const professionalSlots = new Map();
  const practiceSlots = new Map();
  const industrialLaborerSlots = new Map();
  const postsOf = new Map();
  for (const [key, value] of posts) {
    const [provinceId, profession] = key.split("|");
    tadd(postsOf, `${provinceTerritory(Number(provinceId))}|${profession}`, value);
  }
  for (const row of buildingRows) {
    const definition = definitionByKey.get(row.definitionKey);
    if (definition === undefined) continue;
    const t = provinceTerritory(row.provinceId);
    for (const job of definition.jobs) {
      const key = keyOf(job.professionId);
      if (PRACTICE_PROFESSIONS.includes(key)) {
        if (PRACTICES.has(definition.key)) tadd(practiceSlots, t, slotsOf(row, definition, job));
        else tadd(professionalSlots, `${t}|${key}`, slotsOf(row, definition, job));
      }
      if (key === "laborers" && ENGINEER_SECTORS.has(definition.sector) && !OWNER_WORKSHOPS.has(definition.key)) tadd(industrialLaborerSlots, t, slotsOf(row, definition, job));
      if (key === "clerks") clerkSlots.set(t, (clerkSlots.get(t) ?? 0) + slotsOf(row, definition, job));
      if (definition.sector === "agriculture" && key === "laborers") farmLaborerSlots.set(t, (farmLaborerSlots.get(t) ?? 0) + slotsOf(row, definition, job));
      if (PEASANT_FARMS.has(definition.key) && key === "peasants") peasantFarmSlots.set(t, (peasantFarmSlots.get(t) ?? 0) + slotsOf(row, definition, job));
    }
  }
  const laborerParticipation = professionByKey.get("laborers").participationRate;
  const factors = new Map();
  const factorsOf = (t) => {
    let entry = factors.get(t);
    if (entry !== undefined) return entry;
    const clerks = clerkSlots.get(t) ?? 0;
    const clerk = clerks > 0 ? Math.min(CLERK_FACTOR_BOUNDS.max, Math.max(CLERK_FACTOR_BOUNDS.min, ((1 - FRICTIONAL_UNEMPLOYMENT) * (eligible.get(`${t}|clerks`) ?? 0)) / clerks)) : 1;
    const share = territoryShares.get(t);
    const farmHands = (share?.farmHandShare ?? 0) * (people.get(t) ?? 0) * workingAgeShare * laborerParticipation;
    const peasantSlots = peasantFarmSlots.get(t) ?? 0;
    const hired = peasantSlots > 0 ? Math.min(share?.farmHandShareOfAgriculture ?? 0, Math.max(0, (farmHands - (farmLaborerSlots.get(t) ?? 0)) / peasantSlots)) : 0;
    // (d), (e): the professionals no definition job or post holds.
    const gapOf = (key) => Math.max(0, (1 - FRICTIONAL_UNEMPLOYMENT) * (eligible.get(`${t}|${key}`) ?? 0) - (professionalSlots.get(`${t}|${key}`) ?? 0) - (postsOf.get(`${t}|${key}`) ?? 0));
    const pool = industrialLaborerSlots.get(t) ?? 0;
    const engineerGap = gapOf("engineers");
    const engineer = pool > 0 ? Math.min(ENGINEER_SHARE_CAP, engineerGap / pool) : 0;
    const gaps = { medics: gapOf("medics"), engineers: Math.max(0, engineerGap - engineer * pool), teachers: gapOf("teachers") };
    const practiceJobs = practiceSlots.get(t) ?? 0;
    let practice = null;
    const wanted = sum(Object.values(gaps));
    if (practiceJobs > 0 && wanted > 0) {
      const scale = Math.min(1, ((1 - PRACTICE_ACADEMIC_FLOOR) * practiceJobs) / wanted);
      practice = Object.fromEntries(Object.entries(gaps).map(([key, gap]) => [key, (gap * scale) / practiceJobs]));
      practice.academics = 1 - sum(Object.values(practice));
    }
    entry = { clerk, hired, engineer, practice, peasants: present(t, "peasants"), farmers: present(t, "farmers") };
    factors.set(t, entry);
    return entry;
  };
  const productivity = (jobs) => {
    const total = sum(jobs.map(([, workers]) => workers));
    return total > 0 ? sum(jobs.map(([key, workers]) => workers * professionByKey.get(key).laborProductivityModifier)) / total : 1;
  };
  let changed = 0;
  const rows = buildingRows.map((row) => {
    const definition = definitionByKey.get(row.definitionKey);
    if (definition === undefined || definition.jobs.length === 0) return row;
    const t = provinceTerritory(row.provinceId);
    const f = factorsOf(t);
    const jobs = new Map(definition.jobs.map((job) => [keyOf(job.professionId), job.workersPerThroughputUnit]));
    const move = (from, to, workers) => {
      if (!(workers > 0)) return;
      jobs.set(from, (jobs.get(from) ?? 0) - workers);
      jobs.set(to, (jobs.get(to) ?? 0) + workers);
    };
    if (jobs.has("clerks") && f.clerk < 1) move("clerks", definition.sector === "services" ? "attendants" : "laborers", jobs.get("clerks") * (1 - f.clerk));
    if (PEASANT_FARMS.has(definition.key) && jobs.has("peasants")) {
      if (!f.peasants && f.farmers) move("peasants", "farmers", jobs.get("peasants"));
      else move("peasants", "laborers", jobs.get("peasants") * f.hired);
    }
    if (jobs.has("farmers") && !f.farmers && f.peasants) move("farmers", "peasants", jobs.get("farmers"));
    if (f.engineer > 0 && jobs.has("laborers") && ENGINEER_SECTORS.has(definition.sector) && !OWNER_WORKSHOPS.has(definition.key)) move("laborers", "engineers", jobs.get("laborers") * f.engineer);
    if (f.practice !== null && PRACTICES.has(definition.key)) {
      const professional = sum(PRACTICE_PROFESSIONS.map((key) => jobs.get(key) ?? 0));
      for (const key of PRACTICE_PROFESSIONS) jobs.set(key, professional * f.practice[key]);
    }
    const mix = [...jobs].filter(([, workers]) => workers > MIN_JOB_WORKERS);
    const original = definition.jobs.map((job) => [keyOf(job.professionId), job.workersPerThroughputUnit]);
    const same = mix.length === original.length && original.every(([key, workers]) => Math.abs((jobs.get(key) ?? 0) - workers) < 1e-9);
    if (same) return row;
    changed += 1;
    const jobMix = mix
      .map(([key, workers]) => ({ professionId: professionByKey.get(key).id, workersPerThroughputUnit: Number(workers.toPrecision(12)) }))
      .sort((a, b) => a.professionId - b.professionId);
    const drift = sum(jobMix.map((job) => job.workersPerThroughputUnit)) - sum(definition.jobs.map((job) => job.workersPerThroughputUnit));
    // The rounding drift goes to the largest job, so no small job can turn negative.
    const largest = jobMix.reduce((best, job) => (job.workersPerThroughputUnit > best.workersPerThroughputUnit ? job : best));
    largest.workersPerThroughputUnit = Number((largest.workersPerThroughputUnit - drift).toPrecision(12));
    if (jobMix.some((job) => !(job.workersPerThroughputUnit > 0))) throw new Error(`P7: job mix of ${row.key} has a job without workers`);
    const technique = Number(((row.technique ?? 1) * (productivity(original) / productivity(mix))).toPrecision(7));
    return { ...row, technique, jobMix };
  });
  return { rows, factors, changed };
}

/**
 * R3 (docs/P7_DAY1_LABOUR_PROPOSAL.md, fixes D1): after placement, each territory's
 * non-owner blocks are redistributed over its provinces by iterative proportional fitting
 * that keeps every province's non-owner people and every profession's territory total
 * (the census), seeded by where the profession's jobs are (job slots ÷ workers per person)
 * plus SPLIT_SETTLEMENT_SEED of its settlement weight; `extraSlots` (the institution posts by
 * province) count as jobs. Owners (capitalists, aristocrats) keep
 * their split. Integer people by largest remainder within each province, so province totals
 * are exact; a profession's territory total may move by at most one person per province.
 * Attributes of a (province, profession) block that did not exist come from the territory's
 * people of that profession (population-weighted mean).
 */
export const SPLIT_SETTLEMENT_SEED = 0.02;
export function conservingSplit({ pops, buildingRows, definitions, professions, provinces, workingAgeShare, provinceTotals, extraSlots = new Map() }) {
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const professionById = new Map(professions.map((profession) => [profession.id, profession]));
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const owners = new Set(professions.filter((profession) => (profession.roles ?? []).some((role) => role === "owns-capital" || role === "owns-land")).map((profession) => profession.key));
  const settlementOf = new Map(P7_PROFESSIONS.map((entry) => [entry.key, entry.settlement]));
  const slots = new Map();
  for (const row of buildingRows) {
    const definition = definitionByKey.get(row.definitionKey);
    if (definition === undefined) continue;
    for (const job of row.jobMix ?? definition.jobs) {
      const key = `${row.provinceId}|${professionById.get(job.professionId).key}`;
      slots.set(key, (slots.get(key) ?? 0) + job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * row.level);
    }
  }
  // Institution posts (spread by population, as the simulation spreads them) seed their staff too.
  for (const [key, value] of extraSlots) slots.set(key, (slots.get(key) ?? 0) + value);
  const byTerritory = new Map();
  for (const pop of pops) {
    const t = provinceById.get(pop.provinceId).territoryKey;
    if (!byTerritory.has(t)) byTerritory.set(t, []);
    byTerritory.get(t).push(pop);
  }
  const out = [];
  for (const [, list] of [...byTerritory].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ids = [...new Set(list.map((pop) => pop.provinceId))].sort((a, b) => a - b);
    const keys = [...new Set(list.map((pop) => pop.professionKey))].filter((key) => !owners.has(key)).sort();
    const blockOf = new Map(list.map((pop) => [`${pop.provinceId}|${pop.professionKey}`, pop]));
    // Province totals are the P4/P2b ones (the first-pass split by settlement does not keep them, D1).
    const ownersIn = (id) => sum(list.filter((pop) => pop.provinceId === id && owners.has(pop.professionKey)).map((pop) => pop.population));
    const rowTotal = new Map(ids.map((id) => [id, Math.max(0, (provinceTotals?.get(id) ?? sum(list.filter((pop) => pop.provinceId === id).map((pop) => pop.population))) - ownersIn(id))]));
    const colTotal = new Map(keys.map((key) => [key, sum(list.filter((pop) => pop.professionKey === key).map((pop) => pop.population))]));
    const people = new Map(ids.map((id) => [id, sum(list.filter((pop) => pop.provinceId === id).map((pop) => pop.population))]));
    const mean = new Map();
    for (const key of keys) {
      const group = list.filter((pop) => pop.professionKey === key);
      const total = sum(group.map((pop) => pop.population)) || 1;
      const avg = (field) => sum(group.map((pop) => pop[field] * pop.population)) / total;
      mean.set(key, { literacy: avg("literacy"), wealthLevel: avg("wealthLevel"), savingsPerCapitaRUSD: avg("savingsPerCapitaRUSD"), militancy: avg("militancy"), sourceIds: group[0]?.sourceIds ?? ["p7-labour"] });
    }
    const x = new Map();
    for (const key of keys) {
      const profession = professionByKey.get(key);
      const settle = settlementOf.get(key);
      const weights = ids.map((id) => {
        const urban = provinceById.get(id).urbanShare ?? 0;
        return settle === "rural" ? people.get(id) * (1 - urban) : settle === "urban" ? people.get(id) * urban : people.get(id);
      });
      const wsum = sum(weights) || 1;
      const perPerson = (id) => {
        const literacy = (profession.gates ?? []).includes("literacy") ? blockOf.get(`${id}|${key}`)?.literacy ?? mean.get(key).literacy : 1;
        return Math.max(1e-9, workingAgeShare * profession.participationRate * literacy);
      };
      const capacity = ids.map((id) => (slots.get(`${id}|${key}`) ?? 0) / perPerson(id));
      const csum = sum(capacity);
      ids.forEach((id, index) => x.set(`${id}|${key}`, (1 - SPLIT_SETTLEMENT_SEED) * (csum > 0 ? capacity[index] / csum : weights[index] / wsum) + SPLIT_SETTLEMENT_SEED * (weights[index] / wsum) + 1e-12));
    }
    for (let iteration = 0; iteration < 1000; iteration += 1) {
      for (const key of keys) {
        const s = sum(ids.map((id) => x.get(`${id}|${key}`)));
        const f = s > 0 ? colTotal.get(key) / s : 0;
        for (const id of ids) x.set(`${id}|${key}`, x.get(`${id}|${key}`) * f);
      }
      let error = 0;
      for (const id of ids) {
        const s = sum(keys.map((key) => x.get(`${id}|${key}`)));
        const f = s > 0 ? rowTotal.get(id) / s : 0;
        if (rowTotal.get(id) > 0) error = Math.max(error, Math.abs(f - 1));
        for (const key of keys) x.set(`${id}|${key}`, x.get(`${id}|${key}`) * f);
      }
      if (error < 1e-10) break;
    }
    for (const id of ids) {
      const integer = largestRemainder(rowTotal.get(id), keys.map((key) => x.get(`${id}|${key}`)));
      keys.forEach((key, index) => {
        const population = integer[index];
        if (!(population > 0)) return;
        const source = blockOf.get(`${id}|${key}`);
        const attr = source ?? mean.get(key);
        out.push({
          ...(source ?? {}),
          provinceId: id,
          professionKey: key,
          population,
          literacy: Math.round(attr.literacy * 1e6) / 1e6,
          wealthLevel: Math.round(attr.wealthLevel * 100) / 100,
          savingsPerCapitaRUSD: Math.round(attr.savingsPerCapitaRUSD * 100) / 100,
          militancy: Math.round(attr.militancy * 1e4) / 1e4,
          sourceIds: source?.sourceIds ?? attr.sourceIds,
          calibrationStatus: "provisional",
        });
      });
    }
    for (const pop of list) if (owners.has(pop.professionKey)) out.push({ ...pop });
  }
  out.sort((a, b) => a.provinceId - b.provinceId || a.professionKey.localeCompare(b.professionKey));
  return out;
}

/**
 * S11 (docs/P7_OCCUPATIONS_1900.md §10.4): movable buildings follow workers. Inside each
 * territory, the levels of every definition without land use or a deposit are spread over the
 * territory's provinces in proportion to the workers its jobs need that the land and deposit
 * buildings leave there (eligible persons of each profession minus the fixed jobs, weighted by
 * the definition's job shares). Totals per territory and definition are kept: level, level ×
 * technique (so output) and operating cash. Rows of a province that keeps the definition keep
 * their key and owner; new rows take the key `<province>-<definition>-p7` and the owner of the
 * territory's first row of the definition (the owner remap runs next).
 */
export function relocateMovableBuildings({ buildingRows, definitions, professions, pops, provinces, workingAgeShare }) {
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const professionById = new Map(professions.map((profession) => [profession.id, profession]));
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  // A building tied to land, a deposit or a river (hydro potential, C-12) stays where it is.
  const movable = (row, definition) =>
    definition.landUse === undefined && row.depositId === undefined && definition.usesHydroPotential !== true && definition.jobs.length > 0;
  const eligible = new Map();
  for (const pop of pops) {
    const profession = professionByKey.get(pop.professionKey);
    const literate = (profession.gates ?? []).includes("literacy") ? pop.literacy : 1;
    const key = `${pop.provinceId}|${pop.professionKey}`;
    eligible.set(key, (eligible.get(key) ?? 0) + pop.population * workingAgeShare * profession.participationRate * literate);
  }
  const fixed = new Map();
  const groups = new Map();
  const kept = [];
  for (const row of buildingRows) {
    const definition = definitionByKey.get(row.definitionKey);
    if (definition === undefined || !movable(row, definition)) {
      kept.push(row);
      if (definition !== undefined) for (const job of row.jobMix ?? definition.jobs) {
        const key = `${row.provinceId}|${professionById.get(job.professionId).key}`;
        fixed.set(key, (fixed.get(key) ?? 0) + job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * row.level);
      }
      continue;
    }
    const territory = provinceById.get(row.provinceId).territoryKey;
    const groupKey = `${territory}|${definition.key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { territory, definition, rows: [] });
    groups.get(groupKey).rows.push(row);
  }
  const provincesOf = new Map();
  for (const province of provinces) {
    if (!provincesOf.has(province.territoryKey)) provincesOf.set(province.territoryKey, []);
    provincesOf.get(province.territoryKey).push(province.id);
  }
  const populated = new Set(pops.filter((pop) => pop.population > 0).map((pop) => pop.provinceId));
  const rest = (provinceId, key) => Math.max(0, (eligible.get(`${provinceId}|${key}`) ?? 0) - (fixed.get(`${provinceId}|${key}`) ?? 0));
  const out = [...kept];
  let moved = 0;
  for (const { territory, definition, rows } of [...groups.values()].sort((a, b) => (a.territory + a.definition.key).localeCompare(b.territory + b.definition.key))) {
    const ids = (provincesOf.get(territory) ?? []).filter((id) => populated.has(id)).sort((a, b) => a - b);
    const total = sum(definition.jobs.map((job) => job.workersPerThroughputUnit));
    const weights = ids.map((id) => sum(definition.jobs.map((job) => (job.workersPerThroughputUnit / total) * rest(id, professionById.get(job.professionId).key))));
    const level = sum(rows.map((row) => row.level));
    if (!(sum(weights) > 0) || ids.length === 0) {
      out.push(...rows);
      continue;
    }
    const levels = largestRemainder(level, weights);
    const techniqueLevel = sum(rows.map((row) => (row.technique ?? 1) * row.level));
    const cash = sum(rows.map((row) => row.operatingCashRUSD));
    const byProvince = new Map(rows.map((row) => [row.provinceId, row]));
    ids.forEach((id, index) => {
      const n = levels[index];
      if (!(n > 0)) return;
      const existing = byProvince.get(id);
      if (existing === undefined || existing.level !== n) moved += Math.abs(n - (existing?.level ?? 0));
      out.push({
        ...(existing ?? rows[0]),
        key: existing?.key ?? `${provinceById.get(id).key}-${definition.key}-p7`,
        provinceId: id,
        level: n,
        technique: Number((techniqueLevel / level).toPrecision(7)),
        operatingCashRUSD: Math.round(((cash * n) / level) * 100) / 100,
      });
    });
    for (const row of rows) if (!ids.includes(row.provinceId)) moved += row.level;
  }
  out.sort((a, b) => a.provinceId - b.provinceId || a.key.localeCompare(b.key));
  return { rows: out, movedLevels: moved / 2 };
}

/**
 * S12 (option C of docs/P7_DAY1_LABOUR_PROPOSAL.md): capitalist and aristocrat buildings pay
 * the sourced labour share of their value added in wages. Each such building's level is raised
 * by k = labour share × value added ÷ wage bill (when above 1) and its technique lowered by the
 * same factor, so output is unchanged; the extra jobs per territory and profession are limited
 * to LABOUR_SHARE_WORKFORCE_LIMIT of its ungated workforce (P2b's placement cap share).
 * `valueAddedOf(row)` and `wageBillOf(row)` are RUSD per year at opening prices.
 */
export const LABOUR_SHARE_WORKFORCE_LIMIT = 0.95;
export function restoreLabourShare({ buildingRows, definitions, professions, pops, provinces, workingAgeShare, valueAddedOf, wageBillOf, laborShare }) {
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const professionById = new Map(professions.map((profession) => [profession.id, profession]));
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const owners = new Set(professions.filter((profession) => (profession.roles ?? []).some((role) => role === "owns-capital" || role === "owns-land")).map((profession) => profession.key));
  const gated = (key) => (professionByKey.get(key).gates ?? []).some((gate) => gate === "literacy" || gate === "training");
  const workforce = new Map();
  for (const pop of pops) {
    const key = `${provinceById.get(pop.provinceId).territoryKey}|${pop.professionKey}`;
    workforce.set(key, (workforce.get(key) ?? 0) + pop.population * workingAgeShare * professionByKey.get(pop.professionKey).participationRate);
  }
  const jobsNow = new Map();
  const want = [];
  for (const row of buildingRows) {
    const definition = definitionByKey.get(row.definitionKey);
    if (definition === undefined) continue;
    const t = provinceById.get(row.provinceId).territoryKey;
    for (const job of row.jobMix ?? definition.jobs) {
      const key = `${t}|${professionById.get(job.professionId).key}`;
      jobsNow.set(key, (jobsNow.get(key) ?? 0) + job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * row.level);
    }
    if (!owners.has(row.ownerProfessionKey)) continue;
    const va = valueAddedOf(row);
    const wages = wageBillOf(row);
    if (!(va > 0) || !(wages > 0)) continue;
    const k = (laborShare(definition) * va) / wages;
    if (k > 1) want.push({ row, definition, t, k });
  }
  const extra = new Map();
  for (const { row, definition, t, k } of want) {
    for (const job of row.jobMix ?? definition.jobs) {
      const key = `${t}|${professionById.get(job.professionId).key}`;
      extra.set(key, (extra.get(key) ?? 0) + (k - 1) * job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * row.level);
    }
  }
  const scale = new Map();
  for (const [key, x] of extra) {
    const room = Math.max(0, LABOUR_SHARE_WORKFORCE_LIMIT * (workforce.get(key) ?? 0) - (jobsNow.get(key) ?? 0));
    scale.set(key, x > 0 ? Math.min(1, room / x) : 1);
  }
  const factorOf = new Map();
  for (const { row, definition, t, k } of want) {
    const f = Math.min(...(row.jobMix ?? definition.jobs).map((job) => {
      const key = professionById.get(job.professionId).key;
      return gated(key) ? 1 : scale.get(`${t}|${key}`) ?? 1;
    }));
    const multiplier = 1 + (k - 1) * f;
    const level = Math.max(row.level, Math.round(row.level * multiplier));
    if (level > row.level) factorOf.set(row.key, level / row.level);
  }
  let raised = 0;
  const rows = buildingRows.map((row) => {
    const m = factorOf.get(row.key);
    if (m === undefined) return row;
    raised += 1;
    const level = Math.round(row.level * m);
    return { ...row, level, technique: Number((((row.technique ?? 1) * row.level) / level).toPrecision(7)) };
  });
  return { rows, raised };
}

/**
 * S5 (docs/P7_EMPLOYERS_PROPOSAL.md §4.2-4.3): a share of each trading house's and bank's
 * levels becomes a shop or a professional practice in the same province (output, technique and
 * operating cash kept). SMALL_RETAIL_SHARE comes from the German trade census of 1907 (persons
 * in establishments of up to five persons ÷ all, Statistisches Jahrbuch 1910 pp.63-65);
 * PRACTICE_SHARE_OF_FINANCE is P7 provisional (no 1900 split of "finance and professional
 * services" was found). Levels are integers; a row keeps at least one level.
 */
export const PRACTICE_SHARE_OF_FINANCE = 0.5;

/**
 * Technique of a converted row, so that its main output per level stays the source's: the
 * definitions' output per throughput unit differ (the catalogue sizes it from the reference
 * wage bill of the jobs), so a level of a practice makes less than a level of a bank.
 */
function convertedTechnique(row, from, to) {
  const perLevel = (definition) => definition.outputs[0].quantityPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne;
  if (from.outputs[0].goodId !== to.outputs[0].goodId) throw new Error(`P7: ${from.key} and ${to.key} make different goods`);
  return Number(((row.technique ?? 1) * (perLevel(from) / perLevel(to))).toPrecision(7));
}

/**
 * P7 provisional (not sourced): the largest share of a territory's personal-services levels
 * that become medical practices.
 */
export const MEDICAL_SHARE_CAP = 0.5;
/**
 * The medical practice (D-154): in 1900 most physicians, nurses and midwives worked on their
 * own account, few in public posts. In each territory, the levels of personal services that
 * give the territory's medics without a post their jobs, (1 − u*) × eligible medics − health
 * posts, become medical practices (owner: medics; output, technique and cash kept), at most
 * MEDICAL_SHARE_CAP of the levels; the territory's converted levels are spread over its
 * personal-services rows by largest remainder on their levels (the movable-building step then
 * moves them to the medics). `posts` as in assignJobMixes.
 */
export function convertToMedicalPractices({ buildingRows, definitions, professions, pops, provinces, posts, workingAgeShare }) {
  const tadd = (map, key, value) => map.set(key, (map.get(key) ?? 0) + value);
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const definition = definitions.find((entry) => entry.key === "medical-practice");
  const source = definitions.find((entry) => entry.key === "personal-services");
  const medics = professions.find((profession) => profession.key === "medics");
  const medicJobsPerLevel = sum(definition.jobs.filter((job) => job.professionId === medics.id).map((job) => job.workersPerThroughputUnit)) * definition.referenceThroughputPerDayAtLevelOne;
  if (!(medicJobsPerLevel > 0)) throw new Error("P7: the medical practice has no medic jobs");
  const territoryOf = (id) => provinceById.get(id).territoryKey;
  const eligible = new Map();
  for (const pop of pops) {
    if (pop.professionKey !== "medics") continue;
    tadd(eligible, territoryOf(pop.provinceId), pop.population * workingAgeShare * medics.participationRate * pop.literacy);
  }
  const healthPosts = new Map();
  for (const [key, value] of posts) {
    const [provinceId, profession] = key.split("|");
    if (profession === "medics") tadd(healthPosts, territoryOf(Number(provinceId)), value);
  }
  const rowsOf = new Map();
  buildingRows.forEach((row, index) => {
    if (row.definitionKey !== "personal-services") return;
    const t = territoryOf(row.provinceId);
    if (!rowsOf.has(t)) rowsOf.set(t, []);
    rowsOf.get(t).push(index);
  });
  const moved = new Map();
  const shares = {};
  for (const [t, indices] of [...rowsOf].sort((a, b) => a[0].localeCompare(b[0]))) {
    const levels = sum(indices.map((index) => buildingRows[index].level));
    const gap = Math.max(0, (1 - FRICTIONAL_UNEMPLOYMENT) * (eligible.get(t) ?? 0) - (healthPosts.get(t) ?? 0));
    const want = Math.min(Math.floor(levels * MEDICAL_SHARE_CAP), Math.round(gap / medicJobsPerLevel));
    shares[t] = levels > 0 ? Number((want / levels).toPrecision(6)) : 0;
    if (!(want > 0)) continue;
    const split = largestRemainder(want, indices.map((index) => buildingRows[index].level));
    indices.forEach((index, position) => {
      if (split[position] > 0) moved.set(index, Math.min(buildingRows[index].level, split[position]));
    });
  }
  const out = [];
  let converted = 0;
  buildingRows.forEach((building, index) => {
    const count = moved.get(index) ?? 0;
    if (!(count > 0)) {
      out.push(building);
      return;
    }
    converted += count;
    const cashShare = count / building.level;
    if (building.level - count > 0) out.push({ ...building, level: building.level - count, operatingCashRUSD: Math.round(building.operatingCashRUSD * (1 - cashShare) * 100) / 100 });
    out.push({
      ...building,
      key: `${provinceById.get(building.provinceId).key}-medical-practice-p7c`,
      definitionKey: "medical-practice",
      ownerProfessionKey: "medics",
      technique: convertedTechnique(building, source, definition),
      level: count,
      operatingCashRUSD: Math.round(building.operatingCashRUSD * cashShare * 100) / 100,
    });
  });
  return { rows: out, convertedLevels: converted, shareByTerritory: shares };
}
export function convertToOwnerEstablishments({ buildingRows, distributionRows, provinces, definitions }) {
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const row = (key) => {
    const found = distributionRows.find((entry) => entry.key === key);
    if (found === undefined) throw new Error(`P7: missing distribution row ${key}`);
    return found.value;
  };
  const smallRetail = row("deu-1907-C-persons-le5") / row("deu-1907-C-persons");
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const out = [];
  let converted = 0;
  for (const building of buildingRows) {
    const target = building.definitionKey === "trading-house" ? ["shop", smallRetail] : building.definitionKey === "bank-and-office" ? ["professional-practice", PRACTICE_SHARE_OF_FINANCE] : null;
    if (target === null) {
      out.push(building);
      continue;
    }
    const [definitionKey, share] = target;
    const moved = Math.min(building.level, Math.round(building.level * share));
    if (moved <= 0) {
      out.push(building);
      continue;
    }
    converted += moved;
    const cashShare = moved / building.level;
    if (building.level - moved > 0) out.push({ ...building, level: building.level - moved, operatingCashRUSD: Math.round(building.operatingCashRUSD * (1 - cashShare) * 100) / 100 });
    out.push({
      ...building,
      key: `${provinceById.get(building.provinceId).key}-${definitionKey}-p7c`,
      definitionKey,
      technique: convertedTechnique(building, definitionByKey.get(building.definitionKey), definitionByKey.get(definitionKey)),
      level: moved,
      operatingCashRUSD: Math.round(building.operatingCashRUSD * cashShare * 100) / 100,
    });
  }
  return { rows: out, convertedLevels: converted, smallRetailShare: smallRetail };
}
