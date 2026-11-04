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
  // Indexed loops (D-139): the same order, without iterator allocation.
  const accounts = world.finance.accounts;
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index] as World["finance"]["accounts"][number];
    if (!Number.isFinite(account.balanceRUSD)) {
      throw new RangeError(`account ${String(account.id)} has a non-finite balance`);
    }
  }
  assertAccountingIdentity(world.finance);
  for (const market of world.markets) {
    const priceList = market.priceRUSD;
    for (let index = 0; index < priceList.length; index += 1) {
      const price = priceList[index] as number;
      if (!Number.isFinite(price) || price <= 0) {
        throw new RangeError(`market ${String(market.id)} has an invalid price`);
      }
    }
    const lots = market.stockLots;
    for (let index = 0; index < lots.length; index += 1) {
      const lot = lots[index] as (typeof lots)[number];
      if (!Number.isFinite(lot.quantity) || lot.quantity < 0) {
        throw new RangeError(
          `market ${String(market.id)} has an invalid lot for good ${String(lot.goodId)}`,
        );
      }
    }
  }
  const blocks = world.popBlocks;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] as World["popBlocks"][number];
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
  // Indexed loops (D-139): the same summation order, without iterator allocation.
  let population = 0;
  const blocks = world.popBlocks;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] as World["popBlocks"][number];
    const male = block.maleByAge;
    for (let age = 0; age < male.length; age += 1) population += male[age] as number;
    const female = block.femaleByAge;
    for (let age = 0; age < female.length; age += 1) population += female[age] as number;
  }
  let balances = 0;
  const accounts = world.finance.accounts;
  for (let index = 0; index < accounts.length; index += 1) {
    balances += (accounts[index] as World["finance"]["accounts"][number]).balanceRUSD;
  }
  let stock = 0;
  let prices = 0;
  for (const market of world.markets) {
    const lots = market.stockLots;
    for (let index = 0; index < lots.length; index += 1) stock += (lots[index] as (typeof lots)[number]).quantity;
    const priceList = market.priceRUSD;
    for (let index = 0; index < priceList.length; index += 1) prices += priceList[index] as number;
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
