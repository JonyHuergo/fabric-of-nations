/**
 * D-165 (P7 close, step 2): the rules behind the day-53 failure of the 1900 world.
 *
 * On 22 February 1900 a food plant was left with a lot of 3.5e-10 kg that the market's
 * allocator had already treated as sold out; the next day it sold that dust for 6.2e-13 RUSD
 * and paid it on as wages, one of 2.7e-14 RUSD to a household holding 19,202 RUSD, where
 * rounding absorbed it. That household then paid its servants its whole balance (the limit
 * `cash − today's wages` did not cancel), and the income tax on the vanished wage overdrew
 * the account. These tests pin each rule that now prevents it:
 *
 * 1. one lot rule (`lotRemainder`, `settledRemainder`): a lot something was taken from whose
 *    remainder is within the tolerance of the lot arithmetic is exactly empty; a lot nothing
 *    was taken from is never dropped;
 * 2. a household that employs servants keeps at least today's wages in its cash after paying
 *    them, in the arithmetic the posting batch applies (it is the fiscal phase's tax base);
 * 3. the income tax is checked against the household's cash exactly, as the posting is.
 */
import {
  QUANTITY_TOLERANCE,
  createEconomyWorld,
  listAccounts,
  lotRemainder,
  lotTolerance,
  refreshEmployment,
  settledRemainder,
  settlementHouseholdColumns,
  tick,
  type World,
} from "@century/sim";

import { economyTickContext, setCashBalance } from "../fixtures/m3e.js";
import { M5_REGION_A1 } from "../fixtures/m5.js";
import { P7_CLERK_BLOCK, p7Scenario } from "../fixtures/p7.js";

describe("D-165 lot rule", () => {
  test("a lot taken whole to within the arithmetic's tolerance is exactly empty", () => {
    // The 1900 case: a lot of 312,758.13572888495 units of which households took
    // 312,758.1357288848 (the difference of two cumulative interval ends).
    expect(lotRemainder(312_758.13572888495, 312_758.1357288848, 2_000_000)).toBe(0);
    // The dust lot of 22 February 1900: 3.6e-10 units, 3.6e-12 taken, good total ~1e6.
    expect(lotRemainder(3.601599019020796e-10, 3.637978807091713e-12, 1_000_000)).toBe(0);
    // A negative remainder inside the tolerance is also 0 (callers reject larger ones).
    expect(lotRemainder(100, 100 + 1e-12)).toBe(0);
  });

  test("a real remainder is kept, and a lot nothing was taken from is never dropped", () => {
    expect(lotRemainder(10, 4)).toBe(6);
    expect(lotRemainder(1_000_000, 999_000, 1_000_000)).toBe(1_000);
    // Untouched lots keep their quantity however small (no rounding happened to them).
    expect(lotRemainder(1e-12, 0, 1e9)).toBe(1e-12);
    expect(settledRemainder(1e-12, 1e-12, 0, 1e9)).toBe(1e-12);
  });

  test("the tolerance is QUANTITY_TOLERANCE × the largest magnitude, at least 1", () => {
    expect(lotTolerance(0.5, 0.1)).toBe(QUANTITY_TOLERANCE);
    expect(lotTolerance(10, 2_000, 30)).toBe(QUANTITY_TOLERANCE * 2_000);
    expect(lotTolerance(10, 2, 5_000_000)).toBe(QUANTITY_TOLERANCE * 5_000_000);
    // settledRemainder applies the same bound to a remainder computed elsewhere.
    const remainder = 0.5 * QUANTITY_TOLERANCE * 1_000;
    expect(settledRemainder(remainder, 1_000, 999.9999995)).toBe(0);
    expect(settledRemainder(2 * QUANTITY_TOLERANCE * 1_000, 1_000, 999.999998)).toBe(2 * QUANTITY_TOLERANCE * 1_000);
  });
});

function worldWithServants(cash: number): { world: World; scenario: ReturnType<typeof p7Scenario> } {
  // Three clerk jobs per throughput unit: the employer's wage (3.70 RUSD a day) is small
  // against its cash, as in the 1900 cases, so `cash − wage` is not exact.
  const scenario = p7Scenario({ clerkJobsPerThroughputUnit: 3 });
  scenario.definitions = {
    ...scenario.definitions,
    labourMarket: {
      ...(scenario.definitions.labourMarket ?? { domesticServiceBuildingKeys: [] }),
      domesticServiceShares: [{ provinceId: M5_REGION_A1, share: 0.2 }],
    },
  };
  const world = createEconomyWorld(scenario);
  for (const block of world.popBlocks) if (block.id === P7_CLERK_BLOCK) block.incomeSmoothedRUSDPerCapitaDay = 5;
  const building = world.buildings[0];
  if (building !== undefined) building.level = 1;
  refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
  const account = listAccounts(world.finance.accounts).find(
    (entry) => entry.ownerKind === "popBlock" && entry.ownerId === P7_CLERK_BLOCK && entry.subtype === "household-cash",
  );
  if (account === undefined) throw new Error("the clerk block has no household cash");
  setCashBalance(world, account.id, cash);
  return { world, scenario };
}

describe("D-165 servants are paid from the cash held before today's wages", () => {
  test("an employer short of cash keeps at least today's wages, at every starting balance", () => {
    let exhausted = 0;
    let checked = 0;
    // Starting balances around 22 RUSD, where the employer pays out its whole spendable cash.
    // Under the pre-D-165 rule the limit `cash − today's wages` rounded up by an ulp for
    // steps 298 to 309 of this sweep (cash 22.016 to 22.645): the employer was left with
    // 3.698630136986301 after earning 3.6986301369863015 (the 1900 world did the same 48
    // times in 53 days; once, when the wage itself was absorbed by rounding, by all of it).
    for (let step = 280; step < 328; step += 1) {
      const cash = 5 + step * 0.0571 + Math.sin(step) * 1e-3;
      const { world, scenario } = worldWithServants(cash);
      if (world.labourMarket.householdEmployment.length === 0) throw new Error("no servants were hired");
      const result = tick(world, economyTickContext(scenario));
      const settlement = result.economy?.settlement;
      if (settlement === undefined) throw new Error("the day has no settlement");
      const columns = settlementHouseholdColumns(settlement);
      if (columns === undefined) throw new Error("the settlement has no household columns");
      const wages = columns.wagesReceivedRUSD[P7_CLERK_BLOCK] ?? 0;
      const ending = columns.endingCashAfterSettlementRUSD[P7_CLERK_BLOCK] ?? 0;
      expect(wages).toBeGreaterThan(0);
      // The rule exactly: what is left after paying the servants covers today's wages.
      expect(ending).toBeGreaterThanOrEqual(wages);
      checked += 1;
      if (ending - wages <= 1e-9 * Math.max(1, wages)) exhausted += 1;
      // The fiscal phase found the tax affordable (the day completed) and money is not
      // created: the posted servants' pay never exceeded the employer's spendable cash.
      expect(result.advanced).toBe(true);
    }
    expect(checked).toBe(48);
    // The guard's regime was exercised: employers spent down to their wages.
    expect(exhausted).toBeGreaterThan(0);
  });
});

describe("D-165 servants are split over employers by income at any income size", () => {
  test("employers whose income is a few cents a day still take the province's servants", () => {
    // 1 September 1900: the employers' incomes in whole cents a day summed to fewer units
    // than the servants due, and the bounded apportionment threw "apportionment total cannot
    // exceed the sum of weights". The split now uses a finer unit of the same incomes.
    const scenario = p7Scenario({ clerkJobsPerThroughputUnit: 3 });
    scenario.definitions = {
      ...scenario.definitions,
      labourMarket: {
        ...(scenario.definitions.labourMarket ?? { domesticServiceBuildingKeys: [] }),
        domesticServiceShares: [{ provinceId: M5_REGION_A1, share: 0.2 }],
      },
    };
    const reference = createEconomyWorld(scenario);
    const world = createEconomyWorld(scenario);
    let employerPersons = 0;
    for (const block of world.popBlocks) {
      if (block.id !== P7_CLERK_BLOCK) continue;
      for (let age = 0; age < block.maleByAge.length; age += 1) employerPersons += (block.maleByAge[age] ?? 0) + (block.femaleByAge[age] ?? 0);
    }
    // Three cents a day for the whole employer block, against tens of servants due.
    for (const block of world.popBlocks) if (block.id === P7_CLERK_BLOCK) block.incomeSmoothedRUSDPerCapitaDay = 0.03 / employerPersons;
    for (const block of reference.popBlocks) if (block.id === P7_CLERK_BLOCK) block.incomeSmoothedRUSDPerCapitaDay = 5;
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    refreshEmployment(reference, scenario.definitions, reference.dayIndex, { force: true });
    const hired = (w: World): number => w.labourMarket.householdEmployment.reduce((sum, entry) => sum + entry.workers, 0);
    expect(hired(reference)).toBeGreaterThan(3);
    // The count is the census share of the province, whatever the employers' income.
    expect(hired(world)).toBe(hired(reference));
    expect(world.labourMarket.householdEmployment.every((entry) => entry.employerBlockId === P7_CLERK_BLOCK)).toBe(true);
  });
});
