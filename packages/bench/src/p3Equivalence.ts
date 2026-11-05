/**
 * P3 (D-141) equivalence probe (`node packages/bench/dist/p3Equivalence.js [days]`).
 *
 * Shows that the P3 currency data changes no simulated quantity:
 * 1. **Valuations.** The 1900 world with its P3 parities and the same world with every
 *    valuation `unavailable` (same currencies and arrangements) run side by side; after the
 *    valuation fields (valuations, authority parities and the month-end closing
 *    valuations) are copied across, `hashWorld` is identical every day.
 * 2. **Arrangements.** The P3 world and the pre-P3 world (one own currency per country) run
 *    side by side; `simulatedQuantitiesDigest` (every account balance keyed by owner and
 *    subtype, and all non-monetary state with account ids removed) is identical every day.
 * Node diagnostic; nothing is persisted.
 */

import {
  buildM5HistoricalScenario,
  loadHistoricalData,
  loadM11Provinces,
} from "@century/data";
import {
  checksumOfJson,
  createEconomyWorld,
  createRollbackRunner,
  hashWorld,
  runTicksWithRollback,
  type EconomyScenarioDef,
  type TickContext,
  type World,
} from "@century/sim";

export const P3_PROBE_SEED = 20_261_023;

const MONETARY_SUBTYPES = new Set([
  "monetary-reserve-cash",
  "currency-liability",
  "monetary-equity",
  "external-cash",
  "external-currency-holding",
  "external-equity",
]);

/** The three 1900 scenarios the probe compares. */
export function p3EquivalenceScenarios(): {
  readonly withParities: EconomyScenarioDef;
  readonly withoutValuations: EconomyScenarioDef;
  readonly preP3: EconomyScenarioDef;
} {
  const data = loadHistoricalData("scenarios/m11_world_1900.json");
  const provinces = loadM11Provinces();
  const withParities = { ...buildM5HistoricalScenario(data), provinces };
  const withoutValuations: EconomyScenarioDef = {
    ...withParities,
    currencyValuations: (withParities.currencyValuations ?? []).map((valuation) => ({
      currencyId: valuation.currencyId,
      status: "unavailable" as const,
    })),
  };
  const { currencyTable: _table, ...preP3Data } = data;
  void _table;
  const preP3 = { ...buildM5HistoricalScenario(preP3Data), provinces };
  return { withParities, withoutValuations, preP3 };
}

/** Copy the valuation fields (and the parities derived from them) of `from` into a clone of `to`. */
export function withValuationsOf(from: World, to: World): World {
  // Shallow copies of the replaced branches only; the rest of `to` is shared, unchanged.
  return {
    ...to,
    currencyValuations: from.currencyValuations.map((valuation) => ({ ...valuation })),
    monetary: {
      ...to.monetary,
      currencies: to.monetary.currencies.map((record, index) => ({
        ...record,
        parityRusdPerUnit: from.monetary.currencies[index]?.parityRusdPerUnit ?? record.parityRusdPerUnit,
      })),
    },
    finance: {
      ...to.finance,
      periodSummaries: to.finance.periodSummaries.map((summary, index) => {
        const { closingValuations: _own, ...rest } = summary;
        void _own;
        const source = from.finance.periodSummaries[index]?.closingValuations;
        return source === undefined ? rest : { ...rest, closingValuations: source.map((entry) => ({ ...entry })) };
      }),
    },
  };
}

function stripAccountIds(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(stripAccountIds);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      // `accountTotals` is the id-keyed trial-balance copy of the balances compared above.
      if (/AccountIds?$/.test(key) || key === "closingValuations" || key === "accountTotals") continue;
      result[key] = stripAccountIds(entry);
    }
    return result;
  }
  return value;
}

/**
 * Digest of every simulated quantity, independent of account ids and of currency and
 * monetary-authority state: non-monetary account balances keyed by owner and subtype,
 * population, buildings, employment, markets, provinces, construction, trade, prices,
 * politics, technology, military and the per-country finance summaries.
 */
export function simulatedQuantitiesDigest(world: World): string {
  const balances = world.finance.accounts
    .filter((account) => !MONETARY_SUBTYPES.has(account.subtype))
    .map((account) => [account.ownerKind, account.ownerId, account.subtype, account.balanceRUSD] as const)
    .sort((left, right) =>
      `${left[0]}:${String(left[1])}:${left[2]}` < `${right[0]}:${String(right[1])}:${right[2]}` ? -1 : 1,
    );
  const countries = world.countries.map((country) => {
    const { monetary: _monetary, ...rest } = country;
    void _monetary;
    return rest;
  });
  return checksumOfJson(
    stripAccountIds({
      dayIndex: world.dayIndex,
      balances,
      countries,
      popBlocks: world.popBlocks,
      provinceEconomies: world.provinceEconomies,
      buildings: world.buildings,
      employment: world.employment,
      markets: world.markets,
      construction: world.construction,
      trade: world.trade,
      priceIndex: world.priceIndex,
      politics: world.politics,
      technology: world.technology,
      military: world.military,
      periodSummaries: world.finance.periodSummaries,
      annualSummaries: world.finance.annualSummaries,
    }),
  );
}

function main(): void {
  const days = Number(process.argv[2] ?? "8");
  const { withParities, withoutValuations, preP3 } = p3EquivalenceScenarios();
  const context: TickContext = {
    population: { definitions: withParities.population.definitions },
    economy: { definitions: withParities.definitions },
  };
  const a = createEconomyWorld(withParities, { seed: P3_PROBE_SEED });
  const b = createEconomyWorld(withoutValuations, { seed: P3_PROBE_SEED });
  const c = createEconomyWorld(preP3, { seed: P3_PROBE_SEED });
  const runners = [a, b, c].map((world) => createRollbackRunner(world));
  let failures = 0;
  for (let day = 0; day <= days; day += 1) {
    if (day > 0) for (const runner of runners) runTicksWithRollback(runner, 1, context);
    const valuations = hashWorld(a) === hashWorld(withValuationsOf(a, b));
    const quantities = simulatedQuantitiesDigest(a) === simulatedQuantitiesDigest(c);
    if (!valuations || !quantities) failures += 1;
    console.log(
      `${String(a.dayIndex)} valuations ${valuations ? "identical" : "DIFFER"} · quantities ${quantities ? "identical" : "DIFFER"} · ${hashWorld(a)}`,
    );
  }
  if (failures > 0) process.exitCode = 1;
}

if (process.argv[1] !== undefined && /p3Equivalence\.js$/.test(process.argv[1])) main();
