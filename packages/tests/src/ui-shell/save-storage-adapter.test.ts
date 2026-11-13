/**
 * App save-path regression for AUDIT-002.
 *
 * The app's storage adapter is imported directly. Jest maps the React Native
 * AsyncStorage package to the in-memory fixture in `fixtures/asyncStorageMock`,
 * so this test exercises the real adapter constant, the real SaveStore, and the
 * real worker LOAD validator rather than a separately configured SaveStore.
 */

import {
  WORLD_SCHEMA_VERSION,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  serializeWorld,
} from "@century/sim";
import { loadM5Sample } from "../fixtures/smallWorlds.js";
import {
  PROTOCOL_VERSION,
  type WorkerEvent,
} from "@century/sim-worker";
import { SimulationHost } from "@century/sim-worker/host";
import { canonicalSaveOf, compressSaveForStorage } from "@century/sim-worker/persistence";

import {
  SUPPORTED_SAVE_SCHEMA_VERSION,
  clearSave,
  readSave,
  readStoredCampaign,
  storeSave,
} from "../../../app/src/storage/saveStorage.js";

import {
  resetAsyncStorageMock,
  writeStoredValue,
} from "../fixtures/asyncStorageMock.js";

const SEED = 20_261_107;

describe("app storage adapter save path", () => {
  test("accepts the current schema and round-trips through the worker", async () => {
    resetAsyncStorageMock();
    expect(SUPPORTED_SAVE_SCHEMA_VERSION).toBe(WORLD_SCHEMA_VERSION);

    const scenario = loadM5Sample();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const save = serializeWorld(world);

    const stored = await storeSave(save);
    expect(stored.metadata.schemaVersion).toBe(WORLD_SCHEMA_VERSION);

    // D-137: the adapter returns the stored form, which the worker accepts as is.
    const loaded = await readSave();
    expect(canonicalSaveOf(loaded ?? "")).toBe(save);

    const campaign = await readStoredCampaign();
    expect(campaign?.metadata.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    expect(campaign?.metadata.scenarioId).toBe(world.scenarioId);
    expect(canonicalSaveOf(campaign?.save ?? "")).toBe(save);

    const restored = deserializeWorld(canonicalSaveOf(loaded as string));
    expect(hashWorld(restored)).toBe(hashWorld(world));

    // The worker remains the authoritative validator: a save accepted by the
    // app adapter must also load through the real LOAD command.
    const events: WorkerEvent[] = [];
    const host = new SimulationHost({
      scenario,
      seed: SEED,
      emit: (event) => events.push(event),
      autoPump: false,
    });
    host.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "LOAD",
      commandId: "app-adapter-load",
      save: loaded as string,
    });
    const result = events.find((event) => event.type === "LOAD_RESULT");
    expect(result?.type).toBe("LOAD_RESULT");
    if (result?.type !== "LOAD_RESULT") throw new Error("no load result");
    expect(result.accepted).toBe(true);
    expect(result.snapshot.dayIndex).toBe(world.dayIndex);

    await clearSave();
    expect(await readSave()).toBeNull();
  });

  test("an incompatible stored schema is rejected with an actionable error", async () => {
    resetAsyncStorageMock();
    const scenario = loadM5Sample();
    const world = createEconomyWorld(scenario, { seed: SEED });
    const save = serializeWorld(world);
    const parsed = JSON.parse(save) as { schemaVersion: number };
    const oldSchema = WORLD_SCHEMA_VERSION - 1;
    parsed.schemaVersion = oldSchema;
    // A listed slot whose stored save no longer matches this build's schema.
    const { slot } = await storeSave(save);
    writeStoredValue(slot.key, compressSaveForStorage(JSON.stringify(parsed)));

    await expect(readSave()).rejects.toThrow(new RegExp(`schema ${String(oldSchema)}`));
    await expect(readStoredCampaign()).rejects.toThrow(
      new RegExp(`schema ${String(oldSchema)}`),
    );
  });
});
