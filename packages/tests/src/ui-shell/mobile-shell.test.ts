/**
 * The mobile shell: navigation completeness, lens data rules, dispatches, touch
 * tolerance, the map bridge, the packaged atlas and the mobile-first rules.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import type { SimulationSnapshot } from "@century/sim-worker";

import { MOUSE_PICK_RADIUS, TOUCH_PICK_RADIUS } from "../../../app/src/design/tokens.js";
import { PROVINCE_CATALOG } from "../../../app/src/generated/provinceCatalog.js";
import { WORLD_CATALOG } from "../../../app/src/generated/worldCatalog.js";
import {
  MAP_LENS_IDS,
  MAP_PROTOCOL_VERSION,
  encodeMapMessage,
  parseMapCommand,
  parseMapEvent,
  type MapCommand,
  type MapEvent,
} from "../../../app/src/map/bridge/protocol.js";
import { createMeshHitIndex, createProvinceHitIndex } from "../../../app/src/map/hitTest.js";
import {
  diffProvinceStates,
  planMapCommands,
  type MapHostInputs,
} from "../../../app/src/map/host/mapHostState.js";
import { availableLenses, LENS_ORDER, type LensData } from "../../../app/src/map/lenses.js";
import { MAP_MODES, buildProvinceStates } from "../../../app/src/map/mapModes.js";
import { MAP_HEIGHT, MAP_WIDTH, projectLat, projectLon } from "../../../app/src/map/projection.js";
import { parseRenderBundle } from "../../../app/src/map/renderBundle.js";
import { PROVINCE_MAP_1900 } from "../../../app/src/provinceMapBundle.js";
import {
  DISPATCH_HISTORY_LIMIT,
  appendDispatches,
  deriveDispatches,
  type Dispatch,
  type DispatchSource,
} from "../../../app/src/screens/dispatches.js";
import { DOMAINS, domainOf, type ScreenId } from "../../../app/src/screens/navigation.js";
import { encodeProvinceEconomyTable, encodeProvinceOwnershipTable } from "@century/sim-worker";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const APP = join(ROOT, "packages/app");
const read = (path: string): string => readFileSync(join(APP, path), "utf8");

describe("navigation", () => {
  const screens = DOMAINS.flatMap((domain) => domain.items.map((item) => item.id));

  test("all thirteen screens exist, each in exactly one of four domains", () => {
    expect(DOMAINS.map((domain) => domain.id)).toEqual(["realm", "economy", "society", "world"]);
    expect(screens).toHaveLength(13);
    expect(new Set(screens).size).toBe(13);
  });

  test("the domains hold the approved screens", () => {
    const of = (id: string): readonly string[] =>
      DOMAINS.find((domain) => domain.id === id)?.items.map((item) => item.label) ?? [];
    expect(of("realm")).toEqual(["Overview", "Politics"]);
    expect(of("economy")).toEqual([
      "Budget",
      "Markets",
      "Industry",
      "Construction",
      "Trade",
      "Labor & health",
      "Money",
    ]);
    expect(of("society")).toEqual(["Population", "Technology"]);
    expect(of("world")).toEqual(["War & diplomacy", "Ledger"]);
  });

  test("every screen is routed to its component in the sheet", () => {
    const shell = read("src/screens/GameShell.tsx");
    const components: Readonly<Record<ScreenId, string>> = {
      overview: "CountryScreen",
      politics: "PoliticsScreen",
      budget: "BudgetScreen",
      markets: "MarketsScreen",
      industry: "IndustryScreen",
      construction: "ConstructionScreen",
      trade: "TradeScreen",
      labor: "LaborScreen",
      money: "MoneyScreen",
      population: "PopulationScreen",
      technology: "TechnologyScreen",
      war: "WarScreen",
      ledger: "LedgerScreen",
    };
    for (const screen of screens) {
      expect(shell).toContain(`case "${screen}":`);
      expect(shell).toContain(`<${components[screen]}`);
      expect(domainOf(screen).items.some((item) => item.id === screen)).toBe(true);
    }
  });

  test("no control of the old top bar was lost", () => {
    const shell = read("src/screens/GameShell.tsx");
    for (const control of [
      "onStart={start}",
      "onPause={pause}",
      "onStep={step}",
      "setSpeed(",
      "SPEED_VALUES",
      "onSave={saveGame}",
      "onLoad={loadGame}",
      "onRestart={restartWorker}",
      "Clear market highlight",
      "Reset map view",
      "best effort",
      "Last month",
    ]) {
      expect(shell).toContain(control);
    }
  });

  test("the map is mounted once, under every screen", () => {
    const stage = read("src/map/host/MapStage.tsx");
    expect(stage.match(/<WorldMap/gu)).toHaveLength(1);
    const app = read("App.tsx");
    expect(app).toContain("<MapStageProvider");
    for (const screen of ["App.tsx", "src/screens/GameShell.tsx", "src/screens/MainMenuScreen.tsx", "src/screens/CountrySelectionScreen.tsx"]) {
      expect(read(screen)).not.toContain("<WorldMap");
    }
  });
});

describe("lenses", () => {
  const table = (rows: readonly object[]) =>
    encodeProvinceEconomyTable(rows as unknown as Parameters<typeof encodeProvinceEconomyTable>[0], []);
  // P5 (D-143): province ownership is a column table.
  const ownership = (rows: readonly object[]) =>
    encodeProvinceOwnershipTable(rows as unknown as Parameters<typeof encodeProvinceOwnershipTable>[0]);
  const empty: LensData = { provinceOwnership: ownership([]), markets: [], provinceTable: table([]), professions: [] };
  const live = {
    provinceOwnership: ownership([{ provinceId: 1, ownerPolityId: 1, controllerPolityId: 1, controlledSinceDay: null, claimantPolityIds: [], specialStatus: "ordinary" }]),
    markets: [{ id: 0 }],
    provinceTable: table([{ id: 1, marketId: 0 }]),
    professions: [],
  } as unknown as LensData;

  test("every lens is a registered map mode", () => {
    expect([...LENS_ORDER].sort()).toEqual(Object.keys(MAP_MODES).sort());
    expect([...MAP_LENS_IDS].sort()).toEqual(Object.keys(MAP_MODES).sort());
  });

  test("before a campaign only sovereignty has data", () => {
    expect(availableLenses(null).map((lens) => lens.id)).toEqual(["political"]);
  });

  test("a lens appears only when its data exists", () => {
    expect(availableLenses(empty).map((lens) => lens.id)).toEqual(["political"]);
    expect(availableLenses({ ...live, markets: [] }).map((lens) => lens.id)).toEqual(["political", "control"]);
    expect(
      availableLenses({ ...live, provinceTable: table([{ id: 1, marketId: null }]) }).map(
        (lens) => lens.id,
      ),
    ).toEqual(["political", "control"]);
    expect(availableLenses(live).map((lens) => lens.label)).toEqual(["Political", "Control", "Markets"]);
    // P2 province lenses need a populated province in the live snapshot.
    const populated = {
      ...live,
      provinceTable: table([{ id: 1, marketId: 0, population: 10 }]),
    } as unknown as LensData;
    expect(availableLenses(populated).map((lens) => lens.id)).toEqual([
      "political",
      "control",
      "markets",
      "density",
      "urban",
      "literacy",
      "unrest",
    ]);
    // P5 (D-143): the harvest lens needs a province with farm land (a harvest factor).
    const farmed = {
      ...live,
      provinceTable: table([{ id: 1, marketId: 0, population: 10, harvestFactor: 0.92 }]),
    } as unknown as LensData;
    expect(availableLenses(farmed).map((lens) => lens.id)).toContain("harvest");
    expect(availableLenses(populated).map((lens) => lens.id)).not.toContain("harvest");
    // P7 (D-156): the unemployment lens needs a province with a labour force.
    const working = {
      ...live,
      provinceTable: table([{ id: 1, marketId: 0, population: 10, unemploymentRate: 0.04 }]),
    } as unknown as LensData;
    expect(availableLenses(working).map((lens) => lens.id)).toContain("unemployment");
    expect(availableLenses(populated).map((lens) => lens.id)).not.toContain("unemployment");
  });

  test("no lens is offered that the snapshot cannot back", () => {
    // P2: the province lenses draw values the worker snapshot carries per province.
    const protocol = readFileSync(join(ROOT, "packages/sim-worker/src/protocol.ts"), "utf8");
    for (const field of ["population", "urbanShare", "literacy", "unrest"]) {
      expect(protocol).toMatch(new RegExp(`readonly ${field}: number;`, "u"));
    }
    // P5 (D-143): harvests are modelled; the snapshot carries this year's factor.
    expect(protocol).toMatch(/readonly harvestFactor: number \| null;/u);
    // P7 (D-156): the labour market's unemployment rate per province.
    expect(protocol).toMatch(/readonly unemploymentRate: number \| null;/u);
    // Nothing the simulation does not model yet may appear as a lens.
    expect(read("src/map/lenses.ts")).not.toMatch(/gdp|wealth|deposit|infrastructure/iu);
  });
});

describe("dispatches", () => {
  const names = {
    province: (id: number) => `Province ${String(id)}`,
    polity: (id: number) => `Polity ${String(id)}`,
  };

  function source(dayIndex: number, changes: Partial<DispatchSource> = {}): DispatchSource {
    return {
      dayIndex,
      date: { year: 1914, month: 8, day: 1, label: "1914-08-01" },
      playerCountryId: 1,
      campaignComplete: false,
      countrySummaries: [
        { id: 1, name: "France", latestNetFiscalResultRUSD: null },
        { id: 2, name: "Germany", latestNetFiscalResultRUSD: null },
      ],
      countries: [
        {
          id: 1,
          technology: { statuses: [{ technologyId: 7, status: "active" }] },
          constructionProjects: [{ id: 3, status: "active", definitionName: "Railway", provinceName: "Brittany" }],
          financeHistory: [],
        },
      ],
      provinceOwnership: encodeProvinceOwnershipTable([{ provinceId: 9, ownerPolityId: 1, controllerPolityId: 1, controlledSinceDay: null, claimantPolityIds: [], specialStatus: "ordinary" }]),
      military: { wars: [], peaceOffers: [] },
      technologyCatalog: [{ technologyId: 7, name: "Radio" }],
      ...changes,
    } as unknown as DispatchSource;
  }
  const headlines = (dispatches: readonly Dispatch[]): readonly string[] =>
    dispatches.map((dispatch) => dispatch.headline);

  test("a first snapshot, or one with no change, tells nothing", () => {
    expect(deriveDispatches(null, source(1), names)).toEqual([]);
    expect(deriveDispatches(source(1), source(2), names)).toEqual([]);
  });

  test("a loaded game going backwards invents no history", () => {
    const war = { id: 1, attackerCountryId: 2, defenderCountryId: 1, endedDay: null };
    const later = source(100, { military: { wars: [war], peaceOffers: [] } as unknown as DispatchSource["military"] });
    expect(deriveDispatches(source(200), later, names)).toEqual([]);
  });

  test("a war, its end and a peace offer come from the wars in the snapshot", () => {
    const war = { id: 4, attackerCountryId: 2, defenderCountryId: 1, endedDay: null };
    const atWar = source(2, { military: { wars: [war], peaceOffers: [] } as unknown as DispatchSource["military"] });
    expect(headlines(deriveDispatches(source(1), atWar, names))).toEqual(["Germany declares war on France"]);
    const offered = source(3, {
      military: {
        wars: [war],
        peaceOffers: [{ id: 8, warId: 4, fromCountryId: 1, toCountryId: 2 }],
      } as unknown as DispatchSource["military"],
    });
    expect(headlines(deriveDispatches(atWar, offered, names))).toEqual(["France offers peace to Germany"]);
    const ended = source(4, {
      military: { wars: [{ ...war, endedDay: 4 }], peaceOffers: [] } as unknown as DispatchSource["military"],
    });
    expect(headlines(deriveDispatches(offered, ended, names))).toEqual(["War between Germany and France ends"]);
  });

  test("territory and occupation come from province ownership", () => {
    const transfer = source(2, {
      provinceOwnership: encodeProvinceOwnershipTable([{ provinceId: 9, ownerPolityId: 2, controllerPolityId: 2, controlledSinceDay: null, claimantPolityIds: [], specialStatus: "ordinary" }]),
    });
    expect(headlines(deriveDispatches(source(1), transfer, names))).toEqual(["Province 9 passes to Polity 2"]);
    const occupied = source(2, {
      provinceOwnership: encodeProvinceOwnershipTable([{ provinceId: 9, ownerPolityId: 1, controllerPolityId: 2, controlledSinceDay: null, claimantPolityIds: [], specialStatus: "ordinary" }]),
    });
    expect(headlines(deriveDispatches(source(1), occupied, names))).toEqual(["Polity 2 occupies Province 9"]);
    expect(headlines(deriveDispatches(occupied, source(3), names))).toEqual(["Polity 1 retakes Province 9"]);
  });

  test("the player's research, construction and month close are reported", () => {
    const countries = [
      {
        id: 1,
        technology: { statuses: [{ technologyId: 7, status: "researched" }] },
        constructionProjects: [{ id: 3, status: "completed", definitionName: "Railway", provinceName: "Brittany" }],
        financeHistory: [{ periodEndDay: 30, netFiscalResultRUSD: -2_500_000 }],
      },
    ] as unknown as DispatchSource["countries"];
    expect(headlines(deriveDispatches(source(1), source(2, { countries }), names))).toEqual([
      "Research complete: Radio",
      "Railway completed in Brittany",
      // P3 (D-141): the stored headline uses the one money formatter (RUSD form);
      // the display renders it in the player's currency with `dispatchHeadline`.
      "Treasury closes the month 2.50M RUSD in deficit",
    ]);
  });

  test("a month close is reported from history while the summary's result is still null", () => {
    // Regression: the first live run reported no month, because country summaries
    // leave this field null until the worker compacts the period.
    const closed = (periodEndDay: number, netFiscalResultRUSD: number): DispatchSource["countries"] =>
      [
        {
          id: 1,
          technology: { statuses: [] },
          constructionProjects: [],
          financeHistory: [{ periodEndDay, netFiscalResultRUSD }],
        },
      ] as unknown as DispatchSource["countries"];
    const before = source(30);
    const january = source(31, { countries: closed(30, 1_000) });
    const later = source(32, { countries: closed(30, 1_000) });
    const february = source(60, { countries: closed(59, 1_000) });
    expect(headlines(deriveDispatches(before, january, names))).toEqual([
      "Treasury closes the month 1.0k RUSD in surplus",
    ]);
    // The same month is not told twice, and an identical result next month still is.
    expect(deriveDispatches(january, later, names)).toEqual([]);
    expect(headlines(deriveDispatches(later, february, names))).toEqual([
      "Treasury closes the month 1.0k RUSD in surplus",
    ]);
  });

  test("identical snapshots yield identical dispatches, and one event is told once", () => {
    const war = { id: 4, attackerCountryId: 2, defenderCountryId: 1, endedDay: null };
    const atWar = source(2, { military: { wars: [war], peaceOffers: [] } as unknown as DispatchSource["military"] });
    const first = deriveDispatches(source(1), atWar, names);
    expect(deriveDispatches(source(1), atWar, names)).toEqual(first);
    expect(appendDispatches(first, first)).toEqual(first);
  });

  test("the log is bounded", () => {
    const many: Dispatch[] = Array.from({ length: DISPATCH_HISTORY_LIMIT + 10 }, (_, index) => ({
      id: String(index),
      kind: "war",
      dateLabel: "",
      headline: "",
    }));
    expect(appendDispatches([], many)).toHaveLength(DISPATCH_HISTORY_LIMIT);
  });

  test("dispatches read no clock and no random source, and are not saved", () => {
    const code = read("src/screens/dispatches.ts").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, "");
    expect(code).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now/u);
    expect(read("src/worker/SimulationProvider.tsx")).not.toContain("dispatch");
  });
});

describe("touch", () => {
  const bundle = parseRenderBundle(
    new Uint8Array(gunzipSync(readFileSync(join(APP, "public/map/world-render-v1.bin")))),
  );
  const mesh = createMeshHitIndex(PROVINCE_CATALOG.provinces, bundle);
  const rings = createProvinceHitIndex(PROVINCE_MAP_1900.provinces, bundle.raster);

  test("a fingertip gets more tolerance than a mouse", () => {
    expect(TOUCH_PICK_RADIUS).toBeGreaterThan(MOUSE_PICK_RADIUS);
    expect(TOUCH_PICK_RADIUS).toBeGreaterThanOrEqual(16);
  });

  test("the mesh index picks the same province as the authoritative rings", () => {
    let differing = 0;
    let land = 0;
    // A deterministic lattice across the whole map.
    for (let row = 1; row < 180; row += 1) {
      for (let column = 1; column < 300; column += 1) {
        const x = (column / 300) * MAP_WIDTH;
        const y = (row / 180) * MAP_HEIGHT;
        const a = mesh.pick(x, y);
        const b = rings.pick(x, y);
        if (a >= 0 || b >= 0) land += 1;
        if (a !== b) differing += 1;
      }
    }
    expect(land).toBeGreaterThan(5_000);
    // Triangulation may round a sliver at a shared vertex; it must stay marginal.
    expect(differing / land).toBeLessThan(0.002);
  });

  test("a tap beside a tiny island reaches it with a fingertip, not a mouse pointer", () => {
    const scale = 3;
    const fiji = PROVINCE_MAP_1900.provinces.find((province) => province.key.includes("tonga"));
    expect(fiji).toBeDefined();
    if (fiji === undefined) return;
    const [lon = 0, lat = 0] = fiji.label;
    const x = projectLon(lon);
    const y = projectLat(lat);
    const offset = 12 / scale;
    const finger = mesh.pickNear(x + offset, y, TOUCH_PICK_RADIUS / scale);
    expect(finger).toBeGreaterThanOrEqual(0);
    expect(mesh.pickNear(x + offset, y, MOUSE_PICK_RADIUS / scale)).toBe(-1);
  });

  test("open sea stays open even for a fingertip", () => {
    const scale = 4;
    expect(mesh.pickNear(projectLon(-42), projectLat(34), TOUCH_PICK_RADIUS / scale)).toBe(-1);
  });

  test("the engine implements the touch model inside the page", () => {
    const engine = read("src/map/mapEngine.ts");
    expect(engine).toContain("LONG_PRESS_MS");
    expect(engine).toContain("openLoupe");
    expect(engine).toContain("drawLoupe");
    expect(engine).toContain("noteTap");
    expect(engine).toContain("currentPinchDistance");
    expect(engine).toContain("TOUCH_DRAG_THRESHOLD");
  });

  test("a selection from the map leaves the camera alone; one from a list flies", () => {
    const host = read("src/map/host/AtlasMap.tsx");
    expect(host).toContain("selectionFromMap.current = true");
    expect(host).toContain('send({ type: "focus-unit", tag: selectedTag, immediate: first })');
    // The sheet moves the surface, never the camera.
    const shell = read("src/screens/GameShell.tsx");
    expect(shell).toContain("Animated.timing(stage.shift");
    expect(shell).not.toContain("focus-unit");
  });
});

describe("the bridge", () => {
  const commands: readonly MapCommand[] = [
    { type: "set-theme", eraId: "cold-war", immediate: false },
    { type: "set-lens", lens: "markets", highlightMarketId: 3 },
    { type: "set-lens", lens: "political", highlightMarketId: null },
    {
      type: "set-states",
      changes: [
        [4, "FRA", "DEU", "FRA", 2, 61.5, 0.3, 0.8, 0.02, 1.07, 1.12, 0.04],
        [5, "DEU", "DEU", "DEU", null, null, null, null, null, null, null, null],
      ],
    },
    { type: "set-selection", selectedTag: "GBR", playerTag: null, selectedProvinceIndex: 12 },
    { type: "set-insets", left: 60, right: 300, reserved: [{ left: 1, top: 2, width: 3, height: 4 }] },
    { type: "focus-unit", tag: "JPN", immediate: true },
    { type: "focus-province", index: 7 },
    { type: "zoom", direction: "out" },
    { type: "reset-view" },
    { type: "set-drift", degreesPerSecond: 1.5 },
    { type: "set-drift", degreesPerSecond: 0 },
  ];
  const events: readonly MapEvent[] = [
    { type: "ready" },
    { type: "unavailable", reason: "no WebGL2" },
    { type: "context-lost" },
    { type: "province-press", index: 3, x: 10, y: 20.5 },
    { type: "sea-press" },
    { type: "hover", index: null, x: 0, y: 0 },
    { type: "hover", index: 4, x: 1, y: 2 },
  ];

  test.each(commands.map((command) => [command.type, command] as const))("%s survives the round trip", (_type, command) => {
    expect(parseMapCommand(encodeMapMessage(command))).toEqual(command);
  });

  test.each(events.map((event) => [event.type, event] as const))("%s survives the round trip", (_type, event) => {
    expect(parseMapEvent(encodeMapMessage(event))).toEqual(event);
  });

  test("malformed messages are refused at the boundary", () => {
    const body = (value: unknown): string => JSON.stringify({ v: MAP_PROTOCOL_VERSION, body: value });
    for (const raw of [
      "not json",
      JSON.stringify({ v: 99, body: { type: "reset-view" } }),
      body({ type: "unknown" }),
      body({ type: "set-theme", eraId: "bronze-age", immediate: false }),
      body({ type: "set-lens", lens: "population", highlightMarketId: null }),
      body({ type: "set-states", changes: [[-1, "A", "A", "A", null]] }),
      body({ type: "set-states", changes: [[0, "A", "A"]] }),
      body({ type: "set-insets", left: Number.NaN, right: 0, reserved: [] }),
      body({ type: "focus-province", index: 1.5 }),
      body({ type: "set-drift", degreesPerSecond: Number.POSITIVE_INFINITY }),
      body({ type: "set-drift", degreesPerSecond: "1" }),
      body({ type: "set-drift", degreesPerSecond: 31 }),
    ]) {
      expect(() => parseMapCommand(raw)).toThrow();
    }
    for (const raw of [body({ type: "province-press", index: "3", x: 0, y: 0 }), body({ type: "hover" })]) {
      expect(() => parseMapEvent(raw)).toThrow();
    }
  });

  const base = buildProvinceStates(PROVINCE_CATALOG, WORLD_CATALOG, null);
  const inputs = (changes: Partial<MapHostInputs> = {}): MapHostInputs => ({
    eraId: "imperial",
    lens: "political",
    highlightMarketId: null,
    states: base,
    selectedTag: null,
    playerTag: null,
    selectedProvinceIndex: null,
    insetLeft: 0,
    insetRight: 0,
    reserved: [],
    drift: 0,
    ...changes,
  });

  test("a fresh page is told everything, and jumps to the era without a fade", () => {
    const types = planMapCommands(null, inputs(), base).map((command) => command.type);
    expect(types).toEqual(["set-theme", "set-lens", "set-selection", "set-insets"]);
    expect(planMapCommands(null, inputs(), base)[0]).toEqual({ type: "set-theme", eraId: "imperial", immediate: true });
  });

  test("an unchanged frame sends nothing at all", () => {
    const current = inputs({ reserved: [{ left: 1, top: 1, width: 1, height: 1 }] });
    const same = { ...current, states: [...base], reserved: [{ left: 1, top: 1, width: 1, height: 1 }] };
    expect(planMapCommands(current, same, base)).toEqual([]);
  });

  test("a province transfer sends that province alone, and geometry is never involved", () => {
    const next = [...base];
    const first = next[0];
    if (first === undefined) throw new Error("no provinces");
    next[0] = { ...first, ownerTag: "ZZZ", unitTag: "ZZZ" };
    const change = [
      0,
      "ZZZ",
      first.controllerTag,
      "ZZZ",
      first.marketId,
      first.densityPerKm2,
      first.urbanShare,
      first.literacy,
      first.unrest,
      first.harvest,
      first.crowding,
      first.unemployment,
    ];
    expect(diffProvinceStates(base, next)).toEqual([change]);
    expect(planMapCommands(inputs(), inputs({ states: next }), base)).toEqual([
      { type: "set-states", changes: [change] },
    ]);
  });

  test("an era change fades", () => {
    expect(planMapCommands(inputs(), inputs({ eraId: "digital" }), base)).toEqual([
      { type: "set-theme", eraId: "digital", immediate: false },
    ]);
  });

  test("a turning backdrop is one command to start and one to stop, never a frame", () => {
    expect(planMapCommands(null, inputs(), base).map((command) => command.type)).not.toContain("set-drift");
    const turning = inputs({ drift: 1.5 });
    expect(planMapCommands(inputs(), turning, base)).toEqual([{ type: "set-drift", degreesPerSecond: 1.5 }]);
    expect(planMapCommands(turning, { ...turning }, base)).toEqual([]);
    expect(planMapCommands(turning, inputs(), base)).toEqual([{ type: "set-drift", degreesPerSecond: 0 }]);
    expect(planMapCommands(null, turning, base).at(-1)).toEqual({ type: "set-drift", degreesPerSecond: 1.5 });
  });

  test("camera and gestures never cross the bridge", () => {
    const protocol = read("src/map/bridge/protocol.ts");
    expect(protocol).not.toMatch(/"(pan|camera|pinch|drag|set-camera)"/u);
    expect(read("src/map/host/AtlasSurface.native.tsx")).not.toContain("PanResponder");
  });
});

describe("the packaged atlas", () => {
  const html = read("public/map/atlas-v1.html");
  const manifest = JSON.parse(/name="fon-atlas" content='([^']+)'/u.exec(html)?.[1] ?? "{}") as {
    bundleSha256: string;
    tokensSha256: string;
    fonts: readonly { family: string; sha256: string }[];
    textureSize: readonly number[];
  };
  const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

  test("the page embeds the current render bundle, tokens and fonts", () => {
    expect(manifest.bundleSha256).toBe(sha256(readFileSync(join(APP, "public/map/world-render-v1.bin"))));
    expect(manifest.tokensSha256).toBe(sha256(readFileSync(join(APP, "src/design/tokens.ts"))));
    for (const font of manifest.fonts) {
      expect(font.sha256).toBe(sha256(readFileSync(join(APP, `assets/fonts/${font.family}.ttf`))));
    }
  });

  test("the page is self-contained: no file access and no network", () => {
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/(src|href)="https?:/u);
    expect(html).not.toMatch(/connect-src[^;]*https?:/u);
    expect(html).not.toMatch(/fetch\(["'`](?:https?:|map\/)/u);
  });

  test("textures are phone-sized and one channel on the GPU", () => {
    expect(manifest.textureSize[0]).toBeLessThanOrEqual(2048);
    const renderer = read("src/map/glRenderer.ts");
    expect(renderer).toContain("gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image)");
  });

  test("the decode runs in a worker, with the page as a fallback", () => {
    const main = read("src/map/runtime/main.ts");
    expect(main).toContain("new Worker(");
    expect(main).toContain("createImageBitmap");
  });

  test("native builds ship the page and load it in a WebView", () => {
    expect(read("metro.config.js")).toContain('"html"');
    expect(read("src/map/host/atlasAsset.ts")).toContain('require("../../../public/map/atlas-v1.html")');
    const surface = read("src/map/host/AtlasSurface.native.tsx");
    expect(surface).toContain("<WebView");
    expect(surface).toContain("onContentProcessDidTerminate");
    expect(surface).toContain("onRenderProcessGone");
    // Nothing may navigate this view anywhere else.
    expect(surface).toContain("onShouldStartLoadWithRequest");
    expect(surface).toContain("allowUniversalAccessFromFileURLs={false}");
  });

  test("web and native run the same runtime through the same protocol", () => {
    expect(read("src/map/host/AtlasSurface.tsx")).toContain('src: "map/atlas-v1.html"');
    const main = read("src/map/runtime/main.ts");
    expect(main).toContain("ReactNativeWebView");
    expect(main).toContain("window.parent.postMessage");
  });

  test("the rendering code is not in the React Native bundle", () => {
    for (const path of [
      "App.tsx",
      "src/components/WorldMap.tsx",
      "src/map/host/AtlasMap.tsx",
      "src/map/host/MapStage.tsx",
      "src/screens/GameShell.tsx",
    ]) {
      expect(read(path)).not.toMatch(/from "[^"]*(mapEngine|glRenderer)"/u);
    }
  });
});

describe("province data without geometry", () => {
  test("the catalogue matches the authoritative provinces, in bundle order", () => {
    expect(PROVINCE_CATALOG.provinces).toHaveLength(PROVINCE_MAP_1900.provinces.length);
    PROVINCE_CATALOG.provinces.forEach((province, index) => {
      const authoritative = PROVINCE_MAP_1900.provinces[index];
      expect(province.id).toBe(authoritative?.id);
      expect(province.key).toBe(authoritative?.key);
      expect(province.displayName).toBe(authoritative?.displayName);
      expect(province.initialOwnerPolityId).toBe(authoritative?.initialOwnerPolityId);
      expect(province.mapTag).toBe(authoritative?.mapTag);
      expect(province.area).toBe(authoritative?.area);
    });
    expect(PROVINCE_CATALOG.provinces.some((province) => "rings" in province)).toBe(false);
  });

  test("ownership resolves identically from either source", () => {
    const snapshot = {
      provinceOwnership: encodeProvinceOwnershipTable([]),
      provinceTable: encodeProvinceEconomyTable([], []),
      professions: [],
    } as unknown as SimulationSnapshot;
    expect(buildProvinceStates(PROVINCE_CATALOG, WORLD_CATALOG, snapshot)).toEqual(
      buildProvinceStates(PROVINCE_MAP_1900, WORLD_CATALOG, snapshot),
    );
  });

  test("province rings never enter the native bundle", () => {
    const native = read("src/components/provinceGeometry.native.ts");
    expect(native).not.toContain("provinceMapBundle");
    expect(native).toContain("provinces: []");
    for (const path of ["src/screens/GameShell.tsx", "src/map/host/AtlasMap.tsx", "src/map/host/MapStage.tsx", "App.tsx"]) {
      expect(read(path)).not.toContain("provinceMapBundle");
    }
    expect(read("src/components/WorldMap.tsx")).not.toContain('from "../provinceMapBundle"');
  });
});

describe("mobile first", () => {
  test("the app is landscape on every device", () => {
    const config = JSON.parse(read("app.json")) as { expo: { orientation: string } };
    expect(config.expo.orientation).toBe("landscape");
  });

  test("a modal cannot rotate a phone back to portrait", () => {
    const app = read("App.tsx");
    expect(app.match(/<Modal\b/gu)?.length).toBe(app.match(/supportedOrientations=\{LANDSCAPE\}/gu)?.length);
  });

  test("safe areas come from the native insets, not a hard-coded notch", () => {
    expect(read("App.tsx")).toContain("<SafeAreaProvider>");
    expect(read("src/screens/GameShell.tsx")).toContain("useSafeAreaInsets");
    expect(read("src/components/EntryPanel.tsx")).toContain("useSafeAreaInsets");
  });

  test("the project rule is recorded", () => {
    const rules = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    expect(rules).toMatch(/iOS and Android are the primary platforms/u);
    expect(rules).toMatch(/landscape is mandatory/iu);
  });
});
