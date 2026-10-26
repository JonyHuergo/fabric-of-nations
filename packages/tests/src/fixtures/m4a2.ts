import { loadM3SmallEconomy } from "@century/data";
import {
  asSusdPerCurrencyUnit,
  type CountryInitialDef,
  type Currency,
  type CurrencyIssuer,
  type CurrencyValuation,
  type EconomyScenarioDef,
  type FiscalPolicy,
  type MonetaryArrangement,
} from "@century/sim";

export function baseScenario(): EconomyScenarioDef {
  return loadM3SmallEconomy();
}

/** Zero fiscal policy used by M4a-2 fixtures that only exercise identity. */
export function zeroFiscal(): FiscalPolicy {
  return { incomeTaxRate: 0, welfareBudgetSUSDPerYear: 0 };
}

export function country(
  id: number,
  monetary: MonetaryArrangement,
  regionIds: number[] = [],
): CountryInitialDef {
  return {
    id,
    tag: `T${String(id)}`,
    name: `Test Country ${String(id)}`,
    monetary,
    regionIds,
    treasuryAccountId: 9000 + id,
    initialTreasuryCashSUSD: 0,
    fiscal: zeroFiscal(),
  };
}

export function issuedCurrency(id: number, key: string, countryId: number): Currency {
  return {
    id,
    key,
    name: `Currency ${key}`,
    issuer: { kind: "country", countryId },
  };
}

export function foreignCurrency(id: number, key: string, issuerKey: string): Currency {
  return {
    id,
    key,
    name: `Currency ${key}`,
    issuer: { kind: "foreign", issuerKey },
  };
}

export function issuer(kind: CurrencyIssuer["kind"]): CurrencyIssuer {
  if (kind === "country") return { kind: "country", countryId: 0 };
  if (kind === "foreign") return { kind: "foreign", issuerKey: "external-issuer" };
  return { kind: "union", unionKey: "test-union" };
}

export function specified(
  currencyId: number,
  rate: number,
  setOnDay = 0,
): CurrencyValuation {
  return {
    currencyId,
    status: "specified",
    susdPerUnit: asSusdPerCurrencyUnit(rate),
    setOnDay,
    source: "scenario",
  };
}

export function unavailable(currencyId: number): CurrencyValuation {
  return { currencyId, status: "unavailable" };
}

export function ownCurrencyScenario(): EconomyScenarioDef {
  const scenario = baseScenario();
  return {
    ...scenario,
    countries: [country(0, { kind: "own", currencyId: 0 }, [0])],
    currencies: [issuedCurrency(0, "tst", 0)],
    currencyValuations: [specified(0, 0.25)],
  };
}

export function foreignAdoptionScenario(): EconomyScenarioDef {
  const scenario = baseScenario();
  return {
    ...scenario,
    countries: [country(0, { kind: "adopted", currencyId: 1 }, [0])],
    currencies: [issuedCurrency(0, "tst", 0), foreignCurrency(1, "fgn", "external-metropole")],
    currencyValuations: [specified(0, 0.25), specified(1, 2)],
  };
}

export function simulatedAdoptionScenario(): EconomyScenarioDef {
  const scenario = baseScenario();
  return {
    ...scenario,
    countries: [
      country(0, { kind: "adopted", currencyId: 1 }, [0]),
      country(1, { kind: "own", currencyId: 1 }, []),
    ],
    currencies: [issuedCurrency(0, "aaa", 0), issuedCurrency(1, "bbb", 1)],
    currencyValuations: [specified(0, 0.25), specified(1, 2)],
  };
}

export function unavailableValuationScenario(): EconomyScenarioDef {
  const scenario = baseScenario();
  return {
    ...scenario,
    countries: [country(0, { kind: "own", currencyId: 0 }, [0])],
    currencies: [issuedCurrency(0, "tst", 0)],
    currencyValuations: [unavailable(0)],
  };
}
