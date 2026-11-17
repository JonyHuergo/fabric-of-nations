# S0 completion report — Approval and the design bible

**Branch:** `statecraft/s0-design-bible`, from `main` at `105c3bb` (local commits only; nothing
pushed or merged).
**Decisions:** D-172 (the Statecraft Program approved), D-173 (the design bible; the sections
lost in v2.14 restored). **Plan:** `docs/statecraft/plans/S00_PLAN.md`, approved by the designer
on 2026-11-17 ("I approve"), every question answered as recommended (plan §0).
**Versions:** unchanged — world schema 36, simulation 0.32.0, save format 2, data
`m3-economy-v16`, worker protocol 25. Documents only.
**Status:** S0 complete. Every acceptance criterion of the brief is met (§5).

## 1. Commits

| Commit | Content |
|---|---|
| `9e307c8` | The stage plan and its questions (handbook step 2) |
| `6625a75` | The designer's answers recorded in the plan (§0) |
| `bafeb4c` | D-172: the Statecraft Program approved |
| `30084c9` | GDD v3.0, the design bible; v2.19 archived; the D-172 decision-2 row corrected |
| `70fc711` | Pointers: Prosperity Program, README, `AGENTS.md` §1, Statecraft README, handbook, program, three act files |
| (this commit) | Close: D-173, this report, the stage status table, the plan's progress note |

## 2. Files

| File | Change |
|---|---|
| `Fabric_of_Nations_GDD.md` | Rewritten as v3.0, the design bible (1,369 lines; v2.19 had 6,992) |
| `docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md` | New: v2.19 moved here unchanged (`git mv`; byte-identical to `main`). Git records it as a new file because v3.0 took the old path in the same commit; the history of v2.19 stays under `Fabric_of_Nations_GDD.md` |
| `docs/archive/README.md` | The archived edition named; the v2.14 loss recorded |
| `DECISIONS.md` | D-172, D-173; index regenerated (173 decisions) |
| `AGENTS.md` | §1: the two stale phrases of plan Q13 |
| `README.md` | Where-things-are table (GDD, Statecraft Program, Prosperity Program, archive); development workflow steps 1 and 7 |
| `docs/PROSPERITY_PROGRAM.md` | Status: closed after P7, with the table of program §5.2; authority line; GDD numbering note |
| `docs/STATECRAFT_PROGRAM.md` | Status line: S0 done; GDD numbering note. The approved text is otherwise unchanged |
| `docs/statecraft/README.md` | Reading order: the GDD as design bible, the archive, the numbering note; S0 row of the status table |
| `docs/statecraft/HANDBOOK.md` | §2: GDD v3.0 records the amendments; numbering note |
| `docs/statecraft/ACT_4_NATIONS.md`, `ACT_6_TOTAL_WAR.md`, `ACT_7_LATER_ERAS.md` | One GDD citation each now names v2.19 |
| `docs/statecraft/plans/S00_PLAN.md` | New: the stage plan and the answers |
| `docs/statecraft/reports/S00_REPORT.md` | New: this report |

No file under `packages/` changed.

## 3. What was done

**The approval (D-172).** The ten decisions of program §18 word for word; for each, the GDD rules
it amends and the stage from which the amendment applies; the other GDD rules the approved program
changes (§19's naval warfare and nuclear weapons, the test tiers, the code that goes); the table of
program §5.2; the Statecraft documents.

**The finding (D-173).** GDD v2.14 lost §12.1 to §16 and the §17 heading (about 530 lines) by an
editing error; v2.15 to v2.19 inherited the gap and no decision recorded it. `Century_GDD_v2.13.md`
is the last edition with the text. The rules it held were still binding and still cited by code and
decisions.

**The design bible (GDD v3.0).** Front matter; Part A the game (A1 to A8); Part B binding doctrine
(B1 No-Mana to B14 how work is done); Part C one section per system (C1 world and map, C2
population, C3 economy, C4 money, C5 politics, C6 technology, C7 diplomacy, C8 war, C9 country AI,
C10 interface, C11 news), each with today, next and specification; Part D glossary; Part E the
concordance.

- Binding rules are quoted verbatim with a source tag. They were assembled by a scratch script
  from exact line ranges of `git show main:Fabric_of_Nations_GDD.md`, the archived v2.13, the
  program and the handbook, so the quotations match their sources by construction.
- Where a named decision changed a rule, a note beneath the quotation names it. S0 changed no rule.
- Part C was checked against the code and the reports: the files it names exist, the version
  numbers are those in `constants.ts`, `protocol.ts` and `version.ts`, the AI period is
  `AI_EVALUATION_PERIOD_DAYS = 7`, and the figures are those of program §1 and the P7 report.
- The size (1,369 lines) is above the plan's estimate of 1,000 to 1,200: the verbatim quotations of
  v2.13 §16.2 (whose item 10 alone is a long paragraph) and §14.4, and the two glossaries, make up
  the difference. Nothing was paraphrased to save space.

**Pointers.** The documents listed in §2.

## 4. Measurements

None: no code changed. The plan's §6 checks are in §6.

## 5. Acceptance criteria of the brief

| Criterion | Evidence | Result |
|---|---|---|
| Every binding rule of the old GDD is in the new one or was amended by a named decision | Part B quotes each binding rule with its source; amendments name D-013, D-112, D-116 to D-119, D-122, D-124, D-163, D-167, D-172. The lost v2.13 rules are treated as part of the old GDD (plan Q1) | Met |
| The report's table accounts for every old section | Appendix A: one row for each of the 290 headings of v2.19 and the 30 headings of the v2.13 lost range. The build script fails on any heading without a concordance rule and on any rule that matches no heading; it passed | Met |
| `pnpm audit:branding`, `pnpm audit:monetary`, the decisions index check, `pnpm lint` | §6 | Pass |
| No file under `packages/` changed | `git diff --stat main -- packages` is empty | Met |

Traps of the brief: no rule was improved or re-decided while moving (all quotations are verbatim;
notes only name existing decisions); no history was deleted (v2.19 is archived byte for byte, v2.13
stays); no planned system is described as implemented (Part C separates today from next, and B3
keeps the daily cadence binding until S2).

### Definition of done (handbook §8)

| # | Item | S0 |
|---|---|---|
| 1 to 5 | Desk cards, lens, Gazette events, AI use, "why" and forecast entries | Not applicable: S0 adds no system |
| 6 | Wheel jobs within budget | Not applicable: no simulation work |
| 7 | Tests | The checks of §6; no code to test |
| 8 | Phone | Not applicable: no app file changed; nothing to test on a device |
| 9 | Records | This report, D-172, D-173, the status table, the corrected documents (§2) |

## 6. Commands and results

| Command | Result |
|---|---|
| `node scripts/docs/decisions-index.mjs --check` (orientation, on `main`) | current (171 decisions) |
| Baseline on the branch before the GDD changed (`bafeb4c`): `pnpm lint`; `pnpm audit:branding`; `pnpm audit:monetary`; index `--check` | pass; pass; pass; current (172) |
| Baseline: `node --max-old-space-size=900 --experimental-vm-modules ./node_modules/jest/bin/jest.js src/architecture/naming-audits.test.ts` (in `packages/tests`) | 1 suite, 13 of 13 tests passed (229 s) |
| `node build-bible.mjs` (scratch): every heading of v2.19 (290) and of the v2.13 lost range (30) mapped by exactly one concordance rule; no unused rule | pass |
| `git show main:Fabric_of_Nations_GDD.md \| cmp - docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md` | identical |
| Cross-references of the new GDD (every `A`–`E` section number it cites is one of its headings; E0 to E6 are stage names) | pass |
| After step 4 (`30084c9`): `pnpm lint`; both audits; index `--check`; naming suite | pass; pass; current (172); 13 of 13 (224 s) |
| After step 5 (`70fc711`): `pnpm lint`; both audits; index `--check` | pass; pass; current (172) |
| Close: `node scripts/docs/decisions-index.mjs` then `--check` | written; current (173) |
| Close: `pnpm lint`; `pnpm audit:branding`; `pnpm audit:monetary` | pass (768 files); pass (771 files); pass |
| Close: naming suite | 1 suite, 13 of 13 tests passed (227 s) |
| `git diff --stat main -- packages` | empty |

## 7. Open items, assumptions and deviations

1. **Code comments cite old section numbers** (29 citations in 17 files, e.g. `rng.ts` "GDD §16.1",
   `day.ts` "GDD §4.2"). Part E resolves them; a stage that edits such a file can update its
   citation. Not changed in S0, by the brief's rule that nothing under `packages/` changes.
2. **Older decisions and reports cite v2.x section numbers.** They are historical records and stay
   as written; Part E resolves them.
3. **Part B notes that later stages must update:** B3.1 and B4.2 (S2a to S2c), B10.3 (S2c), B12.3
   and B12.4 (S3), B9.3 (S8), B13.2 record names (S19 onward, when M10 is replaced).
4. **Deviation from the plan:** the bible is 1,369 lines against the 1,000 to 1,200 of plan Q11
   (§3).
5. **The full `pnpm test`, `pnpm bench`, `check:worker`, `map:atlas:check` and `app:export` were not
   run**, as the plan's Q14 answer allows: no code, data, map or app file changed.
6. **Scratch tooling** (not committed): the build script, the concordance mapping and the template
   are in the session's scratchpad. The concordance is reproduced in Part E and Appendix A.

## 8. What to test on phones (designer)

Nothing: no app file changed.

## Appendix A — Every old heading and where it went

"v2.19" lines are those of `docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md`; "v2.13" lines are
those of `docs/archive/gdd/Century_GDD_v2.13.md` (the range lost in v2.14). Unnumbered
subheadings follow the numbered section they sit in.

| Source | Line | Heading | Now |
|---|---:|---|---|
| v2.19 | 1 | FABRIC OF NATIONS — GRAND STRATEGY 1900–2000 | Front matter (version 3.0); the v2.5 to v2.19 alignment notes and M5 to M7 addenda that followed it (364 lines): archive v2.19 |
| v2.19 | 378 | Document purpose and authority | Front matter (the four kinds of requirement and the order of precedence, verbatim), below the authority order of handbook §2 (D-172) |
| v2.19 | 403 | Contents | Replaced by the contents of v3.0 |
| v2.19 | 431 | 1. Vision and design pillars | A1, A2 (verbatim) |
| v2.19 | 433 | 1.1 Vision | A1, A2 (verbatim) |
| v2.19 | 441 | 1.2 Design pillars | A1, A2 (verbatim) |
| v2.19 | 450 | 1.3 Product definition | A4 (verbatim; the regions and cadence lines amended by D-118 and D-172) |
| v2.19 | 460 | 1.4 Economic management design objective | A5 (the objective and the loop, verbatim); the closing cross-references: archive v2.19 |
| v2.19 | 490 | 2. Core doctrine: no arbitrary gameplay pools | B1 (verbatim, unchanged) |
| v2.19 | 492 | 2.1 Binding rule | B1 (verbatim, unchanged) |
| v2.19 | 498 | 2.2 Required replacements | B1 (verbatim, unchanged) |
| v2.19 | 512 | 2.3 Enforcement | B1 (verbatim, unchanged) |
| v2.19 | 523 | 3. Campaign, calendar, and tick semantics | B2 (verbatim) |
| v2.19 | 525 | 3.1 Calendar convention | B2 (verbatim) |
| v2.19 | 537 | 3.2 Speed controls | B2 (verbatim) |
| v2.19 | 551 | 3.3 Simulation and UI clocks | B2 (verbatim) |
| v2.19 | 558 | 3.4 Evaluation cadence | B3 (verbatim; binding until S2, then program §4 by D-172 decision 1) |
| v2.19 | 584 | 4. Simulation architecture and daily update order | B4.1 (verbatim) |
| v2.19 | 586 | 4.1 Pure simulation boundary | B4.1 (verbatim) |
| v2.19 | 594 | 4.2 Mandatory daily pipeline | B4.2 (the rule, verbatim; the step list was last updated at P1b and is in the archive v2.19); whole-day staging superseded by D-116 (B6.2) |
| v2.19 | 766 | 4.3 Scarcity and allocation | B6.3 (verbatim, without the M3 status paragraph); the M3 status: archive v2.19 |
| v2.19 | 796 | 4.4 Month and year boundaries | B2.4 (verbatim) |
| v2.19 | 805 | 5. Data model and state ownership | B5.1 (verbatim) |
| v2.19 | 807 | 5.1 General rules | B5.1 (verbatim) |
| v2.19 | 817 | 5.2 Core primitive types | B7.1 (the RUSD definition, verbatim, with D-122); the type list: archive v2.19 |
| v2.19 | 846 | 5.3 Static definitions | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 914 | 5.4 Runtime state | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1146 | 5.4.1 M4a-2 country, currency, and valuation model (current) | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1195 | 5.4.2 M4b monthly finance close and period summaries (current) | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1341 | 5.4.3 M4c government fiscal model, extended by E2 (current) | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1492 | 5.4.4 M5 multi-region, multi-market, migration, and labor-access model (current) | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1578 | 5.4.5 M5a profit distribution and state-enterprise remittances (current) | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1628 | 5.4.6 M5b public debt and deficit financing (current) | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1737 | 5.5 Minimum supporting contracts | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| v2.19 | 1932 | 5.6 Static/runtime split and serialization | B5.2 (verbatim; the migration sentence amended by D-013 and the no-legacy-saves rule, B11) |
| v2.19 | 1942 | 6. Population, needs, and social mobility | C2; archive v2.19 |
| v2.19 | 1944 | 6.1 Population blocks | C2; archive v2.19 |
| v2.19 | 1954 | 6.2 Initial professions | C2; archive v2.19 |
| v2.19 | 1966 | 6.3 Attributes | C2; archive v2.19 |
| v2.19 | 1980 | 6.4 Needs and consumption | C2; archive v2.19 |
| v2.19 | 2022 | 6.5 Wealth/standard of living | C2; archive v2.19 |
| v2.19 | 2059 | 6.6 Demographics | C2; superseded in direction by D-124 (B8.3); archive v2.19 |
| v2.19 | 2076 | Fertility | C2; superseded in direction by D-124 (B8.3); archive v2.19 |
| v2.19 | 2086 | Mortality | C2; superseded in direction by D-124 (B8.3); archive v2.19 |
| v2.19 | 2094 | Source-backed and provisional inputs | C2; superseded in direction by D-124 (B8.3); archive v2.19 |
| v2.19 | 2101 | Conservation and calibration | C2; superseded in direction by D-124 (B8.3); archive v2.19 |
| v2.19 | 2110 | 6.7 Employment and labor allocation | B6.4 (the employment rules, verbatim); C3; archive v2.19 |
| v2.19 | 2124 | 6.8 Social mobility and migration | C2; archive v2.19 |
| v2.19 | 2142 | 7. Production, goods, markets, and prices | C3; archive v2.19 |
| v2.19 | 2144 | 7.1 Goods in v1 | C3; archive v2.19 |
| v2.19 | 2175 | 7.2 Buildings in v1 | C3; archive v2.19 |
| v2.19 | 2206 | 7.3 Building operation | C3; archive v2.19 |
| v2.19 | 2229 | 7.4 Markets and trade zones | C1, C3; superseded by D-119 (B5.3); archive v2.19 |
| v2.19 | 2247 | 7.5 Market clearing and inventories | C3; archive v2.19 |
| v2.19 | 2257 | 7.6 Prices | C3; archive v2.19 |
| v2.19 | 2284 | 7.7 Wages, profits, and ownership | C3; archive v2.19 |
| v2.19 | 2345 | 7.8 GDP and macroeconomic statistics | C3; archive v2.19 |
| v2.19 | 2360 | 8. Money, accounting, and public finance | archive v2.19 |
| v2.19 | 2371 | 8.1 Accounting principles | B7.2 (the principles, verbatim); the M4 to E6b status paragraphs: archive v2.19 |
| v2.19 | 2421 | 8.2 Financial accounts and debt contracts | C4; archive v2.19 |
| v2.19 | 2439 | 8.3 Government revenue | C4; archive v2.19 |
| v2.19 | 2482 | 8.4 Government expenditure | C4; archive v2.19 |
| v2.19 | 2531 | 8.5 Deficits, borrowing, credit, and default | C4; archive v2.19 |
| v2.19 | 2585 | 8.6 Prices, inflation, and currency regimes | C4; archive v2.19 |
| v2.19 | 2618 | 8.7 Finance invariants | B6.5 (the invariants, verbatim); the status paragraph: archive v2.19 |
| v2.19 | 2655 | 9. Politics and institutions | C5; archive v2.19 |
| v2.19 | 2668 | 9.1 Interest groups | C5; archive v2.19 |
| v2.19 | 2674 | 9.2 Laws | C5; archive v2.19 |
| v2.19 | 2690 | 9.3 Elections and regimes | C5; archive v2.19 |
| v2.19 | 2694 | 9.4 Militancy, unrest, and instability | C5; archive v2.19 |
| v2.19 | 2700 | 9.5 Institutions and administrative services | C5; archive v2.19 |
| v2.19 | 2706 | 10. Technology and education | C6; archive v2.19 |
| v2.19 | 2708 | 10.1 Technology graph | C6; archive v2.19 |
| v2.19 | 2714 | 10.2 Research work | C6; archive v2.19 |
| v2.19 | 2730 | 10.3 Literacy and education transition | C6; archive v2.19 |
| v2.19 | 2738 | 11. Diplomacy, war, and territorial control | C7; archive v2.19 |
| v2.19 | 2744 | 11.1 Diplomacy | C7; archive v2.19 |
| v2.19 | 2750 | 11.2 Military organization | C8; archive v2.19 |
| v2.19 | 2756 | 11.3 Combat and casualties | C8; archive v2.19 |
| v2.19 | 2760 | 11.4 War termination | C8; archive v2.19 |
| v2.19 | 2764 | 11.5 Occupation and territorial change | B13.1 (the rule, verbatim); C8; archive v2.19 |
| v2.19 | 2779 | 12. Country AI | C9; the tables: archive v2.19 |
| v2.19 | 2843 | 17.1 M3 implementation stages (accepted baseline) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 2865 | 17.2 M4 implementation stages (accepted foundation) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 2900 | 17.2a M5 implementation (accepted) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 2916 | 17.2b M5a implementation (accepted) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 2928 | 17.2c M5b implementation (accepted) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 2941 | 17.2d M6 implementation (accepted) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 2958 | 17.2e M7 implementation (native/device acceptance exception) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3029 | 17.3 Intermediate finance stages (M5a/M5b/M7a accepted; M8a planned) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3051 | M5a — Profit distributions and enterprise remittances | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3091 | M5b — Public debt and deficit financing | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3136 | M7a — Annual accounting close and controlled corrections | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3176 | M8a — Inflation, FX dynamics, and monetary-policy foundations | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3227 | 17.4 Dependency plan and slice boundary | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3287 | 17.5 Economic Management Overhaul roadmap (E0–E6) | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3303 | 17.5.1 Combined implementation order | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3342 | 17.5.2 Stage summary | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3358 | 17.5.3 Authority and status rules | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| v2.19 | 3378 | 17A. Economic Management Overhaul — detailed specification (E0–E6) | archive v2.19 (the loop is A5) |
| v2.19 | 3388 | 17A.1 Product goal and core loop | archive v2.19 (the loop is A5) |
| v2.19 | 3419 | 17A.2 Implementation-truth labels and authority | B9.1 (the authority rules, verbatim); the labels: front matter |
| v2.19 | 3450 | 17A.3 Design principles | B9.2 (verbatim) |
| v2.19 | 3482 | 17A.4 Policy framework overview | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3499 | 17A.5 Fiscal policy and public finances | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3505 | 17A.5.1 Instrument framework | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3526 | 17A.5.2 Fiscal rules | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3552 | 17A.5.3 Existing vs new fiscal mechanics | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3576 | 17A.6 Public investment and construction | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3584 | 17A.6.1 Project model | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3600 | 17A.6.2 Project classes and dependencies | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3623 | 17A.6.3 Accounting, atomicity, and determinism | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3649 | 17A.6.4 Acceptance direction | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3659 | 17A.7 Industrial and business policy | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3665 | 17A.7.1 Instruments and minimum mechanics | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3676 | 17A.7.2 Ownership and accounting | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3690 | 17A.7.3 Current status | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3705 | 17A.8 Trade and commercial policy | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3719 | 17A.8.1 Required prerequisites | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3766 | 17A.8.2 Instruments and intended effects | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3779 | 17A.8.3 Rules | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3799 | 17A.9 Labor and social policy | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3806 | 17A.9.1 Instruments, timing, and prerequisites | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3820 | 17A.9.2 Time-lag rules | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3831 | 17A.9.3 Prerequisites and exclusions | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3844 | 17A.10 Monetary policy and currency | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3855 | 17A.10.1 RUSD convention | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3876 | 17A.10.2 Required institutional and accounting foundations | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3896 | 17A.10.3 Instruments and sequencing | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3908 | 17A.10.4 Rules | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3923 | 17A.11 Regulation and structural reform | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3948 | 17A.12 Understandable economic interface and reports | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3961 | 17A.12.1 National economic dashboard | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 3993 | 17A.12.2 Explaining causes with actual evidence | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4016 | 17A.12.3 Explaining decisions before commitment | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4035 | 17A.12.4 Monthly economic report and action history | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4055 | 17A.12.5 Screen evolution (E1) | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4077 | 17A.13 Acceptance criteria | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4079 | 17A.13.1 Overall experience criteria | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4110 | 17A.13.2 Per-stage acceptance | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4123 | 17A.13.3 Usability acceptance tasks | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4146 | 17A.13.4 Non-acceptance criteria | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4161 | 17A.14 E0–E6 stage specifications | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4167 | E0 — Economic Management Design Specification (this revision) | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4180 | E1 — Economic Clarity and Monthly Reports | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4209 | E2 — Fiscal Management | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4251 | E3 — Public Investment and Construction — implemented | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4282 | E4 — Industrial and Business Policy — implemented | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4315 | E5 — Labor and Social Institutions | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4346 | E6 — Trade and Monetary Economy | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4382 | 17A.15 Cross-cutting implementation requirements | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4422 | 17A.16 Open design questions and dependency register | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| v2.19 | 4455 | 17A.17 E1 implementation record | archive v2.19 |
| v2.19 | 4463 | Delivered interface | archive v2.19 |
| v2.19 | 4486 | Data sources and deliberate gaps | archive v2.19 |
| v2.19 | 4505 | Monthly report and balance semantics | archive v2.19 |
| v2.19 | 4516 | Confirmed action history | archive v2.19 |
| v2.19 | 4527 | Protocol and state consequences | archive v2.19 |
| v2.19 | 4541 | Verification and acceptance evidence | archive v2.19 |
| v2.19 | 4555 | Remaining E1 limitations | archive v2.19 |
| v2.19 | 4573 | 17A.18 E2 implementation record | archive v2.19 |
| v2.19 | 4583 | Delivered instruments | archive v2.19 |
| v2.19 | 4602 | Budget decomposition and reporting | archive v2.19 |
| v2.19 | 4624 | Financing semantics and ordering | archive v2.19 |
| v2.19 | 4644 | Snapshot, protocol, and state consequences | archive v2.19 |
| v2.19 | 4665 | Data sources and deliberate limits | archive v2.19 |
| v2.19 | 4680 | Verification and acceptance evidence | archive v2.19 |
| v2.19 | 4696 | Remaining E2 limitations | archive v2.19 |
| v2.19 | 4719 | 17A.19 E3 implementation record | archive v2.19 |
| v2.19 | 4730 | Scope and ownership model | archive v2.19 |
| v2.19 | 4746 | Project model and authorization | archive v2.19 |
| v2.19 | 4763 | Daily construction phase | archive v2.19 |
| v2.19 | 4805 | Accounting and reporting | archive v2.19 |
| v2.19 | 4821 | Snapshot, protocol, and data consequences | archive v2.19 |
| v2.19 | 4841 | Player workflow | archive v2.19 |
| v2.19 | 4854 | Deliberate limits and remaining dependencies | archive v2.19 |
| v2.19 | 4877 | Verification and acceptance evidence | archive v2.19 |
| v2.19 | 4894 | Acceptance mapping | archive v2.19 |
| v2.19 | 4905 | 17A.20 E4 implementation record | archive v2.19 |
| v2.19 | 4916 | Scope and instrument status | archive v2.19 |
| v2.19 | 4933 | Sector classification and subsidy | archive v2.19 |
| v2.19 | 4958 | Construction materials and procurement | archive v2.19 |
| v2.19 | 4986 | Public-enterprise support | archive v2.19 |
| v2.19 | 5001 | Accounting and reporting | archive v2.19 |
| v2.19 | 5015 | Snapshot, protocol, data, and persistence | archive v2.19 |
| v2.19 | 5037 | UI and actions | archive v2.19 |
| v2.19 | 5052 | Deliberate limits and remaining dependencies | archive v2.19 |
| v2.19 | 5075 | Verification and acceptance evidence | archive v2.19 |
| v2.19 | 5091 | Acceptance mapping | archive v2.19 |
| v2.19 | 5106 | 17B. M7a Annual Accounting — implementation record | archive v2.19 |
| v2.19 | 5115 | 17B.1 Period boundaries and calendar rules | archive v2.19 |
| v2.19 | 5131 | 17B.2 Year-end closing and flow semantics | archive v2.19 |
| v2.19 | 5156 | 17B.3 Controlled corrections | archive v2.19 |
| v2.19 | 5177 | 17B.4 Bounded history and persistence | archive v2.19 |
| v2.19 | 5193 | 17B.5 E1 integration | archive v2.19 |
| v2.19 | 5206 | 17B.6 Tests and acceptance evidence | archive v2.19 |
| v2.19 | 5226 | 17B.7 Remaining limitations | archive v2.19 |
| v2.19 | 5240 | 17C. M8 Laws and Institutions — implementation record | archive v2.19 |
| v2.19 | 5248 | 17C.1 Scope and instrument status | archive v2.19 |
| v2.19 | 5261 | 17C.2 Authoritative state | archive v2.19 |
| v2.19 | 5280 | 17C.3 Law model and effects | archive v2.19 |
| v2.19 | 5307 | 17C.4 Elections and crisis | archive v2.19 |
| v2.19 | 5327 | 17C.5 Institutions, payroll, and derived effects | archive v2.19 |
| v2.19 | 5351 | 17C.6 Accounting and reporting | archive v2.19 |
| v2.19 | 5367 | 17C.7 Ordering, determinism, and atomicity | archive v2.19 |
| v2.19 | 5385 | 17C.8 Snapshot, protocol, data, and persistence | archive v2.19 |
| v2.19 | 5405 | 17C.9 UI and player workflow | archive v2.19 |
| v2.19 | 5417 | 17C.10 Acceptance mapping and evidence | archive v2.19 |
| v2.19 | 5439 | 17C.11 Verification and deliberate limits | archive v2.19 |
| v2.19 | 5467 | 17D. M9 Technology and Education — implementation record | archive v2.19 |
| v2.19 | 5475 | 17D.1 Scope and instrument status | archive v2.19 |
| v2.19 | 5487 | 17D.2 Authoritative state | archive v2.19 |
| v2.19 | 5504 | 17D.3 Research work and effects | archive v2.19 |
| v2.19 | 5525 | 17D.4 Education payroll and literacy | archive v2.19 |
| v2.19 | 5546 | 17D.5 Accounting and reporting | archive v2.19 |
| v2.19 | 5560 | 17D.6 Ordering, determinism, and atomicity | archive v2.19 |
| v2.19 | 5580 | 17D.7 Snapshot, protocol, data, and persistence | archive v2.19 |
| v2.19 | 5601 | 17D.8 UI and player workflow | archive v2.19 |
| v2.19 | 5612 | 17D.9 Acceptance mapping and evidence | archive v2.19 |
| v2.19 | 5635 | 17D.10 Verification and deliberate limits | archive v2.19 |
| v2.19 | 5662 | 17E. E5 Labor and Social Institutions — implementation record | archive v2.19 |
| v2.19 | 5672 | 17E.1 Scope and instrument status | archive v2.19 |
| v2.19 | 5687 | 17E.2 Authoritative state | archive v2.19 |
| v2.19 | 5707 | 17E.3 Training and qualification channel | archive v2.19 |
| v2.19 | 5729 | 17E.4 Public-health channel | archive v2.19 |
| v2.19 | 5744 | 17E.5 Labor/health laws and timing | archive v2.19 |
| v2.19 | 5761 | 17E.6 Phase order and accounting | archive v2.19 |
| v2.19 | 5786 | 17E.7 Snapshot, protocol, data, and persistence | archive v2.19 |
| v2.19 | 5805 | 17E.8 UI and player workflow | archive v2.19 |
| v2.19 | 5816 | 17E.9 Acceptance mapping and evidence | archive v2.19 |
| v2.19 | 5838 | 17E.10 Deliberate limits | archive v2.19 |
| v2.19 | 5856 | 17F. E6a implementation record (v2.15) | archive v2.19 |
| v2.19 | 5864 | 17F.1 Scope and instrument status | archive v2.19 |
| v2.19 | 5880 | 17F.2 Authoritative state and phases | archive v2.19 |
| v2.19 | 5902 | 17F.3 Trade mechanism | archive v2.19 |
| v2.19 | 5928 | 17F.4 Accounting and reporting | archive v2.19 |
| v2.19 | 5941 | 17F.5 Determinism, persistence, and compatibility | archive v2.19 |
| v2.19 | 5955 | 17F.6 UI and player workflow | archive v2.19 |
| v2.19 | 5967 | 17F.7 Acceptance mapping and evidence | archive v2.19 |
| v2.19 | 5994 | 17F.8 Deliberate limits | archive v2.19 |
| v2.19 | 6014 | 17G. E6b implementation record (v2.16) | archive v2.19 |
| v2.19 | 6022 | 17G.1 Scope and instrument status | archive v2.19 |
| v2.19 | 6034 | 17G.2 Authoritative state and phases | archive v2.19 |
| v2.19 | 6053 | 17G.3 Exchange-rate and money mechanics | archive v2.19 |
| v2.19 | 6070 | 17G.4 Accounting, determinism, and compatibility | archive v2.19 |
| v2.19 | 6083 | 17G.5 UI and player workflow | archive v2.19 |
| v2.19 | 6093 | 17G.6 Acceptance mapping and evidence | archive v2.19 |
| v2.19 | 6110 | 17G.7 Deliberate limits | archive v2.19 |
| v2.19 | 6124 | 17H. M10 implementation record (v2.17) | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| v2.19 | 6131 | 17H.1 Sovereignty and military control (CEN-AUDIT-016) | B13.2 (verbatim, with D-118: provinces) |
| v2.19 | 6152 | 17H.2 Authoritative state | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| v2.19 | 6162 | 17H.3 Military mechanics | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| v2.19 | 6196 | 17H.4 Integration | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| v2.19 | 6216 | 17H.5 Determinism and persistence | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| v2.19 | 6231 | 17H.6 Acceptance mapping and evidence | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| v2.19 | 6249 | 17H.7 Deliberate limits | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| v2.19 | 6260 | 17I. M11 implementation record (v2.18) | archive v2.19 |
| v2.19 | 6266 | 17I.1 Historical classification and the 1900 catalog | B13.3 (the classification, verbatim); C1 |
| v2.19 | 6299 | 17I.2 World representation | archive v2.19 |
| v2.19 | 6321 | 17I.3 Historical accuracy and estimation | archive v2.19 |
| v2.19 | 6338 | 17I.4 Country selection and player identity | archive v2.19 |
| v2.19 | 6366 | 17I.5 Market identity | archive v2.19 |
| v2.19 | 6389 | 17I.6 Historical world map | archive v2.19 |
| v2.19 | 6420 | 17I.7 Slider-first controls | archive v2.19 |
| v2.19 | 6435 | 17I.8 Interface redesign | B10.1 (the D-112 supersession, verbatim); C10; archive v2.19 |
| v2.19 | 6466 | 17I.9 Contracts, state and versioning | archive v2.19 |
| v2.19 | 6487 | 17I.10 Determinism and invariants | archive v2.19 |
| v2.19 | 6500 | 17I.11 Acceptance mapping | archive v2.19 |
| v2.19 | 6518 | 17I.12 Deliberate limits | archive v2.19 |
| v2.19 | 6537 | 17I.13 M11b catalog-coverage addendum | archive v2.19 |
| v2.19 | 6560 | 17I.14 M11c historical geography and border-reconstruction addendum | archive v2.19 |
| v2.19 | 6602 | 17I.15 M11c.1 corrections, rendering and zoom addendum | archive v2.19 |
| v2.19 | 6638 | 17J. Prosperity Program — peacetime economy and demography (P0–P15) | A6 (the objective, verbatim); the heading's status text: archive v2.19 |
| v2.19 | 6696 | 17J.1 Objective | A6 (the objective, verbatim); the heading's status text: archive v2.19 |
| v2.19 | 6709 | 17J.2 Binding foundational rules | B5.3, B6.2, B7.3, B8.3, B8.4, B11.2 (verbatim, rule by rule) |
| v2.19 | 6741 | 17J.3 Stages | archive v2.19; P0 to P7 in Part C; P8 to P15 superseded by program §5.2 (D-172) |
| v2.19 | 6763 | 17J.4 Rollback mechanism (P1) | B6.2 (verbatim) |
| v2.19 | 6771 | 17J.5 Companies and capital markets | archive v2.19; superseded by program §5.2 (S10, S11; D-172 decision 9) |
| v2.19 | 6779 | 17J.6 Performance | B12.1 (the rule, verbatim); the 2026-11-02 baseline: archive v2.19 |
| v2.19 | 6789 | 18. Code-agent execution contract | Superseded by `AGENTS.md` §7 and handbook §5 (B14); archive v2.19 |
| v2.19 | 6793 | 18.1 Scope control | Superseded by `AGENTS.md` §7 and handbook §5 (B14); archive v2.19 |
| v2.19 | 6800 | 18.2 Before implementation | Superseded by `AGENTS.md` §7 and handbook §5 (B14); archive v2.19 |
| v2.19 | 6807 | 18.3 Implementation quality | Superseded by `AGENTS.md` §7 and handbook §5 (B14); archive v2.19 |
| v2.19 | 6817 | 18.4 Verification and completion report | Superseded by `AGENTS.md` §7 and handbook §5 (B14); archive v2.19 |
| v2.19 | 6828 | 19. Explicit non-goals for v1 | A7 (the list, verbatim, with the D-172 amendments); the E-stage status paragraph: archive v2.19 |
| v2.19 | 6871 | 20. Decision register and handoff procedure | Items 2, 6, 7 and 18 in B6.4, B4.3, B4.2, B7.4; item 9 in B1.4; the rest: archive v2.19 |
| v2.19 | 6873 | 20.1 Design decisions already fixed for v1 | Items 2, 6, 7 and 18 in B6.4, B4.3, B4.2, B7.4; item 9 in B1.4; the rest: archive v2.19 |
| v2.19 | 6903 | 20.2 Remaining designer decisions | A8 (verbatim, with the decisions that settled items) |
| v2.19 | 6917 | 20.3 Handoff procedure | Superseded by the stage prompt of `docs/statecraft/README.md` (B14); archive v2.19 |
| v2.19 | 6932 | 21. Glossary | Part D (with D-117, D-118 and D-122 where they changed a meaning) |
| v2.13 | 2607 | 12.1 Deterministic decision model | B9.3 (the model rules and the priority list, verbatim; to be replaced in S8); the M6 mapping: archive v2.13 |
| v2.13 | 2639 | 12.2 AI information and reproducibility | B9.4 (verbatim) |
| v2.13 | 2664 | 12.3 Initial action set | C9; archive v2.13 |
| v2.13 | 2678 | 13. Presentation and mobile UX | C10; superseded by M11, M16 and D-112; archive v2.13 |
| v2.13 | 2688 | 13.1 Map | C10; superseded by M11, M16 and D-112; archive v2.13 |
| v2.13 | 2700 | 13.2 Charts | C10; superseded by M11, M16 and D-112; archive v2.13 |
| v2.13 | 2706 | 13.3 Screens | C10; superseded by M11, M16 and D-112; archive v2.13 |
| v2.13 | 2732 | 13.4 Mobile readability | B10.2 (verbatim) |
| v2.13 | 2740 | 13.5 Data flow and snapshots | B10.3 (the boundary rules, verbatim; snapshots become views in S2c, D-172) |
| v2.13 | 2763 | 14. Technical architecture and persistence | B4.4 (the layout, verbatim); commands in `AGENTS.md` §5 |
| v2.13 | 2765 | 14.1 Monorepo layout | B4.4 (the layout, verbatim); commands in `AGENTS.md` §5 |
| v2.13 | 2792 | 14.2 Worker technology selection | B4.4 (one thread, D-163); archive v2.13 |
| v2.13 | 2815 | 14.3 Thread protocol | B10.4 (verbatim; the migration item amended by D-013) |
| v2.13 | 2842 | 14.4 Performance targets | B12.2 (verbatim; the 8 ms tick target superseded by program §4.5) |
| v2.13 | 2875 | 14.5 State management | B10.5 (verbatim) |
| v2.13 | 2886 | 14.6 Save system | B11.1 (verbatim) |
| v2.13 | 2914 | 14.7 History and diagnostics | B5.5 (verbatim) |
| v2.13 | 2920 | 15. Historical data and calibration | C1; superseded by the M11 and P2 data; archive v2.13 |
| v2.13 | 2922 | 15.1 Dataset deliverables | C1; superseded by the M11 and P2 data; archive v2.13 |
| v2.13 | 2952 | 15.2 Calibration philosophy | B8.1 (verbatim) |
| v2.13 | 2984 | 15.3 Provisional aggregate targets | C2 (calibration status); archive v2.13 |
| v2.13 | 3006 | 15.4 Employment-structure calibration | B8.2 (the definition, verbatim; D-167) |
| v2.13 | 3020 | 15.5 Data validation | B5.4 (verbatim) |
| v2.13 | 3041 | 16. Determinism, invariants, and test strategy | B4.3 (verbatim) |
| v2.13 | 3043 | 16.1 Randomness | B4.3 (verbatim) |
| v2.13 | 3053 | 16.2 Mandatory tests | B12.3 (verbatim, with D-172 decision 2 and the test tiers) |
| v2.13 | 3080 | 16.3 Numeric safety | B4.5 (verbatim) |
| v2.13 | 3089 | 16.4 Conservation equations | B6.1 (verbatim) |
| v2.13 | 3115 | 16.5 Benchmark fixtures | B12.4 (the rule, verbatim; the fixtures to be replaced in S3) |
| v2.13 | 3129 | 17. Build order and milestone acceptance criteria | Superseded by handbook §5 and `AGENTS.md` §7 (B14) |
