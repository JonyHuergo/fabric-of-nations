/**
 * Iteration-order helpers for authoritative arrays.
 *
 * The simulation keeps `world.popBlocks`, `world.buildings` and `world.countries`
 * in ascending id order: construction appends only higher ids and no phase
 * reorders or removes an entity (P2 province transfers move an existing block's
 * province, not the block array). Phases that must state their order explicitly
 * still check it, so a caller that hands in an unsorted fixture gets the same
 * sorted order as before, without copying and sorting on every day.
 */

/** The items in ascending id order; the same array when it already is. */
export function inIdOrder<T extends { readonly id: number }>(
  items: readonly T[],
): readonly T[] {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (previous !== undefined && current !== undefined && previous.id > current.id) {
      const sorted = [...items];
      sorted.sort((left, right) => left.id - right.id);
      return sorted;
    }
  }
  return items;
}
