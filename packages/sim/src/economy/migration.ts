/**
 * M5 deterministic cross-region and cross-country migration.
 *
 * Migration is an explicit demographic flow between two existing population
 * blocks that share a profession. It moves an integer number of people, splits
 * them across the authoritative single-year sex/age cells proportionally with
 * deterministic largest-remainder allocation, and moves each migrant's share of
 * the source household's cash through a balanced `migration-transfer` posting.
 *
 * Design boundaries (D-052):
 * - Internal migration (any region of the same country) is always permitted.
 * - Cross-country migration requires the destination country's provisional
 *   `immigrationOpen` policy. Emigration is unrestricted in M5.
 * - No migration block is created; the destination block must already exist.
 * - Wealth/literacy/militancy merge by population weight at the destination;
 *   needs-history counters stay with the destination block, and the fractional
 *   demographic remainders stay with their original blocks.
 * - The phase runs on the first civil day of a month, never on the scenario's
 *   start day, and the whole flow set is staged so a failure leaves the supplied
 *   world unchanged.
 */

import { assertValidDayIndex, dayIndexToCivilDate, isTerminalDayIndex } from "../calendar.js";
import { MONEY_TOLERANCE_RUSD, RATE_DECIMAL_PLACES, WEALTH_DECIMAL_PLACES } from "../population/constants.js";
import {
  mergeBlockLiteracyByAge,
  populationTotal,
  regionPopulation,
} from "../population/state.js";
import { roundTo } from "../population/definitions.js";
import { drawUint32 } from "../rng.js";
import type { DayIndex, Id } from "../types.js";
import {
  assertValidWorld,
  assertValidWorldForTick,
  type PhaseValidationOptions,
  type World,
} from "../world.js";
import { postJournalBatch } from "./accounting.js";
import { buildFinanceIndex, cloneFinanceState } from "./accounts.js";
import { buildRegionOwnerMap } from "./country.js";
import {
  MIGRATION_MONTHLY_INFLOW_CAP_FRACTION,
  MIGRATION_MONTHLY_MAX_FRACTION,
  MIGRATION_RATE_PER_PRESSURE,
  MIGRATION_VACANCY_WEIGHT,
  MIGRATION_WEALTH_WEIGHT,
} from "./constants.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import {
  eligibleWorkforceForBlock,
  jobSlotsForBuilding,
  refreshEmployment,
  type EmploymentRefreshResult,
} from "./employment.js";
import type { EconomyDefinitions, EmploymentAssignment, FinancialAccount } from "./types.js";

export const MIGRATION_SOURCE_ORDER_PURPOSE = "migration.source-order";
export const MIGRATION_DESTINATION_PURPOSE = "migration.destination";
export const MIGRATION_AGE_REMAINDER_PURPOSE = "migration.age-remainder";

/** One applied aggregate migration flow. Transient; never persisted. */
export interface MigrationFlow {
  readonly sourcePopBlockId: Id;
  readonly destinationPopBlockId: Id;
  readonly sourceRegionId: Id;
  readonly destinationRegionId: Id;
  readonly professionId: Id;
  readonly people: number;
  readonly financialTransferRUSD: number;
}

export interface MigrationDayResult {
  readonly ran: boolean;
  readonly dayIndex: DayIndex;
  readonly flows: readonly MigrationFlow[];
  readonly totalPeople: number;
  readonly totalFinancialTransferRUSD: number;
  readonly sourceBlocksConsidered: number;
  readonly destinationsCappedByInflowLimit: number;
  /**
   * Forced employment refresh performed by the phase after at least one flow, or
   * null when no population moved. A successful phase therefore leaves
   * assignments valid for the resulting working-age population without requiring
   * the caller to repair them.
   */
  readonly employmentRefresh: EmploymentRefreshResult | null;
}

function emptyResult(dayIndex: DayIndex): MigrationDayResult {
  return {
    ran: false,
    dayIndex,
    flows: [],
    totalPeople: 0,
    totalFinancialTransferRUSD: 0,
    sourceBlocksConsidered: 0,
    destinationsCappedByInflowLimit: 0,
    employmentRefresh: null,
  };
}

/** True on the first civil day of a month. */
function isFirstDayOfMonth(dayIndex: DayIndex): boolean {
  const date = dayIndexToCivilDate(dayIndex);
  return date.day === 1;
}

interface RegionSignal {
  readonly vacancyRate: number;
}

function signalKey(regionId: Id, professionId: Id): string {
  return `${String(regionId)}:${String(professionId)}`;
}

/**
 * Compute unfilled-slot pressure per region and profession. The vacancy rate is
 * `clamp(unfilled slots / max(1, eligible regional workforce), 0, 1)`.
 */
function computeRegionSignals(
  world: World,
  definitions: EconomyDefinitions,
): Map<string, RegionSignal> {
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const definitionById = new Map(definitions.buildings.map((definition) => [definition.id, definition]));
  const signals = new Map<string, RegionSignal>();
  const eligible = new Map<string, number>();
  const slots = new Map<string, number>();
  const assigned = new Map<string, number>();

  for (const block of world.popBlocks) {
    const profession = professionById.get(block.professionId);
    if (profession === undefined) continue;
    const key = signalKey(block.regionId, block.professionId);
    eligible.set(key, (eligible.get(key) ?? 0) + eligibleWorkforceForBlock(block, profession));
  }
  const buildingById = new Map(world.buildings.map((building) => [building.id, building]));
  for (const building of world.buildings) {
    if (!building.operational) continue;
    const definition = definitionById.get(building.definitionId);
    if (definition === undefined) continue;
    for (const job of definition.jobs) {
      const key = signalKey(building.regionId, job.professionId);
      slots.set(
        key,
        (slots.get(key) ?? 0) + jobSlotsForBuilding(definition, building, job.professionId),
      );
    }
  }
  for (const assignment of world.employment) {
    const building = buildingById.get(assignment.buildingInstanceId);
    if (building === undefined) continue;
    const key = signalKey(building.regionId, assignment.professionId);
    assigned.set(key, (assigned.get(key) ?? 0) + assignment.workers);
  }

  const keys = new Set<string>([...eligible.keys(), ...slots.keys()]);
  for (const key of keys) {
    const eligibleWorkers = eligible.get(key) ?? 0;
    const unfilled = Math.max(0, (slots.get(key) ?? 0) - (assigned.get(key) ?? 0));
    const rate = unfilled / Math.max(1, eligibleWorkers);
    signals.set(key, { vacancyRate: Math.min(1, Math.max(0, rate)) });
  }
  return signals;
}

interface Candidate {
  readonly destination: World["popBlocks"][number];
  readonly pressure: number;
  readonly order: number;
  readonly people: number;
}

/** Integer cell allocation of `people` proportional to each age/sex cell. */
function splitMigrantsByCell(
  block: World["popBlocks"][number],
  people: number,
  populationBefore: number,
  world: World,
  dayIndex: DayIndex,
): { readonly male: Uint32Array; readonly female: Uint32Array } {
  const totalCells = block.maleByAge.length + block.femaleByAge.length;
  const counts = new Array<number>(totalCells).fill(0);
  const exact = new Array<number>(totalCells).fill(0);
  const allocated = new Array<number>(totalCells).fill(0);
  let assigned = 0;
  for (let index = 0; index < block.maleByAge.length; index += 1) {
    const cell = block.maleByAge[index] ?? 0;
    counts[index] = cell;
    const value = (cell * people) / populationBefore;
    const whole = Math.floor(value);
    exact[index] = value - whole;
    allocated[index] = whole;
    assigned += whole;
  }
  for (let index = 0; index < block.femaleByAge.length; index += 1) {
    const offset = block.maleByAge.length + index;
    const cell = block.femaleByAge[index] ?? 0;
    counts[offset] = cell;
    const value = (cell * people) / populationBefore;
    const whole = Math.floor(value);
    exact[offset] = value - whole;
    allocated[offset] = whole;
    assigned += whole;
  }
  let remaining = people - assigned;
  if (remaining < 0) throw new RangeError("migration cell allocation exceeded the migrant count");
  const order = exact
    .map((remainder, index) => ({
      index,
      remainder,
      order:
        drawUint32({
          seed: world.seed,
          day: dayIndex,
          entityId: block.id,
          purpose: MIGRATION_AGE_REMAINDER_PURPOSE,
          drawIndex: index,
        }) + index / (totalCells + 1),
    }))
    .sort((left, right) => right.remainder - left.remainder || left.order - right.order);
  for (const candidate of order) {
    if (remaining === 0) break;
    const cellCount = counts[candidate.index] ?? 0;
    const current = allocated[candidate.index] ?? 0;
    if (cellCount <= 0 || current >= cellCount) continue;
    allocated[candidate.index] = current + 1;
    remaining -= 1;
  }
  if (remaining !== 0) {
    throw new RangeError("migration cell remainder allocation did not conserve people");
  }
  const male = Uint32Array.from(allocated.slice(0, block.maleByAge.length));
  const female = Uint32Array.from(allocated.slice(block.maleByAge.length));
  return { male, female };
}

function subtractCells(
  block: World["popBlocks"][number],
  male: Uint32Array,
  female: Uint32Array,
): void {
  for (let index = 0; index < block.maleByAge.length; index += 1) {
    const next = (block.maleByAge[index] ?? 0) - (male[index] ?? 0);
    if (next < 0) throw new RangeError("migration would make a male age cell negative");
    block.maleByAge[index] = next;
  }
  for (let index = 0; index < block.femaleByAge.length; index += 1) {
    const next = (block.femaleByAge[index] ?? 0) - (female[index] ?? 0);
    if (next < 0) throw new RangeError("migration would make a female age cell negative");
    block.femaleByAge[index] = next;
  }
}

function addCells(
  block: World["popBlocks"][number],
  male: Uint32Array,
  female: Uint32Array,
): void {
  for (let index = 0; index < block.maleByAge.length; index += 1) {
    block.maleByAge[index] = (block.maleByAge[index] ?? 0) + (male[index] ?? 0);
  }
  for (let index = 0; index < block.femaleByAge.length; index += 1) {
    block.femaleByAge[index] = (block.femaleByAge[index] ?? 0) + (female[index] ?? 0);
  }
}

function householdAccount(world: World, popBlockId: Id): FinancialAccount {
  const index = buildFinanceIndex(world.finance);
  const account = index.find("popBlock", popBlockId, "household-cash");
  if (account === undefined) {
    throw new RangeError(`popBlock ${String(popBlockId)} has no household cash account`);
  }
  return account;
}

interface MigrationBackup {
  readonly finance: ReturnType<typeof cloneFinanceState>;
  readonly employment: readonly EmploymentAssignment[];
  readonly employmentDirty: boolean;
  readonly blocks: readonly {
    readonly block: World["popBlocks"][number];
    readonly male: Uint32Array;
    readonly female: Uint32Array;
    readonly literacy: number;
    readonly wealthLevel: number;
    readonly militancy: number;
  }[];
}

function backupWorld(world: World): MigrationBackup {
  return {
    finance: cloneFinanceState(world.finance),
    employment: world.employment.map((assignment) => ({ ...assignment })),
    employmentDirty: world.employmentDirty,
    blocks: world.popBlocks.map((block) => ({
      block,
      male: block.maleByAge.slice(),
      female: block.femaleByAge.slice(),
      literacy: block.literacy,
      wealthLevel: block.wealthLevel,
      militancy: block.militancy,
    })),
  };
}

function restoreWorld(world: World, backup: MigrationBackup): void {
  world.finance = backup.finance;
  world.employment = backup.employment.map((assignment) => ({ ...assignment }));
  world.employmentDirty = backup.employmentDirty;
  for (const entry of backup.blocks) {
    entry.block.maleByAge = entry.male.slice();
    entry.block.femaleByAge = entry.female.slice();
    entry.block.literacy = entry.literacy;
    entry.block.wealthLevel = entry.wealthLevel;
    entry.block.militancy = entry.militancy;
  }
}

/** One explicitly requested aggregate migration flow. */
export interface MigrationRequest {
  readonly sourcePopBlockId: Id;
  readonly destinationPopBlockId: Id;
  readonly people: number;
}

/**
 * Apply one explicit migration request.
 *
 * Public postcondition: on success, population, household cash, and employment
 * assignments are all consistent with the new working-age population. The
 * phase forces an employment refresh after moving people and clears
 * `employmentDirty`. On failure, population cells, finance, employment, and the
 * dirty marker are restored to their pre-call values before the error is
 * rethrown. The request does not advance `world.dayIndex`.
 */
export function applyMigrationRequest(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
  request: MigrationRequest,
): MigrationFlow {
  assertValidWorld(world);
  assertValidEconomyDefinitions(definitions);
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("migration cannot run at the terminal boundary");
  }
  if (dayIndex !== world.dayIndex) {
    throw new RangeError("migration day must match the world's next day");
  }
  if (!Number.isInteger(request.people) || request.people <= 0) {
    throw new RangeError("migration request people must be a positive integer");
  }
  const source = world.popBlocks.find((block) => block.id === request.sourcePopBlockId);
  if (source === undefined) {
    throw new RangeError(
      `migration request references unknown source pop block ${String(request.sourcePopBlockId)}`,
    );
  }
  const destination = world.popBlocks.find(
    (block) => block.id === request.destinationPopBlockId,
  );
  if (destination === undefined) {
    throw new RangeError(
      `migration request references unknown destination pop block ${String(request.destinationPopBlockId)}`,
    );
  }
  if (source.id === destination.id) {
    throw new RangeError("migration source and destination must be different pop blocks");
  }
  if (source.regionId === destination.regionId) {
    throw new RangeError("migration source and destination must be in different regions");
  }
  if (source.professionId !== destination.professionId) {
    throw new RangeError("migration requires the same profession at the destination");
  }
  const sourceCountryId = regionOwnerId(world, source.regionId);
  const destinationCountryId = regionOwnerId(world, destination.regionId);
  if (sourceCountryId !== destinationCountryId) {
    if (destinationCountryId === null) {
      throw new RangeError("migration cannot enter a region with no owning country");
    }
    const destinationCountry = world.countries.find(
      (country) => country.id === destinationCountryId,
    );
    if (destinationCountry?.immigrationOpen !== true) {
      throw new RangeError(
        `migration into country ${String(destinationCountryId)} requires an open border`,
      );
    }
  }
  const population = populationTotal(source);
  if (request.people > population) {
    throw new RangeError("migration request exceeds the source population");
  }
  const backup = backupWorld(world);
  const flows: MigrationFlow[] = [];
  try {
    applyFlow(
      world,
      dayIndex,
      source,
      destination,
      request.people,
      flows,
      new Map<Id, number>(),
    );
    world.employmentDirty = true;
    refreshEmployment(world, definitions, dayIndex, { force: true });
  } catch (error) {
    restoreWorld(world, backup);
    throw error;
  }
  const flow = flows[0];
  if (flow === undefined) throw new RangeError("migration request produced no flow");
  return flow;
}

function regionOwnerId(world: World, regionId: Id): Id | null {
  for (const country of world.countries) {
    if (country.regionIds.includes(regionId)) return country.id;
  }
  return null;
}

/**
 * Run the monthly migration phase.
 *
 * Public postcondition: when at least one flow is applied, the phase forces an
 * employment refresh and clears `employmentDirty`, so the returned world has
 * assignments valid for the resulting working-age population. `flows`,
 * population, household cash, and postings are published only after every flow
 * and the refresh succeed; a failure restores population, finance, employment,
 * and the dirty marker. Only the first civil day of a month and only after the
 * scenario start performs flows; otherwise the function returns `ran: false`
 * without mutation.
 */
export function runMigrationPhase(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
  options: PhaseValidationOptions = {},
): MigrationDayResult {
  if (options.validateWorld !== false) assertValidWorldForTick(world);
  assertValidEconomyDefinitions(definitions);
  if (definitions.dataVersion !== world.dataVersion || definitions.scenarioId !== world.scenarioId) {
    throw new RangeError("economy definitions do not match the world data/scenario identity");
  }
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("migration cannot run at the terminal boundary");
  }
  if (dayIndex !== world.dayIndex) {
    throw new RangeError("migration day must match the world's next day");
  }
  if (dayIndex === world.startDayIndex || !isFirstDayOfMonth(dayIndex)) {
    return emptyResult(dayIndex);
  }
  if (world.popBlocks.length === 0 || world.markets.length === 0) {
    return emptyResult(dayIndex);
  }

  const regionOwners = buildRegionOwnerMap(world);
  const countryById = new Map(world.countries.map((country) => [country.id, country]));
  const professionById = new Map(definitions.professions.map((profession) => [profession.id, profession]));
  const signals = computeRegionSignals(world, definitions);
  const blocksById = new Map(world.popBlocks.map((block) => [block.id, block]));
  const blocksByProfession = new Map<Id, World["popBlocks"]>();
  for (const block of world.popBlocks) {
    const list = blocksByProfession.get(block.professionId);
    if (list === undefined) blocksByProfession.set(block.professionId, [block]);
    else list.push(block);
  }
  for (const list of blocksByProfession.values()) list.sort((left, right) => left.id - right.id);

  const backup = backupWorld(world);
  const flows: MigrationFlow[] = [];
  let employmentRefresh: EmploymentRefreshResult | null = null;
  const inflowByRegion = new Map<Id, number>();
  const standingByRegion = new Map<Id, number>();
  for (const region of world.regions) {
    if (populationTotalOfRegion(world, region.id) > 0) {
      standingByRegion.set(region.id, regionPopulation(world, region.id));
    }
  }
  let sourceBlocksConsidered = 0;
  let destinationsCappedByInflowLimit = 0;

  const sourceOrder = [...world.popBlocks].sort((left, right) => {
    const leftKey = drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: left.id,
      purpose: MIGRATION_SOURCE_ORDER_PURPOSE,
      drawIndex: 0,
    });
    const rightKey = drawUint32({
      seed: world.seed,
      day: dayIndex,
      entityId: right.id,
      purpose: MIGRATION_SOURCE_ORDER_PURPOSE,
      drawIndex: 0,
    });
    return leftKey - rightKey || left.id - right.id;
  });

  try {
    for (const source of sourceOrder) {
      const sourcePopulationBefore = populationTotal(source);
      if (sourcePopulationBefore <= 0) continue;
      sourceBlocksConsidered += 1;
      const profession = professionById.get(source.professionId);
      if (profession === undefined) continue;
      const sourceCountryId = regionOwners.get(source.regionId) ?? null;
      const sourceSignal = signals.get(signalKey(source.regionId, source.professionId));

      const candidates: Candidate[] = [];
      for (const destination of blocksByProfession.get(source.professionId) ?? []) {
        if (destination.id === source.id) continue;
        if (destination.regionId === source.regionId) continue;
        const destinationPopulation = populationTotal(destination);
        if (destinationPopulation <= 0) continue;
        const destinationCountryId = regionOwners.get(destination.regionId) ?? null;
        if (sourceCountryId !== destinationCountryId) {
          if (destinationCountryId === null) continue;
          if (countryById.get(destinationCountryId)?.immigrationOpen !== true) continue;
        }
        const destinationSignal = signals.get(
          signalKey(destination.regionId, source.professionId),
        );
        const vacancyRate = destinationSignal?.vacancyRate ?? 0;
        const sourceVacancyRate = sourceSignal?.vacancyRate ?? 0;
        const netVacancy = vacancyRate - sourceVacancyRate;
        const wealthGap = Math.max(
          -1,
          Math.min(1, (destination.wealthLevel - source.wealthLevel) / 100),
        );
        const pressure =
          MIGRATION_VACANCY_WEIGHT * Math.max(0, netVacancy) +
          MIGRATION_WEALTH_WEIGHT * Math.max(0, wealthGap);
        if (!(pressure > 0)) continue;
        const fraction = Math.min(
          MIGRATION_MONTHLY_MAX_FRACTION,
          pressure * MIGRATION_RATE_PER_PRESSURE,
        );
        let people = Math.floor(sourcePopulationBefore * fraction);
        if (people < 1) continue;
        const standing = standingByRegion.get(destination.regionId) ?? destinationPopulation;
        const cap = Math.floor(standing * MIGRATION_MONTHLY_INFLOW_CAP_FRACTION);
        const alreadyIn = inflowByRegion.get(destination.regionId) ?? 0;
        const remainingCapacity = cap - alreadyIn;
        if (remainingCapacity < 1) {
          destinationsCappedByInflowLimit += 1;
          continue;
        }
        if (people > remainingCapacity) people = remainingCapacity;
        if (people > sourcePopulationBefore) people = sourcePopulationBefore;
        if (people < 1) continue;
        candidates.push({
          destination,
          pressure,
          order: drawUint32({
            seed: world.seed,
            day: dayIndex,
            entityId: source.id,
            purpose: MIGRATION_DESTINATION_PURPOSE,
            drawIndex: destination.id,
          }),
          people,
        });
      }
      if (candidates.length === 0) continue;
      candidates.sort(
        (left, right) =>
          right.pressure - left.pressure ||
          left.order - right.order ||
          left.destination.id - right.destination.id,
      );
      const chosen = candidates[0];
      if (chosen === undefined) continue;
      applyFlow(world, dayIndex, source, chosen.destination, chosen.people, flows, inflowByRegion);
      signals.clear();
      for (const [key, value] of computeRegionSignals(world, definitions)) signals.set(key, value);
      if (!blocksById.has(source.id)) throw new RangeError("migration lost its source block");
    }
    if (flows.length > 0) {
      world.employmentDirty = true;
      employmentRefresh = refreshEmployment(world, definitions, dayIndex, { force: true });
    }
  } catch (error) {
    restoreWorld(world, backup);
    throw error;
  }

  let totalPeople = 0;
  let totalFinancialTransferRUSD = 0;
  for (const flow of flows) {
    totalPeople += flow.people;
    totalFinancialTransferRUSD += flow.financialTransferRUSD;
  }
  return {
    ran: true,
    dayIndex,
    flows,
    totalPeople,
    totalFinancialTransferRUSD,
    sourceBlocksConsidered,
    destinationsCappedByInflowLimit,
    employmentRefresh,
  };
}

function populationTotalOfRegion(world: World, regionId: Id): number {
  let total = 0;
  for (const block of world.popBlocks) {
    if (block.regionId === regionId) total += populationTotal(block);
  }
  return total;
}

function applyFlow(
  world: World,
  dayIndex: DayIndex,
  source: World["popBlocks"][number],
  destination: World["popBlocks"][number],
  people: number,
  flows: MigrationFlow[],
  inflowByRegion: Map<Id, number>,
): void {
  const sourcePopulationBefore = populationTotal(source);
  const destinationPopulationBefore = populationTotal(destination);
  if (people <= 0 || people > sourcePopulationBefore) {
    throw new RangeError("migration flow has an invalid people count");
  }
  const sourceAccount = householdAccount(world, source.id);
  const destinationAccount = householdAccount(world, destination.id);
  const transfer = Math.min(
    sourceAccount.balanceRUSD,
    sourcePopulationBefore > 0
      ? (sourceAccount.balanceRUSD * people) / sourcePopulationBefore
      : 0,
  );
  if (transfer < 0) throw new RangeError("migration transfer cannot be negative");
  if (transfer > sourceAccount.balanceRUSD + MONEY_TOLERANCE_RUSD * Math.max(1, sourceAccount.balanceRUSD)) {
    throw new RangeError("migration transfer exceeds the source household's cash");
  }
  const cells = splitMigrantsByCell(source, people, sourcePopulationBefore, world, dayIndex);

  if (transfer > 0) {
    postJournalBatch(world.finance, dayIndex, [
      {
        transactionKind: "migration-transfer",
        lines: [
          { accountId: destinationAccount.id, side: "debit", amountRUSD: transfer },
          { accountId: sourceAccount.id, side: "credit", amountRUSD: transfer },
        ],
        sourceEntityId: source.id,
        targetEntityId: destination.id,
      },
    ]);
  }

  // M9: capture the destination's pre-flow population by age so the migrating
  // cohort's age-specific literacy can be merged with the correct weights.
  const destinationMaleBefore = [...destination.maleByAge];
  const destinationFemaleBefore = [...destination.femaleByAge];

  subtractCells(source, cells.male, cells.female);
  addCells(destination, cells.male, cells.female);

  const destinationPopulationAfter = destinationPopulationBefore + people;
  if (destinationPopulationAfter <= 0) {
    throw new RangeError("migration destination population must stay positive");
  }
  mergeBlockLiteracyByAge(
    destination,
    source,
    destinationMaleBefore,
    destinationFemaleBefore,
    cells.male,
    cells.female,
  );
  const weight = (value: number, base: number): number =>
    (value * destinationPopulationBefore + base * people) / destinationPopulationAfter;
  destination.wealthLevel = roundTo(
    Math.max(0, Math.min(99, weight(destination.wealthLevel, source.wealthLevel))),
    WEALTH_DECIMAL_PLACES,
  );
  destination.militancy = roundTo(
    Math.max(0, Math.min(1, weight(destination.militancy, source.militancy))),
    RATE_DECIMAL_PLACES,
  );
  // E5: migrants carry their vocational qualification; merge by population weight.
  destination.qualification = roundTo(
    Math.max(0, Math.min(1, weight(destination.qualification, source.qualification))),
    RATE_DECIMAL_PLACES,
  );

  const sourceAfter = populationTotal(source);
  const destinationAfter = populationTotal(destination);
  if (sourceAfter !== sourcePopulationBefore - people) {
    throw new RangeError("migration did not conserve the source population");
  }
  if (destinationAfter !== destinationPopulationBefore + people) {
    throw new RangeError("migration did not conserve the destination population");
  }

  inflowByRegion.set(
    destination.regionId,
    (inflowByRegion.get(destination.regionId) ?? 0) + people,
  );
  flows.push({
    sourcePopBlockId: source.id,
    destinationPopBlockId: destination.id,
    sourceRegionId: source.regionId,
    destinationRegionId: destination.regionId,
    professionId: source.professionId,
    people,
    financialTransferRUSD: transfer,
  });
}

/**
 * Exported for tests of the month-start cadence without running a tick.
 */
export function migrationIsDue(world: World, dayIndex: DayIndex): boolean {
  return (
    dayIndex !== world.startDayIndex &&
    !isTerminalDayIndex(dayIndex) &&
    isFirstDayOfMonth(dayIndex)
  );
}
