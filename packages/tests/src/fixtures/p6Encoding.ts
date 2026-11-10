/**
 * P6 (D-153) re-pin evidence: a world without a demand system encodes exactly as before
 * P6 except for three version strings — schema 34 (was 33), simulation 0.30.0 (was
 * 0.29.0) and data m3-economy-v14 (was v13). The P6 fields are written only by worlds
 * that have them (serialization `worldHasDemandState`). Restoring the three strings must
 * reproduce the pre-P6 digest; a world carrying P6 state is rejected here.
 */
import { encodeWorld, hashEncodedWorld, type World } from "@century/sim";

const PRE_P6_SCHEMA = 33;
const PRE_P6_SIM_VERSION = "0.29.0";
const PRE_P6_DATA_VERSION = "m3-economy-v13";

/** The digest a legacy world would have had under schema 33 (P5b). */
export function prePhase6Digest(world: World): string {
  const encoded = encodeWorld(world) as unknown as Record<string, unknown>;
  const blocks = encoded.popBlocks as Record<string, unknown>[] | undefined;
  if (blocks?.some((block) => "dwellings" in block) === true) throw new Error("prePhase6Digest: the world carries P6 state");
  return hashEncodedWorld({
    ...encoded,
    schemaVersion: PRE_P6_SCHEMA,
    simVersion: PRE_P6_SIM_VERSION,
    // P7 (D-154): data m3-economy-v15 restores to v13 as well (no P7 field in a legacy world).
    dataVersion: encoded.dataVersion === "m3-economy-v14" || encoded.dataVersion === "m3-economy-v15" ? PRE_P6_DATA_VERSION : encoded.dataVersion,
  });
}
