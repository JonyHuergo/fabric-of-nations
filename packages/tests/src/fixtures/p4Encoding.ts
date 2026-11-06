/**
 * P4 (D-142) re-pin evidence: the encoding of a world without the P4 fields
 * (block demography and `World.demography`) under the previous schema number.
 * For a world whose behaviour P4 does not change, this reproduces the pre-P4 digest.
 */
import { encodeWorld, hashEncodedWorld, type World } from "@century/sim";
import { withoutPhase5 } from "./p5Encoding.js";
import { withoutPhase5b } from "./p5bEncoding.js";

export const P4_BLOCK_FIELDS = [
  "urbanShare",
  "fertilityResidual",
  "childMortalityResidual",
  "adultMortalityResidual",
  "childMortalityLagged",
  "foodSufficiency",
] as const;

export function prePhase4Digest(world: World): string {
  const encoded = encodeWorld(world) as unknown as Record<string, unknown> & {
    popBlocks: Record<string, unknown>[];
  };
  const view: Record<string, unknown> = { ...withoutPhase5(withoutPhase5b(encoded)), schemaVersion: 30 };
  delete view.demography;
  view.popBlocks = encoded.popBlocks.map((block) => {
    const copy = { ...block };
    for (const field of P4_BLOCK_FIELDS) delete copy[field];
    return copy;
  });
  return hashEncodedWorld(view);
}
