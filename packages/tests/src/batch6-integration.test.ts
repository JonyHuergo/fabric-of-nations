/**
 * Batch 6 integrated economic correctness evidence.
 *
 * The run uses the shipped eight-polity sample (8 countries, 16 provinces, 5
 * markets, 113 buildings) and exercises the real `tick` pipeline across two
 * month-end closes and two migration dates. It deliberately starts at day 28 so
 * the bounded run covers the January close (day 30), the February migration
 * (day 31), the February close (day 58), and the March migration (day 59).
 *
 * Money model: the simulation has no money creation or destruction. Debt
 * issuance, coupons, principal, taxes, welfare, wages, upkeep, purchases, and
 * migration transfers all move existing designated cash between accounts, so the
 * global designated-cash total must be invariant across every tick.
 */

import {
  MAX_ACTIVE_DEBT_CONTRACTS,
  MAX_DEBT_HISTORY_AGGREGATES,
  assertAccountingIdentity,
  assertValidEmploymentState,
  assertValidWorld,
  createEconomyWorld,
  designatedCashTotal,
  deserializeWorld,
  hashWorld,
  issueGovernmentDebt,
  populationTotal,
  serializeWorld,
  tick,
  type EconomyScenarioDef,
  type FinancialAccount,
  type TickContext,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_023;
const START_DAY = 28;
const END_DAY = 62; // exclusive: ticks process days 28..61
const SAVE_DAY = 40;
const MONTH_END_DAYS = new Set([30, 58]);
const MIGRATION_DAYS = new Set([31, 59]);
const DEBT_PRINCIPAL = 100_000;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function totalPopulation(world: World): number {
  let total = 0;
  for (const block of world.popBlocks) total += populationTotal(block);
  return total;
}

function account(
  world: World,
  ownerKind: FinancialAccount["ownerKind"],
  ownerId: number,
  subtype: FinancialAccount["subtype"],
): FinancialAccount {
  const found = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (found === undefined) {
    throw new Error(`missing ${ownerKind}/${String(ownerId)}/${subtype}`);
  }
  return found;
}

function cashConserved(before: number, after: number): boolean {
  const scale = Math.max(1, Math.abs(before), Math.abs(after));
  return Math.abs(after - before) <= 1e-12 * scale;
}

function uniqueIds(values: readonly number[]): boolean {
  return new Set(values).size === values.length;
}

describe("Batch 6 integrated multi-country economic run", () => {
  test("conserves population, cash, and accounting across closes, migration, and debt", () => {
    const scenario = loadM5EightPolities();
    const context = contextFor(scenario);
    const world = createEconomyWorld(scenario, { seed: SEED });
    world.dayIndex = START_DAY;

    const debtor = world.countries.find((country) => country.debt.enabled);
    if (debtor === undefined) throw new Error("fixture has no debt-enabled country");
    issueGovernmentDebt(world, {
      issuerCountryId: debtor.id,
      holderKind: "country",
      holderId: debtor.debt.creditorId,
      principalRUSD: DEBT_PRINCIPAL,
      annualCouponRate: 0.04,
      termDays: 365,
    });

    const cashBefore = designatedCashTotal(world.finance);
    const populationAtStart = totalPopulation(world);
    let births = 0;
    let deaths = 0;
    let migrationTicks = 0;
    let migrationPeople = 0;
    let closeDays: number[] = [];
    let savedAtDay40: string | null = null;

    for (let day = START_DAY; day < END_DAY; day += 1) {
      if (world.dayIndex === SAVE_DAY) savedAtDay40 = serializeWorld(world);
      const populationBefore = totalPopulation(world);
      const result = tick(world, context);
      const economy = result.economy;
      const population = result.population;
      if (economy === undefined || population === undefined) {
        throw new Error(`day ${String(day)} did not take the integrated economy path`);
      }

      // Population conservation: migration moves people between blocks, while
      // world totals change only through the day's births and deaths.
      births += population.births;
      deaths += population.deaths;
      expect(totalPopulation(world)).toBe(populationBefore + population.births - population.deaths);

      // No modelled money creation/destruction: every flow is a transfer.
      expect(cashConserved(cashBefore, designatedCashTotal(world.finance))).toBe(true);

      // Wages/upkeep are once-per-day obligations across all markets: one
      // settlement entry per building, and every obligation reconciles with its
      // paid/unpaid split. Bounded audit postings may evict older entries, so the
      // transient settlement result is the authoritative evidence here.
      const wageIds = economy.settlement.wages.map((wage) => wage.buildingId);
      const upkeepIds = economy.settlement.upkeep.map((upkeep) => upkeep.buildingId);
      expect(uniqueIds(wageIds)).toBe(true);
      expect(uniqueIds(upkeepIds)).toBe(true);
      expect(wageIds.length).toBeGreaterThan(0);
      expect(upkeepIds.length).toBeGreaterThan(0);
      for (const wage of economy.settlement.wages) {
        expect(wage.paidRUSD + wage.unpaidRUSD).toBeCloseTo(wage.obligationRUSD, 6);
        expect(wage.obligationRUSD).toBeGreaterThan(0);
      }
      const definitionById = new Map(
        scenario.definitions.buildings.map((definition) => [definition.id, definition]),
      );
      const expectedUpkeep = new Map<number, number>();
      for (const building of world.buildings) {
        const definition = definitionById.get(building.definitionId);
        if (definition === undefined || !building.operational) continue;
        const obligation = definition.dailyUpkeepRUSDAtLevelOne * building.level;
        if (obligation > 0) expectedUpkeep.set(building.id, obligation);
      }
      expect(upkeepIds.sort((left, right) => left - right)).toEqual(
        [...expectedUpkeep.keys()].sort((left, right) => left - right),
      );
      for (const upkeep of economy.settlement.upkeep) {
        expect(upkeep.obligationRUSD).toBeCloseTo(expectedUpkeep.get(upkeep.buildingId) ?? -1, 6);
        expect(upkeep.paidRUSD + upkeep.unpaidRUSD).toBeCloseTo(upkeep.obligationRUSD, 6);
      }
      expect(economy.settlement.marketIds).toEqual([0, 1, 2, 3, 4]);
      // Monthly close ordering: the close is recorded on the civil month-end and
      // only then does the day run profit allocation.
      if (MONTH_END_DAYS.has(day)) {
        expect(economy.financeClose).not.toBeNull();
        expect(economy.financeClose?.summary.periodEndDay).toBe(day);
        expect(world.finance.closedThroughDay).toBe(day);
        expect(economy.profitDistribution).not.toBeNull();
        closeDays.push(day);
      } else {
        expect(economy.financeClose).toBeNull();
        expect(economy.profitDistribution).toBeNull();
      }

      if (MIGRATION_DAYS.has(day)) {
        expect(economy.migration.ran).toBe(true);
        expect(economy.migration.employmentRefresh).not.toBeNull();
        migrationTicks += 1;
        migrationPeople += economy.migration.totalPeople;
      }

      // Accounting identity and employment validity at every published boundary.
      assertAccountingIdentity(world.finance);
      assertValidEmploymentState(world, scenario.definitions);
      assertValidWorld(world);
    }

    expect(world.dayIndex).toBe(END_DAY);
    expect(closeDays).toEqual([30, 58]);
    expect(migrationTicks).toBe(2);
    expect(migrationPeople).toBeGreaterThan(0);

    // Retained summaries are contiguous and bounded.
    const summaries = world.finance.periodSummaries;
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.periodEndDay).toBe(30);
    expect(summaries[1]?.periodStartDay).toBe(31);
    expect(summaries[1]?.periodEndDay).toBe(58);
    expect(world.finance.closedThroughDay).toBe(58);

    // Whole-run population identity, including both migration days.
    expect(totalPopulation(world)).toBe(populationAtStart + births - deaths);

    // Active debt: principal, liability, and creditor asset reconcile, and the
    // accrued coupon is mirrored on both sides. The simulation has no hidden
    // debt liability.
    const activeContracts = world.finance.debtContracts.filter(
      (contract) => contract.status === "active" || contract.status === "arrears",
    );
    expect(activeContracts.length).toBeGreaterThanOrEqual(1);
    expect(activeContracts.length).toBeLessThanOrEqual(MAX_ACTIVE_DEBT_CONTRACTS);
    expect(world.finance.debtHistory.length).toBeLessThanOrEqual(MAX_DEBT_HISTORY_AGGREGATES);
    const outstandingPrincipal = activeContracts.reduce(
      (total, contract) => total + contract.outstandingPrincipalRUSD,
      0,
    );
    const accruedInterest = activeContracts.reduce(
      (total, contract) => total + contract.accruedInterestRUSD,
      0,
    );
    expect(
      account(world, "country", debtor.id, "debt-liability").balanceRUSD,
    ).toBeCloseTo(outstandingPrincipal, 6);
    expect(
      account(world, "country", debtor.debt.creditorId, "bond-asset").balanceRUSD,
    ).toBeCloseTo(outstandingPrincipal, 6);
    expect(
      account(world, "country", debtor.id, "interest-payable").balanceRUSD,
    ).toBeCloseTo(accruedInterest, 6);
    expect(
      account(world, "country", debtor.debt.creditorId, "interest-receivable").balanceRUSD,
    ).toBeCloseTo(accruedInterest, 6);
    expect(outstandingPrincipal).toBeGreaterThanOrEqual(DEBT_PRINCIPAL);

    // Save/load continuation from day 40 (after the first close and migration)
    // must reproduce the uninterrupted run exactly.
    if (savedAtDay40 === null) throw new Error("integration run did not save at day 40");
    const resumed = deserializeWorld(savedAtDay40);
    for (let day = SAVE_DAY; day < END_DAY; day += 1) tick(resumed, context);
    expect(resumed.dayIndex).toBe(END_DAY);
    expect(hashWorld(resumed)).toBe(hashWorld(world));
    expect(totalPopulation(resumed)).toBe(totalPopulation(world));
    expect(designatedCashTotal(resumed.finance)).toBeCloseTo(
      designatedCashTotal(world.finance),
      6,
    );
    assertAccountingIdentity(resumed.finance);
    assertValidWorld(resumed);
  });
});
