import {
  applyMilitaryAction,
  assertValidWorld,
  civilDateToDayIndex,
  cloneWorld,
  closeFinancePeriod,
  compactFinanceHistory,
  createEconomyWorld,
  daysInMonth,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  serializeWorld,
  tick,
  type FinancePeriodSummary,
  type Month,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import { SimulationHost } from "@century/sim-worker/host";
import {
  PROTOCOL_VERSION,
  type WorkerEvent,
} from "@century/sim-worker";
import {
  compressSaveForStorage,
  decompressSaveFromStorage,
} from "@century/sim-worker/persistence";

const SEED = 20_261_023;
const FOUR_MIB = 4 * 1024 * 1024;

function monthlyPeriods(count: number): FinancePeriodSummary[] {
  const periods: FinancePeriodSummary[] = [];
  let previousEnd = -1;
  for (let index = 0; index < count; index += 1) {
    const year = 1900 + Math.floor(index / 12);
    const month = ((index % 12) + 1) as Month;
    const end = civilDateToDayIndex(year, month, daysInMonth(year, month));
    periods.push({
      periodStartDay: previousEnd + 1,
      periodEndDay: end,
      accountTotals: {},
      flowTotalsByKind: {
        "goods-purchase": 0,
        "input-purchase": 0,
        wages: 0,
        upkeep: 0,
      },
      countryBudgetTotals: {},
    });
    previousEnd = end;
  }
  return periods;
}

/**
 * The fixtures jump the calendar past the simulated month. A consignment dispatched in
 * that month stays in transit and arrives on the jumped day instead of before it.
 */
function keepShipmentsInTransit(world: World): void {
  world.trade.shipments = world.trade.shipments.map((shipment) => ({
    ...shipment,
    arrivalDay: Math.max(shipment.arrivalDay, world.dayIndex),
  }));
}

let cachedFixture: World | null = null;

function worldWithRepresentativeHistory(): {
  world: World;
  baseSummary: FinancePeriodSummary;
} {
  if (cachedFixture === null) {
    const scenario = loadM5EightPolities();
    const context = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const world = createEconomyWorld(scenario, { seed: SEED });
    for (let index = 0; index < 31; index += 1) tick(world, context);
    const baseSummary = world.finance.periodSummaries[0];
    if (baseSummary === undefined) throw new Error("fixture did not close a month");
    const periods = monthlyPeriods(1200);
    world.finance.periodSummaries = periods.map((period) => ({
      ...period,
      accountTotals: { ...baseSummary.accountTotals },
      flowTotalsByKind: { ...baseSummary.flowTotalsByKind },
      // Keep the synthetic detailed months internally consistent with the
      // copied pre-close balances: requested welfare must equal paid plus
      // shortfall for the summary to validate.
      countryBudgetTotals: Object.fromEntries(
        Object.entries(baseSummary.countryBudgetTotals).map(([countryId, totals]) => [
          countryId,
          { ...totals },
        ]),
      ),
    }));
    world.finance.closedThroughDay = periods.at(-1)?.periodEndDay ?? null;
    world.dayIndex = (periods.at(-1)?.periodEndDay ?? 0) + 1;
    keepShipmentsInTransit(world);
    cachedFixture = world;
  }
  const world = cloneWorld(cachedFixture);
  const baseSummary = world.finance.periodSummaries[0];
  if (baseSummary === undefined) throw new Error("fixture has no summary");
  return { world, baseSummary };
}

describe("monthly finance history compaction (D-065)", () => {
  test("retains twelve detailed months and exact per-country totals for older months", () => {
    const { world } = worldWithRepresentativeHistory();
    const before = world.finance.periodSummaries.map((summary) =>
      governmentPeriodTotals(world.finance, summary),
    );
    const compacted = compactFinanceHistory(world.finance);
    expect(compacted).toBe(1188);
    expect(world.finance.periodSummaries).toHaveLength(1200);

    const detailed = world.finance.periodSummaries.slice(-12);
    expect(detailed.every((summary) => Object.keys(summary.accountTotals).length > 0)).toBe(true);

    const old = world.finance.periodSummaries[0];
    expect(old?.countryFiscalTotals).toBeDefined();
    expect(Object.keys(old?.accountTotals ?? {})).toHaveLength(0);
    expect(Object.keys(old?.countryFiscalTotals ?? {})).toHaveLength(8);
    const oldTotals = governmentPeriodTotals(world.finance, old as FinancePeriodSummary);
    expect(oldTotals).toEqual(before[0]);

    // The five flow totals are retained exactly.
    expect(old?.flowTotalsByKind).toEqual(world.finance.periodSummaries[1]?.flowTotalsByKind);
  });

  test("canonical save is below 4 MiB and round-trips with an equal hash", () => {
    const { world } = worldWithRepresentativeHistory();
    compactFinanceHistory(world.finance);
    const save = serializeWorld(world);
    expect(save.length).toBeLessThan(FOUR_MIB);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.finance.periodSummaries).toHaveLength(1200);
    expect(restored.finance.periodSummaries[0]?.countryFiscalTotals).toBeDefined();
  });

  test("large bounded save compresses and decompresses losslessly", () => {
    const { world } = worldWithRepresentativeHistory();
    compactFinanceHistory(world.finance);
    const save = serializeWorld(world);
    const stored = compressSaveForStorage(save);
    expect(stored.length).toBeLessThan(save.length);
    expect(decompressSaveFromStorage(stored)).toBe(save);
  });

  test("compaction preserves military expense and the stored net reconciles", () => {
    const scenario = loadM5EightPolities();
    const context = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const world = createEconomyWorld(scenario, { seed: SEED });
    applyMilitaryAction(
      world,
      {
        kind: "recruit-army",
        countryId: 0,
        dayIndex: 0,
        source: "player",
        provinceId: 0,
        personnel: 500,
      },
      0,
    );
    for (let index = 0; index < 31; index += 1) tick(world, context);
    const baseSummary = world.finance.periodSummaries[0];
    if (baseSummary === undefined) throw new Error("fixture did not close a month");
    const before = governmentPeriodTotals(world.finance, baseSummary).find(
      (entry) => entry.countryId === 0,
    );
    expect(before?.militaryExpenseRUSD ?? 0).toBeGreaterThan(0);

    // Reproduce the 13th-close boundary: thirteen detailed periods become one
    // compacted period plus the retained detailed window.
    const periods = monthlyPeriods(13).map((period) => ({
      ...period,
      accountTotals: { ...baseSummary.accountTotals },
      flowTotalsByKind: { ...baseSummary.flowTotalsByKind },
      countryBudgetTotals: Object.fromEntries(
        Object.entries(baseSummary.countryBudgetTotals).map(([countryId, totals]) => [
          countryId,
          { ...totals },
        ]),
      ),
    }));
    world.finance.periodSummaries = periods;
    world.finance.closedThroughDay = periods.at(-1)?.periodEndDay ?? null;
    world.dayIndex = (periods.at(-1)?.periodEndDay ?? 0) + 1;
    keepShipmentsInTransit(world);
    assertValidWorld(world);

    expect(compactFinanceHistory(world.finance)).toBe(1);
    const compacted = world.finance.periodSummaries[0];
    const totals = compacted?.countryFiscalTotals?.[0];
    if (totals === undefined) throw new Error("fixture did not compact a country");
    expect(totals.militaryExpenseRUSD).toBeCloseTo(before?.militaryExpenseRUSD ?? -1, 6);
    expect(totals.netFiscalResultRUSD).toBeCloseTo(
      totals.incomeTaxRevenueRUSD +
        totals.businessTaxRevenueRUSD +
        (totals.customsDutyRevenueRUSD ?? 0) -
        totals.welfareExpenseRUSD -
        totals.interestExpenseRUSD -
        (totals.subsidyExpenseRUSD ?? 0) -
        (totals.administrationExpenseRUSD ?? 0) -
        (totals.educationExpenseRUSD ?? 0) -
        (totals.trainingExpenseRUSD ?? 0) -
        (totals.militaryExpenseRUSD ?? 0),
      6,
    );
    assertValidWorld(world);
    expect(() => serializeWorld(world)).not.toThrow();
  });

  test("the real 13th monthly close succeeds with military expense in the compacted month", () => {
    const scenario = loadM5EightPolities();
    const context = {
      population: { definitions: scenario.population.definitions },
      economy: { definitions: scenario.definitions },
    };
    const world = createEconomyWorld(scenario, { seed: SEED });
    applyMilitaryAction(
      world,
      {
        kind: "recruit-army",
        countryId: 0,
        dayIndex: 0,
        source: "player",
        provinceId: 0,
        personnel: 500,
      },
      0,
    );
    for (let index = 0; index < 31; index += 1) tick(world, context);
    expect(world.finance.periodSummaries).toHaveLength(1);
    for (let index = 1; index < 13; index += 1) {
      const year = 1900 + Math.floor(index / 12);
      const month = ((index % 12) + 1) as Month;
      world.dayIndex = civilDateToDayIndex(year, month, daysInMonth(year, month));
      keepShipmentsInTransit(world);
      closeFinancePeriod(world);
    }
    expect(world.finance.periodSummaries).toHaveLength(13);
    const first = world.finance.periodSummaries[0];
    expect(first?.countryFiscalTotals).toBeDefined();
    expect(
      first?.countryFiscalTotals?.[0]?.militaryExpenseRUSD ?? 0,
    ).toBeGreaterThan(0);
    // The tick pipeline advances the day before publishing a closed world.
    world.dayIndex += 1;
    keepShipmentsInTransit(world);
    assertValidWorld(world);
  });

  test("the real close path compacts only after the detailed window", () => {
    const scenario = loadM5EightPolities();
    const world = createEconomyWorld(scenario, { seed: SEED });
    for (let index = 0; index < 13; index += 1) {
      const year = 1900 + Math.floor(index / 12);
      const month = ((index % 12) + 1) as Month;
      world.dayIndex = civilDateToDayIndex(year, month, daysInMonth(year, month));
      keepShipmentsInTransit(world);
      closeFinancePeriod(world);
    }
    expect(world.finance.periodSummaries).toHaveLength(13);
    expect(world.finance.periodSummaries[0]?.countryFiscalTotals).toBeDefined();
    expect(Object.keys(world.finance.periodSummaries[0]?.accountTotals ?? {})).toHaveLength(0);
    expect(Object.keys(world.finance.periodSummaries[1]?.accountTotals ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(world.finance.periodSummaries.at(-1)?.accountTotals ?? {}).length).toBeGreaterThan(0);
  });

  test("the compacted late-game save loads through the worker protocol", () => {
    const { world } = worldWithRepresentativeHistory();
    compactFinanceHistory(world.finance);
    const save = serializeWorld(world);
    const events: WorkerEvent[] = [];
    const host = new SimulationHost({
      scenario: loadM5EightPolities(),
      seed: SEED,
      emit: (event) => events.push(event),
      autoPump: false,
    });
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "LOAD",
      commandId: "large-load",
      save,
    });
    const result = events.find((event) => event.type === "LOAD_RESULT");
    expect(result?.type).toBe("LOAD_RESULT");
    if (result?.type !== "LOAD_RESULT") throw new Error("no load result");
    expect(result.accepted).toBe(true);
    expect(result.snapshot.dayIndex).toBe(36_524);
    expect(result.snapshot.campaignComplete).toBe(true);
  });

  test("compact summaries reject malformed fiscal totals", () => {
    const { world } = worldWithRepresentativeHistory();
    compactFinanceHistory(world.finance);
    const old = world.finance.periodSummaries[0];
    if (old?.countryFiscalTotals === undefined) throw new Error("fixture is not compacted");
    const countryId = Object.keys(old.countryFiscalTotals)[0];
    if (countryId === undefined) throw new Error("fixture has no country totals");
    const parsed = JSON.parse(serializeWorld(world)) as {
      payload: {
        finance: {
          periodSummaries: {
            countryFiscalTotals: Record<string, { netFiscalResultRUSD: number }>;
          }[];
        };
      };
    };
    const first = parsed.payload.finance.periodSummaries[0];
    if (first === undefined) throw new Error("fixture has no encoded summary");
    first.countryFiscalTotals[countryId]!.netFiscalResultRUSD = 1;
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow();
  });
});
