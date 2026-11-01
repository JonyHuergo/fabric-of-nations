# Keyed deterministic randomness

Fabric of Nations never uses a mutable random stream, ambient entropy, `Math.random`, the
host clock, or object identity as a source of randomness. Every draw is a pure
function of a stable key. The implementation lives in
`packages/sim/src/rng.ts`.

## Key tuple

```ts
interface RandomKey {
  seed: number;       // unsigned 32-bit world seed
  day: number;        // civil day index 0..36,524
  entityId: number;   // unsigned 32-bit stable entity ID, 0 for world-level draws
  purpose: string;    // stable lower-case ASCII purpose identifier
  drawIndex: number;  // unsigned 32-bit counter within the same key
}
```

Purpose identifiers must match
`^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$` and be at most 128 characters. Examples:
`demographics.births`, `ai.build-decision`, `test.kat`. This deliberately excludes
Unicode normalization and locale-dependent casing.

Convenience functions `drawWorldUint32` / `drawWorldUnitFloat` read the world seed
and next-to-process day explicitly; they introduce no hidden state.

## Algorithm

All arithmetic is unsigned 32-bit arithmetic (modulo 2^32). Multiplications use
`Math.imul` followed by `>>> 0`.

1. Represent the purpose with two FNV-1a-32 lanes and its length:
   - `lo = FNV-1a-32(purpose, basis = 0x811c9dc5)`
   - `hi = FNV-1a-32(purpose, basis = 0x1b873593)`
   - for each lane, start from the basis and for each UTF-16 code unit `c`:
     `h = (h XOR c) * 0x01000193 mod 2^32`
2. Combine, in this exact order: `hi`, purpose length, `seed`, `day`,
   `entityId`, `drawIndex`. The first lane `lo` is the starting state.
   ```
   combine(h, v):
     mixed = (v + 0x9E3779B9 + (h << 6) + (h >>> 2)) mod 2^32
     return (h XOR mixed) mod 2^32
   ```
3. Finalize with the MurmurHash3 32-bit finalizer:
   ```
   h ^= h >>> 16
   h = (h * 0x85EBCA6B) mod 2^32
   h ^= h >>> 13
   h = (h * 0xC2B2AE35) mod 2^32
   h ^= h >>> 16
   ```
4. `drawUint32` returns `h`.
5. `drawUnitFloat` returns `h / 2^32`, which is always in `[0, 1)`.

Because the key is recomputed for every draw, adding a new draw for one entity,
day, purpose, or counter cannot shift any other draw. Incidental iteration order
cannot change an individual entity's random value. Every component is validated
and mixed at a fixed position; no delimiter-based string concatenation is used,
so there is no separator ambiguity between numeric fields.

### Why two purpose lanes?

A single FNV-1a-32 purpose hash was insufficient: two valid purpose strings,
`poupguw1a` and `pblz9456g`, share the same single-lane FNV-1a-32 value. With a
single lane, a draw for those two purposes with the same seed/day/entity/draw
index would be identical. The second lane plus the purpose length separates this
demonstrated collision, and the regression is covered by
`packages/tests/src/rng.test.ts`.

The final output is 32 bits, so whole-key collisions remain possible in principle
across arbitrarily large input spaces. The two-lane purpose digest removes the
practical collision class found in the single-lane design; it is not a claim of
injectivity.

## Known-answer vectors

These values were produced by the specification above and independently
reproduced with a separate Python implementation. They are asserted by
`packages/tests/src/rng.test.ts`; changing them changes simulation behavior and
requires a simulation-version decision.

| seed | day | entityId | purpose | drawIndex | uint32 | unit float |
|---:|---:|---:|---|---:|---:|---:|
| 0 | 0 | 0 | `test.zero` | 0 | 1,676,094,509 | 0.3902461633551866 |
| 123,456,789 | 0 | 42 | `test.kat` | 0 | 646,304,044 | 0.15047938656061888 |
| 123,456,789 | 0 | 42 | `test.kat` | 1 | 1,590,439,617 | 0.3703030797187239 |
| 123,456,789 | 36,523 | 4,294,967,295 | `demographics.births` | 7 | 4,032,339,589 | 0.9388522219378501 |
| 4,294,967,295 | 12,345 | 7 | `ai.plan` | 99 | 1,017,635,033 | 0.23693661973811686 |

## Status

The algorithm is **provisional** for gameplay calibration but **binding** for
determinism: once a scenario or save exists, changing the algorithm invalidates
reproducibility and requires a simulation-version change and migration decision.
