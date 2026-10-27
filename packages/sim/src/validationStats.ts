/**
 * Diagnostic-only validation instrumentation.
 *
 * This module never participates in simulation decisions, never mutates
 * authoritative state, and is not serialized or hashed. It exists so tests and
 * the benchmark harness can prove how many whole-world validations a bounded
 * workload performs. Counting is disabled by default; when disabled, the
 * recording helpers return immediately.
 *
 * The counters are module-level because they are process diagnostics, not world
 * state. Determinism is unaffected: the same inputs always produce the same
 * authoritative world hash whether instrumentation is enabled or not.
 */

let enabled = false;
let worldValidationCount = 0;

/** Enable or disable diagnostic counting. */
export function setValidationInstrumentationEnabled(value: boolean): void {
  enabled = value;
}

/** True when diagnostic counting is enabled. */
export function isValidationInstrumentationEnabled(): boolean {
  return enabled;
}

/** Reset the counters. Does not change whether counting is enabled. */
export function resetValidationInstrumentation(): void {
  worldValidationCount = 0;
}

/** Snapshot of the counters since the last reset. */
export interface ValidationInstrumentationSnapshot {
  /** Number of `assertValidWorld` entry points executed. */
  readonly worldValidations: number;
}

/** Read the counters since the last reset. */
export function readValidationInstrumentation(): ValidationInstrumentationSnapshot {
  return { worldValidations: worldValidationCount };
}

/**
 * Record one whole-world validation. Called only by `assertValidWorld`, so
 * `assertValidWorldForTick` is counted once through its full-world delegate.
 */
export function recordWorldValidation(): void {
  if (enabled) worldValidationCount += 1;
}
