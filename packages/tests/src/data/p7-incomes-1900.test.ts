/**
 * D-154 item 5g: the 1900 blocks' opening incomes are measured with the simulation's own
 * accounting. Before the fix the generator charged a building's inputs at its reference
 * throughput while its outputs carried the technique (E1), and paid a wage to work-sharing
 * people beyond every slot of their province (E2); the US opened at 2,939 RUSD a head against
 * covered value added of 2,125, and 27 of 67 countries opened with household income above all
 * the value added and public payroll that could pay it (USA 1.316 times).
 *
 * Bound: a country's households can receive only what its placed buildings add (wages and
 * profits) plus its institutions' payroll. The 5 % allowance covers domestic servants' wages,
 * counted in both the employer's and the servant's income, and losses floored at zero.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(HERE, "../../../data/data");
const read = <T>(path: string): T => JSON.parse(readFileSync(join(DATA_ROOT, path), "utf8")) as T;

interface Pop {
  readonly provinceId: number;
  readonly population: number;
  readonly incomeRUSDPerCapitaDay: number;
}
interface Province {
  readonly id: number;
  readonly territoryKey: string;
}
interface Country {
  readonly tag: string;
  readonly provinceIds: readonly number[];
  readonly politics?: { readonly institutionFundingRUSDPerYear?: number };
  readonly technology?: { readonly educationFundingRUSDPerYear?: number };
}
interface Calibration {
  readonly coverage: { readonly territories: Record<string, { readonly coveredAfterRUSDPerYear: number }> };
}

const pops = read<Pop[]>("historical/p7/pops_1900.json");
const provinces = read<Province[]>("historical/p5/provinces_1900.json");
const countries = read<Country[]>("historical/p5b/countries_1900.json");
const coverage = read<Calibration>("historical/p5b/calibration_1900.json").coverage.territories;

const MIN_PERSONS = 1_000_000;
const ALLOWANCE = 1.05;

describe("P7 1900 world: opening incomes (D-154 item 5g)", () => {
  test("every block has a finite, non-negative opening income", () => {
    for (const pop of pops) {
      expect(Number.isFinite(pop.incomeRUSDPerCapitaDay)).toBe(true);
      expect(pop.incomeRUSDPerCapitaDay).toBeGreaterThanOrEqual(0);
    }
  });

  test("no country's households open with more than its value added and public payroll", () => {
    const territoryOf = new Map(provinces.map((province) => [province.id, province.territoryKey]));
    const countryOf = new Map<number, Country>();
    for (const country of countries) for (const id of country.provinceIds) countryOf.set(id, country);
    const over: string[] = [];
    let checked = 0;
    for (const country of countries) {
      const territories = new Set(country.provinceIds.map((id) => territoryOf.get(id)).filter((key): key is string => key !== undefined));
      const covered = [...territories].reduce((acc, key) => acc + (coverage[key]?.coveredAfterRUSDPerYear ?? 0), 0);
      const payroll = (country.politics?.institutionFundingRUSDPerYear ?? 0) + (country.technology?.educationFundingRUSDPerYear ?? 0);
      let income = 0;
      let persons = 0;
      for (const pop of pops) {
        if (countryOf.get(pop.provinceId) !== country) continue;
        income += pop.incomeRUSDPerCapitaDay * pop.population * 365;
        persons += pop.population;
      }
      if (persons < MIN_PERSONS) continue;
      checked += 1;
      const ratio = income / (covered + payroll);
      if (!(ratio <= ALLOWANCE)) over.push(`${country.tag} ${ratio.toFixed(3)}`);
    }
    expect(checked).toBeGreaterThan(30);
    expect(over).toEqual([]);
  });
});
