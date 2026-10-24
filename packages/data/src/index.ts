/**
 * Century static content package.
 *
 * M2 data is stored as canonical JSON under `packages/data/data` and loaded by
 * explicit loader functions. The full M5 data pipeline will add generated
 * CSV/JSON tables and stronger schema validators.
 */

export * from "./version.js";
export * from "./load.js";
