/**
 * P7 (D-154) re-pin evidence: a world without a labour market encodes exactly as before
 * P7 except for the version strings — schema 35 (was 34), simulation 0.31.0 (was 0.30.0)
 * and, from P7 step 3, data m3-economy-v15 (was v14). The labour-market state is written
 * only by worlds that have it (serialization `labourMarket`). Restoring the strings must
 * reproduce the pre-P7 digest; a world carrying P7 state is rejected here.
 */
import { encodeWorld, hashEncodedWorld, type World } from "@century/sim";

const PRE_P7_SCHEMA = 34;
const PRE_P7_SIM_VERSION = "0.30.0";
const PRE_P7_DATA_VERSION = "m3-economy-v14";

/** The digest a legacy world would have had under schema 34 (P6). */
export function prePhase7Digest(world: World): string {
  const encoded = encodeWorld(world) as unknown as Record<string, unknown>;
  if ("labourMarket" in encoded) throw new Error("prePhase7Digest: the world carries P7 state");
  return hashEncodedWorld({
    ...encoded,
    schemaVersion: PRE_P7_SCHEMA,
    simVersion: PRE_P7_SIM_VERSION,
    dataVersion: encoded.dataVersion === "m3-economy-v15" ? PRE_P7_DATA_VERSION : encoded.dataVersion,
  });
}
