# Fabric of Nations — Project Instructions

## 1. Purpose and Source of Truth

- This file defines persistent engineering rules for the project.
- The official game name is **Fabric of Nations**. The game was formerly *Century*; historical GDD versions, change reports, milestone reports and the historical decision register retain that name as a historical record. Do not introduce the former name into current player-facing UI, current application or web metadata, or current documentation.
- The official unit of account is **RUSD — Reference US Dollars**. RUSD is a neutral measurement unit, not a national currency, legal tender, an adoptable currency, or a fixed-rate substitute for the real-world US dollar. Actual national currencies, including USD, remain distinct. The unit was formerly **SUSD (Simulated US Dollars)**; historical reports and legacy save aliases retain that spelling.
- The Fabric of Nations Game Design Document (`Fabric_of_Nations_GDD.md`) defines game mechanics, simulation behavior, scope, and milestone acceptance criteria.
- Implement only the milestone explicitly assigned in the current task.
- Do not silently change the GDD or invent major mechanics. Record unresolved decisions and substantive deviations in `DECISIONS.md`, including the rationale and consequences.
- For material ambiguities or contradictions, report the issue and propose a resolution before proceeding with affected implementation. For minor, reversible details, choose the simplest compatible behavior and document the assumption.

## 2. Product Rules

- Fabric of Nations is a mobile game. iOS and Android are the primary platforms, and web is the development environment.
- Landscape is mandatory on every device.
- A feature is not finished until it reaches a phone. Anything added to the web build must reach iOS and Android in the same work, through the same code path wherever possible.
- One style everywhere: colour, type and layout come from `packages/app/src/design/tokens.ts`, and no platform may keep a different look or a reduced style.
- Phones in landscape are the primary design target, with 844 × 390 points as the reference. Tablets and desktop receive the same layout with more room. Every control is at least 44 points, and nothing may depend on hover.
- The map is always the screen. It is mounted once, and everything else slides over it.
- Device performance testing belongs to the designer. Do not claim that device performance or behaviour was verified unless it was.

## 3. Hard Rules

### Simulation isolation

- `packages/sim` must compile with `"lib": ["ES2022"]` only. It must not depend on React Native, the DOM, browser APIs, or platform-specific runtime APIs.
- Do not use `Date`, `performance.now()`, `Math.random()`, external entropy, or wall-clock time inside `packages/sim`.
- Never use `Math.random()` anywhere in `packages/`.
- The simulation must be deterministic: identical initial state, seed, data version, simulation version, and ordered player actions must produce identical results.
- Use the keyed/counter-based deterministic random generator defined by the GDD. Every random draw must have a stable purpose identifier and explicit entity/day/draw context. Do not use a shared mutable PRNG stream for gameplay randomness.
- Keep the random algorithm documented and covered by known-answer tests.

### State and architecture

- Authoritative simulation state must consist of plain data structures and typed arrays, with no hidden global state or classes holding authoritative mutable state.
- All authoritative state must support explicit, versioned serialization and restoration, including typed arrays.
- Simulation functions must receive their dependencies and mutable state explicitly. Do not depend on implicit module-level state.
- The app UI must never read or mutate the live simulation world.
- UI code may consume snapshots and import the public snapshot/command contracts required to communicate with the simulation worker. It must not import simulation implementation details into `packages/app/`.
- Keep `packages/sim` independent of the app and worker implementation.

### No-Mana Doctrine

- Never introduce arbitrary, spendable gameplay resources such as research-point pools, political-power points, or unexplained capacity pools.
- Every gameplay quantity must have an explicit causal model based on simulated entities, economic flows, physical resources, or other documented state.
- Derived values may be cached for performance, but their authoritative values must be recomputable from documented inputs.
- No scalar may accumulate through an unconditional fixed per-tick increment without an explicit, documented causal justification.
- Do not evade this rule by renaming a forbidden gameplay resource.

### Numerical integrity

- Every simulation coefficient must have documented units, justification, and a status of either provisional or calibrated.
- Put simulation tuning coefficients in the designated constants/configuration module. Keep historical country data, initial conditions, and other content in validated data files rather than hardcoding them into general-purpose simulation logic.
- Every formula must document its inputs, units, update cadence, boundaries, and intended effect.
- Validate inputs and reject NaN, infinity, invalid identifiers, and impossible authoritative states.
- Do not use arbitrary clamping to conceal accounting, population, employment, or inventory conservation failures.

## 4. Testing and Verification

- Every new simulation subsystem must include relevant unit tests and regression tests.
- Changes to state transitions, stochastic behavior, or the tick pipeline must include deterministic tests.
- Changes affecting population, employment, goods, money, or other conserved quantities must test the corresponding conservation invariants.
- Add or update benchmarks for performance-sensitive subsystems and major integration paths. Benchmark the complete simulation at required world sizes and report representative performance statistics.
- Do not delete, weaken, skip, or rewrite a failing acceptance test merely to obtain a passing build.
- Run the relevant existing tests after making changes, along with the required typecheck and benchmarks for the assigned milestone.
- Never claim that a test, benchmark, device build, or calibration passed unless it was actually executed and its result is available.

## 5. Commands and Dependencies

- Package manager: `pnpm`. Never use `npm` or `yarn` for project operations.
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Benchmark: `pnpm bench`
- Map runtime: `pnpm map:atlas` after changing design tokens or anything in `packages/app/src/map`; `pnpm map:atlas:check` verifies it is current

These commands must be defined as working project scripts. If a command is missing, inspect the workspace configuration and add or correct the appropriate script when within the assigned milestone. Do not silently substitute a different command or claim a missing command succeeded.

- Avoid adding dependencies unless they are necessary for the assigned task. Explain any new dependency and its compatibility implications.
- Preserve the existing lockfile and workspace configuration unless a change is required.

## 6. TypeScript and Coding Style

- Use TypeScript strict mode.
- Do not use `any` in `packages/sim`. Prefer explicit types, discriminated unions, and validated boundaries.
- Prefer deterministic, explicit functions with clearly defined inputs and effects. Mutation is allowed when applied to state passed explicitly to a function.
- Avoid hidden side effects, implicit global state, non-deterministic iteration dependencies, and unnecessary abstraction.
- Keep simulation logic separate from UI presentation, rendering, and platform APIs.
- Use integer counts for people and discrete physical items where required by the model. Handle fractional daily rates with explicit, deterministic remainder accumulation.
- Floating-point comparisons must use a documented tolerance where appropriate. Do not apply arbitrary epsilon rules to integer values or identifiers.
- Optimize based on profiling. Avoid unnecessary allocations in performance-critical loops, but do not sacrifice correctness or readability for speculative micro-optimization.

## 7. Agent Execution Workflow

Before implementation:

1. Inspect the relevant source files, existing tests, workspace scripts, and repository status.
2. Read the assigned milestone and its acceptance criteria in the GDD.
3. Identify dependencies, assumptions, and contradictions that affect the implementation.
4. Write or update tests before implementing the behavior, where practical.

During implementation:

5. Implement the smallest complete solution satisfying the assigned milestone.
6. Preserve working behavior outside the task's scope.
7. Do not implement future milestones unless necessary for an explicitly required interface or expressly authorized.
8. Update `DECISIONS.md` when making a substantive design decision or introducing a provisional assumption.
9. Add regression tests for bugs discovered during implementation.

Before completion:

10. Run the relevant tests, typecheck, and required benchmarks.
11. Verify determinism, serialization, and applicable conservation properties whenever the authoritative state or tick logic changes.
12. Check that the implementation still satisfies the existing architecture and milestone boundaries.

Every completion report must include:

- Files created or modified.
- Behavior implemented and important design decisions.
- Exact commands executed and their results.
- Benchmark environment and measurements, when applicable.
- Assumptions, deviations from the GDD, known limitations, and uncompleted acceptance criteria.

Do not claim an acceptance criterion is satisfied when it has not been verified. Do not start the next milestone until the current milestone's acceptance criteria pass or the designer explicitly accepts an exception.
