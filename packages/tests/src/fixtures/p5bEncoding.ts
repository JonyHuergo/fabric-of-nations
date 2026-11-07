/**
 * P5b (D-146) re-pin evidence: the encoding of a world without the P5b fields
 * (`BuildingInstance.depositId`, `ProvinceEconomy.absLatitudeDeg` and the three new
 * industrial-policy sectors) under the previous schema number. For a world whose
 * behaviour P5b does not change (no extraction building, no non-storable good, no
 * optional or maintenance input, no gated need item, every new sector rate 0), this
 * reproduces the pre-P5b digest.
 */
import { encodeWorld, hashEncodedWorld, type World } from "@century/sim";

/** The number of E4 sectors before P5b added mining, energy and services. */
const PRE_P5B_SECTOR_COUNT = 5;
/** The simulation version before P5b (encoded in every world). */
const PRE_P5B_SIM_VERSION = "0.28.0";
/** The content version before P5b (encoded in every world; D-148 bumped it to v13). */
const PRE_P5B_DATA_VERSION = "m3-economy-v12";

/** A copy of an encoded world with the P5b fields removed (schema left as is). */
export function withoutPhase5b<T extends Record<string, unknown>>(encoded: T): T {
  const view: Record<string, unknown> = { ...encoded };
  if (typeof view.simVersion === "string") view.simVersion = PRE_P5B_SIM_VERSION;
  if (typeof view.dataVersion === "string") view.dataVersion = PRE_P5B_DATA_VERSION;
  if (Array.isArray(view.buildings)) {
    view.buildings = (view.buildings as Record<string, unknown>[]).map((building) => {
      const copy = { ...building };
      if (copy.depositId !== null) throw new Error("withoutPhase5b: a building works a deposit");
      delete copy.depositId;
      return copy;
    });
  }
  if (Array.isArray(view.provinceEconomies)) {
    view.provinceEconomies = (view.provinceEconomies as Record<string, unknown>[]).map((province) => {
      const copy = { ...province };
      delete copy.absLatitudeDeg;
      return copy;
    });
  }
  if (Array.isArray(view.countries)) {
    view.countries = (view.countries as Record<string, unknown>[]).map((country) => {
      const industrial = country.industrial as { sectorSubsidyRates: number[] } | undefined;
      if (industrial === undefined) return country;
      const extra = industrial.sectorSubsidyRates.slice(PRE_P5B_SECTOR_COUNT);
      if (extra.some((rate) => rate !== 0)) throw new Error("withoutPhase5b: a new sector has a subsidy");
      return {
        ...country,
        industrial: { ...industrial, sectorSubsidyRates: industrial.sectorSubsidyRates.slice(0, PRE_P5B_SECTOR_COUNT) },
      };
    });
  }
  return view as T;
}

/** The digest a world would have had under schema 32 (P5a). */
export function prePhase5bDigest(world: World): string {
  const encoded = encodeWorld(world) as unknown as Record<string, unknown>;
  return hashEncodedWorld({ ...withoutPhase5b(encoded), schemaVersion: 32 });
}
