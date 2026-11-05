/**
 * Fabric of Nations static content package.
 *
 * Static data is canonical JSON under `packages/data/data` and is loaded by
 * explicit loader functions. M5 adds the source-annotated historical pipeline in
 * `historical.ts`.
 */

export * from "./version.js";
export * from "./load.js";
export * from "./historical.js";
export * from "./currencies.js";
export * from "./provinces.js";
export * from "./demography1900.js";
