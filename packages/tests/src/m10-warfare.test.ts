/**
 * M10 — diplomacy, warfare, and territorial control (GDD §11, D-081).
 *
 * The central invariant is that military control (`Region.controllerCountryId`) is
 * not sovereignty (`Country.regionIds`): occupation and even the supported peace
 * cession must not transfer treasuries, buildings, people, markets, or monetary
 * authority. The tests also cover recruitment, combat casualties and conservation,
 * war/peace validation, determinism, persistence, and the worker contract.
 */

import {
  applyMilitaryAction,
  assertValidWorld,
  createEconomyWorld,
  deserializeWorld,
  governmentPeriodTotals,
  hashWorld,
  militaryPeopleOutsideCivilian,
  populationTotal,
  regionControllerCountryId,
  regionSovereignCountryId,
  runEconomicDay,
  runMilitaryPhase,
  serializeWorld,
  validateCountryAction,
  type EconomyScenarioDef,
  type World,
} from "@century/sim";
import {
  PROTOCOL_VERSION,
  parseWorkerCommand,
  type SimulationSnapshot,
  type WorkerEvent,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { buildSimulationSnapshot } from "@century/sim-worker/snapshot";
import { loadM5EightPolities } from "@century/data";

import {
  M5_COUNTRY_A,
  M5_COUNTRY_B,
  M5_COUNTRY_C,
  M5_REGION_A1,
  M5_REGION_A2,
  M5_REGION_B1,
  M5_REGION_C1,
  m5Scenario,
} from "./fixtures/m5.js";

const SEED = 20_261_107;

function m10Scenario(): EconomyScenarioDef {
  const scenario = m5Scenario();
  scenario.military = {};
  return scenario;
}

function buildMilitary(): { scenario: EconomyScenarioDef; world: World } {
  const scenario = m10Scenario();
  return { scenario, world: createEconomyWorld(scenario, { seed: SEED }) };
}

function act(
  world: World,
  action: Parameters<typeof applyMilitaryAction>[1],
  dayIndex = world.dayIndex,
): ReturnType<typeof applyMilitaryAction> {
  return applyMilitaryAction(world, action, dayIndex);
}

function recruit(
  world: World,
  countryId: number,
  regionId: number,
  personnel: number,
): number {
  const result = act(world, {
    kind: "recruit-army",
    countryId,
    dayIndex: world.dayIndex,
    source: "player",
    regionId,
    personnel,
  });
  return result.armyId ?? 0;
}

function declare(world: World, countryId: number, targetCountryId: number): number {
  const result = act(world, {
    kind: "declare-war",
    countryId,
    dayIndex: world.dayIndex,
    source: "player",
    targetCountryId,
    casusBelli: "border-dispute",
  });
  return result.warId ?? 0;
}

/** Advance only the military phase; useful before armies are formed or deployed. */
function advanceMilitary(world: World, days: number): void {
  for (let index = 0; index < days; index += 1) {
    runMilitaryPhase(world, world.dayIndex, { validateWorld: false });
    world.dayIndex += 1;
  }
  assertValidWorld(world);
}

function peopleTotal(world: World): number {
  let total = militaryPeopleOutsideCivilian(world);
  for (const block of world.popBlocks) total += populationTotal(block);
  return total;
}

function accountBalance(
  world: World,
  ownerKind: string,
  ownerId: number | null,
  subtype: string,
): number {
  const account = world.finance.accounts.find(
    (candidate) =>
      candidate.ownerKind === ownerKind &&
      candidate.ownerId === ownerId &&
      candidate.subtype === subtype,
  );
  if (account === undefined) throw new Error(`missing ${ownerKind} ${subtype}`);
  return account.balanceRUSD;
}

describe("M10 sovereignty and military control", () => {
  test("the sample enables the military system with no initial wars or armies", () => {
    const sample = loadM5EightPolities();
    const world = createEconomyWorld(sample, { seed: SEED });
    expect(world.military.enabled).toBe(true);
    expect(world.military.armies).toHaveLength(0);
    expect(world.military.wars).toHaveLength(0);
    expect(world.regions.every((region) => region.controllerCountryId === null)).toBe(true);
    // Every region has a sovereign derived from Country.regionIds, and no occupation.
    for (const region of world.regions) {
      expect(regionSovereignCountryId(world, region.id)).not.toBeNull();
      expect(regionControllerCountryId(world, region.id)).toBe(
        regionSovereignCountryId(world, region.id),
      );
    }
  });

  test("occupation changes military control only, never sovereignty or ownership", () => {
    const { world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_C);
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 500);
    advanceMilitary(world, 14);
    const armyId = world.military.armies[0]?.id ?? 0;
    act(world, {
      kind: "deploy-army",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      armyId,
      targetRegionId: M5_REGION_C1,
    });
    const treasuryC = accountBalance(world, "country", M5_COUNTRY_C, "treasury-cash");
    const marketBefore = world.regions.find((region) => region.id === M5_REGION_C1)?.marketId;
    const popBefore = peopleTotal(world);
    const buildingCountBefore = world.buildings.filter(
      (building) => building.regionId === M5_REGION_C1,
    ).length;
    const monetaryBefore = world.monetary.currencies.filter(
      (record) => record.issuerCountryId === M5_COUNTRY_C,
    );
    advanceMilitary(world, 12);
    const region = world.regions.find((candidate) => candidate.id === M5_REGION_C1);
    expect(region?.controllerCountryId).toBe(M5_COUNTRY_A);
    expect(region?.occupiedSinceDay).not.toBeNull();
    // Sovereignty, market, people, buildings, treasury, and monetary authority unchanged.
    expect(regionSovereignCountryId(world, M5_REGION_C1)).toBe(M5_COUNTRY_C);
    expect(world.countries.find((c) => c.id === M5_COUNTRY_C)?.regionIds).toContain(M5_REGION_C1);
    expect(region?.marketId).toBe(marketBefore);
    expect(peopleTotal(world)).toBe(popBefore);
    expect(
      world.buildings.filter((building) => building.regionId === M5_REGION_C1),
    ).toHaveLength(buildingCountBefore);
    expect(accountBalance(world, "country", M5_COUNTRY_C, "treasury-cash")).toBe(treasuryC);
    expect(
      world.monetary.currencies.filter((record) => record.issuerCountryId === M5_COUNTRY_C),
    ).toEqual(monetaryBefore);
    // The occupier pays a garrison cost from its own treasury.
    expect(
      world.finance.postings.some((posting) => posting.transactionKind === "military-pay"),
    ).toBe(true);
  });

  test("a peace cession moves sovereignty but not markets, people, or private assets", () => {
    const { world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_C);
    recruit(world, M5_COUNTRY_C, M5_REGION_C1, 400);
    advanceMilitary(world, 14);
    const armyId = world.military.armies[0]?.id ?? 0;
    act(world, {
      kind: "deploy-army",
      countryId: M5_COUNTRY_C,
      dayIndex: world.dayIndex,
      source: "player",
      armyId,
      targetRegionId: M5_REGION_A2,
    });
    advanceMilitary(world, 12);
    expect(world.regions.find((region) => region.id === M5_REGION_A2)?.controllerCountryId).toBe(
      M5_COUNTRY_C,
    );
    const marketBefore = world.regions.find((region) => region.id === M5_REGION_A2)?.marketId;
    const popBefore = peopleTotal(world);
    const treasuryA = accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash");
    const buildingsBefore = world.buildings.map((building) => ({
      id: building.id,
      owner: building.ownerKind,
      ownerId: building.ownerAccountId,
    }));
    const monetaryBefore = world.currencyValuations.map((valuation) => ({
      currencyId: valuation.currencyId,
      status: valuation.status,
      value: valuation.status === "specified" ? valuation.rusdPerUnit : 0,
    }));
    const war = world.military.wars.find((entry) => entry.endedDay === null);
    expect(war).toBeDefined();
    const offer = act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_C,
      dayIndex: world.dayIndex,
      source: "player",
      warId: war!.id,
      terms: "cede-occupied",
    });
    act(world, {
      kind: "accept-peace",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      warId: war!.id,
      offerId: offer.offerId ?? 0,
    });
    // Sovereignty moved exactly one region; the loser keeps its other region.
    expect(regionSovereignCountryId(world, M5_REGION_A2)).toBe(M5_COUNTRY_C);
    expect(world.countries.find((c) => c.id === M5_COUNTRY_A)?.regionIds).not.toContain(
      M5_REGION_A2,
    );
    expect(world.countries.find((c) => c.id === M5_COUNTRY_C)?.regionIds).toContain(
      M5_REGION_A2,
    );
    expect(world.countries.find((c) => c.id === M5_COUNTRY_A)?.regionIds).toContain(
      M5_REGION_A1,
    );
    // Market membership, people, treasury, buildings, and valuations are untouched.
    expect(world.regions.find((region) => region.id === M5_REGION_A2)?.marketId).toBe(marketBefore);
    expect(peopleTotal(world)).toBe(popBefore);
    expect(accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash")).toBe(treasuryA);
    expect(
      world.buildings.map((building) => ({
        id: building.id,
        owner: building.ownerKind,
        ownerId: building.ownerAccountId,
      })),
    ).toEqual(buildingsBefore);
    expect(
      world.currencyValuations.map((valuation) => ({
        currencyId: valuation.currencyId,
        status: valuation.status,
        value: valuation.status === "specified" ? valuation.rusdPerUnit : 0,
      })),
    ).toEqual(monetaryBefore);
    expect(world.regions.find((region) => region.id === M5_REGION_A2)?.controllerCountryId).toBeNull();
    assertValidWorld(world);
  });
});

describe("M10 recruitment, movement, and combat", () => {
  test("recruitment draws real people and money, and equipment is purchased", () => {
    const { world } = buildMilitary();
    const popBefore = peopleTotal(world);
    const treasuryBefore = accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash");
    const armyId = recruit(world, M5_COUNTRY_A, M5_REGION_A1, 500);
    const army = world.military.armies.find((entry) => entry.id === armyId);
    expect(army?.personnel).toBe(500);
    expect(army?.equipmentUnits).toBeGreaterThan(0);
    expect(peopleTotal(world)).toBe(popBefore);
    expect(militaryPeopleOutsideCivilian(world)).toBe(500);
    expect(accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash")).toBeLessThan(
      treasuryBefore,
    );
    expect(accountBalance(world, "country", M5_COUNTRY_A, "military-expense")).toBeGreaterThan(0);
    expect(
      world.finance.postings.some(
        (posting) => posting.transactionKind === "military-procurement",
      ),
    ).toBe(true);
    assertValidWorld(world);
  });

  test("an unaffordable recruitment is rejected without changing state", () => {
    const { world } = buildMilitary();
    // Drain the treasury through an in-world transfer chain is unnecessary: request an
    // army larger than the treasury can fund by using the whole region's people.
    const hashBefore = hashWorld(world);
    expect(() =>
      act(world, {
        kind: "recruit-army",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        regionId: M5_REGION_A1,
        personnel: 1_000_000,
      }),
    ).toThrow(/recruitable|treasury/);
    expect(hashWorld(world)).toBe(hashBefore);
    expect(world.military.armies).toHaveLength(0);
    assertValidWorld(world);
  });

  test("armies may only deploy to their own, controlled, or at-war regions", () => {
    const { world } = buildMilitary();
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 300);
    advanceMilitary(world, 14);
    const armyId = world.military.armies[0]?.id ?? 0;
    // Peaceful B is not a legal target.
    expect(() =>
      act(world, {
        kind: "deploy-army",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        armyId,
        targetRegionId: M5_REGION_B1,
      }),
    ).toThrow(/not own, controlled, or at war/);
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    act(world, {
      kind: "deploy-army",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      armyId,
      targetRegionId: M5_REGION_B1,
    });
    const army = world.military.armies.find((entry) => entry.id === armyId);
    expect(army?.destinationRegionId).toBe(M5_REGION_B1);
    expect(army?.arrivalDay).toBeGreaterThan(world.dayIndex);
  });

  test("combat produces bounded casualties, equipment loss, and people conservation", () => {
    const { world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    const attacker = recruit(world, M5_COUNTRY_A, M5_REGION_A1, 600);
    recruit(world, M5_COUNTRY_B, M5_REGION_B1, 600);
    advanceMilitary(world, 14);
    act(world, {
      kind: "deploy-army",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      armyId: attacker,
      targetRegionId: M5_REGION_B1,
    });
    const peopleBefore = peopleTotal(world);
    const treasuryA = accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash");
    const treasuryB = accountBalance(world, "country", M5_COUNTRY_B, "treasury-cash");
    let battles = 0;
    for (let day = 0; day < 15; day += 1) {
      const result = runMilitaryPhase(world, world.dayIndex, { validateWorld: false });
      battles += result.battles.length;
      world.dayIndex += 1;
      assertValidWorld(world);
    }
    expect(battles).toBeGreaterThan(0);
    const attackerArmy = world.military.armies.find((entry) => entry.id === attacker);
    expect(attackerArmy?.personnel).toBeLessThan(600);
    expect(
      world.military.casualties.reduce((total, record) => total + record.deaths, 0),
    ).toBeGreaterThan(0);
    expect(peopleTotal(world)).toBe(peopleBefore);
    // Both sides paid upkeep from their own treasuries.
    expect(accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash")).toBeLessThan(
      treasuryA,
    );
    expect(accountBalance(world, "country", M5_COUNTRY_B, "treasury-cash")).toBeLessThan(
      treasuryB,
    );
    // Organization and supply stay in their documented range.
    for (const army of world.military.armies) {
      expect(army.organization).toBeGreaterThanOrEqual(0.2);
      expect(army.organization).toBeLessThanOrEqual(1);
      expect(army.supply).toBeGreaterThanOrEqual(0);
      expect(army.supply).toBeLessThanOrEqual(1);
    }
  });

  test("a defender that loses its army cedes military control, not sovereignty", () => {
    const { world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_C);
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 900);
    advanceMilitary(world, 14);
    const armyId = world.military.armies[0]?.id ?? 0;
    act(world, {
      kind: "deploy-army",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      armyId,
      targetRegionId: M5_REGION_C1,
    });
    advanceMilitary(world, 12);
    expect(world.regions.find((region) => region.id === M5_REGION_C1)?.controllerCountryId).toBe(
      M5_COUNTRY_A,
    );
    expect(regionSovereignCountryId(world, M5_REGION_C1)).toBe(M5_COUNTRY_C);
    // White peace clears the occupation and leaves sovereignty untouched.
    const war = world.military.wars.find((entry) => entry.endedDay === null)!;
    const offer = act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      warId: war.id,
      terms: "white-peace",
    });
    act(world, {
      kind: "accept-peace",
      countryId: M5_COUNTRY_C,
      dayIndex: world.dayIndex,
      source: "player",
      warId: war.id,
      offerId: offer.offerId ?? 0,
    });
    expect(world.regions.find((region) => region.id === M5_REGION_C1)?.controllerCountryId).toBeNull();
    expect(regionSovereignCountryId(world, M5_REGION_C1)).toBe(M5_COUNTRY_C);
    assertValidWorld(world);
  });
});

describe("M10 diplomacy validation and AI", () => {
  test("invalid war and peace actions are rejected atomically", () => {
    const { world } = buildMilitary();
    expect(() =>
      act(world, {
        kind: "declare-war",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        targetCountryId: M5_COUNTRY_A,
        casusBelli: "border-dispute",
      }),
    ).toThrow(/cannot declare war on itself/);
    const warId = declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    expect(() =>
      act(world, {
        kind: "declare-war",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        targetCountryId: M5_COUNTRY_B,
        casusBelli: "trade-dispute",
      }),
    ).toThrow(/already at war/);
    // Non-belligerent cannot offer or accept.
    expect(() =>
      act(world, {
        kind: "offer-peace",
        countryId: M5_COUNTRY_C,
        dayIndex: world.dayIndex,
        source: "player",
        warId,
        terms: "white-peace",
      }),
    ).toThrow(/only a belligerent/);
    // An offer to B cannot be accepted by A.
    const offer = act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      warId,
      terms: "white-peace",
    });
    expect(() =>
      act(world, {
        kind: "accept-peace",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        warId,
        offerId: offer.offerId ?? 0,
      }),
    ).toThrow(/only the offer's recipient/);
    // White peace is then accepted by B and enforces a truce.
    act(world, {
      kind: "accept-peace",
      countryId: M5_COUNTRY_B,
      dayIndex: world.dayIndex,
      source: "player",
      warId,
      offerId: offer.offerId ?? 0,
    });
    expect(() =>
      act(world, {
        kind: "declare-war",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        targetCountryId: M5_COUNTRY_B,
        casusBelli: "border-dispute",
      }),
    ).toThrow(/truce/);
  });

  test("player and AI actions share the same validity rules", () => {
    const { world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    const playerValidation = validateCountryAction(
      world,
      {
        kind: "offer-peace",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        warId: 1,
        terms: "white-peace",
      },
      undefined,
    );
    const aiValidation = validateCountryAction(
      world,
      {
        kind: "offer-peace",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "ai",
        warId: 1,
        terms: "white-peace",
      },
      undefined,
    );
    expect(playerValidation.valid).toBe(true);
    expect(aiValidation.valid).toBe(true);
  });

  test("a deterministic AI accepts a white peace after the exhaustion threshold", () => {
    const { scenario, world } = buildMilitary();
    world.playerCountryId = M5_COUNTRY_A;
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    const offer = act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      warId: 1,
      terms: "white-peace",
    });
    expect(offer.offerId).not.toBeNull();
    // Move the war start back beyond the documented AI threshold.
    const war = world.military.wars.find((entry) => entry.id === 1)!;
    war.startedDay = 0;
    world.dayIndex = 130;
    runMilitaryPhase(world, world.dayIndex, { validateWorld: false });
    expect(war.endedDay).toBe(130);
    expect(war.truceUntilDay).not.toBeNull();
    expect(world.military.peaceOffers).toHaveLength(0);
    assertValidWorld(world);
    void scenario;
  });
});

describe("M10 determinism, persistence, and worker contract", () => {
  test("identical actions and battles produce identical world hashes", () => {
    const first = buildMilitary();
    const second = buildMilitary();
    for (const { world } of [first, second]) {
      declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
      const army = recruit(world, M5_COUNTRY_A, M5_REGION_A1, 500);
      recruit(world, M5_COUNTRY_B, M5_REGION_B1, 500);
      advanceMilitary(world, 14);
      act(world, {
        kind: "deploy-army",
        countryId: M5_COUNTRY_A,
        dayIndex: world.dayIndex,
        source: "player",
        armyId: army,
        targetRegionId: M5_REGION_B1,
      });
      advanceMilitary(world, 12);
    }
    expect(hashWorld(first.world)).toBe(hashWorld(second.world));
  });

  test("military state round-trips and the previous schema is rejected", () => {
    const { scenario, world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 300);
    runMilitaryPhase(world, world.dayIndex, { validateWorld: false });
    world.dayIndex += 1;
    const save = serializeWorld(world);
    const restored = deserializeWorld(save);
    expect(hashWorld(restored)).toBe(hashWorld(world));
    expect(serializeWorld(restored)).toBe(save);
    expect(restored.military.wars).toHaveLength(1);
    expect(restored.military.armies).toHaveLength(1);
    const parsed = JSON.parse(save) as { schemaVersion: number; payload: { schemaVersion: number } };
    parsed.schemaVersion = 25;
    parsed.payload.schemaVersion = 25;
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow();
    void scenario;
  });

  test("the worker exposes occupation and military state and applies actions", () => {
    let snapshot: SimulationSnapshot | null = null;
    let actionResult: Extract<WorkerEvent, { type: "ACTION_RESULT" }> | null = null;
    const host = new SimulationHost({
      scenario: loadM5EightPolities(),
      seed: SEED,
      emit: (event: WorkerEvent) => {
        if (event.type === "READY" || event.type === "SNAPSHOT") snapshot = event.snapshot;
        if (event.type === "ACTION_RESULT") {
          snapshot = event.snapshot;
          actionResult = event;
        }
      },
      autoPump: false,
      clock: () => 1_000,
    });
    expect(snapshot!.military.enabled).toBe(true);
    expect(snapshot!.military.armies).toHaveLength(0);
    const player = snapshot!.countries.find((country) => country.id === snapshot!.playerCountryId)!;
    expect(player.military.armies).toHaveLength(0);
    expect(player.military.relations.length).toBe(snapshot!.countries.length - 1);
    const target = snapshot!.countries.find((country) => country.id !== player.id)!;
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "m10-war",
      actionId: "ui-m10-1",
      action: {
        kind: "declare-war",
        countryId: player.id,
        targetCountryId: target.id,
        casusBelli: "border-dispute",
      },
    });
    expect(actionResult).not.toBeNull();
    expect(actionResult!.accepted).toBe(true);
    expect(actionResult!.snapshot.military.wars).toHaveLength(1);
    const region = actionResult!.snapshot.regions.find(
      (candidate) => candidate.sovereignCountryId === player.id,
    )!;
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "m10-recruit",
      actionId: "ui-m10-2",
      action: {
        kind: "recruit-army",
        countryId: player.id,
        regionId: region.id,
        personnel: 100,
      },
    });
    expect(actionResult!.accepted).toBe(true);
    expect(actionResult!.snapshot.military.armies).toHaveLength(1);
    expect(
      actionResult!.snapshot.countries.find((country) => country.id === player.id)!.military.armies,
    ).toHaveLength(1);
  });

  test("malformed military commands are rejected at the protocol boundary", () => {
    const base = {
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "m10-malformed",
      actionId: "ui-m10-3",
      action: {
        kind: "declare-war",
        countryId: 0,
        targetCountryId: 1,
        casusBelli: "border-dispute",
      },
    };
    expect(() => parseWorkerCommand(base)).not.toThrow();
    expect(() =>
      parseWorkerCommand({ ...base, action: { ...base.action, casusBelli: "insult" } }),
    ).toThrow();
    expect(() =>
      parseWorkerCommand({
        ...base,
        action: { kind: "recruit-army", countryId: 0, regionId: 0, personnel: 0 },
      }),
    ).toThrow();
  });

  test("a destroyed formation keeps its cumulative casualties in the country snapshot", () => {
    const { scenario, world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 400);
    recruit(world, M5_COUNTRY_B, M5_REGION_B1, 60);
    advanceMilitary(world, 14);
    const attackerArmyId = world.military.armies.find(
      (army) => army.countryId === M5_COUNTRY_A,
    )?.id;
    if (attackerArmyId === undefined) throw new Error("missing attacker army");
    act(world, {
      kind: "deploy-army",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      armyId: attackerArmyId,
      targetRegionId: M5_REGION_B1,
    });
    // Fight until the smaller defender formation is removed from the roster.
    for (
      let day = 0;
      day < 90 && world.military.armies.some((army) => army.countryId === M5_COUNTRY_B);
      day += 1
    ) {
      advanceMilitary(world, 1);
    }
    expect(world.military.armies.some((army) => army.countryId === M5_COUNTRY_B)).toBe(false);
    const record = world.military.casualties.find(
      (entry) => entry.countryId === M5_COUNTRY_B,
    );
    if (record === undefined) throw new Error("missing casualty record");
    expect(record.deaths + record.captured).toBeGreaterThan(0);

    const snapshot = buildSimulationSnapshot(
      world,
      scenario.definitions,
      { sequence: 1, running: false, speedDaysPerSecond: 1, achievedDaysPerSecond: 0 },
      scenario.population.definitions,
    );
    const country = snapshot.countries.find((entry) => entry.id === M5_COUNTRY_B);
    if (country === undefined) throw new Error("missing country snapshot");
    expect(country.military.deaths).toBe(record.deaths);
    expect(country.military.captured).toBe(record.captured);
    expect(country.military.wounded).toBe(
      world.military.armies
        .filter((army) => army.countryId === M5_COUNTRY_B)
        .reduce((total, army) => total + army.wounded, 0),
    );
  });

  test("military spending is reported in the fiscal accounts and monthly totals", () => {
    const { scenario, world } = buildMilitary();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 200);
    // Run a full month so the military postings are closed into a fiscal summary.
    for (let day = 0; day < 32; day += 1) {
      runEconomicDay(world, scenario.population.definitions, scenario.definitions, world.dayIndex, {
        validateWorld: false,
      });
      world.dayIndex += 1;
    }
    assertValidWorld(world);
    const summaries = world.finance.periodSummaries;
    expect(summaries.length).toBeGreaterThan(0);
    const totals = governmentPeriodTotals(world.finance, summaries[summaries.length - 1]!).find(
      (entry) => entry.countryId === M5_COUNTRY_A,
    );
    expect(totals).toBeDefined();
    expect(totals?.militaryExpenseRUSD ?? 0).toBeGreaterThan(0);
    // Military spending is an expense, so the net result is lower than revenue alone.
    expect(totals?.netFiscalResultRUSD ?? 0).toBeLessThan(
      (totals?.incomeTaxRevenueRUSD ?? 0) + (totals?.businessTaxRevenueRUSD ?? 0),
    );
    // No money was created: cash conservation across the posting set is intact.
    expect(world.finance.opening).not.toBeNull();
  });
});
