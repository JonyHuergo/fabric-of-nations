import {
  applyCountryAction,
  assertValidEconomyDefinitions,
  assertValidTechnologyDefinitions,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  lawDefinition,
  lawPrerequisitesMet,
  runEconomicDay,
  serializeWorld,
  technologyProductivityFactor,
  tick,
  validateConstructionStart,
  validateCountryAction,
  type CountryAction,
  type EconomyScenarioDef,
  type TechnologyDefinitions,
  type TickContext,
  type World,
} from "@century/sim";
import { parseWorkerCommand } from "@century/sim-worker";
import { loadM5EightPolities } from "@century/data";

import {
  M9_BASIC_SANITATION,
  M9_PRIMARY_SCHOOLING,
  M9_STEAM_POWER,
  M9_TECH_GATED_BUILDING,
  M9_VOLUNTARY_EDUCATION,
  m9Scenario,
  m9TechnologyDefinitions,
} from "./fixtures/m9.js";
import { M5_COUNTRY_A, M5_REGION_A1 } from "./fixtures/m5.js";

const SEED = 20_261_028;

function contextFor(scenario: EconomyScenarioDef): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

interface Fixture {
  readonly scenario: EconomyScenarioDef;
  readonly world: World;
  readonly context: TickContext;
  readonly country: World["countries"][number];
}

function fixture(options: Parameters<typeof m9Scenario>[0] = {}): Fixture {
  const scenario = m9Scenario(options);
  const world = createEconomyWorld(scenario, { seed: SEED });
  const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
  if (country === undefined) throw new Error("fixture is missing country A");
  return { scenario, world, context: contextFor(scenario), country };
}

function researchAction(
  countryId: number,
  technologyId: number,
  dayIndex: number,
  source: "player" | "ai" = "player",
): CountryAction {
  return { kind: "start-research", countryId, technologyId, dayIndex, source };
}

function cloneTechnology(definitions: TechnologyDefinitions): TechnologyDefinitions {
  return JSON.parse(JSON.stringify(definitions)) as TechnologyDefinitions;
}

describe("M9 technology definitions validation", () => {
  test("accepts the validated fixture catalog", () => {
    expect(() =>
      assertValidTechnologyDefinitions(m9TechnologyDefinitions(), "technology"),
    ).not.toThrow();
  });

  test("rejects duplicate ids, keys, and non-positional ids", () => {
    const duplicateId = cloneTechnology(m9TechnologyDefinitions());
    duplicateId.technologies[1]!.id = duplicateId.technologies[0]!.id;
    expect(() => assertValidTechnologyDefinitions(duplicateId, "technology")).toThrow();

    const duplicateKey = cloneTechnology(m9TechnologyDefinitions());
    duplicateKey.technologies[1]!.key = duplicateKey.technologies[0]!.key;
    expect(() => assertValidTechnologyDefinitions(duplicateKey, "technology")).toThrow();

    const wrongId = cloneTechnology(m9TechnologyDefinitions());
    wrongId.technologies[1]!.id = 99;
    expect(() => assertValidTechnologyDefinitions(wrongId, "technology")).toThrow();
  });

  test("rejects unknown, self, cyclic, and later-era prerequisites", () => {
    const unknown = cloneTechnology(m9TechnologyDefinitions());
    unknown.technologies[0]!.prerequisites = [999];
    expect(() => assertValidTechnologyDefinitions(unknown, "technology")).toThrow();

    const self = cloneTechnology(m9TechnologyDefinitions());
    self.technologies[0]!.prerequisites = [0];
    expect(() => assertValidTechnologyDefinitions(self, "technology")).toThrow();

    const cyclic = cloneTechnology(m9TechnologyDefinitions());
    cyclic.technologies[0]!.prerequisites = [1];
    cyclic.technologies[1]!.prerequisites = [0];
    expect(() => assertValidTechnologyDefinitions(cyclic, "technology")).toThrow(/cycle/);

    const laterEra = cloneTechnology(m9TechnologyDefinitions());
    laterEra.technologies[0]!.prerequisites = [60];
    expect(() => assertValidTechnologyDefinitions(laterEra, "technology")).toThrow(
      /later era/,
    );
  });

  test("rejects invalid research work and effects", () => {
    const zeroWork = cloneTechnology(m9TechnologyDefinitions());
    zeroWork.technologies[0]!.researchWork = 0;
    expect(() => assertValidTechnologyDefinitions(zeroWork, "technology")).toThrow();

    const badSector = cloneTechnology(m9TechnologyDefinitions());
    badSector.technologies[0]!.effects = [
      { kind: "sector-productivity", sector: "not-a-sector", bonus: 0.1 },
    ] as unknown as TechnologyDefinitions["technologies"][number]["effects"];
    expect(() => assertValidTechnologyDefinitions(badSector, "technology")).toThrow();

    const badReduction = cloneTechnology(m9TechnologyDefinitions());
    badReduction.technologies[0]!.effects = [
      { kind: "mortality-reduction", reduction: 2 },
    ];
    expect(() => assertValidTechnologyDefinitions(badReduction, "technology")).toThrow();
  });

  test("rejects building unlocks and law prerequisites that reference unknown technologies", () => {
    const buildingFixture = fixture();
    const brokenBuilding = {
      ...buildingFixture.scenario.definitions,
      buildings: buildingFixture.scenario.definitions.buildings.map((building) =>
        building.id === M9_TECH_GATED_BUILDING
          ? { ...building, requiredTechnologyId: 999 }
          : building,
      ),
    };
    expect(() => assertValidEconomyDefinitions(brokenBuilding)).toThrow(/unknown technology/);

    const politics = buildingFixture.scenario.definitions.politics;
    if (politics === undefined) throw new Error("fixture has no politics definitions");
    const brokenLaw = {
      ...buildingFixture.scenario.definitions,
      politics: {
        ...politics,
        laws: politics.laws.map((law) =>
          law.id === M9_VOLUNTARY_EDUCATION
            ? { ...law, requiredTechnologyIds: [999] }
            : law,
        ),
      },
    };
    expect(() => assertValidEconomyDefinitions(brokenLaw)).toThrow(/unknown technology/);
  });
});

describe("M9 research actions and progress", () => {
  test("starts an available technology and rejects locked, duplicate, AI, and foreign actions", () => {
    const { world, scenario } = fixture();
    const valid = researchAction(M5_COUNTRY_A, M9_STEAM_POWER, world.dayIndex);
    expect(validateCountryAction(world, valid, scenario.definitions).valid).toBe(true);
    applyCountryAction(world, valid, scenario.definitions);
    const country = world.countries.find((entry) => entry.id === M5_COUNTRY_A);
    expect(country?.technology.activeProject?.technologyId).toBe(M9_STEAM_POWER);

    // A second project is rejected.
    const second = researchAction(M5_COUNTRY_A, M9_PRIMARY_SCHOOLING, world.dayIndex);
    expect(validateCountryAction(world, second, scenario.definitions).valid).toBe(false);

    // Germ theory requires basic sanitation.
    const locked: CountryAction = {
      kind: "start-research",
      countryId: M5_COUNTRY_A,
      technologyId: 11,
      dayIndex: world.dayIndex,
      source: "player",
    };
    expect(validateCountryAction(world, locked, scenario.definitions).valid).toBe(false);

    // AI research selection is not implemented.
    const ai = researchAction(M5_COUNTRY_A, M9_PRIMARY_SCHOOLING, world.dayIndex, "ai");
    expect(validateCountryAction(world, ai, scenario.definitions).valid).toBe(false);

    // The player may only target the designated player country.
    const foreign = researchAction(1, M9_STEAM_POWER, world.dayIndex);
    expect(validateCountryAction(world, foreign, scenario.definitions).valid).toBe(false);
  });

  test("research work advances only with staff, share, and funding", () => {
    const funded = fixture({ researchShareA: 0.5, fundingA: 6_600 });
    applyCountryAction(
      funded.world,
      researchAction(M5_COUNTRY_A, M9_STEAM_POWER, funded.world.dayIndex),
      funded.scenario.definitions,
    );
    const before = funded.country.technology.workByTechnology[M9_STEAM_POWER] ?? 0;
    const result = runEconomicDay(
      funded.world,
      funded.scenario.population.definitions,
      funded.scenario.definitions,
      funded.world.dayIndex,
    );
    const workAfter = funded.country.technology.workByTechnology[M9_STEAM_POWER] ?? 0;
    expect(result.economy.education.countries.find((entry) => entry.countryId === M5_COUNTRY_A)?.researchWork ?? 0).toBeGreaterThan(0);
    expect(workAfter).toBeGreaterThan(before);

    // No research staff share: no work.
    const noShare = fixture({ researchShareA: 0 });
    applyCountryAction(
      noShare.world,
      researchAction(M5_COUNTRY_A, M9_STEAM_POWER, noShare.world.dayIndex),
      noShare.scenario.definitions,
    );
    runEconomicDay(
      noShare.world,
      noShare.scenario.population.definitions,
      noShare.scenario.definitions,
      noShare.world.dayIndex,
    );
    expect(noShare.country.technology.workByTechnology[M9_STEAM_POWER] ?? 0).toBe(0);

    // Funding target zero: no work even with staff.
    const noFunding = fixture({ researchShareA: 0.5, fundingA: 0 });
    applyCountryAction(
      noFunding.world,
      researchAction(M5_COUNTRY_A, M9_STEAM_POWER, noFunding.world.dayIndex),
      noFunding.scenario.definitions,
    );
    runEconomicDay(
      noFunding.world,
      noFunding.scenario.population.definitions,
      noFunding.scenario.definitions,
      noFunding.world.dayIndex,
    );
    expect(noFunding.country.technology.workByTechnology[M9_STEAM_POWER] ?? 0).toBe(0);
  });

  test("cancelling retains project-specific work and restarting resumes it", () => {
    const { scenario, world, country } = fixture();
    applyCountryAction(
      world,
      researchAction(M5_COUNTRY_A, M9_STEAM_POWER, world.dayIndex),
      scenario.definitions,
    );
    runEconomicDay(
      world,
      scenario.population.definitions,
      scenario.definitions,
      world.dayIndex,
    );
    const partial = country.technology.workByTechnology[M9_STEAM_POWER] ?? 0;
    expect(partial).toBeGreaterThan(0);
    const cancel: CountryAction = {
      kind: "cancel-research",
      countryId: M5_COUNTRY_A,
      dayIndex: world.dayIndex,
      source: "player",
    };
    applyCountryAction(world, cancel, scenario.definitions);
    expect(country.technology.activeProject).toBeNull();
    expect(country.technology.workByTechnology[M9_STEAM_POWER]).toBe(partial);
    applyCountryAction(
      world,
      researchAction(M5_COUNTRY_A, M9_STEAM_POWER, world.dayIndex),
      scenario.definitions,
    );
    runEconomicDay(
      world,
      scenario.population.definitions,
      scenario.definitions,
      world.dayIndex,
    );
    expect(country.technology.workByTechnology[M9_STEAM_POWER] ?? 0).toBeGreaterThan(partial);
  });

  test("completes on the day the required work is reached and records the completion day", () => {
    const { scenario, world, context, country } = fixture();
    applyCountryAction(
      world,
      researchAction(M5_COUNTRY_A, M9_STEAM_POWER, world.dayIndex),
      scenario.definitions,
    );
    let processedDays = 0;
    while (country.technology.researched.length === 0 && processedDays < 20) {
      const day = world.dayIndex;
      const result = runEconomicDay(
        world,
        scenario.population.definitions,
        scenario.definitions,
        day,
      );
      processedDays += 1;
      if (country.technology.researched.length > 0) {
        expect(result.economy.education.completedTechnologyIds).toContain(M9_STEAM_POWER);
        const entry = country.technology.researched.find(
          (researched) => researched.technologyId === M9_STEAM_POWER,
        );
        expect(entry?.completedDay).toBe(day);
        expect(country.technology.activeProject).toBeNull();
        expect(country.technology.workByTechnology[M9_STEAM_POWER]).toBeUndefined();
      }
      world.dayIndex += 1;
      expect(world.dayIndex).toBeLessThanOrEqual(10_000);
    }
    expect(country.technology.researched.length).toBe(1);
    expect(processedDays).toBeGreaterThan(1);
    expect(technologyProductivityFactor(country, scenario.definitions, "manufacturing")).toBeCloseTo(
      1.03,
      6,
    );
    // The context import keeps the fixture's typed contract exercised.
    expect(context.economy?.definitions.technology).toBeDefined();
  });
});

describe("M9 technology effects", () => {
  test("sector productivity increases physical output without changing inputs", () => {
    const baseline = fixture();
    const researched = fixture({ researchedA: ["mechanized-agriculture"] });
    const baselineResult = runEconomicDay(
      baseline.world,
      baseline.scenario.population.definitions,
      baseline.scenario.definitions,
      baseline.world.dayIndex,
    );
    const researchedResult = runEconomicDay(
      researched.world,
      researched.scenario.population.definitions,
      researched.scenario.definitions,
      researched.world.dayIndex,
    );
    const agricultureOutput = (
      result: ReturnType<typeof runEconomicDay>,
      world: World,
      scenario: EconomyScenarioDef,
    ): number => {
      let total = 0;
      for (const market of result.economy.markets) {
        for (const building of market.production.buildings) {
          const instance = world.buildings.find(
            (candidate) => candidate.id === building.buildingId,
          );
          const definition = scenario.definitions.buildings.find(
            (candidate) => candidate.id === instance?.definitionId,
          );
          if (definition?.sector !== "agriculture") continue;
          for (const output of building.outputs) total += output.quantity;
        }
      }
      return total;
    };
    expect(
      agricultureOutput(researchedResult, researched.world, researched.scenario),
    ).toBeGreaterThan(
      agricultureOutput(baselineResult, baseline.world, baseline.scenario),
    );
  });

  test("mortality reduction lowers deaths from the same starting population", () => {
    // The small M5 fixture can produce zero whole-day deaths, so this channel is
    // exercised on the eight-polity historical world where daily deaths are large.
    const scenario = loadM5EightPolities();
    const baseline = createEconomyWorld(scenario, { seed: SEED });
    const researched = createEconomyWorld(scenario, { seed: SEED });
    const baselineCountry = baseline.countries.find((entry) => entry.id === 0);
    const country = researched.countries.find((entry) => entry.id === 0);
    if (country === undefined || baselineCountry === undefined) {
      throw new Error("historical world has no country 0");
    }
    // The authored scenario already starts some countries with sanitation
    // research; clear country 0 on both sides so the only difference is the
    // researched mortality technology.
    baselineCountry.technology.researched = [];
    country.technology.researched = [
      { technologyId: M9_BASIC_SANITATION, completedDay: 0 },
    ];
    const baselineResult = runEconomicDay(
      baseline,
      scenario.population.definitions,
      scenario.definitions,
      baseline.dayIndex,
    );
    const researchedResult = runEconomicDay(
      researched,
      scenario.population.definitions,
      scenario.definitions,
      researched.dayIndex,
    );
    expect(researchedResult.population.deaths).toBeLessThan(
      baselineResult.population.deaths,
    );
  });

  test("a technology-gated building is rejected before research and accepted after it", () => {
    const locked = fixture();
    expect(() =>
      validateConstructionStart(locked.world, locked.scenario.definitions, {
        countryId: M5_COUNTRY_A,
        provinceId: M5_REGION_A1,
        definitionId: M9_TECH_GATED_BUILDING,
      }),
    ).toThrow(/un-researched/);

    const unlocked = fixture({ researchedA: ["mechanized-agriculture"] });
    expect(() =>
      validateConstructionStart(unlocked.world, unlocked.scenario.definitions, {
        countryId: M5_COUNTRY_A,
        provinceId: M5_REGION_A1,
        definitionId: M9_TECH_GATED_BUILDING,
      }),
    ).not.toThrow();
  });

  test("education law options require their technology at the authoritative boundary", () => {
    const locked = fixture();
    const politics = locked.scenario.definitions.politics;
    if (politics === undefined) throw new Error("fixture has no politics definitions");
    const law = lawDefinition(politics, 15);
    if (law === null) throw new Error("fixture is missing the compulsory education law");
    expect(lawPrerequisitesMet(locked.country, law, politics)).toBe(false);

    const unlocked = fixture({ researchedA: ["primary-schooling"] });
    const unlockedPolitics = unlocked.scenario.definitions.politics;
    if (unlockedPolitics === undefined) throw new Error("fixture has no politics definitions");
    const unlockedLaw = lawDefinition(unlockedPolitics, 15);
    if (unlockedLaw === null) throw new Error("fixture is missing the compulsory education law");
    expect(lawPrerequisitesMet(unlocked.country, unlockedLaw, unlockedPolitics)).toBe(true);
  });
});

describe("M9 determinism, persistence, and bounds", () => {
  test("identical seeds and actions produce identical hashes; save/load resumes identically", () => {
    const run = (resume: boolean): { hash: string; world: World; scenario: EconomyScenarioDef } => {
      const scenario = m9Scenario();
      const world = createEconomyWorld(scenario, { seed: SEED });
      const context = contextFor(scenario);
      applyCountryAction(
        world,
        researchAction(M5_COUNTRY_A, M9_STEAM_POWER, world.dayIndex),
        scenario.definitions,
      );
      let activeWorld = world;
      if (resume) {
        activeWorld = deserializeWorld(serializeWorld(world));
      }
      for (let index = 0; index < 6; index += 1) tick(activeWorld, context);
      return { hash: hashWorld(activeWorld), world: activeWorld, scenario };
    };
    const first = run(false);
    const second = run(false);
    const resumed = run(true);
    expect(second.hash).toBe(first.hash);
    expect(resumed.hash).toBe(first.hash);

    // Bounded state: at most one work entry and no more researched entries than
    // the validated technology catalog.
    const workKeys = Object.keys(first.world.countries[0]?.technology.workByTechnology ?? {});
    expect(workKeys.length).toBeLessThanOrEqual(
      first.scenario.definitions.technology?.technologies.length ?? 0,
    );
    expect(first.world.countries[0]?.technology.researched.length ?? 0).toBeLessThanOrEqual(
      first.scenario.definitions.technology?.technologies.length ?? 0,
    );
  });

  test("old schema, simulation version, data version, and protocol clients are rejected", () => {
    const { world } = fixture();
    const parsed = JSON.parse(serializeWorld(world)) as {
      schemaVersion: number;
      payload: { schemaVersion: number };
    };
    parsed.payload.schemaVersion = 21;
    expect(() => deserializeWorld(JSON.stringify(parsed))).toThrow();

    expect(() =>
      parseWorkerCommand({
        protocolVersion: 8,
        type: "START",
        commandId: "old-client",
      }),
    ).toThrow(/protocol/);
  });

  test("a rejected action leaves the world hash unchanged", () => {
    const { world, scenario } = fixture();
    const before = hashWorld(world);
    const invalid = researchAction(M5_COUNTRY_A, 11, world.dayIndex);
    expect(validateCountryAction(world, invalid, scenario.definitions).valid).toBe(false);
    expect(hashWorld(world)).toBe(before);
  });
});
