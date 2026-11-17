/**
 * P7b (D-170): saves of any size over a key/value store with a per-value limit.
 *
 * `ChunkedSaveBackend` cuts long values into chunks under a manifest written last, so an
 * interrupted write leaves the old value readable and a damaged one is an error, never a
 * shorter value. The tests use an in-memory store that can refuse values above a limit,
 * fail on a chosen write, or lose a key, and run the real `SaveLibrary` and `SaveStore` on
 * top of it.
 */
import { createEconomyWorld, serializeWorld } from "@century/sim";
import {
  CHUNK_MANIFEST_PREFIX,
  ChunkedSaveBackend,
  DEFAULT_CHUNK_LENGTH,
  SaveLibrary,
  canonicalSaveOf,
  type ChunkStoreBackend,
} from "@century/sim-worker/persistence";

import { loadM5Sample } from "../fixtures/smallWorlds.js";

const SCHEMA = JSON.parse(serializeWorld(createEconomyWorld(loadM5Sample(), { seed: 7 }))).schemaVersion as number;

/** An in-memory store with a per-value limit, a write counter and injectable failures. */
class TestStore implements ChunkStoreBackend {
  public readonly values = new Map<string, string>();
  public writes = 0;
  public failOnWrite: ((key: string) => boolean) | null = null;

  public constructor(private readonly limit = Number.POSITIVE_INFINITY, batches = true) {
    if (!batches) {
      delete this.getMany;
      delete this.setMany;
      delete this.removeMany;
    }
  }

  public async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async setItem(key: string, value: string): Promise<void> {
    if (this.failOnWrite?.(key) === true) throw new Error(`injected failure writing ${key}`);
    if (value.length > this.limit) throw new Error(`value of ${String(value.length)} characters over the limit`);
    this.writes += 1;
    this.values.set(key, value);
  }

  public async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  public getMany?: (keys: string[]) => Promise<Record<string, string | null>> = async (keys) =>
    Object.fromEntries(keys.map((key) => [key, this.values.get(key) ?? null]));

  public setMany?: (entries: Record<string, string>) => Promise<void> = async (entries) => {
    for (const [key, value] of Object.entries(entries)) await this.setItem(key, value);
  };

  public removeMany?: (keys: string[]) => Promise<void> = async (keys) => {
    for (const key of keys) this.values.delete(key);
  };
}

const chunkKeysOf = (store: TestStore, key: string): string[] => [...store.values.keys()].filter((entry) => entry.startsWith(`${key}#chunk:`)).sort();

function text(length: number, seed: number): string {
  // Deterministic ASCII, like a base64 save.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let state = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    out += alphabet[state >>> 26];
  }
  return out;
}

describe("D-170 chunked save backend", () => {
  test("a value up to one chunk is stored as it is; a longer one as chunks under a manifest", async () => {
    const store = new TestStore(100);
    const backend = new ChunkedSaveBackend(store, { chunkLength: 100 });
    await backend.setItem("small", "x".repeat(100));
    expect(store.values.get("small")).toBe("x".repeat(100));
    const long = text(1_050, 1);
    await backend.setItem("long", long);
    expect(store.values.get("long")?.startsWith(CHUNK_MANIFEST_PREFIX)).toBe(true);
    expect(chunkKeysOf(store, "long")).toHaveLength(11);
    expect(await backend.getItem("long")).toBe(long);
    expect(await backend.getItem("absent")).toBeNull();
    // A short value that looks like a manifest is chunked, so it is never misread.
    const lookalike = `${CHUNK_MANIFEST_PREFIX}{"generation":1}`;
    await backend.setItem("lookalike", lookalike);
    expect(await backend.getItem("lookalike")).toBe(lookalike);
  });

  test("works without batch calls, and the default chunk is 512 Ki characters", async () => {
    expect(DEFAULT_CHUNK_LENGTH).toBe(512 * 1024);
    const store = new TestStore(64, false);
    const backend = new ChunkedSaveBackend(store, { chunkLength: 64 });
    const value = text(1_000, 2);
    await backend.setItem("k", value);
    expect(await backend.getItem("k")).toBe(value);
    await backend.removeItem("k");
    expect([...store.values.keys()]).toEqual([]);
  });

  test("a replacement writes a new generation and removes the old chunks; removal clears all", async () => {
    const store = new TestStore();
    const backend = new ChunkedSaveBackend(store, { chunkLength: 10 });
    await backend.setItem("k", text(95, 3));
    expect(chunkKeysOf(store, "k").every((key) => key.startsWith("k#chunk:1:"))).toBe(true);
    const second = text(31, 4);
    await backend.setItem("k", second);
    expect(chunkKeysOf(store, "k")).toEqual(["k#chunk:2:0", "k#chunk:2:1", "k#chunk:2:2", "k#chunk:2:3"]);
    expect(await backend.getItem("k")).toBe(second);
    await backend.setItem("k", "short");
    expect(chunkKeysOf(store, "k")).toEqual([]);
    expect(await backend.getItem("k")).toBe("short");
    await backend.setItem("k", text(25, 5));
    await backend.removeItem("k");
    expect([...store.values.keys()]).toEqual([]);
  });

  test("an interrupted write leaves the previous value readable", async () => {
    const store = new TestStore();
    const backend = new ChunkedSaveBackend(store, { chunkLength: 10 });
    const first = text(55, 6);
    await backend.setItem("k", first);
    // Fail on the third chunk of the replacement: the manifest still names the first value.
    store.failOnWrite = (key) => key === "k#chunk:2:2";
    await expect(backend.setItem("k", text(80, 7))).rejects.toThrow("injected failure");
    expect(await backend.getItem("k")).toBe(first);
    // Fail on the manifest itself: the same.
    store.failOnWrite = (key) => key === "k";
    await expect(backend.setItem("k", text(80, 8))).rejects.toThrow("injected failure");
    expect(await backend.getItem("k")).toBe(first);
    // The next write succeeds and leaves only its own generation.
    store.failOnWrite = null;
    const third = text(42, 9);
    await backend.setItem("k", third);
    expect(await backend.getItem("k")).toBe(third);
    expect(new Set(chunkKeysOf(store, "k").map((key) => key.split(":")[1]))).toEqual(new Set(["2"]));
  });

  test("a missing chunk, a wrong length or a malformed manifest is an error, never a shorter value", async () => {
    const store = new TestStore();
    const backend = new ChunkedSaveBackend(store, { chunkLength: 10 });
    await backend.setItem("k", text(35, 10));
    store.values.delete("k#chunk:1:2");
    await expect(backend.getItem("k")).rejects.toThrow("missing chunk 2 of 4");
    await backend.setItem("k", text(35, 11));
    store.values.set("k#chunk:2:3", "toolong!!!!");
    await expect(backend.getItem("k")).rejects.toThrow("its manifest says 35");
    store.values.set("k", `${CHUNK_MANIFEST_PREFIX}{"generation":2,"chunks":3,"length":35}`);
    await expect(backend.getItem("k")).rejects.toThrow("malformed chunk manifest");
    store.values.set("k", `${CHUNK_MANIFEST_PREFIX}not json`);
    await expect(backend.getItem("k")).rejects.toThrow("unreadable chunk manifest");
    // A damaged manifest does not block the next write.
    await backend.setItem("k", "fine");
    expect(await backend.getItem("k")).toBe("fine");
  });

  test("the save library stores and loads a save larger than the store's per-value limit", async () => {
    const store = new TestStore(4_096);
    const library = new SaveLibrary(new ChunkedSaveBackend(store, { chunkLength: 4_096 }), { expectedSchemaVersion: SCHEMA });
    const save = serializeWorld(createEconomyWorld(loadM5Sample(), { seed: 7 }));
    // Without chunks the store refuses the compressed save.
    const plain = new SaveLibrary(store, { expectedSchemaVersion: SCHEMA });
    await expect(plain.create(save, { playerCountryId: null, savedAtMs: null })).rejects.toThrow("over the limit");
    store.values.clear();
    const { slot, compressedBytes } = await library.create(save, { playerCountryId: 1, savedAtMs: null });
    expect(compressedBytes).toBeGreaterThan(4_096);
    expect(chunkKeysOf(store, slot.key).length).toBeGreaterThan(1);
    const loaded = await library.load(slot.id);
    expect(canonicalSaveOf(loaded?.save ?? "")).toBe(save);
    expect(loaded?.source).toBe("primary");
    // A second save keeps the first as the recovery copy.
    await library.store(slot.id, save, { playerCountryId: 1, savedAtMs: null });
    expect(store.values.get(`${slot.key}.previous`)?.startsWith(CHUNK_MANIFEST_PREFIX)).toBe(true);
    expect((await library.list()).map((entry) => entry.id)).toEqual([slot.id]);
    await library.remove(slot.id);
    expect([...store.values.keys()].filter((key) => key.startsWith(slot.key))).toEqual([]);
  });

  test("a damaged primary falls back to the recovery copy (SaveStore reads each copy in turn)", async () => {
    const store = new TestStore();
    const library = new SaveLibrary(new ChunkedSaveBackend(store, { chunkLength: 2_048 }), { expectedSchemaVersion: SCHEMA });
    const save = serializeWorld(createEconomyWorld(loadM5Sample(), { seed: 7 }));
    const { slot } = await library.create(save, { playerCountryId: null, savedAtMs: null });
    await library.store(slot.id, save, { playerCountryId: null, savedAtMs: null });
    const primaryChunk = chunkKeysOf(store, slot.key).find((key) => !key.includes(".previous"));
    if (primaryChunk === undefined) throw new Error("fixture: no primary chunk");
    store.values.delete(primaryChunk);
    const loaded = await library.load(slot.id);
    expect(loaded?.source).toBe("previous");
    expect(canonicalSaveOf(loaded?.save ?? "")).toBe(save);
  });
});
