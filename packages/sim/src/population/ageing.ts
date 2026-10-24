/**
 * Exact integer annual cohort ageing.
 *
 * Each cohort carries a remainder in fifths of a person (0..4). At each annual
 * pass, `units = cohort + carry` fifths represent the cohort's one-fifth transfer
 * budget; `floor(units / 5)` people move and `units % 5` remains. Processing from
 * oldest to youngest ensures people moved into a cohort are not moved again in
 * the same pass.
 */

import type { World } from "../world.js";
import { AGE_COHORT_COUNT, AGE_TRANSFER_DENOMINATOR } from "./constants.js";
import { populationTotal } from "./state.js";

/** Apply exactly one annual cohort-ageing pass. */
export function applyAnnualAgeing(world: World): void {
  for (const block of world.popBlocks) {
    const cohorts = block.ageCohorts;
    const carry = block.agingCarry;
    const before = populationTotal(block);

    for (let index = AGE_COHORT_COUNT - 2; index >= 0; index -= 1) {
      const count = cohorts[index];
      const previousCarry = carry[index];
      if (count === undefined || previousCarry === undefined) {
        throw new RangeError(`popBlock ${String(block.id)} cohort ${String(index)} is missing`);
      }
      if (previousCarry > AGE_TRANSFER_DENOMINATOR - 1) {
        throw new RangeError(
          `popBlock ${String(block.id)} agingCarry[${String(index)}] is outside 0..4`,
        );
      }
      const units = count + previousCarry;
      const moved = Math.floor(units / AGE_TRANSFER_DENOMINATOR);
      const nextCarry = units % AGE_TRANSFER_DENOMINATOR;
      const destination = (cohorts[index + 1] ?? 0) + moved;
      if (destination > 0xffff_ffff) {
        throw new RangeError(
          `popBlock ${String(block.id)} cohort ${String(index + 1)} exceeds Uint32 range during ageing`,
        );
      }
      cohorts[index] = count - moved;
      carry[index] = nextCarry;
      cohorts[index + 1] = destination;
    }

    const after = populationTotal(block);
    if (after !== before) {
      throw new RangeError(
        `population conservation failed during ageing for popBlock ${String(block.id)}: ${String(before)} -> ${String(after)}`,
      );
    }
  }
}
