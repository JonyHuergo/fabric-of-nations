/**
 * Stable digest of the complete authoritative M1 world.
 *
 * The digest is a 64-bit value built from two FNV-1a lanes over canonical JSON
 * of the encoded world. It is used by determinism tests and diagnostics, not for
 * security. It intentionally includes diagnostics: an otherwise identical world
 * with a different processed-day ring is not bit-identical state.
 */

import { dualFnv1a32Hex, stableStringify } from "./hash.js";
import { encodeWorld } from "./serialization.js";
import type { World } from "./world.js";

/** Return a stable 16-hex-character digest of the complete authoritative world. */
export function hashWorld(world: World): string {
  return dualFnv1a32Hex(stableStringify(encodeWorld(world)));
}
