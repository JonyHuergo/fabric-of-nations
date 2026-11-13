/**
 * Stable digest of the complete authoritative world.
 *
 * The digest is a 64-bit value built from two FNV-1a lanes over canonical JSON
 * of the encoded world. It is used by determinism tests and diagnostics, not for
 * security. It intentionally includes diagnostics and all population/finance
 * state: an otherwise identical world with different authoritative state is not
 * bit-identical.
 *
 * D-155: the digest is taken over the encoded world as it is. The former M14 view,
 * which translated the unit vocabulary back to its pre-M14 spelling before hashing to
 * keep older digests stable, was removed with the other legacy aliases, so every digest
 * pinned before D-155 changed once. The canonical text is hashed as it is produced and
 * never built as one string.
 */

import { dualFnv1a32HexOfCanonical } from "./hash.js";
import { encodeWorld } from "./serialization.js";
import type { World } from "./world.js";

/** Return a stable 16-hex-character digest of the complete authoritative world. */
export function hashWorld(world: World): string {
  return dualFnv1a32HexOfCanonical(encodeWorld(world));
}
