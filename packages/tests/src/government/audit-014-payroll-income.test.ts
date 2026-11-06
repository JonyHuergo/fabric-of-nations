/**
 * AUDIT-014 regression coverage.
 *
 * The GDD §6.5 wealth convention is settlement wages plus welfare, and the M4c
 * income-tax withholding pass reads the same settlement wage receipt. Government
 * payroll posted after that pass (administration, education, training, military)
 * is deliberately outside both bases; construction wages keep their documented
 * E3 separate withholding path.
 */

import {
  applyMilitaryAction,
  assertValidWorld,
  createEconomyWorld,
  daysInYear,
  populationTotal,
  runEconomicDay,
  type World,
} from "@century/sim";

import {
  M5_COUNTRY_A,
  M5_REGION_A1,
  m5Scenario,
} from "../fixtures/m5.js";

const SEED = 20_261_111;

function militaryPayForBlockOnDay(world: World, dayIndex: number, blockId: number): number {
  const accountById = new Map(
    world.finance.accounts.map((account) => [account.id, account] as const),
  );
  let total = 0;
  for (const posting of world.finance.postings) {
    if (posting.dayIndex !== dayIndex) continue;
    if (posting.transactionKind !== "military-pay") continue;
    if (posting.targetEntityId !== blockId) continue;
    for (const line of posting.lines) {
      const account = accountById.get(line.accountId);
      if (account?.subtype === "military-income" && line.side === "credit") {
        total += line.amountRUSD;
      }
    }
  }
  return total;
}

describe("AUDIT-014 government payroll tax and wealth treatment", () => {
  test("military pay is outside the income-tax base and the month-end wealth income basis", () => {
    const scenario = m5Scenario();
    scenario.military = {};
    const country = scenario.countries?.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("missing country A");
    country.initialTreasuryCashRUSD = 1_000_000;
    const world = createEconomyWorld(scenario, { seed: SEED });
    const home = world.popBlocks
      .filter((block) => block.provinceId === M5_REGION_A1)
      .sort((left, right) => left.id - right.id)[0];
    if (home === undefined) throw new Error("missing home pop block");
    const blockId = home.id;

    applyMilitaryAction(
      world,
      {
        kind: "recruit-army",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        provinceId: M5_REGION_A1,
        personnel: 500,
      },
      world.dayIndex,
    );

    let monthEnd:
      | ReturnType<typeof runEconomicDay>
      | undefined;
    for (let day = 0; day < 31; day += 1) {
      const result = runEconomicDay(
        world,
        scenario.population.definitions,
        scenario.definitions,
        world.dayIndex,
        { validateWorld: false },
      );
      if (day === 30) monthEnd = result;
      world.dayIndex += 1;
    }
    if (monthEnd === undefined) throw new Error("missing month-end result");
    const militaryIncome = militaryPayForBlockOnDay(world, 30, blockId);
    expect(militaryIncome).toBeGreaterThan(0);
    expect(monthEnd.economy.military.paidRUSD).toBeGreaterThan(0);

    const wealthUpdate = monthEnd.population.wealthUpdates.find(
      (entry) => entry.popBlockId === blockId,
    );
    const household = monthEnd.economy.settlement.households.find(
      (entry) => entry.popBlockId === blockId,
    );
    const fiscalBlock = monthEnd.economy.fiscal.blocks.find(
      (entry) => entry.popBlockId === blockId,
    );
    if (wealthUpdate === undefined || household === undefined || fiscalBlock === undefined) {
      throw new Error("missing month-end block result");
    }
    const population = populationTotal(home);
    const yearDays = daysInYear(1900);
    const expectedAnnualDisposable =
      ((household.wagesReceivedRUSD +
        fiscalBlock.welfareReceivedRUSD -
        fiscalBlock.incomeTaxRUSD) /
        population) *
      yearDays;
    expect(wealthUpdate.annualDisposableIncomePerCapitaRUSD).toBeCloseTo(
      expectedAnnualDisposable,
      8,
    );
    const militaryAnnualPerCapita = (militaryIncome / population) * yearDays;
    expect(wealthUpdate.annualDisposableIncomePerCapitaRUSD).not.toBeCloseTo(
      expectedAnnualDisposable + militaryAnnualPerCapita,
      6,
    );

    const policy = world.countries.find((entry) => entry.id === M5_COUNTRY_A)?.fiscal;
    if (policy === undefined) throw new Error("missing fiscal policy");
    const expectedTax =
      policy.incomeTaxRate *
      Math.max(0, household.wagesReceivedRUSD - policy.incomeTaxAllowanceRUSDPerYear / yearDays);
    expect(fiscalBlock.incomeTaxRUSD).toBeCloseTo(expectedTax, 8);
    assertValidWorld(world);
  });
});
