import { SimulationHost } from "@century/sim-worker/host";
import {
  PROTOCOL_VERSION,
  previewEducationFunding,
  previewResearchStaffShare,
  previewResearchStart,
  type SimulationSnapshot,
  type WorkerEvent,
  previewHealthPolicy,
  previewTrainingPolicy,
  parseWorkerEvent,
} from "@century/sim-worker";
import { M9_EDUCATION_FUNDING, M9_STEAM_POWER, m9Scenario } from "../fixtures/m9.js";
import { M5_COUNTRY_A } from "../fixtures/m5.js";
import { e5Scenario } from "../fixtures/e5.js";
import { loadM11World } from "@century/data";

function hostFixture(): {
  readonly host: SimulationHost;
  readonly events: WorkerEvent[];
  readonly snapshot: () => SimulationSnapshot;
} {
  const events: WorkerEvent[] = [];
  const host = new SimulationHost({
    scenario: m9Scenario(),
    seed: 20_261_030,
    emit: (event) => events.push(event),
    autoPump: false,
  });
  const snapshot = (): SimulationSnapshot => {
    const latest = [...events].reverse().find(
      (event) =>
        event.type === "READY" ||
        event.type === "SNAPSHOT" ||
        (event.type === "ACTION_RESULT" && event.accepted),
    );
    if (latest === undefined) throw new Error("host emitted no snapshot");
    if (latest.type === "READY" || latest.type === "SNAPSHOT") return latest.snapshot;
    if (latest.type === "ACTION_RESULT") return latest.snapshot;
    throw new Error("host emitted no snapshot");
  };
  return { host, events, snapshot };
}

function apply(
  host: SimulationHost,
  events: WorkerEvent[],
  actionId: string,
  action: Record<string, unknown>,
): WorkerEvent | undefined {
  host.handleCommand({
    protocolVersion: PROTOCOL_VERSION,
    type: "APPLY_ACTION",
    commandId: `cmd-${actionId}`,
    actionId,
    action,
  });
  return [...events].reverse().find(
    (event) => event.type === "ACTION_RESULT" && event.actionId === actionId,
  );
}

describe("M9 worker protocol and snapshots", () => {
  test("exposes immutable technology and education sections with previews", () => {
    const { snapshot } = hostFixture();
    const snap = snapshot();
    const country = snap.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("snapshot has no country A");
    expect(country.technology.enabled).toBe(true);
    expect(snap.technologyCatalog.length).toBeGreaterThanOrEqual(120);
    expect(country.technology.statuses.length).toBeGreaterThanOrEqual(120);
    expect(country.technology.researchedCount).toBe(0);
    expect(country.technology.activeProjectTechnologyId).toBeNull();
    expect(country.technology.mortalityFactor).toBe(1);
    expect(country.technology.productivityBySector.length).toBe(5);
    expect(country.education.enabled).toBe(true);
    expect(country.education.academicPopulation).toBeGreaterThan(0);
    expect(country.education.fundedAnnualRUSD).toBe(M9_EDUCATION_FUNDING);
    expect(country.education.availableAcademicWorkers).toBeGreaterThan(0);

    const research = previewResearchStart(snap, country, M9_STEAM_POWER);
    expect(research.valid).toBe(true);
    expect(research.technologyKey).toBe("steam-power");
    expect(research.remainingWork).toBeGreaterThan(0);

    const funding = previewEducationFunding(snap, country, 1_000);
    expect(funding.valid).toBe(true);
    const share = previewResearchStaffShare(snap, country, 0.25);
    expect(share.valid).toBe(true);
    expect(share.teacherStaff).toBeGreaterThan(0);

    const educationLaw = country.politics.lawOptions.find(
      (option) => option.slot === "education" && option.key === "education-compulsory-primary",
    );
    expect(educationLaw).toBeDefined();
    expect(educationLaw?.technologyPrerequisitesMet).toBe(false);
    expect(educationLaw?.prerequisitesMet).toBe(false);
  });

  test("accepts valid M9 actions and rejects invalid ones without mutating state", () => {
    const { host, events, snapshot } = hostFixture();

    const start = apply(host, events, "start", {
      kind: "start-research",
      countryId: M5_COUNTRY_A,
      technologyId: M9_STEAM_POWER,
    });
    expect(start?.type).toBe("ACTION_RESULT");
    if (start?.type !== "ACTION_RESULT") throw new Error("no start result");
    expect(start.accepted).toBe(true);
    expect(snapshot().countries[0]?.technology.activeProjectTechnologyId).toBe(
      M9_STEAM_POWER,
    );

    const second = apply(host, events, "second", {
      kind: "start-research",
      countryId: M5_COUNTRY_A,
      technologyId: 4,
    });
    if (second?.type !== "ACTION_RESULT") throw new Error("no second result");
    expect(second.accepted).toBe(false);
    expect(second.errors.length).toBeGreaterThan(0);
    expect(snapshot().countries[0]?.technology.activeProjectTechnologyId).toBe(
      M9_STEAM_POWER,
    );

    const invalidId = apply(host, events, "invalid-id", {
      kind: "start-research",
      countryId: M5_COUNTRY_A,
      technologyId: 9999,
    });
    if (invalidId?.type !== "ACTION_RESULT") throw new Error("no invalid-id result");
    expect(invalidId.accepted).toBe(false);

    const funding = apply(host, events, "funding", {
      kind: "set-education-funding",
      countryId: M5_COUNTRY_A,
      annualRUSD: 9_000,
    });
    if (funding?.type !== "ACTION_RESULT") throw new Error("no funding result");
    expect(funding.accepted).toBe(true);
    expect(snapshot().countries[0]?.education.fundedAnnualRUSD).toBe(9_000);

    const share = apply(host, events, "share", {
      kind: "set-research-staff-share",
      countryId: M5_COUNTRY_A,
      share: 0.25,
    });
    if (share?.type !== "ACTION_RESULT") throw new Error("no share result");
    expect(share.accepted).toBe(true);
    expect(snapshot().countries[0]?.education.researchStaffShare).toBe(0.25);

    const cancel = apply(host, events, "cancel", {
      kind: "cancel-research",
      countryId: M5_COUNTRY_A,
    });
    if (cancel?.type !== "ACTION_RESULT") throw new Error("no cancel result");
    expect(cancel.accepted).toBe(true);
    expect(snapshot().countries[0]?.technology.activeProjectTechnologyId).toBeNull();
  });

  test("rejects unsupported protocol clients and malformed action values", () => {
    const { host, events } = hostFixture();
    host.handleCommand({
      protocolVersion: 8,
      type: "REQUEST_SNAPSHOT",
      commandId: "old",
    });
    const error = events.find((event) => event.type === "ERROR");
    expect(error?.type).toBe("ERROR");

    const negative = apply(host, events, "negative", {
      kind: "set-education-funding",
      countryId: M5_COUNTRY_A,
      annualRUSD: -1,
    });
    // The protocol rejects the value before it reaches the simulation.
    expect(negative).toBeUndefined();
    expect(events.some((event) => event.type === "ERROR")).toBe(true);

    const badShare = apply(host, events, "bad-share", {
      kind: "set-research-staff-share",
      countryId: M5_COUNTRY_A,
      share: 2,
    });
    expect(badShare).toBeUndefined();
    expect(events.filter((event) => event.type === "ERROR").length).toBeGreaterThanOrEqual(2);
  });
});

function e5HostFixture(): {
  readonly host: SimulationHost;
  readonly events: WorkerEvent[];
  readonly latest: () => SimulationSnapshot;
} {
  const events: WorkerEvent[] = [];
  const host = new SimulationHost({
    scenario: e5Scenario(),
    seed: 20_261_102,
    emit: (event) => events.push(event),
    autoPump: false,
  });
  const latest = (): SimulationSnapshot => {
    const event = [...events].reverse().find(
      (entry) => entry.type === "READY" || entry.type === "SNAPSHOT",
    );
    if (event === undefined || (event.type !== "READY" && event.type !== "SNAPSHOT")) {
      throw new Error("no snapshot event");
    }
    return event.snapshot;
  };
  return { host, events, latest };
}

describe("E5 worker protocol and snapshot", () => {
  test("exposes training, qualification, and health state with estimates", () => {
    const { host, events, latest } = e5HostFixture();
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "STEP",
      commandId: "step-1",
      ticks: 1,
    });
    const snapshot = latest();
    const country = snapshot.countries.find((entry) => entry.id === M5_COUNTRY_A);
    if (country === undefined) throw new Error("snapshot has no country A");
    expect(country.labor.trainingBudgetRUSDPerYear).toBeGreaterThan(0);
    expect(country.labor.trainingInstructors).toBeGreaterThan(0);
    expect(country.labor.eligibleWorkingAge).toBeGreaterThan(0);
    expect(country.labor.trainingParticipation).toBeGreaterThan(0);
    expect(country.labor.trainees).toBeGreaterThan(0);
    expect(country.labor.healthStaff).toBeGreaterThan(0);
    expect(country.labor.healthServiceOutputIndex).toBeGreaterThan(0);
    expect(country.labor.healthMortalityFactor).toBeLessThan(1);
    expect(country.labor.qualificationAverage).toBeGreaterThanOrEqual(0);
    expect(Object.isFrozen(country.labor)).toBe(true);

    const training = previewTrainingPolicy(snapshot, country, {
      trainingBudgetRUSDPerYear: 500_000,
      trainingStipendPerTraineeRUSDPerYear: 2,
      trainingStaffShare: 0.3,
    });
    expect(training.valid).toBe(true);
    expect(training.instructors).toBeGreaterThan(0);
    expect(training.annualCostRUSD).toBeGreaterThan(0);
    const health = previewHealthPolicy(snapshot, country, 0.3);
    expect(health.valid).toBe(true);
    expect(health.healthStaff).toBeGreaterThan(0);
    expect(events.some((event) => event.type === "SNAPSHOT")).toBe(true);
  });

  test("validated training/health actions update the snapshot", () => {
    const { host, events } = e5HostFixture();
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "cmd-training-share",
      actionId: "training-share",
      action: {
        kind: "set-training-staff-share",
        countryId: M5_COUNTRY_A,
        share: 0.4,
      },
    });
    const trainingResult = [...events].reverse().find(
      (event) => event.type === "ACTION_RESULT" && event.actionId === "training-share",
    );
    if (trainingResult === undefined || trainingResult.type !== "ACTION_RESULT") {
      throw new Error("no training action result");
    }
    expect(trainingResult.accepted).toBe(true);
    expect(
      trainingResult.snapshot.countries.find((entry) => entry.id === M5_COUNTRY_A)?.labor
        .trainingStaffShare,
    ).toBe(0.4);

    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "cmd-health-share",
      actionId: "health-share",
      action: {
        kind: "set-health-staff-share",
        countryId: M5_COUNTRY_A,
        share: 0.35,
      },
    });
    const healthResult = [...events].reverse().find(
      (event) => event.type === "ACTION_RESULT" && event.actionId === "health-share",
    );
    if (healthResult === undefined || healthResult.type !== "ACTION_RESULT") {
      throw new Error("no health action result");
    }
    expect(healthResult.accepted).toBe(true);
    expect(
      healthResult.snapshot.countries.find((entry) => entry.id === M5_COUNTRY_A)?.labor
        .healthStaffShare,
    ).toBe(0.35);
  });

  test("an out-of-range share is rejected by the protocol", () => {
    const { host, events } = e5HostFixture();
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "APPLY_ACTION",
      commandId: "cmd-health-invalid",
      actionId: "health-invalid",
      action: {
        kind: "set-health-staff-share",
        countryId: M5_COUNTRY_A,
        share: 1.5,
      },
    });
    const error = [...events].reverse().find(
      (event) => event.type === "ERROR" && event.code === "invalid_action",
    );
    expect(error).toBeDefined();
  });
});

/**
 * M11d runtime-contract regression.
 *
 * The app only accepts a `NEW_GAME_RESULT` whose snapshot passes the versioned
 * protocol validator. The M11 per-country test created and validated worlds but
 * never round-tripped them through that app-facing contract, so a person-count
 * bound of 100,000,000 silently rejected the United Kingdom's valid 107.8M
 * construction labour pool and made a UK campaign impossible to start.
 */
const SEED = 20_261_023;

function newGameResult(playerCountryId: number): Extract<WorkerEvent, { type: "NEW_GAME_RESULT" }> {
  const scenario = loadM11World();
  const events: WorkerEvent[] = [];
  const host = new SimulationHost({
    scenario: { ...scenario, playerCountryId },
    seed: SEED,
    emit: (event) => events.push(event),
    autoPump: false,
  });
  host.handleCommand({
    protocolVersion: PROTOCOL_VERSION,
    type: "CREATE_GAME",
    commandId: `m11d-${String(playerCountryId)}`,
    playerCountryId,
  });
  const result = events.find((event) => event.type === "NEW_GAME_RESULT");
  if (result?.type !== "NEW_GAME_RESULT") throw new Error("no NEW_GAME_RESULT");
  return result;
}

describe("M11d app snapshot contract", () => {
  test("every selectable country produces an app-valid campaign snapshot", () => {
    const scenario = loadM11World();
    const selectable = (scenario.countryMeta ?? []).filter((meta) => meta.selectable);
    expect(selectable.length).toBe(66);
    const failures: string[] = [];
    for (const meta of selectable) {
      const result = newGameResult(meta.countryId);
      expect(result.accepted).toBe(true);
      try {
        parseWorkerEvent(result);
      } catch (error) {
        failures.push(`${String(meta.countryId)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("the largest 1900 labour pool is accepted by the snapshot bound", () => {
    const scenario = loadM11World();
    const unitedKingdomCountry = (scenario.countries ?? []).find((country) => country.tag === "GBR");
    if (unitedKingdomCountry === undefined) throw new Error("GBR is missing from the scenario");
    const unitedKingdom = (scenario.countryMeta ?? []).find(
      (meta) => meta.countryId === unitedKingdomCountry.id,
    );
    if (unitedKingdom === undefined) throw new Error("GBR metadata is missing");
    const result = newGameResult(unitedKingdom.countryId);
    const country = result.snapshot.countries.find((entry) => entry.id === unitedKingdom.countryId);
    expect(country).toBeDefined();
    // Documented regression: this pool exceeded the old 100M protocol bound.
    expect(country?.constructionLabor.idleWorkers).toBeGreaterThan(100_000_000);
    expect(() => parseWorkerEvent(result)).not.toThrow();
  });
});
