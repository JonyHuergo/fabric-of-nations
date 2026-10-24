import { selectDeathBands } from "../../sim/src/population/deathAllocationSelection.js";

const BAND_COUNT = 34;

interface SelectionScenario {
  readonly name: string;
  readonly totalDeaths: number;
  readonly leftover: number;
  readonly allocation: readonly number[];
  readonly counts: readonly number[];
  readonly remainders: readonly number[];
}

interface SelectionResult {
  readonly allocation: number[];
  readonly remainders: number[];
  readonly error: string | null;
}

/**
 * Literal reference implementation of the pre-P2a selection loop: repeatedly
 * scan all bands, choose the highest remainder with a strict `>` comparison,
 * skip full cells, and set the selected remainder to -1.
 */
function referenceSelect(scenario: SelectionScenario): SelectionResult {
  const allocation = Uint32Array.from(scenario.allocation);
  const counts = Uint32Array.from(scenario.counts);
  const remainders = Float64Array.from(scenario.remainders);
  let leftover = scenario.leftover;
  while (leftover > 0) {
    let selected = -1;
    let best = -1;
    for (let band = 0; band < BAND_COUNT; band += 1) {
      const remainder = remainders[band] ?? -1;
      if (remainder < 0) continue;
      const capacity = counts[band] ?? 0;
      if ((allocation[band] ?? 0) < capacity && remainder > best) {
        best = remainder;
        selected = band;
      }
    }
    if (selected < 0) {
      return {
        allocation: Array.from(allocation),
        remainders: Array.from(remainders),
        error: `cannot allocate ${String(scenario.totalDeaths)} deaths within age-sex populations for popBlock 7`,
      };
    }
    allocation[selected] = (allocation[selected] ?? 0) + 1;
    remainders[selected] = -1;
    leftover -= 1;
  }
  return {
    allocation: Array.from(allocation),
    remainders: Array.from(remainders),
    error: null,
  };
}

function optimizedSelect(scenario: SelectionScenario): SelectionResult {
  const allocation = Uint32Array.from(scenario.allocation);
  const counts = Uint32Array.from(scenario.counts);
  const remainders = Float64Array.from(scenario.remainders);
  const order = new Uint8Array(BAND_COUNT);
  try {
    selectDeathBands(
      scenario.totalDeaths,
      scenario.leftover,
      7,
      BAND_COUNT,
      allocation,
      counts,
      remainders,
      order,
    );
  } catch (error) {
    return {
      allocation: Array.from(allocation),
      remainders: Array.from(remainders),
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    allocation: Array.from(allocation),
    remainders: Array.from(remainders),
    error: null,
  };
}

function arrays(value: number, length = BAND_COUNT): number[] {
  return new Array<number>(length).fill(value);
}

function scenario(
  name: string,
  options: Partial<Omit<SelectionScenario, "name">> = {},
): SelectionScenario {
  return {
    name,
    totalDeaths: 30,
    leftover: 3,
    allocation: arrays(0),
    counts: arrays(10),
    remainders: arrays(0),
    ...options,
  };
}

const scenarios: SelectionScenario[] = [
  scenario("all zero remainders select by ascending band index", {
    leftover: 5,
    remainders: arrays(0),
  }),
  scenario("descending remainders select highest first", {
    leftover: 3,
    remainders: Array.from({ length: BAND_COUNT }, (_, band) => (BAND_COUNT - band) / 100),
  }),
  scenario("equal remainders skip a full lower-index band", {
    leftover: 3,
    allocation: [5, 0, 0, 0, ...arrays(0, BAND_COUNT - 4)],
    counts: [5, 10, 10, 10, ...arrays(10, BAND_COUNT - 4)],
    remainders: arrays(0.5),
  }),
  scenario("zero-count cells are not candidates", {
    leftover: 2,
    counts: [0, 0, 10, 10, ...arrays(10, BAND_COUNT - 4)],
    remainders: [0.9, 0.8, 0.7, 0.6, ...arrays(0, BAND_COUNT - 4)],
  }),
  scenario("capacity boundary is checked before selection", {
    leftover: 2,
    allocation: [1, 2, 0, ...arrays(0, BAND_COUNT - 3)],
    counts: [2, 2, 3, ...arrays(10, BAND_COUNT - 3)],
    remainders: [0.9, 0.8, 0.7, ...arrays(0, BAND_COUNT - 3)],
  }),
  scenario("small positive remainders outrank zero remainders", {
    leftover: 2,
    remainders: [1e-12, 0, 5e-13, 0, ...arrays(0, BAND_COUNT - 4)],
  }),
  scenario("many leftover selections preserve heap extraction order", {
    leftover: 25,
    remainders: Array.from({ length: BAND_COUNT }, (_, band) => ((band * 7) % 11) / 100),
  }),
  scenario("insufficient eligible capacity throws", {
    leftover: 3,
    counts: [1, 1, ...arrays(0, BAND_COUNT - 2)],
    remainders: [0.5, 0.5, ...arrays(0, BAND_COUNT - 2)],
  }),
  scenario("zero leftover leaves selection untouched", {
    leftover: 0,
    remainders: arrays(0),
  }),
  scenario("all cells full throws", {
    leftover: 1,
    allocation: arrays(1),
    counts: arrays(1),
    remainders: arrays(0.5),
  }),
];

function compareScenario(item: SelectionScenario): void {
  const optimized = optimizedSelect(item);
  const reference = referenceSelect(item);
  if (reference.error !== null || optimized.error !== null) {
    expect({ name: item.name, error: optimized.error }).toEqual({
      name: item.name,
      error: reference.error,
    });
    expect({ name: item.name, allocation: optimized.allocation }).toEqual({
      name: item.name,
      allocation: reference.allocation,
    });
    expect({ name: item.name, remainders: optimized.remainders }).toEqual({
      name: item.name,
      remainders: reference.remainders,
    });
    return;
  }
  expect({ name: item.name, allocation: optimized.allocation }).toEqual({
    name: item.name,
    allocation: reference.allocation,
  });
  expect({ name: item.name, remainders: optimized.remainders }).toEqual({
    name: item.name,
    remainders: reference.remainders,
  });
}

describe("P2a death-allocation remainder selection", () => {
  test("matches the reference algorithm across edge cases", () => {
    for (const item of scenarios) compareScenario(item);
  });

  test("preserves the documented tie and capacity behavior explicitly", () => {
    const ties = optimizedSelect(scenarios[0]!);
    expect(ties.allocation.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(ties.remainders.slice(0, 5)).toEqual([-1, -1, -1, -1, -1]);

    const fullBand = optimizedSelect(scenarios[2]!);
    expect(fullBand.allocation.slice(0, 4)).toEqual([5, 1, 1, 1]);
    expect(fullBand.remainders.slice(0, 4)).toEqual([0.5, -1, -1, -1]);

    const capacity = optimizedSelect(scenarios[4]!);
    expect(capacity.allocation.slice(0, 4)).toEqual([2, 2, 1, 0]);

    const zeroCount = optimizedSelect(scenarios[3]!);
    expect(zeroCount.allocation.slice(0, 4)).toEqual([0, 0, 1, 1]);

    const small = optimizedSelect(scenarios[5]!);
    expect(small.allocation.slice(0, 4)).toEqual([1, 0, 1, 0]);
  });

  test("matches the reference on deterministic pseudo-random cases", () => {
    let state = 0x1234_5678;
    const next = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    for (let caseIndex = 0; caseIndex < 25; caseIndex += 1) {
      const allocation = new Array<number>(BAND_COUNT);
      const counts = new Array<number>(BAND_COUNT);
      const remainders = new Array<number>(BAND_COUNT);
      for (let band = 0; band < BAND_COUNT; band += 1) {
        const capacity = Math.floor(next() * 6);
        counts[band] = capacity;
        allocation[band] = Math.floor(next() * (capacity + 1));
        remainders[band] = next();
      }
      const item = scenario(`random ${String(caseIndex)}`, {
        totalDeaths: 1 + Math.floor(next() * 40),
        leftover: Math.floor(next() * 8),
        allocation,
        counts,
        remainders,
      });
      compareScenario(item);
    }
  });
});
