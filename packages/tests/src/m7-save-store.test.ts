import {
  WORLD_SCHEMA_VERSION,
  createEconomyWorld,
  serializeWorld,
  tick,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import {
  SaveStore,
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
  const scenario = loadM5EightPolities();
  const context = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  const world = createEconomyWorld(scenario, { seed: SEED });
  tick(world, context);
  return serializeWorld(world);
}

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
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA });
    const save = makeSave();
    const info = await store.store(save);
    expect(info.saveBytes).toBe(save.length);
    expect(info.metadata.dateLabel).toBe("1900-01-02");
    const loaded = await store.load();
    expect(loaded?.source).toBe("primary");
    expect(loaded?.save).toBe(save);
    expect(loaded?.metadata.checksum).toBe(info.metadata.checksum);
  });

  test("a failed primary write preserves the last valid save", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA });
    const first = makeSave();
    await store.store(first);

    backend.failSetForKey = "century.m7.save.v1";
    await expect(store.store(first.replace('"dayIndex":1', '"dayIndex":2'))).rejects.toThrow(
      /injected write failure/,
    );
    const loaded = await store.load();
    expect(loaded?.save).toBe(first);
    expect(loaded?.source).toBe("primary");
  });

  test("a corrupt primary falls back to the previous valid save", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA });
    const first = makeSave();
    const second = serializeWorld(
      (() => {
        const scenario = loadM5EightPolities();
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
    backend.values.set("century.m7.save.v1", compressSaveForStorage(first));
    backend.values.set("century.m7.save.v1.previous", compressSaveForStorage(second));
    backend.values.set("century.m7.save.v1", "century-save-gzip1:not-valid-base64");
    const loaded = await store.load();
    expect(loaded?.source).toBe("previous");
    expect(loaded?.save).toBe(second);
  });

  test("recovers a fully written staging replacement after an interrupted swap", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA });
    const save = makeSave();
    backend.values.set("century.m7.save.v1", "century-save-gzip1:broken");
    backend.values.set("century.m7.save.v1.staging", compressSaveForStorage(save));
    const loaded = await store.load();
    expect(loaded?.source).toBe("staging");
    expect(loaded?.save).toBe(save);
  });

  test("rejects incompatible and unreadable saves without inventing a campaign", async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend, { expectedSchemaVersion: SCHEMA });
    const save = makeSave();
    const parsed = JSON.parse(save) as { schemaVersion: number };
    parsed.schemaVersion = 15;
    backend.values.set("century.m7.save.v1", compressSaveForStorage(JSON.stringify(parsed)));
    await expect(store.load()).rejects.toThrow(/schema 15/);

    backend.values.set("century.m7.save.v1", "century-save-gzip1:truncated");
    await expect(store.load()).rejects.toThrow(/readable saved game/i);
  });
});
