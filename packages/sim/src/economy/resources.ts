/**
 * P5 (D-121, D-143 §4): discovery and depletion of natural-resource deposits.
 *
 * Discovery (monthly, first civil day). A hidden deposit is prospectable once the
 * owner of its province knows its required technology (or it needs none). Each
 * month a prospectable deposit is found with probability
 *   RESOURCE_DISCOVERY_MONTHLY_HAZARD × province infrastructure (0..1),
 * decided by one keyed draw `resource.discovery` per (deposit, month): the draw is a
 * pure function of the seed, the deposit id and the day, so replay is exact and one
 * deposit's draw never shifts another's.
 *
 * Depletion. `extractFromDeposit` is the only way stock leaves a deposit: it adds to
 * `extracted`, never beyond the initial stock, and only from a discovered deposit.
 * The remaining stock `initialStock − extracted` is therefore conserved and never
 * negative.
 */

import { dayIndexToCivilDate } from "../calendar.js";
import { drawUnitFloat } from "../rng.js";
import type { DayIndex, Id } from "../types.js";
import type { World } from "../world.js";
import { RESOURCE_DISCOVERY_MONTHLY_HAZARD, RESOURCE_DISCOVERY_PURPOSE } from "./constants.js";
import { buildProvinceOwnerMap } from "./country.js";
import { depositRemaining, type Deposit } from "./resourceState.js";
import { hasResearchedTechnology } from "./technology.js";

export interface DiscoveryRecord {
  readonly depositId: Id;
  readonly provinceId: Id;
  readonly resource: Deposit["resource"];
  readonly countryId: Id;
}

export interface DiscoveryPhaseResult {
  readonly ran: boolean;
  readonly discoveries: readonly DiscoveryRecord[];
}

/** Whether the owner of a deposit's province may find it now. */
export function isProspectable(world: World, deposit: Deposit, ownerId: Id | undefined): boolean {
  if (deposit.discovered || ownerId === undefined) return false;
  if (deposit.requiredTechnologyId === null) return true;
  const owner = world.countries.find((country) => country.id === ownerId);
  return owner !== undefined && hasResearchedTechnology(owner, deposit.requiredTechnologyId);
}

/** Monthly probability that prospecting finds a prospectable deposit in a province. */
export function discoveryProbability(infrastructure: number): number {
  return RESOURCE_DISCOVERY_MONTHLY_HAZARD * Math.min(1, Math.max(0, infrastructure));
}

/**
 * Run the monthly discovery draws on the first civil day of a month; any other day
 * does nothing. Deposits are visited in ascending id order.
 */
export function runDiscoveryPhase(world: World, dayIndex: DayIndex): DiscoveryPhaseResult {
  if (world.resources.deposits.length === 0 || dayIndexToCivilDate(dayIndex).day !== 1) {
    return { ran: false, discoveries: [] };
  }
  const owners = buildProvinceOwnerMap(world);
  const infrastructure = new Map(world.provinceEconomies.map((province) => [province.id, province.infrastructure]));
  const discoveries: DiscoveryRecord[] = [];
  for (const deposit of world.resources.deposits) {
    const ownerId = owners.get(deposit.provinceId);
    if (!isProspectable(world, deposit, ownerId)) continue;
    const probability = discoveryProbability(infrastructure.get(deposit.provinceId) ?? 0);
    if (!(probability > 0)) continue;
    const draw = drawUnitFloat({
      seed: world.seed,
      day: dayIndex,
      entityId: deposit.id,
      purpose: RESOURCE_DISCOVERY_PURPOSE,
      drawIndex: 0,
    });
    if (draw >= probability) continue;
    deposit.discovered = true;
    deposit.discoveredOnDay = dayIndex;
    discoveries.push({
      depositId: deposit.id,
      provinceId: deposit.provinceId,
      resource: deposit.resource,
      countryId: ownerId as Id,
    });
  }
  return { ran: true, discoveries };
}

/**
 * The deposit with `id` in the world's ascending-id deposit list (binary search), or
 * undefined. P5b (D-146 A11): extraction looks deposits up every day.
 */
export function findDeposit(world: World, depositId: Id): Deposit | undefined {
  const deposits = world.resources.deposits;
  let low = 0;
  let high = deposits.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = deposits[middle] as Deposit;
    if (candidate.id === depositId) return candidate;
    if (candidate.id < depositId) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

/**
 * P5b (D-146, plan §4.2): the deposit a new extraction building in `provinceId` works —
 * the discovered deposit of `resource` there with the most remaining stock (lowest id
 * on a tie) — or null when the province has none.
 */
export function depositForNewBuilding(world: World, resource: Deposit["resource"], provinceId: Id): Id | null {
  let best: Deposit | null = null;
  for (const deposit of world.resources.deposits) {
    if (deposit.provinceId !== provinceId || deposit.resource !== resource || !deposit.discovered) continue;
    if (!(depositRemaining(deposit) > 0)) continue;
    if (best === null || depositRemaining(deposit) > depositRemaining(best)) best = deposit;
  }
  return best === null ? null : best.id;
}

/**
 * Take up to `quantity` from a discovered deposit; returns what was taken
 * (min(quantity, remaining)). Rejects unknown or hidden deposits and invalid amounts.
 */
export function extractFromDeposit(world: World, depositId: Id, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity < 0) throw new RangeError("extraction quantity must be a finite non-negative number");
  const deposit = findDeposit(world, depositId);
  if (deposit === undefined) throw new RangeError(`unknown deposit ${String(depositId)}`);
  if (!deposit.discovered) throw new RangeError(`deposit ${String(depositId)} has not been discovered`);
  const taken = Math.min(quantity, depositRemaining(deposit));
  if (taken <= 0) return 0;
  // Exhaustion is exact: the last extraction sets the cumulative to the initial stock.
  deposit.extracted = taken === depositRemaining(deposit) ? deposit.initialStock : deposit.extracted + taken;
  return taken;
}
