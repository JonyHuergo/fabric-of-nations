import type { ProvinceMapData } from "../provinceCatalogTypes";

/**
 * No province rings on a phone. If the atlas page ever cannot run, the SVG
 * fallback draws polities only, which is a far smaller cost than carrying five
 * megabytes of geometry the normal path never reads.
 */
export const FALLBACK_PROVINCE_MAP: ProvinceMapData = {
  meta: {
    dataset: "",
    topologyLicense: "",
    projection: "",
    quantization: "",
    simplificationToleranceDegrees: 0,
    generatedBy: "packages/app/src/components/provinceGeometry.native.ts",
    referenceDate: "1900-01-01",
    mapDataset: "",
    mapBoundaryVersion: "",
    provinceCount: 0,
    polityCount: 0,
    borderPairCount: 0,
    notes: "",
  },
  sources: [],
  futurePolities: [],
  provinces: [],
  borders: [],
};
