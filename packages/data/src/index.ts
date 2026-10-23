/**
 * Century static content package.
 *
 * M0/M1 establish the package boundary only. The validated tables, schemas,
 * loaders, and content versioning described by GDD §15 arrive with M5. Nothing
 * here may contain simulation behavior or mutable runtime state.
 */

/** Placeholder content version. Must be replaced by the validated data version in M5. */
export const DATA_PACKAGE_VERSION = "m1-empty-v1";

/** Marks the package as intentionally incomplete until the data milestone. */
export const DATA_PACKAGE_STATUS = "placeholder" as const;

/** Summary of the current content package state. */
export interface DataPackageInfo {
  readonly version: string;
  readonly status: "placeholder" | "validated";
}

/** Current package state, safe to display in diagnostics. */
export const DATA_PACKAGE_INFO: DataPackageInfo = {
  version: DATA_PACKAGE_VERSION,
  status: DATA_PACKAGE_STATUS,
};
