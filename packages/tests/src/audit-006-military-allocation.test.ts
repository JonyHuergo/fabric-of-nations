/**
 * AUDIT-006 regression coverage.
 *
 * Recruitment and military payments must not follow pop-block array or numeric-id
 * order. The shipped eight-polity sample orders each region's blocks with the
 * (small) academics block first, so a lowest-id rule concentrates recruitment,
 * signing costs, and pay there. These tests assert the documented proportional
 * rule against that real scenario, plus tie-breaks, storage-order independence,
 * atomicity, conservation, and balanced military accounting.
 */

import {
  applyMilitaryAction,
  assertValidWorld,
  createEconomyWorld,
  hashWorld,
  militaryPeopleOutsideCivilian,
  populationTotal,
  recruitablePeople,
  runMilitaryPhase,
  type EconomyScenarioDef,
  type Id,
  type PopBlock,
  type World,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

const SEED = 20_261_109;
const RECRUITMENT_COST = 5;
const AGE_BAND_COUNT = 17;
/** Ages 20-24: five single-year cells entirely inside the 18..45 pool. */
const ELIGIBLE_BAND = 4;
/** Ages 0-4: non-eligible people used to vary total block population. */
const CHILD_BAND = 0;

interface BlockPool {
  readonly maleEligible: number;
  readonly femaleEligible: number;
  readonly childPopulation: number;
}

interface BlockSnapshot {
  readonly maleEligible: number;
  readonly femaleEligible: number;
  readonly population: number;
}

function eligibleCount(ages: Uint32Array): number {
  let total = 0;
  for (let age = 18; age <= 45; age += 1) total += ages[age] ?? 0;
  return total;
}

function blockSnapshot(block: PopBlock): BlockSnapshot {
  return {
    maleEligible: eligibleCount(block.maleByAge),
    femaleEligible: eligibleCount(block.femaleByAge),
    population: populationTotal(block),
  };
}

function regionBlocks(world: World, regionId: Id): PopBlock[] {
  return world.popBlocks.filter((block) => block.regionId === regionId);
}

function snapshots(world: World, regionId: Id): Map<Id, BlockSnapshot> {
  return new Map(regionBlocks(world, regionId).map((block) => [block.id, blockSnapshot(block)]));
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

function professionKey(scenario: EconomyScenarioDef, block: PopBlock): string {
  const profession = scenario.population.professions.find(
    (candidate) => candidate.id === block.professionId,
  );
  return profession?.key ?? `unknown-${String(block.professionId)}`;
}

function recruit(
  world: World,
  countryId: Id,
  regionId: Id,
  personnel: number,
): ReturnType<typeof applyMilitaryAction> {
  return applyMilitaryAction(
    world,
    {
      kind: "recruit-army",
      countryId,
      dayIndex: world.dayIndex,
      source: "player",
      regionId,
      personnel,
    },
    world.dayIndex,
  );
}

function advanceMilitary(world: World, days: number): void {
  for (let index = 0; index < days; index += 1) {
    runMilitaryPhase(world, world.dayIndex, { validateWorld: false });
    world.dayIndex += 1;
  }
  assertValidWorld(world);
}

/**
 * Replace one region's age structure with controlled pools. Eligible people are
 * placed in ages 20-24, which are wholly inside the 18..45 recruitment window.
 */
function setRegionPools(
  scenario: EconomyScenarioDef,
  regionId: Id,
  pools: readonly BlockPool[],
): void {
  const blocks = scenario.population.popBlocks
    .filter((block) => block.regionId === regionId)
    .sort((left, right) => left.id - right.id);
  if (blocks.length !== pools.length) {
    throw new Error(`region ${String(regionId)} has ${String(blocks.length)} blocks`);
  }
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const pool = pools[index];
    if (block === undefined || pool === undefined) throw new Error("missing pool");
    const male = new Array<number>(AGE_BAND_COUNT).fill(0);
    const female = new Array<number>(AGE_BAND_COUNT).fill(0);
    male[ELIGIBLE_BAND] = pool.maleEligible;
    female[ELIGIBLE_BAND] = pool.femaleEligible;
    male[CHILD_BAND] = pool.childPopulation;
    block.maleAgeGroups = male;
    block.femaleAgeGroups = female;
  }
}

/** Sum `military-pay` amounts on one day by recipient block. */
function militaryPayByBlock(world: World, dayIndex: number): Map<Id, number> {
  const accountById = new Map(
    world.finance.accounts.map((account) => [account.id, account] as const),
  );
  const byBlock = new Map<Id, number>();
  for (const posting of world.finance.postings) {
    if (posting.dayIndex !== dayIndex) continue;
    if (posting.transactionKind !== "military-pay") continue;
    if (posting.targetEntityId === null) continue;
    let amount = 0;
    for (const line of posting.lines) {
      const account = accountById.get(line.accountId);
      if (account?.subtype === "military-income" && line.side === "credit") {
        amount += line.amountRUSD;
      }
    }
    if (amount > 0) {
      byBlock.set(posting.targetEntityId, (byBlock.get(posting.targetEntityId) ?? 0) + amount);
    }
  }
  return byBlock;
}

function totalPeople(world: World): number {
  let total = militaryPeopleOutsideCivilian(world);
  for (const block of world.popBlocks) total += populationTotal(block);
  return total;
}

function shippedScenario(): {
  scenario: EconomyScenarioDef;
  countryId: Id;
  regionId: Id;
  world: World;
} {
  const scenario = loadM5EightPolities();
  const country = scenario.countries?.[0];
  if (country === undefined) throw new Error("shipped scenario has no country");
  const regionId = country.regionIds[0];
  if (regionId === undefined) throw new Error("shipped country has no region");
  const world = createEconomyWorld(scenario, { seed: SEED });
  return { scenario, countryId: country.id, regionId, world };
}

describe("AUDIT-006 explicit military allocation", () => {
  test("scenario-provided initial armies use the same proportional removal", () => {
    const scenario = loadM5EightPolities();
    const country = scenario.countries?.[0];
    if (country === undefined) throw new Error("shipped scenario has no country");
    const regionId = country.regionIds[0];
    if (regionId === undefined) throw new Error("shipped country has no region");
    scenario.military = {
      armies: [
        {
          countryId: country.id,
          regionId,
          personnel: 500,
          equipmentUnits: 10,
        },
      ],
    };
    const baselineScenario = loadM5EightPolities();
    const baselineWorld = createEconomyWorld(baselineScenario, { seed: SEED });
    const baseline = snapshots(baselineWorld, regionId);
    const world = createEconomyWorld(scenario, { seed: SEED });
    expect(world.military.armies).toHaveLength(1);
    expect(world.military.armies[0]?.personnel).toBe(500);
    expect(militaryPeopleOutsideCivilian(world)).toBe(500);
    const after = snapshots(world, regionId);
    let removed = 0;
    let changedBlocks = 0;
    for (const [blockId, prior] of baseline) {
      const next = after.get(blockId);
      if (next === undefined) throw new Error("missing snapshot");
      const delta =
        prior.maleEligible - next.maleEligible + (prior.femaleEligible - next.femaleEligible);
      expect(delta).toBeGreaterThanOrEqual(0);
      removed += delta;
      if (delta > 0) changedBlocks += 1;
    }
    expect(removed).toBe(500);
    // A lowest-id rule would change exactly one block.
    expect(changedBlocks).toBeGreaterThan(1);
    assertValidWorld(world);
  });

  test("the shipped scenario recruits proportionally, not from its lowest-id academics block", () => {
    const { scenario, countryId, regionId, world } = shippedScenario();
    const blocks = regionBlocks(world, regionId).sort((left, right) => left.id - right.id);
    const lowestId = blocks[0];
    if (lowestId === undefined) throw new Error("region has no pop blocks");
    // This is the exact shape the audit found: the first block in every region is
    // the small academics block, so ascending-id allocation concentrated there.
    expect(lowestId.id).toBe(0);
    expect(professionKey(scenario, lowestId)).toBe("academics");

    const before = snapshots(world, regionId);
    const civilianBefore = world.popBlocks.reduce((total, block) => total + populationTotal(block), 0);
    const outsideBefore = militaryPeopleOutsideCivilian(world);
    const treasuryBefore = accountBalance(world, "country", countryId, "treasury-cash");
    const result = recruit(world, countryId, regionId, 10_000);
    const after = snapshots(world, regionId);
    const paid = militaryPayByBlock(world, world.dayIndex);

    let removedTotal = 0;
    let expectedMaleTotal = 0;
    for (const snapshot of before.values()) expectedMaleTotal += snapshot.maleEligible;
    for (const block of blocks) {
      const prior = before.get(block.id);
      const next = after.get(block.id);
      if (prior === undefined || next === undefined) throw new Error("missing block snapshot");
      const removed = prior.maleEligible - next.maleEligible + (prior.femaleEligible - next.femaleEligible);
      removedTotal += removed;
      expect(removed).toBeGreaterThanOrEqual(0);
      expect(removed).toBeLessThanOrEqual(prior.maleEligible + prior.femaleEligible);
      // 10,000 recruits are well below the region's male pool, so the male-first
      // rule means the allocation follows each block's male eligible weight.
      const exact = (10_000 * prior.maleEligible) / expectedMaleTotal;
      expect(Math.abs(removed - exact)).toBeLessThanOrEqual(1);
      // Signing cost is paid to the blocks that actually supplied recruits.
      expect(paid.get(block.id) ?? 0).toBeCloseTo(removed * RECRUITMENT_COST, 6);
    }
    expect(removedTotal).toBe(10_000);
    expect(paid.size).toBeGreaterThan(1);

    const academics = blocks.find((block) => professionKey(scenario, block) === "academics");
    const peasants = blocks.find((block) => professionKey(scenario, block) === "peasants");
    if (academics === undefined || peasants === undefined) throw new Error("missing professions");
    const priorAcademics = before.get(academics.id);
    const nextAcademics = after.get(academics.id);
    const priorPeasants = before.get(peasants.id);
    const nextPeasants = after.get(peasants.id);
    if (
      priorAcademics === undefined ||
      nextAcademics === undefined ||
      priorPeasants === undefined ||
      nextPeasants === undefined
    ) {
      throw new Error("missing profession snapshots");
    }
    const removedAcademics =
      priorAcademics.maleEligible - nextAcademics.maleEligible +
      (priorAcademics.femaleEligible - nextAcademics.femaleEligible);
    const removedPeasants =
      priorPeasants.maleEligible - nextPeasants.maleEligible +
      (priorPeasants.femaleEligible - nextPeasants.femaleEligible);
    expect(removedAcademics).toBeGreaterThan(0);
    expect(removedAcademics).toBeLessThan(2_000);
    expect(removedPeasants).toBeGreaterThan(removedAcademics * 10);

    // Population is conserved: recruiters left the civilian blocks and joined the roster.
    expect(totalPeople(world)).toBe(outsideBefore + civilianBefore);
    expect(militaryPeopleOutsideCivilian(world)).toBe(outsideBefore + 10_000);
    // All money moved, none was created: the treasury paid exactly the reported cost.
    expect(treasuryBefore - accountBalance(world, "country", countryId, "treasury-cash")).toBeCloseTo(
      result.spentRUSD,
      6,
    );
    expect(
      accountBalance(world, "country", countryId, "military-expense"),
    ).toBeCloseTo(result.spentRUSD, 6);
    assertValidWorld(world);
  });

  test("reversing pop-block storage order leaves the semantic allocation unchanged", () => {
    const first = shippedScenario();
    const secondScenario = loadM5EightPolities();
    const secondCountry = secondScenario.countries?.[0];
    if (secondCountry === undefined) throw new Error("shipped scenario has no country");
    const secondRegionId = secondCountry.regionIds[0];
    if (secondRegionId === undefined) throw new Error("shipped country has no region");
    const secondWorld = createEconomyWorld(secondScenario, { seed: SEED });
    secondWorld.popBlocks = [...secondWorld.popBlocks].reverse();

    const firstBefore = snapshots(first.world, first.regionId);
    const secondBefore = snapshots(secondWorld, secondRegionId);
    recruit(first.world, first.countryId, first.regionId, 10_000);
    recruit(secondWorld, secondCountry.id, secondRegionId, 10_000);

    const firstAfter = snapshots(first.world, first.regionId);
    const secondAfter = snapshots(secondWorld, secondRegionId);
    for (const [blockId, prior] of firstBefore) {
      const nextFirst = firstAfter.get(blockId);
      const priorSecond = secondBefore.get(blockId);
      const nextSecond = secondAfter.get(blockId);
      if (
        nextFirst === undefined ||
        priorSecond === undefined ||
        nextSecond === undefined
      ) {
        throw new Error("missing snapshot");
      }
      const firstRemoved =
        prior.maleEligible - nextFirst.maleEligible +
        (prior.femaleEligible - nextFirst.femaleEligible);
      const secondRemoved =
        priorSecond.maleEligible - nextSecond.maleEligible +
        (priorSecond.femaleEligible - nextSecond.femaleEligible);
      expect(secondRemoved).toBe(firstRemoved);
      expect(
        accountBalance(first.world, "popBlock", blockId, "military-income"),
      ).toBeCloseTo(accountBalance(secondWorld, "popBlock", blockId, "military-income"), 6);
    }
    expect(
      accountBalance(first.world, "country", first.countryId, "treasury-cash"),
    ).toBeCloseTo(
      accountBalance(secondWorld, "country", secondCountry.id, "treasury-cash"),
      6,
    );
  });

  test("largest-remainder ties follow population, not ascending pop-block id", () => {
    const scenario = loadM5EightPolities();
    const country = scenario.countries?.[0];
    if (country === undefined) throw new Error("shipped scenario has no country");
    const regionId = country.regionIds[0];
    if (regionId === undefined) throw new Error("shipped country has no region");
    // Equal eligible pools; total population rises with the block id, so the
    // documented population tie-break selects the *higher* ids. A numeric-id rule
    // selects the lowest ids instead.
    setRegionPools(scenario, regionId, [
      { maleEligible: 100, femaleEligible: 100, childPopulation: 100 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 200 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 300 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 400 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 500 },
    ]);
    country.initialTreasuryCashRUSD = 1_000_000;
    const world = createEconomyWorld(scenario, { seed: SEED });
    const before = snapshots(world, regionId);
    recruit(world, country.id, regionId, 2);
    const after = snapshots(world, regionId);
    const removals = new Map<Id, number>();
    for (const [blockId, prior] of before) {
      const next = after.get(blockId);
      if (next === undefined) throw new Error("missing snapshot");
      removals.set(
        blockId,
        prior.maleEligible - next.maleEligible + (prior.femaleEligible - next.femaleEligible),
      );
    }
    expect([...removals.values()].reduce((total, value) => total + value, 0)).toBe(2);
    expect(removals.get(4)).toBe(1);
    expect(removals.get(3)).toBe(1);
    expect(removals.get(0)).toBe(0);

    // Repeating the same action on an identical world gives the same tie-break.
    const repeatScenario = loadM5EightPolities();
    const repeatCountry = repeatScenario.countries?.[0];
    if (repeatCountry === undefined) throw new Error("shipped scenario has no country");
    const repeatRegionId = repeatCountry.regionIds[0];
    if (repeatRegionId === undefined) throw new Error("shipped country has no region");
    setRegionPools(repeatScenario, repeatRegionId, [
      { maleEligible: 100, femaleEligible: 100, childPopulation: 100 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 200 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 300 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 400 },
      { maleEligible: 100, femaleEligible: 100, childPopulation: 500 },
    ]);
    repeatCountry.initialTreasuryCashRUSD = 1_000_000;
    const repeatWorld = createEconomyWorld(repeatScenario, { seed: SEED });
    const repeatBefore = snapshots(repeatWorld, repeatRegionId);
    recruit(repeatWorld, repeatCountry.id, repeatRegionId, 2);
    const repeatAfter = snapshots(repeatWorld, repeatRegionId);
    for (const [blockId, prior] of repeatBefore) {
      const next = repeatAfter.get(blockId);
      if (next === undefined) throw new Error("missing snapshot");
      expect(
        prior.maleEligible - next.maleEligible + (prior.femaleEligible - next.femaleEligible),
      ).toBe(removals.get(blockId));
    }
  });

  test("identical eligible blocks use a stable keyed tie-break independent of storage order", () => {
    const build = (
      reverse: boolean,
    ): { world: World; removals: Map<Id, number> } => {
      const scenario = loadM5EightPolities();
      const country = scenario.countries?.[0];
      if (country === undefined) throw new Error("shipped scenario has no country");
      const regionId = country.regionIds[0];
      if (regionId === undefined) throw new Error("shipped country has no region");
      const pools: BlockPool[] = [];
      for (let index = 0; index < 5; index += 1) {
        pools.push({ maleEligible: 100, femaleEligible: 100, childPopulation: 100 });
      }
      setRegionPools(scenario, regionId, pools);
      country.initialTreasuryCashRUSD = 1_000_000;
      const world = createEconomyWorld(scenario, { seed: SEED });
      if (reverse) world.popBlocks = [...world.popBlocks].reverse();
      const before = snapshots(world, regionId);
      recruit(world, country.id, regionId, 2);
      const after = snapshots(world, regionId);
      const removals = new Map<Id, number>();
      for (const [blockId, prior] of before) {
        const next = after.get(blockId);
        if (next === undefined) throw new Error("missing snapshot");
        removals.set(
          blockId,
          prior.maleEligible - next.maleEligible + (prior.femaleEligible - next.femaleEligible),
        );
      }
      return { world, removals };
    };

    const first = build(false);
    const repeat = build(false);
    const reversed = build(true);
    expect([...first.removals.values()].reduce((total, value) => total + value, 0)).toBe(2);
    expect([...first.removals.values()].filter((value) => value > 0)).toHaveLength(2);
    for (const [blockId, value] of first.removals) {
      expect(repeat.removals.get(blockId)).toBe(value);
      expect(reversed.removals.get(blockId)).toBe(value);
    }
    assertValidWorld(first.world);
    assertValidWorld(repeat.world);
    assertValidWorld(reversed.world);
  });

  test("males are removed before females and no block is over-drawn", () => {
    const scenario = loadM5EightPolities();
    const country = scenario.countries?.[0];
    if (country === undefined) throw new Error("shipped scenario has no country");
    const regionId = country.regionIds[0];
    if (regionId === undefined) throw new Error("shipped country has no region");
    setRegionPools(scenario, regionId, [
      { maleEligible: 60, femaleEligible: 40, childPopulation: 0 },
      { maleEligible: 60, femaleEligible: 40, childPopulation: 0 },
      { maleEligible: 60, femaleEligible: 40, childPopulation: 0 },
      { maleEligible: 60, femaleEligible: 40, childPopulation: 0 },
      { maleEligible: 60, femaleEligible: 40, childPopulation: 0 },
    ]);
    country.initialTreasuryCashRUSD = 1_000_000;
    const world = createEconomyWorld(scenario, { seed: SEED });
    const before = snapshots(world, regionId);
    // 300 male-eligible people exist; the remaining 50 must come from females.
    recruit(world, country.id, regionId, 350);
    const after = snapshots(world, regionId);
    let removedMales = 0;
    let removedFemales = 0;
    for (const [blockId, prior] of before) {
      const next = after.get(blockId);
      if (next === undefined) throw new Error("missing snapshot");
      const maleRemoved = prior.maleEligible - next.maleEligible;
      const femaleRemoved = prior.femaleEligible - next.femaleEligible;
      expect(maleRemoved).toBe(prior.maleEligible);
      expect(femaleRemoved).toBe(10);
      expect(next.maleEligible).toBe(0);
      removedMales += maleRemoved;
      removedFemales += femaleRemoved;
    }
    expect(removedMales).toBe(300);
    expect(removedFemales).toBe(50);
    expect(recruitablePeople(world, regionId)).toBe(150);
    // Each block supplied 70 recruits, so its signing payment is exactly 70 * 5.
    const paid = militaryPayByBlock(world, world.dayIndex);
    for (const block of regionBlocks(world, regionId)) {
      expect(paid.get(block.id) ?? 0).toBeCloseTo(70 * RECRUITMENT_COST, 6);
    }
    assertValidWorld(world);
  });

  test("daily pay and garrison payments are distributed across the region's households", () => {
    const scenario = loadM5EightPolities();
    const firstCountry = scenario.countries?.[0];
    const secondCountry = scenario.countries?.[1];
    if (firstCountry === undefined || secondCountry === undefined) {
      throw new Error("shipped scenario needs two countries");
    }
    const homeRegion = firstCountry.regionIds[0];
    const targetRegion = secondCountry.regionIds[0];
    if (homeRegion === undefined || targetRegion === undefined) {
      throw new Error("shipped countries need regions");
    }
    firstCountry.initialTreasuryCashRUSD = 1_000_000_000;
    secondCountry.initialTreasuryCashRUSD = 1_000_000_000;
    const world = createEconomyWorld(scenario, { seed: SEED });
    applyMilitaryAction(
      world,
      {
        kind: "declare-war",
        countryId: firstCountry.id,
        dayIndex: world.dayIndex,
        source: "player",
        targetCountryId: secondCountry.id,
        casusBelli: "border-dispute",
      },
      world.dayIndex,
    );
    recruit(world, firstCountry.id, homeRegion, 1_000);
    advanceMilitary(world, 14);
    const army = world.military.armies.find((entry) => entry.countryId === firstCountry.id);
    if (army === undefined) throw new Error("missing army");
    applyMilitaryAction(
      world,
      {
        kind: "deploy-army",
        countryId: firstCountry.id,
        dayIndex: world.dayIndex,
        source: "player",
        armyId: army.id,
        targetRegionId: targetRegion,
      },
      world.dayIndex,
    );
    advanceMilitary(world, 12);
    expect(world.regions.find((region) => region.id === targetRegion)?.controllerCountryId).toBe(
      firstCountry.id,
    );

    const blocks = regionBlocks(world, targetRegion);
    const before = new Map(
      blocks.map((block) => [
        block.id,
        accountBalance(world, "popBlock", block.id, "military-income"),
      ]),
    );
    const phaseDay = world.dayIndex;
    const phase = runMilitaryPhase(world, phaseDay, { validateWorld: false });
    expect(phase.paidRUSD).toBeGreaterThan(0);
    const paid = militaryPayByBlock(world, phaseDay);
    let totalPaid = 0;
    for (const amount of paid.values()) totalPaid += amount;
    expect(totalPaid).toBeGreaterThan(0);
    expect(paid.size).toBeGreaterThan(1);

    let totalWeight = 0;
    const weights = new Map<Id, number>();
    for (const block of blocks) {
      const eligible = eligibleCount(block.maleByAge) + eligibleCount(block.femaleByAge);
      weights.set(block.id, eligible);
      totalWeight += eligible;
    }
    for (const block of blocks) {
      const increment =
        accountBalance(world, "popBlock", block.id, "military-income") -
        (before.get(block.id) ?? 0);
      expect(increment).toBeCloseTo((totalPaid * (weights.get(block.id) ?? 0)) / totalWeight, 4);
      // The old lowest-id rule would leave every other block at zero.
      expect(increment).toBeGreaterThan(0);
    }
    assertValidWorld(world);
  });

  test("insufficient people or treasury rejects recruitment atomically", () => {
    const populationScenario = loadM5EightPolities();
    const populationCountry = populationScenario.countries?.[0];
    if (populationCountry === undefined) throw new Error("shipped scenario has no country");
    const populationRegion = populationCountry.regionIds[0];
    if (populationRegion === undefined) throw new Error("shipped country has no region");
    populationCountry.initialTreasuryCashRUSD = 1_000_000_000_000;
    const populationWorld = createEconomyWorld(populationScenario, { seed: SEED });
    const populationHash = hashWorld(populationWorld);
    const available = recruitablePeople(populationWorld, populationRegion);
    expect(() => recruit(populationWorld, populationCountry.id, populationRegion, available + 1)).toThrow(
      /recruitable/,
    );
    expect(hashWorld(populationWorld)).toBe(populationHash);
    expect(populationWorld.military.armies).toHaveLength(0);
    assertValidWorld(populationWorld);

    const treasuryScenario = loadM5EightPolities();
    const treasuryCountry = treasuryScenario.countries?.[0];
    if (treasuryCountry === undefined) throw new Error("shipped scenario has no country");
    const treasuryRegion = treasuryCountry.regionIds[0];
    if (treasuryRegion === undefined) throw new Error("shipped country has no region");
    treasuryCountry.initialTreasuryCashRUSD = 0;
    const treasuryWorld = createEconomyWorld(treasuryScenario, { seed: SEED });
    const treasuryHash = hashWorld(treasuryWorld);
    expect(() => recruit(treasuryWorld, treasuryCountry.id, treasuryRegion, 1)).toThrow(/treasury/);
    expect(hashWorld(treasuryWorld)).toBe(treasuryHash);
    expect(treasuryWorld.military.armies).toHaveLength(0);
    assertValidWorld(treasuryWorld);
  });

  test("military postings remain balanced and conserve designated cash", () => {
    const { countryId, regionId, world } = shippedScenario();
    recruit(world, countryId, regionId, 2_000);
    runMilitaryPhase(world, world.dayIndex, { validateWorld: false });
    const accountById = new Map(
      world.finance.accounts.map((account) => [account.id, account] as const),
    );
    for (const posting of world.finance.postings) {
      let debits = 0;
      let credits = 0;
      for (const line of posting.lines) {
        const account = accountById.get(line.accountId);
        if (account === undefined) throw new Error("posting references an unknown account");
        if (line.side === "debit") debits += line.amountRUSD;
        else credits += line.amountRUSD;
      }
      expect(debits).toBeCloseTo(credits, 6);
    }
    assertValidWorld(world);
  });
});
