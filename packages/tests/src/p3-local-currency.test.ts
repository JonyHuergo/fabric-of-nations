/**
 * P3 (D-141) — local-currency display.
 *
 * Acceptance (docs/PROSPERITY_PROGRAM.md §4 P3):
 * 1. every money label goes through the one formatter (audit);
 * 2. changing the display currency changes no world hash;
 * 3. a forced devaluation shows local figures rising while RUSD figures are unchanged.
 * Plus: the sourced 1900 currency table, the month-end valuation history, the formatter
 * itself, and that the currency data changes no simulated quantity.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CURRENCY_TABLE_1900_FILE,
  CurrencyTableError,
  FOREIGN_CURRENCY_ID_BASE,
  loadCurrencyTable,
  loadHistoricalData,
  loadM11World,
  parseCurrencyTable1900,
} from "@century/data";
import {
  WORLD_SCHEMA_VERSION,
  applyCountryAction,
  assertValidClosingValuations,
  assertValidWorld,
  createEconomyWorld,
  createRollbackRunner,
  deserializeWorld,
  hashWorld,
  runEconomicDay,
  runTicksWithRollback,
  serializeWorld,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";
import {
  PROTOCOL_VERSION,
  RUSD_MONEY_TEXT,
  buildEconomicExplanations,
  describePlayerAction,
  parseWorkerCommand,
  previewConstruction,
  previewDebtIssuance,
  type SimulationSnapshot,
} from "@century/sim-worker";
import { buildSimulationSnapshot, createSnapshotCache } from "@century/sim-worker/snapshot";

import {
  RUSD_FORMAT,
  createMoneyFormat,
  displayCurrencyOptions,
  displaySliderScale,
  niceStep,
  parseDisplayCurrencyChoice,
  type DisplayCurrencyChoice,
  type MoneySource,
} from "../../app/src/format/money.js";
import { dispatchHeadline, type Dispatch } from "../../app/src/screens/dispatches.js";
import {
  P3_PROBE_SEED,
  p3EquivalenceScenarios,
  simulatedQuantitiesDigest,
  withValuationsOf,
} from "../../bench/src/p3Equivalence.js";
import { M5_COUNTRY_A, m5Scenario } from "./fixtures/m5.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const DATA = join(ROOT, "packages/data/data");
const USD_TO_RUSD = 392.6 / 25;

function snapshotOf(world: World, scenario: EconomyScenarioDef, focusCountryId: number | null): SimulationSnapshot {
  return buildSimulationSnapshot(
    world,
    scenario.definitions,
    { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0, focusCountryId },
    scenario.population.definitions,
    createSnapshotCache(),
  );
}

// ---------------------------------------------------------------------------------
// Fixture: the M5 sample with a valued own currency and an active authority (E6b).
// ---------------------------------------------------------------------------------

function monetaryFixture(): { scenario: EconomyScenarioDef; world: World } {
  const scenario = m5Scenario();
  scenario.currencyValuations = [
    { currencyId: 0, status: "specified", rusdPerUnit: 0.5 as never, setOnDay: 0, source: "scenario" },
    { currencyId: 1, status: "specified", rusdPerUnit: 2 as never, setOnDay: 0, source: "scenario" },
    { currencyId: 2, status: "unavailable" },
  ];
  scenario.monetary = {
    currencies: [
      { currencyId: 0, parityRusdPerUnit: 0.5, reserveFundingRUSD: 2_000, currencyIssuedUnits: 1_000, externalCashRUSD: 5_000 },
    ],
  };
  const withPlayer = { ...scenario, playerCountryId: M5_COUNTRY_A };
  return { scenario: withPlayer, world: createEconomyWorld(withPlayer, { seed: 20_261_104 }) };
}

function treasuryOf(snapshot: SimulationSnapshot): number {
  const country = snapshot.countries.find((entry) => entry.id === M5_COUNTRY_A);
  if (country === undefined) throw new Error("player country missing from the snapshot");
  return country.treasuryCashRUSD;
}

// ---------------------------------------------------------------------------------
// 1900 currency data
// ---------------------------------------------------------------------------------

describe("P3 1900 currency table (D-141)", () => {
  const data = loadHistoricalData("scenarios/m11_world_1900.json");
  const table = data.currencyTable;
  const raw = JSON.parse(readFileSync(join(DATA, CURRENCY_TABLE_1900_FILE), "utf8")) as {
    countries: { tag: string; arrangement: string; currency?: { key: string; value: { kind: string; usd?: number } } }[];
  };

  test("every 1900 country has exactly one arrangement and every currency a valuation", () => {
    expect(table).toBeDefined();
    if (table === undefined) return;
    const tags = data.countries.map((country) => country.tag).sort();
    expect(table.arrangements.map((entry) => entry.tag).sort()).toEqual(tags);
    expect(table.usdToRusd).toBeCloseTo(USD_TO_RUSD, 12);
    for (const currency of table.currencies) {
      expect(Number.isFinite(currency.rusdPerUnit)).toBe(true);
      expect(currency.rusdPerUnit).toBeGreaterThan(0);
      expect(currency.rusdPerUnit).toBeCloseTo(currency.circulatingUsdPerUnit * USD_TO_RUSD, 10);
      expect(currency.sourceIds.length).toBeGreaterThan(0);
    }
    const adopted = table.arrangements.filter((entry) => entry.kind === "adopted").map((entry) => entry.tag).sort();
    expect(adopted).toEqual(
      ["AND", "AUS", "DAR", "ETH", "LIE", "MCO", "MNT", "NZL", "OMN", "ORF", "SHM", "SMR", "SOK", "TON", "WAD"],
    );
  });

  test("Mint-table units reproduce the Mint's values and the legal fine contents", () => {
    if (table === undefined) throw new Error("no table");
    for (const entry of raw.countries) {
      if (entry.currency?.value.kind !== "mint-table") continue;
      const derived = table.currencies.find((currency) => currency.key === entry.currency?.key);
      expect(derived?.legalUsdPerUnit).toBe(entry.currency.value.usd);
    }
    // Fine gold derived from the Mint value against the legal standards of 1900.
    const fine = (key: string): number => table.currencies.find((currency) => currency.key === key)?.fineGramsPerUnit ?? 0;
    expect(fine("usd")).toBeCloseTo(1.504632, 6);
    expect(Math.abs(fine("gbp") / 7.32238 - 1)).toBeLessThan(5e-4);
    expect(Math.abs(fine("dem") / 0.358423 - 1)).toBeLessThan(2e-3);
    expect(Math.abs(fine("rub") / 0.774234 - 1)).toBeLessThan(2e-3);
  });

  test("paper currencies use the sourced 1900 circulating rate", () => {
    if (table === undefined) throw new Error("no table");
    const circulating = (key: string): number =>
      table.currencies.find((currency) => currency.key === key)?.circulatingUsdPerUnit ?? Number.NaN;
    expect(circulating("arp")).toBeCloseTo(0.965 / 2.3095, 10);
    expect(circulating("pte")).toBeCloseTo((37.96 * 4.8665) / 240, 10);
    expect(circulating("gtq")).toBeCloseTo(1 / 6.1, 10);
    expect(circulating("grx")).toBeCloseTo(0.193 / 1.58, 10);
    expect(circulating("thb")).toBeCloseTo(0.6 * 0.509, 10);
    expect(circulating("otl")).toBeCloseTo(4.4, 10);
  });

  test("the 1900 world carries the table's valuations and arrangements", () => {
    if (table === undefined) throw new Error("no table");
    const scenario = loadM11World();
    const world = createEconomyWorld(scenario, { seed: 1 });
    expect(world.currencies.length).toBe(table.currencies.length);
    for (const valuation of world.currencyValuations) {
      expect(valuation.status).toBe("specified");
      if (valuation.status !== "specified") continue;
      const currency = world.currencies.find((entry) => entry.id === valuation.currencyId);
      const row = table.currencies.find((entry) => entry.key === currency?.key);
      expect(valuation.rusdPerUnit).toBe(row?.rusdPerUnit);
      expect(valuation.source).toBe("scenario");
    }
    const mtt = world.currencies.find((currency) => currency.key === "mtt");
    expect(mtt).toEqual({ id: FOREIGN_CURRENCY_ID_BASE, key: "mtt", name: "Maria Theresa thaler", issuer: { kind: "foreign", issuerKey: "vienna-levant-thaler" } });
    const byTag = new Map(world.countries.map((country) => [country.tag, country]));
    expect(byTag.get("MNT")?.monetary).toEqual({ kind: "adopted", currencyId: byTag.get("AUT")?.id });
    expect(byTag.get("ETH")?.monetary).toEqual({ kind: "adopted", currencyId: FOREIGN_CURRENCY_ID_BASE });
    expect(byTag.get("GBR")?.monetary).toEqual({ kind: "own", currencyId: byTag.get("GBR")?.id });
  });

  test("invalid tables are rejected with named errors", () => {
    const base = JSON.parse(readFileSync(join(DATA, CURRENCY_TABLE_1900_FILE), "utf8")) as Record<string, unknown> & {
      countries: Record<string, unknown>[];
    };
    const deflator = new Map([
      ["cpi-1900", 25],
      ["cpi-1990", 392.6],
    ]);
    const tags = base.countries.map((country) => String(country.tag));
    const parse = (document: unknown, countryTags = tags) => () => parseCurrencyTable1900(document, deflator, countryTags);
    expect(parse(base)).not.toThrow();
    expect(parse(base, [...tags, "XXX"])).toThrow(/no entry for country XXX/);
    const reserved = structuredClone(base);
    (reserved.countries[0] as { currency: { key: string } }).currency.key = "rusd";
    expect(parse(reserved)).toThrow(/reserved for RUSD/);
    const duplicate = structuredClone(base);
    (duplicate.countries[1] as { currency: { key: string } }).currency.key = "usd";
    expect(parse(duplicate)).toThrow(/duplicated/);
    const unsourced = structuredClone(base);
    (unsourced.countries[0] as { currency: { sourceIds: string[] } }).currency.sourceIds = ["nowhere"];
    expect(parse(unsourced)).toThrow(/unknown source/);
    const negative = structuredClone(base);
    (negative.countries[1] as { currency: { value: { usd: number } } }).currency.value.usd = -1;
    expect(parse(negative)).toThrow(/positive finite/);
    const paper = structuredClone(base);
    const arg = paper.countries.find((country) => country.tag === "ARG") as { currency: Record<string, unknown> };
    delete arg.currency.circulation;
    expect(parse(paper)).toThrow(/circulation rate or provisional status/);
    const circular = structuredClone(base);
    const fra = circular.countries.find((country) => country.tag === "FRA") as { currency: Record<string, unknown> };
    fra.currency.value = { kind: "par", withTag: "ROM", ratio: 1, locator: "test" };
    expect(parse(circular)).toThrow(/circular par/);
    expect(() => parseCurrencyTable1900(base, new Map(), tags)).toThrow(CurrencyTableError);
    expect(() => loadCurrencyTable(CURRENCY_TABLE_1900_FILE, tags)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------
// The formatter
// ---------------------------------------------------------------------------------

const SOURCE: MoneySource = {
  currencies: [
    { id: 1, key: "gbp", name: "Pound sterling", issuerKind: "country", issuerCountryId: 1, valuationStatus: "specified", rusdPerUnit: 80, valuationSource: "scenario" },
    { id: 2, key: "frf", name: "French franc", issuerKind: "country", issuerCountryId: 2, valuationStatus: "specified", rusdPerUnit: 4, valuationSource: "scenario" },
    { id: 3, key: "xyz", name: "Unvalued crown", issuerKind: "country", issuerCountryId: 3, valuationStatus: "unavailable", rusdPerUnit: null, valuationSource: null },
  ],
  countries: [
    { id: 1, currencyId: 1 },
    { id: 3, currencyId: 3 },
  ],
  playerCountryId: 1,
  valuationHistory: {
    months: [{ periodEndDay: 30, rusdPerUnit: { 1: 100, 2: 5 } }],
    years: [{ year: 1900, meanRusdPerUnit: { 1: 90 } }],
  },
};

describe("P3 display formatter (packages/app/src/format/money.ts)", () => {
  test("the own currency is the player's arrangement currency", () => {
    const money = createMoneyFormat(SOURCE, "own");
    expect(money.code).toBe("GBP");
    expect(money.toDisplay(800)).toBe(10);
    expect(money.fromDisplay(10)).toBe(800);
    expect(money.format(8_000_000)).toBe("100.0k GBP");
    expect(money.signed(800)).toBe("+10.00 GBP");
    expect(money.signed(-800)).toBe("-10.00 GBP");
    expect(money.price(8, "kg")).toBe("0.1000 GBP/kg");
    expect(money.unit("/yr")).toBe("GBP/yr");
  });

  test("RUSD and any registered currency are selectable; unknown choices fall back to RUSD", () => {
    expect(createMoneyFormat(SOURCE, "rusd").format(1_500_000)).toBe("1.50M RUSD");
    expect(createMoneyFormat(SOURCE, "currency:frf").format(40)).toBe("10.00 FRF");
    const unvalued = createMoneyFormat(SOURCE, "currency:xyz");
    expect(unvalued.isRusd).toBe(true);
    expect(unvalued.fallbackReason).toMatch(/no valuation/);
    expect(createMoneyFormat(SOURCE, "currency:none").fallbackReason).toMatch(/not registered/);
    expect(createMoneyFormat({ ...SOURCE, playerCountryId: null }, "own").isRusd).toBe(true);
    expect(createMoneyFormat(null, "own").code).toBe("RUSD");
    expect(RUSD_FORMAT.format(12.5)).toBe("12.50 RUSD");
    expect(RUSD_FORMAT.format(2e12)).toBe("2.00T RUSD");
  });

  test("history converts at the valuation of its own month or year", () => {
    const money = createMoneyFormat(SOURCE, "own");
    expect(money.atPeriod(30).format(1_000)).toBe("10.00 GBP");
    expect(money.atYear(1900).format(900)).toBe("10.00 GBP");
    // Months or years without a recorded valuation use the current one.
    expect(money.atPeriod(59).format(800)).toBe("10.00 GBP");
    expect(createMoneyFormat(SOURCE, "rusd").atPeriod(30).format(5)).toBe("5.00 RUSD");
  });

  test("selector options: own first, then RUSD, then valued currencies by name", () => {
    const options = displayCurrencyOptions(SOURCE);
    expect(options.map((option) => option.choice)).toEqual(["own", "rusd", "currency:frf", "currency:gbp"]);
    expect(options[0]?.label).toBe("Own currency · Pound sterling");
    expect(parseDisplayCurrencyChoice("currency:gbp")).toBe("currency:gbp");
    expect(parseDisplayCurrencyChoice("rusd")).toBe("rusd");
    expect(parseDisplayCurrencyChoice("currency:GBP")).toBe("own");
    expect(parseDisplayCurrencyChoice(42)).toBe("own");
  });

  test("money sliders work in round display units and report RUSD back", () => {
    expect(niceStep(0.37)).toBe(0.5);
    expect(niceStep(1_234)).toBe(1_000);
    expect(niceStep(Number.NaN)).toBe(1);
    const money = createMoneyFormat(SOURCE, "own");
    const scale = displaySliderScale(money, { value: 8_000, min: 0, max: 80_000, step: 100 });
    expect(scale).toEqual({ value: 100, min: 0, max: 1_000, step: 1, precision: 0 });
    expect(money.fromDisplay(scale.value)).toBe(8_000);
  });
});

// ---------------------------------------------------------------------------------
// Acceptance 1: every money label goes through the formatter (audit)
// ---------------------------------------------------------------------------------

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (name !== "generated") files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

/** Remove comments so the audit reads only code and visible text. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * RUSD may appear as visible text only where it names the unit itself: the RUSD
 * explanation, valuation rates (RUSD per currency unit), and the formatter module.
 */
const RUSD_TEXT_ALLOWED = [
  "RUSD/unit",
  "RUSD per unit",
  "RUSD per one unit",
  "RUSD is Fabric of Nations",
  "one RUSD has",
  "converted from RUSD",
  "remain RUSD",
  "counts in RUSD",
  "Shown in RUSD",
  "`RUSD — ${RUSD_UNIT_NAME}`",
];

describe("P3 acceptance: every money label goes through the formatter", () => {
  const APP_SOURCES = [join(ROOT, "packages/app/App.tsx"), ...sourceFiles(join(ROOT, "packages/app/src"))];
  const FORMATTER = join(ROOT, "packages/app/src/format/money.ts");

  test("the app never formats RUSD amounts by hand", () => {
    const findings: string[] = [];
    for (const file of APP_SOURCES) {
      if (file === FORMATTER) continue;
      const lines = code(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, index) => {
        const where = `${relative(ROOT, file)}:${String(index + 1)}`;
        if (/\bformatRUSD\b|\bformatPrice\b|\bRUSD_MONEY_TEXT\b/.test(line)) findings.push(`${where} uses an RUSD-only formatter`);
        // Visible "RUSD" text outside identifiers (formatRUSD, treasuryCashRUSD, …).
        const visible = line.replace(/[A-Za-z_]RUSD|RUSD[A-Za-z_]/g, "");
        if (/\bRUSD\b/.test(visible) && !RUSD_TEXT_ALLOWED.some((allowed) => line.includes(allowed))) {
          findings.push(`${where} shows RUSD text: ${line.trim()}`);
        }
        // An RUSD field turned into text without the formatter.
        if (/RUSD[A-Za-z]*\)?\s*\.toFixed\(/.test(line) && !/set[A-Z][A-Za-z]*Text\(/.test(line)) {
          findings.push(`${where} prints an RUSD field with toFixed`);
        }
      });
    }
    expect(findings).toEqual([]);
  });

  test("every money slider converts through the formatter", () => {
    const findings: string[] = [];
    for (const file of APP_SOURCES) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/<SliderField([\s\S]*?)\/>/g)) {
        const body = match[1] ?? "";
        if (/unit="RUSD(?!\/unit)/.test(body)) findings.push(`${relative(ROOT, file)}: ${body.slice(0, 60).trim()}`);
      }
    }
    expect(findings).toEqual([]);
  });

  test("code that formats money takes the formatter from useMoney or a MoneyFormat", () => {
    const findings: string[] = [];
    for (const file of APP_SOURCES) {
      if (file === FORMATTER) continue;
      const text = readFileSync(file, "utf8");
      if (!/money\.(format|price|signed|amount|atPeriod|atYear)\(/.test(text)) continue;
      if (!/useMoney\(|money\??: MoneyFormat|createMoneyFormat\(/.test(text)) findings.push(relative(ROOT, file));
    }
    expect(findings).toEqual([]);
  });

  test("the worker display helpers print money only through the formatter they are given", () => {
    const helpers = [
      "explanations.ts",
      "actionHistory.ts",
      "fiscalPreview.ts",
      "constructionPreview.ts",
      "monetaryPreview.ts",
      "tradePreview.ts",
      "reports.ts",
    ];
    for (const name of helpers) {
      const text = code(readFileSync(join(ROOT, "packages/sim-worker/src", name), "utf8"));
      expect({ name, hardcoded: /\}\s*RUSD(?!\/unit)\b|\bformatRUSD\(/.test(text) }).toEqual({ name, hardcoded: false });
    }
  });

  test("a non-RUSD formatter reaches every helper output", () => {
    const { scenario, world } = monetaryFixture();
    const snapshot = snapshotOf(world, scenario, M5_COUNTRY_A);
    const country = snapshot.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("no country");
    const money = createMoneyFormat(snapshot, "own");
    expect(money.code).not.toBe("RUSD");
    const texts = [
      ...buildEconomicExplanations(snapshot, country, money).flatMap((entry) => [entry.observation, ...entry.evidence]),
      describePlayerAction({ kind: "issue-debt", amountRUSD: 1_000 }, money),
      ...previewDebtIssuance(snapshot, country, 1e15, money).errors,
    ];
    const projectType = snapshot.projectTypes[0];
    const provinceId = country.provinceIds[0];
    if (projectType !== undefined && provinceId !== undefined) {
      texts.push(...previewConstruction(snapshot, country, projectType.definitionId, provinceId, money).errors);
    }
    const withMoney = texts.filter((text) => /\d/.test(text) && /\bAAA\b/.test(text));
    expect(withMoney.length).toBeGreaterThan(0);
    for (const text of texts) expect(text).not.toMatch(/\bRUSD\b(?!\/unit)/);
    expect(describePlayerAction({ kind: "issue-debt", amountRUSD: 1_000 }, RUSD_MONEY_TEXT)).toBe("borrow 1.0k RUSD");
  });

  test("dispatch headlines format their amount when shown, at the month's valuation", () => {
    const dispatch: Dispatch = {
      id: "month-30",
      kind: "treasury",
      dateLabel: "1 Feb 1900",
      headline: "Treasury closes the month 1.0k RUSD in surplus",
      amount: { rusd: 1_000, periodEndDay: 30, template: "Treasury closes the month {amount} in surplus" },
    };
    expect(dispatchHeadline(dispatch, createMoneyFormat(SOURCE, "own"))).toBe("Treasury closes the month 10.00 GBP in surplus");
    expect(dispatchHeadline(dispatch, RUSD_FORMAT)).toBe("Treasury closes the month 1.0k RUSD in surplus");
  });
});

// ---------------------------------------------------------------------------------
// Acceptance 2: changing the display currency changes no world hash
// ---------------------------------------------------------------------------------

/** Format every money field of a snapshot, as the screens do. */
function formatEverything(snapshot: SimulationSnapshot, choice: DisplayCurrencyChoice): number {
  const money = createMoneyFormat(snapshot, choice);
  let count = 0;
  const visit = (value: unknown, key: string): void => {
    if (typeof value === "number" && /RUSD/.test(key)) {
      money.format(value);
      money.atYear(1900).format(value);
      count += 1;
    } else if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, key));
    } else if (value !== null && typeof value === "object") {
      for (const [child, entry] of Object.entries(value as Record<string, unknown>)) visit(entry, child);
    }
  };
  visit(snapshot, "");
  return count;
}

describe("P3 acceptance: changing the display currency changes no world hash", () => {
  test("formatting a 1900 snapshot in every display currency leaves the world and snapshot unchanged", () => {
    const scenario = loadM11World();
    const world = createEconomyWorld({ ...scenario, playerCountryId: 1 }, { seed: P3_PROBE_SEED });
    const before = hashWorld(world);
    const snapshot = snapshotOf(world, scenario, 1);
    const frozen = JSON.stringify(snapshot);
    const choices: DisplayCurrencyChoice[] = displayCurrencyOptions(snapshot).map((option) => option.choice);
    expect(choices.length).toBe(world.currencies.length + 2);
    for (const choice of choices) expect(formatEverything(snapshot, choice)).toBeGreaterThan(100);
    expect(JSON.stringify(snapshot)).toBe(frozen);
    expect(hashWorld(world)).toBe(before);
  }, 120_000);

  test("days run while the display currency changes are identical to days run without", () => {
    const { scenario } = monetaryFixture();
    const plain = createEconomyWorld(scenario, { seed: 7 });
    const displayed = createEconomyWorld(scenario, { seed: 7 });
    const choices: DisplayCurrencyChoice[] = ["own", "rusd", "currency:bbb", "own"];
    for (let day = 0; day < 33; day += 1) {
      runEconomicDay(plain, scenario.population.definitions, scenario.definitions, plain.dayIndex, { validateWorld: false });
      plain.dayIndex += 1;
      formatEverything(snapshotOf(displayed, scenario, M5_COUNTRY_A), choices[day % choices.length] ?? "own");
      runEconomicDay(displayed, scenario.population.definitions, scenario.definitions, displayed.dayIndex, { validateWorld: false });
      displayed.dayIndex += 1;
      expect(hashWorld(displayed)).toBe(hashWorld(plain));
    }
  }, 120_000);

  test("the worker protocol has no display-currency command", () => {
    for (const type of ["SET_DISPLAY_CURRENCY", "SET_CURRENCY", "DISPLAY_CURRENCY"]) {
      expect(() =>
        parseWorkerCommand({ protocolVersion: PROTOCOL_VERSION, type, commandId: "x", currency: "gbp" }),
      ).toThrow();
    }
    const protocol = readFileSync(join(ROOT, "packages/sim-worker/src/protocol.ts"), "utf8");
    expect(protocol).not.toMatch(/displayCurrency|DISPLAY_CURRENCY/i);
  });
});

// ---------------------------------------------------------------------------------
// Acceptance 3: forced devaluation
// ---------------------------------------------------------------------------------

describe("P3 acceptance: a forced devaluation raises local figures, not RUSD figures", () => {
  test("halving the parity doubles local amounts and prices; RUSD amounts are unchanged", () => {
    const { scenario, world } = monetaryFixture();
    const before = snapshotOf(world, scenario, M5_COUNTRY_A);
    const localBefore = createMoneyFormat(before, "own");
    expect(localBefore.rusdPerUnit).toBe(0.5);
    const treasuryRUSD = treasuryOf(before);
    const priceRUSD = before.markets[0]?.prices[0]?.priceRUSD ?? Number.NaN;

    const result = applyCountryAction(
      world,
      {
        kind: "set-monetary-policy",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        regime: "pegged",
        parityRusdPerUnit: 0.25,
        reserveTransferRUSD: 0,
        currencyConversionRUSD: 0,
      },
      scenario.definitions,
    );
    expect(result.monetaryAction?.parityRusdPerUnit).toBeCloseTo(0.25, 12);
    assertValidWorld(world);

    const after = snapshotOf(world, scenario, M5_COUNTRY_A);
    const localAfter = createMoneyFormat(after, "own");
    expect(localAfter.rusdPerUnit).toBe(0.25);
    // RUSD figures are unchanged by the devaluation.
    expect(treasuryOf(after)).toBe(treasuryRUSD);
    expect(after.markets[0]?.prices[0]?.priceRUSD).toBe(priceRUSD);
    expect(createMoneyFormat(after, "rusd").format(treasuryOf(after))).toBe(
      createMoneyFormat(before, "rusd").format(treasuryRUSD),
    );
    // Local figures rise: twice as many currency units for the same RUSD.
    expect(localAfter.toDisplay(treasuryOf(after))).toBeCloseTo(2 * localBefore.toDisplay(treasuryRUSD), 9);
    expect(localAfter.toDisplay(priceRUSD)).toBeCloseTo(2 * localBefore.toDisplay(priceRUSD), 12);
    expect(localAfter.toDisplay(treasuryRUSD)).toBeGreaterThan(localBefore.toDisplay(treasuryRUSD));
    // Another currency is unaffected.
    expect(createMoneyFormat(after, "currency:bbb").rusdPerUnit).toBe(2);
  });
});

// ---------------------------------------------------------------------------------
// Month-end valuation history (schema 30)
// ---------------------------------------------------------------------------------

describe("P3 month-end closing valuations", () => {
  function runToFirstClose(): { scenario: EconomyScenarioDef; world: World } {
    const { scenario, world } = monetaryFixture();
    for (let day = 0; day < 31; day += 1) {
      runEconomicDay(world, scenario.population.definitions, scenario.definitions, world.dayIndex, { validateWorld: false });
      world.dayIndex += 1;
    }
    assertValidWorld(world);
    return { scenario, world };
  }

  test("each close records the specified valuations, ascending, and saves round-trip them", () => {
    // P4 (D-142) raised the schema to 31 (block demography, annual record) and P5
    // (D-143) to 32 (deposits, closing balances); the closing valuations are unchanged.
    expect(WORLD_SCHEMA_VERSION).toBe(32);
    const { world } = runToFirstClose();
    const summary = world.finance.periodSummaries[0];
    expect(summary?.closingValuations).toEqual([
      { currencyId: 0, rusdPerUnit: 0.5 },
      { currencyId: 1, rusdPerUnit: 2 },
    ]);
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.finance.periodSummaries[0]?.closingValuations).toEqual(summary?.closingValuations);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  }, 60_000);

  test("history keeps the old rate after a devaluation", () => {
    const { scenario, world } = runToFirstClose();
    applyCountryAction(
      world,
      {
        kind: "set-monetary-policy",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        regime: "pegged",
        parityRusdPerUnit: 0.25,
        reserveTransferRUSD: 0,
        currencyConversionRUSD: 0,
      },
      scenario.definitions,
    );
    const snapshot = snapshotOf(world, scenario, M5_COUNTRY_A);
    expect(snapshot.valuationHistory.months).toEqual([{ periodEndDay: 30, rusdPerUnit: { 0: 0.5, 1: 2 } }]);
    const money = createMoneyFormat(snapshot, "own");
    expect(money.toDisplay(100)).toBe(400);
    expect(money.atPeriod(30).toDisplay(100)).toBe(200);
  }, 60_000);

  test("malformed closing valuations are rejected", () => {
    expect(() => assertValidClosingValuations([{ currencyId: 1, rusdPerUnit: 1 }, { currencyId: 1, rusdPerUnit: 1 }], "v")).toThrow(/ascending/);
    expect(() => assertValidClosingValuations([{ currencyId: 0, rusdPerUnit: Number.NaN }], "v")).toThrow(/finite/);
    expect(() => assertValidClosingValuations([{ currencyId: 0, rusdPerUnit: 0 }], "v")).toThrow();
    expect(() => assertValidClosingValuations("x", "v")).toThrow();
  });
});

// ---------------------------------------------------------------------------------
// The currency data changes no simulated quantity
// ---------------------------------------------------------------------------------

describe("P3 currency data and simulation behaviour", () => {
  test("valuations and adopted arrangements change no simulated quantity (one day; the 35-day run is `node packages/bench/dist/p3Equivalence.js 35`)", () => {
    const { withParities, withoutValuations, preP3 } = p3EquivalenceScenarios();
    const context = {
      population: { definitions: withParities.population.definitions },
      economy: { definitions: withParities.definitions },
    };
    const worlds = [withParities, withoutValuations, preP3].map((scenario) => createEconomyWorld(scenario, { seed: P3_PROBE_SEED }));
    const [a, b, c] = worlds as [World, World, World];
    const runners = worlds.map((world) => createRollbackRunner(world));
    for (let day = 0; day < 1; day += 1) {
      for (const runner of runners) runTicksWithRollback(runner, 1, context);
      expect(hashWorld(withValuationsOf(a, b))).toBe(hashWorld(a));
      expect(simulatedQuantitiesDigest(c)).toBe(simulatedQuantitiesDigest(a));
    }
  }, 300_000);
});
