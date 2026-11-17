# Statecraft Program — documents for implementing agents

The Statecraft Program is the approved plan for all work on Fabric of Nations after P7
(`docs/STATECRAFT_PROGRAM.md`, approved by the designer on 2026-11-16). This folder is what an
agent needs to implement one stage of it correctly.

## Reading order (every stage, every session)

1. `AGENTS.md` — the hard rules of the project. They always win.
2. `docs/statecraft/HANDBOOK.md` — what the game is, how to decide, the mistakes to avoid, the
   workflow of a stage, how to measure and test. Read all of it.
3. `docs/statecraft/CONTRACTS.md` — the shapes every system shares (scheduler jobs, cohorts,
   views, indicators, forecasts, Desk cards, world events, AI proposals). Read the sections your
   stage's brief names.
4. The brief of your stage, in the act file below. Read the act's introduction and your stage.
5. `docs/STATECRAFT_PROGRAM.md` — the whole plan. Read §2 (the game) and the section of your
   system. The rest is reference.

The GDD (`Fabric_of_Nations_GDD.md`, v3.0 from S0) is the design bible; Part B holds the binding
rules. The implementation records of earlier editions are archived in
`docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md`; read them only when your brief sends you there.
GDD section numbers in the Statecraft documents written before S0 ("GDD §3.4", "GDD §17H") are
those of v2.19; Part E of GDD v3.0 says where each now is.

## Stage briefs

| Act | File | Stages |
|---|---|---|
| I Ground | `ACT_1_GROUND.md` | S0 approval and design bible · S1 stable economy · S2 the Clockwork (S2a, S2b, S2c) · S3 Observatory and test tiers |
| II The game | `ACT_2_GAME.md` | S4 shell · S5 legibility engine · S6 Gazette · S7 ambitions and onboarding · S8 cabinet AI |
| III Growth | `ACT_3_GROWTH.md` | S9 infrastructure · S10 firms · S11 finance · S12 knowledge |
| IV Nations | `ACT_4_NATIONS.md` | S13 heritage and faith · S14 politics · S15 stability and regime change |
| V The Concert | `ACT_5_CONCERT.md` | S16 diplomacy · S17 crises and strategic AI · S18 the road to war |
| VI Total war | `ACT_6_TOTAL_WAR.md` | S19 forces · S20 land war · S21 sea and air · S22 war economy and home front · S23 peace |
| VII Later eras | `ACT_7_LATER_ERAS.md` | S24 to S27 |

The briefs of Acts I and II are detailed, because they come first and everything stands on them.
The briefs of Acts III to VII fix the design, the data model and the traps; each of those stages
still begins with a stage plan that the designer approves (handbook §5).

## Stage status

Update this table in the commit that closes a stage. One line per stage; link the completion report.

| Stage | Status | Branch | Report |
|---|---|---|---|
| S0 | Complete 2026-11-17 (D-172, D-173: GDD v3.0, the design bible); merged into `main` 2026-11-17 | `statecraft/s0-design-bible` | [`reports/S00_REPORT.md`](./reports/S00_REPORT.md) |
| S1 | Not started | — | — |
| S2a | Not started | — | — |
| S2b | Not started | — | — |
| S2c | Not started | — | — |
| S3 | Not started | — | — |
| S4 to S27 | Not started | — | — |

## The prompt to start a stage

The designer can start any stage with this prompt, replacing the two markers:

```text
Implement stage <S-number> of the Statecraft Program.

Read, in this order: AGENTS.md; docs/statecraft/README.md; docs/statecraft/HANDBOOK.md;
docs/statecraft/CONTRACTS.md; the <S-number> brief in docs/statecraft/<act file>.

Follow the handbook's workflow (§5) exactly. Start with step 1 (orientation) and step 2 (the stage
plan with your numbered questions), then stop and wait for my answers. Do not change code before I
approve the plan. Work on a new branch statecraft/<s-number>-<short-name> from main. Commit on the
branch after each step whose checks pass. Ask me before merging or pushing. Never claim device
behaviour or performance: tell me what to test on phones.
```

## If something here is wrong

These documents were written before the code they describe. When a brief, a file path, a function
name, an estimate or a hypothesis does not match what you find, do not work around it silently:
report it in your stage plan, propose the correction, and fix the document in the same stage.
