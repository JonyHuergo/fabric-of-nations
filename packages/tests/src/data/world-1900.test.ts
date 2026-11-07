/**
 * M11 historical world, country selection, market identity, snapshot bounds,
 * map data, and slider-action range coverage.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadM11World } from "@century/data";
import {
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  runCountryAIPhase,
  serializeWorld,
  validateCountryAction,
  type CountryAction,
  type EconomyScenarioDef,
  countryProvinceIds,
} from "@century/sim";
import {
  PROTOCOL_VERSION,
  parseWorkerCommand,
  parseWorkerEvent,
  type WorkerEvent,
  provinceEconomyRows,
  type SimulationSnapshot,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(HERE, "../../../data/data");
const CATALOG = JSON.parse(
  readFileSync(join(DATA_ROOT, "historical/m11/polities_1900.json"), "utf8"),
) as {
  states: {
    id: number;
    tag: string;
    name: string;
    kind: string;
    status: string;
    sovereignTag: string | null;
    selectable: boolean;
    geometry: string[];
    markerOnly?: boolean;
    continent: string;
  }[];
  territories: {
    id: number;
    tag: string;
    name: string;
    kind: string;
    status: string;
    sovereignTag: string;
    selectable: boolean;
    geometry: string[];
    markerOnly?: boolean;
    continent: string;
  }[];
  markets: { id: number; key: string; name: string; kind: string; customsTag: string }[];
  meta: { version: string; startDate: string };
};
const MAP = JSON.parse(
  readFileSync(join(DATA_ROOT, "map/world_map_1900.json"), "utf8"),
) as {
  meta: { topologyLicense: string; naturalEarthLicense: string };
  land: number[][];
  polities: {
    tag: string;
    rings: number[][];
    holes: number[];
    small: boolean;
    markerOnly?: boolean;
  }[];
};

const SELECTABLE_STATUSES = new Set([
  "independent",
  "personal-union",
  "autonomous-vassal",
  "dominion",
]);

function tagsOfScenario(scenario: EconomyScenarioDef): Map<string, number> {
  return new Map(
    (scenario.countryMeta ?? []).map((meta) => [meta.historicalName, meta.countryId] as const),
  );
}

function tagId(scenario: EconomyScenarioDef, tag: string): number {
  const country = scenario.countries?.find((candidate) => candidate.tag === tag);
  if (country === undefined) throw new Error(`missing ${tag}`);
  return country.id;
}

function decodeRing(flat: readonly number[]): number[][] {
  const points: number[][] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < flat.length; index += 2) {
    x += flat[index] ?? 0;
    y += flat[index + 1] ?? 0;
    points.push([x / 1000, y / 1000]);
  }
  return points;
}

function newHost(scenario = loadM11World()): {
  host: SimulationHost;
  events: WorkerEvent[];
} {
  const events: WorkerEvent[] = [];
  const host = new SimulationHost({
    scenario,
    seed: 20_261_023,
    emit: (event) => events.push(event),
    autoPump: false,
  });
  return { host, events };
}

function lastEvent(events: WorkerEvent[]): WorkerEvent {
  const event = events[events.length - 1];
  if (event === undefined) throw new Error("no events");
  return event;
}

describe("M11 historical catalog", () => {
  test("classification is complete and internally consistent", () => {
    expect(CATALOG.meta.startDate).toBe("1900-01-01");
    expect(CATALOG.states.length).toBe(67);
    expect(CATALOG.territories.length).toBe(66);
    expect(CATALOG.markets.length).toBe(20);
    const selectable = CATALOG.states.filter((state) => state.selectable);
    expect(selectable.length).toBeGreaterThanOrEqual(66);
    for (const state of CATALOG.states) {
      expect(state.selectable).toBe(SELECTABLE_STATUSES.has(state.status));
      if (state.markerOnly === true) {
        expect(state.geometry).toEqual([]);
      } else {
        expect(state.geometry.length).toBeGreaterThan(0);
      }
      expect(state.continent.length).toBeGreaterThan(0);
      expect(["Americas", "Europe", "Asia", "Africa", "Oceania"]).toContain(state.continent);
    }
    for (const territory of CATALOG.territories) {
      expect(territory.selectable).toBe(false);
      expect(stateTagExists(territory.sovereignTag)).toBe(true);
      expect(territory.kind).toBe("territory");
    }
    const ids = new Set([...CATALOG.states, ...CATALOG.territories].map((entry) => entry.id));
    expect(ids.size).toBe(133);
    const tags = new Set([...CATALOG.states, ...CATALOG.territories].map((entry) => entry.tag));
    expect(tags.size).toBe(133);
    // No territory may be presented as an independent state.
    for (const territory of CATALOG.territories) {
      expect(territory.status).not.toBe("independent");
    }
    // Independent states that must be present in 1900.
    for (const tag of ["USA", "GBR", "DEU", "FRA", "RUS", "JPN", "OTT", "CHN", "ETH", "LBR", "MAR", "ZAR", "ORF", "MEX", "BRA", "ARG", "CHL", "THA", "PER", "KOR", "AUT", "TON", "SOK", "WAD", "DAR", "SHM", "CRT"]) {
      expect(tags.has(tag)).toBe(true);
    }
  });

  function stateTagExists(tag: string): boolean {
    return CATALOG.states.some((state) => state.tag === tag);
  }
});

describe("M11 world initialization", () => {
  const scenario = loadM11World();

  test("every selectable country exists as a playable simulation entity", () => {
    expect(scenario.countries?.length).toBe(67);
    // P2 (D-118, D-119, D-132): one economic record per province, one market per
    // customs territory (67 states, four recorded unions), and the 66 M11 dependent
    // territories plus Portuguese India.
    expect(scenario.population.provinceEconomies.length).toBe(1687);
    expect(scenario.markets.length).toBe(63);
    expect(scenario.countryMeta?.length).toBe(67);
    expect(scenario.marketMeta?.length).toBe(63);
    expect(scenario.territoryMeta?.length).toBe(67);
    const byTag = tagsOfScenario(scenario);
    expect(byTag.size).toBe(67);
    for (const meta of scenario.countryMeta ?? []) {
      if (!meta.selectable) continue;
      const country = scenario.countries?.find((candidate) => candidate.id === meta.countryId);
      expect(country).toBeDefined();
      expect(country?.provinceIds.length).toBeGreaterThan(0);
    }
    for (const market of scenario.marketMeta ?? []) {
      expect(market.name.length).toBeGreaterThan(3);
      expect(market.name).not.toMatch(/^Market \d+$/);
      expect(market.description.length).toBeGreaterThan(10);
    }
  });

  test("every selectable country can initialize a campaign", () => {
    const base = loadM11World();
    const selectable = (base.countryMeta ?? []).filter((meta) => meta.selectable);
    expect(selectable.length).toBe(66);
    for (const meta of selectable) {
      const scenario = { ...base, playerCountryId: meta.countryId };
      const world = createEconomyWorld(scenario, { seed: 3 });
      assertValidWorld(world);
      expect(world.playerCountryId).toBe(meta.countryId);
    }
  });

  test("the authoritative world passes all ordinary state validators", () => {
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    assertValidWorld(world);
    for (const country of world.countries) {
      expect(countryProvinceIds(world, country.id).length).toBeGreaterThan(0);
      expect(world.popBlocks.some((block) => countryProvinceIds(world, country.id).includes(block.provinceId))).toBe(true);
      expect(world.buildings.some((building) => countryProvinceIds(world, country.id).includes(building.provinceId))).toBe(true);
    }
    // P2 (D-131): a province may be uninhabited (small islands); every block and
    // building stands in a province and every populated province has a block.
    const provinceIds = new Set(world.provinceEconomies.map((province) => province.id));
    for (const block of world.popBlocks) expect(provinceIds.has(block.provinceId)).toBe(true);
    for (const building of world.buildings) expect(provinceIds.has(building.provinceId)).toBe(true);
    const populated = world.provinceEconomies.filter((province) => province.popBlockIds.length > 0).length;
    expect(populated).toBeGreaterThan(1_600);
  });

  test("AI control excludes the player country and covers the rest", () => {
    const custom = loadM11World();
    const playerId = tagId(custom, "JPN");
    custom.playerCountryId = playerId;
    const world = createEconomyWorld(custom, { seed: 7 });
    let sawEvaluation = false;
    for (let day = 0; day < 40; day += 1) {
      world.dayIndex = day;
      runCountryAIPhase(world, day);
      const player = world.countries.find((country) => country.id === playerId);
      expect(player?.ai.lastDecisionDay ?? null).toBeNull();
      if (world.countries.some((country) => country.id !== playerId && country.ai.lastDecisionDay === day)) {
        sawEvaluation = true;
      }
    }
    expect(sawEvaluation).toBe(true);
  });
});

describe("M11 country selection and persistence", () => {
  test.each([
    ["USA", "Americas"],
    ["JPN", "Asia"],
    ["ZAR", "Africa"],
    ["BRA", "Americas"],
    ["RUS", "Europe"],
    ["ETH", "Africa"],
  ])("campaign creation selects %s as the player country", (tag) => {
    const scenario = loadM11World();
    const { host, events } = newHost(scenario);
    const countryId = tagId(scenario, tag);
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: "create",
      playerCountryId: countryId,
    });
    const result = lastEvent(events) as unknown as {
      type: string;
      accepted: boolean;
      snapshot: {
        playerCountryId: number;
        countries: { id: number; tag: string }[];
        countrySummaries: { id: number }[];
      };
    };
    expect(result.type).toBe("NEW_GAME_RESULT");
    expect(result.accepted).toBe(true);
    expect(result.snapshot.playerCountryId).toBe(countryId);
    expect(result.snapshot.countries.map((country) => country.tag)).toEqual([tag]);
    expect(result.snapshot.countrySummaries.length).toBe(67);
  });

  test("non-selectable and unknown countries are rejected", () => {
    const scenario = loadM11World();
    const { host, events } = newHost(scenario);
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: "cuba",
      playerCountryId: tagId(scenario, "CUB"),
    });
    expect((lastEvent(events) as { accepted: boolean }).accepted).toBe(false);
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: "unknown",
      playerCountryId: 9999,
    });
    expect((lastEvent(events) as { accepted: boolean }).accepted).toBe(false);
  });

  test("focus adds exactly one full country record to the bounded snapshot", () => {
    const scenario = loadM11World();
    const { host, events } = newHost(scenario);
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: "create",
      playerCountryId: tagId(scenario, "USA"),
    });
    const gbr = tagId(scenario, "GBR");
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "SET_FOCUS",
      commandId: "focus",
      countryId: gbr,
    });
    const snapshot = (lastEvent(events) as unknown as {
      snapshot: {
        focusCountryId: number | null;
        countries: { id: number }[];
        countrySummaries: unknown[];
      };
    }).snapshot;
    expect(snapshot.focusCountryId).toBe(gbr);
    expect(snapshot.countries.map((country) => country.id).sort((a, b) => a - b)).toEqual(
      [tagId(scenario, "USA"), gbr].sort((a, b) => a - b),
    );
  });

  test("player identity survives canonical save/load", () => {
    const scenario = loadM11World();
    const playerId = tagId(scenario, "ZAR");
    scenario.playerCountryId = playerId;
    const world = createEconomyWorld(scenario, { seed: 42 });
    const saved = serializeWorld(world);
    const restored = deserializeWorld(saved);
    assertValidWorld(restored);
    expect(restored.playerCountryId).toBe(playerId);
    expect(restored.scenarioId).toBe(world.scenarioId);
  });

  test("snapshots stay bounded and markets never fall back to an opaque id", () => {
    const scenario = loadM11World();
    const { host, events } = newHost(scenario);
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: "create",
      playerCountryId: tagId(scenario, "DEU"),
    });
    const snapshot = (lastEvent(events) as unknown as {
      snapshot: {
        markets: {
          id: number;
          label: string;
          name: string;
          description: string;
          memberCountryIds: number[];
          provinceIds: number[];
          customsCountryId: number | null;
        }[];
        countrySummaries: { id: number; provinceIds: number[]; marketIds: number[] }[];
        provinceTable: SimulationSnapshot["provinceTable"];
        professions: SimulationSnapshot["professions"];
      };
    }).snapshot;
    expect(JSON.stringify(snapshot).length).toBeLessThan(700_000);
    for (const market of snapshot.markets) {
      expect(market.label).not.toMatch(/^Market \d+$/);
      expect(market.name).toBe(market.label);
      expect(market.description.length).toBeGreaterThan(10);
      // Every member country owns at least one province of the market.
      for (const countryId of market.memberCountryIds) {
        const country = snapshot.countrySummaries.find((entry) => entry.id === countryId);
        expect(country).toBeDefined();
        expect(country?.provinceIds.some((provinceId) => market.provinceIds.includes(provinceId))).toBe(true);
      }
      if (market.customsCountryId !== null) {
        const customs = snapshot.countrySummaries.find(
          (entry) => entry.id === market.customsCountryId,
        );
        expect(customs?.provinceIds.some((provinceId) => market.provinceIds.includes(provinceId))).toBe(true);
      }
    }
    // Every province is in exactly one market, and that market lists its country.
    for (const province of provinceEconomyRows(snapshot)) {
      expect(province.marketId).not.toBeNull();
      const market = snapshot.markets.find((entry) => entry.id === province.marketId);
      expect(market).toBeDefined();
      if (province.countryId !== null) expect(market?.memberCountryIds).toContain(province.countryId);
    }
  });
});

describe("M11 map data", () => {
  test("every catalog polity has bundled offline geometry", () => {
    expect(MAP.meta.topologyLicense).toBe("ISC");
    expect(MAP.meta.naturalEarthLicense).toBe("Public domain");
    expect(MAP.land.length).toBeGreaterThan(100);
    const tags = new Set(MAP.polities.map((polity) => polity.tag));
    for (const entry of [...CATALOG.states, ...CATALOG.territories]) {
      expect(tags.has(entry.tag)).toBe(true);
    }
    expect(MAP.polities.length).toBe(133);
    for (const polity of MAP.polities) {
      if (polity.markerOnly === true) {
        expect(polity.rings.length).toBe(0);
        continue;
      }
      expect(polity.rings.length).toBeGreaterThan(0);
      expect(polity.holes.every((index) => index >= 0 && index < polity.rings.length)).toBe(true);
      for (const flat of polity.rings) {
        expect(flat.length % 2).toBe(0);
        const points = decodeRing(flat);
        expect(points.length).toBeGreaterThanOrEqual(4);
        for (const [lon, lat] of points) {
          expect(Number.isFinite(lon)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
          expect(lat).toBeGreaterThanOrEqual(-90.001);
          expect(lat).toBeLessThanOrEqual(90.001);
          expect(Math.abs(lon ?? 0)).toBeLessThanOrEqual(541);
        }
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const current = points[index];
          if (previous === undefined || current === undefined) continue;
          // Rings are unwrapped before union; no segment may cross the seam.
          expect(Math.abs((current[0] ?? 0) - (previous[0] ?? 0))).toBeLessThanOrEqual(181);
        }
      }
    }
    for (const tag of ["RUS", "GBR", "BIN", "ZAR", "ORF", "CAP", "NAT", "NFD", "FRA", "CHN"]) {
      expect(tags.has(tag)).toBe(true);
    }
  });
});

describe("M11 slider ranges produce validated authoritative actions", () => {
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: 9 });
  /** One value per good of the 1900 catalogue (the trade-policy arrays are per good). */
  const perGood = <T,>(value: T): T[] => scenario.definitions.goods.map(() => value);
  const countryId = tagId(scenario, "USA");

  function validate(action: CountryAction): boolean {
    return validateCountryAction(world, action, scenario.definitions).valid;
  }

  function fiscal(overrides: Partial<{
    incomeTaxRate: number;
    incomeTaxAllowanceRUSDPerYear: number;
    welfareBudgetRUSDPerYear: number;
    welfareMaxWealthLevel: number;
    businessProfitTaxRate: number;
    reserveTargetRUSD: number;
  }>): CountryAction {
    return {
      kind: "set-fiscal-policy",
      countryId,
      dayIndex: 0,
      source: "player",
      incomeTaxRate: 0.05,
      incomeTaxAllowanceRUSDPerYear: 0,
      welfareBudgetRUSDPerYear: 0,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetRUSD: 0,
      ...overrides,
    };
  }

  test("fiscal slider endpoints are valid and out-of-range values are rejected", () => {
    expect(validate(fiscal({ incomeTaxRate: 0 }))).toBe(true);
    expect(validate(fiscal({ incomeTaxRate: 0.6 }))).toBe(true);
    expect(validate(fiscal({ incomeTaxRate: -0.01 }))).toBe(false);
    expect(validate(fiscal({ incomeTaxRate: 1.01 }))).toBe(false);
    expect(validate(fiscal({ businessProfitTaxRate: 0.5 }))).toBe(true);
    expect(validate(fiscal({ businessProfitTaxRate: 1.01 }))).toBe(false);
    expect(validate(fiscal({ welfareMaxWealthLevel: 0 }))).toBe(true);
    expect(validate(fiscal({ welfareMaxWealthLevel: 99 }))).toBe(true);
    expect(validate(fiscal({ welfareMaxWealthLevel: 100 }))).toBe(false);
    expect(validate(fiscal({ incomeTaxAllowanceRUSDPerYear: -1 }))).toBe(false);
    expect(validate(fiscal({ welfareBudgetRUSDPerYear: -1 }))).toBe(false);
    expect(validate(fiscal({ reserveTargetRUSD: -1 }))).toBe(false);
  });

  test("funding, training, research, subsidy, and trade slider ranges validate", () => {
    const base = { countryId, dayIndex: 0, source: "player" as const };
    expect(validate({ ...base, kind: "set-institution-funding", annualRUSD: 0 })).toBe(true);
    expect(validate({ ...base, kind: "set-institution-funding", annualRUSD: -1 })).toBe(false);
    expect(validate({ ...base, kind: "set-education-funding", annualRUSD: 1_000_000 })).toBe(true);
    expect(validate({ ...base, kind: "set-education-funding", annualRUSD: -1 })).toBe(false);
    expect(validate({ ...base, kind: "set-research-staff-share", share: 0 })).toBe(true);
    expect(validate({ ...base, kind: "set-research-staff-share", share: 1 })).toBe(true);
    expect(validate({ ...base, kind: "set-research-staff-share", share: 1.01 })).toBe(false);
    expect(validate({ ...base, kind: "set-training-budget", annualRUSD: 1_000_000 })).toBe(true);
    expect(validate({ ...base, kind: "set-training-budget", annualRUSD: -1 })).toBe(false);
    expect(validate({ ...base, kind: "set-training-stipend", annualRUSD: 0 })).toBe(true);
    expect(validate({ ...base, kind: "set-training-stipend", annualRUSD: -1 })).toBe(false);
    expect(validate({ ...base, kind: "set-training-staff-share", share: 0.5 })).toBe(true);
    expect(validate({ ...base, kind: "set-training-staff-share", share: 1.1 })).toBe(false);
    expect(validate({ ...base, kind: "set-health-staff-share", share: 0.5 })).toBe(true);
    expect(validate({ ...base, kind: "set-health-staff-share", share: -0.1 })).toBe(false);
    expect(
      validate({ ...base, kind: "set-industrial-policy", sectorSubsidyRates: [0, 0.5, 0, 0, 1, 0, 0, 0] }),
    ).toBe(true);
    expect(
      validate({ ...base, kind: "set-industrial-policy", sectorSubsidyRates: [0, 1.1, 0, 0, 0, 0, 0, 0] }),
    ).toBe(false);
    expect(
      validate({
        ...base,
        kind: "set-trade-policy",
        // P5b (D-148): one entry per good of the 57-good catalogue.
        tariffRates: perGood(0).map((rate, goodId) => (goodId === 0 ? 0.5 : rate)),
        importQuotaQuantity: perGood(null),
        exportRestricted: perGood(false),
      }),
    ).toBe(true);
    expect(
      validate({
        ...base,
        kind: "set-trade-policy",
        tariffRates: perGood(0).map((rate, goodId) => (goodId === 0 ? -0.01 : rate)),
        importQuotaQuantity: perGood(null),
        exportRestricted: perGood(false),
      }),
    ).toBe(false);
    expect(
      validate({ ...base, kind: "set-debt-policy", refinanceOnMaturity: true, maxOutstandingPrincipalRUSD: 1_000_000 }),
    ).toBe(true);
    expect(
      validate({ ...base, kind: "set-debt-policy", refinanceOnMaturity: true, maxOutstandingPrincipalRUSD: -1 }),
    ).toBe(false);
  });
});

describe("M11 worker protocol boundary", () => {
  test("the supervisor settles CREATE_GAME on NEW_GAME_RESULT", async () => {
    const { WorkerSupervisor } = await import("@century/sim-worker");
    const { host, events } = newHost();
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: "create-game-supervisor",
      playerCountryId: 0,
    });
    const result = lastEvent(events);
    const received: string[] = [];
    let errored = false;
    const supervisor = new WorkerSupervisor({
      send: () => true,
      onEvent: (event) => received.push(event.type),
      onError: () => {
        errored = true;
      },
      onTimeout: () => {
        errored = true;
      },
    });
    supervisor.markReady();
    expect(
      supervisor.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "CREATE_GAME",
        commandId: "create-game-supervisor",
        playerCountryId: 0,
      }),
    ).toBe(true);
    expect(supervisor.hasPendingCritical).toBe(true);
    supervisor.receive(result);
    expect(supervisor.hasPendingCritical).toBe(false);
    expect(received).toContain("NEW_GAME_RESULT");
    expect(errored).toBe(false);
    supervisor.dispose();
  });

  test("CREATE_GAME and SET_FOCUS are strict and reject invalid ids", () => {
    expect(
      parseWorkerCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "CREATE_GAME",
        commandId: "a",
        playerCountryId: 0,
      }).type,
    ).toBe("CREATE_GAME");
    expect(() =>
      parseWorkerCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "CREATE_GAME",
        commandId: "a",
        playerCountryId: -1,
      }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "CREATE_GAME",
        commandId: "a",
        playerCountryId: 1.5,
      }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "SET_FOCUS",
        commandId: "a",
        countryId: "USA",
      }),
    ).toThrow();
  });

  test("a protocol-13 client is rejected", () => {
    expect(() =>
      parseWorkerCommand({
        protocolVersion: 13,
        type: "PAUSE",
        commandId: "old",
      }),
    ).toThrow(/unsupported protocol/);
  });

  test("NEW_GAME_RESULT is parsed only with a valid bounded snapshot", () => {
    const { host, events } = newHost();
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: "create",
      playerCountryId: 0,
    });
    const event = lastEvent(events) as unknown as {
      snapshot: unknown;
      accepted: boolean;
      commandId: string;
    };
    expect(
      parseWorkerEvent({
        protocolVersion: PROTOCOL_VERSION,
        type: "NEW_GAME_RESULT",
        commandId: event.commandId,
        accepted: event.accepted,
        errors: [],
        snapshot: event.snapshot,
      }).type,
    ).toBe("NEW_GAME_RESULT");
  });
});
