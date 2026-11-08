/**
 * E3 public construction (D-074).
 *
 * Public projects are state-owned productive buildings. Construction consumes
 * actual idle labor, money, and time; materials are not consumed because the
 * current model has no construction bill-of-materials or government procurement
 * demand (GDD §17A.16 explicitly permits the money+labour+time subset).
 *
 * Every construction day:
 * 1. live projects are processed in ascending id order;
 * 2. each project hires only eligible workers who are not assigned to production
 *    jobs (and not claimed by an earlier project that day), up to its definition's
 *    authored crew cap and the treasury cash actually available;
 * 3. gross construction wages are paid to the workers' household blocks and
 *    capitalized into the country's `construction-in-progress` asset; the existing
 *    daily income tax is withheld on those wages;
 * 4. when cumulative gross payroll reaches the authorized cost, the project
 *    completes: a state-owned building and its accounts are created, the
 *    work-in-progress is reclassified to `public-capital`, and a working-capital
 *    endowment (30 days of upkeep, limited by cash) is transferred to the building.
 * 5. cancelled projects write their spent work-in-progress off to country equity.
 *
 * The phase operates on a shallow staged world (finance, projects, buildings, and
 * provinces are copies) and publishes only after complete validation. All postings
 * are balanced and cash-neutral; no construction flow creates cash or expense.
 */

import { provinceLandHa } from "./agriculture.js";
import {
  assertValidDayIndex,
  dayIndexToCivilDate,
  daysInYear,
  isTerminalDayIndex,
} from "../calendar.js";
import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";
import type { Day, DayIndex, Id } from "../types.js";
import {
  assertValidWorld,
  assertValidWorldForTick,
  type PhaseValidationOptions,
  type World,
} from "../world.js";
import { postJournalBatch, type JournalEntryInput } from "./accounting.js";
import {
  assertAccountingIdentity,
  buildFinanceIndex,
  categoryForSubtype,
  cloneFinanceState,
  phaseFinance,
  designatedCashTotal,
} from "./accounts.js";
import { accumulateBudgetMemo } from "./budget.js";
import {
  MAX_ACTIVE_CONSTRUCTION_PROJECTS,
  MAX_CONSTRUCTION_HISTORY_AGGREGATES,
  MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS,
} from "./constants.js";
import {
  constructionCanProgress,
  constructionDailyWage,
  constructionIdleWorkersByBlock,
  constructionMaterialRemaining,
  constructionMaterialsProgress,
  constructionMaterialsReady,
  constructionProjectIsTerminal,
  constructionProjectRemaining,
  constructionWorkingCapital,
} from "./constructionModel.js";
import { assertValidEconomyDefinitions } from "./definitions.js";
import { constructionProgressFactor } from "./politics.js";
import { hasResearchedTechnology } from "./technology.js";
import { depositForNewBuilding, hydroCapacityPerDay } from "./resources.js";
import { canonicalizeStockLots } from "./inventory.js";
import type { MarketSettlementResult } from "./settlement.js";
import { assertValidFinanceState } from "./validation.js";
import type {
  BuildingDef,
  BuildingInstance,
  ConstructionProject,
  ConstructionState,
  EconomyDefinitions,
  FinanceState,
  FinancialAccount,
  Market,
} from "./types.js";
import { buildProvinceOwnerMap, countryProvinceIds } from "./country.js";

/**
 * MONEY_TOLERANCE_RUSD scaled by the largest magnitude, at least 1. Fixed arity (D-139): the
 * former rest parameter allocated an array on every call; a missing value is 0,
 * which never raises the scale above 1, so the result is unchanged.
 */
function toleranceMoney(a: number, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0): number {
  return (
    MONEY_TOLERANCE_RUSD *
    Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), Math.abs(g), Math.abs(h))
  );
}

/** One project's result for a processed day. */
export interface ConstructionProjectResult {
  readonly projectId: Id;
  readonly countryId: Id;
  readonly status: ConstructionProject["status"];
  readonly workersHired: number;
  readonly spentRUSD: number;
  readonly materialsSpentRUSD: number;
  readonly totalCostRUSD: number;
  readonly progress: number;
  readonly materialsProgress: number;
  readonly blockedReason: "labor" | "funds" | "materials" | null;
  readonly buildingId: Id | null;
}

/** Transient result of one construction phase. */
export interface ConstructionPhaseResult {
  readonly ran: boolean;
  readonly dayIndex: DayIndex;
  readonly projects: readonly ConstructionProjectResult[];
  readonly completedProjectIds: readonly Id[];
  readonly spentRUSD: number;
  readonly materialsSpentRUSD: number;
  readonly postingIds: readonly number[];
}

function emptyResult(dayIndex: DayIndex): ConstructionPhaseResult {
  return {
    ran: false,
    dayIndex,
    projects: [],
    completedProjectIds: [],
    spentRUSD: 0,
    materialsSpentRUSD: 0,
    postingIds: [],
  };
}

function cloneConstructionState(state: ConstructionState): ConstructionState {
  return {
    projects: state.projects.map((project) => ({
      ...project,
      materials: project.materials.map((material) => ({ ...material })),
    })),
    history: state.history.map((aggregate) => ({ ...aggregate })),
    nextProjectId: state.nextProjectId,
    nextBuildingId: state.nextBuildingId,
  };
}

function allocateAccount(
  finance: FinanceState,
  ownerKind: "popBlock" | "building" | "country" | "system",
  ownerId: Id | null,
  subtype: FinancialAccount["subtype"],
): FinancialAccount {
  const id = finance.nextAccountId;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new RangeError("finance.nextAccountId is invalid");
  }
  finance.nextAccountId = id + 1;
  const account: FinancialAccount = {
    id,
    ownerKind,
    ownerId,
    category: categoryForSubtype(subtype),
    subtype,
    balanceRUSD: 0,
  };
  finance.accounts.push(account);
  return account;
}

function provinceOwner(world: World, provinceId: Id): Id | null {
  return buildProvinceOwnerMap(world).get(provinceId) ?? null;
}

function projectMarket(world: World, project: ConstructionProject): Market {
  const province = world.provinceEconomies.find((candidate) => candidate.id === project.provinceId);
  if (province === undefined) {
    throw new RangeError(`construction project province ${String(project.provinceId)} is missing`);
  }
  if (province.marketId === null) {
    throw new RangeError(`construction project province ${String(province.id)} has no market`);
  }
  const market = world.markets.find((candidate) => candidate.id === province.marketId);
  if (market === undefined) {
    throw new RangeError(`construction project market ${String(province.marketId)} is missing`);
  }
  return market;
}

/**
 * Buy missing project materials from actual market stock and immediately deliver
 * them to the project. Each purchase is a real seller sale: the seller's market
 * lot shrinks, the seller receives operating cash and sales revenue, and the
 * country capitalizes the purchase into work-in-progress. A shortage leaves the
 * requirement unfilled and the project waits; an order is never counted as stock.
 *
 * Market lots are consumed in canonical (goodId, sellerBuildingId) order. The
 * delivered counters cap every purchase, so retrying a day or replaying the phase
 * cannot duplicate a delivery or consumption.
 */
function procureProjectMaterials(
  world: World,
  project: ConstructionProject,
  market: Market,
  index: ReturnType<typeof buildFinanceIndex>,
  cash: number,
  entries: JournalEntryInput[],
): {
  readonly cash: number;
  readonly spentRUSD: number;
  readonly blockedReason: "funds" | "materials" | null;
} {
  const materials = [...project.materials].sort((left, right) => left.goodId - right.goodId);
  let remainingCash = cash;
  let spentRUSD = 0;
  let blockedReason: "funds" | "materials" | null = null;
  const countryTreasury = index.get("country", project.countryId, "treasury-cash");
  const wip = index.get("country", project.countryId, "construction-in-progress");
  for (const material of materials) {
    let remaining = constructionMaterialRemaining(material);
    if (!(remaining > toleranceMoney(remaining))) continue;
    const price = market.priceRUSD[material.goodId];
    if (price === undefined || !Number.isFinite(price) || !(price > 0)) {
      throw new RangeError(
        `market ${String(market.id)} has no positive price for construction material ${String(material.goodId)}`,
      );
    }
    let progressed = true;
    while (remaining > toleranceMoney(remaining) && progressed) {
      progressed = false;
      const lots = market.stockLots
        .filter((lot) => lot.goodId === material.goodId && lot.quantity > toleranceMoney(lot.quantity))
        .sort((left, right) => left.ownerBuildingId - right.ownerBuildingId);
      if (lots.length === 0) {
        blockedReason = "materials";
        break;
      }
      for (const lot of lots) {
        if (remaining <= toleranceMoney(remaining)) break;
        if (remainingCash <= toleranceMoney(remainingCash)) {
          blockedReason = "funds";
          break;
        }
        const affordable = remainingCash / price;
        const quantity = Math.min(remaining, lot.quantity, affordable);
        if (!(quantity > toleranceMoney(quantity))) {
          blockedReason = remainingCash < price ? "funds" : "materials";
          break;
        }
        const cost = quantity * price;
        if (cost > remainingCash + toleranceMoney(cost, remainingCash)) {
          blockedReason = "funds";
          break;
        }
        const seller = world.buildings.find((building) => building.id === lot.ownerBuildingId);
        if (seller === undefined) {
          throw new RangeError(
            `market lot ${String(material.goodId)} references unknown seller building ${String(lot.ownerBuildingId)}`,
          );
        }
        const sellerCash = index.get("building", seller.id, "operating-cash");
        const sellerRevenue = index.get("building", seller.id, "sales-revenue");
        lot.quantity -= quantity;
        if (lot.quantity <= toleranceMoney(lot.quantity)) {
          market.stockLots = market.stockLots.filter((candidate) => candidate !== lot);
        }
        material.deliveredQuantity = Math.min(
          material.requiredQuantity,
          material.deliveredQuantity + quantity,
        );
        remaining = constructionMaterialRemaining(material);
        remainingCash -= cost;
        spentRUSD += cost;
        entries.push({
          transactionKind: "construction-material-purchase",
          lines: [
            { accountId: wip.id, side: "debit", amountRUSD: cost },
            { accountId: countryTreasury.id, side: "credit", amountRUSD: cost },
            { accountId: sellerCash.id, side: "debit", amountRUSD: cost },
            { accountId: sellerRevenue.id, side: "credit", amountRUSD: cost },
          ],
          sourceEntityId: project.countryId,
          targetEntityId: seller.id,
        });
        progressed = true;
        if (blockedReason !== null) break;
      }
      if (blockedReason !== null) break;
    }
    if (blockedReason !== null) break;
  }
  market.stockLots = canonicalizeStockLots(market.stockLots);
  return { cash: remainingCash, spentRUSD, blockedReason };
}

/**
 * P2b technique of a newly completed building (D-135): the level-weighted mean
 * technique of the country's existing buildings of the same definition, else of all
 * its buildings, else 1. A new plant uses the methods already practised in the
 * country; it neither jumps to another country's technique nor falls to the
 * reference. Provisional until P10 makes technique an investment choice.
 */
export function inheritedTechnique(world: World, countryId: Id, definitionId: Id): number {
  let sameWeight = 0;
  let sameSum = 0;
  let allWeight = 0;
  let allSum = 0;
  for (const building of world.buildings) {
    if (provinceOwner(world, building.provinceId) !== countryId) continue;
    allWeight += building.level;
    allSum += building.level * building.technique;
    if (building.definitionId === definitionId) {
      sameWeight += building.level;
      sameSum += building.level * building.technique;
    }
  }
  if (sameWeight > 0) return sameSum / sameWeight;
  if (allWeight > 0) return allSum / allWeight;
  return 1;
}

function createCompletedBuilding(
  world: World,
  definitionId: Id,
  provinceId: Id,
  countryId: Id,
  dayIndex: Day,
  depositId: Id | null,
): { building: BuildingInstance; operatingCashAccountId: Id; equityAccountId: Id } {
  const finance = world.finance;
  const country = world.countries.find((candidate) => candidate.id === countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(countryId)}`);
  const province = world.provinceEconomies.find((candidate) => candidate.id === provinceId);
  if (province === undefined) throw new RangeError(`unknown province ${String(provinceId)}`);
  if (provinceOwner(world, provinceId) !== countryId) {
    throw new RangeError(`province ${String(provinceId)} is not owned by country ${String(countryId)}`);
  }
  const buildingId = world.construction.nextBuildingId;
  if (!Number.isSafeInteger(buildingId) || buildingId < 1) {
    throw new RangeError("world.construction.nextBuildingId is invalid");
  }
  if (world.buildings.some((building) => building.id === buildingId)) {
    throw new RangeError(`completed building id ${String(buildingId)} already exists`);
  }
  const operatingCash = allocateAccount(finance, "building", buildingId, "operating-cash");
  const equity = allocateAccount(finance, "building", buildingId, "owner-equity");
  allocateAccount(finance, "building", buildingId, "sales-revenue");
  allocateAccount(finance, "building", buildingId, "input-expense");
  allocateAccount(finance, "building", buildingId, "wage-expense");
  allocateAccount(finance, "building", buildingId, "upkeep-expense");
  allocateAccount(finance, "building", buildingId, "business-tax-expense");
  allocateAccount(finance, "building", buildingId, "subsidy-revenue");
  if (world.trade.enabled) {
    // E6a: a completed asset may ship goods and pay import duty like any enterprise.
    allocateAccount(finance, "building", buildingId, "freight-expense");
    allocateAccount(finance, "building", buildingId, "customs-duty-expense");
  }
  if (world.profitDistribution.enabled) {
    allocateAccount(finance, "building", buildingId, "retained-profit");
  }
  const building: BuildingInstance = {
    id: buildingId,
    definitionId,
    provinceId,
    level: 1,
    condition: 1,
    ownerKind: "state",
    ownerAccountId: country.treasuryAccountId,
    builtOnDay: dayIndex,
    operational: true,
    operatingCashAccountId: operatingCash.id,
    technique: inheritedTechnique(world, countryId, definitionId),
    depositId,
  };
  world.buildings.push(building);
  world.buildings.sort((left, right) => left.id - right.id);
  province.buildingInstanceIds.push(buildingId);
  province.buildingInstanceIds.sort((left, right) => left - right);
  world.construction.nextBuildingId = buildingId + 1;
  world.employmentDirty = true;
  finance.accounts.sort((left, right) => left.id - right.id);
  return { building, operatingCashAccountId: operatingCash.id, equityAccountId: equity.id };
}

function mergeConstructionHistory(
  state: ConstructionState,
  project: ConstructionProject,
): void {
  const existing = state.history.find((entry) => entry.countryId === project.countryId);
  const addCompleted = project.status === "completed" ? 1 : 0;
  const addCancelled = project.status === "cancelled" ? 1 : 0;
  if (existing === undefined) {
    state.history.push({
      countryId: project.countryId,
      projectsCompleted: addCompleted,
      projectsCancelled: addCancelled,
      totalSpentRUSD: project.spentRUSD + project.materialsSpentRUSD,
      totalWrittenOffRUSD:
        project.status === "cancelled"
          ? project.spentRUSD + project.materialsSpentRUSD
          : 0,
    });
  } else {
    const index = state.history.findIndex((entry) => entry.countryId === project.countryId);
    state.history[index] = {
      ...existing,
      projectsCompleted: existing.projectsCompleted + addCompleted,
      projectsCancelled: existing.projectsCancelled + addCancelled,
      totalSpentRUSD:
        existing.totalSpentRUSD + project.spentRUSD + project.materialsSpentRUSD,
      totalWrittenOffRUSD:
        existing.totalWrittenOffRUSD +
        (project.status === "cancelled"
          ? project.spentRUSD + project.materialsSpentRUSD
          : 0),
    };
  }
  state.history.sort((left, right) => left.countryId - right.countryId);
  if (state.history.length > MAX_CONSTRUCTION_HISTORY_AGGREGATES) {
    throw new RangeError(
      `construction history exceeds ${String(MAX_CONSTRUCTION_HISTORY_AGGREGATES)} aggregates`,
    );
  }
}

/** Retain active projects and only the newest bounded terminated records. */
function compactConstructionProjects(state: ConstructionState): void {
  const terminated = state.projects
    .filter((project) => constructionProjectIsTerminal(project.status))
    .sort((left, right) => left.id - right.id);
  if (terminated.length <= MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS) return;
  const remove = new Set(
    terminated
      .slice(0, terminated.length - MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS)
      .map((project) => project.id),
  );
  for (const project of terminated) {
    if (remove.has(project.id)) mergeConstructionHistory(state, project);
  }
  state.projects = state.projects.filter((project) => !remove.has(project.id));
}

/**
 * Run the construction phase on a staged world copy. Exported for direct tests
 * and `runEconomicDay`; not re-exported as an app/UI operation.
 */
export function runConstructionPhase(
  world: World,
  definitions: EconomyDefinitions,
  dayIndex: DayIndex,
  settlement?: MarketSettlementResult,
  options: PhaseValidationOptions = {},
): ConstructionPhaseResult {
  assertValidDayIndex(dayIndex);
  if (isTerminalDayIndex(dayIndex)) {
    throw new RangeError("the terminal 2000-01-01 boundary cannot run construction");
  }
  if (world.dayIndex !== dayIndex) {
    throw new RangeError(
      `construction phase day ${String(dayIndex)} does not match world.dayIndex ${String(world.dayIndex)}`,
    );
  }
  if (
    definitions.dataVersion !== world.dataVersion ||
    definitions.scenarioId !== world.scenarioId
  ) {
    throw new RangeError("construction definitions do not match the world data/scenario identity");
  }
  // Staged mode: the integrated day validated the definitions once at its start.
  if (options.validateWorld !== false) assertValidEconomyDefinitions(definitions);
  if (settlement !== undefined) {
    if (settlement.dayIndex !== dayIndex) {
      throw new RangeError("construction settlement day does not match the processed day");
    }
    if (settlement.worldSeed !== world.seed) {
      throw new RangeError("construction settlement does not belong to this world");
    }
  }
  if (world.construction.projects.length === 0) return emptyResult(dayIndex);
  if (options.validateWorld !== false) assertValidWorldForTick(world);

  // Opening designated cash before any posting (D-137, see `phaseFinance`).
  const openingCash = designatedCashTotal(world.finance);
  const stagedFinance = phaseFinance(world.finance, options.financeInPlace);
  const stagedConstruction = cloneConstructionState(world.construction);
  const stagedBuildings = world.buildings.map((building) => ({ ...building }));
  const stagedProvinces = world.provinceEconomies.map((province) => ({
    ...province,
    buildingInstanceIds: [...province.buildingInstanceIds],
  }));
  // Material procurement is a physical market-stock mutation. Stage the markets
  // too, so a failed construction phase cannot consume another project's goods.
  const stagedMarkets = world.markets.map((market) => ({
    ...market,
    priceRUSD: [...market.priceRUSD],
    stockLots: market.stockLots.map((lot) => ({ ...lot })),
  }));
  const staged: World = {
    ...world,
    finance: stagedFinance,
    construction: stagedConstruction,
    buildings: stagedBuildings,
    provinceEconomies: stagedProvinces,
    markets: stagedMarkets,
  };
  const index = buildFinanceIndex(stagedFinance);
  const yearDays = daysInYear(dayIndexToCivilDate(dayIndex).year);
  const wagesByBlock = new Map<Id, number>();
  if (settlement !== undefined) {
    for (const household of settlement.households) {
      wagesByBlock.set(household.popBlockId, household.wagesReceivedRUSD);
    }
  }
  const idleCache = new Map<Id, Map<Id, number>>();
  const claimed = new Map<Id, number>();
  const cashByCountry = new Map<Id, number>();
  const entries: JournalEntryInput[] = [];
  const results: ConstructionProjectResult[] = [];
  const completions: ConstructionProject[] = [];
  let totalSpent = 0;
  let totalMaterialsSpent = 0;

  for (const project of [...stagedConstruction.projects].sort((left, right) => left.id - right.id)) {
    if (!constructionCanProgress(project, dayIndex)) continue;
    const definition = definitions.buildings.find((entry) => entry.id === project.definitionId);
    if (definition === undefined) {
      throw new RangeError(
        `construction project ${String(project.id)} references unknown definition ${String(project.definitionId)}`,
      );
    }
    if (!definition.ownershipAllowed.includes("state")) {
      throw new RangeError(
        `construction project ${String(project.id)} definition does not permit state ownership`,
      );
    }
    const country = staged.countries.find((entry) => entry.id === project.countryId);
    if (country === undefined) {
      throw new RangeError(
        `construction project ${String(project.id)} references unknown country`,
      );
    }
    if (provinceOwner(staged, project.provinceId) !== country.id) {
      throw new RangeError(
        `construction project ${String(project.id)} province is not owned by its country`,
      );
    }
    const treasury = index.get("country", country.id, "treasury-cash");
    if (!cashByCountry.has(country.id)) {
      cashByCountry.set(country.id, treasury.balanceRUSD);
    }
    let cash = cashByCountry.get(country.id) ?? 0;
    const market = projectMarket(staged, project);
    if (!constructionMaterialsReady(project)) {
      const procurement = procureProjectMaterials(
        staged,
        project,
        market,
        index,
        cash,
        entries,
      );
      cash = procurement.cash;
      totalMaterialsSpent += procurement.spentRUSD;
      project.materialsSpentRUSD += procurement.spentRUSD;
      if (procurement.spentRUSD > 0) {
        accumulateBudgetMemo(stagedFinance, country.id, {
          constructionSpentRUSD: procurement.spentRUSD,
          constructionMaterialsSpentRUSD: procurement.spentRUSD,
        });
      }
      if (!constructionMaterialsReady(project)) {
        cashByCountry.set(country.id, cash);
        project.status = "waiting";
        project.lastWorkers = 0;
        project.blockedReason = procurement.blockedReason ?? "materials";
        results.push({
          projectId: project.id,
          countryId: project.countryId,
          status: project.status,
          workersHired: 0,
          spentRUSD: project.spentRUSD,
          materialsSpentRUSD: project.materialsSpentRUSD,
          totalCostRUSD: project.totalCostRUSD,
          progress:
            project.totalCostRUSD > 0 ? project.spentRUSD / project.totalCostRUSD : 1,
          materialsProgress: constructionMaterialsProgress(project),
          blockedReason: project.blockedReason,
          buildingId: project.buildingId,
        });
        continue;
      }
    }
    const remaining = constructionProjectRemaining(project);
    if (!(remaining > toleranceMoney(remaining, project.totalCostRUSD))) {
      completions.push(project);
      continue;
    }
    let idle = idleCache.get(country.id);
    if (idle === undefined) {
      idle = constructionIdleWorkersByBlock(staged, definitions, country.id);
      idleCache.set(country.id, idle);
    }
    const professionById = new Map(
      definitions.professions.map((profession) => [profession.id, profession]),
    );
    const ownedProvinces = new Set(countryProvinceIds(staged, country.id));
    const blocks = [...staged.popBlocks]
      .filter((block) => ownedProvinces.has(block.provinceId))
      .sort((left, right) => left.id - right.id);
    const wagesByProvince = new Map(
      staged.provinceEconomies.map((province) => [province.id, province.wageRUSDPerYearByProfession]),
    );
    const groupGross = new Map<Id, number>();
    const groupWorkers = new Map<Id, number>();
    let hired = 0;
    let gross = 0;
    let blocked: "labor" | "funds" | null = null;
    let minimumWage = Number.POSITIVE_INFINITY;
    const crewCap = Math.max(
      1,
      Math.floor(definition.constructionWorkers * constructionProgressFactor(country)),
    );
    for (const block of blocks) {
      if (hired >= crewCap) break;
      const profession = professionById.get(block.professionId);
      if (profession === undefined) continue;
      const wage = constructionDailyWage(profession, yearDays, wagesByProvince.get(block.provinceId));
      if (!(wage > 0)) continue;
      minimumWage = Math.min(minimumWage, wage);
      const totalIdle = idle.get(block.id) ?? 0;
      const alreadyClaimed = claimed.get(block.id) ?? 0;
      const available = Math.max(0, totalIdle - alreadyClaimed);
      const blockHired = Math.min(
        available,
        crewCap - hired,
        Math.ceil(remaining / wage) + 1,
      );
      for (let indexInBlock = 0; indexInBlock < blockHired; indexInBlock += 1) {
        const left = remaining - gross;
        if (left <= toleranceMoney(left, remaining)) break;
        const pay = Math.min(wage, left);
        if (pay > cash + toleranceMoney(pay, cash)) {
          blocked = "funds";
          break;
        }
        gross += pay;
        cash -= pay;
        hired += 1;
        claimed.set(block.id, (claimed.get(block.id) ?? 0) + 1);
        groupGross.set(block.id, (groupGross.get(block.id) ?? 0) + pay);
        groupWorkers.set(block.id, (groupWorkers.get(block.id) ?? 0) + 1);
        if (pay < wage - toleranceMoney(pay, wage)) break;
        if (gross >= remaining - toleranceMoney(gross, remaining)) break;
      }
      if (blocked !== null) break;
      if (gross >= remaining - toleranceMoney(gross, remaining)) break;
    }
    let taxTotal = 0;
    if (gross > 0) {
      const wageLines = [];
      for (const [popBlockId, amount] of [...groupGross.entries()].sort(
        (left, right) => left[0] - right[0],
      )) {
        const blockCash = index.get("popBlock", popBlockId, "household-cash");
        const wageIncome = index.get("popBlock", popBlockId, "wage-income");
        wageLines.push({ accountId: blockCash.id, side: "debit" as const, amountRUSD: amount });
        wageLines.push({ accountId: wageIncome.id, side: "credit" as const, amountRUSD: amount });
      }
      wageLines.push({
        accountId: index.get("country", country.id, "construction-in-progress").id,
        side: "debit" as const,
        amountRUSD: gross,
      });
      wageLines.push({
        accountId: treasury.id,
        side: "credit" as const,
        amountRUSD: gross,
      });
      entries.push({
        transactionKind: "construction-wage",
        lines: wageLines,
        sourceEntityId: country.id,
        targetEntityId: null,
      });
      const dailyAllowance = country.fiscal.incomeTaxAllowanceRUSDPerYear / yearDays;
      const taxLines = [];
      for (const [popBlockId, amount] of [...groupGross.entries()].sort(
        (left, right) => left[0] - right[0],
      )) {
        const marketWage = wagesByBlock.get(popBlockId) ?? 0;
        const remainingAllowance = Math.max(0, dailyAllowance - marketWage);
        const taxable = Math.max(0, amount - remainingAllowance);
        const tax = country.fiscal.incomeTaxRate * taxable;
        if (!(tax > toleranceMoney(tax))) continue;
        taxLines.push({
          accountId: index.get("popBlock", popBlockId, "income-tax-expense").id,
          side: "debit" as const,
          amountRUSD: tax,
        });
        taxLines.push({
          accountId: index.get("popBlock", popBlockId, "household-cash").id,
          side: "credit" as const,
          amountRUSD: tax,
        });
        taxTotal += tax;
      }
      if (taxTotal > 0) {
        taxLines.push({
          accountId: treasury.id,
          side: "debit" as const,
          amountRUSD: taxTotal,
        });
        taxLines.push({
          accountId: index.get("country", country.id, "income-tax-revenue").id,
          side: "credit" as const,
          amountRUSD: taxTotal,
        });
        entries.push({
          transactionKind: "income-tax",
          lines: taxLines,
          sourceEntityId: country.id,
          targetEntityId: null,
        });
      }
      cash += taxTotal;
      totalSpent += gross;
      accumulateBudgetMemo(stagedFinance, country.id, {
        constructionSpentRUSD: gross,
      });
    }
    cashByCountry.set(country.id, cash);
    project.spentRUSD += gross;
    if (project.spentRUSD >= project.totalCostRUSD - toleranceMoney(project.spentRUSD)) {
      project.spentRUSD = project.totalCostRUSD;
      completions.push(project);
      project.status = "active";
      project.lastWorkers = hired;
      project.blockedReason = null;
      if (project.startedDay === null) project.startedDay = dayIndex;
    } else if (hired > 0) {
      project.status = "active";
      project.lastWorkers = hired;
      project.blockedReason = null;
      if (project.startedDay === null) project.startedDay = dayIndex;
    } else {
      project.status = "waiting";
      project.lastWorkers = 0;
      project.blockedReason =
        Number.isFinite(minimumWage) && cash + toleranceMoney(cash) < minimumWage
          ? "funds"
          : "labor";
    }
    results.push({
      projectId: project.id,
      countryId: project.countryId,
      status: project.status,
      workersHired: hired,
      spentRUSD: project.spentRUSD,
      materialsSpentRUSD: project.materialsSpentRUSD,
      totalCostRUSD: project.totalCostRUSD,
      progress:
        project.totalCostRUSD > 0 ? project.spentRUSD / project.totalCostRUSD : 1,
      materialsProgress: constructionMaterialsProgress(project),
      blockedReason: project.blockedReason,
      buildingId: project.buildingId,
    });
  }

  const wagePostings = postJournalBatch(stagedFinance, dayIndex, entries);

  const completionEntries: JournalEntryInput[] = [];
  const completionCash = new Map<Id, number>();
  for (const project of completions) {
    if (constructionProjectIsTerminal(project.status)) continue;
    if (project.spentRUSD < project.totalCostRUSD - toleranceMoney(project.spentRUSD)) {
      continue;
    }
    if (!constructionMaterialsReady(project)) continue;
    const country = staged.countries.find((entry) => entry.id === project.countryId);
    if (country === undefined) throw new RangeError("missing completion country");
    const definition = definitions.buildings.find((entry) => entry.id === project.definitionId);
    // P5b: an extraction building works the province's richest discovered deposit of
    // its kind at completion; without one it cannot be completed.
    let depositId: Id | null = null;
    if (definition?.extracts !== undefined) {
      depositId = depositForNewBuilding(staged, definition.extracts, project.provinceId);
      if (depositId === null) continue;
    }
    const created = createCompletedBuilding(
      staged,
      project.definitionId,
      project.provinceId,
      project.countryId,
      dayIndex,
      depositId,
    );
    const treasury = index.get("country", country.id, "treasury-cash");
    const wip = index.get("country", country.id, "construction-in-progress");
    const publicCapital = index.get("country", country.id, "public-capital");
    let capitalized = project.spentRUSD + project.materialsSpentRUSD;
    // D-127: the work-in-progress balance and the project's running totals add the
    // same amounts in a different order. When no other project of the country carries
    // work in progress, the account balance is this project's alone, so it is
    // capitalized exactly (after checking it agrees within the money tolerance) and no
    // floating residue is left behind.
    const othersInProgress = staged.construction.projects.some(
      (other) =>
        other.id !== project.id &&
        other.countryId === project.countryId &&
        !constructionProjectIsTerminal(other.status) &&
        other.spentRUSD + other.materialsSpentRUSD > 0,
    );
    if (
      !othersInProgress &&
      wip.balanceRUSD > 0 &&
      Math.abs(wip.balanceRUSD - capitalized) <= toleranceMoney(wip.balanceRUSD, capitalized)
    ) {
      capitalized = wip.balanceRUSD;
    }
    if (capitalized > 0) {
      completionEntries.push({
        transactionKind: "construction-capitalization",
        lines: [
          {
            accountId: wip.id,
            side: "credit" as const,
            amountRUSD: capitalized,
          },
          {
            accountId: publicCapital.id,
            side: "debit" as const,
            amountRUSD: capitalized,
          },
        ],
        sourceEntityId: country.id,
        targetEntityId: created.building.id,
      });
    }
    if (!completionCash.has(country.id)) {
      completionCash.set(country.id, Math.max(0, treasury.balanceRUSD));
    }
    const available = completionCash.get(country.id) ?? 0;
    const paid = Math.min(project.workingCapitalRUSD, available);
    if (paid > 0) {
      completionEntries.push({
        transactionKind: "construction-working-capital",
        lines: [
          {
            accountId: treasury.id,
            side: "credit" as const,
            amountRUSD: paid,
          },
          {
            accountId: created.operatingCashAccountId,
            side: "debit" as const,
            amountRUSD: paid,
          },
          {
            accountId: index.get("country", country.id, "owner-equity").id,
            side: "debit" as const,
            amountRUSD: paid,
          },
          {
            accountId: created.equityAccountId,
            side: "credit" as const,
            amountRUSD: paid,
          },
        ],
        sourceEntityId: country.id,
        targetEntityId: created.building.id,
      });
      completionCash.set(country.id, available - paid);
    }
    project.workingCapitalPaidRUSD = paid;
    project.status = "completed";
    project.completedDay = dayIndex;
    project.buildingId = created.building.id;
    project.blockedReason = null;
    const completedResult: ConstructionProjectResult = {
      projectId: project.id,
      countryId: project.countryId,
      status: project.status,
      workersHired: project.lastWorkers,
      spentRUSD: project.spentRUSD,
      materialsSpentRUSD: project.materialsSpentRUSD,
      totalCostRUSD: project.totalCostRUSD,
      progress: 1,
      materialsProgress: 1,
      blockedReason: null,
      buildingId: project.buildingId,
    };
    const existingIndex = results.findIndex((entry) => entry.projectId === project.id);
    if (existingIndex >= 0) results[existingIndex] = completedResult;
    else results.push(completedResult);
  }
  const completionPostings = postJournalBatch(stagedFinance, dayIndex, completionEntries);

  compactConstructionProjects(stagedConstruction);
  assertValidFinanceState(stagedFinance);
  assertAccountingIdentity(stagedFinance);
  const closingCash = designatedCashTotal(stagedFinance);
  if (Math.abs(openingCash - closingCash) > toleranceMoney(openingCash, closingCash)) {
    throw new RangeError("construction phase did not conserve aggregate designated cash");
  }
  if (options.validateWorld !== false) {
    assertValidWorldForTick(staged);
  }

  world.finance = staged.finance;
  world.construction = staged.construction;
  world.buildings = staged.buildings;
  world.provinceEconomies = staged.provinceEconomies;
  world.markets = staged.markets;
  world.employmentDirty = staged.employmentDirty;
  const postingIds = [...wagePostings, ...completionPostings].map((posting) => posting.id);
  return {
    ran: true,
    dayIndex,
    projects: results.sort((left, right) => left.projectId - right.projectId),
    completedProjectIds: completions
      .filter((project) => project.status === "completed")
      .map((project) => project.id)
      .sort((left, right) => left - right),
    spentRUSD: totalSpent,
    materialsSpentRUSD: totalMaterialsSpent,
    postingIds,
  };
}

/** Input for starting a public-construction project. */
export interface ConstructionStartInput {
  readonly countryId: Id;
  readonly provinceId: Id;
  readonly definitionId: Id;
}

/** Structural definition checks shared by validation and application. */
function assertBuildableDefinition(
  definition: EconomyDefinitions["buildings"][number] | undefined,
  definitionId: Id,
): asserts definition is EconomyDefinitions["buildings"][number] {
  if (definition === undefined) {
    throw new RangeError(`unknown construction definition ${String(definitionId)}`);
  }
  if (!definition.ownershipAllowed.includes("state")) {
    throw new RangeError(
      `definition ${String(definitionId)} does not permit state ownership in E3`,
    );
  }
  if (definition.outputs.length === 0) {
    throw new RangeError(`definition ${String(definitionId)} has no productive output`);
  }
  if (!(definition.constructionCostRUSD > 0)) {
    throw new RangeError(`definition ${String(definitionId)} has no construction cost`);
  }
  if (!Number.isInteger(definition.constructionWorkers) || definition.constructionWorkers < 1) {
    throw new RangeError(`definition ${String(definitionId)} has no construction crew`);
  }
  if (definition.resourceRequirements.length > 0) {
    throw new RangeError(
      `definition ${String(definitionId)} requires resource inputs that E3 does not model`,
    );
  }
}

/** P5b (C-12): a hydro definition's output per level-one day at reference throughput. */
function hydroReferenceOutputPerDay(definition: BuildingDef, level = 1, condition = 1): number {
  return (
    definition.referenceThroughputPerDayAtLevelOne *
    level *
    condition *
    (definition.outputs[0]?.quantityPerThroughputUnit ?? 0)
  );
}

/**
 * P5b (C-12): a province's daily hydro capacity less the reference output of the hydro
 * stations in it and of the hydro projects under way there (output units per day). May be
 * negative where stations work at better techniques than the reference.
 */
export function hydroRoomPerDay(world: World, definitions: EconomyDefinitions, provinceId: Id): number {
  const province = world.provinceEconomies.find((entry) => entry.id === provinceId);
  if (province === undefined) throw new RangeError(`unknown province ${String(provinceId)}`);
  let room = hydroCapacityPerDay(province);
  for (const building of world.buildings) {
    if (building.provinceId !== provinceId) continue;
    const definition = definitions.buildings.find((entry) => entry.id === building.definitionId);
    if (definition?.usesHydroPotential !== true) continue;
    room -= hydroReferenceOutputPerDay(definition, building.level, building.condition);
  }
  for (const project of world.construction.projects) {
    if (project.provinceId !== provinceId || constructionProjectIsTerminal(project.status)) continue;
    const definition = definitions.buildings.find((entry) => entry.id === project.definitionId);
    if (definition?.usesHydroPotential !== true) continue;
    room -= hydroReferenceOutputPerDay(definition);
  }
  return room;
}

/** Validate a project start without mutating. */
export function validateConstructionStart(
  world: World,
  definitions: EconomyDefinitions,
  input: ConstructionStartInput,
): void {
  const country = world.countries.find((entry) => entry.id === input.countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(input.countryId)}`);
  const definition = definitions.buildings.find((entry) => entry.id === input.definitionId);
  assertBuildableDefinition(definition, input.definitionId);
  if (
    definition.requiredTechnologyId !== null &&
    !hasResearchedTechnology(country, definition.requiredTechnologyId)
  ) {
    throw new RangeError(
      `definition ${String(definition.id)} requires un-researched technology ${String(definition.requiredTechnologyId)}`,
    );
  }
  const province = world.provinceEconomies.find((entry) => entry.id === input.provinceId);
  if (province === undefined) throw new RangeError(`unknown province ${String(input.provinceId)}`);
  if (provinceOwner(world, province.id) !== country.id) {
    throw new RangeError(`province ${String(province.id)} is not owned by country ${String(country.id)}`);
  }
  if (world.markets.length > 0 && province.marketId === null) {
    throw new RangeError(`province ${String(province.id)} has no market`);
  }
  // P5 (D-143 §1): a farm needs land of its kind in the province.
  if (definition.landUse !== undefined && !(provinceLandHa(province, definition.landUse) > 0)) {
    throw new RangeError(`province ${String(province.id)} has no ${definition.landUse} for this building`);
  }
  // P5b (plan §4.2): an extraction building needs a discovered deposit of its kind.
  if (definition.extracts !== undefined && depositForNewBuilding(world, definition.extracts, province.id) === null) {
    throw new RangeError(`province ${String(province.id)} has no discovered ${definition.extracts} deposit for this building`);
  }
  // P5b (C-8): crop bands — the province must lie within the building's latitude limit.
  if (
    definition.maxAbsLatitudeDeg !== undefined &&
    province.absLatitudeDeg !== null &&
    province.absLatitudeDeg > definition.maxAbsLatitudeDeg
  ) {
    throw new RangeError(`province ${String(province.id)} lies outside this building's latitude band`);
  }
  // P5b (C-12): a hydro station needs room under its province's river flow for one more
  // level-one station at reference output, after the stations already there.
  if (definition.usesHydroPotential === true) {
    const room = hydroRoomPerDay(world, definitions, province.id);
    if (!(room >= hydroReferenceOutputPerDay(definition))) {
      throw new RangeError(`province ${String(province.id)} has no hydro potential left for this building`);
    }
  }
  if (!world.profitDistribution.enabled) {
    throw new RangeError(
      "public construction requires the state-enterprise profit-distribution policy",
    );
  }
  const active = world.construction.projects.filter(
    (project) => !constructionProjectIsTerminal(project.status),
  ).length;
  if (active >= MAX_ACTIVE_CONSTRUCTION_PROJECTS) {
    throw new RangeError(
      `active construction projects would exceed ${String(MAX_ACTIVE_CONSTRUCTION_PROJECTS)}`,
    );
  }
  const index = buildFinanceIndex(world.finance);
  const treasury = index.get("country", country.id, "treasury-cash");
  const required =
    definition.constructionCostRUSD + constructionWorkingCapital(definition);
  if (treasury.balanceRUSD + toleranceMoney(treasury.balanceRUSD, required) < required) {
    throw new RangeError(
      `treasury cash ${String(treasury.balanceRUSD)} does not cover the project cost and working capital ${String(required)}`,
    );
  }
  if (world.construction.nextProjectId < 1 || !Number.isSafeInteger(world.construction.nextProjectId)) {
    throw new RangeError("world.construction.nextProjectId is invalid");
  }
}

/** Start one public-construction project atomically. */
export function startConstruction(
  world: World,
  definitions: EconomyDefinitions,
  input: ConstructionStartInput,
): ConstructionProject {
  validateConstructionStart(world, definitions, input);
  const definition = definitions.buildings.find((entry) => entry.id === input.definitionId);
  if (definition === undefined) throw new RangeError("missing buildable definition");
  const project: ConstructionProject = {
    id: world.construction.nextProjectId,
    countryId: input.countryId,
    provinceId: input.provinceId,
    definitionId: input.definitionId,
    status: "authorized",
    authorizedDay: world.dayIndex,
    startedDay: null,
    completedDay: null,
    cancelledDay: null,
    totalCostRUSD: definition.constructionCostRUSD,
    workingCapitalRUSD: constructionWorkingCapital(definition),
    workingCapitalPaidRUSD: 0,
    spentRUSD: 0,
    materialsSpentRUSD: 0,
    materials: definition.constructionMaterials
      .map((material) => ({
        goodId: material.goodId,
        requiredQuantity: material.quantity,
        deliveredQuantity: 0,
      }))
      .sort((left, right) => left.goodId - right.goodId),
    lastWorkers: 0,
    blockedReason: null,
    buildingId: null,
  };
  const construction: ConstructionState = {
    ...cloneConstructionState(world.construction),
    nextProjectId: world.construction.nextProjectId + 1,
  };
  construction.projects.push(project);
  construction.projects.sort((left, right) => left.id - right.id);
  const candidate: World = { ...world, construction };
  assertValidWorld(candidate);
  world.construction = construction;
  return project;
}

/** Input for cancelling/pausing a project. */
export interface ConstructionProjectInput {
  readonly countryId: Id;
  readonly projectId: Id;
}

function findProject(world: World, countryId: Id, projectId: Id): ConstructionProject {
  const project = world.construction.projects.find((entry) => entry.id === projectId);
  if (project === undefined) throw new RangeError(`unknown construction project ${String(projectId)}`);
  if (project.countryId !== countryId) {
    throw new RangeError(
      `construction project ${String(projectId)} does not belong to country ${String(countryId)}`,
    );
  }
  return project;
}

/** Validate a cancellation without mutating. */
export function validateConstructionCancel(world: World, input: ConstructionProjectInput): void {
  const project = findProject(world, input.countryId, input.projectId);
  if (constructionProjectIsTerminal(project.status)) {
    throw new RangeError(`construction project ${String(project.id)} is already terminal`);
  }
}

/** Cancel one project, writing spent work-in-progress off atomically. */
export function cancelConstruction(
  world: World,
  input: ConstructionProjectInput,
  dayIndex: DayIndex,
): { project: ConstructionProject; postingIds: readonly number[] } {
  validateConstructionCancel(world, input);
  assertValidDayIndex(dayIndex);
  if (world.dayIndex !== dayIndex) {
    throw new RangeError("construction cancellation day must match the world day");
  }
  const project = findProject(world, input.countryId, input.projectId);
  const stagedFinance = cloneFinanceState(world.finance);
  const index = buildFinanceIndex(stagedFinance);
  let postings: { id: number }[] = [];
  const writtenOff = project.spentRUSD + project.materialsSpentRUSD;
  if (writtenOff > toleranceMoney(writtenOff)) {
    const wip = index.get("country", project.countryId, "construction-in-progress");
    const equity = index.get("country", project.countryId, "owner-equity");
    postings = postJournalBatch(stagedFinance, dayIndex, [
      {
        transactionKind: "construction-writeoff",
        lines: [
          { accountId: wip.id, side: "credit", amountRUSD: writtenOff },
          { accountId: equity.id, side: "debit", amountRUSD: writtenOff },
        ],
        sourceEntityId: project.countryId,
        targetEntityId: null,
      },
    ]);
    accumulateBudgetMemo(stagedFinance, project.countryId, {
      constructionWrittenOffRUSD: writtenOff,
    });
  }
  const construction: ConstructionState = cloneConstructionState(world.construction);
  const target = construction.projects.find((entry) => entry.id === project.id);
  if (target === undefined) throw new RangeError("construction project disappeared");
  target.status = "cancelled";
  target.cancelledDay = dayIndex;
  target.blockedReason = null;
  target.lastWorkers = 0;
  compactConstructionProjects(construction);
  const candidate: World = { ...world, finance: stagedFinance, construction };
  assertValidFinanceState(stagedFinance);
  assertAccountingIdentity(stagedFinance);
  assertValidWorld(candidate);
  world.finance = stagedFinance;
  world.construction = construction;
  return { project: { ...target }, postingIds: postings.map((posting) => posting.id) };
}

/** Validate a pause/resume request without mutating. */
export function validateConstructionPause(
  world: World,
  input: ConstructionProjectInput,
  paused: boolean,
): void {
  if (typeof paused !== "boolean") throw new TypeError("construction paused flag must be boolean");
  const project = findProject(world, input.countryId, input.projectId);
  if (constructionProjectIsTerminal(project.status)) {
    throw new RangeError(`construction project ${String(project.id)} is already terminal`);
  }
  if (paused && project.status === "paused") return;
  if (!paused && project.status !== "paused") {
    throw new RangeError(`construction project ${String(project.id)} is not paused`);
  }
}

/** Pause or resume one project atomically. */
export function setConstructionPaused(
  world: World,
  input: ConstructionProjectInput,
  paused: boolean,
): ConstructionProject {
  validateConstructionPause(world, input, paused);
  const construction = cloneConstructionState(world.construction);
  const project = construction.projects.find((entry) => entry.id === input.projectId);
  if (project === undefined) throw new RangeError("construction project disappeared");
  if (paused) {
    project.status = "paused";
    project.blockedReason = null;
    project.lastWorkers = 0;
  } else {
    project.status = project.startedDay === null ? "authorized" : "active";
    project.blockedReason = null;
  }
  const candidate: World = { ...world, construction };
  assertValidWorld(candidate);
  world.construction = construction;
  return { ...project };
}

