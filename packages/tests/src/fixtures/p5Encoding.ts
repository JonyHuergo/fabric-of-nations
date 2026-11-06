/**
 * P5 (D-143) re-pin evidence: the encoding of a world without the P5 fields
 * (`World.resources` and the monthly `countryClosingBalances`) under the previous schema
 * number. For a world whose behaviour P5 does not change (no farms with land use, no
 * own-consumption owner, no closed month), this reproduces the pre-P5 digest.
 */
import { encodeWorld, hashEncodedWorld, type World } from "@century/sim";
import { withoutPhase5b } from "./p5bEncoding.js";

/** A copy of an encoded world with the P5 fields removed (schema left as is). */
export function withoutPhase5<T extends Record<string, unknown>>(encoded: T): T {
  const view: Record<string, unknown> = { ...encoded };
  delete view.resources;
  const finance = view.finance as { periodSummaries?: Record<string, unknown>[] } | undefined;
  if (finance?.periodSummaries !== undefined) {
    view.finance = {
      ...finance,
      periodSummaries: finance.periodSummaries.map((summary) => {
        const copy = { ...summary };
        delete copy.countryClosingBalances;
        return copy;
      }),
    };
  }
  return view as T;
}

export function prePhase5Digest(world: World): string {
  // P5b (D-146): the P5b fields are removed first, so the pre-P5 digest is unchanged.
  const encoded = withoutPhase5b(encodeWorld(world) as unknown as Record<string, unknown>);
  return hashEncodedWorld({ ...withoutPhase5(encoded), schemaVersion: 31 });
}
