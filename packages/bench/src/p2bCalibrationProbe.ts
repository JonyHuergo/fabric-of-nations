/**
 * P2b calibration probe (`node packages/bench/dist/p2bCalibrationProbe.js [days] [out.json]`).
 *
 * Runs the real 1900 world for a number of days and measures, per country, the
 * quantities the P2b before/after report compares with their sources: population,
 * employed workers and wages paid per worker by profession, value added (producer
 * revenue minus input purchases), household cash, treasury cash and the fiscal
 * flows (income tax, welfare, administration). Money is RUSD; flows are annualised
 * from the mean of the measured days. Node diagnostic only.
 */

import { writeFileSync } from "node:fs";
import { loadM11World } from "@century/data";
import {
  buildProvinceOwnerMap,
  isCashAccount,
  createEconomyWorld,
  tick,
  type EconomyScenarioDef,
  type TickContext,
} from "@century/sim";

const SEED = 20_261_023;

interface CountryAccumulator {
  tag: string;
  population: number;
  populationByProfession: Record<string, number>;
  workersByProfession: Record<string, number>;
  wagesByProfession: Record<string, number>;
  revenue: number;
  inputCosts: number;
  wagesPaid: number;
  wageObligation: number;
  upkeepPaid: number;
  householdPurchases: number;
  incomeTax: number;
  welfarePaid: number;
  administrationPaid: number;
  treasuryCashStart: number;
  treasuryCashEnd: number;
  householdCashStart: number;
  householdCashEnd: number;
  buildingCashStart: number;
  buildingCashEnd: number;
}

function context(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

function blockPopulation(block: { maleByAge: Uint32Array; femaleByAge: Uint32Array }): number {
  let total = 0;
  for (const value of block.maleByAge) total += value;
  for (const value of block.femaleByAge) total += value;
  return total;
}

function main(): void {
  const days = Number(process.argv[2] ?? "31");
  const out = process.argv[3];
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const professions = new Map(scenario.definitions.professions.map((p) => [p.id, p.key]));
  const owners = buildProvinceOwnerMap(world);
  const countries = new Map<number, CountryAccumulator>();
  for (const country of world.countries) {
    countries.set(country.id, {
      tag: country.tag,
      population: 0,
      populationByProfession: {},
      workersByProfession: {},
      wagesByProfession: {},
      revenue: 0,
      inputCosts: 0,
      wagesPaid: 0,
      wageObligation: 0,
      upkeepPaid: 0,
      householdPurchases: 0,
      incomeTax: 0,
      welfarePaid: 0,
      administrationPaid: 0,
      treasuryCashStart: 0,
      treasuryCashEnd: 0,
      householdCashStart: 0,
      householdCashEnd: 0,
      buildingCashStart: 0,
      buildingCashEnd: 0,
    });
  }
  const blockCountry = new Map<number, CountryAccumulator>();
  const blockProfession = new Map<number, string>();
  for (const block of world.popBlocks) {
    const owner = owners.get(block.provinceId);
    const acc = owner === undefined ? undefined : countries.get(owner);
    if (acc === undefined) continue;
    blockCountry.set(block.id, acc);
    const key = professions.get(block.professionId) ?? String(block.professionId);
    blockProfession.set(block.id, key);
    const people = blockPopulation(block);
    acc.population += people;
    acc.populationByProfession[key] = (acc.populationByProfession[key] ?? 0) + people;
  }
  const buildingCountry = new Map<number, CountryAccumulator>();
  for (const building of world.buildings) {
    const owner = owners.get(building.provinceId);
    const acc = owner === undefined ? undefined : countries.get(owner);
    if (acc !== undefined) buildingCountry.set(building.id, acc);
  }

  const cashOf = (field: "Start" | "End"): void => {
    for (const account of world.finance.accounts) {
      if (!isCashAccount(account) || account.ownerId === null) continue;
      if (account.ownerKind === "country") {
        const acc = countries.get(account.ownerId);
        if (acc !== undefined) acc[`treasuryCash${field}`] += account.balanceRUSD;
      } else if (account.ownerKind === "popBlock") {
        const acc = blockCountry.get(account.ownerId);
        if (acc !== undefined) acc[`householdCash${field}`] += account.balanceRUSD;
      } else if (account.ownerKind === "building") {
        const acc = buildingCountry.get(account.ownerId);
        if (acc !== undefined) acc[`buildingCash${field}`] += account.balanceRUSD;
      }
    }
  };
  cashOf("Start");

  const started = performance.now();
  for (let day = 0; day < days; day += 1) {
    const result = tick(world, context(scenario));
    const economy = result.economy;
    if (economy === undefined) throw new Error("no economy result");
    for (const producer of economy.settlement.producers) {
      const acc = buildingCountry.get(producer.buildingId);
      if (acc === undefined) continue;
      acc.revenue += producer.revenueRUSD;
      acc.inputCosts += producer.inputCostsRUSD;
      acc.wagesPaid += producer.wagesPaidRUSD;
      acc.wageObligation += producer.wageObligationRUSD;
    }
    for (const upkeep of economy.settlement.upkeep) {
      const acc = buildingCountry.get(upkeep.buildingId);
      if (acc !== undefined) acc.upkeepPaid += upkeep.paidRUSD;
    }
    for (const wage of economy.settlement.wages) {
      for (const payment of wage.payments) {
        const acc = blockCountry.get(payment.popBlockId);
        const key = blockProfession.get(payment.popBlockId);
        if (acc === undefined || key === undefined) continue;
        acc.workersByProfession[key] = (acc.workersByProfession[key] ?? 0) + payment.workers;
        acc.wagesByProfession[key] = (acc.wagesByProfession[key] ?? 0) + payment.paidRUSD;
      }
    }
    for (const household of economy.settlement.households) {
      const acc = blockCountry.get(household.popBlockId);
      if (acc !== undefined) acc.householdPurchases += household.marketPurchasesRUSD;
    }
    for (const fiscal of economy.fiscal.countries) {
      const acc = countries.get(fiscal.countryId);
      if (acc === undefined) continue;
      acc.incomeTax += fiscal.incomeTaxRUSD;
      acc.welfarePaid += fiscal.welfarePaidRUSD;
      acc.administrationPaid += fiscal.administrationPaidRUSD;
    }
  }
  cashOf("End");
  const annual = 365 / days;
  const rows = [...countries.values()].map((acc) => {
    const wagePerWorkerYear: Record<string, number> = {};
    for (const [key, wages] of Object.entries(acc.wagesByProfession)) {
      const workerDays = acc.workersByProfession[key] ?? 0;
      wagePerWorkerYear[key] = workerDays > 0 ? (wages / workerDays) * 365 : 0;
    }
    const valueAddedYear = (acc.revenue - acc.inputCosts) * annual;
    return {
      tag: acc.tag,
      population: acc.population,
      populationByProfession: acc.populationByProfession,
      employedByProfession: Object.fromEntries(
        Object.entries(acc.workersByProfession).map(([k, v]) => [k, v / days]),
      ),
      wagePerWorkerYear,
      valueAddedPerYear: valueAddedYear,
      valueAddedPerHead: acc.population > 0 ? valueAddedYear / acc.population : 0,
      wagesPerYear: acc.wagesPaid * annual,
      wageObligationPerYear: acc.wageObligation * annual,
      upkeepPerYear: acc.upkeepPaid * annual,
      householdPurchasesPerYear: acc.householdPurchases * annual,
      incomeTaxPerYear: acc.incomeTax * annual,
      welfarePerYear: acc.welfarePaid * annual,
      administrationPerYear: acc.administrationPaid * annual,
      treasuryCashStart: acc.treasuryCashStart,
      treasuryCashEnd: acc.treasuryCashEnd,
      householdCashStart: acc.householdCashStart,
      householdCashEnd: acc.householdCashEnd,
      buildingCashStart: acc.buildingCashStart,
      buildingCashEnd: acc.buildingCashEnd,
    };
  });
  const report = { days, seed: SEED, elapsedMs: performance.now() - started, countries: rows };
  if (out !== undefined) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  for (const row of rows.slice(0, 12)) {
    console.log(
      `${row.tag} pop ${(row.population / 1e6).toFixed(1)}M VA/head ${row.valueAddedPerHead.toFixed(2)} ` +
        `wages ${JSON.stringify(Object.fromEntries(Object.entries(row.wagePerWorkerYear).map(([k, v]) => [k, Math.round(v)])))} ` +
        `tax/yr ${Math.round(row.incomeTaxPerYear)} treasury ${Math.round(row.treasuryCashStart)}→${Math.round(row.treasuryCashEnd)}`,
    );
  }
}

main();
