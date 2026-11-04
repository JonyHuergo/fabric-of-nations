/**
 * D-139: the worker's first CREATE_GAME reuses the startup world.
 *
 * The host builds `createEconomyWorld(baseScenario, seed)` at startup for the menus.
 * While that world is untouched, a new campaign only sets `playerCountryId` on it
 * instead of rebuilding and revalidating the 1900 world. The campaign must be the
 * world a fresh construction with the player would give, and any tick, action or
 * load must end the reuse.
 */

import { loadM11World } from "@century/data";
import { createEconomyWorld, hashWorld, type World } from "@century/sim";
import { PROTOCOL_VERSION, type WorkerEvent } from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";

const SEED = 20_261_023;
const scenario = loadM11World();

function command(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { protocolVersion: PROTOCOL_VERSION, type, commandId: `${type}-test`, ...extra };
}

function hostWorld(host: SimulationHost): World {
  return (host as unknown as { world: World }).world;
}

function newHost(events: WorkerEvent[]): SimulationHost {
  return new SimulationHost({ scenario, seed: SEED, autoPump: false, emit: (event) => events.push(event) });
}

describe("D-139 new-game reuse of the startup world", () => {
  const playerCountryId = scenario.countries?.[0]?.id ?? 0;
  const expected = hashWorld(createEconomyWorld({ ...scenario, playerCountryId }, { seed: SEED }));

  test("the first campaign equals a fresh construction with the player", () => {
    const events: WorkerEvent[] = [];
    const host = newHost(events);
    host.handleCommand(command("CREATE_GAME", { playerCountryId }));
    const result = events.find((event) => event.type === "NEW_GAME_RESULT");
    expect(result).toMatchObject({ accepted: true });
    expect(hostWorld(host).playerCountryId).toBe(playerCountryId);
    expect(hashWorld(hostWorld(host))).toBe(expected);
  }, 120_000);

  test("a campaign after the startup world advanced is built afresh", () => {
    const events: WorkerEvent[] = [];
    const host = newHost(events);
    host.handleCommand(command("STEP", { ticks: 1 }));
    expect(hostWorld(host).dayIndex).toBe(1);
    host.handleCommand(command("CREATE_GAME", { playerCountryId }));
    expect(hostWorld(host).dayIndex).toBe(0);
    expect(hashWorld(hostWorld(host))).toBe(expected);
  }, 120_000);

  test("a second campaign is built afresh", () => {
    const events: WorkerEvent[] = [];
    const host = newHost(events);
    host.handleCommand(command("CREATE_GAME", { playerCountryId }));
    host.handleCommand(command("STEP", { ticks: 1 }));
    host.handleCommand(command("CREATE_GAME", { playerCountryId }));
    expect(hostWorld(host).dayIndex).toBe(0);
    expect(hashWorld(hostWorld(host))).toBe(expected);
  }, 120_000);
});
