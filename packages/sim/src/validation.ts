/**
 * Runtime validation helpers used at external and persistence boundaries.
 * They do not use platform APIs and have no hidden state.
 */

/** True for a non-array object value. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Require a plain object, including a readable path in the error. */
export function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

/** Require a finite number. */
export function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  return value;
}

/** Require an integer in an inclusive range. */
export function requireInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${path} must be an integer`);
  }
  if (value < minimum || value > maximum) {
    throw new RangeError(`${path} must be in ${minimum}..${maximum}, received ${String(value)}`);
  }
  return value;
}

/** Require a string, optionally bounded in length. */
export function requireString(
  value: unknown,
  path: string,
  options: { readonly minLength?: number; readonly maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  const minLength = options.minLength ?? 0;
  const maxLength = options.maxLength ?? Number.MAX_SAFE_INTEGER;
  if (value.length < minLength || value.length > maxLength) {
    throw new RangeError(
      `${path} must have length in ${minLength}..${maxLength}, received ${String(value.length)}`,
    );
  }
  return value;
}

/** Require an array value. */
export function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value;
}

/** Require an integer in the unsigned 32-bit range. */
export function requireUint32(value: unknown, path: string): number {
  return requireInteger(value, path, 0, 0xffff_ffff);
}
