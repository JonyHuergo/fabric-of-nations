/**
 * P3 (D-141) — the one money formatter of the app.
 *
 * The simulation keeps every amount in RUSD (D-122). This module converts an RUSD amount
 * to the player's display currency **at display time only**, from the valuations the
 * worker snapshot carries, and formats it. Nothing here is sent back to the simulation:
 * the only value that travels the other way is a typed amount the player enters, which
 * `fromDisplay` turns into the RUSD amount of the command, as the command contract
 * requires.
 *
 * Conversion: `display = rusd / rusdPerUnit`, where `rusdPerUnit` is the RUSD value of one
 * unit of the display currency (1 for RUSD). History converts at the valuation of its own
 * month (`atPeriod`) or the mean of its year's month-end valuations (`atYear`), so an
 * inflation is not restated at today's rate.
 *
 * Pure TypeScript: no React, no platform API, no simulation implementation import.
 */

import type {
  CountrySnapshot,
  SnapshotCurrency,
  SnapshotValuationHistory,
} from "@century/sim-worker";

/** The canonical RUSD abbreviation (kept in step with `RUSD_UNIT_ABBREVIATION`). */
export const RUSD_CODE = "RUSD";
export const RUSD_NAME = "Reference US Dollars";

/** The persisted display-currency preference: the player's own currency, RUSD, or a key. */
export type DisplayCurrencyChoice = "own" | "rusd" | `currency:${string}`;

export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrencyChoice = "own";

/** Parse a stored preference; anything unrecognised is the default. */
export function parseDisplayCurrencyChoice(value: unknown): DisplayCurrencyChoice {
  if (value === "own" || value === "rusd") return value;
  if (typeof value === "string" && /^currency:[a-z][a-z0-9-]*$/.test(value)) {
    return value as DisplayCurrencyChoice;
  }
  return DEFAULT_DISPLAY_CURRENCY;
}

/** The snapshot fields the formatter reads. */
export interface MoneySource {
  readonly currencies: readonly SnapshotCurrency[];
  readonly countries: readonly Pick<CountrySnapshot, "id" | "currencyId">[];
  readonly playerCountryId: number | null;
  readonly valuationHistory?: SnapshotValuationHistory;
}

/** A display-currency formatter. Every money label in the app goes through one. */
export interface MoneyFormat {
  /** Short unit label, e.g. `GBP` or `RUSD`. */
  readonly code: string;
  readonly name: string;
  /** Currency id, or null for RUSD. */
  readonly currencyId: number | null;
  /** RUSD per one display unit (1 for RUSD). */
  readonly rusdPerUnit: number;
  readonly isRusd: boolean;
  /** Why the display fell back to RUSD, or null. */
  readonly fallbackReason: string | null;
  /** RUSD amount → display units. */
  toDisplay(rusd: number): number;
  /** Display units → RUSD amount (typed inputs only). */
  fromDisplay(display: number): number;
  /** Scaled number without the unit, e.g. `1.20M`. */
  amount(rusd: number): string;
  /** Scaled amount with the unit, e.g. `1.20M GBP`. */
  format(rusd: number): string;
  /** As `format`, with an explicit `+` for positive values. */
  signed(rusd: number): string;
  /** A price per physical unit, e.g. `0.0123 GBP/kg`. */
  price(rusdPerQuantity: number, quantityUnit?: string): string;
  /** A unit label with an optional suffix, e.g. `GBP/yr`. */
  unit(suffix?: string): string;
  /** The same display currency at the valuation of a closed month. */
  atPeriod(periodEndDay: number): MoneyFormat;
  /** The same display currency at the mean valuation of a closed year. */
  atYear(year: number): MoneyFormat;
}

function scaled(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (!Number.isFinite(value)) return "—";
  if (absolute >= 1_000_000_000_000) return `${sign}${(absolute / 1_000_000_000_000).toFixed(2)}T`;
  if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}k`;
  return `${sign}${absolute.toFixed(2)}`;
}

function priceNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 10) return value.toFixed(2);
  if (Math.abs(value) >= 0.01) return value.toFixed(4);
  return value.toExponential(2);
}

function displayCode(currency: SnapshotCurrency): string {
  return currency.key.toUpperCase();
}

interface Resolved {
  readonly code: string;
  readonly name: string;
  readonly currencyId: number | null;
  readonly rusdPerUnit: number;
  readonly fallbackReason: string | null;
}

const RUSD_RESOLVED: Resolved = {
  code: RUSD_CODE,
  name: RUSD_NAME,
  currencyId: null,
  rusdPerUnit: 1,
  fallbackReason: null,
};

/** The currency a choice names in this snapshot, before valuation. */
export function chosenCurrency(
  source: MoneySource | null,
  choice: DisplayCurrencyChoice,
): SnapshotCurrency | null {
  if (source === null || choice === "rusd") return null;
  if (choice === "own") {
    const country = source.countries.find((candidate) => candidate.id === source.playerCountryId);
    if (country === undefined) return null;
    return source.currencies.find((currency) => currency.id === country.currencyId) ?? null;
  }
  const key = choice.slice("currency:".length);
  return source.currencies.find((currency) => currency.key === key) ?? null;
}

function resolve(source: MoneySource | null, choice: DisplayCurrencyChoice): Resolved {
  if (choice === "rusd") return RUSD_RESOLVED;
  const currency = chosenCurrency(source, choice);
  if (currency === null) {
    return {
      ...RUSD_RESOLVED,
      fallbackReason:
        source === null || choice === "own"
          ? "No country currency is known yet; amounts are shown in RUSD."
          : "The chosen currency is not registered in this world; amounts are shown in RUSD.",
    };
  }
  const rate = currency.rusdPerUnit;
  if (currency.valuationStatus !== "specified" || rate === null || !(rate > 0) || !Number.isFinite(rate)) {
    return {
      ...RUSD_RESOLVED,
      fallbackReason: `${currency.name} has no valuation; amounts are shown in RUSD.`,
    };
  }
  return {
    code: displayCode(currency),
    name: currency.name,
    currencyId: currency.id,
    rusdPerUnit: rate,
    fallbackReason: null,
  };
}

function build(resolved: Resolved, source: MoneySource | null): MoneyFormat {
  const rate = resolved.rusdPerUnit;
  const toDisplay = (rusd: number): number => rusd / rate;
  const historic = (lookup: Readonly<Record<number, number>> | undefined): MoneyFormat => {
    if (resolved.currencyId === null) return format;
    const past = lookup?.[resolved.currencyId];
    if (past === undefined || !(past > 0) || !Number.isFinite(past)) return format;
    return build({ ...resolved, rusdPerUnit: past }, source);
  };
  const format: MoneyFormat = {
    code: resolved.code,
    name: resolved.name,
    currencyId: resolved.currencyId,
    rusdPerUnit: rate,
    isRusd: resolved.currencyId === null,
    fallbackReason: resolved.fallbackReason,
    toDisplay,
    fromDisplay: (display: number): number => display * rate,
    amount: (rusd: number): string => scaled(toDisplay(rusd)),
    format: (rusd: number): string => `${scaled(toDisplay(rusd))} ${resolved.code}`,
    signed: (rusd: number): string =>
      `${rusd > 0 ? "+" : ""}${scaled(toDisplay(rusd))} ${resolved.code}`,
    price: (rusdPerQuantity: number, quantityUnit?: string): string =>
      `${priceNumber(toDisplay(rusdPerQuantity))} ${resolved.code}${
        quantityUnit === undefined || quantityUnit === "" ? "" : `/${quantityUnit}`
      }`,
    unit: (suffix?: string): string => (suffix === undefined ? resolved.code : `${resolved.code}${suffix}`),
    atPeriod: (periodEndDay: number): MoneyFormat =>
      historic(source?.valuationHistory?.months.find((month) => month.periodEndDay === periodEndDay)?.rusdPerUnit),
    atYear: (year: number): MoneyFormat =>
      historic(source?.valuationHistory?.years.find((entry) => entry.year === year)?.meanRusdPerUnit),
  };
  return format;
}

/** Build the display formatter for a snapshot and a preference. */
export function createMoneyFormat(
  source: MoneySource | null,
  choice: DisplayCurrencyChoice,
): MoneyFormat {
  return build(resolve(source, choice), source);
}

/** The RUSD formatter (no conversion). */
export const RUSD_FORMAT: MoneyFormat = createMoneyFormat(null, "rusd");

/** One entry of the display-currency selector. */
export interface DisplayCurrencyOption {
  readonly choice: DisplayCurrencyChoice;
  readonly label: string;
  readonly detail: string;
}

/**
 * Selector entries: the player's own currency first, then RUSD, then every registered
 * currency with a valuation, by name.
 */
export function displayCurrencyOptions(source: MoneySource | null): readonly DisplayCurrencyOption[] {
  const own = chosenCurrency(source, "own");
  const options: DisplayCurrencyOption[] = [
    {
      choice: "own",
      label: own === null ? "Own currency" : `Own currency · ${own.name}`,
      detail: own === null ? "Your country's currency once a campaign is under way" : displayCode(own),
    },
    { choice: "rusd", label: `${RUSD_NAME} (${RUSD_CODE})`, detail: "The simulation's constant reference unit" },
  ];
  const registered = (source?.currencies ?? [])
    .filter((currency) => currency.valuationStatus === "specified")
    .slice()
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : left.id - right.id));
  for (const currency of registered) {
    options.push({
      choice: `currency:${currency.key}`,
      label: currency.name,
      detail: displayCode(currency),
    });
  }
  return options;
}

/** The nearest 1, 2 or 5 × 10^k to a positive step (1 for an invalid step). */
export function niceStep(step: number): number {
  if (!Number.isFinite(step) || !(step > 0)) return 1;
  const exponent = Math.floor(Math.log10(step));
  const base = 10 ** exponent;
  const fraction = step / base;
  const nice = fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10;
  return nice * base;
}

/** An RUSD-domain slider expressed in display units. */
export interface DisplaySliderScale {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Decimals that show one step. */
  readonly precision: number;
}

/**
 * Convert an RUSD slider (value, bounds, step) to display units. The step becomes a
 * round number of display units, so the player drags and types in their own currency;
 * the screen still receives RUSD through `MoneyFormat.fromDisplay`.
 */
export function displaySliderScale(
  money: MoneyFormat,
  slider: { readonly value: number; readonly min: number; readonly max: number; readonly step: number },
): DisplaySliderScale {
  const step = niceStep(money.toDisplay(slider.step));
  return {
    value: money.toDisplay(slider.value),
    min: money.toDisplay(slider.min),
    max: money.toDisplay(slider.max),
    step,
    precision: Math.max(0, Math.min(6, -Math.floor(Math.log10(step)))),
  };
}
