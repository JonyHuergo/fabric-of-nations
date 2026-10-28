import { SimulationHost } from "@century/sim-worker/host";
import {
  PROTOCOL_VERSION,
  previewEducationFunding,
  previewResearchStaffShare,
  previewResearchStart,
  type SimulationSnapshot,
  type WorkerEvent,
} from "@century/sim-worker";

import { M9_EDUCATION_FUNDING, M9_STEAM_POWER, m9Scenario } from "./fixtures/m9.js";
import { M5_COUNTRY_A } from "./fixtures/m5.js";

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
    expect(country.education.fundedAnnualSUSD).toBe(M9_EDUCATION_FUNDING);
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
      annualSUSD: 9_000,
    });
    if (funding?.type !== "ACTION_RESULT") throw new Error("no funding result");
    expect(funding.accepted).toBe(true);
    expect(snapshot().countries[0]?.education.fundedAnnualSUSD).toBe(9_000);

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
      annualSUSD: -1,
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
