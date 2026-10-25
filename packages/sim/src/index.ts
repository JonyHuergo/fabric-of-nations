/**
 * Public API for the pure Century simulation package.
 *
 * M1 provides core types, calendar, keyed randomness, the minimal world state,
 * the tick driver, versioned serialization, and the test state digest. M2.1 adds
 * single-year sex-separated population blocks, exact annual ageing, age-specific
 * fertility, sex-specific mortality, needs, wealth, and militancy in a
 * single-region fixture. M3a adds validated economy definitions, buildings,
 * employment assignments, inventory lots, markets, a minimal cash ledger, and
 * schema-5 serialization. M3b adds deterministic workforce eligibility,
 * assignment, retention, and scheduling. Economy behavior beyond employment,
 * politics, technology, diplomacy, war, and UI contracts remain future milestones.
 */

export * from "./types.js";
export * from "./constants.js";
export * from "./calendar.js";
export * from "./rng.js";
export * from "./world.js";
export * from "./population/index.js";
export * from "./economy/index.js";
export * from "./tick.js";
export * from "./serialization.js";
export * from "./stateHash.js";
