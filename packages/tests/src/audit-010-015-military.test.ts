/**
 * AUDIT-010 through AUDIT-015 regression coverage.
 *
 * Covers last-region cession validation (including stale offers), zero-recipient
 * military payments, truce boundaries, casualty-share apportionment, and crafted
 * military-state saves.
 */

import {
  M10_CAPTURED_SHARE,
  M10_DEATH_SHARE,
  M10_EQUIPMENT_DAILY_UPKEEP_RUSD,
  M10_OCCUPATION_GARRISON_COST_PER_SOLDIER_RUSD,
  M10_SOLDIER_DAILY_PAY_RUSD,
  M10_TRUCE_DAYS,
  M10_WOUNDED_SHARE,
  applyMilitaryAction,
  assertValidWorld,
  checksumOfJson,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  militaryPeopleOutsideCivilian,
  populationTotal,
  runMilitaryPhase,
  serializeWorld,
  splitMilitaryCasualties,
  validateMilitaryAction,
  type EconomyScenarioDef,
  type Id,
  type MilitaryActionInput,
  type World,
} from "@century/sim";

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

const SEED = 20_261_110;

interface LooseSave {
  checksum: string;
  payload: {
    finance: { accounts: Array<Record<string, unknown>> };
    military: {
      enabled: boolean;
      nextArmyId: number;
      armies: Array<Record<string, unknown>>;
      wars: Array<Record<string, unknown>>;
      peaceOffers: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function militaryScenario(): EconomyScenarioDef {
  const scenario = m5Scenario();
  scenario.military = {};
  return scenario;
}

function buildWorld(): World {
  const scenario = militaryScenario();
  for (const country of scenario.countries ?? []) {
    country.initialTreasuryCashRUSD = 1_000_000;
  }
  return createEconomyWorld(scenario, { seed: SEED });
}

function act(
  world: World,
  action: MilitaryActionInput,
  dayIndex = world.dayIndex,
): ReturnType<typeof applyMilitaryAction> {
  return applyMilitaryAction(world, action, dayIndex);
}

function declare(world: World, countryId: Id, targetCountryId: Id): Id {
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

function recruit(world: World, countryId: Id, regionId: Id, personnel: number): Id {
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

function advanceMilitary(world: World, days: number): void {
  for (let index = 0; index < days; index += 1) {
    runMilitaryPhase(world, world.dayIndex, { validateWorld: false });
    world.dayIndex += 1;
  }
  assertValidWorld(world);
}

function occupy(
  world: World,
  countryId: Id,
  homeRegionId: Id,
  targetRegionId: Id,
  personnel = 500,
): void {
  const targetCountry = world.countries.find((country) =>
    country.regionIds.includes(targetRegionId),
  );
  if (targetCountry === undefined) throw new Error("target region has no sovereign");
  declare(world, countryId, targetCountry.id);
  recruit(world, countryId, homeRegionId, personnel);
  advanceMilitary(world, 14);
  const army = world.military.armies.find((entry) => entry.countryId === countryId);
  if (army === undefined) throw new Error("missing army");
  act(world, {
    kind: "deploy-army",
    countryId,
    dayIndex: world.dayIndex,
    source: "player",
    armyId: army.id,
    targetRegionId,
  });
  advanceMilitary(world, 12);
  expect(world.regions.find((region) => region.id === targetRegionId)?.controllerCountryId).toBe(
    countryId,
  );
}

function accountBalance(
  world: World,
  ownerKind: string,
  ownerId: Id | null,
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

function zeroRegionPopulation(world: World, regionId: Id): void {
  for (const block of world.popBlocks) {
    if (block.regionId !== regionId) continue;
    block.maleByAge.fill(0);
    block.femaleByAge.fill(0);
  }
}

function craftSave(world: World, mutate: (payload: LooseSave["payload"]) => void): string {
  const parsed = JSON.parse(serializeWorld(world)) as LooseSave;
  mutate(parsed.payload);
  parsed.checksum = checksumOfJson(parsed.payload);
  return JSON.stringify(parsed);
}

describe("AUDIT-010 last-region cession validation", () => {
  test("a cession that would remove the opponent's last region is rejected before mutation", () => {
    const world = buildWorld();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 500);
    advanceMilitary(world, 14);
    const army = world.military.armies.find((entry) => entry.countryId === M5_COUNTRY_A);
    if (army === undefined) throw new Error("missing army");
    act(world, {
      kind: "deploy-army",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      armyId: army.id,
      targetRegionId: M5_REGION_B1,
    });
    advanceMilitary(world, 12);
    expect(world.regions.find((region) => region.id === M5_REGION_B1)?.controllerCountryId).toBe(
      M5_COUNTRY_A,
    );

    const war = world.military.wars.find((entry) => entry.endedDay === null);
    if (war === undefined) throw new Error("missing war");
    const validation = validateMilitaryAction(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      warId: war.id,
      terms: "cede-occupied",
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/last region/);
    const hash = hashWorld(world);
    expect(() =>
      act(world, {
        kind: "offer-peace",
        countryId: M5_COUNTRY_A,
        warId: war.id,
        terms: "cede-occupied",
      }),
    ).toThrow(/last region/);
    expect(hashWorld(world)).toBe(hash);
    expect(world.military.peaceOffers).toHaveLength(0);
    assertValidWorld(world);
  });

  test("a stale cession is revalidated at acceptance and cannot remove the last region", () => {
    const world = buildWorld();
    // C occupies A2, so a cession offer is initially valid (A keeps A1).
    occupy(world, M5_COUNTRY_C, M5_REGION_C1, M5_REGION_A2);
    const war = world.military.wars.find((entry) => entry.endedDay === null);
    if (war === undefined) throw new Error("missing war");
    const offer = act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_C,
      warId: war.id,
      terms: "cede-occupied",
    });
    if (offer.offerId === null) throw new Error("missing offer");

    // The world changes before acceptance: C now controls A's other region too,
    // so accepting would remove A's last sovereign region.
    const a1 = world.regions.find((region) => region.id === M5_REGION_A1);
    if (a1 === undefined) throw new Error("missing A1");
    a1.controllerCountryId = M5_COUNTRY_C;
    a1.occupiedSinceDay = world.dayIndex;
    assertValidWorld(world);

    const validation = validateMilitaryAction(world, {
      kind: "accept-peace",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
      warId: war.id,
      offerId: offer.offerId,
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/last region/);
    const hash = hashWorld(world);
    expect(() =>
      act(world, {
        kind: "accept-peace",
        countryId: M5_COUNTRY_A,
        warId: war.id,
        offerId: offer.offerId ?? 0,
      }),
    ).toThrow(/last region/);
    expect(hashWorld(world)).toBe(hash);
    expect(world.military.wars.find((entry) => entry.id === war.id)?.endedDay).toBeNull();
    expect(
      world.countries.find((country) => country.id === M5_COUNTRY_A)?.regionIds,
    ).toEqual(expect.arrayContaining([M5_REGION_A1, M5_REGION_A2]));
  });

  test("a valid multi-region cession retains the loser's remaining region and unrelated state", () => {
    const world = buildWorld();
    occupy(world, M5_COUNTRY_C, M5_REGION_C1, M5_REGION_A2);
    const war = world.military.wars.find((entry) => entry.endedDay === null);
    if (war === undefined) throw new Error("missing war");
    const treasuryA = accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash");
    const buildings = world.buildings.map((building) => ({
      id: building.id,
      regionId: building.regionId,
    }));
    const marketA2 = world.regions.find((region) => region.id === M5_REGION_A2)?.marketId;
    const offer = act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_C,
      warId: war.id,
      terms: "cede-occupied",
    });
    if (offer.offerId === null) throw new Error("missing offer");
    act(world, {
      kind: "accept-peace",
      countryId: M5_COUNTRY_A,
      warId: war.id,
      offerId: offer.offerId,
    });
    expect(world.countries.find((country) => country.id === M5_COUNTRY_A)?.regionIds).toEqual([
      M5_REGION_A1,
    ]);
    expect(world.countries.find((country) => country.id === M5_COUNTRY_C)?.regionIds).toContain(
      M5_REGION_A2,
    );
    expect(accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash")).toBe(treasuryA);
    expect(
      world.buildings.map((building) => ({ id: building.id, regionId: building.regionId })),
    ).toEqual(buildings);
    expect(world.regions.find((region) => region.id === M5_REGION_A2)?.marketId).toBe(marketA2);
    assertValidWorld(world);
  });
});

describe("AUDIT-011 zero-recipient military payments", () => {
  test("unpaid upkeep and garrison never count as paid or enable supply recovery", () => {
    const world = buildWorld();
    occupy(world, M5_COUNTRY_A, M5_REGION_A1, M5_REGION_C1, 500);
    zeroRegionPopulation(world, M5_REGION_C1);
    assertValidWorld(world);
    const army = world.military.armies.find((entry) => entry.countryId === M5_COUNTRY_A);
    if (army === undefined) throw new Error("missing army");
    const supplyBefore = army.supply;
    const organizationBefore = army.organization;
    const treasuryBefore = accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash");
    const phaseDay = world.dayIndex;
    const postingsBefore = world.finance.postings.length;
    const incomeBefore = new Map(
      world.popBlocks
        .filter((block) => block.regionId === M5_REGION_C1)
        .map((block) => [
          block.id,
          accountBalance(world, "popBlock", block.id, "military-income"),
        ]),
    );
    const result = runMilitaryPhase(world, phaseDay, { validateWorld: false });

    const payPostings = world.finance.postings
      .slice(postingsBefore)
      .filter((posting) => posting.dayIndex === phaseDay && posting.transactionKind === "military-pay");
    expect(payPostings).toHaveLength(0);
    const equipmentRequired = army.equipmentUnits * M10_EQUIPMENT_DAILY_UPKEEP_RUSD;
    const payRequired = army.personnel * M10_SOLDIER_DAILY_PAY_RUSD;
    const garrisonRequired =
      army.personnel * M10_OCCUPATION_GARRISON_COST_PER_SOLDIER_RUSD;
    expect(result.paidRUSD).toBeCloseTo(equipmentRequired, 6);
    expect(result.shortfallRUSD).toBeCloseTo(payRequired + garrisonRequired, 6);
    expect(treasuryBefore - accountBalance(world, "country", M5_COUNTRY_A, "treasury-cash")).toBeCloseTo(
      equipmentRequired,
      6,
    );
    expect(army.supply).toBeLessThan(supplyBefore);
    expect(army.organization).toBeLessThan(organizationBefore);
    for (const block of world.popBlocks.filter((entry) => entry.regionId === M5_REGION_C1)) {
      expect(accountBalance(world, "popBlock", block.id, "military-income")).toBeCloseTo(
        incomeBefore.get(block.id) ?? 0,
        6,
      );
      expect(populationTotal(block)).toBe(0);
    }
    expect(militaryPeopleOutsideCivilian(world)).toBeGreaterThan(0);
    assertValidWorld(world);
  });
});

describe("AUDIT-012 truce duration boundary", () => {
  test("a peace on day P prohibits P and P+365 and permits P+366", () => {
    const world = buildWorld();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    const war = world.military.wars.find((entry) => entry.endedDay === null);
    if (war === undefined) throw new Error("missing war");
    world.dayIndex = 10;
    const offer = act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_A,
      warId: war.id,
      terms: "white-peace",
    });
    if (offer.offerId === null) throw new Error("missing offer");
    act(world, {
      kind: "accept-peace",
      countryId: M5_COUNTRY_B,
      warId: war.id,
      offerId: offer.offerId,
    });
    expect(war.endedDay).toBe(10);
    expect(war.truceUntilDay).toBe(10 + M10_TRUCE_DAYS);
    const relation = world.military.relations.find(
      (entry) => entry.countryA === M5_COUNTRY_A && entry.countryB === M5_COUNTRY_B,
    );
    expect(relation?.truceUntilDay).toBe(10 + M10_TRUCE_DAYS);

    const declareInput = (dayIndex: number): MilitaryActionInput => ({
      kind: "declare-war",
      countryId: M5_COUNTRY_A,
      dayIndex,
      source: "player",
      targetCountryId: M5_COUNTRY_B,
      casusBelli: "border-dispute",
    });
    world.dayIndex = 10;
    expect(validateMilitaryAction(world, declareInput(10)).errors.join(" ")).toMatch(/truce/);
    world.dayIndex = 10 + M10_TRUCE_DAYS;
    expect(validateMilitaryAction(world, declareInput(world.dayIndex)).errors.join(" ")).toMatch(
      /truce/,
    );
    world.dayIndex = 11 + M10_TRUCE_DAYS;
    expect(validateMilitaryAction(world, declareInput(world.dayIndex)).valid).toBe(true);

    act(world, declareInput(world.dayIndex));
    expect(world.military.wars.filter((entry) => entry.endedDay === null)).toHaveLength(1);
    assertValidWorld(world);
  });
});

describe("AUDIT-013 casualty shares", () => {
  test("the configured death, wounded, and captured shares are all active and conserve losses", () => {
    expect(M10_DEATH_SHARE + M10_WOUNDED_SHARE + M10_CAPTURED_SHARE).toBeCloseTo(1, 12);
    expect(splitMilitaryCasualties(0)).toEqual({ deaths: 0, wounded: 0, captured: 0 });
    // A single loss must follow the configured largest share (wounded), not the
    // old rounded deaths/wounded residual.
    expect(splitMilitaryCasualties(1)).toEqual({ deaths: 0, wounded: 1, captured: 0 });
    expect(splitMilitaryCasualties(3)).toEqual({ deaths: 1, wounded: 1, captured: 1 });
    expect(splitMilitaryCasualties(10)).toEqual({ deaths: 4, wounded: 5, captured: 1 });
    expect(splitMilitaryCasualties(100)).toEqual({ deaths: 40, wounded: 45, captured: 15 });

    for (let losses = 0; losses <= 500; losses += 1) {
      const split = splitMilitaryCasualties(losses);
      expect(split.deaths + split.wounded + split.captured).toBe(losses);
      expect(Number.isInteger(split.deaths)).toBe(true);
      expect(Number.isInteger(split.wounded)).toBe(true);
      expect(Number.isInteger(split.captured)).toBe(true);
      expect(split.deaths).toBeGreaterThanOrEqual(0);
      expect(split.wounded).toBeGreaterThanOrEqual(0);
      expect(split.captured).toBeGreaterThanOrEqual(0);
      expect(Math.abs(split.deaths - losses * M10_DEATH_SHARE)).toBeLessThanOrEqual(1);
      expect(Math.abs(split.wounded - losses * M10_WOUNDED_SHARE)).toBeLessThanOrEqual(1);
      expect(Math.abs(split.captured - losses * M10_CAPTURED_SHARE)).toBeLessThanOrEqual(1);
    }
  });
});

describe("AUDIT-015 crafted military state validation", () => {
  test("missing required military accounts are rejected at save load", () => {
    // A clean enabled world has accounts but no postings, so the removed account
    // is rejected by military-state validation rather than by a dangling posting.
    const world = buildWorld();
    const missingExpense = craftSave(world, (payload) => {
      const index = payload.finance.accounts.findIndex(
        (account) => account.subtype === "military-expense",
      );
      if (index < 0) throw new Error("missing military-expense account");
      payload.finance.accounts.splice(index, 1);
    });
    expect(() => deserializeWorld(missingExpense)).toThrow(/military-expense/);

    const missingIncome = craftSave(world, (payload) => {
      const index = payload.finance.accounts.findIndex(
        (account) => account.subtype === "military-income",
      );
      if (index < 0) throw new Error("missing military-income account");
      payload.finance.accounts.splice(index, 1);
    });
    expect(() => deserializeWorld(missingIncome)).toThrow(/military-income/);
  });

  test("disabled military state cannot retain armies, wars, offers, or relations", () => {
    const world = buildWorld();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 100);
    const disabled = craftSave(world, (payload) => {
      payload.military.enabled = false;
    });
    expect(() => deserializeWorld(disabled)).toThrow(/disabled/);
  });

  test("peace offers must match the associated war's belligerents and active war", () => {
    const world = buildWorld();
    declare(world, M5_COUNTRY_A, M5_COUNTRY_B);
    const war = world.military.wars.find((entry) => entry.endedDay === null);
    if (war === undefined) throw new Error("missing war");
    act(world, {
      kind: "offer-peace",
      countryId: M5_COUNTRY_A,
      warId: war.id,
      terms: "white-peace",
    });
    const mismatch = craftSave(world, (payload) => {
      const offer = payload.military.peaceOffers[0];
      if (offer === undefined) throw new Error("missing offer");
      offer.fromCountryId = M5_COUNTRY_C;
    });
    expect(() => deserializeWorld(mismatch)).toThrow(/belligerents/);

    const ended = craftSave(world, (payload) => {
      const savedWar = payload.military.wars[0];
      if (savedWar === undefined) throw new Error("missing war");
      savedWar.endedDay = 0;
    });
    expect(() => deserializeWorld(ended)).toThrow(/ended/);
  });

  test("id counters must advance past retained military records", () => {
    const world = buildWorld();
    recruit(world, M5_COUNTRY_A, M5_REGION_A1, 100);
    const badCounter = craftSave(world, (payload) => {
      payload.military.nextArmyId = 1;
    });
    expect(() => deserializeWorld(badCounter)).toThrow(/nextArmyId/);
  });

  test("legitimate enabled and disabled military saves still load", () => {
    const enabledWorld = buildWorld();
    declare(enabledWorld, M5_COUNTRY_A, M5_COUNTRY_B);
    recruit(enabledWorld, M5_COUNTRY_A, M5_REGION_A1, 100);
    const enabledSave = serializeWorld(enabledWorld);
    expect(hashWorld(deserializeWorld(enabledSave))).toBe(hashWorld(enabledWorld));

    const disabledScenario = m5Scenario();
    const disabledWorld = createEconomyWorld(disabledScenario, { seed: SEED });
    expect(disabledWorld.military.enabled).toBe(false);
    const disabledSave = serializeWorld(disabledWorld);
    expect(hashWorld(deserializeWorld(disabledSave))).toBe(hashWorld(disabledWorld));
  });
});
