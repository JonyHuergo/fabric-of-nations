/**
 * Types for the generated M11 catalog and map bundles.
 *
 * Both modules are build artifacts of the authored historical catalog
 * (`packages/data/data/historical/m11/polities_1900.json`). Runtime identity and
 * all mutable values still come from the worker snapshot.
 */

export type CatalogStatus =
  | "independent"
  | "personal-union"
  | "autonomous-vassal"
  | "dominion"
  | "self-governing-colony"
  | "protectorate"
  | "colony"
  | "occupation"
  | "autonomous-province"
  | "dependency";

export interface CatalogCapital {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

export interface WorldCatalogEntry {
  readonly id: number;
  readonly tag: string;
  readonly name: string;
  readonly commonName: string;
  readonly kind: "state" | "territory";
  readonly status: CatalogStatus;
  readonly continent: string;
  readonly sovereignTag: string | null;
  readonly selectable: boolean;
  readonly capital: CatalogCapital;
  readonly population1900: number;
  readonly market: string | null;
  readonly description: string;
  readonly confidence: "low" | "medium" | "high";
  readonly notes: string;
  readonly geometry: readonly string[];
}

export interface WorldCatalogMarket {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly kind: "national" | "imperial" | "shared";
  readonly customsTag: string;
  readonly description: string;
}

export interface WorldCatalogData {
  readonly meta: {
    readonly version: string;
    readonly startDate: string;
    readonly title: string;
    readonly classification: {
      readonly source: string;
      readonly selectableStatuses: readonly string[];
      readonly description: string;
    };
    readonly sources: readonly {
      readonly id: string;
      readonly title: string;
      readonly license: string;
      readonly notes: string;
    }[];
    readonly geometry: { readonly dataset: string; readonly license: string; readonly note: string };
  };
  readonly markets: readonly WorldCatalogMarket[];
  readonly entries: readonly WorldCatalogEntry[];
}

export interface WorldMapPolity {
  readonly tag: string;
  readonly kind: "state" | "territory";
  /** Delta-encoded rings in thousandths of a degree, unwrapped at the antimeridian. */
  readonly rings: readonly (readonly number[])[];
  /** Indices into `rings` that are holes. */
  readonly holes: readonly number[];
  readonly area: number;
  readonly bbox: readonly number[];
  readonly label: readonly [number, number];
  readonly small: boolean;
  readonly markerOnly?: boolean;
  readonly approximate?: string;
}

export interface WorldMapData {
  readonly meta: {
    readonly dataset: string;
    readonly topologyLicense: string;
    readonly naturalEarthLicense: string;
    readonly projection: string;
    readonly quantization: string;
    readonly simplificationToleranceDegrees: number;
    readonly generatedBy: string;
    readonly notes: string;
  };
  readonly land: readonly (readonly number[])[];
  readonly polities: readonly WorldMapPolity[];
}
