import { SimulationHost } from "@century/sim-worker/host";
import {
  PROTOCOL_VERSION,
  previewHealthPolicy,
  previewTrainingPolicy,
  type SimulationSnapshot,
  type WorkerEvent,
} from "@century/sim-worker";

import { M5_COUNTRY_A } from "../fixtures/m5.js";
import { e5Scenario } from "../fixtures/e5.js";

function hostFixture(): {
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
    const { host, events, latest } = hostFixture();
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
    const { host, events } = hostFixture();
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
    const { host, events } = hostFixture();
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
