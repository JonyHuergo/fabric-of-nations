/**
 * The saved-game library behind Load Game: one replace-safe slot per campaign,
 * an index listing them by recency, adoption of the single save that predates
 * it, and deletion that cannot leave a listed slot without its save.
 */

import { WORLD_SCHEMA_VERSION, createEconomyWorld, serializeWorld, tick } from "@century/sim";
import { loadM5EightPolities } from "@century/data";
import {
  SaveLibrary,
  SaveStore,
  compressSaveForStorage,
  type SaveStorageBackend,
  type SaveSlot,
} from "@century/sim-worker/persistence";

import { saveEra, saveProblem } from "../../app/src/screens/saveDisplay.js";

const SEED = 20_261_102;
const LEGACY = "century.m7.save.v1";
const INDEX = "fon.saves.index.v1";

class MemoryBackend implements SaveStorageBackend {
  public readonly values = new Map<string, string>();
  public failWritesTo: string | null = null;

  public async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async setItem(key: string, value: string): Promise<void> {
    if (key === this.failWritesTo) throw new Error(`write to ${key} failed`);
    this.values.set(key, value);
  }

  public async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const scenario = loadM5EightPolities();

/** Canonical saves of one world after 0, 1 and 2 days. */
function saves(): readonly string[] {
  const world = createEconomyWorld(scenario, { seed: SEED });
  const context = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
  const out = [serializeWorld(world)];
  for (let day = 0; day < 2; day += 1) {
    tick(world, context);
    out.push(serializeWorld(world));
  }
  return out;
}

const [day0, day1, day2] = saves() as [string, string, string];

function library(backend: MemoryBackend): SaveLibrary {
  return new SaveLibrary(backend, { expectedSchemaVersion: WORLD_SCHEMA_VERSION });
}

describe("save library", () => {
  test("an empty device has no saved games and writes nothing", async () => {
    const backend = new MemoryBackend();
    expect(await library(backend).list()).toEqual([]);
    expect(backend.values.size).toBe(0);
  });

  test("each campaign has its own slot, listed most recent first", async () => {
    const backend = new MemoryBackend();
    const saved = library(backend);
    const first = await saved.create(day0, { playerCountryId: 3, savedAtMs: 1_000 });
    const second = await saved.create(day1, { playerCountryId: 5, savedAtMs: 2_000 });
    expect(first.slot.id).not.toBe(second.slot.id);
    expect((await saved.list()).map((slot) => slot.id)).toEqual([second.slot.id, first.slot.id]);

    // Saving the older campaign again brings it to the top, in its own slot.
    const again = await saved.store(first.slot.id, day2, { playerCountryId: null, savedAtMs: 3_000 });
    const listed = await saved.list();
    expect(listed.map((slot) => slot.id)).toEqual([first.slot.id, second.slot.id]);
    expect(listed[0]).toEqual(again.slot);
    expect(again.slot.playerCountryId).toBe(3);
    expect(again.slot.metadata?.dayIndex).toBe(2);
    expect((await saved.load(first.slot.id))?.save).toBe(day2);
    expect((await saved.load(second.slot.id))?.save).toBe(day1);
  });

  test("a slot keeps its previous save as a recovery copy", async () => {
    const backend = new MemoryBackend();
    const saved = library(backend);
    const { slot } = await saved.create(day0, { playerCountryId: 1, savedAtMs: null });
    await saved.store(slot.id, day1, { playerCountryId: 1, savedAtMs: null });
    backend.values.set(slot.key, "corrupt");
    const recovered = await saved.load(slot.id);
    expect(recovered?.source).toBe("previous");
    expect(recovered?.save).toBe(day0);
  });

  test("a failed slot write leaves the listed save and the index as they were", async () => {
    const backend = new MemoryBackend();
    const saved = library(backend);
    const { slot } = await saved.create(day0, { playerCountryId: 1, savedAtMs: null });
    const before = backend.values.get(INDEX);
    backend.failWritesTo = slot.key;
    await expect(saved.store(slot.id, day1, { playerCountryId: 1, savedAtMs: null })).rejects.toThrow();
    backend.failWritesTo = null;
    expect(backend.values.get(INDEX)).toBe(before);
    expect((await saved.load(slot.id))?.save).toBe(day0);
  });

  test("deleting a slot removes it and its recovery copies, and nothing else", async () => {
    const backend = new MemoryBackend();
    const saved = library(backend);
    const kept = await saved.create(day0, { playerCountryId: 1, savedAtMs: null });
    const gone = await saved.create(day1, { playerCountryId: 2, savedAtMs: null });
    await saved.store(gone.slot.id, day2, { playerCountryId: 2, savedAtMs: null });
    await saved.remove(gone.slot.id);
    expect((await saved.list()).map((slot) => slot.id)).toEqual([kept.slot.id]);
    expect([...backend.values.keys()].filter((key) => key.startsWith(gone.slot.key))).toEqual([]);
    expect(await saved.load(gone.slot.id)).toBeNull();
    expect((await saved.load(kept.slot.id))?.save).toBe(day0);
  });

  test("an unlisting that fails deletes nothing", async () => {
    const backend = new MemoryBackend();
    const saved = library(backend);
    const { slot } = await saved.create(day0, { playerCountryId: 1, savedAtMs: null });
    backend.failWritesTo = INDEX;
    await expect(saved.remove(slot.id)).rejects.toThrow();
    backend.failWritesTo = null;
    expect((await saved.load(slot.id))?.save).toBe(day0);
  });

  test("concurrent saves are serialized and never share a slot", async () => {
    const backend = new MemoryBackend();
    const saved = library(backend);
    const results = await Promise.all([
      saved.create(day0, { playerCountryId: 1, savedAtMs: null }),
      saved.create(day1, { playerCountryId: 2, savedAtMs: null }),
      saved.create(day2, { playerCountryId: 3, savedAtMs: null }),
    ]);
    expect(new Set(results.map((result) => result.slot.id)).size).toBe(3);
    expect((await saved.list()).map((slot) => slot.playerCountryId)).toEqual([3, 2, 1]);
  });

  test("the single save from before the library is adopted in place", async () => {
    const backend = new MemoryBackend();
    await new SaveStore(backend, { expectedSchemaVersion: WORLD_SCHEMA_VERSION }).store(day1);
    const saved = library(backend);
    const [adopted] = await saved.list();
    expect(adopted?.key).toBe(LEGACY);
    expect(adopted?.playerCountryId).toBeNull();
    expect(adopted?.metadata?.dayIndex).toBe(1);
    expect((await saved.load(adopted?.id ?? ""))?.save).toBe(day1);

    // Its nation is recorded once known; a new campaign gets a new slot beside it.
    expect((await saved.annotate(adopted?.id ?? "", 7))?.playerCountryId).toBe(7);
    expect((await saved.annotate(adopted?.id ?? "", 9))?.playerCountryId).toBe(7);
    const next = await saved.create(day0, { playerCountryId: 2, savedAtMs: null });
    expect((await saved.list()).map((slot) => slot.id)).toEqual([next.slot.id, adopted?.id]);
    expect((await saved.load(adopted?.id ?? ""))?.save).toBe(day1);
  });

  test("an adopted save this build cannot read is listed, refuses to load, and can be deleted", async () => {
    const backend = new MemoryBackend();
    const parsed = JSON.parse(day0) as { schemaVersion: number };
    parsed.schemaVersion = WORLD_SCHEMA_VERSION - 1;
    backend.values.set(LEGACY, compressSaveForStorage(JSON.stringify(parsed)));
    const saved = library(backend);
    const [adopted] = await saved.list();
    expect(adopted?.metadata?.schemaVersion).toBe(WORLD_SCHEMA_VERSION - 1);
    await expect(saved.load(adopted?.id ?? "")).rejects.toThrow(/schema/u);
    await saved.remove(adopted?.id ?? "");
    expect(await saved.list()).toEqual([]);
    expect(backend.values.get(LEGACY)).toBeUndefined();
  });

  test("a damaged index is reported, not silently emptied", async () => {
    for (const raw of [
      "not json",
      JSON.stringify({ version: 2, nextSlot: 1, nextOrder: 1, slots: [] }),
      JSON.stringify({ version: 1, nextSlot: 1, nextOrder: 1, slots: [{ id: "a" }] }),
      JSON.stringify({
        version: 1,
        nextSlot: 3,
        nextOrder: 1,
        slots: [
          { id: "a", key: "k", order: 5, savedAtMs: null, playerCountryId: null, metadata: null, storedBytes: 1 },
        ],
      }),
    ]) {
      const backend = new MemoryBackend();
      backend.values.set(INDEX, raw);
      await expect(library(backend).list()).rejects.toThrow(/index/u);
    }
  });

  test("clearing removes every slot, the index and the old single save", async () => {
    const backend = new MemoryBackend();
    await new SaveStore(backend, { expectedSchemaVersion: WORLD_SCHEMA_VERSION }).store(day0);
    const saved = library(backend);
    await saved.create(day1, { playerCountryId: 1, savedAtMs: null });
    await saved.clear();
    expect(backend.values.size).toBe(0);
    expect(await saved.list()).toEqual([]);
  });

  test("a save is shown in the era of its date, before its world is read", () => {
    const slot = (dateLabel: string | null, schemaVersion = WORLD_SCHEMA_VERSION): SaveSlot => ({
      id: "c1",
      key: "k",
      order: 0,
      savedAtMs: null,
      playerCountryId: null,
      storedBytes: 1,
      metadata:
        dateLabel === null
          ? null
          : {
              formatVersion: 1,
              schemaVersion,
              simVersion: "x",
              dataVersion: "x",
              scenarioId: "x",
              dayIndex: 0,
              dateLabel,
              seed: 1,
              checksum: "x",
            },
    });
    expect(saveEra(slot("1900-01-01"))?.id).toBe("imperial");
    expect(saveEra(slot("1923-03-14"))?.id).toBe("machine-age");
    expect(saveEra(slot("1962-10-16"))?.id).toBe("cold-war");
    expect(saveEra(slot("1999-12-31"))?.id).toBe("digital");
    expect(saveEra(slot(null))).toBeNull();
    expect(saveProblem(slot("1900-01-01"))).toBeNull();
    expect(saveProblem(slot("1900-01-01", WORLD_SCHEMA_VERSION - 1))).toMatch(/version/u);
    expect(saveProblem(slot(null))).toMatch(/could not be read/u);
  });
});
