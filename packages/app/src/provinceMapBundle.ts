/**
 * Combined M12a Europe + M12b Asia + M12c Africa + M12d Americas + M12e Oceania
 * province map bundle.
 *
 * The five generated bundles stay separate build artifacts (each has its own
 * deterministic build and audit), but the renderer and the province panel must
 * see one catalogue with unique ids, one merged border list and one future-polity
 * registry. This module is that single loader. It performs the merge once at
 * module load; no component duplicates the merge logic.
 */

import { PROVINCES_1900 } from "./generated/provinces1900";
import { PROVINCES_AFRICA_1900 } from "./generated/provincesAfrica1900";
import { PROVINCES_AMERICAS_1900 } from "./generated/provincesAmericas1900";
import { PROVINCES_ASIA_1900 } from "./generated/provincesAsia1900";
import { PROVINCES_OCEANIA_1900 } from "./generated/provincesOceania1900";
import type {
  ProvinceFuturePolity,
  ProvinceMapData,
  ProvinceMapProvince,
  ProvinceMapSource,
} from "./provinceCatalogTypes";

function mergeProvinceMaps(...bundles: readonly ProvinceMapData[]): ProvinceMapData {
  const ids = new Set<number>();
  const keys = new Set<string>();
  const provinces: ProvinceMapProvince[] = [];
  for (const province of bundles.flatMap((bundle) => bundle.provinces)) {
    if (ids.has(province.id)) throw new Error(`duplicate province id ${String(province.id)}`);
    if (keys.has(province.key)) throw new Error(`duplicate province key ${province.key}`);
    ids.add(province.id);
    keys.add(province.key);
    provinces.push(province);
  }
  const polityIds = new Set<number>();
  const futurePolities: ProvinceFuturePolity[] = [];
  for (const polity of bundles.flatMap((bundle) => bundle.futurePolities)) {
    if (polityIds.has(polity.polityId)) {
      throw new Error(`duplicate future polity id ${String(polity.polityId)}`);
    }
    polityIds.add(polity.polityId);
    futurePolities.push(polity);
  }
  const sourceIds = new Set<string>();
  const sources: ProvinceMapSource[] = bundles
    .flatMap((bundle) => bundle.sources)
    .filter((source) => {
      if (sourceIds.has(source.id)) return false;
      sourceIds.add(source.id);
      return true;
    });
  const ownerTags = new Set(provinces.map((province) => province.initialOwnerTag));
  return {
    meta: {
      dataset: bundles.map((bundle) => bundle.meta.dataset).join("; "),
      topologyLicense: bundles[0]?.meta.topologyLicense ?? "Public domain",
      projection: bundles[0]?.meta.projection ?? "natural-earth-2",
      quantization: bundles[0]?.meta.quantization ?? "0.001 degrees, delta encoded",
      simplificationToleranceDegrees:
        bundles[0]?.meta.simplificationToleranceDegrees ?? 0.02,
      generatedBy: "packages/app/src/provinceMapBundle.ts",
      referenceDate: "1900-01-01",
      mapDataset: bundles[0]?.meta.mapDataset ?? "",
      mapBoundaryVersion: bundles[0]?.meta.mapBoundaryVersion ?? "",
      provinceCount: provinces.length,
      polityCount: ownerTags.size,
      borderPairCount: bundles.reduce((sum, bundle) => sum + bundle.meta.borderPairCount, 0),
      notes:
        "Combined M12a European, M12b Asian, M12c African, M12d American and M12e Oceanian province catalogue for the 1900 map. Province ids and geometry are permanent; ownership is mutable simulation state.",
    },
    sources,
    futurePolities,
    provinces,
    borders: bundles.flatMap((bundle) => bundle.borders),
  };
}

/** The single combined province catalogue used by the map and province panel. */
export const PROVINCE_MAP_1900: ProvinceMapData = mergeProvinceMaps(
  PROVINCES_1900,
  PROVINCES_ASIA_1900,
  PROVINCES_AFRICA_1900,
  PROVINCES_AMERICAS_1900,
  PROVINCES_OCEANIA_1900,
);
