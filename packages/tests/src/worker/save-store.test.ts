import {
  WORLD_SCHEMA_VERSION,
  createEconomyWorld,
  serializeWorld,
  tick,
} from "@century/sim";
import { loadM5Sample } from "../fixtures/smallWorlds.js";
import {
  SaveStore,
  canonicalSaveOf,
  compressSaveForStorage,
  readSaveMetadata,
  saveDateLabel,
  type SaveStorageBackend,
} from "@century/sim-worker/persistence";

const SEED = 20_261_023;
const SCHEMA = WORLD_SCHEMA_VERSION;

class MemoryBackend implements SaveStorageBackend {
  public readonly values = new Map<string, string>();
  public failSetForKey: string | null = null;

  public async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async setItem(key: string, value: string): Promise<void> {
    if (this.failSetForKey === key) {
      this.failSetForKey = null;
      throw new Error(`injected write failure for ${key}`);
    }
    this.values.set(key, value);
  }

  public async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function makeSave(): string {
  const scenario = loadM5Sample();
  const context = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  const world = createEconomyWorld(scenario, { seed: SEED });
  tick(world, context);
  return serializeWorld(world);
}

const KEYS = { primary: "test.save", previous: "test.save.previous", staging: "test.save.staging" } as const;

describe("replace-safe save storage", () => {
  test("metadata reports the campaign date and size without loading a world", () => {
    const save = makeSave();
    const metadata = readSaveMetadata(save);
    expect(metadata.schemaVersion).toBe(SCHEMA);
    expect(metadata.dateLabel).toBe("1900-01-02");
    expect(metadata.scenarioId).toBe("m5-eight-polities");
    expect(saveDateLabel(0)).toBe("1900-01-01");
    expect(saveDateLabel(36_524)).toBe("2000-01-01");
    expect(() => saveDateLabel(36_525)).toThrow();
  });

  test("stores, verifies, and loads the canonical save", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA, keys: KEYS });
    const save = makeSave();
    const info = await store.store(save);
    expect(info.saveBytes).toBe(save.length);
    expect(info.metadata.dateLabel).toBe("1900-01-02");
    const loaded = await store.load();
    expect(loaded?.source).toBe("primary");
    expect(canonicalSaveOf(loaded?.save ?? "")).toBe(save);
    expect(loaded?.metadata.checksum).toBe(info.metadata.checksum);
  });

  test("a failed primary write preserves the last valid save", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA, keys: KEYS });
    const first = makeSave();
    await store.store(first);

    backend.failSetForKey = KEYS.primary;
    await expect(store.store(first.replace('"dayIndex":1', '"dayIndex":2'))).rejects.toThrow(
      /injected write failure/,
    );
    const loaded = await store.load();
    expect(canonicalSaveOf(loaded?.save ?? "")).toBe(first);
    expect(loaded?.source).toBe("primary");
  });

  test("a corrupt primary falls back to the previous valid save", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA, keys: KEYS });
    const first = makeSave();
    const second = serializeWorld(
      (() => {
        const scenario = loadM5Sample();
        const context = {
          population: { definitions: scenario.population.definitions },
          economy: { definitions: scenario.definitions },
        };
        const world = createEconomyWorld(scenario, { seed: SEED });
        tick(world, context);
        tick(world, context);
        return world;
      })(),
    );
    backend.values.set(KEYS.primary, compressSaveForStorage(first));
    backend.values.set(KEYS.previous, compressSaveForStorage(second));
    backend.values.set(KEYS.primary, "fon-save-deflate2:not-valid-base64");
    const loaded = await store.load();
    expect(loaded?.source).toBe("previous");
    expect(canonicalSaveOf(loaded?.save ?? "")).toBe(second);
  });

  test("recovers a fully written staging replacement after an interrupted swap", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA, keys: KEYS });
    const save = makeSave();
    backend.values.set(KEYS.primary, "fon-save-deflate2:broken");
    backend.values.set(KEYS.staging, compressSaveForStorage(save));
    const loaded = await store.load();
    expect(loaded?.source).toBe("staging");
    expect(canonicalSaveOf(loaded?.save ?? "")).toBe(save);
  });

  test("rejects incompatible and unreadable saves without inventing a campaign", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA, keys: KEYS });
    const save = makeSave();
    const parsed = JSON.parse(save) as { schemaVersion: number };
    parsed.schemaVersion = 15;
    backend.values.set(KEYS.primary, compressSaveForStorage(JSON.stringify(parsed)));
    await expect(store.load()).rejects.toThrow(/schema 15/);

    backend.values.set(KEYS.primary, "fon-save-deflate2:truncated");
    await expect(store.load()).rejects.toThrow(/readable saved game/i);
  });
});
