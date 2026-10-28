/**
 * Exact annual single-year ageing.
 *
 * At each annual pass every person ages exactly one year. Cohorts are shifted
 * oldest-to-youngest so people moved into age a+1 cannot be moved again in the
 * same pass. Age 79 enters the open-ended 80+ slot; the 80+ slot itself remains.
 * The youngest slot is emptied here and receives newborn counts later in the day.
 *
 * M9 also ages the authoritative single-year literacy values with the people:
 * a cohort carries its literacy into the next age, age 79 blends into the existing
 * 80+ literacy by population weight, and the emptied youngest slot becomes zero
 * (newborns enter with zero literacy). The derived adult aggregate is then
 * recomputed (D-077).
 */

import type { World } from "../world.js";
import { SINGLE_AGE_COUNT, TERMINAL_AGE_INDEX } from "./constants.js";
import { populationTotal, syncBlockLiteracy } from "./state.js";

/** Apply exactly one annual single-year ageing pass. */
export function applyAnnualAgeing(world: World): void {
  for (const block of world.popBlocks) {
    const before = populationTotal(block);
    const male = block.maleByAge;
    const female = block.femaleByAge;
    const literacy = block.literacyByAge;
    if (literacy.length !== SINGLE_AGE_COUNT) {
      throw new RangeError(
        `popBlock ${String(block.id)} literacyByAge must have length ${String(SINGLE_AGE_COUNT)}`,
      );
    }

    for (let age = TERMINAL_AGE_INDEX - 1; age >= 0; age -= 1) {
      const destination = age + 1;
      if (destination >= SINGLE_AGE_COUNT) {
        throw new RangeError("ageing destination exceeds the single-age array");
      }
      const movedMale = male[age] ?? 0;
      const movedFemale = female[age] ?? 0;
      const destinationMale = male[destination] ?? 0;
      const destinationFemale = female[destination] ?? 0;
      if (destination === TERMINAL_AGE_INDEX) {
        // The 80+ slot is open-ended: blend the incoming cohort's literacy with
        // the surviving 80+ population by population weight.
        const incoming = movedMale + movedFemale;
        const existing = destinationMale + destinationFemale;
        const total = incoming + existing;
        const incomingLiteracy = literacy[age] ?? 0;
        const existingLiteracy = literacy[destination] ?? 0;
        literacy[destination] =
          total > 0
            ? (incomingLiteracy * incoming + existingLiteracy * existing) / total
            : 0;
      } else {
        // The destination was emptied by the previous (older) step.
        literacy[destination] = literacy[age] ?? 0;
      }
      literacy[age] = 0;
      male[destination] = destinationMale + movedMale;
      female[destination] = destinationFemale + movedFemale;
      male[age] = 0;
      female[age] = 0;
    }

    const after = populationTotal(block);
    if (after !== before) {
      throw new RangeError(
        `population conservation failed during ageing for popBlock ${String(block.id)}: ${String(before)} -> ${String(after)}`,
      );
    }
    syncBlockLiteracy(block);
  }
}
