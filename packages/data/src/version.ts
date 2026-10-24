/** Version of the static JSON data package. */
export const DATA_PACKAGE_VERSION = "m2-population-v2";

/** M2 data is provisional; not source-verified historical calibration. */
export const DATA_PACKAGE_STATUS = "provisional" as const;

export interface DataPackageInfo {
  readonly version: string;
  readonly status: "placeholder" | "provisional" | "validated";
}

export const DATA_PACKAGE_INFO: DataPackageInfo = {
  version: DATA_PACKAGE_VERSION,
  status: DATA_PACKAGE_STATUS,
};
