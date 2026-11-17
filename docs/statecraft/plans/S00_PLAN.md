# S0 — Approval and the design bible: stage plan

**Stage:** S0 (Act I, `docs/statecraft/ACT_1_GROUND.md`).
**Branch:** `statecraft/s0-design-bible`, from `main` at `105c3bb`.
**Status:** plan written 2026-11-17; **waiting for the designer's answers** (§8). No file other
than this plan has changed.

## 0. Answers

*(To be recorded here when the designer answers §8.)*

---

## 1. Orientation (handbook §5 step 1)

- Read: `AGENTS.md`; `docs/statecraft/README.md`; `HANDBOOK.md` (all); `CONTRACTS.md` (intro,
  §1 headings, §14); the S0 brief and the Act I introduction; program §1 to §5 and §14 to §18;
  the whole of `Fabric_of_Nations_GDD.md` by section, and the lost sections of
  `docs/archive/gdd/Century_GDD_v2.13.md` (finding F1).
- Repository: `main` at `105c3bb`, clean except the untracked `packages/bench/scratch/` (left
  alone). `p7/close` is merged into `main`.
- **Brief step 1 passes.** `git log` shows D-170 (`5671b2f`) and D-171 (`28c622c`, `105c3bb`);
  `node scripts/docs/decisions-index.mjs --check` prints "DECISIONS.md index is current (171
  decisions)". The next free number is **D-172**.
- Files the brief names, all present: `Fabric_of_Nations_GDD.md` (6,992 lines, v2.19 of
  2026-11-02), `docs/archive/gdd/` (already holds the 18 editions v2 to v2.17),
  `scripts/m13/branding-audit.mjs`, `scripts/m14/monetary-terminology-audit.mjs`,
  `scripts/docs/decisions-index.mjs`, `docs/PROSPERITY_PROGRAM.md`, `README.md`,
  `docs/statecraft/README.md`. `docs/statecraft/plans/` and `reports/` did not exist; this
  plan creates the first.

### What reads the GDD (brief step 5)

Nothing in `packages/tests` or `scripts` parses GDD headings. Three files read the GDD's text:

| Reader | What it requires of `Fabric_of_Nations_GDD.md` |
|---|---|
| `scripts/m13/branding-audit.mjs` | First line matches `/FABRIC OF NATIONS/i`; no former name of the game except the allowed historical patterns |
| `packages/tests/src/architecture/naming-audits.test.ts` | First line contains `FABRIC OF NATIONS` (case-sensitive); text contains `Reference US Dollars` and `not a currency issued by any country` |
| `scripts/m14/monetary-terminology-audit.mjs` | Text contains ``RUSD` — **Reference US Dollars**``, `not a currency issued by any country`, `not defined as one real US`; no former unit name outside allowed patterns |

Both audits treat everything under `docs/archive/` as historical, so archived text keeps its
original wording and passes.

---

## 2. What S0 builds, and what it does not

**Builds (documents only):**

1. Decision entry **D-172 (statecraft S0) — The Statecraft Program approved**, as the brief
   specifies, and the index regenerated.
2. A new `Fabric_of_Nations_GDD.md`, **the design bible**: Part A the game, Part B binding
   doctrine, Part C one short section per system, Part D glossary, and (proposed, Q6) Part E a
   concordance from every old section number to its new place. Target: about 1,000 to 1,200
   lines, against 6,992.
3. The old GDD archived verbatim (proposal: the whole v2.19 edition as one file, Q2).
4. The documents that point to the GDD brought up to date: `docs/PROSPERITY_PROGRAM.md`,
   `README.md`, `docs/archive/README.md`, `docs/statecraft/README.md`, and the GDD section
   numbers cited in the Statecraft documents (list in F9).
5. The completion report `docs/statecraft/reports/S00_REPORT.md`, with the full "old section →
   where it went" table, and a second decision entry for the bible (Q12).

**Does not:** change any file under `packages/`; change any rule while moving it; describe a
planned system as implemented; delete any historical text; start S1.

---

## 3. What I found that differs from the brief

**F1. About 530 lines of binding GDD text were lost in v2.14 and never restored.** In the
current file, `## 12. Country AI` is followed directly by the §17 status and milestone tables and
then `### 17.1`. The body of §12 (§12.1 to §12.3), all of §13 (presentation and mobile UX), §14
(technical architecture and persistence), §15 (historical data and calibration), §16
(determinism, invariants, test strategy) and the §17 heading with its preamble are missing. The
archived editions show when: v2.13 has them (lines 2598 to 3192 of `Century_GDD_v2.13.md`),
v2.14 (the E5 edition) and every later edition do not, and no other heading differs between the
two. The edit that recorded E5 replaced v2.13's lines from the §12 status paragraph to the §17
status paragraph with the updated §17 tables. Nothing in `DECISIONS.md` records the loss, and
decisions and code still cite these sections as binding (D-009 and `bench.ts` cite §14.4;
`rng.ts`, `economy/constants.ts` and D-006 cite §16.1; `ai.ts` cites §12.1; D-047 cites §14.7). The rules they contain include keyed randomness (§16.1), numeric safety (§16.3), the
conservation equations (§16.4), the save rules (§14.6), the calibration philosophy (§15.2), data
validation (§15.5), AI information rules (§12.2) and mobile readability (§13.4). → Q1.

**F2. The "stage tables of §12" in the brief are the §17 tables** that the v2.14 edit left under
the §12 heading. They are records and move with §17 to §17J.

**F3. Binding rules live inside the range the brief calls implementation records.** Moving
§17 to §17J only to the archive would drop: §17A.2 (authority rules, implementation-truth
labels), §17A.3 (the eleven Economic Management principles), §17H.1 (sovereignty against
military control, CEN-AUDIT-016), §17I.1 (dependencies are territories of their sovereign, never
countries), §17I.8 (landscape on every device, D-112), §17J.1 (the peacetime objective), §17J.2
(the eight binding foundational rules D-116 to D-124), §17J.4 (rollback) and §17J.6 (Node figures
are diagnostics). I propose to copy each into Part A or B, with its source, and still archive
the original in place.

**F4. The brief's Part B list leaves out rules the bible needs.** It names §2, §3.1 to §3.3,
§4.1, §5.1 and §8.1. Binding rules also sit in §3.4 (cadence until S2), §4.3 (allocation never
by array or id order), §4.4 (month and year boundaries), §5.6 (static/runtime split), §8.7
(finance invariants), §20.1 (decisions fixed for v1), the lost §12.2, §13.4, §13.5, §14.3, §14.5,
§14.6, §14.7, §15.2, §15.4, §15.5, §16.1 to §16.5, and the F3 list. The full disposition is §4.

**F5. GDD §4.2 (the mandatory daily pipeline, binding by §20.1 #7) was last updated at P1b**
(D-125, D-126). It does not list the phases P4 to P7 added (demography by cause, land and
harvests, Engel demand, the labour month, mobility). The code's order in
`packages/sim/src/economy/day.ts` `runEconomicDay` is the real order. → Q5.

**F6. Code cites old GDD section numbers, and `packages/` must not change.** 29 citations in 17
files, for example `rng.ts` "GDD §16.1", `calendar.ts` "GDD §3.1", `types.ts` "GDD §5.2",
`economy/types.ts` "GDD §5.5" and "§10.1", `day.ts` "GDD §4.2", `labourMarket.ts`
"GDD §17A.12.3", `construction.ts` "GDD §17A.16", `bench.ts` "GDD §14.4". → Q6.

**F7. The glossary (§21) contradicts later decisions.** Its RUSD entry says RUSD is not "a
promise of constant purchasing power"; D-122 and `AGENTS.md` §1 define one RUSD as the
purchasing power of one 1990 US dollar. "Market", "Pop block" and "Country-region ownership"
are defined on regions, which D-117 and D-118 replaced with provinces. → Q3.

**F8. The approved program changes §19's non-goals without naming them.** §19 says its list
holds "unless the designer changes this section explicitly". The program assigns three of them to
stages: religion and culture (S13, decision 8), detailed naval warfare (S21), nuclear weapons
(Act VII, `ACT_7_LATER_ERAS.md`). It also reverses §20.2 #4's default of "a baseline event set"
(program §2.5: no scripted history; decision 7: History setting "Plausible"). → Q3.

**F9. Current documents cite GDD section numbers that will move.** `HANDBOOK.md` (§3.4),
`STATECRAFT_PROGRAM.md` (§1.2, §3.4, §6.6, §17H, §17H.7), `ACT_1_GROUND.md` (the S0 brief
itself), `ACT_4_NATIONS.md` (§9.4), `ACT_6_TOTAL_WAR.md` (§17H), `ACT_7_LATER_ERAS.md` (§6.6),
`PROSPERITY_PROGRAM.md` (§2, §6.6, §17J), and the Statecraft README's "Do not read the GDD's
implementation records (§17 onward)". `docs/archive/README.md` also needs a row for the new
archived edition; the brief does not list it.

**F10. Order of the brief's steps.** The brief writes D-172 (its step 2) before the outline is
approved (its step 3). Your instruction and handbook §5 say no change before the plan is
approved, so I will write D-172 as the first commit after your answers.

**F11. `AGENTS.md` §1 will be stale after S0** in two phrases: the GDD "defines … milestone
acceptance criteria" (after S0 acceptance criteria live in the stage briefs), and "the program
applies until its stage S0 revises the GDD". → Q13.

---

## 4. The design bible: outline and "old section → where it goes"

### 4.1 Rules for moving text

- **Verbatim with a source tag.** A binding rule is copied word for word and tagged with its
  origin, e.g. *(GDD v2.19 §2.1)* or *(GDD v2.13 §16.1)*. American spellings in old rules stay as
  written; new connecting text follows the handbook (British spelling, plain words).
- **Amendments are shown, not applied silently.** Where a named decision changed a rule, the old
  rule's current form is stated with the decision beneath it: "*Amended by D-118: provinces
  replace regions.*" No rule is amended in S0 that a decision has not already amended.
- **Status words** from the old "Document purpose": binding rule, current implementation,
  provisional model, future system; Part C adds the Statecraft stage that will build it.
- **Nothing is deleted.** Every old section is in the archive (§4.4), and the concordance names
  where its binding content now lives.

### 4.2 Outline

**Front matter.** Title line unchanged (`# FABRIC OF NATIONS — GRAND STRATEGY 1900–2000`, which
the audits require). Version 3.0, date, status. Authority: `AGENTS.md`, then the designer's
instruction, then the Statecraft Program and its briefs, then this document, then the archived
records (handbook §2). The four kinds of requirement. How to read it; where the archive is.

**Part A — The game**
- A1 Vision (GDD §1.1; the three sentences of handbook §1 / program §2)
- A2 The six design pillars (§1.2, verbatim)
- A3 Pillars of play (program §2.2)
- A4 Product definition (§1.3, with D-118 provinces, D-112 landscape, the cadence note)
- A5 The loop (§1.4 diagnose–choose–implement–observe; program §2.3 five time scales)
- A6 The peacetime objective (§17J.1)
- A7 Non-goals (§19 and program §2.5; amendments per Q3)
- A8 Open design choices and their defaults (§20.2, with the decisions that settled some)

**Part B — Binding doctrine**
- B1 No-Mana (§2.1 to §2.3, unchanged)
- B2 Calendar, speeds and clocks (§3.1 to §3.3; §4.4 boundary rules)
- B3 Cadence (§3.4 and program §4; Q4)
- B4 The simulation boundary, determinism and numeric safety (§4.1; v2.13 §16.1, §16.3; one
  thread D-163; the daily-order rule of §20.1 #7, Q5)
- B5 State, data and history (§5.1, §5.6; §17J.2 rules 1 to 3; v2.13 §14.7, §15.5; CONTRACTS §14)
- B6 Integrity and conservation (§17J.2 rule 4 and §17J.4; §4.3 allocation rules; §8.7; v2.13
  §16.4)
- B7 Money and accounting (the RUSD definition from §5.2, with the three phrases the audits
  require; §8.1 principles; §17J.2 rule 6; §20.1 #4, #5, #18)
- B8 Historical data and calibration (v2.13 §15.2, §15.4; §17J.2 rules 5 and 8; the designer's
  rule that initial buildings follow sourced output or workers; provenance)
- B9 Player, AI and authority (§17A.2 authority rules; §17A.3 principles; v2.13 §12.1 model
  rules and §12.2 information rules; program decision 6)
- B10 Interface and the worker boundary (`AGENTS.md` §2; v2.13 §13.4, §13.5, §14.3, §14.5;
  §17I.8 / D-112; the program's change from snapshots to views from S2c)
- B11 Saves and versions (v2.13 §14.6; §17J.2 rule 7; D-013 and no legacy saves)
- B12 Performance, measurement and tests (v2.13 §14.4, §16.2, §16.5; §17J.6; program decisions
  2 and test tiers; program §4.5 budget; device testing belongs to the designer)
- B13 Sovereignty, control and dependencies (§11.5, §17H.1, §17I.1; D-118 province control)
- B14 How work is done (§18 and §20.3 are superseded by `AGENTS.md` §7, handbook §5 and the
  Statecraft README; a pointer only)

**Part C — Systems.** One short section each, in the same form: *Today* (what is implemented,
by which milestone or stage and decision), *Next* (the Statecraft stage), *Specification* (the
brief, the archived section, the code entry point). Systems: C1 world and map (Q7), C2
population and demography, C3 economy (production, goods, markets, prices, labour), C4 money,
accounting and public finance, C5 politics and institutions, C6 technology and education, C7
diplomacy, C8 war, C9 country AI, C10 interface, C11 news. Each states only what the code and
reports show; a planned system is labelled planned.

**Part D — Glossary.** GDD §21 merged with handbook §10. Entries changed by a decision show the
current meaning and name the decision (Q3).

**Part E — Concordance** (Q6). Every old section number (v2.19, plus the v2.13 sections of F1)
→ its new place, or "archived only", or "superseded by D-NNN".

### 4.3 Old section → where it goes

Key: **A**/**B**/**C**/**D** = carried into that part of the bible (and kept in the archive);
**R** = record, archived verbatim only; **S** = superseded by the named decision, archived, and
named in the bible.

| Old section (v2.19) | Lines | Goes to |
|---|---:|---|
| Title block (lines 1 to 11) | 11 | Front matter, updated: version 3.0, date, status |
| Name note, alignment notes v2.5 to v2.19, M5 to M7 addenda (13 to 376) | 364 | R |
| Document purpose and authority | 25 | Front matter: the four kinds kept; the precedence list S by handbook §2 (D-172) |
| Contents | 28 | Replaced |
| §1.1 Vision; §1.2 Design pillars | 17 | A1, A2 verbatim |
| §1.3 Product definition | 10 | A4; "~500 regions" S by D-118; cadence line points to B3 |
| §1.4 Economic management objective | 30 | A5 (the loop); the closing cross-references R |
| §2 No-Mana (§2.1 to §2.3) | 33 | B1 verbatim |
| §3.1 to §3.3 Calendar, speeds, clocks | 33 | B2 verbatim |
| §3.4 Evaluation cadence | 26 | B3 (binding until S2, then program §4; Q4) |
| §4.1 Pure simulation boundary | 8 | B4 verbatim |
| §4.2 Mandatory daily pipeline | 172 | The rule to B4 (Q5); the step list, price placement and whole-day staging R; staging S by D-116 |
| §4.3 Scarcity and allocation | 30 | B6: the four kinds of demand and the no-implicit-order rule; the provisional tier list to C3; M3 status R |
| §4.4 Month and year boundaries | 9 | B2 (the rules); "Current M3f…" R |
| §5.1 General rules | 10 | B5 verbatim |
| §5.2 Core primitive types | 29 | RUSD definition to B7 verbatim; type list R |
| §5.3 Static definitions; §5.4 Runtime state; §5.4.1 to §5.4.6; §5.5 Minimum contracts | 1,086 | R (the M-era data model; D-117, D-118 superseded parts; the code and CONTRACTS §14 are current); C2 to C9 point here |
| §5.6 Static/runtime split and serialization | 10 | B5 |
| §6.1 to §6.8 Population, needs, mobility | 200 | C2 summary; binding sentences to B6 (employment never above workforce); §6.6 S by D-124; rest R |
| §7.1 to §7.8 Production, goods, markets, prices | 218 | C3 summary; §7.4 S by D-119; rest R |
| §8 introduction | 11 | R |
| §8.1 Accounting principles | 50 | B7 (the principles and the last paragraph); the "current baseline" paragraphs R |
| §8.2 to §8.6 Accounts, revenue, expenditure, debt, prices and currency | 197 | C4 summary; R |
| §8.7 Finance invariants | 37 | B6 |
| §9 Politics and institutions | 51 | C5; R |
| §10 Technology and education | 32 | C6; R |
| §11.1 to §11.4 Diplomacy, military, combat, termination | 26 | C7, C8; R |
| §11.5 Occupation and territorial change | 15 | B13 |
| §12 heading and status paragraph | 3 | C9 |
| §17 status and milestone tables (under the §12 heading, F2) | 61 | R |
| §17.1 to §17.5 M3 to M7, intermediate stages, dependency plan, E roadmap | 535 | R |
| §17A heading and §17A.1 Product goal and core loop | 41 | R (duplicates §1.4, which goes to A5) |
| §17A.2 Implementation-truth labels and authority | 31 | B9 (authority rules); labels to the front matter |
| §17A.3 Design principles | 32 | B9 verbatim |
| §17A.4 to §17A.16 E0 specification | 973 | R; C3, C4 point to the parts still unbuilt and their Statecraft stages |
| §17A.17 to §17A.20 E1 to E4 records | 651 | R |
| §17B to §17G M7a, M8, M9, E5, E6a, E6b records | 1,018 | R |
| §17H M10 record | 136 | §17H.1 to B13; rest R |
| §17I M11 record and addenda | 378 | §17I.1 classification rule to B13; §17I.8 landscape (D-112) to B10; rest R |
| §17J introduction and §17J.1 Objective | 71 | A6 |
| §17J.2 Binding foundational rules | 32 | B5, B6, B7, B8, B11 verbatim (rule by rule) |
| §17J.3 Stages | 22 | R; status of P0 to P7 in Part C; P8 to P15 S by program §5.2 (decision 9, D-172) |
| §17J.4 Rollback mechanism | 8 | B6 |
| §17J.5 Companies and capital markets | 8 | R; S by program §5.2 (S10, S11) |
| §17J.6 Performance | 10 | B12 (the rule); the 2026-11-02 baseline R |
| §18 Code-agent execution contract | 39 | S by `AGENTS.md` §7 and handbook §5 (same rules); pointer in B14 |
| §19 Non-goals | 43 | A7 (Q3); the E-stage status paragraph R |
| §20.1 Decisions fixed for v1 | 30 | Binding items (#2, #4 to #7, #9, #18) to B; the rest R |
| §20.2 Remaining designer decisions | 14 | A8 with the decisions that settled items |
| §20.3 Handoff procedure | 15 | S by the Statecraft README's stage prompt; R |
| §21 Glossary | 61 | D (Q3) |

| Lost section (v2.13, F1) | Lines | Goes to |
|---|---:|---|
| §12.1 Deterministic decision model | 32 | B9 (validated proposals, staggered evaluation, goal persistence); the priority list to C9, S by program §11 in S8; M6 mapping R |
| §12.2 AI information and reproducibility | 25 | B9 verbatim |
| §12.3 Initial action set | 14 | C9; R |
| §13 introduction, §13.1 to §13.3 Map, charts, screens | 54 | C10; S by M11, M16 and D-112; R |
| §13.4 Mobile readability | 8 | B10 verbatim |
| §13.5 Data flow and snapshots | 23 | B10 (the boundary rules; snapshots become views from S2c by D-172) |
| §14.1 Monorepo layout | 27 | B4 (layout); commands are in `AGENTS.md` §5 |
| §14.2 Worker technology selection | 23 | R; one thread (D-163) to B4 |
| §14.3 Thread protocol | 27 | B10 (commands at tick boundaries in stable order); message list R |
| §14.4 Performance targets | 33 | B12 (Q9) |
| §14.5 State management | 11 | B10 |
| §14.6 Save system | 28 | B11 verbatim, with "migration failures" S by D-013 and the no-legacy-saves rule |
| §14.7 History and diagnostics | 6 | B5 |
| §15.1 Dataset deliverables | 30 | R; S by M11 and P2 data (C1) |
| §15.2 Calibration philosophy | 32 | B8 verbatim |
| §15.3 Provisional aggregate targets | 22 | C2 and C3 (calibration status); R |
| §15.4 Employment-structure calibration | 14 | B8 (the definition); the agricultural-share criterion's removal (D-167) named |
| §15.5 Data validation | 21 | B5 verbatim |
| §16.1 Randomness | 10 | B4 verbatim |
| §16.2 Mandatory tests | 27 | B12, amended by program decision 2 and the test tiers (D-172) |
| §16.3 Numeric safety | 9 | B4 verbatim |
| §16.4 Conservation equations | 26 | B6 verbatim |
| §16.5 Benchmark fixtures | 14 | B12 (the rule); the M5/M6 fixtures R |
| §17 heading and preamble | 4 | S by handbook §5 and `AGENTS.md` §7 |

The report will repeat this table at full heading granularity (every `###` heading) with the
line numbers of the archived copy, generated and checked by a scratch script (§6).

### 4.4 The archive

Proposal (Q2): `git mv Fabric_of_Nations_GDD.md docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md`
and write the new file in the same commit, so the archived edition is byte for byte the v2.19
text and keeps its history. The v2.13 sections already exist verbatim in
`docs/archive/gdd/Century_GDD_v2.13.md`; the bible cites them there. `docs/archive/README.md`
gains the edition in its `gdd/` row and a note on F1.

---

## 5. Data model

None. No change to state, save schema, simulation version, data version or worker protocol. No
version constant changes. No file under `packages/` changes.

## 6. Checks and measurements

No code changes, so there is no test to write first and no benchmark to take. Checks per
commit and at close (Q14):

- `pnpm lint`, `pnpm audit:branding`, `pnpm audit:monetary`;
- `node scripts/docs/decisions-index.mjs` then `--check`;
- the naming suite, which reads the GDD:
  `node --max-old-space-size=900 --experimental-vm-modules ./node_modules/jest/bin/jest.js src/architecture/naming-audits.test.ts`
  (from `packages/tests`);
- `git diff --stat main -- packages` is empty;
- `cmp` of the archived edition against `git show main:Fabric_of_Nations_GDD.md`;
- a scratch script (not committed) that lists every heading of v2.19 and of the v2.13 lost
  range and fails if one is missing from the concordance; another that checks every source tag
  in Part B quotes its source verbatim. Their output goes in the report.

Baseline (handbook step 3, after approval): the same checks on `main` before any change.

## 7. Steps (each one commit on the branch)

1. **Record the answers** in §0 of this plan. (This plan is committed first, before the
   answers, as the record of step 2.)
2. **D-172** — the approval entry (brief step 2): the date; the ten decisions of program §18 word
   for word; for each, the GDD rules it amends; the Prosperity stages it supersedes (program
   §5.2); the documents in `docs/statecraft/`. Index regenerated and checked.
3. **Baseline** of §6 on the branch before the GDD changes.
4. **The bible and the archive** in one commit: the move, the new file, `docs/archive/README.md`.
   All §6 checks.
5. **Pointers**: `docs/PROSPERITY_PROGRAM.md` status line with the table of program §5.2;
   `README.md`; the GDD section numbers cited in the Statecraft documents (F9); `AGENTS.md` if Q13
   says so.
6. **Close**: `docs/statecraft/reports/S00_REPORT.md`; the second decision entry (Q12);
   `docs/statecraft/README.md` status table; index regenerated and checked; all §6 checks.

Then I stop and ask before merging or pushing. There is no interface work, so there is nothing to
test on a phone.

---

## 8. Questions

**Q1. The lost sections (F1).** Treat the v2.13 text of §12.1 to §16 as part of "the old GDD" for
S0's acceptance, carry its still-binding rules into Part B and record the loss?
*Recommended: yes.* Otherwise S0 meets its acceptance on paper while keyed randomness, the
conservation equations and the save rules exist nowhere in a current document. If no, those rules
stay only in the archived v2.13 and the code comments citing them point to an archive.

**Q2. Form of the archive.** (a) The whole v2.19 file as one archived edition,
`docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md`, by `git mv` (as the 18 earlier editions are
kept); or (b) the records cut into separate files per milestone under `docs/archive/gdd/records/`.
*Recommended: (a).* It moves without cutting anything, keeps git history, and every citation such
as "GDD §17C" resolves as "GDD v2.19 §17C". (b) is easier to browse but cuts the text at 30
boundaries and keeps the alignment notes and §5 to §11 somewhere else again.

**Q3. Showing amendments that the program and earlier decisions made (F7, F8).** In the bible,
state each rule in its current form and name the decision that changed it, keeping the old wording
in the archive. Specifically: (i) the glossary's RUSD entry follows D-122 and `AGENTS.md` §1;
region-based entries follow D-117 and D-118; (ii) §19's non-goals of religion and culture, naval
warfare and nuclear weapons are marked "amended by D-172: assigned to S13 / S21 / Act VII"; (iii)
§20.2 #4's default is marked amended by program §2.5 and decision 7. D-172 lists these as GDD
rules the approval amends.
*Recommended: yes.* The alternative, copying the old wording and leaving the contradictions, would
put rules in the bible that `AGENTS.md` and the approved program already overrule.

**Q4. Cadence.** The brief says "program §4 replaces GDD §3.4". The handbook (§2) says the
amendments apply from the stage that implements them, and "until S2 lands, the day is still fully
daily". Part B would state: §3.4's table is the binding rule today; program §4 is the approved
replacement, taking effect stage by stage in S2a to S2c, when this section is updated.
*Recommended: yes, both, with the change dated by stage.* Replacing it outright would describe a
weekly economy that does not exist (the brief's own trap: "do not describe a planned system as
implemented").

**Q5. The daily pipeline (F5).** Keep the rule (§4.2's opening sentence and §20.1 #7: one
documented order, changed only with tests and a decision) and name `runEconomicDay` in
`packages/sim/src/economy/day.ts` as the authoritative order until S2a's scheduler replaces it;
archive the step list as last updated at P1b.
*Recommended: yes.* Copying the step list would put a stale order in the bible; writing a new
list from the code is new documentation work that S2a will redo.

**Q6. Part E, the concordance.** Add the old-number-to-new-place table to the bible itself, so the
29 code comments citing "GDD §16.1", "§5.5" and the rest (F6) still lead somewhere, without
touching `packages/`.
*Recommended: yes.* It costs about 150 lines. Without it, those comments name sections that no
longer exist in the current GDD; correcting them belongs to the stages that next touch each file.

**Q7. Part C systems.** The brief lists ten (population, economy, money, politics, technology,
diplomacy, war, country AI, interface, news). Add an eleventh, **world and map** (1,687
provinces, customs territories, the 1900 catalog, HYDE and USGS data, sovereignty and control)?
*Recommended: yes.* M11, P2 and the map pipeline (D-171) have no other home, and S9 and S13 build
on them.

**Q8. Verbatim rules in American spelling.** Old rules keep their original wording, including
"labor", "modeled" and "behavior"; only new text uses British spelling.
*Recommended: yes* (the brief's trap: "do not improve or re-decide rules while moving them").
The alternative is a respelled text that no longer matches its source tag.

**Q9. The mobile targets of v2.13 §14.4** (tick p95 at most 8 ms on the reference device, 60 fps,
cold start under 2.5 s, peak memory under 250 MB, battery at most twice idle at 10 days a
second). The program does not mention them; its §4.5 is a desktop budget of a different measure
(200 ms worst day). Keep them in B12 verbatim as the designer's device targets, all marked not
evaluated, next to the program's desktop budget?
*Recommended: keep the four device targets (60 fps, cold start, memory, battery) and mark the
8 ms tick target as superseded by program §4.5 and decision 1.* An 8 ms tick for the full world
was written for a 16-region world, and the program's day of 200 ms on a desktop is the approved
target. If you prefer, I keep all five unchanged and name the conflict instead.

**Q10. Version and date.** The bible is GDD **v3.0**, dated the day of its commit; the title line
stays as it is (the audits read it). No GDD change report is written: `DECISIONS.md` has replaced
those since D-145.
*Recommended: yes.*

**Q11. Length.** The target is about 1,000 to 1,200 lines, most of it Part B's verbatim rules.
*Recommended: accept this size.* A shorter bible would paraphrase binding rules instead of quoting
them.

**Q12. Decision entries.** D-172 (statecraft S0) records the approval, as the brief says. A
second entry, D-173 (statecraft S0) "The design bible replaces the GDD's records", records the
new structure, the archive, the F1 loss and its restoration, and the Q answers.
*Recommended: two entries.* One combined entry would mix the program's approval with a
documentation finding.

**Q13. `AGENTS.md` §1 (F11).** May I change the two stale phrases: the GDD "defines game
mechanics, simulation behavior, scope" (dropping "and milestone acceptance criteria", which now
live in the stage briefs), and "Where it amends the GDD … the program applies until its stage S0
revises the GDD" (to say that GDD v3.0 records the amendments and their effective stages)?
*Recommended: yes, those two phrases only.* `AGENTS.md` is your file of hard rules, so I will not
touch it without your yes; if no, the report lists the stale phrases.

**Q14. Checks.** Since nothing under `packages/` changes, I propose not to run the full
`pnpm test` (about 100 minutes), `pnpm bench`, `check:worker`, `map:atlas:check` or
`app:export`, and to run the checks of §6 instead.
*Recommended: yes.* The documents are read only by the two audits and the naming suite, which
run. If you want the full suite as a guard anyway, I run it once in the background before the
close.
