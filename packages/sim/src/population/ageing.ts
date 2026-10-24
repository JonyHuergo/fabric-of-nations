/**
 * Exact annual single-year ageing.
 *
 * At each annual pass every person ages exactly one year. Cohorts are shifted
 * oldest-to-youngest so people moved into age a+1 cannot be moved again in the
 * same pass. Age 79 enters the open-ended 80+ slot; the 80+ slot itself remains.
 * The youngest slot is emptied here and receives newborn counts later in the day.
 */

import type { World } from "../world.js";
import { SINGLE_AGE_COUNT, TERMINAL_AGE_INDEX } from "./constants.js";
import { populationTotal } from "./state.js";

/** Apply exactly one annual single-year ageing pass. */
export function applyAnnualAgeing(world: World): void {
  for (const block of world.popBlocks) {
    const before = populationTotal(block);
    const male = block.maleByAge;
    const female = block.femaleByAge;

    for (let age = TERMINAL_AGE_INDEX - 1; age >= 0; age -= 1) {
      const destination = age + 1;
      if (destination >= SINGLE_AGE_COUNT) {
        throw new RangeError("ageing destination exceeds the single-age array");
      }
      male[destination] = (male[destination] ?? 0) + (male[age] ?? 0);
      female[destination] = (female[destination] ?? 0) + (female[age] ?? 0);
      male[age] = 0;
      female[age] = 0;
    }

    const after = populationTotal(block);
    if (after !== before) {
      throw new RangeError(
        `population conservation failed during ageing for popBlock ${String(block.id)}: ${String(before)} -> ${String(after)}`,
      );
    }
  }
}
