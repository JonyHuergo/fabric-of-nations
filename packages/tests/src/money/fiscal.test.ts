import {
  CASH_NEUTRAL_TRANSACTION_KINDS,
  CASH_SUBTYPES,
  FLOW_TRANSACTION_KINDS,
  accountingTotals,
  applyOpeningBalances,
  asRusdPerCurrencyUnit,
  assertAccountingIdentity,
  assertValidJournalPosting,
  assertValidWorld,
  buildFinanceIndex,
  civilDateToDayIndex,
  cloneWorld,
  createEconomyWorld,
  dayIndexToCivilDate,
  designatedCashTotal,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  populationTotal,
  postJournalBatch,
  postJournalEntry,
  serializeWorld,
  tick,
  type AccountSubtype,
  type EconomyScenarioDef,
  type FinancialAccount,
  type JournalPosting,
  type MarketSettlementResult,
  type TickResult,
  type World,
  countryProvinceIds,
} from "@century/sim";
import {
  __runFiscalPhaseWithHooks,
  runFiscalPhase,
} from "../../../sim/src/economy/fiscal.js";
import { checksumOfJson } from "../../../sim/src/hash.js";
import { economyTickContext, runSettlement, setCashBalance } from "../fixtures/m3e.js";
import { marketScenario } from "../fixtures/m3d.js";
import { aggregateWorld, contextFor, makeInputs } from "../fixtures/m2.js";
import {
  FISCAL_COUNTRY_ID,
  FISCAL_TREASURY_ACCOUNT_ID,
  fiscalCountry,
  fiscalScenario,
  zeroFiscalPolicy,
} from "../fixtures/m4c.js";
import * as simApi from "@century/sim";

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
      wagesReceivedRUSD: wagesByBlock.get(household.popBlockId) ?? 0,
    })),
  };
}

/** Add a populated block with no employment assignment to a fiscal scenario. */
/**
 * A populated block without wage jobs. D-155: the labour market keeps one block per
 * profession and province, so the fixture's own capitalist block (profession 3, which
 * holds no wage job) is given the population instead of a second capitalist block.
 */
function withPopulatedUnemployedBlock(scenario: EconomyScenarioDef): EconomyScenarioDef {
  return {
    ...scenario,
    population: {
      ...scenario.population,
      popBlocks: scenario.population.popBlocks.map((block) =>
        block.professionId === 3
          ? {
              ...block,
              maleAgeGroups: Array.from({ length: 17 }, () => 100),
              femaleAgeGroups: Array.from({ length: 17 }, () => 100),
              literacy: 0.2,
              wealthLevel: 30,
              initialSavingsRUSD: 100,
              militancy: 0.1,
            }
          : block,
      ),
    },
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
      incomeTaxAllowanceRUSDPerYear: 0,
      welfareBudgetRUSDPerYear: 36_500,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetRUSD: 0,
    });
    expect(account(world, "country", country.id, "treasury-cash").id).toBe(
      FISCAL_TREASURY_ACCOUNT_ID,
    );
    expect(account(world, "country", country.id, "treasury-cash").balanceRUSD).toBe(500);
    expect(account(world, "country", country.id, "owner-equity").balanceRUSD).toBe(500);
    expect(account(world, "country", country.id, "income-tax-revenue").balanceRUSD).toBe(0);
    expect(account(world, "country", country.id, "welfare-expense").balanceRUSD).toBe(0);
    for (const block of world.popBlocks) {
      expect(account(world, "popBlock", block.id, "income-tax-expense").balanceRUSD).toBe(0);
      expect(account(world, "popBlock", block.id, "welfare-income").balanceRUSD).toBe(0);
    }
    expect(world.finance.opening).not.toBeNull();
    expect(() => applyOpeningBalances(world.finance, 0, [])).toThrow(/already been applied/i);
    expect(() => assertValidWorld(world)).not.toThrow();
    expect(accountingTotals(world.finance).assets).toBeCloseTo(
      accountingTotals(world.finance).equity,
      9,
    );
  });

  test("creates fiscal accounts only for worlds that declare a country", () => {
    const countryless = createEconomyWorld(marketScenario(), { seed: SEED });
    for (const block of countryless.popBlocks) {
      expect(
        countryless.finance.accounts.some(
          (candidate) =>
            candidate.ownerKind === "popBlock" &&
            candidate.ownerId === block.id &&
            (candidate.subtype === "income-tax-expense" || candidate.subtype === "welfare-income"),
        ),
      ).toBe(false);
    }
    expect(
      countryless.finance.accounts.some((candidate) => candidate.ownerKind === "country"),
    ).toBe(false);

    const fiscal = buildWorld(fiscalScenario({ rate: 0, budget: 0 }));
    for (const block of fiscal.popBlocks) {
      expect(account(fiscal, "popBlock", block.id, "income-tax-expense").balanceRUSD).toBe(0);
      expect(account(fiscal, "popBlock", block.id, "welfare-income").balanceRUSD).toBe(0);
    }
    expect(fiscal.finance.accounts.some((candidate) => candidate.ownerKind === "country")).toBe(
      true,
    );
  });

  test("zero-fiscal countries keep unowned provinces valid, active fiscal requires ownership", () => {
    const zero = buildWorld(
      fiscalScenario({
        countries: [fiscalCountry({ provinceIds: [], fiscal: zeroFiscalPolicy() })],
      }),
    );
    expect(countryProvinceIds(zero, zero.countries[0]!.id)).toEqual([]);

    const unowned = fiscalScenario({
      countries: [fiscalCountry({ provinceIds: [], fiscal: { incomeTaxRate: 0.1, welfareBudgetRUSDPerYear: 0 } })],
    });
    expect(() => buildWorld(unowned)).toThrow(/owned by exactly one country/i);

    const unownedBudget = fiscalScenario({
      countries: [
        fiscalCountry({ provinceIds: [], fiscal: { incomeTaxRate: 0, welfareBudgetRUSDPerYear: 10 } }),
      ],
    });
    expect(() => buildWorld(unownedBudget)).toThrow(/owned by exactly one country/i);
  });

  test("rejects invalid fiscal values and treasury declarations", () => {
    const bad = (fiscal: { incomeTaxRate: number; welfareBudgetRUSDPerYear: number }): void => {
      expect(() => buildWorld(fiscalScenario({ countries: [fiscalCountry({ fiscal })] }))).toThrow();
    };
    bad({ incomeTaxRate: Number.NaN, welfareBudgetRUSDPerYear: 0 });
    bad({ incomeTaxRate: Number.POSITIVE_INFINITY, welfareBudgetRUSDPerYear: 0 });
    bad({ incomeTaxRate: -0.01, welfareBudgetRUSDPerYear: 0 });
    bad({ incomeTaxRate: 1.01, welfareBudgetRUSDPerYear: 0 });
    bad({ incomeTaxRate: 0, welfareBudgetRUSDPerYear: -1 });
    bad({ incomeTaxRate: 0, welfareBudgetRUSDPerYear: Number.NaN });
    bad({ incomeTaxRate: 0, welfareBudgetRUSDPerYear: Number.POSITIVE_INFINITY });
    bad({ incomeTaxRate: 0, welfareBudgetRUSDPerYear: 1e16 });

    const negativeCash = fiscalScenario({
      countries: [fiscalCountry({ initialTreasuryCashRUSD: -1 })],
    });
    expect(() => buildWorld(negativeCash)).toThrow(/non-negative/i);

    const colliding = fiscalScenario({
      countries: [fiscalCountry({ treasuryAccountId: 10 })],
    });
    expect(() => buildWorld(colliding)).toThrow(/duplicate .*account id/i);

    const duplicateTreasury = fiscalScenario({
      countries: [
        fiscalCountry({ id: 0 }),
        fiscalCountry({ id: 1, tag: "T1", provinceIds: [], treasuryAccountId: FISCAL_TREASURY_ACCOUNT_ID }),
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
          fiscal: { incomeTaxRate: number; welfareBudgetRUSDPerYear: number };
        }[];
      };
    };
    expect(parsed.payload.countries[0]?.treasuryAccountId).toBe(FISCAL_TREASURY_ACCOUNT_ID);
    expect(parsed.payload.countries[0]?.fiscal).toEqual({
      incomeTaxRate: 0.15,
      incomeTaxAllowanceRUSDPerYear: 0,
      welfareBudgetRUSDPerYear: 12_000,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetRUSD: 0,
    });

    const restored = deserializeWorld(serialized);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(restored.countries[0]?.fiscal).toEqual(world.countries[0]?.fiscal);

    const clone = cloneWorld(world);
    clone.countries[0]!.fiscal.incomeTaxRate = 0;
    clone.provinces.ownership[0]!.ownerPolityId = 7;
    expect(world.countries[0]?.fiscal.incomeTaxRate).toBe(0.15);
    expect(countryProvinceIds(world, world.countries[0]!.id)).toEqual([0]);
  });

  test("rejects malformed persisted fiscal state during decode", () => {
    const world = buildWorld(fiscalScenario({ rate: 0.1 }));
    const saved = JSON.parse(serializeWorld(world)) as {
      checksum: string;
      payload: {
        countries: {
          fiscal?: { incomeTaxRate: number; welfareBudgetRUSDPerYear: number };
        }[];
      };
    };
    const first = saved.payload.countries[0];
    if (first === undefined || first.fiscal === undefined) throw new Error("missing fiscal state");
    first.fiscal = { ...first.fiscal, incomeTaxRate: 2 };
    saved.checksum = checksumOfJson(saved.payload);
    expect(() => deserializeWorld(JSON.stringify(saved))).toThrow(/invalid world state|incomeTaxRate/i);

    delete first.fiscal;
    saved.checksum = checksumOfJson(saved.payload);
    expect(() => deserializeWorld(JSON.stringify(saved))).toThrow(/fiscal|Invalid save data/i);
  });
});

describe("M4c daily income tax", () => {
  test("withholds the flat rate on wages actually received and reconciles cash", () => {
    const scenario = fiscalScenario({ rate: 0.125 });
    const world = buildWorld(scenario);
    const treasuryBefore = account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD;
    const economy = runDay(world, scenario);
    const fiscal = economy.fiscal;
    const wagesByBlock = new Map(
      economy.settlement.households.map((household) => [
        household.popBlockId,
        household.wagesReceivedRUSD,
      ]),
    );
    const endingByBlock = new Map(
      economy.settlement.households.map((household) => [
        household.popBlockId,
        household.endingCashAfterSettlementRUSD,
      ]),
    );
    let taxTotal = 0;
    for (const block of fiscal.blocks) {
      const wages = wagesByBlock.get(block.popBlockId) ?? 0;
      expect(block.incomeTaxRUSD).toBeCloseTo(0.125 * wages, 9);
      expect(account(world, "popBlock", block.popBlockId, "income-tax-expense").balanceRUSD).toBeCloseTo(
        block.incomeTaxRUSD,
        9,
      );
      expect(account(world, "popBlock", block.popBlockId, "household-cash").balanceRUSD).toBeCloseTo(
        (endingByBlock.get(block.popBlockId) ?? 0) - block.incomeTaxRUSD,
        9,
      );
      expect(block.endingCashAfterFiscalRUSD).toBeCloseTo(
        account(world, "popBlock", block.popBlockId, "household-cash").balanceRUSD,
        9,
      );
      taxTotal += block.incomeTaxRUSD;
    }
    for (const household of economy.settlement.households) {
      const fiscalBlock = fiscal.blocks.find(
        (entry) => entry.popBlockId === household.popBlockId,
      );
      expect(household.endingCashAfterSettlementRUSD).toBeCloseTo(
        account(world, "popBlock", household.popBlockId, "household-cash").balanceRUSD +
          (fiscalBlock?.incomeTaxRUSD ?? 0) -
          (fiscalBlock?.welfareReceivedRUSD ?? 0),
        9,
      );
    }
    const needsBlock = economy.population.needs.blocks[0];
    const firstHousehold = economy.settlement.households.find(
      (entry) => entry.popBlockId === needsBlock?.popBlockId,
    );
    if (needsBlock !== undefined && firstHousehold !== undefined) {
      expect(needsBlock.budgetStartBeforeNeedsRUSD).toBeCloseTo(
        firstHousehold.initialCashRUSD,
        9,
      );
      expect(needsBlock.budgetEndAfterNeedsRUSD).toBeCloseTo(
        firstHousehold.initialCashRUSD - firstHousehold.marketPurchasesRUSD,
        9,
      );
    }
    expect(fiscal.totals.incomeTaxRUSD).toBeCloseTo(taxTotal, 9);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD).toBeCloseTo(
      treasuryBefore + taxTotal,
      9,
    );
    expect(account(world, "country", FISCAL_COUNTRY_ID, "income-tax-revenue").balanceRUSD).toBeCloseTo(
      taxTotal,
      9,
    );
    // Gross wage income is recorded at the full settled amount.
    let wageIncome = 0;
    for (const block of world.popBlocks) {
      wageIncome += account(world, "popBlock", block.id, "wage-income").balanceRUSD;
    }
    expect(wageIncome).toBeCloseTo(economy.settlement.totals.wagesPaidRUSD, 9);
    expect(designatedCashTotal(world.finance)).toBeCloseTo(
      economy.settlement.totals.endingCashAfterSettlementRUSD,
      9,
    );
  });

  test("supports a successful 100% income tax", () => {
    const scenario = fiscalScenario({ rate: 1, budget: 0 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const wagesByBlock = new Map(
      economy.settlement.households.map((household) => [
        household.popBlockId,
        household.wagesReceivedRUSD,
      ]),
    );
    let taxTotal = 0;
    for (const block of economy.fiscal.blocks) {
      const wages = wagesByBlock.get(block.popBlockId) ?? 0;
      expect(block.incomeTaxRUSD).toBeCloseTo(wages, 9);
      expect(account(world, "popBlock", block.popBlockId, "household-cash").balanceRUSD).toBeCloseTo(
        (economy.settlement.households.find(
          (entry) => entry.popBlockId === block.popBlockId,
        )?.endingCashAfterSettlementRUSD ?? 0) - block.incomeTaxRUSD,
        9,
      );
      taxTotal += block.incomeTaxRUSD;
    }
    expect(economy.fiscal.totals.incomeTaxRUSD).toBeCloseTo(taxTotal, 9);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD).toBeCloseTo(
      taxTotal,
      9,
    );
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("a zero rate or genuinely unemployed block produces no tax", () => {
    const zeroRate = fiscalScenario({ rate: 0 });
    const world = buildWorld(zeroRate);
    const economy = runDay(world, zeroRate);
    expect(economy.fiscal.totals.incomeTaxRUSD).toBe(0);
    expect(postingsOfKind(world, "income-tax")).toHaveLength(0);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD).toBe(0);

    const rateScenario = withPopulatedUnemployedBlock(fiscalScenario({ rate: 0.5 }));
    const noWageWorld = buildWorld(rateScenario);
    const noWageEconomy = runDay(noWageWorld, rateScenario);
    const unemployed = noWageEconomy.settlement.households.find(
      (household) => household.wagesReceivedRUSD === 0,
    );
    if (unemployed === undefined) throw new Error("expected a genuinely unemployed block");
    const fiscalBlock = noWageEconomy.fiscal.blocks.find(
      (entry) => entry.popBlockId === unemployed.popBlockId,
    );
    expect(fiscalBlock?.incomeTaxRUSD).toBe(0);
    expect(postingsOfKind(noWageWorld, "income-tax").length).toBeGreaterThan(0);
  });

  test("combines real payments from multiple employers for one block", () => {
    const scenario = fiscalScenario({ rate: 0.2 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const blockId = 1;
    const employerIds = economy.settlement.wages
      .filter((settlement) =>
        settlement.payments.some((payment) => payment.popBlockId === blockId),
      )
      .map((settlement) => settlement.buildingId)
      .sort((left, right) => left - right);
    expect(employerIds.length).toBeGreaterThanOrEqual(2);
    const household = economy.settlement.households.find(
      (entry) => entry.popBlockId === blockId,
    );
    if (household === undefined) throw new Error("missing household settlement");
    const fiscalBlock = economy.fiscal.blocks.find((entry) => entry.popBlockId === blockId);
    expect(fiscalBlock?.incomeTaxRUSD).toBeCloseTo(0.2 * household.wagesReceivedRUSD, 9);
  });

  test("uses a genuine employer funding shortfall as the tax base", () => {
    const scenario = fiscalScenario({ rate: 0.5 });
    const world = buildWorld(scenario);
    const buildingCash = account(world, "building", 0, "operating-cash");
    setCashBalance(world, buildingCash.id, 1);
    const settlement = runSettlement(scenario, world).settlement;
    const wage = settlement.wages.find((entry) => entry.buildingId === 0);
    if (wage === undefined) throw new Error("missing building wage settlement");
    expect(wage.unpaidRUSD).toBeGreaterThan(0);
    const fiscal = runFiscalPhase(world, settlement, world.dayIndex);
    const fiscalBlock = fiscal.blocks.find((entry) => entry.popBlockId === 0);
    expect(fiscalBlock?.incomeTaxRUSD).toBeCloseTo(0.5 * wage.paidRUSD, 9);
  });

  test("does not tax welfare or wealth at a nonzero rate", () => {
    const base = withPopulatedUnemployedBlock(
      fiscalScenario({ rate: 0.5, budget: 365_000, treasuryCash: 1_000 }),
    );
    const scenario: EconomyScenarioDef = base;
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const unemployed = economy.settlement.households.find((household) => {
      const block = world.popBlocks.find((candidate) => candidate.id === household.popBlockId);
      return household.wagesReceivedRUSD === 0 && block !== undefined && populationTotal(block) > 0;
    });
    if (unemployed === undefined) throw new Error("expected a populated unemployed block");
    const fiscalBlock = economy.fiscal.blocks.find(
      (entry) => entry.popBlockId === unemployed.popBlockId,
    );
    expect(fiscalBlock?.incomeTaxRUSD).toBe(0);
    expect(fiscalBlock?.welfareReceivedRUSD).toBeGreaterThan(0);
    const paidHousehold = economy.settlement.households.find(
      (household) => household.wagesReceivedRUSD > 0,
    );
    if (paidHousehold === undefined) throw new Error("expected an employed block");
    const paidFiscal = economy.fiscal.blocks.find(
      (entry) => entry.popBlockId === paidHousehold.popBlockId,
    );
    expect(paidFiscal?.incomeTaxRUSD).toBeCloseTo(0.5 * paidHousehold.wagesReceivedRUSD, 9);
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
    expect(result.welfareRequestedRUSD).toBeCloseTo(100, 9);
    expect(result.welfarePaidRUSD).toBeCloseTo(100, 9);
    expect(result.welfareShortfallRUSD).toBe(0);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD).toBeCloseTo(
      900,
      9,
    );
    expect(account(world, "country", FISCAL_COUNTRY_ID, "welfare-expense").balanceRUSD).toBeCloseTo(
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
        economy.fiscal.blocks.find((entry) => entry.popBlockId === block.id)?.welfareReceivedRUSD ?? 0;
      const population =
        block.maleByAge.reduce((sum, value) => sum + value, 0) +
        block.femaleByAge.reduce((sum, value) => sum + value, 0);
      expect(received).toBeCloseTo((100 * population) / totalPopulation, 6);
      allocated += received;
      expect(account(world, "popBlock", block.id, "welfare-income").balanceRUSD).toBeCloseTo(
        received,
        9,
      );
    }
    expect(allocated).toBeCloseTo(100, 9);
  });

  test("allocates a one-unit welfare budget exactly with a deterministic residual", () => {
    const scenario = fiscalScenario({ rate: 0, budget: 365, treasuryCash: 1 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const allocations = economy.fiscal.blocks.map((block) => block.welfareReceivedRUSD);
    expect(allocations.reduce((total, value) => total + value, 0)).toBeCloseTo(1, 12);
    expect(allocations.some((value) => value > 0)).toBe(true);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD).toBe(0);
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
    expect(economy.fiscal.countries[0]?.welfareRequestedRUSD).toBeCloseTo(100, 9);
    expect(economy.fiscal.countries[0]?.welfarePaidRUSD).toBeCloseTo(100, 9);
  });

  test("reduces transfers proportionally when treasury cash is insufficient", () => {
    const scenario = fiscalScenario({ rate: 0, budget: 3_650_000, treasuryCash: 30 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const result = economy.fiscal.countries[0]!;
    expect(result.welfareRequestedRUSD).toBeCloseTo(10_000, 6);
    expect(result.welfarePaidRUSD).toBeCloseTo(30, 9);
    expect(result.welfareShortfallRUSD).toBeCloseTo(10_000 - 30, 6);
    expect(result.treasuryCashEndRUSD).toBeCloseTo(0, 9);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD).toBeCloseTo(
      0,
      9,
    );
    expect(account(world, "country", FISCAL_COUNTRY_ID, "welfare-expense").balanceRUSD).toBeCloseTo(
      30,
      9,
    );
    // No debt, arrears, or negative cash is created.
    for (const candidate of world.finance.accounts) {
      if (candidate.category !== "equity") {
        expect(candidate.balanceRUSD).toBeGreaterThanOrEqual(0);
      }
    }
    let paid = 0;
    for (const block of economy.fiscal.blocks) paid += block.welfareReceivedRUSD;
    expect(paid).toBeCloseTo(30, 9);
  });

  test("funds welfare from same-day tax receipts without overdrawing", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 365_000, treasuryCash: 0 });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const result = economy.fiscal.countries[0]!;
    expect(result.incomeTaxRUSD).toBeGreaterThan(0);
    expect(result.welfareRequestedRUSD).toBeCloseTo(1_000, 6);
    expect(result.welfarePaidRUSD).toBeCloseTo(result.incomeTaxRUSD, 9);
    expect(result.treasuryCashEndRUSD).toBeCloseTo(0, 9);
    expect(result.welfareShortfallRUSD).toBeCloseTo(1_000 - result.incomeTaxRUSD, 6);
    expect(account(world, "country", FISCAL_COUNTRY_ID, "treasury-cash").balanceRUSD).toBeCloseTo(
      0,
      9,
    );
  });

  test("zero budget or zero population creates no invalid posting", () => {
    const zeroBudget = buildWorld(fiscalScenario({ rate: 0, budget: 0 }));
    const zeroEconomy = runDay(zeroBudget, fiscalScenario({ rate: 0, budget: 0 }));
    expect(zeroEconomy.fiscal.totals.welfarePaidRUSD).toBe(0);
    expect(postingsOfKind(zeroBudget, "welfare-transfer")).toHaveLength(0);

    const scenario = fiscalScenario({
      countries: [
        fiscalCountry({ id: 0 }),
        fiscalCountry({
          id: 1,
          tag: "T1",
          provinceIds: [],
          treasuryAccountId: 1001,
          initialTreasuryCashRUSD: 100,
          monetary: { kind: "adopted", currencyId: 0 },
          fiscal: { incomeTaxRate: 0, welfareBudgetRUSDPerYear: 36_500 },
        }),
      ],
    });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const second = economy.fiscal.countries.find((country) => country.countryId === 1);
    expect(second?.welfareRequestedRUSD).toBeCloseTo(100, 9);
    expect(second?.welfarePaidRUSD).toBe(0);
    expect(second?.welfareShortfallRUSD).toBeCloseTo(100, 9);
    expect(account(world, "country", 1, "treasury-cash").balanceRUSD).toBe(100);
  });

  test("excludes a zero-population block from welfare and tax", () => {
    const base = fiscalScenario({ rate: 0, budget: 36_500, treasuryCash: 1_000 });
    // D-155: one block per profession and province, so the zero-population block is the
    // fixture's own peasant block emptied (formerly a second peasant block).
    const zero = base.population.popBlocks.find((block) => block.professionId === 0)!;
    const scenario: EconomyScenarioDef = {
      ...base,
      population: {
        ...base.population,
        popBlocks: base.population.popBlocks.map((block) =>
          block.id === zero.id
            ? {
                ...block,
                maleAgeGroups: Array.from({ length: 17 }, () => 0),
                femaleAgeGroups: Array.from({ length: 17 }, () => 0),
                initialSavingsRUSD: 0,
              }
            : block,
        ),
      },
      employment: base.employment.filter((assignment) => assignment.popBlockId !== zero.id),
    };
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    const zeroFiscal = economy.fiscal.blocks.find((entry) => entry.popBlockId === zero.id);
    expect(zeroFiscal?.welfareReceivedRUSD).toBe(0);
    expect(zeroFiscal?.incomeTaxRUSD).toBe(0);
    expect(zeroFiscal?.endingCashAfterFiscalRUSD).toBe(0);
    expect(populationTotal(world.popBlocks.find((block) => block.id === zero.id)!)).toBe(0);
    expect(account(world, "popBlock", zero.id, "household-cash").balanceRUSD).toBe(0);
  });

  test("prevents cross-country tax or welfare leakage", () => {
    const scenario = fiscalScenario({
      rate: 0.1,
      budget: 36_500,
      treasuryCash: 500,
      countries: [
        fiscalCountry({ id: 0, fiscal: { incomeTaxRate: 0.1, welfareBudgetRUSDPerYear: 36_500 }, initialTreasuryCashRUSD: 500 }),
        fiscalCountry({
          id: 1,
          tag: "T1",
          provinceIds: [],
          treasuryAccountId: 1001,
          monetary: { kind: "adopted", currencyId: 0 },
          fiscal: { incomeTaxRate: 0.2, welfareBudgetRUSDPerYear: 7_300 },
        }),
      ],
    });
    const world = buildWorld(scenario);
    const economy = runDay(world, scenario);
    expect(account(world, "country", 1, "treasury-cash").balanceRUSD).toBe(0);
    expect(account(world, "country", 1, "income-tax-revenue").balanceRUSD).toBe(0);
    const second = economy.fiscal.countries.find((country) => country.countryId === 1);
    expect(second?.incomeTaxRUSD).toBe(0);
    expect(second?.welfarePaidRUSD).toBe(0);
    expect(second?.welfareRequestedRUSD).toBeCloseTo(20, 9);
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
      { accountId: account(world, "popBlock", 0, "household-cash").id, side: "credit", amountRUSD: 1 },
      { accountId: account(world, "country", 0, "welfare-expense").id, side: "debit", amountRUSD: 1 },
      { accountId: account(world, "country", 0, "treasury-cash").id, side: "debit", amountRUSD: 1 },
      { accountId: account(world, "country", 0, "income-tax-revenue").id, side: "credit", amountRUSD: 1 },
    ]);
    expect(() =>
      postJournalBatch(world.finance, 0, [
        {
          transactionKind: "welfare-transfer",
          lines: [
            { accountId: account(world, "country", 0, "treasury-cash").id, side: "credit", amountRUSD: 1 },
            { accountId: account(world, "popBlock", 0, "welfare-income").id, side: "debit", amountRUSD: 1 },
          ],
        },
      ]),
    ).toThrow(/semantic matrix/i);

    const fiscalClone = cloneWorld(world);
    const posting = postJournalEntry(fiscalClone.finance, 0, "income-tax", [
      { accountId: account(fiscalClone, "popBlock", 0, "income-tax-expense").id, side: "debit", amountRUSD: 1 },
      { accountId: account(fiscalClone, "popBlock", 0, "household-cash").id, side: "credit", amountRUSD: 1 },
      { accountId: account(fiscalClone, "country", 0, "treasury-cash").id, side: "debit", amountRUSD: 1 },
      { accountId: account(fiscalClone, "country", 0, "income-tax-revenue").id, side: "credit", amountRUSD: 1 },
    ]);
    expect(posting.transactionKind).toBe("income-tax");
    expect(account(fiscalClone, "country", 0, "treasury-cash").balanceRUSD).toBe(1);
    expect(account(fiscalClone, "country", 0, "income-tax-revenue").balanceRUSD).toBe(1);
    expect(account(fiscalClone, "popBlock", 0, "income-tax-expense").balanceRUSD).toBe(1);
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
        { accountId: account(world, "country", 0, "treasury-cash").id, side: "debit", amountRUSD: 1 },
        { accountId: account(world, "system", null, "system-income").id, side: "credit", amountRUSD: 1 },
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
      tax += economy.fiscal.totals.incomeTaxRUSD;
      welfare += economy.fiscal.totals.welfarePaidRUSD;
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
    expect(account(world, "country", 0, "income-tax-revenue").balanceRUSD).toBe(0);
    expect(account(world, "country", 0, "welfare-expense").balanceRUSD).toBe(0);
    expect(account(world, "country", 0, "owner-equity").balanceRUSD).toBeCloseTo(
      5_000 + tax - welfare,
      6,
    );
    expect(account(world, "country", 0, "treasury-cash").balanceRUSD).toBeCloseTo(
      5_000 + tax - welfare,
      6,
    );
    expect(() => assertAccountingIdentity(world.finance)).not.toThrow();
    expect(() => assertValidWorld(world)).not.toThrow();
  });
  test("requires complete fiscal recognition and cash legs in public postings", () => {
    const scenario = fiscalScenario({ rate: 0.1, treasuryCash: 10 });
    const world = buildWorld(scenario);
    const treasury = account(world, "country", 0, "treasury-cash");
    const revenue = account(world, "country", 0, "income-tax-revenue");
    const expense0 = account(world, "popBlock", 0, "income-tax-expense");
    const cash0 = account(world, "popBlock", 0, "household-cash");
    const expense1 = account(world, "popBlock", 1, "income-tax-expense");
    const cash1 = account(world, "popBlock", 1, "household-cash");

    const cashOnly = [
      { accountId: treasury.id, side: "debit" as const, amountRUSD: 1 },
      { accountId: cash0.id, side: "credit" as const, amountRUSD: 1 },
    ];
    expect(() => postJournalEntry(world.finance, 0, "income-tax", cashOnly)).toThrow(
      /fiscal|income-tax/i,
    );
    expect(() =>
      postJournalEntry(world.finance, 0, "income-tax", [
        { accountId: expense0.id, side: "credit", amountRUSD: 1 },
        { accountId: cash0.id, side: "debit", amountRUSD: 1 },
        { accountId: treasury.id, side: "credit", amountRUSD: 1 },
        { accountId: revenue.id, side: "debit", amountRUSD: 1 },
      ]),
    ).toThrow(/semantic|fiscal/i);
    expect(() =>
      postJournalBatch(world.finance, 0, [
        { transactionKind: "income-tax", lines: cashOnly },
      ]),
    ).toThrow(/fiscal|income-tax/i);
    expect(() =>
      postJournalEntry(world.finance, 0, "income-tax", [
        { accountId: expense0.id, side: "debit", amountRUSD: 1 },
        { accountId: treasury.id, side: "debit", amountRUSD: 1 },
        { accountId: revenue.id, side: "credit", amountRUSD: 2 },
      ]),
    ).toThrow(/fiscal|income-tax/i);

    const mismatched = [
      { accountId: expense0.id, side: "debit" as const, amountRUSD: 1 },
      { accountId: cash0.id, side: "credit" as const, amountRUSD: 2 },
      { accountId: expense1.id, side: "debit" as const, amountRUSD: 2 },
      { accountId: cash1.id, side: "credit" as const, amountRUSD: 1 },
      { accountId: treasury.id, side: "debit" as const, amountRUSD: 3 },
      { accountId: revenue.id, side: "credit" as const, amountRUSD: 3 },
    ];
    expect(() => postJournalEntry(world.finance, 0, "income-tax", mismatched)).toThrow(
      /do not match/i,
    );

    const validClone = cloneWorld(world);
    const validPostings = postJournalBatch(validClone.finance, 0, [
      {
        transactionKind: "income-tax",
        lines: [
          { accountId: expense0.id, side: "debit", amountRUSD: 1 },
          { accountId: cash0.id, side: "credit", amountRUSD: 1 },
          { accountId: expense1.id, side: "debit", amountRUSD: 1 },
          { accountId: cash1.id, side: "credit", amountRUSD: 1 },
          { accountId: treasury.id, side: "debit", amountRUSD: 2 },
          { accountId: revenue.id, side: "credit", amountRUSD: 2 },
        ],
      },
    ]);
    expect(validPostings).toHaveLength(1);
    expect(() => assertValidWorld(validClone)).not.toThrow();
    const validIndex = buildFinanceIndex(validClone.finance);
    const validPosting = validPostings[0];
    if (validPosting === undefined) throw new Error("missing valid fiscal posting");
    expect(() => assertValidJournalPosting(validPosting, validIndex.byId)).not.toThrow();

    const welfareExpense = account(world, "country", 0, "welfare-expense");
    const welfareIncome = account(world, "popBlock", 0, "welfare-income");
    const welfareClone = cloneWorld(world);
    const welfarePostings = postJournalBatch(welfareClone.finance, 0, [
      {
        transactionKind: "welfare-transfer",
        lines: [
          { accountId: welfareExpense.id, side: "debit", amountRUSD: 1 },
          { accountId: welfareIncome.id, side: "credit", amountRUSD: 1 },
          { accountId: cash0.id, side: "debit", amountRUSD: 1 },
          { accountId: treasury.id, side: "credit", amountRUSD: 1 },
        ],
      },
    ]);
    expect(welfarePostings).toHaveLength(1);
    expect(() => assertValidWorld(welfareClone)).not.toThrow();
    const welfarePosting = welfarePostings[0];
    if (welfarePosting === undefined) throw new Error("missing valid welfare posting");
    expect(() =>
      assertValidJournalPosting(welfarePosting, buildFinanceIndex(welfareClone.finance).byId),
    ).not.toThrow();
    expect(() =>
      postJournalEntry(world.finance, 0, "welfare-transfer", [
        { accountId: welfareExpense.id, side: "debit", amountRUSD: 1 },
        { accountId: welfareIncome.id, side: "credit", amountRUSD: 1 },
      ]),
    ).toThrow(/fiscal|welfare/i);

    const precisionClone = cloneWorld(world);
    const third = 1 / 3;
    postJournalEntry(precisionClone.finance, 0, "income-tax", [
      { accountId: expense0.id, side: "debit", amountRUSD: third },
      { accountId: cash0.id, side: "credit", amountRUSD: third },
      { accountId: treasury.id, side: "debit", amountRUSD: third },
      { accountId: revenue.id, side: "credit", amountRUSD: third },
    ]);
    expect(account(precisionClone, "country", 0, "treasury-cash").balanceRUSD).toBe(10 + third);
    expect(account(precisionClone, "popBlock", 0, "income-tax-expense").balanceRUSD).toBe(third);

    const index = buildFinanceIndex(world.finance);
    const invalidPersisted: JournalPosting = {
      id: 1,
      dayIndex: 0,
      transactionKind: "income-tax",
      lines: cashOnly,
      sourceEntityId: null,
      targetEntityId: null,
    };
    expect(() => assertValidJournalPosting(invalidPersisted, index.byId)).toThrow(
      /fiscal|income-tax/i,
    );
  });

  test("derives government period totals from a frozen summary", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 36_500, treasuryCash: 5_000 });
    const world = buildWorld(scenario);
    for (let day = 0; day < 31; day += 1) runDay(world, scenario);
    const summary = world.finance.periodSummaries[0];
    if (summary === undefined) throw new Error("expected a closed summary");
    const totals = governmentPeriodTotals(world.finance, summary);
    const country = totals.find((entry) => entry.countryId === FISCAL_COUNTRY_ID);
    if (country === undefined) throw new Error("missing derived government totals");
    expect(country.incomeTaxRevenueRUSD).toBeCloseTo(
      summary.accountTotals[account(world, "country", 0, "income-tax-revenue").id] ?? 0,
      9,
    );
    expect(country.welfareExpenseRUSD).toBeCloseTo(
      summary.accountTotals[account(world, "country", 0, "welfare-expense").id] ?? 0,
      9,
    );
    expect(country.netFiscalResultRUSD).toBeCloseTo(
      country.incomeTaxRevenueRUSD - country.welfareExpenseRUSD,
      9,
    );
  });
});

describe("M4c execution guards, atomicity, and calendar boundaries", () => {
  test("rejects duplicate fiscal execution without mutation", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);
    const settlement = runSettlement(scenario, world).settlement;
    const first = runFiscalPhase(world, settlement, world.dayIndex);
    expect(first.totals.incomeTaxRUSD).toBeGreaterThan(0);
    const before = hashWorld(world);
    expect(() => runFiscalPhase(world, settlement, world.dayIndex)).toThrow(
      /already been applied/i,
    );
    expect(hashWorld(world)).toBe(before);
  });

  test("rejects wrong-world-day and stale execution contexts before mutation", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);
    const settlement = runSettlement(scenario, world).settlement;
    const before = hashWorld(world);

    expect(() => runFiscalPhase(world, settlement, world.dayIndex + 1)).toThrow(
      /world\.dayIndex/i,
    );
    const wrongDaySettlement = { ...settlement, dayIndex: world.dayIndex + 1 };
    expect(() => runFiscalPhase(world, wrongDaySettlement, world.dayIndex + 1)).toThrow(
      /world\.dayIndex/i,
    );
    const stale = { ...settlement, scenarioId: "another-scenario" };
    expect(() => runFiscalPhase(world, stale, world.dayIndex)).toThrow(/execution context/i);
    const staleWorld = cloneWorld(world);
    staleWorld.finance.nextPostingId += 1;
    const staleBefore = hashWorld(staleWorld);
    expect(() => runFiscalPhase(staleWorld, settlement, staleWorld.dayIndex)).toThrow(/stale/i);
    expect(hashWorld(staleWorld)).toBe(staleBefore);
    const wrongMarket = { ...settlement, marketId: 999 };
    expect(() => runFiscalPhase(world, wrongMarket, world.dayIndex)).toThrow(/unknown market/i);
    expect(hashWorld(world)).toBe(before);
  });

  test("rejects the terminal boundary before mutation", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);
    const settlement = runSettlement(scenario, world).settlement;
    const before = hashWorld(world);
    expect(() =>
      runFiscalPhase(
        world,
        { ...settlement, dayIndex: 36_524 },
        36_524,
      ),
    ).toThrow(/terminal/i);
    expect(hashWorld(world)).toBe(before);
  });

  test("rejects invalid treasury state before mutation", () => {
    const scenario = fiscalScenario({ rate: 0.1 });
    const world = buildWorld(scenario);
    const settlement = runSettlement(scenario, world).settlement;
    const treasury = account(world, "country", 0, "treasury-cash");
    const beforePostings = world.finance.postings.length;
    treasury.balanceRUSD = Number.NaN;
    const beforeAccounts = world.finance.accounts.map((candidate) => ({ ...candidate }));
    expect(() => runFiscalPhase(world, settlement, world.dayIndex)).toThrow(/finite/i);
    expect(world.finance.postings).toHaveLength(beforePostings);
    expect(world.finance.accounts.map((candidate) => candidate.balanceRUSD)).toEqual(
      beforeAccounts.map((candidate) => candidate.balanceRUSD),
    );
  });

  test("keeps the fiscal phase out of the package public API", () => {
    expect("runFiscalPhase" in simApi).toBe(false);
    expect("__runFiscalPhaseWithHooks" in simApi).toBe(false);
  });

  test("leaves the original finance state unchanged on a post-staging failure", () => {
    const scenario = fiscalScenario({ rate: 0.1, budget: 36_500, treasuryCash: 500 });
    const world = buildWorld(scenario);
    const settlement = runSettlement(scenario, world).settlement;
    const beforeSerialized = serializeWorld(world);
    const beforePostings = world.finance.postings.length;
    let stagedPostings = 0;
    expect(() =>
      __runFiscalPhaseWithHooks(world, settlement, world.dayIndex, {
        afterStagedPostings: (staged) => {
          stagedPostings = staged.postings.length;
          const treasury = staged.accounts.find(
            (candidate) => candidate.ownerKind === "country" && candidate.subtype === "treasury-cash",
          );
          if (treasury === undefined) throw new Error("missing staged treasury");
          treasury.balanceRUSD = Number.NaN;
        },
      }),
    ).toThrow(/finite/i);
    expect(stagedPostings).toBeGreaterThan(beforePostings);
    expect(serializeWorld(world)).toBe(beforeSerialized);
    expect(settlement.fiscalApplied).toBe(false);
  });

  test("an integrated tick failure leaves the published world unchanged", () => {
    const base = fiscalScenario({ rate: 0, budget: 36_500, treasuryCash: 1_000 });
    const scenario: EconomyScenarioDef = {
      ...base,
      employment: [],
      buildingInstances: base.buildingInstances.map((building) => ({
        ...building,
        operational: false,
      })),
      markets: base.markets.map((market) => ({ ...market, stockLots: [] })),
    };
    const world = buildWorld(scenario);
    world.finance.nextPostingId = Number.MAX_SAFE_INTEGER;
    const before = serializeWorld(world);
    expect(() => tick(world, economyTickContext(scenario))).toThrow();
    expect(serializeWorld(world)).toBe(before);
  });

  test("runs the fiscal phase across January 1 ageing", () => {
    const start = civilDateToDayIndex(1903, 12, 30);
    const scenario = fiscalScenario({ rate: 0.1, valuationSetOnDay: start });
    const world = buildWorld(scenario, { startDayIndex: start });
    let januaryFirst: ReturnType<typeof runDay> | null = null;
    for (let index = 0; index < 3; index += 1) januaryFirst = runDay(world, scenario);
    expect(januaryFirst?.population.aged).toBe(true);
    expect(januaryFirst?.fiscal.totals.incomeTaxRUSD).toBeGreaterThan(0);
    expect(dayIndexToCivilDate(world.dayIndex).year).toBe(1904);
  });

  test("annualizes leap-year wealth and closes the 1904 January month-end", () => {
    const start = civilDateToDayIndex(1903, 12, 30);
    const scenario = fiscalScenario({
      rate: 0.1,
      budget: 36_600,
      treasuryCash: 1_000,
      valuationSetOnDay: start,
    });
    const world = buildWorld(scenario, { startDayIndex: start });
    let januaryWealth: ReturnType<typeof runDay> | null = null;
    let januaryClose: ReturnType<typeof runDay>["financeClose"] = null;
    for (let index = 0; index < 33; index += 1) {
      const economy = runDay(world, scenario);
      if (economy.population.wealthUpdates.length > 0) {
        januaryWealth = economy;
      }
      if (economy.financeClose !== null) januaryClose = economy.financeClose;
    }
    if (januaryWealth === null) throw new Error("expected a January wealth update");
    const update = januaryWealth.population.wealthUpdates[0];
    if (update === undefined) throw new Error("missing wealth update");
    const block = world.popBlocks.find((candidate) => candidate.id === update.popBlockId);
    if (block === undefined) throw new Error("missing wealth block");
    const household = januaryWealth.settlement.households.find(
      (entry) => entry.popBlockId === block.id,
    );
    if (household === undefined) throw new Error("missing leap-year household");
    const fiscalBlock = januaryWealth.fiscal.blocks.find(
      (entry) => entry.popBlockId === block.id,
    );
    const population = populationTotal(block);
    expect(update.annualDisposableIncomePerCapitaRUSD).toBeCloseTo(
      Math.max(
        0,
        ((household.wagesReceivedRUSD +
          (fiscalBlock?.welfareReceivedRUSD ?? 0) -
          (fiscalBlock?.incomeTaxRUSD ?? 0)) /
          population) *
          366,
      ),
      6,
    );
    expect(januaryClose).not.toBeNull();
    expect(januaryClose?.summary.periodEndDay).toBe(civilDateToDayIndex(1904, 1, 31));
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
          account(world, "popBlock", block.id, "household-cash").balanceRUSD,
        ]),
      );
      const economy = runDay(world, scenario);
      const fiscal = economy.fiscal;
      expectedTreasury += fiscal.totals.incomeTaxRUSD - fiscal.totals.welfarePaidRUSD;
      expect(account(world, "country", 0, "treasury-cash").balanceRUSD).toBeCloseTo(
        expectedTreasury,
        6,
      );
      // D-155: on a labour-month day mobility moves people, with their savings, between
      // blocks (P7 plan §5.4), a flow this cash formula does not count.
      const moved = economy.migration.totalPeople > 0;
      for (const block of world.popBlocks) {
        const fiscalBlock = fiscal.blocks.find((entry) => entry.popBlockId === block.id);
        const settlementHousehold = economy.settlement.households.find(
          (entry) => entry.popBlockId === block.id,
        );
        if (settlementHousehold === undefined || moved) continue;
        expect(account(world, "popBlock", block.id, "household-cash").balanceRUSD).toBeCloseTo(
          (openingCash.get(block.id) ?? 0) +
            settlementHousehold.wagesReceivedRUSD -
            settlementHousehold.marketPurchasesRUSD +
            (fiscalBlock?.welfareReceivedRUSD ?? 0) -
            (fiscalBlock?.incomeTaxRUSD ?? 0),
          6,
        );
      }
      for (const candidate of world.finance.accounts) {
        if (candidate.category !== "equity") {
          expect(candidate.balanceRUSD).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(() => assertValidWorld(world)).not.toThrow();
  });

  test("welfare received affects the next day's funded demand", () => {
    const poor = marketScenario();
    poor.employment = [];
    for (const block of poor.population.popBlocks) {
      block.initialSavingsRUSD = 0;
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
      rusdPerUnit: asRusdPerCurrencyUnit(1),
      setOnDay: 0,
      source: "scenario" as const,
    };
    const funded: EconomyScenarioDef = {
      ...poor,
      countries: [
        fiscalCountry({
          initialTreasuryCashRUSD: 1_000,
          fiscal: { incomeTaxRate: 0, welfareBudgetRUSDPerYear: 365_000 },
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
      (total, block) => total + block.budgetStartBeforeNeedsRUSD,
      0,
    );
    const unfundedSpend = unfundedDay.population.needs.blocks.reduce(
      (total, block) => total + block.budgetStartBeforeNeedsRUSD,
      0,
    );
    expect(fundedSpend).toBeGreaterThan(0);
    expect(fundedSpend).toBeGreaterThan(unfundedSpend);
    expect(fundedDay.population.needs.blocks.some((block) => block.spentRUSD > 0)).toBe(true);
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
      )!.wagesReceivedRUSD;
      const welfare = fiscal.blocks.find((entry) => entry.popBlockId === block.id)?.welfareReceivedRUSD ?? 0;
      const tax = fiscal.blocks.find((entry) => entry.popBlockId === block.id)?.incomeTaxRUSD ?? 0;
      const population =
        block.maleByAge.reduce((sum, value) => sum + value, 0) +
        block.femaleByAge.reduce((sum, value) => sum + value, 0);
      if (population === 0) continue;
      expect(update.annualDisposableIncomePerCapitaRUSD).toBeCloseTo(
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
      account(world, "popBlock", blockId, subtype).balanceRUSD;
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
