import {
  asSusdPerCurrencyUnit,
  type CountryInitialDef,
  type EconomyScenarioDef,
  type FiscalPolicy,
} from "@century/sim";
import { marketScenario } from "./m3d.js";

/** Declared treasury account id used by M4c fixtures (above all base ids). */
export const FISCAL_TREASURY_ACCOUNT_ID = 1000;
export const FISCAL_COUNTRY_ID = 0;

export function zeroFiscalPolicy(): FiscalPolicy {
  return { incomeTaxRate: 0, welfareBudgetSUSDPerYear: 0 };
}

export function fiscalCountry(overrides: Partial<CountryInitialDef> = {}): CountryInitialDef {
  return {
    id: FISCAL_COUNTRY_ID,
    tag: "FIS",
    name: "Fiscal Test Country",
    monetary: { kind: "own", currencyId: 0 },
    regionIds: [0],
    treasuryAccountId: FISCAL_TREASURY_ACCOUNT_ID,
    initialTreasuryCashSUSD: 0,
    fiscal: zeroFiscalPolicy(),
    ...overrides,
  };
}

export interface FiscalScenarioOptions {
  readonly rate?: number;
  readonly budget?: number;
  readonly treasuryCash?: number;
  readonly valuationSetOnDay?: number;
  readonly countries?: readonly CountryInitialDef[];
}

/**
 * The M3 market fixture plus one or more countries. Country 0 owns region 0 and
 * carries the requested fiscal policy. Pop blocks are the M3 fixture's four
 * blocks, so income tax and welfare have real settled wages and populations.
 */
export function fiscalScenario(options: FiscalScenarioOptions = {}): EconomyScenarioDef {
  const scenario = marketScenario();
  const countries: CountryInitialDef[] =
    options.countries !== undefined
      ? [...options.countries]
      : [
          fiscalCountry({
            initialTreasuryCashSUSD: options.treasuryCash ?? 0,
            fiscal: {
              incomeTaxRate: options.rate ?? 0,
              welfareBudgetSUSDPerYear: options.budget ?? 0,
            },
          }),
        ];
  return {
    ...scenario,
    countries,
    currencies: [
      {
        id: 0,
        key: "tst",
        name: "Test Currency",
        issuer: { kind: "country", countryId: 0 },
      },
    ],
    currencyValuations: [
      {
        currencyId: 0,
        status: "specified",
        susdPerUnit: asSusdPerCurrencyUnit(1),
        setOnDay: options.valuationSetOnDay ?? 0,
        source: "scenario",
      },
    ],
  };
}
