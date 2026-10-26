import {
  CASH_NEUTRAL_TRANSACTION_KINDS,
  CASH_SUBTYPES,
  FLOW_TRANSACTION_KINDS,
  accountingTotals,
  applyOpeningBalances,
  asSusdPerCurrencyUnit,
  assertAccountingIdentity,
  assertValidJournalPosting,
  assertValidWorld,
  buildFinanceIndex,
  civilDateToDayIndex,
  cloneWorld,
  createEconomyWorld,
  designatedCashTotal,
  deserializeWorld,
  hashWorld,
  postJournalBatch,
  postJournalEntry,
  runFiscalPhase,
  serializeWorld,
  tick,
  type AccountSubtype,
  type EconomyScenarioDef,
  type FinancialAccount,
  type JournalPosting,
  type MarketSettlementResult,
  type TickResult,
  type World,
} from "@century/sim";
import { economyTickContext, runSettlement, setCashBalance } from "./fixtures/m3e.js";
import { marketScenario } from "./fixtures/m3d.js";
import { aggregateWorld, contextFor, makeInputs } from "./fixtures/m2.js";
import {
  FISCAL_COUNTRY_ID,
  FISCAL_TREASURY_ACCOUNT_ID,
  fiscalCountry,
  fiscalScenario,
  zeroFiscalPolicy,
} from "./fixtures/m4c.js";

const SEED = 20_261_023;

function accountOf(
  world: World,
  ownerKind: "popBlock" | "building" | "country" | "system",
  ownerId: number | null,
  subtype: AccountSubtype,
): FinancialAccount {
  const match = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (match === undefined) {
    throw new Error(`missing ${ownerKind}:${String(ownerId)}:${subtype} account`);
  }
  return match;
}

function buildWorld(
  scenario: EconomyScenarioDef,
  options: { readonly startDayIndex?: number } = {},
): World {
  return createEconomyWorld(scenario, { seed: SEED, ...options });
}

function account(
  world: World,
  ownerKind: "popBlock" | "building" | "country" | "system",
  ownerId: number | null,
  subtype: AccountSubtype,
): FinancialAccount {
  return accountOf(world, ownerKind, ownerId, subtype);
}

function financeHash(world: World): string {
  return hashWorld(world);
}

function postingsOfKind(world: World, kind: string): JournalPosting[] {
  return world.finance.postings.filter((posting) => posting.transactionKind === kind);
}

function runDay(
  world: World,
  scenario: EconomyScenarioDef,
): NonNullable<TickResult["economy"]> & {
  readonly population: NonNullable<TickResult["population"]>;
} {
  const result = tick(world, economyTickContext(scenario));
  if (result.economy === undefined || result.population === undefined) {
    throw new Error("expected an economic day");
  }
  return { ...result.economy, population: result.population };
}

function settlementWithWages(
  settlement: MarketSettlementResult,
  wagesByBlock: ReadonlyMap<number, number>,
): MarketSettlementResult {
  return {
    ...settlement,
    households: settlement.households.map((household) => ({
      ...household,
      wagesReceivedSUSD: wagesByBlock.get(household.popBlockId) ?? 0,
    })),
  };
}

describe("M4c fiscal accounts, construction, and validation", () => {
  test("creates a country treasury, tax revenue, welfare expense, and equity once", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 36_500, treasuryCash: 500 });
    const world = buildWorld(scenario);
    expect(world.countries).toHaveLength(1);
    const country = world.countries[0]!;
    expect(country.id).toBe(FISCAL_COUNTRY_ID);
    expect(country.treasuryAccountId).toBe(FISCAL_TREASURY_ACCOUNT_ID);
    expect(country.fiscal).toEqual({
      incomeTaxRate: 0.1,
      welfareBudgetSUSDPerYear: 36_500,
    });
    expect(account(world, "country", country.id, "treasury-cash").id).toBe(
      FISCAL_TREASURY_ACCOUNT_ID,
    );
    expect(account(world, "country", country.id, "treasury-cash").balanceSUSD).toBe(500);
    expect(account(world, "country", country.id, "owner-equity").balanceSUSD).toBe(500);
    expect(account(world, "country", country.id, "income-tax-revenue").balanceSUSD).toBe(0);
    expect(account(world, "country", country.id, "welfare-expense").balanceSUSD).toBe(0);
    for (const block of world.popBlocks) {
      expect(account(world, "popBlock", block.id, "income-tax-expense").balanceSUSD).toBe(0);
      expect(account(world, "popBlock", block.id, "welfare-income").balanceSUSD).toBe(0);
    }
    expect(world.finance.opening).not.toBeNull();
    expect(() => applyOpeningBalances(world.finance, 0, [])).toThrow(/already been applied/i);
    expect(() => assertValidWorld(world)).not.toThrow();
    expect(accountingTotals(world.finance).assets).toBeCloseTo(
      accountingTotals(world.finance).equity,
      9,
    );
  });

  test("zero-fiscal countries keep unowned regions valid, active fiscal requires ownership", () => {
    const zero = buildWorld(
      fiscalScenario({
        countries: [fiscalCountry({ regionIds: [], fiscal: zeroFiscalPolicy() })],
      }),
    );
    expect(zero.countries[0]?.regionIds).toEqual([]);

    const unowned = fiscalScenario({
      countries: [fiscalCountry({ regionIds: [], fiscal: { incomeTaxRate: 0.1, welfareBudgetSUSDPerYear: 0 } })],
    });
    expect(() => buildWorld(unowned)).toThrow(/owned by exactly one country/i);

    const unownedBudget = fiscalScenario({
      countries: [
        fiscalCountry({ regionIds: [], fiscal: { incomeTaxRate: 0, welfareBudgetSUSDPerYear: 10 } }),
      ],
    });
    expect(() => buildWorld(unownedBudget)).toThrow(/owned by exactly one country/i);
  });

  test("rejects invalid fiscal values and treasury declarations", () => {
    const bad = (fiscal: { incomeTaxRate: number; welfareBudgetSUSDPerYear: number }): void => {
      expect(() => buildWorld(fiscalScenario({ countries: [fiscalCountry({ fiscal })] }))).toThrow();
    };
    bad({ incomeTaxRate: Number.NaN, welfareBudgetSUSDPerYear: 0 });
    bad({ incomeTaxRate: Number.POSITIVE_INFINITY, welfareBudgetSUSDPerYear: 0 });
    bad({ incomeTaxRate: -0.01, welfareBudgetSUSDPerYear: 0 });
    bad({ incomeTaxRate: 1.01, welfareBudgetSUSDPerYear: 0 });
    bad({ incomeTaxRate: 0, welfareBudgetSUSDPerYear: -1 });
    bad({ incomeTaxRate: 0, welfareBudgetSUSDPerYear: Number.NaN });
    bad({ incomeTaxRate: 0, welfareBudgetSUSDPerYear: Number.POSITIVE_INFINITY });
    bad({ incomeTaxRate: 0, welfareBudgetSUSDPerYear: 1e16 });

    const negativeCash = fiscalScenario({
      countries: [fiscalCountry({ initialTreasuryCashSUSD: -1 })],
    });
    expect(() => buildWorld(negativeCash)).toThrow(/non-negative/i);

    const colliding = fiscalScenario({
      countries: [fiscalCountry({ treasuryAccountId: 10 })],
    });
    expect(() => buildWorld(colliding)).toThrow(/duplicate .*account id/i);

    const duplicateTreasury = fiscalScenario({
      countries: [
        fiscalCountry({ id: 0 }),
        fiscalCountry({ id: 1, tag: "T1", regionIds: [], treasuryAccountId: FISCAL_TREASURY_ACCOUNT_ID }),
      ],
    });
    expect(() => buildWorld(duplicateTreasury)).toThrow(/duplicate .*treasury account id/i);
  });

  test("rejects missing, mismatched, or wrongly owned country and household accounts", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);

    const missingTreasury = cloneWorld(world);
    missingTreasury.finance.accounts = missingTreasury.finance.accounts.filter(
      (candidate) => candidate.id !== FISCAL_TREASURY_ACCOUNT_ID,
    );
    expect(() => assertValidWorld(missingTreasury)).toThrow(/treasury-cash/i);

    const mismatch = cloneWorld(world);
    mismatch.countries[0]!.treasuryAccountId = mismatch.popBlocks[0]!.financialAccountId;
    expect(() => assertValidWorld(mismatch)).toThrow(/does not reference its own treasury-cash/i);

    const wrongOwner = cloneWorld(world);
    const treasury = wrongOwner.finance.accounts.find(
      (candidate) => candidate.id === FISCAL_TREASURY_ACCOUNT_ID,
    )!;
    treasury.ownerId = 999;
    expect(() => assertValidWorld(wrongOwner)).toThrow(/unknown country owner/i);

    const missingTaxRevenue = cloneWorld(world);
    missingTaxRevenue.finance.accounts = missingTaxRevenue.finance.accounts.filter(
      (candidate) => candidate.subtype !== "income-tax-revenue",
    );
    expect(() => assertValidWorld(missingTaxRevenue)).toThrow(/missing income-tax-revenue/i);

    const missingWelfareIncome = cloneWorld(world);
    missingWelfareIncome.finance.accounts = missingWelfareIncome.finance.accounts.filter(
      (candidate) => candidate.subtype !== "welfare-income",
    );
    expect(() => assertValidWorld(missingWelfareIncome)).toThrow(/missing welfare-income/i);

    const missingTaxExpense = cloneWorld(world);
    missingTaxExpense.finance.accounts = missingTaxExpense.finance.accounts.filter(
      (candidate) => candidate.subtype !== "income-tax-expense",
    );
    expect(() => assertValidWorld(missingTaxExpense)).toThrow(/missing income-tax-expense/i);
  });

  test("round-trips, clones, and hashes fiscal state", () => {
    const scenario = fiscalScenario({ rate: 0.15, budget: 12_000, treasuryCash: 250 });
    const world = buildWorld(scenario);
    const serialized = serializeWorld(world);
    const parsed = JSON.parse(serialized) as {
      payload: {
        countries: {
          treasuryAccountId: number;
          fiscal: { incomeTaxRate: number; welfareBudgetSUSDPerYear: number };
        }[];
      };
    };
    expect(parsed.payload.countries[0]?.treasuryAccountId).toBe(FISCAL_TREASURY_ACCOUNT_ID);
    expect(parsed.payload.countries[0]?.fiscal).toEqual({
      incomeTaxRate: 0.15,
      welfareBudgetSUSDPerYear: 12_000,
    });

    const restored = deserializeWorld(serialized);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.countries[0]?.fiscal).toEqual(world.countries[0]?.fiscal);

    const clone = cloneWorld(world);
    clone.countries[0]!.fiscal.incomeTaxRate = 0;
    clone.countries[0]!.regionIds.push(7);
    expect(world.countries[0]?.fiscal.incomeTaxRate).toBe(0.15);
    expect(world.countries[0]?.regionIds).toEqual([0]);
  });

  test("rejects schema-8 and simulation-0.8.0 saves with actionable errors", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);
    const envelope = JSON.parse(serializeWorld(world)) as { schemaVersion: number };
    envelope.schemaVersion = 8;
    expect(() => deserializeWorld(JSON.stringify(envelope))).toThrow(/schema 8/i);

    const oldSim = JSON.parse(serializeWorld(world)) as { simVersion: string };
    oldSim.simVersion = "0.8.0";
    expect(() => deserializeWorld(JSON.stringify(oldSim))).toThrow(/simulation version/i);
  });
});

describe("M4c daily income tax", () => {
  test("withholds the flat rate on wages actually received and reconciles cash", () => {
    const scenario = fiscalScenario({ rate: 0.125 });
    const world = buildWorld(scenario);
    const treasuryBefore = account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceSUSD;
    const economy = runDay(world, scenario);
    const fiscal = economy.fiscal;
    const wagesByBlock = new Map(
      economy.settlement.households.map((household) => [
        household.popBlockId,
        household.wagesReceivedSUSD,
      ]),
    );
    const endingByBlock = new Map(
      economy.settlement.households.map((household) => [
        household.popBlockId,
        household.endingCashSUSD,
      ]),
    );
    let taxTotal = 0;
    for (const block of fiscal.blocks) {
      const wages = wagesByBlock.get(block.popBlockId) ?? 0;
      expect(block.incomeTaxSUSD).toBeCloseTo(0.125 * wages, 9);
      expect(account(world, "popBlock", block.popBlockId, "income-tax-expense").balanceSUSD).toBeCloseTo(
        block.incomeTaxSUSD,
        9,
      );
      expect(account(world, "popBlock", block.popBlockId, "household-cash").balanceSUSD).toBeCloseTo(
        (endingByBlock.get(block.popBlockId) ?? 0) - block.incomeTaxSUSD,
        9,
      );
      taxTotal += block.incomeTaxSUSD;
    }
    expect(fiscal.totals.incomeTaxSUSD).toBeCloseTo(taxTotal, 9);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceSUSD).toBeCloseTo(
      treasuryBefore + taxTotal,
      9,
    );
    expect(account(world, "country", FISCAL_COUNTRY_ID, "income-tax-revenue").balanceSUSD).toBeCloseTo(
      taxTotal,
      9,
    );
    // Gross wage income is recorded at the full settled amount.
    let wageIncome = 0;
    for (const block of world.popBlocks) {
      wageIncome += account(world, "popBlock", block.id, "wage-income").balanceSUSD;
    }
    expect(wageIncome).toBeCloseTo(economy.settlement.totals.wagesPaidSUSD, 9);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(
      economy.settlement.totals.endingCashSUSD,
      9,
    );
  });

  test("a zero rate or zero wages produces no tax", () => {
    const zeroRate = fiscalScenario({ rate: 0 });
    const world = buildWorld(zeroRate);
    const economy = runDay(world, zeroRate);
    expect(economy.fiscal.totals.incomeTaxSUSD).toBe(0);
    expect(postingsOfKind(world, "income-tax")).toHaveLength(0);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceSUSD).toBe(0);

    const rateScenario = fiscalScenario({ rate: 0.5 });
    const noWagesWorld = buildWorld(rateScenario);
    const settlement = runSettlement(rateScenario, noWagesWorld).settlement;
    const zeroWages = settlementWithWages(settlement, new Map());
    const fiscal = runFiscalPhase(noWagesWorld, zeroWages, noWagesWorld.dayIndex);
    expect(fiscal.totals.incomeTaxSUSD).toBe(0);
    expect(postingsOfKind(noWagesWorld, "income-tax")).toHaveLength(0);
  });

  test("uses actual partial wages and combines multiple employers", () => {
    const scenario = fiscalScenario({ rate: 0.2 });
    const world = buildWorld(scenario);
    const settlement = runSettlement(scenario, world).settlement;
    const [firstBlock, secondBlock] = world.popBlocks;
    if (firstBlock === undefined || secondBlock === undefined) throw new Error("missing blocks");
    const wages = new Map<number, number>([
      [firstBlock.id, 50],
      [secondBlock.id, 0],
    ]);
    const fiscal = runFiscalPhase(world, settlementWithWages(settlement, wages), world.dayIndex);
    const first = fiscal.blocks.find((block) => block.popBlockId === firstBlock.id);
    const second = fiscal.blocks.find((block) => block.popBlockId === secondBlock.id);
    expect(first?.incomeTaxSUSD).toBeCloseTo(10, 9);
    expect(second?.incomeTaxSUSD).toBe(0);
    expect(fiscal.totals.incomeTaxSUSD).toBeCloseTo(10, 9);
  });

  test("does not tax welfare or wealth", () => {
    const scenario = fiscalScenario({ rate: 0, budget: 365_000, treasuryCash: 1_000 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    expect(economy.fiscal.totals.incomeTaxSUSD).toBe(0);
    expect(economy.fiscal.totals.welfarePaidSUSD).toBeGreaterThan(0);
    for (const block of economy.fiscal.blocks) {
      expect(block.incomeTaxSUSD).toBe(0);
    }
  });

  test("fails without mutation when tax would exceed available household cash", () => {
    const scenario = fiscalScenario({ rate: 1 });
    const world = buildWorld(scenario);
    const settlement = runSettlement(scenario, world).settlement;
    const block = world.popBlocks[0]!;
    const cashAccountId = account(world, "popBlock", block.id, "household-cash").id;
    setCashBalance(world, cashAccountId, 0);
    const before = financeHash(world);
    const wages = new Map<number, number>(world.popBlocks.map((candidate) => [candidate.id, 100]));
    expect(() => runFiscalPhase(world, settlementWithWages(settlement, wages), world.dayIndex)).toThrow(
      /exceeds available cash/i,
    );
    expect(financeHash(world)).toBe(before);
  });
});

describe("M4c budgeted welfare transfers", () => {
  test("pays the annual budget share for a 365-day civil year, per capita", () => {
    const scenario = fiscalScenario({ rate: 0, budget: 36_500, treasuryCash: 1_000 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const result = economy.fiscal.countries[0]!;
    expect(result.welfareRequestedSUSD).toBeCloseTo(100, 9);
    expect(result.welfarePaidSUSD).toBeCloseTo(100, 9);
    expect(result.welfareShortfallSUSD).toBe(0);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceSUSD).toBeCloseTo(
      900,
      9,
    );
    expect(account(world, "country", FISCAL_COUNTRY_ID, "welfare-expense").balanceSUSD).toBeCloseTo(
      100,
      9,
    );
    const totalPopulation = world.popBlocks.reduce(
      (total, block) =>
        total +
        block.maleByAge.reduce((sum, value) => sum + value, 0) +
        block.femaleByAge.reduce((sum, value) => sum + value, 0),
      0,
    );
    let allocated = 0;
    for (const block of world.popBlocks) {
      const received =
        economy.fiscal.blocks.find((entry) => entry.popBlockId === block.id)?.welfareReceivedSUSD ?? 0;
      const population =
        block.maleByAge.reduce((sum, value) => sum + value, 0) +
        block.femaleByAge.reduce((sum, value) => sum + value, 0);
      expect(received).toBeCloseTo((100 * population) / totalPopulation, 6);
      allocated += received;
      expect(account(world, "popBlock", block.id, "welfare-income").balanceSUSD).toBeCloseTo(
        received,
        9,
      );
    }
    expect(allocated).toBeCloseTo(100, 9);
  });

  test("uses the leap civil year's day count", () => {
    const leapStart = civilDateToDayIndex(1904, 1, 2);
    const scenario = fiscalScenario({
      rate: 0,
      budget: 36_600,
      treasuryCash: 1_000,
      valuationSetOnDay: leapStart,
    });
    const world = buildWorld(scenario, { startDayIndex: leapStart });
    const economy = runDay(world, scenario);
    expect(economy.fiscal.countries[0]?.welfareRequestedSUSD).toBeCloseTo(100, 9);
    expect(economy.fiscal.countries[0]?.welfarePaidSUSD).toBeCloseTo(100, 9);
  });

  test("reduces transfers proportionally when treasury cash is insufficient", () => {
    const scenario = fiscalScenario({ rate: 0, budget: 3_650_000, treasuryCash: 30 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const result = economy.fiscal.countries[0]!;
    expect(result.welfareRequestedSUSD).toBeCloseTo(10_000, 6);
    expect(result.welfarePaidSUSD).toBeCloseTo(30, 9);
    expect(result.welfareShortfallSUSD).toBeCloseTo(10_000 - 30, 6);
    expect(result.treasuryCashEndSUSD).toBeCloseTo(0, 9);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceSUSD).toBeCloseTo(
      0,
      9,
    );
    expect(account(world, "country", FISCAL_COUNTRY_ID, "welfare-expense").balanceSUSD).toBeCloseTo(
      30,
      9,
    );
    // No debt, arrears, or negative cash is created.
    for (const candidate of world.finance.accounts) {
      if (candidate.category !== "equity") {
        expect(candidate.balanceSUSD).toBeGreaterThanOrEqual(0);
      }
    }
    let paid = 0;
    for (const block of economy.fiscal.blocks) paid += block.welfareReceivedSUSD;
    expect(paid).toBeCloseTo(30, 9);
  });

  test("funds welfare from same-day tax receipts without overdrawing", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 365_000, treasuryCash: 0 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const result = economy.fiscal.countries[0]!;
    expect(result.incomeTaxSUSD).toBeGreaterThan(0);
    expect(result.welfareRequestedSUSD).toBeCloseTo(1_000, 6);
    expect(result.welfarePaidSUSD).toBeCloseTo(result.incomeTaxSUSD, 9);
    expect(result.treasuryCashEndSUSD).toBeCloseTo(0, 9);
    expect(result.welfareShortfallSUSD).toBeCloseTo(1_000 - result.incomeTaxSUSD, 6);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceSUSD).toBeCloseTo(
      0,
      9,
    );
  });

  test("zero budget or zero population creates no invalid posting", () => {
    const zeroBudget = buildWorld(fiscalScenario({ rate: 0, budget: 0 }));
    const zeroEconomy = runDay(zeroBudget, fiscalScenario({ rate: 0, budget: 0 }));
    expect(zeroEconomy.fiscal.totals.welfarePaidSUSD).toBe(0);
    expect(postingsOfKind(zeroBudget, "welfare-transfer")).toHaveLength(0);

    const scenario = fiscalScenario({
      countries: [
        fiscalCountry({ id: 0 }),
        fiscalCountry({
          id: 1,
          tag: "T1",
          regionIds: [],
          treasuryAccountId: 1001,
          initialTreasuryCashSUSD: 100,
          monetary: { kind: "adopted", currencyId: 0 },
          fiscal: { incomeTaxRate: 0, welfareBudgetSUSDPerYear: 36_500 },
        }),
      ],
    });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const second = economy.fiscal.countries.find((country) => country.countryId === 1);
    expect(second?.welfareRequestedSUSD).toBeCloseTo(100, 9);
    expect(second?.welfarePaidSUSD).toBe(0);
    expect(second?.welfareShortfallSUSD).toBeCloseTo(100, 9);
    expect(account(world, "country", 1, "treasury-cash").balanceSUSD).toBe(100);
  });

  test("prevents cross-country tax or welfare leakage", () => {
    const scenario = fiscalScenario({
      rate: 0.1,
      budget: 36_500,
      treasuryCash: 500,
      countries: [
        fiscalCountry({ id: 0, fiscal: { incomeTaxRate: 0.1, welfareBudgetSUSDPerYear: 36_500 }, initialTreasuryCashSUSD: 500 }),
        fiscalCountry({
          id: 1,
          tag: "T1",
          regionIds: [],
          treasuryAccountId: 1001,
          monetary: { kind: "adopted", currencyId: 0 },
          fiscal: { incomeTaxRate: 0.2, welfareBudgetSUSDPerYear: 7_300 },
        }),
      ],
    });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    expect(account(world, "country", 1, "treasury-cash").balanceSUSD).toBe(0);
    expect(account(world, "country", 1, "income-tax-revenue").balanceSUSD).toBe(0);
    const second = economy.fiscal.countries.find((country) => country.countryId === 1);
    expect(second?.incomeTaxSUSD).toBe(0);
    expect(second?.welfarePaidSUSD).toBe(0);
    expect(second?.welfareRequestedSUSD).toBeCloseTo(20, 9);
  });
});

describe("M4c accounting, close, and summaries", () => {
  test("registers the fiscal kinds and designated cash subtype", () => {
    expect(CASH_SUBTYPES).toContain("treasury-cash");
    expect(CASH_NEUTRAL_TRANSACTION_KINDS).toEqual(
      expect.arrayContaining(["income-tax", "welfare-transfer"]),
    );
    expect(FLOW_TRANSACTION_KINDS).toEqual([
      "goods-purchase",
      "input-purchase",
      "wages",
      "upkeep",
    ]);
  });

  test("accepts valid fiscal postings and rejects invalid semantic combinations", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);

    const wrongKind = (kind: "income-tax" | "welfare-transfer", lines: Parameters<typeof postJournalEntry>[3]) => {
      expect(() => postJournalEntry(world.finance, 0, kind, lines)).toThrow(/semantic matrix/i);
    };
    wrongKind("income-tax", [
      { accountId: account(world, "popBlock", 0, "household-cash").id, side: "credit", amountSUSD: 1 },
      { accountId: account(world, "country", 0, "welfare-expense").id, side: "debit", amountSUSD: 1 },
      { accountId: account(world, "country", 0, "treasury-cash").id, side: "debit", amountSUSD: 1 },
      { accountId: account(world, "country", 0, "income-tax-revenue").id, side: "credit", amountSUSD: 1 },
    ]);
    expect(() =>
      postJournalBatch(world.finance, 0, [
        {
          transactionKind: "welfare-transfer",
          lines: [
            { accountId: account(world, "country", 0, "treasury-cash").id, side: "credit", amountSUSD: 1 },
            { accountId: account(world, "popBlock", 0, "welfare-income").id, side: "debit", amountSUSD: 1 },
          ],
        },
      ]),
    ).toThrow(/semantic matrix/i);

    const fiscalClone = cloneWorld(world);
    const posting = postJournalEntry(fiscalClone.finance, 0, "income-tax", [
      { accountId: account(fiscalClone, "popBlock", 0, "income-tax-expense").id, side: "debit", amountSUSD: 1 },
      { accountId: account(fiscalClone, "popBlock", 0, "household-cash").id, side: "credit", amountSUSD: 1 },
      { accountId: account(fiscalClone, "country", 0, "treasury-cash").id, side: "debit", amountSUSD: 1 },
      { accountId: account(fiscalClone, "country", 0, "income-tax-revenue").id, side: "credit", amountSUSD: 1 },
    ]);
    expect(posting.transactionKind).toBe("income-tax");
    expect(account(fiscalClone, "country", 0, "treasury-cash").balanceSUSD).toBe(1);
    expect(account(fiscalClone, "country", 0, "income-tax-revenue").balanceSUSD).toBe(1);
    expect(account(fiscalClone, "popBlock", 0, "income-tax-expense").balanceSUSD).toBe(1);
    expect(() => assertValidWorld(fiscalClone)).not.toThrow();
  });

  test("persisted fiscal postings are structurally validated", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);
    const index = buildFinanceIndex(world.finance);
    const invalid: JournalPosting = {
      id: 1,
      dayIndex: 0,
      transactionKind: "welfare-transfer",
      lines: [
        { accountId: account(world, "country", 0, "treasury-cash").id, side: "debit", amountSUSD: 1 },
        { accountId: account(world, "system", null, "system-income").id, side: "credit", amountSUSD: 1 },
      ],
      sourceEntityId: null,
      targetEntityId: null,
    };
    expect(() => assertValidJournalPosting(invalid, index.byId)).toThrow(/semantic matrix/i);
  });

  test("keeps the M4b four-flow summary and closes country accounts into equity", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 3_650, treasuryCash: 5_000 });
    const world = buildWorld(scenario);
    let tax = 0;
    let welfare = 0;
    let close: ReturnType<typeof runDay>["financeClose"] = null;
    for (let day = 0; day < 31; day += 1) {
      const economy = runDay(world, scenario);
      tax += economy.fiscal.totals.incomeTaxSUSD;
      welfare += economy.fiscal.totals.welfarePaidSUSD;
      if (economy.financeClose !== null) close = economy.financeClose;
    }
    expect(close).not.toBeNull();
    expect(world.finance.periodSummaries).toHaveLength(1);
    const summary = world.finance.periodSummaries[0]!;
    expect(Object.keys(summary.flowTotalsByKind).sort()).toEqual(
      [...FLOW_TRANSACTION_KINDS].sort(),
    );
    for (const kind of FLOW_TRANSACTION_KINDS) {
      expect(summary.flowTotalsByKind[kind]).toBeGreaterThanOrEqual(0);
    }
    expect(summary.accountTotals[FISCAL_TREASURY_ACCOUNT_ID]).toBeCloseTo(5_000 + tax - welfare, 6);
    expect(summary.accountTotals[account(world, "country", 0, "income-tax-revenue").id]).toBeCloseTo(
      tax,
      6,
    );
    expect(summary.accountTotals[account(world, "country", 0, "welfare-expense").id]).toBeCloseTo(
      welfare,
      6,
    );
    expect(account(world, "country", 0, "income-tax-revenue").balanceSUSD).toBe(0);
    expect(account(world, "country", 0, "welfare-expense").balanceSUSD).toBe(0);
    expect(account(world, "country", 0, "owner-equity").balanceSUSD).toBeCloseTo(
      5_000 + tax - welfare,
      6,
    );
    expect(account(world, "country", 0, "treasury-cash").balanceSUSD).toBeCloseTo(
      5_000 + tax - welfare,
      6,
    );
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
    expect(() => assertValidWorld(world)).not.toThrow();
  });
});

describe("M4c integration, wealth effect, and determinism", () => {
  test("reconciles treasury and household cash over many days", () => {
    const scenario = fiscalScenario({ rate: 0.08, budget: 73_000, treasuryCash: 2_000 });
    const world = buildWorld(scenario);
    let expectedTreasury = 2_000;
    for (let day = 0; day < 90; day += 1) {
      const openingCash = new Map(
        world.popBlocks.map((block) => [
          block.id,
          account(world, "popBlock", block.id, "household-cash").balanceSUSD,
        ]),
      );
      const economy = runDay(world, scenario);
      const fiscal = economy.fiscal;
      expectedTreasury += fiscal.totals.incomeTaxSUSD - fiscal.totals.welfarePaidSUSD;
      expect(account(world, "country", 0, "treasury-cash").balanceSUSD).toBeCloseTo(
        expectedTreasury,
        6,
      );
      for (const block of world.popBlocks) {
        const fiscalBlock = fiscal.blocks.find((entry) => entry.popBlockId === block.id);
        const settlementHousehold = economy.settlement.households.find(
          (entry) => entry.popBlockId === block.id,
        );
        if (settlementHousehold === undefined) continue;
        expect(account(world, "popBlock", block.id, "household-cash").balanceSUSD).toBeCloseTo(
          (openingCash.get(block.id) ?? 0) +
            settlementHousehold.wagesReceivedSUSD -
            settlementHousehold.marketPurchasesSUSD +
            (fiscalBlock?.welfareReceivedSUSD ?? 0) -
            (fiscalBlock?.incomeTaxSUSD ?? 0),
          6,
        );
      }
      for (const candidate of world.finance.accounts) {
        if (candidate.category !== "equity") {
          expect(candidate.balanceSUSD).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("welfare received affects the next day's funded demand", () => {
    const poor = marketScenario();
    poor.employment = [];
    for (const block of poor.population.popBlocks) {
      block.initialSavingsSUSD = 0;
    }
    const currency = {
      id: 0,
      key: "tst",
      name: "Test Currency",
      issuer: { kind: "country" as const, countryId: 0 },
    };
    const valuation = {
      currencyId: 0,
      status: "specified" as const,
      susdPerUnit: asSusdPerCurrencyUnit(1),
      setOnDay: 0,
      source: "scenario" as const,
    };
    const funded: EconomyScenarioDef = {
      ...poor,
      countries: [
        fiscalCountry({
          initialTreasuryCashSUSD: 1_000,
          fiscal: { incomeTaxRate: 0, welfareBudgetSUSDPerYear: 365_000 },
        }),
      ],
      currencies: [currency],
      currencyValuations: [valuation],
    };
    const unfunded: EconomyScenarioDef = {
      ...poor,
      countries: [fiscalCountry({ fiscal: zeroFiscalPolicy() })],
      currencies: [currency],
      currencyValuations: [valuation],
    };
    const fundedWorld = buildWorld(funded);
    const unfundedWorld = buildWorld(unfunded);
    runDay(fundedWorld, funded);
    runDay(unfundedWorld, unfunded);
    const fundedDay = runDay(fundedWorld, funded);
    const unfundedDay = runDay(unfundedWorld, unfunded);
    const fundedSpend = fundedDay.population.needs.blocks.reduce(
      (total, block) => total + block.budgetStartSUSD,
      0,
    );
    const unfundedSpend = unfundedDay.population.needs.blocks.reduce(
      (total, block) => total + block.budgetStartSUSD,
      0,
    );
    expect(fundedSpend).toBeGreaterThan(0);
    expect(fundedSpend).toBeGreaterThan(unfundedSpend);
    expect(fundedDay.population.needs.blocks.some((block) => block.spentSUSD > 0)).toBe(true);
  });

  test("month-end wealth uses wages plus welfare and mandatory income tax", () => {
    const scenario = fiscalScenario({ rate: 0.2, budget: 365_000, treasuryCash: 10_000 });
    const world = buildWorld(scenario);
    let fiscalDay: ReturnType<typeof runDay> | null = null;
    let lastSet = 0;
    for (let day = 0; day < 31; day += 1) {
      const economy = runDay(world, scenario);
      lastSet = day;
      if (economy.population.wealthUpdates.length > 0) fiscalDay = economy;
    }
    expect(lastSet).toBe(30);
    if (fiscalDay === null) throw new Error("expected a month-end wealth update");
    const fiscal = fiscalDay.fiscal;
    for (const update of fiscalDay.population.wealthUpdates) {
      const block = world.popBlocks.find((candidate) => candidate.id === update.popBlockId)!;
      const wages = fiscalDay.settlement.households.find(
        (entry) => entry.popBlockId === block.id,
      )!.wagesReceivedSUSD;
      const welfare = fiscal.blocks.find((entry) => entry.popBlockId === block.id)?.welfareReceivedSUSD ?? 0;
      const tax = fiscal.blocks.find((entry) => entry.popBlockId === block.id)?.incomeTaxSUSD ?? 0;
      const population =
        block.maleByAge.reduce((sum, value) => sum + value, 0) +
        block.femaleByAge.reduce((sum, value) => sum + value, 0);
      if (population === 0) continue;
      expect(update.annualDisposableIncomePerCapitaSUSD).toBeCloseTo(
        Math.max(0, ((wages + welfare - tax) / population) * 365),
        6,
      );
    }
  });

  test("repeated runs and save/resume produce identical hashes", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 36_500, treasuryCash: 500 });
    const first = buildWorld(scenario);
    const second = buildWorld(scenario);
    for (let day = 0; day < 40; day += 1) {
      runDay(first, scenario);
      runDay(second, scenario);
    }
    expect(hashWorld(first)).toBe(hashWorld(second));

    const saved = buildWorld(scenario);
    for (let day = 0; day < 17; day += 1) runDay(saved, scenario);
    const resumed = deserializeWorld(serializeWorld(saved));
    for (let day = 0; day < 23; day += 1) {
      runDay(saved, scenario);
      runDay(resumed, scenario);
    }
    expect(hashWorld(resumed)).toBe(hashWorld(saved));
  });

  test("fiscal iteration order does not change balances or totals", () => {
    const scenario = fiscalScenario({ rate: 0.13, budget: 50_000, treasuryCash: 1_000 });
    const first = buildWorld(scenario);
    const second = buildWorld(scenario);
    second.popBlocks = [...second.popBlocks].reverse();
    const settlementFirst = runSettlement(scenario, first).settlement;
    const settlementSecond = runSettlement(scenario, second).settlement;
    const fiscalFirst = runFiscalPhase(first, settlementFirst, first.dayIndex);
    const fiscalSecond = runFiscalPhase(second, settlementSecond, second.dayIndex);
    expect(fiscalSecond.totals).toEqual(fiscalFirst.totals);
    const balanceOf = (world: World, blockId: number, subtype: Parameters<typeof accountOf>[3]): number =>
      account(world, "popBlock", blockId, subtype).balanceSUSD;
    for (const block of first.popBlocks) {
      expect(balanceOf(second, block.id, "household-cash")).toBeCloseTo(
        balanceOf(first, block.id, "household-cash"),
        6,
      );
      expect(balanceOf(second, block.id, "income-tax-expense")).toBeCloseTo(
        balanceOf(first, block.id, "income-tax-expense"),
        9,
      );
      expect(balanceOf(second, block.id, "welfare-income")).toBeCloseTo(
        balanceOf(first, block.id, "welfare-income"),
        9,
      );
    }
  });

  test("M2-only worlds do not execute the fiscal phase", () => {
    const { scenario, world } = aggregateWorld(SEED);
    const inputs = makeInputs(world.popBlocks.map((block) => block.id));
    const result = tick(world, contextFor(scenario, inputs));
    expect(result.advanced).toBe(true);
    expect(result.economy).toBeUndefined();
    expect(world.finance.postings).toHaveLength(0);
    expect(world.countries).toHaveLength(0);
    expect(
      world.finance.accounts.some((candidate) => candidate.ownerKind === "country"),
    ).toBe(false);
  });
});
