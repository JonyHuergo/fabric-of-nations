/**
 * M11d runtime-contract regression.
 *
 * The app only accepts a `NEW_GAME_RESULT` whose snapshot passes the versioned
 * protocol validator. The M11 per-country test created and validated worlds but
 * never round-tripped them through that app-facing contract, so a person-count
 * bound of 100,000,000 silently rejected the United Kingdom's valid 107.8M
 * construction labour pool and made a UK campaign impossible to start.
 */

import { loadM11World } from "@century/data";
import { PROTOCOL_VERSION, parseWorkerEvent } from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import type { WorkerEvent } from "@century/sim-worker";

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
