/**
 * P7 (D-154) labour market: wages, floors, staffing ceilings, institution employment
 * and the labour allocator of a labour-market world (plan §4, Q3–Q9, Q23).
 *
 * The module is active only when the economy definitions carry `labourMarket`; legacy
 * worlds keep the static P2b wage tables and the M3b allocator (plan Q21).
 *
 * State (`World.labourMarket`): the reference wage W_mp of each customs territory
 * (market) and profession, the provincial differential d_rp, the peasant alternative
 * income a_r, the buildings' staffing ceilings c, institution assignments, the block-id
 * allocator, retired block ids and a bounded monthly history.
 *
 * Derived each time they are needed (never stored): effective wages (W·d with floors),
 * eligible workforces, offered slots, institution slots, unemployment and vacancy rates.
 *
 * Inputs and units: wages RUSD a year per worker; rates dimensionless in [0, 1];
 * ceilings dimensionless in [0, 1]. Cadence: wages, differentials, the alternative
 * income and the ceilings update on the first civil day of a month (not the start day);
 * the allocator runs on the monthly or dirty refresh like the M3b allocator.
 */

import { assertValidJobMix, buildingJobs } from "./buildingJobs.js";
import { dayIndexToCivilDate, daysInYear } from "../calendar.js";
import { populationTotal, workingAgePopulation } from "../population/state.js";
import { WORKING_AGE_END, WORKING_AGE_START } from "../population/constants.js";
import { drawUint32 } from "../rng.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { farmLandFactor, landKey, landPerLevelByProvince } from "./land.js";
import { buildProvinceOwnerMap } from "./country.js";
import {
  FARM_LABOUR_ELASTICITY,
  INSTITUTION_PROVINCE_PURPOSE,
  LABOUR_FILL_PURPOSE,
  LABOUR_RETENTION_PURPOSE,
  MINIMUM_WAGE_COMPLIANCE_EXPONENT,
  PEASANT_ALTERNATIVE_MONTHLY_WEIGHT,
  STAFFING_CEILING_RATE,
  STAFFING_MARGINAL_FLOOR,
  WAGE_DIFFERENTIAL_PER_GAP,
  WAGE_FALL_PER_GAP,
  WAGE_PRICE_PASS_THROUGH,
  WAGE_RISE_PER_GAP,
} from "./constants.js";
import { apportionLargestRemainder } from "./apportion.js";
import type { EmploymentRefreshResult } from "./employment.js";
import { healthStaffFloor, laborHoursFactor, laborMinimumWageRUSDPerYear, lawInSlot } from "./labourLaws.js";
import {
  INSTITUTION_KINDS,
  type BuildingDef,
  type BuildingInstance,
  type Country,
  type EconomyDefinitions,
  type EmploymentAssignment,
  type HouseholdAssignment,
  type InstitutionAssignment,
  type InstitutionKind,
  type ProfessionDef,
  type ProfessionRole,
} from "./types.js";

/** Relative tolerance of the differentials' weighted mean of 1 (validation). */
export const DIFFERENTIAL_MEAN_TOLERANCE = 1e-6;

export { emptyLabourMarketState } from "./labourState.js";

/** True when the world runs the P7 labour market. */
export function labourMarketEnabled(world: World): boolean {
  return world.labourMarket.enabled;
}

// ---------------------------------------------------------------------------
// Roles and gates (plan §3.1: behaviour from roles, never from keys)
// ---------------------------------------------------------------------------

export function professionHasRole(profession: ProfessionDef, role: ProfessionRole): boolean {
  return profession.roles?.includes(role) === true;
}

/**
 * Self-employed professions (plan §4.5 item 3): peasants on work-sharing farms and
 * owner-operators. Their jobs are never floored, never covered by a minimum wage and
 * have no staffing ceiling; their income is the residual of their own business.
 */
export function isSelfEmployedProfession(profession: ProfessionDef): boolean {
  return professionHasRole(profession, "subsistence") || professionHasRole(profession, "owner-operator");
}

/** Professions whose effective wage is floored by the peasant alternative income (plan §4.2). */
export function earnsAlternativeFloor(profession: ProfessionDef): boolean {
  return (
    !isSelfEmployedProfession(profession) &&
    !professionHasRole(profession, "owns-capital") &&
    !professionHasRole(profession, "owns-land")
  );
}

export function professionHasGate(profession: ProfessionDef, gate: "literacy" | "training" | "capital" | "law"): boolean {
  return profession.gates?.includes(gate) === true;
}

/** The profession that staffs an institution: the lowest id holding the role, or undefined. */
export function institutionProfession(
  definitions: EconomyDefinitions,
  institution: InstitutionKind,
): ProfessionDef | undefined {
  let found: ProfessionDef | undefined;
  for (const profession of definitions.professions) {
    if (!professionHasRole(profession, institution)) continue;
    if (found === undefined || profession.id < found.id) found = profession;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Eligibility (plan §5.3: selective literacy replaces the block threshold)
// ---------------------------------------------------------------------------

/** Literate working-age persons of a block (real; Σ cells × age literacy). */
export function literateWorkingAge(block: World["popBlocks"][number]): number {
  let total = 0;
  for (let age = WORKING_AGE_START; age <= WORKING_AGE_END; age += 1) {
    const persons = (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
    total += persons * (block.literacyByAge[age] ?? 0);
  }
  return total;
}

/**
 * Eligible labour force of a block in a labour-market world: floor(working-age persons ×
 * participation), counting only literate working-age persons for professions with the
 * literacy gate. Integer workers.
 */
export function labourEligibleWorkforce(block: World["popBlocks"][number], profession: ProfessionDef): number {
  if (block.professionId !== profession.id) return 0;
  const base = professionHasGate(profession, "literacy") ? literateWorkingAge(block) : workingAgePopulation(block);
  const eligible = Math.floor(base * profession.participationRate + 1e-9);
  return eligible > 0 ? eligible : 0;
}

// ---------------------------------------------------------------------------
// Buildings: settlement, coverage and offered slots
// ---------------------------------------------------------------------------

/** Rural buildings (plan §6.1): farms, estates, fisheries, mines, oil, gas and logging. */
export function buildingIsRural(definition: BuildingDef): boolean {
  return definition.sector === "agriculture" || definition.sector === "mining";
}

export interface MinimumWageCoverage {
  readonly farmEmployees: boolean;
  readonly domesticService: boolean;
}

/** Whether a building job is covered by the minimum wage (plan §4.5 item 3). */
export function jobIsCovered(
  definition: BuildingDef,
  profession: ProfessionDef,
  coverage: MinimumWageCoverage,
  domesticServiceKeys: ReadonlySet<string>,
): boolean {
  if (isSelfEmployedProfession(profession)) return false;
  if (definition.sector === "agriculture" && !coverage.farmEmployees) return false;
  if (domesticServiceKeys.has(definition.key) && !coverage.domesticService) return false;
  return true;
}

/** Full job slots of a building for one profession (the M3 formula). */
export function fullJobSlots(definition: BuildingDef, building: BuildingInstance, professionId: Id): number {
  if (!building.operational) return 0;
  const job = buildingJobs(definition, building).find((candidate) => candidate.professionId === professionId);
  if (job === undefined) return 0;
  const raw = job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * building.level * building.condition;
  if (!Number.isFinite(raw) || raw < 0) throw new RangeError("building job-slot capacity must be finite and non-negative");
  return Math.floor(raw);
}

/**
 * Slots a building offers to one profession: floor(slots × c), with c the staffing
 * ceiling; self-employed jobs are offered in full (work-sharing, plan Q9).
 */
export function offeredJobSlots(
  definition: BuildingDef,
  building: BuildingInstance,
  profession: ProfessionDef,
  ceiling: number,
): number {
  const slots = fullJobSlots(definition, building, profession.id);
  if (slots <= 0) return 0;
  if (isSelfEmployedProfession(profession)) return slots;
  return Math.floor(slots * ceiling + 1e-9);
}

export function ceilingMap(world: World): Map<Id, number> {
  return new Map(world.labourMarket.staffingCeilings.map((entry) => [entry.buildingId, entry.ceiling]));
}

// ---------------------------------------------------------------------------
// Effective wages (plan §4.1, §4.2, §4.5)
// ---------------------------------------------------------------------------

export interface LabourWageTable {
  /** max(W·d, peasant alternative where it applies), RUSD a year; no statutory floor. */
  base(provinceId: Id, professionId: Id): number;
  /** The wage paid: base, plus compliance × max(0, floor − base) when the job is covered. */
  paid(provinceId: Id, professionId: Id, covered: boolean): number;
  minimumWage(provinceId: Id): number;
  compliance(provinceId: Id): number;
  coverage(provinceId: Id): MinimumWageCoverage;
  readonly domesticServiceKeys: ReadonlySet<string>;
}

const FULL_COVERAGE: MinimumWageCoverage = { farmEmployees: true, domesticService: true };

/** Minimum-wage coverage of a country's labour law (absent fields: covered). */
export function countryMinimumWageCoverage(country: Country | undefined, definitions: EconomyDefinitions): MinimumWageCoverage {
  if (country === undefined || definitions.politics === undefined) return FULL_COVERAGE;
  const law = lawInSlot(country, definitions, "labor");
  return law?.laborMinimumWageCoverage ?? FULL_COVERAGE;
}

/** Compliance with the statutory floor: administration quality^γ (plan §4.5 item 4). */
export function minimumWageCompliance(country: Country | undefined): number {
  if (country === undefined) return 1;
  const quality = Math.min(1, Math.max(0, country.institutions.quality));
  return quality ** MINIMUM_WAGE_COMPLIANCE_EXPONENT;
}

export function buildLabourWageTable(
  world: World,
  definitions: EconomyDefinitions,
  overrideMinimumWage?: { readonly countryId: Id; readonly floorRUSDPerYear: number },
): LabourWageTable {
  const territoryByMarket = new Map(world.labourMarket.territories.map((entry) => [entry.marketId, entry]));
  const provinceState = new Map(world.labourMarket.provinces.map((entry) => [entry.provinceId, entry]));
  const marketByProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  const owners = buildProvinceOwnerMap(world);
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const floorByCountry = new Map<Id, number>();
  const complianceByCountry = new Map<Id, number>();
  const coverageByCountry = new Map<Id, MinimumWageCoverage>();
  for (const country of world.countries) {
    floorByCountry.set(
      country.id,
      overrideMinimumWage !== undefined && overrideMinimumWage.countryId === country.id
        ? overrideMinimumWage.floorRUSDPerYear
        : laborMinimumWageRUSDPerYear(country, definitions),
    );
    complianceByCountry.set(country.id, minimumWageCompliance(country));
    coverageByCountry.set(country.id, countryMinimumWageCoverage(country, definitions));
  }
  const ownerOf = (provinceId: Id): Id | undefined => owners.get(provinceId);
  const base = (provinceId: Id, professionId: Id): number => {
    const profession = professionById.get(professionId);
    if (profession === undefined) throw new RangeError(`unknown profession ${String(professionId)}`);
    const marketId = marketByProvince.get(provinceId) ?? null;
    const territory = marketId === null ? undefined : territoryByMarket.get(marketId);
    const reference = territory?.referenceWageRUSDPerYear[professionId] ?? profession.baseWage1900RUSDPerYear;
    const province = provinceState.get(provinceId);
    const differential = province?.differential[professionId] ?? 1;
    let wage = reference * differential;
    if (earnsAlternativeFloor(profession)) {
      const alternative = province?.peasantAlternativeIncomeRUSDPerYear ?? 0;
      if (alternative > wage) wage = alternative;
    }
    return wage;
  };
  const minimumWage = (provinceId: Id): number => {
    const owner = ownerOf(provinceId);
    return owner === undefined ? 0 : (floorByCountry.get(owner) ?? 0);
  };
  const compliance = (provinceId: Id): number => {
    const owner = ownerOf(provinceId);
    return owner === undefined ? 1 : (complianceByCountry.get(owner) ?? 1);
  };
  return {
    base,
    paid(provinceId: Id, professionId: Id, covered: boolean): number {
      const market = base(provinceId, professionId);
      if (!covered) return market;
      const floor = minimumWage(provinceId);
      if (!(floor > market)) return market;
      return market + compliance(provinceId) * (floor - market);
    },
    minimumWage,
    compliance,
    coverage(provinceId: Id): MinimumWageCoverage {
      const owner = ownerOf(provinceId);
      return owner === undefined ? FULL_COVERAGE : (coverageByCountry.get(owner) ?? FULL_COVERAGE);
    },
    domesticServiceKeys: new Set(definitions.labourMarket.domesticServiceBuildingKeys),
  };
}

/** Whether a country's owner is valid for a province, for institution assignments. */
function provinceOwnerCountry(owners: ReadonlyMap<Id, Id>, provinceId: Id): Id | null {
  return owners.get(provinceId) ?? null;
}

// ---------------------------------------------------------------------------
// Institution slots (plan Q3, Q4, §4.3)
// ---------------------------------------------------------------------------

/** Annual funding of one institution of a country, RUSD. */
export function institutionFundingRUSDPerYear(
  world: World,
  definitions: EconomyDefinitions,
  country: Country,
  institution: InstitutionKind,
): number {
  switch (institution) {
    case "administration":
    case "health": {
      if (!world.politics.enabled || definitions.politics === undefined) return 0;
      const healthShare = Math.min(1, Math.max(country.institutions.healthStaffShare, healthStaffFloor(country, definitions)));
      const funded = country.institutions.fundedAnnualRUSD;
      return institution === "administration" ? funded * (1 - healthShare) : funded * healthShare;
    }
    case "education":
    case "research": {
      if (!world.technology.enabled || definitions.technology === undefined) return 0;
      const share = Math.min(1, Math.max(0, country.education.researchStaffShare));
      const funded = country.education.fundedAnnualRUSD;
      return institution === "education" ? funded * (1 - share) : funded * share;
    }
    case "training":
      return Math.max(0, country.labor.trainingBudgetRUSDPerYear);
  }
}

export interface InstitutionSlotPlan {
  /** Province id → institution → slots. */
  readonly byProvince: ReadonlyMap<Id, ReadonlyMap<InstitutionKind, number>>;
  /** Country id → institution → total slots and the staffing profession. */
  readonly byCountry: ReadonlyMap<Id, ReadonlyMap<InstitutionKind, { readonly slots: number; readonly professionId: Id; readonly wageRUSDPerYear: number }>>;
}

/**
 * Slots per institution = floor(funding ÷ the staffing profession's mean paid wage over
 * the country's provinces, weighted by province population); spread over the provinces
 * by population with largest remainder and keyed ties (purpose `labour.institution-province`).
 * A fixed budget buys fewer staff when wages rise (plan §4.5 item 5).
 */
export function planInstitutionSlots(
  world: World,
  definitions: EconomyDefinitions,
  wages: LabourWageTable,
  dayIndex: DayIndex,
): InstitutionSlotPlan {
  const owners = buildProvinceOwnerMap(world);
  const populationByProvince = new Map<Id, number>();
  for (const block of world.popBlocks) {
    populationByProvince.set(block.provinceId, (populationByProvince.get(block.provinceId) ?? 0) + populationTotal(block));
  }
  const provincesByCountry = new Map<Id, Id[]>();
  for (const province of [...world.provinceEconomies].sort((left, right) => left.id - right.id)) {
    const owner = owners.get(province.id);
    if (owner === undefined || province.marketId === null) continue;
    const list = provincesByCountry.get(owner);
    if (list === undefined) provincesByCountry.set(owner, [province.id]);
    else list.push(province.id);
  }
  const byProvince = new Map<Id, Map<InstitutionKind, number>>();
  const byCountry = new Map<Id, Map<InstitutionKind, { slots: number; professionId: Id; wageRUSDPerYear: number }>>();
  for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
    const provinceIds = provincesByCountry.get(country.id) ?? [];
    if (provinceIds.length === 0) continue;
    const weights = provinceIds.map((id) => populationByProvince.get(id) ?? 0);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    if (!(totalWeight > 0)) continue;
    const countryPlan = new Map<InstitutionKind, { slots: number; professionId: Id; wageRUSDPerYear: number }>();
    INSTITUTION_KINDS.forEach((institution, kindIndex) => {
      const profession = institutionProfession(definitions, institution);
      if (profession === undefined) return;
      const funding = institutionFundingRUSDPerYear(world, definitions, country, institution);
      if (!(funding > 0)) return;
      let weightedWage = 0;
      provinceIds.forEach((provinceId, index) => {
        weightedWage += (weights[index] ?? 0) * wages.paid(provinceId, profession.id, true);
      });
      const wage = weightedWage / totalWeight;
      if (!(wage > 0)) return;
      // D-155: never more posts than the country has people. A budget that buys more made
      // the province apportionment below throw (total above the sum of its weights); the
      // cap changes nothing while the posts are fewer than the people.
      const slots = Math.min(Math.floor(funding / wage), totalWeight);
      if (slots <= 0) return;
      countryPlan.set(institution, { slots, professionId: profession.id, wageRUSDPerYear: wage });
      const shares = apportionLargestRemainder(
        slots,
        weights,
        provinceIds.map((provinceId) =>
          drawUint32({ seed: world.seed, day: dayIndex, entityId: provinceId, purpose: INSTITUTION_PROVINCE_PURPOSE, drawIndex: kindIndex }),
        ),
      );
      provinceIds.forEach((provinceId, index) => {
        const share = shares[index] ?? 0;
        if (share <= 0) return;
        let map = byProvince.get(provinceId);
        if (map === undefined) {
          map = new Map();
          byProvince.set(provinceId, map);
        }
        map.set(institution, share);
      });
    });
    if (countryPlan.size > 0) byCountry.set(country.id, countryPlan);
  }
  return { byProvince, byCountry };
}

// ---------------------------------------------------------------------------
// Measurement: eligible, employed and offered per (province, profession)
// ---------------------------------------------------------------------------

export interface LabourCounts {
  /** Indexed by profession id. */
  readonly eligible: Float64Array;
  readonly employed: Float64Array;
  readonly offered: Float64Array;
}

export interface LabourMeasurement {
  readonly byProvince: ReadonlyMap<Id, LabourCounts>;
  readonly byMarket: ReadonlyMap<Id, LabourCounts>;
  readonly professionCount: number;
}

function newCounts(professionCount: number): LabourCounts {
  return {
    eligible: new Float64Array(professionCount),
    employed: new Float64Array(professionCount),
    offered: new Float64Array(professionCount),
  };
}

export function professionIndexSize(definitions: EconomyDefinitions): number {
  return definitions.professions.reduce((max, profession) => Math.max(max, profession.id), -1) + 1;
}

/** Measure the labour market from current state (no mutation). */
export function measureLabourMarket(
  world: World,
  definitions: EconomyDefinitions,
  plan: InstitutionSlotPlan,
): LabourMeasurement {
  const size = professionIndexSize(definitions);
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const ceilings = ceilingMap(world);
  const byProvince = new Map<Id, LabourCounts>();
  const countsOf = (provinceId: Id): LabourCounts => {
    let counts = byProvince.get(provinceId);
    if (counts === undefined) {
      counts = newCounts(size);
      byProvince.set(provinceId, counts);
    }
    return counts;
  };
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  for (const block of world.popBlocks) {
    const profession = professionById.get(block.professionId);
    if (profession === undefined) continue;
    const counts = countsOf(block.provinceId);
    counts.eligible[profession.id] = (counts.eligible[profession.id] ?? 0) + labourEligibleWorkforce(block, profession);
  }
  for (const assignment of world.employment) {
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    const counts = countsOf(block.provinceId);
    counts.employed[assignment.professionId] = (counts.employed[assignment.professionId] ?? 0) + assignment.workers;
  }
  for (const assignment of world.labourMarket.institutionEmployment) {
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    const counts = countsOf(block.provinceId);
    counts.employed[block.professionId] = (counts.employed[block.professionId] ?? 0) + assignment.workers;
  }
  // P7 (§4.1): servants employed by households count as employed and as offered posts.
  for (const assignment of world.labourMarket.householdEmployment) {
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    const counts = countsOf(block.provinceId);
    counts.employed[block.professionId] = (counts.employed[block.professionId] ?? 0) + assignment.workers;
    counts.offered[block.professionId] = (counts.offered[block.professionId] ?? 0) + assignment.workers;
  }
  for (const building of world.buildings) {
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined || !building.operational) continue;
    const ceiling = ceilings.get(building.id) ?? 1;
    for (const job of buildingJobs(definition, building)) {
      const profession = professionById.get(job.professionId);
      if (profession === undefined) continue;
      const offered = offeredJobSlots(definition, building, profession, ceiling);
      if (offered <= 0) continue;
      const counts = countsOf(building.provinceId);
      counts.offered[profession.id] = (counts.offered[profession.id] ?? 0) + offered;
    }
  }
  for (const [provinceId, kinds] of plan.byProvince) {
    for (const [institution, slots] of kinds) {
      const profession = institutionProfession(definitions, institution);
      if (profession === undefined) continue;
      const counts = countsOf(provinceId);
      counts.offered[profession.id] = (counts.offered[profession.id] ?? 0) + slots;
    }
  }
  // P7 (D-154, R1): owners (capital, land) are outside the labour force; their income is
  // profit. R2: a self-employed or owner-operating profession is employed wherever its
  // province has a building it owns or works as self-employed (work-sharing).
  const ownerProfessionOf = ownerProfessionByBuilding(world);
  const sharing = new Set<string>();
  for (const building of world.buildings) {
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined || !building.operational) continue;
    for (const job of buildingJobs(definition, building)) {
      const profession = professionById.get(job.professionId);
      if (profession === undefined) continue;
      if (isSelfEmployedProfession(profession) || ownerProfessionOf.get(building.id) === profession.id) sharing.add(`${String(building.provinceId)}:${String(profession.id)}`);
    }
  }
  for (const [provinceId, counts] of byProvince) {
    for (const profession of definitions.professions) {
      if (professionHasRole(profession, "owns-capital") || professionHasRole(profession, "owns-land")) {
        counts.eligible[profession.id] = 0;
        counts.employed[profession.id] = 0;
        counts.offered[profession.id] = 0;
      } else if (sharing.has(`${String(provinceId)}:${String(profession.id)}`)) {
        counts.employed[profession.id] = Math.max(counts.employed[profession.id] ?? 0, counts.eligible[profession.id] ?? 0);
        counts.offered[profession.id] = Math.max(counts.offered[profession.id] ?? 0, counts.employed[profession.id] ?? 0);
      }
    }
  }
  const marketByProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  const byMarket = new Map<Id, LabourCounts>();
  for (const [provinceId, counts] of [...byProvince].sort((left, right) => left[0] - right[0])) {
    const marketId = marketByProvince.get(provinceId) ?? null;
    if (marketId === null) continue;
    let market = byMarket.get(marketId);
    if (market === undefined) {
      market = newCounts(size);
      byMarket.set(marketId, market);
    }
    for (let index = 0; index < size; index += 1) {
      market.eligible[index] = (market.eligible[index] ?? 0) + (counts.eligible[index] ?? 0);
      market.employed[index] = (market.employed[index] ?? 0) + (counts.employed[index] ?? 0);
      market.offered[index] = (market.offered[index] ?? 0) + (counts.offered[index] ?? 0);
    }
  }
  return { byProvince, byMarket, professionCount: size };
}

/**
 * P7 (D-154, R2): the profession of each private building's owner block (absent for state
 * buildings and for owners that are not population blocks).
 */
export function ownerProfessionByBuilding(world: World): Map<Id, Id> {
  const accountOwner = new Map<Id, Id>();
  for (const account of world.finance.accounts) {
    if (account.ownerKind === "popBlock" && account.subtype === "household-cash" && account.ownerId !== null) accountOwner.set(account.id, account.ownerId);
  }
  const professionOfBlock = new Map(world.popBlocks.map((block) => [block.id, block.professionId]));
  const out = new Map<Id, Id>();
  for (const building of world.buildings) {
    if (building.ownerKind !== "private") continue;
    const blockId = accountOwner.get(building.ownerAccountId);
    const professionId = blockId === undefined ? undefined : professionOfBlock.get(blockId);
    if (professionId !== undefined) out.set(building.id, professionId);
  }
  return out;
}

/**
 * P7 (D-154, docs/P7_EMPLOYERS_PROPOSAL.md §4.1): households employ domestic servants, after
 * firms and institutions have hired (they have priority, as measured). In each province with a
 * domestic-service share s the households want floor(s × eligible non-owner workers) servants;
 * the employers are the province's middle and upper blocks, weighted by population × smoothed
 * income (no income, no servants); the servants are the unemployed of the province's ungated
 * wage-labour professions, taken in proportion to their unemployed. Recomputed at every refresh;
 * a pair (employer, servant block) keeps its assignment id. Deterministic: integer splits by
 * largest remainder with ties to the lower index.
 */
function hireHouseholdServants(
  world: World,
  definitions: EconomyDefinitions,
  unemployedByBlock: ReadonlyMap<Id, number>,
  eligibleByBlock: ReadonlyMap<Id, number>,
): { assignments: HouseholdAssignment[]; nextId: Id; hired: number } {
  let nextId = world.labourMarket.nextHouseholdAssignmentId;
  const shares = definitions.labourMarket.domesticServiceShares ?? [];
  if (shares.length === 0) return { assignments: [], nextId, hired: 0 };
  const shareOf = new Map(shares.map((entry) => [entry.provinceId, entry.share]));
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const existing = new Map(world.labourMarket.householdEmployment.map((entry) => [`${String(entry.employerBlockId)}:${String(entry.popBlockId)}`, entry.id]));
  const byProvince = new Map<Id, World["popBlocks"][number][]>();
  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const list = byProvince.get(block.provinceId);
    if (list === undefined) byProvince.set(block.provinceId, [block]);
    else list.push(block);
  }
  const owner = (profession: ProfessionDef): boolean => professionHasRole(profession, "owns-capital") || professionHasRole(profession, "owns-land");
  const servantProfession = (profession: ProfessionDef): boolean =>
    professionHasRole(profession, "wage-labour") && !professionHasGate(profession, "literacy") && !professionHasGate(profession, "training");
  const assignments: HouseholdAssignment[] = [];
  let hired = 0;
  for (const [provinceId, blocks] of [...byProvince].sort((left, right) => left[0] - right[0])) {
    const share = shareOf.get(provinceId) ?? 0;
    if (!(share > 0)) continue;
    let workforce = 0;
    for (const block of blocks) {
      const profession = professionById.get(block.professionId);
      if (profession !== undefined && !owner(profession)) workforce += eligibleByBlock.get(block.id) ?? 0;
    }
    const servants = blocks.filter((block) => {
      const profession = professionById.get(block.professionId);
      return profession !== undefined && servantProfession(profession) && (unemployedByBlock.get(block.id) ?? 0) > 0;
    });
    const employers = blocks.filter((block) => {
      const profession = professionById.get(block.professionId);
      return profession !== undefined && profession.stratum !== "lower" && block.incomeSmoothedRUSDPerCapitaDay > 0;
    });
    if (servants.length === 0 || employers.length === 0) continue;
    const pool = servants.reduce((sum, block) => sum + (unemployedByBlock.get(block.id) ?? 0), 0);
    const total = Math.min(Math.floor(share * workforce + 1e-9), pool);
    if (total <= 0) continue;
    const fromServant = apportionLargestRemainder(total, servants.map((block) => unemployedByBlock.get(block.id) ?? 0), servants.map((_, index) => index));
    // Employers share the servants by total household income in whole RUSD cents a day (the
    // apportionment takes integer weights); a province whose employers round to zero hires none.
    const weights = employers.map((block) => Math.round(populationTotal(block) * block.incomeSmoothedRUSDPerCapitaDay * 100));
    if (!weights.some((weight) => weight > 0)) continue;
    servants.forEach((servant, servantIndex) => {
      const count = fromServant[servantIndex] ?? 0;
      if (count <= 0) return;
      const split = apportionLargestRemainder(count, weights, employers.map((_, index) => index));
      employers.forEach((employer, employerIndex) => {
        const workers = split[employerIndex] ?? 0;
        if (workers <= 0) return;
        const key = `${String(employer.id)}:${String(servant.id)}`;
        let id = existing.get(key);
        if (id === undefined) {
          id = nextId;
          nextId += 1;
        }
        assignments.push({ id, employerBlockId: employer.id, popBlockId: servant.id, workers });
        hired += workers;
      });
    });
  }
  assignments.sort((left, right) => left.id - right.id);
  return { assignments, nextId, hired };
}

/** u = unemployed eligible ÷ eligible (0 when nobody is eligible). */
export function unemploymentRate(counts: LabourCounts, professionId: Id): number {
  const eligible = counts.eligible[professionId] ?? 0;
  if (!(eligible > 0)) return 0;
  return Math.min(1, Math.max(0, (eligible - (counts.employed[professionId] ?? 0)) / eligible));
}

/** v = unfilled offered slots ÷ offered slots (0 when nothing is offered). */
export function vacancyRate(counts: LabourCounts, professionId: Id): number {
  const offered = counts.offered[professionId] ?? 0;
  if (!(offered > 0)) return 0;
  return Math.min(1, Math.max(0, (offered - (counts.employed[professionId] ?? 0)) / offered));
}

// ---------------------------------------------------------------------------
// Allocator (plan Q5: own-province work; Q8, Q9; Q4 institutions)
// ---------------------------------------------------------------------------

interface Employer {
  readonly kind: "building" | "institution";
  readonly building?: BuildingInstance;
  readonly institution?: InstitutionKind;
  readonly countryId?: Id;
  readonly offered: number;
  used: number;
  /** Stable order key for ties: building id, or 2^31 + kind index for institutions. */
  readonly orderKey: number;
}

function employerKey(kind: "building" | "institution", id: number): string {
  return `${kind}:${String(id)}`;
}

/**
 * Labour-market employment refresh. Every block works only in its own province.
 * Existing assignments are retained (keyed order) up to the employer's offered slots
 * and the block's eligible workforce; the remaining workers fill the remaining slots by
 * largest remainder (keyed ties). Building and institution assignments share one
 * eligibility: one person holds one job.
 */
export function refreshLabourEmployment(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
): EmploymentRefreshResult {
  const wages = buildLabourWageTable(world, definitions);
  const plan = planInstitutionSlots(world, definitions, wages, dayIndex);
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const ceilings = ceilingMap(world);
  const owners = buildProvinceOwnerMap(world);

  // Employers per (province, profession).
  const employersByKey = new Map<string, Employer[]>();
  const employerList = (provinceId: Id, professionId: Id): Employer[] => {
    const key = `${String(provinceId)}:${String(professionId)}`;
    let list = employersByKey.get(key);
    if (list === undefined) {
      list = [];
      employersByKey.set(key, list);
    }
    return list;
  };
  const buildingEmployer = new Map<string, Employer>();
  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) throw new RangeError(`building ${String(building.id)} references a missing definition`);
    if (!building.operational) continue;
    for (const job of buildingJobs(definition, building)) {
      const profession = professionById.get(job.professionId);
      if (profession === undefined) continue;
      const offered = offeredJobSlots(definition, building, profession, ceilings.get(building.id) ?? 1);
      if (offered <= 0) continue;
      const employer: Employer = { kind: "building", building, offered, used: 0, orderKey: building.id };
      employerList(building.provinceId, profession.id).push(employer);
      buildingEmployer.set(`${employerKey("building", building.id)}:${String(profession.id)}`, employer);
    }
  }
  const institutionEmployer = new Map<string, Employer>();
  for (const [provinceId, kinds] of [...plan.byProvince].sort((left, right) => left[0] - right[0])) {
    const countryId = provinceOwnerCountry(owners, provinceId);
    if (countryId === null) continue;
    INSTITUTION_KINDS.forEach((institution, kindIndex) => {
      const slots = kinds.get(institution) ?? 0;
      if (slots <= 0) return;
      const profession = institutionProfession(definitions, institution);
      if (profession === undefined) return;
      const employer: Employer = { kind: "institution", institution, countryId, offered: slots, used: 0, orderKey: 2 ** 31 + kindIndex };
      employerList(provinceId, profession.id).push(employer);
      institutionEmployer.set(`${String(provinceId)}:${institution}`, employer);
    });
  }

  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const existingBuilding = new Map<Id, EmploymentAssignment[]>();
  let maxBuildingAssignmentId = 0;
  for (const assignment of world.employment) {
    maxBuildingAssignmentId = Math.max(maxBuildingAssignmentId, assignment.id);
    const list = existingBuilding.get(assignment.popBlockId);
    if (list === undefined) existingBuilding.set(assignment.popBlockId, [assignment]);
    else list.push(assignment);
  }
  const existingInstitution = new Map<Id, InstitutionAssignment[]>();
  for (const assignment of world.labourMarket.institutionEmployment) {
    const list = existingInstitution.get(assignment.popBlockId);
    if (list === undefined) existingInstitution.set(assignment.popBlockId, [assignment]);
    else list.push(assignment);
  }
  let nextBuildingId = maxBuildingAssignmentId + 1;
  let nextInstitutionId = world.labourMarket.nextInstitutionAssignmentId;

  const keptBuilding: EmploymentAssignment[] = [];
  const keptInstitution: InstitutionAssignment[] = [];
  let retainedAssignments = 0;
  let releasedAssignments = 0;
  let releasedWorkers = 0;
  let createdAssignments = 0;
  let assignedWorkers = 0;
  let unemployedEligible = 0;
  const seenKeys = new Set<string>();
  const unemployedByBlock = new Map<Id, number>();
  const eligibleByBlock = new Map<Id, number>();

  for (const block of [...world.popBlocks].sort((left, right) => left.id - right.id)) {
    const profession = professionById.get(block.professionId);
    const blockBuilding = existingBuilding.get(block.id) ?? [];
    const blockInstitution = existingInstitution.get(block.id) ?? [];
    if (profession === undefined) {
      for (const assignment of blockBuilding) {
        releasedAssignments += 1;
        releasedWorkers += assignment.workers;
      }
      for (const assignment of blockInstitution) {
        releasedAssignments += 1;
        releasedWorkers += assignment.workers;
      }
      continue;
    }
    const key = `${String(block.provinceId)}:${String(profession.id)}`;
    if (seenKeys.has(key)) {
      throw new RangeError(`labour market: more than one block of profession ${String(profession.id)} in province ${String(block.provinceId)}`);
    }
    seenKeys.add(key);
    const eligible = labourEligibleWorkforce(block, profession);
    let remaining = eligible;
    // Retention in keyed order (building and institution assignments together).
    const candidates: { draw: number; order: number; building?: EmploymentAssignment; institution?: InstitutionAssignment }[] = [];
    for (const assignment of blockBuilding) {
      candidates.push({
        draw: drawUint32({ seed: world.seed, day: dayIndex, entityId: assignment.id, purpose: LABOUR_RETENTION_PURPOSE, drawIndex: 0 }),
        order: assignment.id,
        building: assignment,
      });
    }
    for (const assignment of blockInstitution) {
      candidates.push({
        draw: drawUint32({ seed: world.seed, day: dayIndex, entityId: assignment.id, purpose: LABOUR_RETENTION_PURPOSE, drawIndex: 1 }),
        order: 2 ** 31 + assignment.id,
        institution: assignment,
      });
    }
    candidates.sort((left, right) => left.draw - right.draw || left.order - right.order);
    const keptForBlock = new Map<Employer, EmploymentAssignment | InstitutionAssignment>();
    for (const candidate of candidates) {
      const assignment = candidate.building ?? candidate.institution;
      if (assignment === undefined) continue;
      let employer: Employer | undefined;
      if (candidate.building !== undefined) {
        const building = buildingById.get(candidate.building.buildingInstanceId);
        if (
          building !== undefined &&
          building.provinceId === block.provinceId &&
          candidate.building.professionId === block.professionId
        ) {
          employer = buildingEmployer.get(`${employerKey("building", building.id)}:${String(profession.id)}`);
        }
      } else if (candidate.institution !== undefined) {
        const found = institutionEmployer.get(`${String(block.provinceId)}:${candidate.institution.institution}`);
        if (
          found !== undefined &&
          found.countryId === candidate.institution.countryId &&
          institutionProfession(definitions, candidate.institution.institution)?.id === profession.id
        ) {
          employer = found;
        }
      }
      const keep = employer === undefined ? 0 : Math.min(assignment.workers, employer.offered - employer.used, remaining);
      if (employer === undefined || keep <= 0 || keptForBlock.has(employer)) {
        releasedAssignments += 1;
        releasedWorkers += assignment.workers;
        continue;
      }
      employer.used += keep;
      remaining -= keep;
      releasedWorkers += assignment.workers - keep;
      retainedAssignments += 1;
      const kept = { ...assignment, workers: keep };
      keptForBlock.set(employer, kept);
    }
    // Fill the remaining vacancies.
    const employers = employersByKey.get(key) ?? [];
    const vacancies = employers.map((employer) => Math.max(0, employer.offered - employer.used));
    const totalVacancies = vacancies.reduce((sum, value) => sum + value, 0);
    const fill = Math.min(remaining, totalVacancies);
    if (fill > 0) {
      const quotas = apportionLargestRemainder(
        fill,
        vacancies,
        employers.map((_, index) =>
          drawUint32({ seed: world.seed, day: dayIndex, entityId: block.id, purpose: LABOUR_FILL_PURPOSE, drawIndex: index }),
        ),
      );
      employers.forEach((employer, index) => {
        const quota = quotas[index] ?? 0;
        if (quota <= 0) return;
        employer.used += quota;
        remaining -= quota;
        const existing = keptForBlock.get(employer);
        if (existing !== undefined) {
          existing.workers += quota;
          return;
        }
        if (employer.kind === "building" && employer.building !== undefined) {
          const created: EmploymentAssignment = {
            id: nextBuildingId,
            popBlockId: block.id,
            buildingInstanceId: employer.building.id,
            professionId: profession.id,
            workers: quota,
          };
          nextBuildingId += 1;
          keptForBlock.set(employer, created);
        } else if (employer.institution !== undefined && employer.countryId !== undefined) {
          const created: InstitutionAssignment = {
            id: nextInstitutionId,
            popBlockId: block.id,
            countryId: employer.countryId,
            institution: employer.institution,
            workers: quota,
          };
          nextInstitutionId += 1;
          keptForBlock.set(employer, created);
        }
        createdAssignments += 1;
      });
    }
    for (const assignment of keptForBlock.values()) {
      assignedWorkers += assignment.workers;
      if ("buildingInstanceId" in assignment) keptBuilding.push(assignment);
      else keptInstitution.push(assignment);
    }
    unemployedEligible += Math.max(0, remaining);
    unemployedByBlock.set(block.id, Math.max(0, remaining));
    eligibleByBlock.set(block.id, eligible);
  }
  const households = hireHouseholdServants(world, definitions, unemployedByBlock, eligibleByBlock);
  unemployedEligible -= households.hired;
  // Assignments of blocks that no longer exist are released.
  for (const [blockId, list] of existingBuilding) {
    if (blockById.has(blockId)) continue;
    for (const assignment of list) {
      releasedAssignments += 1;
      releasedWorkers += assignment.workers;
    }
  }
  for (const [blockId, list] of existingInstitution) {
    if (blockById.has(blockId)) continue;
    for (const assignment of list) {
      releasedAssignments += 1;
      releasedWorkers += assignment.workers;
    }
  }
  keptBuilding.sort((left, right) => left.id - right.id);
  keptInstitution.sort((left, right) => left.id - right.id);
  let unfilledSlots = 0;
  for (const list of employersByKey.values()) {
    for (const employer of list) unfilledSlots += Math.max(0, employer.offered - employer.used);
  }
  world.employment = keptBuilding;
  world.labourMarket.institutionEmployment = keptInstitution;
  world.labourMarket.nextInstitutionAssignmentId = nextInstitutionId;
  world.labourMarket.householdEmployment = households.assignments;
  world.labourMarket.nextHouseholdAssignmentId = households.nextId;
  world.employmentDirty = false;
  assertValidLabourEmployment(world, definitions);
  return {
    refreshed: true,
    dayIndex,
    retainedAssignments,
    releasedAssignments,
    releasedWorkers,
    createdAssignments,
    assignedWorkers,
    unemployedEligible,
    unfilledSlots,
  };
}

/**
 * Strict labour-market employment validation: own-province building assignments of the
 * block's profession within the offered slots; one eligibility per block across
 * buildings and institutions; institution assignments of the owner country and a
 * profession holding the institution's role.
 */
export function assertValidLabourEmployment(world: World, definitions: EconomyDefinitions): void {
  const professionIdSet = new Set(definitions.professions.map((profession) => profession.id));
  const definitionOf = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  for (const building of world.buildings) {
    if (building.jobMix === undefined || building.jobMix === null) continue;
    const definition = definitionOf.get(building.definitionId);
    if (definition === undefined) throw new RangeError(`building ${String(building.id)} references a missing definition`);
    assertValidJobMix(definition, building.jobMix, professionIdSet, `building ${String(building.id)}.jobMix`);
  }
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const ceilings = ceilingMap(world);
  const owners = buildProvinceOwnerMap(world);
  const assignedByBlock = new Map<Id, number>();
  const usedBySlot = new Map<string, number>();
  const ids = new Set<Id>();
  for (const assignment of world.employment) {
    const block = blockById.get(assignment.popBlockId);
    const building = buildingById.get(assignment.buildingInstanceId);
    const profession = professionById.get(assignment.professionId);
    if (block === undefined || building === undefined || profession === undefined) {
      throw new RangeError(`employment assignment ${String(assignment.id)} has a broken reference`);
    }
    if (block.provinceId !== building.provinceId) {
      throw new RangeError(`employment assignment ${String(assignment.id)} crosses provinces (labour market, plan Q5)`);
    }
    if (block.professionId !== profession.id) {
      throw new RangeError(`employment assignment ${String(assignment.id)} is not of its block's profession`);
    }
    if (!building.operational) throw new RangeError(`employment assignment ${String(assignment.id)} references a non-operational building`);
    const slotKey = `${String(building.id)}:${String(profession.id)}`;
    usedBySlot.set(slotKey, (usedBySlot.get(slotKey) ?? 0) + assignment.workers);
    assignedByBlock.set(block.id, (assignedByBlock.get(block.id) ?? 0) + assignment.workers);
  }
  for (const [slotKey, used] of usedBySlot) {
    const [buildingText, professionText] = slotKey.split(":");
    const building = buildingById.get(Number(buildingText));
    const profession = professionById.get(Number(professionText));
    const definition = building === undefined ? undefined : definitionById.get(building.definitionId);
    if (building === undefined || profession === undefined || definition === undefined) throw new RangeError("broken slot reference");
    if (used > offeredJobSlots(definition, building, profession, ceilings.get(building.id) ?? 1)) {
      throw new RangeError(`building ${String(building.id)} profession ${String(profession.id)} exceeds its offered slots`);
    }
  }
  for (const assignment of world.labourMarket.institutionEmployment) {
    if (ids.has(assignment.id)) throw new RangeError(`duplicate institution assignment id ${String(assignment.id)}`);
    ids.add(assignment.id);
    if (!(assignment.id < world.labourMarket.nextInstitutionAssignmentId)) {
      throw new RangeError(`institution assignment id ${String(assignment.id)} is not below the allocator`);
    }
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) throw new RangeError(`institution assignment ${String(assignment.id)} references an unknown block`);
    if (owners.get(block.provinceId) !== assignment.countryId) {
      throw new RangeError(`institution assignment ${String(assignment.id)} is not in a province of its country`);
    }
    if (institutionProfession(definitions, assignment.institution)?.id !== block.professionId) {
      throw new RangeError(`institution assignment ${String(assignment.id)} is not of the institution's profession`);
    }
    assignedByBlock.set(block.id, (assignedByBlock.get(block.id) ?? 0) + assignment.workers);
  }
  const householdIds = new Set<Id>();
  for (const assignment of world.labourMarket.householdEmployment) {
    if (householdIds.has(assignment.id)) throw new RangeError(`duplicate household assignment id ${String(assignment.id)}`);
    householdIds.add(assignment.id);
    const block = blockById.get(assignment.popBlockId);
    const employer = blockById.get(assignment.employerBlockId);
    if (block === undefined || employer === undefined) throw new RangeError(`household assignment ${String(assignment.id)} has a broken reference`);
    if (block.provinceId !== employer.provinceId) throw new RangeError(`household assignment ${String(assignment.id)} crosses provinces`);
    assignedByBlock.set(block.id, (assignedByBlock.get(block.id) ?? 0) + assignment.workers);
  }
  for (const [blockId, assigned] of assignedByBlock) {
    const block = blockById.get(blockId);
    const profession = block === undefined ? undefined : professionById.get(block.professionId);
    if (block === undefined || profession === undefined) throw new RangeError(`unknown block ${String(blockId)}`);
    if (assigned > labourEligibleWorkforce(block, profession)) {
      throw new RangeError(`popBlock ${String(blockId)} exceeds its eligible workforce`);
    }
  }
}

/**
 * D-126 for the labour market: after the day's demography, trim each over-assigned
 * block's building and institution assignments by its excess, proportionally with
 * largest remainder (ties: building assignments first, then lower id). Returns false
 * (state restored) when the result still fails validation.
 */
export function repairLabourEmploymentAfterDemography(world: World, definitions: EconomyDefinitions): boolean {
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  type Entry = { readonly kind: 0 | 1 | 2; readonly id: Id; readonly workers: number };
  const byBlock = new Map<Id, Entry[]>();
  const push = (blockId: Id, entry: Entry): void => {
    const list = byBlock.get(blockId);
    if (list === undefined) byBlock.set(blockId, [entry]);
    else list.push(entry);
  };
  // P7 (§4.1): household servants are released first (they are rehired at the next refresh).
  const liveBlocks = new Set(world.popBlocks.map((block) => block.id));
  const originalHousehold = world.labourMarket.householdEmployment;
  world.labourMarket.householdEmployment = originalHousehold.filter((entry) => liveBlocks.has(entry.popBlockId) && liveBlocks.has(entry.employerBlockId));
  for (const assignment of world.labourMarket.householdEmployment) push(assignment.popBlockId, { kind: 2, id: assignment.id, workers: assignment.workers });
  for (const assignment of world.employment) push(assignment.popBlockId, { kind: 0, id: assignment.id, workers: assignment.workers });
  for (const assignment of world.labourMarket.institutionEmployment) push(assignment.popBlockId, { kind: 1, id: assignment.id, workers: assignment.workers });
  const reductionBuilding = new Map<Id, number>();
  const reductionInstitution = new Map<Id, number>();
  const reductionHousehold = new Map<Id, number>();
  for (const [blockId, entries] of [...byBlock].sort((left, right) => left[0] - right[0])) {
    const block = blockById.get(blockId);
    const profession = block === undefined ? undefined : professionById.get(block.professionId);
    if (block === undefined || profession === undefined) continue;
    const assigned = entries.reduce((sum, entry) => sum + entry.workers, 0);
    const excess = assigned - labourEligibleWorkforce(block, profession);
    if (excess <= 0) continue;
    const ordered = [...entries].sort((left, right) => (left.kind === 2 ? -1 : left.kind) - (right.kind === 2 ? -1 : right.kind) || left.id - right.id);
    const cuts = apportionLargestRemainder(
      excess,
      ordered.map((entry) => entry.workers),
      ordered.map((_, index) => index),
    );
    ordered.forEach((entry, index) => {
      const cut = cuts[index] ?? 0;
      if (cut <= 0) return;
      if (entry.kind === 0) reductionBuilding.set(entry.id, cut);
      else if (entry.kind === 1) reductionInstitution.set(entry.id, cut);
      else reductionHousehold.set(entry.id, cut);
    });
  }
  world.labourMarket.householdEmployment = world.labourMarket.householdEmployment
    .map((assignment) => {
      const cut = reductionHousehold.get(assignment.id) ?? 0;
      return cut === 0 ? assignment : { ...assignment, workers: assignment.workers - cut };
    })
    .filter((assignment) => assignment.workers > 0);
  const householdChanged = world.labourMarket.householdEmployment.length !== originalHousehold.length || world.labourMarket.householdEmployment.some((entry, index) => entry !== originalHousehold[index]);
  if (reductionBuilding.size === 0 && reductionInstitution.size === 0) return householdChanged;
  const originalBuilding = world.employment;
  const originalInstitution = world.labourMarket.institutionEmployment;
  world.employment = originalBuilding
    .map((assignment) => {
      const cut = reductionBuilding.get(assignment.id) ?? 0;
      return cut === 0 ? assignment : { ...assignment, workers: assignment.workers - cut };
    })
    .filter((assignment) => assignment.workers > 0);
  world.labourMarket.institutionEmployment = originalInstitution
    .map((assignment) => {
      const cut = reductionInstitution.get(assignment.id) ?? 0;
      return cut === 0 ? assignment : { ...assignment, workers: assignment.workers - cut };
    })
    .filter((assignment) => assignment.workers > 0);
  try {
    assertValidLabourEmployment(world, definitions);
    return true;
  } catch {
    world.employment = originalBuilding;
    world.labourMarket.institutionEmployment = originalInstitution;
    world.labourMarket.householdEmployment = originalHousehold;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Monthly updates: wages (§4.1), alternative income (§4.2), ceilings (§4.3)
// ---------------------------------------------------------------------------

/** Smoothed (or current) market price of a good. */
function smoothedPrice(market: World["markets"][number], goodId: Id): number {
  const smoothed = market.priceSmoothedRUSD[goodId];
  if (smoothed !== undefined && smoothed > 0) return smoothed;
  return market.priceRUSD[goodId] ?? 0;
}

/**
 * The territory's consumer price index relative to the E6b base period: Σ w·p̄ ÷ Σ w·p₀
 * over the fixed basket with smoothed prices. 1 when the world has no basket.
 */
export function territoryPriceIndex(world: World, marketId: Id): number {
  const market = world.markets.find((entry) => entry.id === marketId);
  const base = world.priceIndex.basePrices.find((entry) => entry.marketId === marketId);
  if (market === undefined || base === undefined || world.priceIndex.basket.length === 0) return 1;
  let current = 0;
  let reference = 0;
  for (const item of world.priceIndex.basket) {
    const basePrice = base.prices[item.goodId] ?? 0;
    if (!(basePrice > 0)) continue;
    current += item.weight * smoothedPrice(market, item.goodId);
    reference += item.weight * basePrice;
  }
  return current > 0 && reference > 0 ? current / reference : 1;
}

export interface LabourMonthUpdate {
  readonly wagesUpdated: number;
  readonly ceilingsLowered: number;
  readonly ceilingsRaised: number;
}

/**
 * The monthly wage, alternative-income and ceiling update (plan §5.1 order: after the
 * month's first employment refresh, before mobility). Mutates `world.labourMarket`.
 */
export function updateLabourMarketMonth(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
): LabourMonthUpdate {
  const state = world.labourMarket;
  const wagesBefore = buildLabourWageTable(world, definitions);
  const plan = planInstitutionSlots(world, definitions, wagesBefore, dayIndex);
  const measured = measureLabourMarket(world, definitions, plan);
  const size = measured.professionCount;
  const populationByProvince = new Map<Id, number>();
  for (const block of world.popBlocks) {
    populationByProvince.set(block.provinceId, (populationByProvince.get(block.provinceId) ?? 0) + populationTotal(block));
  }
  const marketByProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  let wagesUpdated = 0;

  // Territory reference wages.
  for (const territory of state.territories) {
    const counts = measured.byMarket.get(territory.marketId);
    const priceIndex = territoryPriceIndex(world, territory.marketId);
    const priceChange = territory.priceIndexAtUpdate > 0 ? Math.log(priceIndex / territory.priceIndexAtUpdate) : 0;
    territory.previousReferenceWageRUSDPerYear = [...territory.referenceWageRUSDPerYear];
    for (let professionId = 0; professionId < size; professionId += 1) {
      const current = territory.referenceWageRUSDPerYear[professionId];
      if (current === undefined) continue;
      const eligible = counts?.eligible[professionId] ?? 0;
      const offered = counts?.offered[professionId] ?? 0;
      if (!(eligible > 0) && !(offered > 0)) continue; // unpopulated: keeps its wage
      const u = counts === undefined ? 0 : unemploymentRate(counts, professionId);
      const v = counts === undefined ? 0 : vacancyRate(counts, professionId);
      const change =
        WAGE_RISE_PER_GAP * Math.max(0, v - u) - WAGE_FALL_PER_GAP * Math.max(0, u - v) + WAGE_PRICE_PASS_THROUGH * priceChange;
      const next = current * Math.exp(change);
      if (!Number.isFinite(next) || !(next > 0)) throw new RangeError("labour market: wage update produced an invalid wage");
      territory.referenceWageRUSDPerYear[professionId] = next;
      wagesUpdated += 1;
    }
    territory.priceIndexAtUpdate = priceIndex;
  }

  // Provincial differentials, renormalised per territory.
  const provincesByMarket = new Map<Id, typeof state.provinces>();
  for (const province of state.provinces) {
    const marketId = marketByProvince.get(province.provinceId) ?? null;
    if (marketId === null) continue;
    const list = provincesByMarket.get(marketId);
    if (list === undefined) provincesByMarket.set(marketId, [province]);
    else list.push(province);
  }
  for (const [marketId, provinces] of provincesByMarket) {
    const marketCounts = measured.byMarket.get(marketId);
    for (let professionId = 0; professionId < size; professionId += 1) {
      const marketGap = marketCounts === undefined ? 0 : vacancyRate(marketCounts, professionId) - unemploymentRate(marketCounts, professionId);
      let changed = false;
      for (const province of provinces) {
        const counts = measured.byProvince.get(province.provinceId);
        if (counts === undefined) continue;
        if (!((counts.eligible[professionId] ?? 0) > 0) && !((counts.offered[professionId] ?? 0) > 0)) continue;
        const gap = vacancyRate(counts, professionId) - unemploymentRate(counts, professionId);
        const current = province.differential[professionId] ?? 1;
        province.differential[professionId] = current * Math.exp(WAGE_DIFFERENTIAL_PER_GAP * (gap - marketGap));
        changed = true;
      }
      if (!changed) continue;
      let weighted = 0;
      let weight = 0;
      for (const province of provinces) {
        const population = populationByProvince.get(province.provinceId) ?? 0;
        weighted += population * (province.differential[professionId] ?? 1);
        weight += population;
      }
      if (!(weight > 0) || !(weighted > 0)) continue;
      const mean = weighted / weight;
      for (const province of provinces) province.differential[professionId] = (province.differential[professionId] ?? 1) / mean;
    }
  }

  // Peasant alternative income (plan §4.2): income of the subsistence blocks ÷ their
  // employed workers, smoothed over a year.
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const assignedByBlock = new Map<Id, number>();
  for (const assignment of world.employment) assignedByBlock.set(assignment.popBlockId, (assignedByBlock.get(assignment.popBlockId) ?? 0) + assignment.workers);
  const incomeByProvince = new Map<Id, { income: number; workers: number }>();
  for (const block of world.popBlocks) {
    const profession = professionById.get(block.professionId);
    if (profession === undefined || !professionHasRole(profession, "subsistence")) continue;
    const workers = assignedByBlock.get(block.id) ?? 0;
    const entry = incomeByProvince.get(block.provinceId) ?? { income: 0, workers: 0 };
    entry.income += block.incomeSmoothedRUSDPerCapitaDay * populationTotal(block) * 365;
    entry.workers += workers;
    incomeByProvince.set(block.provinceId, entry);
  }
  for (const province of state.provinces) {
    const entry = incomeByProvince.get(province.provinceId);
    if (entry === undefined || !(entry.workers > 0) || !(entry.income > 0)) continue;
    const measuredIncome = entry.income / entry.workers;
    province.peasantAlternativeIncomeRUSDPerYear =
      province.peasantAlternativeIncomeRUSDPerYear > 0
        ? province.peasantAlternativeIncomeRUSDPerYear + PEASANT_ALTERNATIVE_MONTHLY_WEIGHT * (measuredIncome - province.peasantAlternativeIncomeRUSDPerYear)
        : measuredIncome;
  }

  // Staffing ceilings with the updated wages.
  const wages = buildLabourWageTable(world, definitions);
  const ceilings = updateStaffingCeilings(world, definitions, wages, dayIndex);
  return { wagesUpdated, ceilingsLowered: ceilings.lowered, ceilingsRaised: ceilings.raised };
}

/**
 * R of one building (plan §4.3): value added per throughput unit at smoothed prices ×
 * technique (× the land factor and the marginal-product factor for land-using
 * buildings) ÷ the wage bill per throughput unit of its non-self-employed jobs at the
 * wages paid. Null when the building has no such jobs.
 */
export function buildingProfitability(
  world: World,
  definitions: EconomyDefinitions,
  wages: LabourWageTable,
  building: BuildingInstance,
  definition: BuildingDef,
  context: {
    readonly market: World["markets"][number] | undefined;
    readonly landPerLevel: ReadonlyMap<number, number>;
    readonly ceiling: number;
    readonly yearDays: number;
    readonly professionById: ReadonlyMap<Id, ProfessionDef>;
  },
): number | null {
  if (context.market === undefined) return null;
  const coverage = wages.coverage(building.provinceId);
  let wageBill = 0;
  for (const job of buildingJobs(definition, building)) {
    const profession = context.professionById.get(job.professionId);
    if (profession === undefined || isSelfEmployedProfession(profession)) continue;
    const covered = jobIsCovered(definition, profession, coverage, wages.domesticServiceKeys);
    wageBill += (job.workersPerThroughputUnit * wages.paid(building.provinceId, profession.id, covered)) / context.yearDays;
  }
  if (!(wageBill > 0)) return null;
  let value = 0;
  for (const output of definition.outputs) value += output.quantityPerThroughputUnit * smoothedPrice(context.market, output.goodId);
  for (const input of definition.inputs) value -= input.quantityPerThroughputUnit * smoothedPrice(context.market, input.goodId);
  value *= building.technique;
  if (definition.landUse !== undefined) {
    const land = farmLandFactor(context.landPerLevel.get(landKey(building.provinceId, definition.landUse)) ?? 0);
    const staffing = Math.max(STAFFING_MARGINAL_FLOOR, context.ceiling);
    value *= land * FARM_LABOUR_ELASTICITY * staffing ** (FARM_LABOUR_ELASTICITY - 1);
  }
  void world;
  void definitions;
  return value / wageBill;
}

function updateStaffingCeilings(
  world: World,
  definitions: EconomyDefinitions,
  wages: LabourWageTable,
  dayIndex: DayIndex,
): { lowered: number; raised: number } {
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const marketByProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  const landPerLevel = landPerLevelByProvince(world, definitionById);
  const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
  const current = ceilingMap(world);
  const next: { buildingId: Id; ceiling: number }[] = [];
  let lowered = 0;
  let raised = 0;
  for (const building of [...world.buildings].sort((left, right) => left.id - right.id)) {
    const definition = definitionById.get(building.definitionId);
    const before = current.get(building.id) ?? 1;
    if (definition === undefined || !building.operational) {
      if (before < 1 && definition !== undefined) next.push({ buildingId: building.id, ceiling: before });
      continue;
    }
    const marketId = marketByProvince.get(building.provinceId) ?? null;
    const r = buildingProfitability(world, definitions, wages, building, definition, {
      market: marketId === null ? undefined : marketById.get(marketId),
      landPerLevel,
      ceiling: before,
      yearDays,
      professionById,
    });
    if (r === null) continue; // no ceiling for buildings without hired jobs
    const after = Math.min(1, Math.max(0, before + STAFFING_CEILING_RATE * (r - 1)));
    if (after < before) lowered += 1;
    if (after > before) raised += 1;
    if (after < 1) next.push({ buildingId: building.id, ceiling: after });
  }
  world.labourMarket.staffingCeilings = next;
  return { lowered, raised };
}

// ---------------------------------------------------------------------------
// Institution payroll (plan Q4: paid per assigned worker at the market wage)
// ---------------------------------------------------------------------------

/** The world's blocks by id (a derived lookup, never stored). */
export function popBlocksById(world: World): Map<Id, World["popBlocks"][number]> {
  return new Map(world.popBlocks.map((block) => [block.id, block]));
}

/**
 * Daily payroll owed by a country's institutions of the given kinds: per block, its
 * assigned workers × the covered paid wage of its province and profession × the labour
 * law's hours factor ÷ days in the year. RUSD a day; ascending block id. The field is
 * named `population` so the fiscal allocators can use it as a weight.
 *
 * D-155: a phase that pays every country passes `blockById` (`popBlocksById(world)`,
 * built once); the payroll is the same, without one block map per country.
 */
export function institutionPayroll(
  world: World,
  definitions: EconomyDefinitions,
  countryId: Id,
  kinds: readonly InstitutionKind[],
  yearDays: number,
  wages: LabourWageTable,
  blockById: ReadonlyMap<Id, World["popBlocks"][number]> = popBlocksById(world),
): { popBlockId: Id; population: number }[] {
  const country = world.countries.find((entry) => entry.id === countryId);
  if (country === undefined) return [];
  const hours = laborHoursFactor(country, definitions);
  const owed = new Map<Id, number>();
  for (const assignment of world.labourMarket.institutionEmployment) {
    if (assignment.countryId !== countryId || !kinds.includes(assignment.institution)) continue;
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    const daily = (assignment.workers * wages.paid(block.provinceId, block.professionId, true) * hours) / yearDays;
    owed.set(block.id, (owed.get(block.id) ?? 0) + daily);
  }
  return [...owed]
    .sort((left, right) => left[0] - right[0])
    .map(([popBlockId, population]) => ({ popBlockId, population }));
}

/**
 * Administration posts a country's budget funds: floor(administration funding ÷ the
 * bureaucrats' population-weighted mean paid wage over its provinces); the same count
 * the slot plan offers (plan §4.3). 0 without an administration profession or funding.
 */
export function administrationPostsFunded(world: World, definitions: EconomyDefinitions, country: Country): number {
  const profession = institutionProfession(definitions, "administration");
  if (profession === undefined) return 0;
  const funding = institutionFundingRUSDPerYear(world, definitions, country, "administration");
  if (!(funding > 0)) return 0;
  const owners = buildProvinceOwnerMap(world);
  const wages = buildLabourWageTable(world, definitions);
  const populationByProvince = new Map<Id, number>();
  for (const block of world.popBlocks) {
    if (owners.get(block.provinceId) !== country.id) continue;
    populationByProvince.set(block.provinceId, (populationByProvince.get(block.provinceId) ?? 0) + populationTotal(block));
  }
  let weighted = 0;
  let weight = 0;
  for (const province of world.provinceEconomies) {
    if (owners.get(province.id) !== country.id || province.marketId === null) continue;
    const population = populationByProvince.get(province.id) ?? 0;
    weighted += population * wages.paid(province.id, profession.id, true);
    weight += population;
  }
  if (!(weight > 0) || !(weighted > 0)) return 0;
  return Math.floor(funding / (weighted / weight));
}

/** Workers a country's institutions of one kind employ. */
export function institutionStaff(world: World, countryId: Id, institution: InstitutionKind): number {
  let total = 0;
  for (const assignment of world.labourMarket.institutionEmployment) {
    if (assignment.countryId === countryId && assignment.institution === institution) total += assignment.workers;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Minimum-wage preview (plan §4.5, GDD §17A.12.3)
// ---------------------------------------------------------------------------

export interface MinimumWagePreview {
  readonly countryId: Id;
  readonly proposedFloorRUSDPerYear: number;
  /** Workers in covered jobs (buildings and institutions). */
  readonly coveredWorkers: number;
  /** Covered workers whose paid wage today is below the proposed floor. */
  readonly workersBelowFloor: number;
  /** Filled slots of covered buildings whose R at the proposed floor is below 1. */
  readonly jobsAtRisk: number;
  readonly compliance: number;
}

/**
 * Short-run estimate of a proposed floor: prices and people held fixed (labelled so in
 * the UI). Pure: reads the world, writes nothing.
 */
export function minimumWagePreview(
  world: World,
  definitions: EconomyDefinitions,
  countryId: Id,
  proposedFloorRUSDPerYear: number,
  dayIndex: DayIndex,
): MinimumWagePreview {
  if (!Number.isFinite(proposedFloorRUSDPerYear) || proposedFloorRUSDPerYear < 0) {
    throw new RangeError("proposed minimum wage must be a finite non-negative amount");
  }
  const country = world.countries.find((entry) => entry.id === countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(countryId)}`);
  const current = buildLabourWageTable(world, definitions);
  const proposed = buildLabourWageTable(world, definitions, { countryId, floorRUSDPerYear: proposedFloorRUSDPerYear });
  const owners = buildProvinceOwnerMap(world);
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const marketById = new Map(world.markets.map((market) => [market.id, market]));
  const marketByProvince = new Map(world.provinceEconomies.map((province) => [province.id, province.marketId]));
  const definitionMap = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const landPerLevel = landPerLevelByProvince(world, definitionMap);
  const ceilings = ceilingMap(world);
  const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
  const coverage = countryMinimumWageCoverage(country, definitions);
  let coveredWorkers = 0;
  let workersBelowFloor = 0;
  let jobsAtRisk = 0;
  const riskByBuilding = new Map<Id, boolean>();
  for (const assignment of world.employment) {
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined || owners.get(building.provinceId) !== countryId) continue;
    const definition = definitionById.get(building.definitionId);
    const profession = professionById.get(assignment.professionId);
    if (definition === undefined || profession === undefined) continue;
    if (!jobIsCovered(definition, profession, coverage, current.domesticServiceKeys)) continue;
    coveredWorkers += assignment.workers;
    if (current.paid(building.provinceId, profession.id, true) < proposedFloorRUSDPerYear) workersBelowFloor += assignment.workers;
    let atRisk = riskByBuilding.get(building.id);
    if (atRisk === undefined) {
      const marketId = marketByProvince.get(building.provinceId) ?? null;
      const r = buildingProfitability(world, definitions, proposed, building, definition, {
        market: marketId === null ? undefined : marketById.get(marketId),
        landPerLevel,
        ceiling: ceilings.get(building.id) ?? 1,
        yearDays,
        professionById,
      });
      atRisk = r !== null && r < 1;
      riskByBuilding.set(building.id, atRisk);
    }
    if (atRisk) jobsAtRisk += assignment.workers;
  }
  for (const assignment of world.labourMarket.institutionEmployment) {
    if (assignment.countryId !== countryId) continue;
    const block = blockById.get(assignment.popBlockId);
    if (block === undefined) continue;
    coveredWorkers += assignment.workers;
    if (current.paid(block.provinceId, block.professionId, true) < proposedFloorRUSDPerYear) workersBelowFloor += assignment.workers;
  }
  return {
    countryId,
    proposedFloorRUSDPerYear,
    coveredWorkers,
    workersBelowFloor,
    jobsAtRisk,
    compliance: minimumWageCompliance(country),
  };
}
