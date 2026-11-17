# P7 completion report — Labour market, wages, social mobility, urbanisation

**Branches:** P7 steps 1–4 and the performance stages D-157 to D-163 on `main` (to `9fc2514`); the
close on `p7/close` from `9fc2514` (local commits only; nothing pushed or merged).
**Decisions:** D-154 (simulation and 1900 data), D-155 (test memory, legacy removal), D-156 (phone),
D-157 to D-163 (performance), D-164 to D-168 (the close). **Plan:** `docs/P7_PLAN.md` (approved by
the designer; Q1–Q23 as recorded in its §0; the fibre good taken back into P7 by the designer's
task of 2026-11-15).
**Versions at the close:** world schema 36, simulation 0.32.0, data `m3-economy-v16`, worker
protocol 25, map bridge protocol 5 (schema 35 and protocol 24 until step 6, D-169).
**Status:** P7 implemented. Its acceptance tests pass; the ten-year run (Q22) completes without a
failed day but shows a world in which almost every lower-stratum household falls below subsistence
within five years and the population falls by 8.4 % (§4.2). The designer removed the
agricultural-share criterion on 2026-11-16 (D-167). The open items are consolidated in §7.

## 1. Commits

| Commit | Content |
|---|---|
| `361f671` … `a591579` | The plan, its revision, approval (Q1–Q23) |
| `342e7d0` | Step 1: 1900 labour sources (occupations, wages, minimum-wage coverage) |
| `139d5e3` | Step 2: labour market, wages, mobility and urbanisation in the simulation (schema 35) |
| `3337039`, `24a8db7` | Step 3: 1900 occupations, day-1 labour market, new employers (data v15); fixes |
| `3b88ccd` | D-155: test-suite memory cut 3×; legacy worlds, paths and old saves removed |
| `4bec918` | Step 4: the labour market on the phone (protocol 24, map bridge 5, D-156) |
| `8e26f4a` … `9fc2514` | D-157 to D-163: the 1900-world day 2.7× faster; no worker threads |
| `21e6abf` | Close step 1 (D-164): decision index, map atlas, stale build outputs |
| `8cac864` | Close step 2 (D-165): the day-53 failure fixed at its causes; one lot rule; simulation 0.32.0 |
| `9effa1c` | Close step 3 (D-166): the fibre good (flax, hemp and jute), data v16 |
| `9cdff3a` | Close step 4 (D-167): stale pins and expectations restated; agricultural-share criterion removed |
| `4ffe3c9` | Close step 5 (D-168): this report, the ten-year run, status lines |
| `71a3036` | Close step 6 (D-169): mobility by country, the minimum-wage estimate on Politics; schema 36, protocol 25 |
| `5671b2f` | Close step 7 (D-170): P7b save storage, chunked values over IndexedDB and SQLite |
| step 8 commit | Close step 8 (D-171): the M11d dispute resolutions restored to the map scripts |

## 2. Files

**Created (main ones)**
- Simulation: `economy/labourMarket.ts`, `labourInit.ts`, `labourLaws.ts`, `labourState.ts`,
  `mobility.ts`, `reclassify.ts`, `buildingJobs.ts`, `apportion.ts`, `land.ts`,
  `migrationResult.ts`, `lotQuantity.ts` (D-165).
- Worker: `sim-worker/src/labourSnapshot.ts`. App: `components/Labour.tsx`.
- Generator: `scripts/p7/` (`build-labour-1900.mjs`, `labour-build.mjs`, `labour.mjs`,
  `occupations.mjs`, `province-shares.mjs`, `report.mjs`, `sources-author.mjs`,
  `playtest-labour.mjs`).
- Data: `historical/p7/` (sources, professions, labour, politics, employment, populations,
  demography); good 60 bast fibre with its farms and mills in `historical/p5b/` (D-166).
- Documents: `docs/P7_BEFORE_AFTER.md`, `P7_LABOUR_PROVENANCE.md`, `P7_OCCUPATIONS_1900.md`, the
  three step-3 proposals, this report.
- Tests: `economy/labour-market`, `labour-institutions`, `labour-household`,
  `labour-urbanisation`, `building-job-mix`, `lot-and-servant-residue` (D-165);
  `data/p7-incomes-1900`, `p7-p2b-balance-1900`, `p7-professionals-1900`,
  `p7-province-placement-1900`; `worker/labour-snapshot`; `determinism/canonical-digest`,
  `perf-hash-equality`.

**Modified (main ones):** the day pipeline (`economy/day.ts`), settlement, fiscal, training,
education, military, construction, market, mint and trade (D-165); the P5b catalogue and
placement (D-166); the Population, Labor, Politics and province screens; the decision index
script (D-164).

## 3. Behaviour

1. **Professions and the 1900 occupations.** Sixteen professions with roles, entry rules,
   settlement (urban or rural) and gates (literacy, training, capital). Blocks are split by
   profession from sourced 1900 occupation shares; buildings and institutions carry job slots by
   profession and owners.
2. **Wages (plan §4.1–§4.2).** A reference wage per customs territory and profession, moved
   monthly by unemployment and vacancies (asymmetric), with a price term; provincial
   differentials with a population-weighted mean of 1; the peasant alternative income as a floor
   for rural work; day 0 reproduces every province's P2b wage.
3. **Hiring and layoffs (§4.3).** A staffing ceiling per building follows revenue over the wage
   bill; subsistence work is exempt; institutions hire funding ÷ wage.
4. **Minimum wage (§4.5).** A statutory floor with coverage by law (farm employees, domestic
   service), compliance from administration quality, and a short-run estimate (covered workers,
   jobs at risk, compliance) on the Labor screen.
5. **Mobility (§5).** On the first civil day of a month people change profession under wage and
   vacancy pressure through the gates, move between provinces toward jobs and housing, and blocks
   are created or retired; people, literate persons, cash and dwellings are conserved.
6. **Urbanisation (§6).** Movers settle by the job's settlement; a province's urban share follows
   its counts; housing enters the migration decision.
7. **The fibre good (D-166).** Good 60 (flax, hemp and jute) with fibre farms and bast mills
   placed from 1900 sources; cotton is 0.893 and wool 0.403 of their 1900 supply at the generator.
8. **Phone (844 × 390, tokens, 44-point controls).** Population screen profession groups and
   "Mobility this month"; Labor screen wages, unemployment and the minimum-wage estimate;
   province panel labour rows; the map's labour lenses.

## 4. Measurements (desktop and Node; no device result is claimed)

### 4.1 The day

Ryzen 5 2600, 7.9 GB, Windows 11 Pro 10.0.26200, Node 24.22.1, `--max-old-space-size=4096`, quiet
machine, medians of 3 (D-166, the last build that changed results):
- perfPhases `2 12` ordinary day 928.8 ms; `0 32` month mean 1,082.3 ms; worst day 4,167 ms (day
  31). The A11a guard (≤ 1,600, ≤ 1,800, ≤ 5,500 ms) holds. Against D-161's build measured on the
  same day (D-165): +0.5 % on the ordinary day.
- perfBench `52` host step 1,358 ms; `scratch/throughput.mjs 30` 0.922 days/s.
- Web playtest at 844 × 390 (`scripts/p7/playtest-labour.mjs`): 29/29 checks, 31 s to February.

### 4.2 The ten-year run (Q22)

The 1900 world (seed 20261023, default player, no player actions, country AI on, summary detail)
from 1 January 1900 to 1 January 1910 (3,652 days), simulation 0.32.0, data v16, a checkpoint save
each year (`packages/bench/scratch/longrun.mjs`, untracked; 4,508 s). **No day failed.** Figures
on 1 January of each year; rates are of the labour force; "below subsistence" is the share of
lower-stratum persons whose smoothed income does not buy the committed basket at smoothed prices.

| 1 January | Population (M) | Births / deaths per 1,000 in the year before | Agricultural share | Unemployment | Urban share | Lower stratum below subsistence | Laborers: labour force (M), unemployment | Peasants (M) | Cotton ÷ 1900 crop | Grain / produce price | Produce stock (days) | Moved profession / province in the last month (M) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1900 | 1,584.1 | – | 62.3 % | 2.6 % | 16.6 % | 0.1 % | 128.5, 3.9 % | 198.6 | – | 1.00 / 1.00 | – | – |
| 1901 | 1,581.1 | 39.0 / 40.9 | 62.5 % | 8.8 % | 19.1 % | 77.4 % | 130.2, 14.5 % | 181.6 | 0.81 | 0.66 / 0.64 | 36 | 6.21 / 2.83 |
| 1902 | 1,551.5 | 34.0 / 52.8 | 62.5 % | 14.7 % | 22.4 % | 92.8 % | 140.7, 24.5 % | 164.2 | 0.51 | 0.63 / 0.63 | 758 | 6.88 / 4.33 |
| 1903 | 1,528.0 | 35.2 / 50.3 | 59.4 % | 16.1 % | 25.4 % | 95.0 % | 151.8, 22.6 % | 149.4 | 0.45 | 0.63 / 0.63 | 1,490 | 6.19 / 4.60 |
| 1904 | 1,512.2 | 37.4 / 47.7 | 56.6 % | 17.0 % | 27.5 % | 97.5 % | 162.7, 22.1 % | 138.0 | 0.47 | 0.64 / 0.63 | 3,318 | 5.47 / 4.31 |
| 1905 | 1,501.0 | 39.5 / 47.0 | 54.8 % | 18.7 % | 29.1 % | 99.3 % | 172.5, 24.2 % | 128.6 | 0.45 | 0.72 / 0.63 | 18,067 | 4.98 / 4.13 |
| 1906 | 1,491.5 | 39.6 / 45.9 | 53.0 % | 19.9 % | 30.3 % | 99.0 % | 181.4, 25.2 % | 120.2 | 0.42 | 0.69 / 0.63 | 15,168 | 4.28 / 3.47 |
| 1907 | 1,483.3 | 41.0 / 46.4 | 51.4 % | 21.2 % | 31.3 % | 98.9 % | 189.9, 26.9 % | 112.0 | 0.42 | 1.00 / 0.63 | 3,836 | 4.14 / 2.99 |
| 1908 | 1,475.3 | 42.1 / 47.5 | 50.1 % | 22.6 % | 32.0 % | 99.1 % | 198.1, 28.8 % | 103.9 | 0.47 | 0.80 / 0.63 | 3,655 | 3.98 / 3.08 |
| 1909 | 1,463.9 | 41.5 / 49.2 | 48.9 % | 23.9 % | 32.8 % | 99.1 % | 205.7, 30.8 % | 95.9 | 0.37 | 0.95 / 0.63 | 4,375 | 3.66 / 2.78 |
| 1910 | 1,451.5 | not recorded | 47.9 % | 25.2 % | 33.5 % | 99.0 % | 212.3, 33.0 % | 88.3 | 0.36 | 0.69 / 0.63 | 65,425 | 3.42 / 3.13 |

The yearly demographic record of 1909 is written on the first tick of 1910, after the last
checkpoint; the population still fell by 12.4 M that year. Population is conserved through every
move: the annual records' births − deaths equal the change in population in every year (migration
and reclassification add 0.00 M).

What the run shows:
- **Mortality.** Deaths exceed births from 1900 on and rise from 40.9 to 52.8 per thousand in
  1901. Life expectancy in 1908 (1900 in brackets): United States 23.5 (38.6), Germany 22.7
  (32.1), Russia 11.9 (17.4), Mexico 7.7; the British Empire 14.0 (10.2, the 1900 Indian famine
  in its first year).
- **Incomes, not food supply.** Food is plentiful: grain production is 1.5–2.2 times
  consumption, produce sits at its price floor (0.632 of the 1900 price) from 1902 with stocks of
  thousands of days, and household produce purchases fall to a small fraction of output. The
  lower stratum's incomes do not buy the committed basket: 77 % below subsistence after one year,
  99 % from 1905.
- **Labour.** Unemployment rises from 2.6 % to 25.2 %: peasants leave the land (198.6 M → 88.3 M)
  and laborers grow from 128.5 M to 212.3 M with a third unemployed. The Harris–Todaro gap at the
  start (peasant 174 against laborer 1,273 RUSD a year) drives the outflow; clerks (58 %
  unemployed in 1910) and bureaucrats (labour force 4.7 M → 30.5 M, 35 % unemployed) over-enter.
- **Industry.** Textile output falls from about 2.5 M units a day in 1900 to 8 thousand, and mill
  wool use from 309 thousand to 2 thousand kg a day; cotton falls from 0.81 to 0.36 of the 1900
  crop. The fall in household purchases reaches the mills.
- **Urbanisation** rises from 16.6 % to 33.5 %, with the movers above.

The causes are not yet diagnosed. The likely chain (to verify) is: the wage gap moves peasants into
wage work faster than jobs open; unemployed workers have little or no income (relief and sharing within
families are small or absent); their demand falls; buildings' revenue falls and their staffing ceilings with it.
This is the first item of §7.

## 5. Commands and results

| Command | Result |
|---|---|
| `pnpm test` (close step 4, `9cdff3a`; step 5 changes documents only) | see §5.1 |
| `pnpm typecheck`, `pnpm lint`, `pnpm audit:branding`, `pnpm audit:monetary`, `pnpm check:sim-deps`, `pnpm check:worker`, `pnpm map:atlas:check` | pass |
| `pnpm bench` | PASS (M1, M2, stress thresholds satisfied) |
| `pnpm app:export`, `node scripts/p7/playtest-labour.mjs` ×3 (D-166) | web, iOS and Android exported; 29/29 each |
| perfPhases, perfBench, throughput (D-166) | §4.1 |
| `node --max-old-space-size=4096 scratch/longrun.mjs 10 <dir>` (packages/bench) | 3,652 days, no failure (§4.2) |
| `node scripts/docs/decisions-index.mjs --check` | current |

### 5.1 Final test run

`pnpm test` on `9cdff3a` (close step 4; 6,077 s): **114 of 114 suites, 1,483 of 1,483 tests
passed.** It is the first run of this stage with no failure: the stale pins and expectations that
had failed since D-154/D-155 were restated with the designer's approval (D-167), the P5b cotton
test passes with the fibre good (D-166), and the 1900 world runs its first 60 days, day 53
included, without a failure (D-165).

## 6. Open items, assumptions and deviations

### 6.1 For the designer

1. **The long run (§4.2).** The labour market moves people into wage work that the economy does
   not employ, and the unemployed have no income; within five years the lower stratum is below
   subsistence and the population falls. This blocks any use of the 1900 world beyond a few
   months and should be diagnosed before P8 builds on it.
2. **The agricultural-share criterion** was removed on 2026-11-16 (D-167); the plan, the
   program and the GDD stage table say so.
3. **The first week of the US market (D-167).** Ten imported goods have no sellable supply in the
   first week and rise at the 5 % daily bound; livestock and grain drift from balance.

### 6.2 Assumptions and limitations (provisional unless stated)

- The labour-market coefficients (wage adjustment speeds, mobility pressure, gates, compliance
  exponent) are provisional, as recorded in `economy/constants.ts`; none is fitted to a series.
- The fibre farms' output per hectare is the land model's, not 1900 yields; coverage gaps for flax
  in Germany, Italy, Sweden and Japan, hemp in the United States, Japan and China, and China's
  ramie (D-166).
- The ten-year run is one seed and one player; no player actions.

### 6.3 Not done

- No device test and no tablet playtest; device performance is the designer's.
- No twenty-five-year run (Q22 option (b), on request).

## 7. Unresolved items at the close of P7 (consolidated, 2026-11-16)

### 7.1 Acceptance criteria

| Criterion (plan §1 item 7, §12) | Status |
|---|---|
| Unemployment lowers wages | Met: `economy/labour-market.test.ts` and `labour-institutions.test.ts` (§7 second fixture) pass |
| People conserved through mobility, block creation and retirement | Met: the reclassification and urbanisation suites pass; the ten-year run conserves population in every year |
| Determinism and replay | Met: `determinism/` suites pass; the 1900-world pins of `perf-hash-equality` pass through day 60 |
| Save round trip | Met: schema 35 encode → decode → identical hash |
| The P5b cotton test (cotton 0.85–1.15 of the 1900 crop at the generator) | Met with the fibre good (D-166): 0.893 |
| Minimum wage with costs (§4.5) | Met at fixture scale (§12 item 9 tests pass) |
| Agricultural share falls in a growing no-input economy | **Removed by the designer** (D-167) |
| A plausible ten-year 1900 world (Q22 reports, no threshold) | **Not met in substance**: §4.2 |

### 7.2 Carry-overs from P6 (plan §9.3)

| Carry-over | Outcome |
|---|---|
| Cotton 1.45× | Resolved at the generator (0.893, D-166); in the long run the simulated crop falls to 0.36 as textile demand collapses |
| Blocks without covered jobs | Institution slots and service jobs exist; 17.7 % of clerks are unemployed on day 0 and 58 % in 1910 |
| Poor countries' lower classes below subsistence | 0.1 % on day 0; 77 % after one year and 99 % from 1905 (§4.2) |
| 1900 food gluts | Worse in the long run: produce at its floor from 1902, stocks of thousands of days |
| Estimated 1900 incomes | Replaced by the labour market's wages (D-154) |
| No long run | Done (§4.2) |
| Migration ignores housing | Done (plan §6.3) |

### 7.3 Calibration and data

- Russia's and Italy's cotton mills: 61 Russian and 13 Italian mills unplaced by the bast-fibre
  cut (D-166).
- The US market out of balance in the first week (D-167).
- Labour-market coefficients provisional (§6.2).

### 7.4 Moves to later stages

- **Before P8:** diagnose and fix the long-run collapse (§6.1 item 1); a ten-year run should end
  with the lower stratum mostly above subsistence and deaths below births in growing countries.
- **P7b:** done in this close (D-170): saves of any size on web; the device test is the designer's.
- **Map pipeline:** the scripts reproduce the committed map (D-171); regenerating the outputs to
  repair their mis-encoded names waits for the designer.
- **P8:** the transport wedge will move farm-gate prices; it needs a stable 1900 world to measure.
- **P10:** firm investment and closure (the staffing ceilings respond today only through revenue).
- **P11:** household credit and relief through banks.
