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
 * assignment, retention, and scheduling. M3c adds an explicit physical
 * production phase with transient input reservations, producer-owned output lots,
 * and recorded storage overflow. M3d adds deterministic two-pass market clearing,
 * transient household/input reservations, and bounded daily price updates without
 * financial settlement. M3e adds explicit cash settlement of M3d transactions,
 * daily wages, upkeep, retained producer profit, and household cash updates.
 * M3f integrates the economic day into the public tick, with real-state demand
 * construction, cash-safe funding, and whole-day staged atomicity. It does not
 * add a speculative banking, credit, or later-milestone system. Politics,
 * technology, diplomacy, war, and UI contracts remain future milestones.
 */

export * from "./types.js";
export * from "./constants.js";
export * from "./calendar.js";
export * from "./rng.js";
export * from "./world.js";
export * from "./validationStats.js";
export * from "./population/index.js";
export * from "./economy/index.js";
export * from "./tick.js";
export * from "./serialization.js";
export * from "./stateHash.js";
