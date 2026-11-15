/**
 * D-161: the day's reusable typed buffers (`DayScratch`) and the D-160 journal-batch
 * scratch. A scratch never holds authoritative state and is never read for values: views are
 * filled before they are handed out, so the world after a day is the same with a fresh, a
 * reused or a poisoned scratch, or with none.
 */

import {
  buildFinanceIndex,
  createDayScratch,
  createJournalLines,
  hashWorld,
  listAccounts,
  postJournalColumns,
  pushJournalLine,
  scratchCopyF64,
  scratchF64,
  scratchI32,
  scratchU8,
  tick,
  tickPhaseMode,
  type DayScratch,
  type FinancialAccount,
  type JournalColumnEntry,
  type World,
} from "@century/sim";
import { m3World } from "../fixtures/m3a.js";
import { economyTickContext } from "../fixtures/m3e.js";

/** Write garbage into every buffer of the scratch (what a careless reader would see). */
function poison(scratch: DayScratch): void {
  for (const buffer of scratch.f64.values()) buffer.fill(Number.NaN);
  for (const buffer of scratch.i32.values()) buffer.fill(-123_456);
  for (const buffer of scratch.u8.values()) buffer.fill(77);
}

describe("D-161 day scratch", () => {
  test("views are filled, exact-length, reuse one buffer and grow without shrinking", () => {
    const scratch = createDayScratch();
    const first = scratchF64(scratch, "a", 10);
    first.fill(5);
    const second = scratchF64(scratch, "a", 4);
    expect(second.length).toBe(4);
    expect(Array.from(second)).toEqual([0, 0, 0, 0]);
    expect(second.buffer).toBe(first.buffer);
    const grown = scratchF64(scratch, "a", 1000);
    expect(grown.length).toBe(1000);
    expect(grown.every((value) => value === 0)).toBe(true);
    const capacity = scratch.f64.get("a")?.length ?? 0;
    expect(capacity).toBeGreaterThanOrEqual(1000);
    scratchF64(scratch, "a", 3);
    expect(scratch.f64.get("a")?.length).toBe(capacity);

    const ints = scratchI32(scratch, "b", 6, -1);
    expect(Array.from(ints)).toEqual([-1, -1, -1, -1, -1, -1]);
    const bytes = scratchU8(scratch, "c", 3);
    bytes.fill(9);
    expect(Array.from(scratchU8(scratch, "c", 3))).toEqual([0, 0, 0]);
    const source = Float64Array.from([1.5, -2, 3]);
    const copy = scratchCopyF64(scratch, "a", source);
    expect(Array.from(copy)).toEqual([1.5, -2, 3]);
    expect(copy.buffer).not.toBe(source.buffer);
    // Distinct slots never share storage.
    expect(scratchF64(scratch, "d", 4).buffer).not.toBe(scratchF64(scratch, "a", 4).buffer);
  });

  test("without a scratch every request is a fresh array", () => {
    const a = scratchF64(undefined, "a", 3, 2);
    const b = scratchF64(undefined, "a", 3, 2);
    expect(a.buffer).not.toBe(b.buffer);
    expect(Array.from(a)).toEqual([2, 2, 2]);
    expect(scratchI32(undefined, "x", 0).length).toBe(0);
    expect(() => scratchF64(createDayScratch(), "a", -1)).toThrow(/invalid length/);
    expect(() => scratchU8(createDayScratch(), "a", 1.5)).toThrow(/invalid length/);
  });

  test("days are identical with no scratch, a shared scratch and a poisoned shared scratch", () => {
    const days = 6;
    const run = (mode: "none" | "shared" | "poisoned", phase: boolean): string[] => {
      const { scenario, world } = m3World();
      const scratch = createDayScratch();
      const context = { ...economyTickContext(scenario), ...(mode === "none" ? {} : { scratch }) };
      const hashes: string[] = [];
      for (let day = 0; day < days; day += 1) {
        if (mode === "poisoned") poison(scratch);
        if (phase) tickPhaseMode(world, context);
        else tick(world, context);
        hashes.push(hashWorld(world));
      }
      if (mode !== "none") expect(scratch.heldBytes).toBeGreaterThan(0);
      return hashes;
    };
    for (const phase of [false, true]) {
      const reference = run("none", phase);
      expect(run("shared", phase)).toEqual(reference);
      expect(run("poisoned", phase)).toEqual(reference);
    }
  });
});

describe("D-160 journal batch scratch generations", () => {
  function account(world: World, ownerKind: FinancialAccount["ownerKind"], ownerId: number, subtype: FinancialAccount["subtype"]): number {
    const found = listAccounts(world.finance.accounts).find(
      (candidate) => candidate.ownerKind === ownerKind && candidate.ownerId === ownerId && candidate.subtype === subtype,
    );
    if (found === undefined) throw new Error(`missing ${subtype} account`);
    return found.id;
  }

  /** A wage batch large enough (4,400 lines) to take the typed batch scratch. */
  function postWageBatch(world: World, amount: number): void {
    const building = world.buildings[0];
    const block = world.popBlocks[0];
    if (building === undefined || block === undefined) throw new Error("fixture needs a building and a block");
    const cash = account(world, "popBlock", block.id, "household-cash");
    const income = account(world, "popBlock", block.id, "wage-income");
    const expense = account(world, "building", building.id, "wage-expense");
    const operating = account(world, "building", building.id, "operating-cash");
    const lines = createJournalLines(16);
    const entries: JournalColumnEntry[] = [];
    for (let entry = 0; entry < 1_100; entry += 1) {
      const start = lines.count;
      const value = amount * (1 + (entry % 7));
      pushJournalLine(lines, cash, 1, value);
      pushJournalLine(lines, expense, 1, value);
      pushJournalLine(lines, operating, 0, value);
      pushJournalLine(lines, income, 0, value);
      entries.push({ transactionKind: "wages", start, end: lines.count, sourceEntityId: building.id, targetEntityId: null });
    }
    postJournalColumns(world.finance, world.dayIndex, entries, lines);
  }

  test("batches across the 2^32 − 1 wrap-around post exactly as batches far from it", () => {
    const amounts = [1e-4, 3e-5, 7e-5, 2e-5];
    const reference = m3World().world;
    for (const amount of amounts) postWageBatch(reference, amount);

    const wrapped = m3World().world;
    const scratch = buildFinanceIndex(wrapped.finance).batchScratch();
    // The next batch takes generation 0xffff_fffe; the one after it wraps (stamps cleared,
    // generation 1). Before the wrapping batch, every position carries a stale stamp equal to
    // the post-wrap generation with a garbage delta (what a batch of generation 1 long ago
    // would have left): read as that batch's own if the wrap did not clear the stamps.
    scratch.generation = 0xffff_fffd;
    const seen: number[] = [];
    for (const [index, amount] of amounts.entries()) {
      if (index === 1) {
        scratch.stamp.fill(1);
        scratch.delta.fill(1e9);
      }
      postWageBatch(wrapped, amount);
      seen.push(buildFinanceIndex(wrapped.finance).batchScratch().generation);
    }
    expect(seen).toEqual([0xffff_fffe, 1, 2, 3]);
    expect(Array.from(wrapped.finance.accounts.balance.subarray(0, wrapped.finance.accounts.count))).toEqual(
      Array.from(reference.finance.accounts.balance.subarray(0, reference.finance.accounts.count)),
    );
    expect(wrapped.finance.nextPostingId).toBe(reference.finance.nextPostingId);
    expect(hashWorld(wrapped)).toBe(hashWorld(reference));
  });
});
