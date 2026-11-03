/**
 * D-116 phase-mode integrity checks.
 *
 * `assertDailyWorldInvariants` is the cheap global check run after every
 * phase-mode economic day (whole-world validation runs at month end instead).
 * `worldDayFingerprint` is a cheap digest of conserved totals and allocator
 * counters recorded at the start of a day so a rollback replay can prove it
 * reconstructed the same start-of-day state. Neither function mutates the world.
 */

import { assertAccountingIdentity } from "./economy/accounts.js";
import { fnv1a32Hex } from "./hash.js";
import type { World } from "./world.js";

/**
 * Cheap invariants: accounting identity, finite balances, non-negative finite
 * stock lots and prices, and finite population/wealth state. O(accounts + lots +
 * blocks); no age-cell scan and no cross-reference validation.
 */
export function assertDailyWorldInvariants(world: World): void {
  if (!Number.isInteger(world.dayIndex) || world.dayIndex < 0) {
    throw new RangeError(`invalid dayIndex ${String(world.dayIndex)}`);
  }
  for (const account of world.finance.accounts) {
    if (!Number.isFinite(account.balanceRUSD)) {
      throw new RangeError(`account ${String(account.id)} has a non-finite balance`);
    }
  }
  assertAccountingIdentity(world.finance);
  for (const market of world.markets) {
    for (const price of market.priceRUSD) {
      if (!Number.isFinite(price) || price <= 0) {
        throw new RangeError(`market ${String(market.id)} has an invalid price`);
      }
    }
    for (const lot of market.stockLots) {
      if (!Number.isFinite(lot.quantity) || lot.quantity < 0) {
        throw new RangeError(
          `market ${String(market.id)} has an invalid lot for good ${String(lot.goodId)}`,
        );
      }
    }
  }
  for (const block of world.popBlocks) {
    if (!Number.isFinite(block.wealthLevel) || !Number.isFinite(block.militancy)) {
      throw new RangeError(`popBlock ${String(block.id)} has non-finite state`);
    }
  }
}

/**
 * Cheap start-of-day digest: calendar, entity counts, allocators, total
 * population, designated balances, inventory and price totals. It is a
 * consistency check for replay, not a substitute for `hashWorld`.
 */
export function worldDayFingerprint(world: World): string {
  let population = 0;
  for (const block of world.popBlocks) {
    for (const value of block.maleByAge) population += value;
    for (const value of block.femaleByAge) population += value;
  }
  let balances = 0;
  for (const account of world.finance.accounts) balances += account.balanceRUSD;
  let stock = 0;
  let prices = 0;
  for (const market of world.markets) {
    for (const lot of market.stockLots) stock += lot.quantity;
    for (const price of market.priceRUSD) prices += price;
  }
  const parts = [
    world.dayIndex,
    world.popBlocks.length,
    population,
    world.buildings.length,
    world.employment.length,
    world.finance.accounts.length,
    world.finance.nextPostingId,
    world.finance.nextAccountId,
    world.finance.periodSummaries.length,
    balances,
    stock,
    prices,
    world.trade.shipments.length,
    world.construction.projects.length,
  ];
  return fnv1a32Hex(parts.map((value) => String(value)).join("|"));
}
