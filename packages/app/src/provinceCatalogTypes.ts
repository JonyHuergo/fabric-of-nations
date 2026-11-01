/**
 * Types for the generated M12a province map bundle.
 *
 * The bundle is a build artifact of `scripts/m12/build-provinces.mjs`. Static
 * province metadata and geometry live here; mutable ownership/control comes
 * from the worker snapshot (`ProvinceOwnershipSnapshot`).
 */

export type ProvinceConfidence = "low" | "medium" | "high";

export type ProvinceSpecialStatus =
  | "ordinary"
  | "autonomous"
  | "joint-administration"
  | "condominium"
  | "free-city"
  | "neutral"
  | "mandate"
  | "occupied";

export interface ProvinceMapSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly license: string;
  readonly date: string;
  readonly notes: string;
}

export interface ProvinceFuturePolity {
  readonly polityId: number;
  readonly tag: string;
  readonly historicalName: string;
  readonly commonName: string;
  readonly status: string;
  readonly activeFrom: string;
  readonly activeTo: string | null;
  readonly capitalName: string;
  readonly flagKey: string | null;
  readonly confidence: ProvinceConfidence;
  readonly notes: string;
}

export interface ProvinceMapProvince {
  readonly id: number;
  readonly key: string;
  readonly historicalName: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly initialOwnerPolityId: number;
  readonly initialOwnerTag: string;
  readonly mapTag: string;
  readonly simulationRegionId: number;
  readonly historicalAdminAffiliation: string;
  readonly historicalGrouping: string | null;
  readonly initialSpecialStatus: ProvinceSpecialStatus;
  readonly confidence: ProvinceConfidence;
  readonly notes: string;
  readonly sourceIds: readonly string[];
  readonly residual: boolean;
  readonly area: number;
  readonly bbox: readonly number[];
  readonly label: readonly [number, number];
  /** Delta-encoded rings in thousandths of a degree. */
  readonly rings: readonly (readonly number[])[];
  readonly holes: readonly number[];
}

/**
 * One shared boundary. `a` and `b` are province ids; `b === -1` marks an outer
 * edge (coast or a border with a non-province area). Lines are delta-encoded
 * polylines, not closed rings.
 */
export interface ProvinceMapBorder {
  readonly a: number;
  readonly b: number;
  readonly lines: readonly (readonly number[])[];
}

export interface ProvinceMapData {
  readonly meta: {
    readonly dataset: string;
    readonly topologyLicense: string;
    readonly projection: string;
    readonly quantization: string;
    readonly simplificationToleranceDegrees: number;
    readonly generatedBy: string;
    readonly referenceDate: string;
    readonly mapDataset: string;
    readonly mapBoundaryVersion: string;
    readonly provinceCount: number;
    readonly polityCount: number;
    readonly borderPairCount: number;
    readonly notes: string;
  };
  readonly sources: readonly ProvinceMapSource[];
  readonly futurePolities: readonly ProvinceFuturePolity[];
  readonly provinces: readonly ProvinceMapProvince[];
  readonly borders: readonly ProvinceMapBorder[];
}
