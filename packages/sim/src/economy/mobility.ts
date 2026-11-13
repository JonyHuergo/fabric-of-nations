/**
 * P7 (D-154): the monthly labour phase of a labour-market world (plan §5, §6).
 *
 * Order on the first civil day of a month (never the scenario's start day), after the
 * month's first employment refresh (plan §5.1):
 *   wage, differential, alternative-income and ceiling update (labourMarket.ts)
 *   → mobility between professions inside each province
 *   → migration between provinces (same profession)
 *   → forced employment refresh → retirement of empty blocks → monthly report.
 *
 * Expected income (Harris–Todaro, plan §5.2): for wage professions E = paid wage ×
 * (1 − u) × H; for self-employed and owner professions, whose wage only splits income
 * from profit, E = the block's measured income per eligible worker × H (the
 * profession's wage × (1 − u) where the province has no block of it). u is the
 * province's rate where the profession has a block there, else the territory's. H is
 * the housing factor of plan §6.3. Decisions read the month-start measurement.
 *
 * Mobility: pressure P = ln(E_b ÷ E_a) − θ; a source block sends to each candidate
 * profession min(ρ·P·N_A scaled to the block's monthly cap, the destination's room
 * (vacancies + β·labour force, in worker equivalents), its gates). Opposite flows
 * cannot both be positive (θ > 0), so netting is automatic. Gates (plan §5.3):
 * literacy (movers are literate working-age persons), training (monthly places from
 * the training instructors), capital (household cash per person ≥ the entry capital,
 * carried pro rata), law (closed professions take nobody).
 *
 * Migration (plan §6.2): each block moves to the province of highest pressure
 * ln(E_d ÷ E_s) − θ_m within the D-052 border rule, at ρ_m·P of its population (at most
 * the M5 monthly fraction), within the M5 inflow cap; a destination block may be
 * created where the profession has vacancies. Migrants leave their dwellings behind.
 *
 * Every move goes through `moveBlockPeople` (reclassify.ts), which conserves people,
 * cash, literate persons, dwellings and urban persons.
 */

import { buildingJobs } from "./buildingJobs.js";
import { dayIndexToCivilDate, isTerminalDayIndex } from "../calendar.js";
import { blockCrowding, blockHasHousing, desiredDwellings } from "../population/housing.js";
import { roundTo } from "../population/definitions.js";
import { RATE_DECIMAL_PLACES } from "../population/constants.js";
import { populationTotal } from "../population/state.js";
import type { PopBlock } from "../population/types.js";
import { drawUint32 } from "../rng.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { buildProvinceOwnerMap } from "./country.js";
import {
  HOUSING_PULL_CROWDING_WEIGHT,
  HOUSING_PULL_ELASTICITY,
  LABOUR_HISTORY_MONTHS,
  LABOUR_MIGRATION_DESTINATION_PURPOSE,
  LABOUR_MIGRATION_ORDER_PURPOSE,
  LABOUR_MIGRATION_RATE_PER_PRESSURE,
  LABOUR_MIGRATION_THRESHOLD,
  MIGRATION_MONTHLY_INFLOW_CAP_FRACTION,
  MIGRATION_MONTHLY_MAX_FRACTION,
  MOBILITY_AHEAD_OF_JOBS_SHARE,
  MOBILITY_MONTHLY_MAX_FRACTION,
  MOBILITY_ORDER_PURPOSE,
  MOBILITY_RATE_PER_PRESSURE,
  MOBILITY_THRESHOLD,
  TRAINEES_PER_INSTRUCTOR,
} from "./constants.js";
import { refreshEmployment, type EmploymentRefreshResult } from "./employment.js";
import {
  buildingIsRural,
  buildLabourWageTable,
  ceilingMap,
  institutionProfession,
  isSelfEmployedProfession,
  labourEligibleWorkforce,
  measureLabourMarket,
  offeredJobSlots,
  planInstitutionSlots,
  professionHasGate,
  professionHasRole,
  unemploymentRate,
  updateLabourMarketMonth,
  type LabourCounts,
  type LabourMeasurement,
  type LabourWageTable,
} from "./labourMarket.js";
import { blockKey, createReclassifyContext, movablePeople, moveBlockPeople, retireEmptyBlocks, type ReclassifyContext } from "./reclassify.js";
import type { EconomyDefinitions, ProfessionDef } from "./types.js";

export interface LabourMonthPhaseResult {
  readonly ran: boolean;
  readonly dayIndex: DayIndex;
  readonly mobilityPeople: number;
  readonly migrationPeople: number;
  readonly blocksCreated: number;
  readonly blocksRetired: number;
  readonly flows: number;
  readonly employmentRefresh: EmploymentRefreshResult | null;
}

/** First civil day of a month, not the scenario's start day, in a labour-market world. */
export function labourMonthIsDue(world: World, dayIndex: DayIndex): boolean {
  return (
    world.labourMarket.enabled &&
    dayIndex !== world.startDayIndex &&
    !isTerminalDayIndex(dayIndex) &&
    dayIndexToCivilDate(dayIndex).day === 1
  );
}

/** Housing factor H of a block (plan §6.3); 1 for a block without housing. */
export function housingPull(block: PopBlock): number {
  if (!blockHasHousing(block) || populationTotal(block) <= 0) return 1;
  const desired = desiredDwellings(block);
  const supply = desired > 0 ? Math.min(1, block.dwellings / desired) : 1;
  const crowding = blockCrowding(block);
  return supply ** HOUSING_PULL_ELASTICITY / (1 + HOUSING_PULL_CROWDING_WEIGHT * Math.max(0, crowding - 1));
}

/** Owners and the self-employed earn a residual; their "wage" only splits income. */
function earnsResidual(profession: ProfessionDef): boolean {
  return isSelfEmployedProfession(profession) || professionHasRole(profession, "owns-capital") || professionHasRole(profession, "owns-land");
}

/** Lowest expected income used in a log ratio, RUSD a year (numerical bound). */
const EXPECTED_INCOME_FLOOR = 1;

interface PhaseIndex {
  readonly world: World;
  readonly definitions: EconomyDefinitions;
  readonly wages: LabourWageTable;
  readonly measured: LabourMeasurement;
  readonly marketByProvince: ReadonlyMap<Id, Id | null>;
  readonly professionById: ReadonlyMap<Id, ProfessionDef>;
  /** Person-weighted housing factor of each province's blocks (for blocks to be created). */
  readonly provincePull: ReadonlyMap<Id, number>;
  /** Person-weighted urban share of each province. */
  readonly provinceUrban: ReadonlyMap<Id, number>;
  /** `${province}:${profession}` → [urban vacancies, all vacancies, urban offered, all offered]. */
  readonly settlementSlots: ReadonlyMap<string, [number, number, number, number]>;
}

function countsOf(index: PhaseIndex, provinceId: Id): LabourCounts | undefined {
  return index.measured.byProvince.get(provinceId);
}

function expectedIncome(index: PhaseIndex, provinceId: Id, profession: ProfessionDef, block: PopBlock | undefined): number {
  const pull = block !== undefined ? housingPull(block) : (index.provincePull.get(provinceId) ?? 1);
  if (block !== undefined && earnsResidual(profession)) {
    const eligible = labourEligibleWorkforce(block, profession);
    if (eligible > 0) {
      const income = (block.incomeSmoothedRUSDPerCapitaDay * populationTotal(block) * 365) / eligible;
      if (income > 0) return Math.max(EXPECTED_INCOME_FLOOR, income * pull);
    }
  }
  const counts = countsOf(index, provinceId);
  const marketId = index.marketByProvince.get(provinceId) ?? null;
  const marketCounts = marketId === null ? undefined : index.measured.byMarket.get(marketId);
  const hasLocal = block !== undefined && counts !== undefined && (counts.eligible[profession.id] ?? 0) > 0;
  const u = hasLocal && counts !== undefined ? unemploymentRate(counts, profession.id) : marketCounts !== undefined ? unemploymentRate(marketCounts, profession.id) : 0;
  const wage = index.wages.paid(provinceId, profession.id, !isSelfEmployedProfession(profession));
  return Math.max(EXPECTED_INCOME_FLOOR, wage * (1 - u) * pull);
}

/** Share of movers into a profession who settle in towns (plan §6.1). */
function urbanFraction(index: PhaseIndex, provinceId: Id, profession: ProfessionDef): number {
  if (profession.settlement === "rural") return 0;
  if (profession.settlement === "urban") return 1;
  const slots = index.settlementSlots.get(blockKey(provinceId, profession.id));
  if (slots !== undefined) {
    const [urbanVacant, vacant, urbanOffered, offered] = slots;
    if (vacant > 0) return urbanVacant / vacant;
    if (offered > 0) return urbanOffered / offered;
  }
  return index.provinceUrban.get(provinceId) ?? 0;
}

/** Room for arrivals in worker equivalents: vacancies + β × labour force. */
function roomOf(index: PhaseIndex, provinceId: Id, professionId: Id): number {
  const counts = countsOf(index, provinceId);
  if (counts === undefined) return 0;
  const vacancies = Math.max(0, (counts.offered[professionId] ?? 0) - (counts.employed[professionId] ?? 0));
  return vacancies + MOBILITY_AHEAD_OF_JOBS_SHARE * (counts.eligible[professionId] ?? 0);
}

function buildPhaseIndex(world: World, definitions: EconomyDefinitions, dayIndex: DayIndex): PhaseIndex {
  const wages = buildLabourWageTable(world, definitions);
  const plan = planInstitutionSlots(world, definitions, wages, dayIndex);
  const measured = measureLabourMarket(world, definitions, plan);
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const pullSums = new Map<Id, [number, number]>();
  const urbanSums = new Map<Id, [number, number]>();
  for (const block of world.popBlocks) {
    const persons = populationTotal(block);
    if (persons <= 0) continue;
    const pull = pullSums.get(block.provinceId) ?? [0, 0];
    pull[0] += persons * housingPull(block);
    pull[1] += persons;
    pullSums.set(block.provinceId, pull);
    const urban = urbanSums.get(block.provinceId) ?? [0, 0];
    urban[0] += persons * block.urbanShare;
    urban[1] += persons;
    urbanSums.set(block.provinceId, urban);
  }
  const provincePull = new Map<Id, number>();
  for (const [id, [sum, weight]] of pullSums) provincePull.set(id, weight > 0 ? sum / weight : 1);
  const provinceUrban = new Map<Id, number>();
  for (const [id, [sum, weight]] of urbanSums) provinceUrban.set(id, weight > 0 ? sum / weight : 0);
  // Urban and rural vacancies per (province, profession); institutions count as urban.
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const filled = new Map<string, number>();
  for (const assignment of world.employment) {
    const key = `${String(assignment.buildingInstanceId)}:${String(assignment.professionId)}`;
    filled.set(key, (filled.get(key) ?? 0) + assignment.workers);
  }
  const ceilings = ceilingMap(world);
  const settlementSlots = new Map<string, [number, number, number, number]>();
  const add = (provinceId: Id, professionId: Id, urban: boolean, offered: number, vacant: number): void => {
    const key = blockKey(provinceId, professionId);
    const entry = settlementSlots.get(key) ?? [0, 0, 0, 0];
    if (urban) {
      entry[0] += vacant;
      entry[2] += offered;
    }
    entry[1] += vacant;
    entry[3] += offered;
    settlementSlots.set(key, entry);
  };
  for (const building of world.buildings) {
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined || !building.operational) continue;
    const urban = !buildingIsRural(definition);
    for (const job of buildingJobs(definition, building)) {
      const profession = professionById.get(job.professionId);
      if (profession === undefined) continue;
      const offered = offeredJobSlots(definition, building, profession, ceilings.get(building.id) ?? 1);
      if (offered <= 0) continue;
      const used = filled.get(`${String(building.id)}:${String(profession.id)}`) ?? 0;
      add(building.provinceId, profession.id, urban, offered, Math.max(0, offered - used));
    }
  }
  const institutionUsed = new Map<string, number>();
  const blockProvince = new Map(world.popBlocks.map((block) => [block.id, block.provinceId]));
  for (const assignment of world.labourMarket.institutionEmployment) {
    const provinceId = blockProvince.get(assignment.popBlockId);
    if (provinceId === undefined) continue;
    const key = `${String(provinceId)}:${assignment.institution}`;
    institutionUsed.set(key, (institutionUsed.get(key) ?? 0) + assignment.workers);
  }
  for (const [provinceId, kinds] of plan.byProvince) {
    for (const [institution, slots] of kinds) {
      const profession = institutionProfession(definitions, institution);
      if (profession === undefined) continue;
      const used = institutionUsed.get(`${String(provinceId)}:${institution}`) ?? 0;
      add(provinceId, profession.id, true, slots, Math.max(0, slots - used));
    }
  }
  return {
    world,
    definitions,
    wages,
    measured,
    marketByProvince: new Map(world.provinceEconomies.map((province) => [province.id, province.marketId])),
    professionById,
    provincePull,
    provinceUrban,
    settlementSlots,
  };
}

/**
 * Monthly training places per (country, trained profession) in persons: the country's
 * training instructors × TRAINEES_PER_INSTRUCTOR ÷ (course length in years × 12),
 * shared equally among the trained professions (plan §5.3).
 */
function trainingPlaces(world: World, definitions: EconomyDefinitions): Map<Id, Map<Id, number>> {
  const trained = definitions.professions.filter((profession) => professionHasGate(profession, "training"));
  const instructors = new Map<Id, number>();
  for (const assignment of world.labourMarket.institutionEmployment) {
    if (assignment.institution !== "training") continue;
    instructors.set(assignment.countryId, (instructors.get(assignment.countryId) ?? 0) + assignment.workers);
  }
  const places = new Map<Id, Map<Id, number>>();
  for (const [countryId, count] of instructors) {
    const map = new Map<Id, number>();
    for (const profession of trained) {
      const course = profession.courseLengthYears ?? 1;
      map.set(profession.id, Math.floor((count * TRAINEES_PER_INSTRUCTOR) / (course * 12) / Math.max(1, trained.length)));
    }
    places.set(countryId, map);
  }
  return places;
}

function householdCashBalance(context: ReclassifyContext, blockId: Id): number {
  return context.accountsByBlock.get(blockId)?.find((account) => account.subtype === "household-cash")?.balanceRUSD ?? 0;
}

interface FlowTally {
  people: number;
  flows: number;
  readonly net: number[];
}

function recordMove(tally: FlowTally, fromProfession: Id, toProfession: Id, people: number): void {
  tally.people += people;
  tally.flows += 1;
  tally.net[fromProfession] = (tally.net[fromProfession] ?? 0) - people;
  tally.net[toProfession] = (tally.net[toProfession] ?? 0) + people;
}

function runMobility(index: PhaseIndex, context: ReclassifyContext, dayIndex: DayIndex, tally: FlowTally): void {
  const { world, definitions } = index;
  const owners = buildProvinceOwnerMap(world);
  const places = trainingPlaces(world, definitions);
  const roomUsed = new Map<string, number>();
  const sources = [...world.popBlocks]
    .map((block) => ({ block, draw: drawUint32({ seed: world.seed, day: dayIndex, entityId: block.id, purpose: MOBILITY_ORDER_PURPOSE, drawIndex: 0 }) }))
    .sort((left, right) => left.block.provinceId - right.block.provinceId || left.draw - right.draw || left.block.id - right.block.id);
  for (const { block: source } of sources) {
    const persons = populationTotal(source);
    if (persons <= 0) continue;
    const sourceProfession = index.professionById.get(source.professionId);
    if (sourceProfession === undefined) continue;
    const provinceId = source.provinceId;
    const sourceEligible = labourEligibleWorkforce(source, sourceProfession);
    const income = expectedIncome(index, provinceId, sourceProfession, source);
    const countryId = owners.get(provinceId);
    const cashPerPerson = householdCashBalance(context, source.id) / persons;
    const candidates: { profession: ProfessionDef; pressure: number; desired: number }[] = [];
    for (const profession of definitions.professions) {
      if (profession.id === source.professionId || profession.entry === "closed") continue;
      if (professionHasGate(profession, "capital") && cashPerPerson < (profession.entryCapitalRUSD ?? 0)) continue;
      if (professionHasGate(profession, "training")) {
        if (countryId === undefined || ((places.get(countryId)?.get(profession.id) ?? 0) <= 0)) continue;
      }
      const selective = professionHasGate(profession, "literacy");
      if (selective && movablePeople(source, true) <= 0) continue;
      const destination = context.blockByKey.get(blockKey(provinceId, profession.id));
      const pressure = Math.log(expectedIncome(index, provinceId, profession, destination) / income) - MOBILITY_THRESHOLD;
      if (!(pressure > 0)) continue;
      candidates.push({ profession, pressure, desired: MOBILITY_RATE_PER_PRESSURE * pressure * persons });
    }
    if (candidates.length === 0) continue;
    candidates.sort((left, right) => right.pressure - left.pressure || left.profession.id - right.profession.id);
    const budget = Math.floor(MOBILITY_MONTHLY_MAX_FRACTION * persons);
    if (budget < 1) continue;
    const totalDesired = candidates.reduce((sum, candidate) => sum + candidate.desired, 0);
    const scale = totalDesired > budget ? budget / totalDesired : 1;
    let left = budget;
    for (const candidate of candidates) {
      if (left < 1) break;
      const profession = candidate.profession;
      const selective = professionHasGate(profession, "literacy");
      // Worker equivalents of one mover: a literate adult enters at the destination's
      // participation; a household brings the source's eligible share.
      const workerPerMover = selective ? profession.participationRate : sourceEligible > 0 ? sourceEligible / persons : profession.participationRate;
      const key = blockKey(provinceId, profession.id);
      const room = roomOf(index, provinceId, profession.id) - (roomUsed.get(key) ?? 0);
      let count = Math.floor(candidate.desired * scale);
      if (workerPerMover > 0) count = Math.min(count, Math.floor(room / workerPerMover));
      count = Math.min(count, left, movablePeople(source, selective));
      let countryPlaces: Map<Id, number> | undefined;
      if (professionHasGate(profession, "training") && countryId !== undefined) {
        countryPlaces = places.get(countryId);
        count = Math.min(count, countryPlaces?.get(profession.id) ?? 0);
      }
      if (count < 1) continue;
      const carried = Math.max(0, 1 - Math.abs(urbanFraction(index, provinceId, profession) - source.urbanShare));
      moveBlockPeople(context, source, provinceId, profession.id, count, {
        selectiveLiterate: selective,
        destinationUrbanFraction: urbanFraction(index, provinceId, profession),
        carriedDwellingShare: carried,
      });
      roomUsed.set(key, (roomUsed.get(key) ?? 0) + count * workerPerMover);
      if (countryPlaces !== undefined) countryPlaces.set(profession.id, (countryPlaces.get(profession.id) ?? 0) - count);
      left -= count;
      recordMove(tally, source.professionId, profession.id, count);
    }
  }
}

function runLabourMigration(index: PhaseIndex, context: ReclassifyContext, dayIndex: DayIndex, tally: FlowTally): void {
  const { world } = index;
  const owners = buildProvinceOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const standing = new Map<Id, number>();
  for (const block of world.popBlocks) standing.set(block.provinceId, (standing.get(block.provinceId) ?? 0) + populationTotal(block));
  const inflow = new Map<Id, number>();
  // Candidate provinces per profession: where it has a populated block, or vacancies.
  const candidateProvinces = new Map<Id, Id[]>();
  const addCandidate = (professionId: Id, provinceId: Id): void => {
    const list = candidateProvinces.get(professionId);
    if (list === undefined) candidateProvinces.set(professionId, [provinceId]);
    else if (!list.includes(provinceId)) list.push(provinceId);
  };
  for (const block of world.popBlocks) if (populationTotal(block) > 0) addCandidate(block.professionId, block.provinceId);
  for (const [provinceId, counts] of index.measured.byProvince) {
    for (let professionId = 0; professionId < index.measured.professionCount; professionId += 1) {
      if ((counts.offered[professionId] ?? 0) > (counts.employed[professionId] ?? 0)) addCandidate(professionId, provinceId);
    }
  }
  for (const list of candidateProvinces.values()) list.sort((left, right) => left - right);
  const roomUsed = new Map<string, number>();
  const sources = [...world.popBlocks]
    .map((block) => ({ block, draw: drawUint32({ seed: world.seed, day: dayIndex, entityId: block.id, purpose: LABOUR_MIGRATION_ORDER_PURPOSE, drawIndex: 0 }) }))
    .sort((left, right) => left.draw - right.draw || left.block.id - right.block.id);
  for (const { block: source } of sources) {
    const persons = populationTotal(source);
    if (persons <= 0) continue;
    const profession = index.professionById.get(source.professionId);
    if (profession === undefined) continue;
    const sourceOwner = owners.get(source.provinceId) ?? null;
    const income = expectedIncome(index, source.provinceId, profession, source);
    const eligible = labourEligibleWorkforce(source, profession);
    const workerPerMover = eligible > 0 ? eligible / persons : profession.participationRate;
    let best: { provinceId: Id; pressure: number; draw: number; people: number } | null = null;
    for (const provinceId of candidateProvinces.get(profession.id) ?? []) {
      if (provinceId === source.provinceId) continue;
      const destinationOwner = owners.get(provinceId) ?? null;
      if (destinationOwner !== sourceOwner) {
        if (destinationOwner === null || countryById.get(destinationOwner)?.immigrationOpen !== true) continue;
      }
      const destination = context.blockByKey.get(blockKey(provinceId, profession.id));
      const pressure = Math.log(expectedIncome(index, provinceId, profession, destination) / income) - LABOUR_MIGRATION_THRESHOLD;
      if (!(pressure > 0)) continue;
      if (best !== null && pressure < best.pressure) continue;
      let people = Math.floor(persons * Math.min(MIGRATION_MONTHLY_MAX_FRACTION, LABOUR_MIGRATION_RATE_PER_PRESSURE * pressure));
      const cap = Math.floor((standing.get(provinceId) ?? 0) * MIGRATION_MONTHLY_INFLOW_CAP_FRACTION) - (inflow.get(provinceId) ?? 0);
      people = Math.min(people, cap);
      if (destination === undefined || populationTotal(destination) <= 0) {
        // Toward jobs only where the profession has no people yet.
        const room = roomOf(index, provinceId, profession.id) - (roomUsed.get(blockKey(provinceId, profession.id)) ?? 0);
        people = Math.min(people, workerPerMover > 0 ? Math.floor(room / workerPerMover) : 0);
      }
      if (people < 1) continue;
      const draw = drawUint32({ seed: world.seed, day: dayIndex, entityId: source.id, purpose: LABOUR_MIGRATION_DESTINATION_PURPOSE, drawIndex: provinceId });
      if (best === null || pressure > best.pressure || draw < best.draw || (draw === best.draw && provinceId < best.provinceId)) {
        best = { provinceId, pressure, draw, people };
      }
    }
    if (best === null) continue;
    const destination = context.blockByKey.get(blockKey(best.provinceId, profession.id));
    const fraction = destination !== undefined && populationTotal(destination) > 0 ? destination.urbanShare : urbanFraction(index, best.provinceId, profession);
    moveBlockPeople(context, source, best.provinceId, profession.id, best.people, {
      selectiveLiterate: false,
      destinationUrbanFraction: fraction,
      carriedDwellingShare: 0,
    });
    inflow.set(best.provinceId, (inflow.get(best.provinceId) ?? 0) + best.people);
    const key = blockKey(best.provinceId, profession.id);
    roomUsed.set(key, (roomUsed.get(key) ?? 0) + best.people * workerPerMover);
    tally.people += best.people;
    tally.flows += 1;
  }
}

/** Province urban share = Σ urban persons ÷ persons (plan §6.5). */
function updateProvinceUrbanShares(world: World): void {
  const sums = new Map<Id, [number, number]>();
  for (const block of world.popBlocks) {
    const persons = populationTotal(block);
    const entry = sums.get(block.provinceId) ?? [0, 0];
    entry[0] += persons * block.urbanShare;
    entry[1] += persons;
    sums.set(block.provinceId, entry);
  }
  for (const province of world.provinceEconomies) {
    const entry = sums.get(province.id);
    if (entry === undefined || !(entry[1] > 0)) continue;
    province.urbanShare = roundTo(Math.min(1, Math.max(0, entry[0] / entry[1])), RATE_DECIMAL_PLACES);
  }
}

/** Run the monthly labour phase when due; otherwise return `ran: false` without mutation. */
export function runLabourMonthPhase(world: World, definitions: EconomyDefinitions, dayIndex: DayIndex): LabourMonthPhaseResult {
  const none: LabourMonthPhaseResult = {
    ran: false,
    dayIndex,
    mobilityPeople: 0,
    migrationPeople: 0,
    blocksCreated: 0,
    blocksRetired: 0,
    flows: 0,
    employmentRefresh: null,
  };
  if (!labourMonthIsDue(world, dayIndex)) return none;
  updateLabourMarketMonth(world, definitions, dayIndex);
  const index = buildPhaseIndex(world, definitions, dayIndex);
  const context = createReclassifyContext(world, definitions, dayIndex);
  const size = index.measured.professionCount;
  const mobility: FlowTally = { people: 0, flows: 0, net: new Array<number>(size).fill(0) };
  runMobility(index, context, dayIndex, mobility);
  const migration: FlowTally = { people: 0, flows: 0, net: new Array<number>(size).fill(0) };
  runLabourMigration(index, context, dayIndex, migration);
  updateProvinceUrbanShares(world);
  world.employmentDirty = true;
  const employmentRefresh = refreshEmployment(world, definitions, dayIndex, { force: true });
  const blocksRetired = retireEmptyBlocks(context);
  const report = {
    dayIndex,
    mobilityPeople: mobility.people,
    migrationPeople: migration.people,
    blocksCreated: context.blocksCreated,
    blocksRetired,
    netByProfession: mobility.net.map((value, professionId) => value + (migration.net[professionId] ?? 0)),
  };
  world.labourMarket.history = [...world.labourMarket.history, report].slice(-LABOUR_HISTORY_MONTHS);
  return {
    ran: true,
    dayIndex,
    mobilityPeople: mobility.people,
    migrationPeople: migration.people,
    blocksCreated: context.blocksCreated,
    blocksRetired,
    flows: mobility.flows + migration.flows,
    employmentRefresh,
  };
}
