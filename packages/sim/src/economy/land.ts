/**
 * P5 (D-143) land shares and the land factor (a leaf module: no simulation imports beyond
 * types and constants), shared by production, agriculture and the P7 hiring rule.
 */

import type { Id } from "../types.js";
import type { World } from "../world.js";
import { FARM_LAND_ELASTICITY, FARM_REFERENCE_HECTARES_PER_LEVEL } from "./constants.js";
import type { BuildingDef, LandUse } from "./types.js";

/** Hectares of one land kind in a province record. */
export function provinceLandHa(
  province: { readonly arableLandHa: number; readonly pastureHa: number },
  use: LandUse,
): number {
  return use === "cropland" ? province.arableLandHa : province.pastureHa;
}

/**
 * Hectares per building level by province and land kind: the province's land of the
 * kind divided by the summed levels of its operational buildings of that kind.
 * Provinces without such buildings are absent. Key: `provinceId * 2 + kind`.
 */
export function landPerLevelByProvince(
  world: World,
  definitionById: ReadonlyMap<Id, BuildingDef>,
): Map<number, number> {
  const levels = new Map<number, number>();
  for (const building of world.buildings) {
    if (!building.operational) continue;
    const use = definitionById.get(building.definitionId)?.landUse;
    if (use === undefined) continue;
    const key = landKey(building.provinceId, use);
    levels.set(key, (levels.get(key) ?? 0) + building.level);
  }
  const result = new Map<number, number>();
  if (levels.size === 0) return result;
  const provinceById = new Map(world.provinceEconomies.map((province) => [province.id, province]));
  for (const [key, level] of levels) {
    const provinceId = Math.floor(key / 2);
    const use: LandUse = key % 2 === 0 ? "cropland" : "pasture";
    const province = provinceById.get(provinceId);
    const land = province === undefined ? 0 : provinceLandHa(province, use);
    result.set(key, level > 0 ? land / level : 0);
  }
  return result;
}

/** Key of a (province, land kind) pair in `landPerLevelByProvince`. */
export function landKey(provinceId: Id, use: LandUse): number {
  return provinceId * 2 + (use === "cropland" ? 0 : 1);
}

/** Land factor of a building with `hectaresPerLevel`: (h / reference)^landElasticity. */
export function farmLandFactor(hectaresPerLevel: number): number {
  if (!(hectaresPerLevel > 0)) return 0;
  return (hectaresPerLevel / FARM_REFERENCE_HECTARES_PER_LEVEL) ** FARM_LAND_ELASTICITY;
}
