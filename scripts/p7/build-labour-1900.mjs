#!/usr/bin/env node
/**
 * P7 (D-154): the 1900 labour market of the 1900 world.
 *
 * The P7 steps run inside scripts/p5b/build-goods-1900.mjs (the blocks they make size
 * and place the buildings); this module exports them, and run directly it delegates to
 * that generator:
 *   node scripts/p7/build-labour-1900.mjs           rebuild (same as build-goods-1900)
 *   node scripts/p7/build-labour-1900.mjs --check   verify every P5b, P6 and P7 output
 *
 * Outputs (packages/data/data/historical/p7/): professions_1900.json (sixteen),
 * pops_1900.json (blocks with measured 1900 incomes), demography_1900.json (the P4 file
 * with the blocks' urban shares by settlement), labour_1900.json (labour-market
 * configuration), employment_1900.json (empty: the world's first refresh employs),
 * politics_1900.json (interest groups remapped, plan §3.5); docs/P7_BEFORE_AFTER.md and
 * docs/P7_LABOUR_PROVENANCE.md. The P5b outputs carry the remapped jobs, sixteen-key
 * province wage tables, the institution policy and the owners.
 *
 * Incomes (plan Q18; designer's decision of 2026-11-09, "one pass, measure once"): the
 * demand system and placement use the P6 income estimate; a block's opening income per
 * person per day is then measured once = (its day-1 employed workers × its province wage
 * + the profits of the buildings it owns) ÷ persons ÷ 365; employment by the day-1 rule
 * (labour-build.mjs `dayOneEmployment`); profit = (value added at opening prices − wages)
 * at the province's staffing of the building's jobs − upkeep, at least 0. No fixed point
 * is iterated: placement sizes output to demand, so incomes with profits run away and
 * wage-only incomes collapse (the before/after report gives the gap).
 */
import { domesticServiceShares } from "./occupations.mjs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESTATE_TERRITORIES, P7_PROFESSIONS } from "./labour.mjs";

/** P5 FARM_LABOUR_ELASTICITY (packages/sim economy/constants.ts): output of a land-using building ∝ staffing^0.6. */
const FARM_LABOUR_ELASTICITY = 0.6;
import {
  DOMESTIC_SERVICE_BUILDINGS,
  blockUrbanShares,
  dayOneEmployment,
  institutionPolicy,
  professionDefinitions,
  remapDefinitions,
  remapOwners,
  assignJobMixes,
  DOMESTIC_WAGE_RATIO,
  relocateMovableBuildings,
  convertToOwnerEstablishments,
  restoreLabourShare,
  conservingSplit,
  institutionFunctionShares,
  institutionPostSlots,
  convertToMedicalPractices,
  splitPopulation,
  territoryShares,
  wageTable16,
} from "./labour-build.mjs";


const sum = (values) => values.reduce((acc, value) => acc + value, 0);
const json = (value) => `${JSON.stringify(value, null, 1)}\n`;
const sig = (value) => Number(value.toPrecision(6));

/** Interest-group membership by profession after P7 (plan §3.5, Q19); weights PROVISIONAL. */
export const INTEREST_GROUPS_P7 = {
  aristocrats: { aristocrats: 1 },
  capitalists: { capitalists: 1, shopkeepers: 0.4 },
  labor: { laborers: 0.9, attendants: 0.8, clerks: 0.3 },
  intelligentsia: { academics: 1, teachers: 0.6, medics: 0.5, engineers: 0.5 },
  military: { officers: 1, servicemen: 1, laborers: 0.1 },
  bureaucrats: { bureaucrats: 1, clerks: 0.3 },
  rural: { peasants: 1, farmers: 1 },
};

export function buildP7Labour({ sources, politics, demographyDefinitions, oldPops, oldProfessions, provinces, definitions, p2bCalibration, p2bRow, p4 }) {
  const usLaborerUsd = p2bRow("us-wage-production-hourly-1900") * p2bRow("standard-hours-per-week") * p2bRow("weeks-per-year");
  const defs = professionDefinitions({
    oldProfessions,
    p2bRatios: p2bCalibration.professionRatios,
    usLaborerRUSD: p2bCalibration.territories["usa-home"].wageTable.laborers,
    usLaborerUsd,
    wageRows: sources.wageRows,
    provisionalRows: sources.provisionalRows,
  });
  const professions = defs.professions;
  // Before (P6 world, the same method P6 used): five professions, estimated incomes.
  const oldByKey = new Map(oldProfessions.map((profession) => [profession.key, profession]));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const before = { byTerritory: {}, world: {} };
  for (const pop of oldPops) {
    const territory = provinceById.get(pop.provinceId).territoryKey;
    const wage = provinceById.get(pop.provinceId).wageRUSDPerYearByProfession[pop.professionKey] ?? oldByKey.get(pop.professionKey).baseWage1900RUSDPerYear;
    const income = wage * oldByKey.get(pop.professionKey).participationRate * p2bCalibration.workingAgeShare * pop.population;
    const row = (before.byTerritory[territory] ??= { persons: {}, incomeRUSDPerYear: 0, population: 0 });
    row.persons[pop.professionKey] = (row.persons[pop.professionKey] ?? 0) + pop.population;
    row.incomeRUSDPerYear += income;
    row.population += pop.population;
    before.world[pop.professionKey] = (before.world[pop.professionKey] ?? 0) + pop.population;
  }
  // Sixteen-key wage tables (plan §3.2): laborer wage × the US ratio.
  for (const province of provinces) province.wageRUSDPerYearByProfession = wageTable16(province.wageRUSDPerYearByProfession.laborers, defs.ratios);
  const engineerShare = sources.provisionalRows.find((row) => row.id === "engineer-share-heavy-industry").value;
  const remapped = remapDefinitions({ definitions, professions, engineerShare });
  definitions.splice(0, definitions.length, ...remapped);
  // Occupation shares and the split.
  const territories = Object.keys(p2bCalibration.territories);
  const territoryOfProvince = (id) => provinceById.get(id)?.territoryKey;
  const urbanPersons = new Map();
  const territoryPersons = new Map();
  for (const pop of oldPops) {
    const key = territoryOfProvince(pop.provinceId);
    territoryPersons.set(key, (territoryPersons.get(key) ?? 0) + pop.population);
    urbanPersons.set(key, (urbanPersons.get(key) ?? 0) + pop.population * (provinceById.get(pop.provinceId).urbanShare ?? 0));
  }
  const shares = territoryShares({
    territories,
    occupationRows: sources.occupationRows,
    distributionRows: sources.distributionRows,
    realGdpPerHead: (key) => p2bCalibration.territories[key].relativeToUS * p2bCalibration.territories["usa-home"].gdpPerHeadRUSD.value,
    urbanShareOf: (key) => ((territoryPersons.get(key) ?? 0) > 0 ? (urbanPersons.get(key) ?? 0) / territoryPersons.get(key) : 0),
  });
  const pops = splitPopulation({ oldPops, provinces, shares: shares.byTerritory, professions });
  const urbanRows = blockUrbanShares({ pops, provinces });
  const provinceWage = (provinceId, key) => provinceById.get(provinceId)?.wageRUSDPerYearByProfession?.[key] ?? 0;

  const politics1900 = {
    ...politics,
    administrationProfessionKeys: ["bureaucrats"],
    interestGroups: politics.interestGroups.map((group) => ({ ...group, membershipByProfessionKey: INTEREST_GROUPS_P7[group.key] ?? {} })),
  };

  // §4.1: households' domestic servants per eligible worker, by province (its territory's share).
  const servants = domesticServiceShares({
    territories: Object.keys(p2bCalibration.territories),
    occupationRows: sources.occupationRows,
    distributionRows: sources.distributionRows,
    realGdpPerHead: (key) => p2bCalibration.territories[key].relativeToUS * p2bCalibration.territories["usa-home"].gdpPerHeadRUSD.value,
  });
  const populatedProvinces = [...new Set(oldPops.map((pop) => pop.provinceId))].sort((a, b) => a - b);
  const domesticShares = populatedProvinces
    .map((provinceId) => ({ provinceId, share: Number((servants.byTerritory.get(provinceById.get(provinceId)?.territoryKey)?.share ?? 0).toPrecision(6)) }))
    .filter((entry) => entry.share > 0);
  const provinceTotals = new Map();
  for (const pop of oldPops) provinceTotals.set(pop.provinceId, (provinceTotals.get(pop.provinceId) ?? 0) + pop.population);
  const result = {
    professions,
    pops,
    provinceTotals,
    domesticServiceShares: domesticShares,
    domesticServiceFit: servants.fit,
    territoryShares: shares.byTerritory,
    distributionRows: sources.distributionRows,
    urbanRows,
    ratios: defs.ratios,
    provinceWage,
    finalRound: null,
    outputs(loop) {
      return {
        "../p7/professions_1900.json": json(professions),
        "../p7/demography_1900.json": json({
          ...p4,
          meta: { ...p4.meta, p7: "Blocks' urban shares by settlement order (P7, D-154; scripts/p7/labour-build.mjs blockUrbanShares): a province's urban people go to its urban professions first, then by-job, then rural." },
          blocks: result.urbanRows,
        }),
        "../p7/labour_1900.json": json({ domesticServiceBuildingKeys: DOMESTIC_SERVICE_BUILDINGS, domesticServiceShares: result.domesticServiceShares }),
        "../p7/employment_1900.json": json([]),
        "../p7/politics_1900.json": json(politics1900),
        // P4 fertility levels are cause-driven (D-142); the profession multiplier stays 1
        // for every profession, as the 1900 world's five already had.
        "../p7/demography_definitions_1900.json": json({
          ...demographyDefinitions,
          fertilityMultipliers: professions.map((profession) => ({
            professionId: profession.id,
            multiplier: demographyDefinitions.fertilityMultipliers.find((entry) => entry.professionId === profession.id)?.multiplier ?? 1,
          })),
        }),
      };
      void loop;
    },
    trace(loop) {
      const round = loop.finalRound;
      const after = { byTerritory: {}, world: {} };
      for (const pop of pops) {
        const territory = territoryOfProvince(pop.provinceId);
        const key = `${pop.provinceId}|${pop.professionKey}`;
        const row = (after.byTerritory[territory] ??= { persons: {}, employed: {}, eligible: {}, offered: {}, incomeRUSDPerYear: 0, population: 0 });
        row.persons[pop.professionKey] = (row.persons[pop.professionKey] ?? 0) + pop.population;
        row.employed[pop.professionKey] = (row.employed[pop.professionKey] ?? 0) + (round.employment.employed.get(key) ?? 0);
        row.eligible[pop.professionKey] = (row.eligible[pop.professionKey] ?? 0) + (round.eligible.get(key) ?? 0);
        row.offered[pop.professionKey] = (row.offered[pop.professionKey] ?? 0) + (round.employment.offered.get(key) ?? 0);
        row.incomeRUSDPerYear += (round.incomeOf(pop) ?? 0) * pop.population * 365;
        row.estimateRUSDPerYear = (row.estimateRUSDPerYear ?? 0) + (result.estimateIncomeOf?.(pop) ?? 0) * pop.population * 365;
        row.population += pop.population;
        after.world[pop.professionKey] = (after.world[pop.professionKey] ?? 0) + pop.population;
      }
      return {
        decision: "D-154",
        generator: "scripts/p7/build-labour-1900.mjs (inside scripts/p5b/build-goods-1900.mjs)",
        professions: professions.map((profession) => ({
          id: profession.id,
          key: profession.key,
          stratum: profession.stratum,
          roles: profession.roles,
          gates: profession.gates ?? [],
          settlement: profession.settlement,
          participationRate: profession.participationRate,
          baseWage1900RUSDPerYear: profession.baseWage1900RUSDPerYear,
          wageRatioToLaborer: sig(defs.ratios[profession.key]),
          wageRows: defs.traces[profession.key].rowIds,
        })),
        shares: Object.fromEntries([...shares.byTerritory].sort((a, b) => a[0].localeCompare(b[0])).map(([key, entry]) => [key, { method: entry.method, rows: entry.rows, notes: entry.notes, interim: entry.interim ?? null, farmHandShareOfAgriculture: sig(entry.farmHandShareOfAgriculture), raw: Object.fromEntries(Object.entries(entry.raw).map(([k, v]) => [k, sig(v)])), shares: Object.fromEntries(Object.entries(entry.shares).map(([k, v]) => [k, sig(v)])) }])),
        placementSteps: result.placementSteps ?? null,
        institutionFunctionShares: result.institutionFunctionShares ?? null,
        domesticService: { fit: { intercept: sig(result.domesticServiceFit.intercept), slope: sig(result.domesticServiceFit.slope) }, sourced: Object.fromEntries(Object.entries(result.domesticServiceFit.points).map(([k, v]) => [k, sig(v)])) },
        occupationFits: { farmHands: shares.fits.farmHands.map(sig), farmers: shares.fits.farmers.map(sig), estateDefaultOfOwners: sig(shares.fits.estateDefaultOfOwners), landlordsOfFarmFamilies: sig(shares.fits.landlordsOfFarmFamilies), leaveOneOut: Object.fromEntries(Object.entries(shares.leaveOneOut).map(([k, v]) => [k, sig(v)])) },
        proxyCoefficients: Object.fromEntries(Object.entries(shares.proxyCoefficients).map(([key, coefficients]) => [key, coefficients.map(sig)])),
        before,
        after,
        blocks: { before: oldPops.length, after: pops.length },
        institutions: round.institutionReport,
        ownersChanged: round.ownersChanged,
      };
    },
  };
  return result;
}

/**
 * One round of the income fixed point: budgets from the placement's coverage (the P5b
 * rule) with the institution policy, owners, day-1 employment, incomes.
 */
export function p7IncomeRound({ p7, pops, placement, goods, definitions, markets, provinces, countries, coverage, p2bRow, workingAgeShare }) {
  const money = (value) => Math.round(value * 100) / 100;
  const revenueShare = p2bRow("us-gov-revenue-share-1902");
  const educationShare = p2bRow("us-school-revenue-1900") / p2bRow("us-gdp-1900");
  const adminShare = (revenueShare - educationShare) * p2bRow("administration-share-of-noneducation-revenue");
  const funded = countries.map((country) => ({
    ...country,
    politics: { ...country.politics, institutionFundingRUSDPerYear: money(adminShare * coverage(country.tag)) },
    technology: { ...country.technology, educationFundingRUSDPerYear: money(educationShare * coverage(country.tag)) },
  }));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  // S11: movable buildings follow the workers inside each territory (levels, output and cash kept).
  // S5: shops and professional practices take their sourced share of retail and of finance
  // and professional services (output kept), then movable buildings follow the workers.
  const converted = convertToOwnerEstablishments({ buildingRows: placement.buildingRows, distributionRows: p7.distributionRows, provinces, definitions });
  // Institution posts (R9 shares; spread by population as the simulation spreads them): the
  // medical practices and the job mixes leave their staff out, and the split seeds their staff
  // by them.
  const functionShares = institutionFunctionShares(p7.distributionRows);
  const prePolicy = institutionPolicy({ countries: funded, pops, provinceWage: p7.provinceWage, professions: p7.professions, workingAgeShare, shares: functionShares });
  const posts = institutionPostSlots({ countries: prePolicy.countries, population: p7.provinceTotals, provinceWage: p7.provinceWage });
  const medical = convertToMedicalPractices({ buildingRows: converted.rows, definitions, professions: p7.professions, pops, provinces, posts, workingAgeShare });
  const relocated = relocateMovableBuildings({ buildingRows: medical.rows, definitions, professions: p7.professions, pops, provinces, workingAgeShare });
  const buildingRows = remapOwners({
    buildingRows: relocated.rows,
    pops,
    provinceTerritory: (id) => provinceById.get(id)?.territoryKey,
    estateTerritories: ESTATE_TERRITORIES,
  });
  const ownerBefore = new Map(relocated.rows.map((row) => [row.key, row.ownerProfessionKey]));
  const ownersChanged = buildingRows.filter((row) => row.ownerProfessionKey !== ownerBefore.get(row.key)).length;
  // S12: capitalist and aristocrat buildings pay the sourced labour share (option C).
  {
    const definitionOf = new Map(definitions.map((definition) => [definition.key, definition]));
    const goodOf = new Map(goods.map((good) => [good.id, good]));
    const marketOfProvince = new Map();
    for (const market of markets) for (const id of market.provinceIds) marketOfProvince.set(id, market);
    const professionOf = new Map(p7.professions.map((profession) => [profession.id, profession]));
    const priceAt = (row, goodId) => goodOf.get(goodId).basePrice1900RUSD * (marketOfProvince.get(row.provinceId)?.initialPriceMultiplier ?? 1);
    const valueAddedOf = (row) => {
      const definition = definitionOf.get(row.definitionKey);
      if (definition === undefined || !marketOfProvince.has(row.provinceId)) return 0;
      const tu = definition.referenceThroughputPerDayAtLevelOne * row.level;
      return (sum(definition.outputs.map((output) => output.quantityPerThroughputUnit * priceAt(row, output.goodId))) * (row.technique ?? 1) - sum(definition.inputs.map((input) => input.quantityPerThroughputUnit * priceAt(row, input.goodId)))) * tu * 365;
    };
    const wageBillOf = (row) => {
      const definition = definitionOf.get(row.definitionKey);
      if (definition === undefined) return 0;
      const tu = definition.referenceThroughputPerDayAtLevelOne * row.level;
      return sum((row.jobMix ?? definition.jobs).map((job) => job.workersPerThroughputUnit * tu * p7.provinceWage(row.provinceId, professionOf.get(job.professionId).key)));
    };
    const laborShare = (definition) => (definition.sector === "agriculture" ? p2bRow("labour-share-agriculture") : p2bRow("labour-share-manufacturing"));
    const restored = restoreLabourShare({ buildingRows, definitions, professions: p7.professions, pops, provinces, workingAgeShare, valueAddedOf, wageBillOf, laborShare });
    buildingRows.splice(0, buildingRows.length, ...restored.rows);
    p7.placementSteps = { medicalPracticeLevels: medical.convertedLevels, medicalShareOfPersonalServices: medical.shareByTerritory, convertedLevels: converted.convertedLevels, smallRetailShare: converted.smallRetailShare, movedLevels: relocated.movedLevels, labourShareRaised: restored.raised };
  }
  // R8: each building's own job mix from its territory's census (clerk share, hired hands on
  // peasant farms, the territory's farm profession).
  const mixes = assignJobMixes({ buildingRows, definitions, professions: p7.professions, pops, provinceTerritory: (id) => provinceById.get(id)?.territoryKey, territoryShares: p7.territoryShares, workingAgeShare, posts });
  buildingRows.splice(0, buildingRows.length, ...mixes.rows);
  {
    const r = (value) => Number(value.toPrecision(6));
    p7.placementSteps.jobMixFactors = Object.fromEntries(
      [...mixes.factors].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([t, f]) => [
        t,
        { clerk: r(f.clerk), hired: r(f.hired), engineer: r(f.engineer), practice: f.practice === null ? null : Object.fromEntries(Object.entries(f.practice).map(([key, value]) => [key, r(value)])) },
      ]),
    );
  }
  // Academics are seeded by their practices, not their posts: they share their practices'
  // work (R2), and research and training posts, spread by population, would draw them where
  // no practice is.
  const postSeeds = new Map([...posts].filter(([key]) => !key.endsWith("|academics")));
  // R3 (fixes D1): non-owner blocks follow the placed jobs inside each territory, keeping
  // province totals and census totals; the day-1 measurement and the outputs use them.
  const resplit = conservingSplit({ pops, buildingRows, definitions, professions: p7.professions, provinces, workingAgeShare, provinceTotals: p7.provinceTotals, extraSlots: postSeeds });
  pops.splice(0, pops.length, ...resplit);
  p7.urbanRows = blockUrbanShares({ pops, provinces });
  const policy = institutionPolicy({ countries: funded, pops, provinceWage: p7.provinceWage, professions: p7.professions, workingAgeShare, shares: functionShares });
  p7.institutionFunctionShares = functionShares;
  const employment = dayOneEmployment({ pops, buildings: buildingRows, definitions, professions: p7.professions, countries: policy.countries, provinceWage: p7.provinceWage, workingAgeShare, domesticShares: new Map(p7.domesticServiceShares.map((entry) => [entry.provinceId, entry.share])) });
  const professionByKey = new Map(p7.professions.map((profession) => [profession.key, profession]));
  const eligible = new Map();
  for (const pop of pops) {
    const profession = professionByKey.get(pop.professionKey);
    const literate = (profession.gates ?? []).includes("literacy") ? pop.literacy : 1;
    const owner = (profession.roles ?? []).some((role) => role === "owns-capital" || role === "owns-land");
    eligible.set(`${pop.provinceId}|${pop.professionKey}`, owner ? 0 : Math.floor(pop.population * workingAgeShare * profession.participationRate * literate));
  }
  // Owner profits at opening prices and full staffing.
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const goodById = new Map(goods.map((good) => [good.id, good]));
  const marketOf = new Map();
  for (const market of markets) for (const id of market.provinceIds) marketOf.set(id, market);
  const professionById = new Map(p7.professions.map((profession) => [profession.id, profession]));
  const profit = new Map();
  for (const row of buildingRows) {
    const definition = definitionByKey.get(row.definitionKey);
    const market = marketOf.get(row.provinceId);
    if (definition === undefined || market === undefined) continue;
    const multiplier = market.initialPriceMultiplier ?? 1;
    const price = (goodId) => goodById.get(goodId).basePrice1900RUSD * multiplier;
    const tu = definition.referenceThroughputPerDayAtLevelOne * row.level;
    // Staffing: the province's filled share of each job profession's slots (the day-1
    // rule fills a province's slots of a profession pro rata); output follows staffing
    // (land-using buildings with staffing^FARM_LABOUR_ELASTICITY, P5).
    const staffingOf = (professionKey) => {
      const key = `${row.provinceId}|${professionKey}`;
      const slots = employment.offered.get(key) ?? 0;
      return slots > 0 ? Math.min(1, (employment.employed.get(key) ?? 0) / slots) : 0;
    };
    const jobsOf = row.jobMix ?? definition.jobs;
    const jobWorkers = sum(jobsOf.map((job) => job.workersPerThroughputUnit));
    const staffing = jobWorkers > 0 ? sum(jobsOf.map((job) => job.workersPerThroughputUnit * staffingOf(professionById.get(job.professionId).key))) / jobWorkers : 1;
    const outputFactor = definition.landUse !== undefined ? staffing ** FARM_LABOUR_ELASTICITY : staffing;
    const value =
      (sum(definition.outputs.map((output) => output.quantityPerThroughputUnit * price(output.goodId))) * (row.technique ?? 1) * tu -
        sum(definition.inputs.map((input) => input.quantityPerThroughputUnit * price(input.goodId))) * tu) *
      outputFactor;
    // R2: the owner profession's own jobs carry no wage (the residual pays them).
    const wages =
      sum((row.jobMix ?? definition.jobs).filter((job) => professionById.get(job.professionId).key !== row.ownerProfessionKey).map((job) => job.workersPerThroughputUnit * tu * staffingOf(professionById.get(job.professionId).key) * p7.provinceWage(row.provinceId, professionById.get(job.professionId).key))) / 365;
    const upkeep = definition.dailyUpkeepRUSDAtLevelOne * row.level;
    const net = value - wages - upkeep;
    if (net > 0) {
      const key = `${row.provinceId}|${row.ownerProfessionKey}`;
      profit.set(key, (profit.get(key) ?? 0) + net * 365);
    }
  }
  const incomeByKey = new Map();
  for (const pop of pops) {
    const key = `${pop.provinceId}|${pop.professionKey}`;
    // R2: jobs in buildings the profession owns are paid by the residual (profit), not a wage.
    const servants = employment.domestic.get(key) ?? 0;
    const wages =
      Math.max(0, (employment.employed.get(key) ?? 0) - servants - (employment.ownOperated.get(key) ?? 0)) * p7.provinceWage(pop.provinceId, pop.professionKey) +
      servants * p7.provinceWage(pop.provinceId, pop.professionKey) * DOMESTIC_WAGE_RATIO;
    incomeByKey.set(key, pop.population > 0 ? (wages + (profit.get(key) ?? 0)) / pop.population / 365 : 0);
  }
  /** Measured income: day-1 wages plus owner profits (the blocks' opening 1900 income). */
  const incomeOf = (pop) => incomeByKey.get(`${pop.provinceId}|${pop.professionKey}`) ?? 0;
  /**
   * Stock lots owned by a placement row that the P7 steps removed (relocated or converted) go to
   * the largest row of the same definition in the same territory; lots of one owner and good merge.
   */
  const remapLots = (lots, placedRows) => {
    if (lots === undefined) return lots;
    const live = new Set(buildingRows.map((row) => row.key));
    const placedByKey = new Map(placedRows.map((row) => [row.key, row]));
    const largest = new Map();
    for (const row of buildingRows) {
      const key = `${provinceById.get(row.provinceId)?.territoryKey}|${row.definitionKey}`;
      const current = largest.get(key);
      if (current === undefined || row.level > current.level || (row.level === current.level && row.key < current.key)) largest.set(key, row);
    }
    const merged = new Map();
    for (const lot of lots) {
      let owner = lot.ownerBuildingKey;
      if (!live.has(owner)) {
        const placed = placedByKey.get(owner);
        const target = placed === undefined ? undefined : largest.get(`${provinceById.get(placed.provinceId)?.territoryKey}|${placed.definitionKey}`);
        if (target === undefined) throw new Error(`P7: stock lot of removed building ${owner} has no successor`);
        owner = target.key;
      }
      const key = `${owner}|${lot.goodKey}`;
      const entry = merged.get(key);
      if (entry === undefined) merged.set(key, { ...lot, ownerBuildingKey: owner });
      else entry.quantity += lot.quantity;
    }
    return [...merged.values()].sort((left, right) => left.ownerBuildingKey.localeCompare(right.ownerBuildingKey) || left.goodKey.localeCompare(right.goodKey));
  };
  return {
    remapLots,
    incomeOf,
    buildingRows,
    ownersChanged,
    employment,
    eligible,
    institutionReport: policy.report,
    countries(countryRowsP5b) {
      const byTag = new Map(policy.countries.map((country) => [country.tag, country]));
      return countryRowsP5b.map((country) => {
        const p7Country = byTag.get(country.tag);
        if (p7Country === undefined) return country;
        return {
          ...country,
          technology: { ...country.technology, educationFundingRUSDPerYear: p7Country.technology.educationFundingRUSDPerYear, researchStaffShare: p7Country.technology.researchStaffShare },
          labor: p7Country.labor,
          sourceIds: [...new Set([...country.sourceIds, "p7-labour"])],
        };
      });
    },
  };
}

// Run directly: delegate to the P5b generator, which runs the P7 steps.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const args = process.argv.includes("--check") ? ["--check"] : [];
  const run = spawnSync(process.execPath, [join(root, "scripts/p5b/build-goods-1900.mjs"), ...args], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
void P7_PROFESSIONS;
