/**
 * P7 (D-156): the labour market on the phone (presentation only).
 *
 * Every figure is read from the simulation's own measurement and wage table, so the
 * screens show what the labour market sees: `measureLabourMarket` (eligible, employed and
 * offered per province and profession, owners outside the labour force, the self-employed
 * sharing the work of their own farms and shops), `buildLabourWageTable` (the market wage
 * W × d with the peasant alternative) and `minimumWagePreview` (plan §4.5). The context is
 * built once per snapshot and shared by the province column, the focused province and the
 * detail countries. Nothing here mutates the world.
 */

import {
  buildLabourWageTable,
  dayIndexToCivilDate,
  daysInYear,
  DOMESTIC_WAGE_RATIO,
  measureLabourMarket,
  minimumWagePreview,
  planInstitutionSlots,
  populationTotal,
  professionHasGate,
  professionHasRole,
  type Country,
  type EconomyDefinitions,
  type LabourCounts,
  type LabourMeasurement,
  type LabourWageTable,
  type ProfessionDef,
  type World,
} from "@century/sim";

import type {
  CountryLabourMarketSnapshot,
  CountryProfessionSnapshot,
  LabourMobilitySnapshot,
  LabourProfessionRowSnapshot,
  MinimumWagePreviewSnapshot,
  ProfessionGroupDto,
  ProvinceLabourSnapshot,
} from "./protocol.js";

const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

/** P7 (D-156): the Population screen's group of a profession, from its roles, gates and settlement. */
export function professionGroup(profession: ProfessionDef): ProfessionGroupDto {
  if (professionHasRole(profession, "owns-capital") || professionHasRole(profession, "owns-land")) return "owners";
  if (professionHasRole(profession, "military-enlisted") || professionHasRole(profession, "military-command")) return "military";
  if (professionHasRole(profession, "administration") || professionHasRole(profession, "clergy")) return "state-church";
  for (const role of ["research", "training", "education", "health", "technical"] as const) {
    if (professionHasRole(profession, role)) return "professional";
  }
  if (professionHasRole(profession, "subsistence")) return "rural";
  if (professionHasRole(profession, "owner-operator")) return profession.settlement === "rural" ? "rural" : "office-commerce";
  if (professionHasRole(profession, "wage-labour")) return professionHasGate(profession, "literacy") ? "office-commerce" : "manual-service";
  return "other";
}

/** P7 (D-156): how a profession's people earn (the D-154 R1/R2 rules). */
export function professionEarns(profession: ProfessionDef): "wage" | "own-work" | "residual" {
  if (professionHasRole(profession, "owns-capital") || professionHasRole(profession, "owns-land")) return "residual";
  if (professionHasRole(profession, "subsistence") || professionHasRole(profession, "owner-operator")) return "own-work";
  return "wage";
}

export interface LabourSnapshotContext {
  readonly measurement: LabourMeasurement;
  readonly wages: LabourWageTable;
  /** Province → workers holding an assignment (building, institution or household), by profession. */
  readonly assigned: ReadonlyMap<number, Float64Array>;
  /** Province → workers assigned to agriculture-sector buildings. */
  readonly agricultureAssigned: ReadonlyMap<number, number>;
  /** Province → servants (household employment) by the servant's profession. */
  readonly servantsByProvince: ReadonlyMap<number, Float64Array>;
  /** Employer block → servants it employs. */
  readonly servantsByEmployer: ReadonlyMap<number, number>;
  readonly professionById: ReadonlyMap<number, ProfessionDef>;
  readonly professionCount: number;
  readonly territoryByMarket: ReadonlyMap<number, World["labourMarket"]["territories"][number]>;
  readonly differentialByProvince: ReadonlyMap<number, readonly number[]>;
  readonly marketByProvince: ReadonlyMap<number, number | null>;
  /** Days of the current civil year (annualising the smoothed daily income). */
  readonly yearDays: number;
}

/** Build the shared labour context once per snapshot; null in a world without a labour market. */
export function labourSnapshotContext(world: World, definitions: EconomyDefinitions): LabourSnapshotContext | null {
  if (!world.labourMarket.enabled) return null;
  const wages = buildLabourWageTable(world, definitions);
  const plan = planInstitutionSlots(world, definitions, wages, world.dayIndex);
  const measurement = measureLabourMarket(world, definitions, plan);
  const size = measurement.professionCount;
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const assigned = new Map<number, Float64Array>();
  const row = (map: Map<number, Float64Array>, provinceId: number): Float64Array => {
    let entry = map.get(provinceId);
    if (entry === undefined) {
      entry = new Float64Array(size);
      map.set(provinceId, entry);
    }
    return entry;
  };
  const agricultureAssigned = new Map<number, number>();
  for (const assignment of world.employment) {
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    const counts = row(assigned, block.provinceId);
    counts[assignment.professionId] = (counts[assignment.professionId] ?? 0) + assignment.workers;
    const building = buildingById.get(assignment.buildingInstanceId);
    const definition = building === undefined ? undefined : definitionById.get(building.definitionId);
    if (definition?.sector === "agriculture") {
      agricultureAssigned.set(block.provinceId, (agricultureAssigned.get(block.provinceId) ?? 0) + assignment.workers);
    }
  }
  for (const assignment of world.labourMarket.institutionEmployment) {
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    const counts = row(assigned, block.provinceId);
    counts[block.professionId] = (counts[block.professionId] ?? 0) + assignment.workers;
  }
  const servantsByProvince = new Map<number, Float64Array>();
  const servantsByEmployer = new Map<number, number>();
  for (const assignment of world.labourMarket.householdEmployment) {
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    const counts = row(assigned, block.provinceId);
    counts[block.professionId] = (counts[block.professionId] ?? 0) + assignment.workers;
    const servants = row(servantsByProvince, block.provinceId);
    servants[block.professionId] = (servants[block.professionId] ?? 0) + assignment.workers;
    servantsByEmployer.set(assignment.employerBlockId, (servantsByEmployer.get(assignment.employerBlockId) ?? 0) + assignment.workers);
  }
  return {
    measurement,
    wages,
    assigned,
    agricultureAssigned,
    servantsByProvince,
    servantsByEmployer,
    professionById,
    professionCount: size,
    territoryByMarket: new Map(world.labourMarket.territories.map((territory) => [territory.marketId, territory])),
    differentialByProvince: new Map(world.labourMarket.provinces.map((province) => [province.provinceId, province.differential])),
    marketByProvince: new Map(world.provinceEconomies.map((province) => [province.id, province.marketId])),
    yearDays: daysInYear(dayIndexToCivilDate(world.dayIndex).year),
  };
}

/** Unemployed ÷ labour force of one province over every profession; null without a labour force. */
export function provinceUnemploymentRate(context: LabourSnapshotContext | null, provinceId: number): number | null {
  if (context === null) return null;
  const counts = context.measurement.byProvince.get(provinceId);
  if (counts === undefined) return null;
  let eligible = 0;
  let unemployed = 0;
  for (let index = 0; index < context.professionCount; index += 1) {
    const labourForce = counts.eligible[index] ?? 0;
    eligible += labourForce;
    unemployed += Math.max(0, labourForce - (counts.employed[index] ?? 0));
  }
  return eligible > 0 ? round(unemployed / eligible, 4) : null;
}

interface RowAccumulator {
  labourForce: number;
  employed: number;
  vacancies: number;
  wageWeighted: number;
  wageWeight: number;
  changeWeighted: number;
  inHouseholdService: number;
}

function emptyAccumulator(): RowAccumulator {
  return { labourForce: 0, employed: 0, vacancies: 0, wageWeighted: 0, wageWeight: 0, changeWeighted: 0, inHouseholdService: 0 };
}

/** The reference wage's change at the last monthly update, for one territory and profession. */
function wageChange(context: LabourSnapshotContext, marketId: number | null, professionId: number): number {
  const territory = marketId === null ? undefined : context.territoryByMarket.get(marketId);
  if (territory === undefined) return 0;
  const now = territory.referenceWageRUSDPerYear[professionId] ?? 0;
  const before = territory.previousReferenceWageRUSDPerYear[professionId] ?? 0;
  return before > 0 ? now / before - 1 : 0;
}

/** Add one province's counts to the accumulators (one per profession). */
function accumulateProvince(
  context: LabourSnapshotContext,
  provinceId: number,
  counts: LabourCounts,
  rows: RowAccumulator[],
): void {
  const marketId = context.marketByProvince.get(provinceId) ?? null;
  const servants = context.servantsByProvince.get(provinceId);
  for (let professionId = 0; professionId < context.professionCount; professionId += 1) {
    const labourForce = counts.eligible[professionId] ?? 0;
    const offered = counts.offered[professionId] ?? 0;
    if (!(labourForce > 0) && !(offered > 0)) continue;
    const employed = counts.employed[professionId] ?? 0;
    const accumulator = (rows[professionId] ??= emptyAccumulator());
    accumulator.labourForce += labourForce;
    accumulator.employed += employed;
    accumulator.vacancies += Math.max(0, offered - employed);
    accumulator.inHouseholdService += servants?.[professionId] ?? 0;
    // The market wage this province pays, weighted by its labour force (by its posts where
    // it has no labour force of the profession).
    const weight = labourForce > 0 ? labourForce : offered;
    accumulator.wageWeighted += context.wages.base(provinceId, professionId) * weight;
    accumulator.changeWeighted += wageChange(context, marketId, professionId) * weight;
    accumulator.wageWeight += weight;
  }
}

function finishRows(rows: readonly (RowAccumulator | undefined)[]): LabourProfessionRowSnapshot[] {
  const out: LabourProfessionRowSnapshot[] = [];
  rows.forEach((row, professionId) => {
    if (row === undefined || !(row.labourForce > 0)) return;
    out.push({
      professionId,
      labourForce: Math.round(row.labourForce),
      employed: Math.round(Math.min(row.employed, row.labourForce)),
      unemploymentRate: round(Math.min(1, Math.max(0, (row.labourForce - row.employed) / row.labourForce)), 4),
      vacancies: Math.round(row.vacancies),
      wageRUSDPerYear: row.wageWeight > 0 ? round(row.wageWeighted / row.wageWeight, 2) : 0,
      wageChange: row.wageWeight > 0 ? round(row.changeWeighted / row.wageWeight, 5) : 0,
      inHouseholdService: Math.round(row.inHouseholdService),
    });
  });
  return out;
}

/** One estimate per minimum-wage law of the catalogue (plan §4.5), at its floor. */
function minimumWagePreviews(world: World, definitions: EconomyDefinitions, country: Country): MinimumWagePreviewSnapshot[] {
  const laws = (definitions.politics?.laws ?? [])
    .filter((law) => law.slot === "labor" && law.laborMinimumWageRUSDPerYear > 0)
    .sort((left, right) => left.id - right.id);
  return laws.map((law) => {
    const preview = minimumWagePreview(world, definitions, country.id, law.laborMinimumWageRUSDPerYear, world.dayIndex);
    return {
      lawId: law.id,
      lawName: law.name,
      enacted: country.laws.labor === law.id,
      floorRUSDPerYear: law.laborMinimumWageRUSDPerYear,
      coveredWorkers: Math.round(preview.coveredWorkers),
      workersBelowFloor: Math.round(preview.workersBelowFloor),
      jobsAtRisk: Math.round(preview.jobsAtRisk),
      compliance: round(Math.min(1, Math.max(0, preview.compliance)), 4),
    };
  });
}

/** P7 (D-156): a country's labour-market section. */
export function countryLabourMarketSnapshot(
  world: World,
  country: Country,
  provinceIds: ReadonlySet<number>,
  definitions: EconomyDefinitions,
  context: LabourSnapshotContext | null,
): CountryLabourMarketSnapshot | null {
  if (context === null) return null;
  const byMarket = new Map<number, RowAccumulator[]>();
  const all: RowAccumulator[] = [];
  let agricultural = 0;
  let employedTotal = 0;
  for (const provinceId of [...provinceIds].sort((left, right) => left - right)) {
    const counts = context.measurement.byProvince.get(provinceId);
    if (counts === undefined) continue;
    const marketId = context.marketByProvince.get(provinceId) ?? null;
    if (marketId !== null) {
      let rows = byMarket.get(marketId);
      if (rows === undefined) {
        rows = [];
        byMarket.set(marketId, rows);
      }
      accumulateProvince(context, provinceId, counts, rows);
    }
    accumulateProvince(context, provinceId, counts, all);
    // Farm employment: jobs on agricultural buildings, plus the self-employed of rural
    // professions sharing the work of their own farms beyond their slots (D-154 R2).
    agricultural += context.agricultureAssigned.get(provinceId) ?? 0;
    const assigned = context.assigned.get(provinceId);
    for (let professionId = 0; professionId < context.professionCount; professionId += 1) {
      const employed = counts.employed[professionId] ?? 0;
      employedTotal += employed;
      const profession = context.professionById.get(professionId);
      if (profession?.settlement === "rural") agricultural += Math.max(0, employed - (assigned?.[professionId] ?? 0));
    }
  }
  const totals = all.reduce(
    (sum, row) => {
      if (row === undefined) return sum;
      sum.labourForce += row.labourForce;
      sum.employed += Math.min(row.employed, row.labourForce);
      sum.vacancies += row.vacancies;
      return sum;
    },
    { labourForce: 0, employed: 0, vacancies: 0 },
  );
  // Persons, income and servants by profession (from block state).
  const persons = new Float64Array(context.professionCount);
  const income = new Float64Array(context.professionCount);
  const servantsEmployed = new Float64Array(context.professionCount);
  const inService = new Float64Array(context.professionCount);
  let urban = 0;
  let people = 0;
  const employerBlocks = new Set<number>();
  let servantWorkers = 0;
  let servantWageBill = 0;
  for (const block of world.popBlocks) {
    if (!provinceIds.has(block.provinceId)) continue;
    const count = populationTotal(block);
    people += count;
    urban += count * block.urbanShare;
    if (block.professionId >= context.professionCount) continue;
    persons[block.professionId] = (persons[block.professionId] ?? 0) + count;
    income[block.professionId] = (income[block.professionId] ?? 0) + count * block.incomeSmoothedRUSDPerCapitaDay;
    const employs = context.servantsByEmployer.get(block.id) ?? 0;
    if (employs > 0) {
      employerBlocks.add(block.id);
      servantsEmployed[block.professionId] = (servantsEmployed[block.professionId] ?? 0) + employs;
    }
  }
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  for (const assignment of world.labourMarket.householdEmployment) {
    const servant = blockById.get(assignment.popBlockId);
    if (servant === undefined || !provinceIds.has(servant.provinceId)) continue;
    servantWorkers += assignment.workers;
    inService[servant.professionId] = (inService[servant.professionId] ?? 0) + assignment.workers;
    servantWageBill += assignment.workers * context.wages.base(servant.provinceId, servant.professionId) * DOMESTIC_WAGE_RATIO;
  }
  const professions: CountryProfessionSnapshot[] = [];
  for (let professionId = 0; professionId < context.professionCount; professionId += 1) {
    const count = persons[professionId] ?? 0;
    if (!(count > 0)) continue;
    professions.push({
      professionId,
      persons: Math.round(count),
      incomeRUSDPerHeadYear: round(Math.max(0, ((income[professionId] ?? 0) / count) * context.yearDays), 2),
      servantsEmployed: Math.round(servantsEmployed[professionId] ?? 0),
      inHouseholdService: Math.round(inService[professionId] ?? 0),
    });
  }
  return {
    labourForce: Math.round(totals.labourForce),
    employed: Math.round(totals.employed),
    unemploymentRate: totals.labourForce > 0 ? round(Math.max(0, (totals.labourForce - totals.employed) / totals.labourForce), 4) : 0,
    vacancies: Math.round(totals.vacancies),
    agriculturalEmploymentShare: employedTotal > 0 ? round(Math.min(1, agricultural / employedTotal), 4) : 0,
    urbanShare: people > 0 ? round(urban / people, 4) : 0,
    servants: { workers: servantWorkers, employerBlocks: employerBlocks.size, wageBillRUSDPerYear: round(servantWageBill, 2) },
    territories: [...byMarket]
      .sort((left, right) => left[0] - right[0])
      .map(([marketId, rows]) => ({ marketId, rows: finishRows(rows) })),
    professions,
    minimumWage: minimumWagePreviews(world, definitions, country),
  };
}

/** P7 (D-156): the focused province's labour rows. */
export function provinceLabourSnapshot(context: LabourSnapshotContext | null, world: World, provinceId: number): ProvinceLabourSnapshot | null {
  if (context === null) return null;
  const counts = context.measurement.byProvince.get(provinceId);
  if (counts === undefined) return null;
  const rows: RowAccumulator[] = [];
  accumulateProvince(context, provinceId, counts, rows);
  const differential = context.differentialByProvince.get(provinceId);
  let weighted = 0;
  let weight = 0;
  for (let professionId = 0; professionId < context.professionCount; professionId += 1) {
    const labourForce = counts.eligible[professionId] ?? 0;
    if (!(labourForce > 0)) continue;
    weighted += (differential?.[professionId] ?? 1) * labourForce;
    weight += labourForce;
  }
  let servantsEmployed = 0;
  for (const block of world.popBlocks) {
    if (block.provinceId === provinceId) servantsEmployed += context.servantsByEmployer.get(block.id) ?? 0;
  }
  return {
    wageIndex: weight > 0 ? round(weighted / weight, 4) : 1,
    unemploymentRate: provinceUnemploymentRate(context, provinceId),
    rows: finishRows(rows),
    servantsEmployed,
  };
}

/** P7 (D-156): the world's last monthly mobility report. */
export function labourMobilitySnapshot(world: World): LabourMobilitySnapshot | null {
  const report = world.labourMarket.history[world.labourMarket.history.length - 1];
  if (report === undefined) return null;
  return {
    dayIndex: report.dayIndex,
    mobilityPeople: report.mobilityPeople,
    migrationPeople: report.migrationPeople,
    blocksCreated: report.blocksCreated,
    blocksRetired: report.blocksRetired,
    net: report.netByProfession.flatMap((net, professionId) => (net === 0 ? [] : [{ professionId, net }])),
    liveBlocks: world.popBlocks.length,
  };
}
