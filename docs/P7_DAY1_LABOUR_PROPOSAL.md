# P7 step 3 — the 1900 day-1 labour market: proposal to the designer

**Status:** proposal, 2026-11-09, for decision. Nothing is committed: the affected calibration,
the 1900-world hash re-pin and the step-3 commit wait for your answer (§7).
**Measured with:** the step-3 working tree. A temporary, env-gated hook in
`scripts/p7/build-labour-1900.mjs` (and one in `scripts/p5b/placement.mjs` recording the
workforce cap per building) dumped the placed 1900 world; analysis scripts applied each option's
rules to that same world. Both hooks are reverted (`node scripts/p5b/build-goods-1900.mjs --check`
passes on the unchanged tree). Scripts, hook patch and full outputs are kept in the git-ignored
`.cache-p7/proto/` (`proto.mjs`, `proto2.mjs`, `out*.md`). The baseline reproduces the generator
exactly (455.29 M eligible, 224.71 M employed, 50.6 %).
**Not measured:** anything in the simulation. Day-1 numbers are the generator's rule (own
province, full staffing, posts = budget ÷ wage); no test, benchmark or long run was executed.

---

## 1. Diagnosis (measured)

**1.1 The covered economy can pay only part of the census workforce at sourced wages.**
Placement sizes each building so its wage bill is the sector labour share of its value added;
covered value added is 48 % of world GDP (P6). Model job slots against Webb 1911 p.428 workers:

| Territory | Agriculture | Mining, manufacturing, building | Trade, transport | Public, professions | Others | All | Census workers (M) | Model eligible (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| USA | 0.52 | 0.52 | 0.33 | 0.33 | 0.10 | 0.40 | 29.3 | 20.2 |
| United Kingdom | 0.95 | 0.21 | 0.33 | 0.20 | 0.17 | 0.32 | 18.3 | 10.4 |
| Germany | 0.39 | 0.32 | 0.24 | 0.22 | 0.21 | 0.32 | 28.1 | 15.3 |
| France | 0.35 | 0.19 | 0.36 | 0.16 | 0.20 | 0.27 | 19.7 | 10.6 |
| Italy | 0.30 | 0.28 | 0.25 | 0.23 | 0.11 | 0.28 | 16.3 | 9.0 |
| Austria-Hungary | 0.33 | 0.55 | 0.36 | 0.32 | 0.08 | 0.36 | 22.2 | 14.7 |

(jobs ÷ census workers by sector; Russia's 1897 census omits most peasant family workers.)
The shortfall is spread over every sector, so it is a scope gap, not a missing building: the US
covered sector produces about 13,900 RUSD of value added per job against 11,400 RUSD of GDP per
census worker, i.e. realistic productivity on 47 % of GDP. At sourced wages it pays ~40 % of the
census workforce.

**1.2 Eligibility is 55–69 % of the census workforce** (participation 0.4–0.6 × working-age
share 0.568, from P6). Webb p.439 (Germany 1907) gives workers per person of 0.56 in
agriculture, 0.43 industry, 0.42 trade and commerce, 0.51 professions (0.49 overall); the model
has 0.23–0.34.

**1.3 The day-1 rule then employs half the eligible** because the P6 income estimate paid every
eligible worker while production pays only the labour share as wages (the rest is profit to
owners). Total measured income stays near the estimate; its distribution moves to owners.

**1.4 Defects found in the step-3 tree** (independent of the option chosen):

| # | Defect | Measured effect |
|---|---|---|
| D1 | `splitPopulation` does not keep province totals | 11.0 M persons moved between provinces; 660 provinces change by more than 1 %, one by +131 % (silently alters the P4 province calibration) |
| D2 | The 95 % workforce cap, now fed with small census professions (literacy-gated clerks above all), cuts the level of *every* building employing a capped profession, laborers included | cap factor China ×7.8 (P6 ×1.4), Brazil ×7.5, Russia ×2.5, Germany ×1.8; technique rises by the same factor |
| D3 | Peasant buildings in territories without peasants, family-farm farmer jobs in territories without farmers | USA 2.38 M unfillable peasant slots; Russia 3.0 M unfillable farmer slots on peasant-owned ranches and fisheries |
| D4 | Clerks and academics keep the old blocks' literacy (other literacy-gated professions get 0.98) | clerks eligible 5.77 M → 8.35 M with the fix |
| D5 | Clerk job shares were sized for P6's clerk catch-all (10.8 % of the world; census clerks are 1.7 %) | 14.0 M clerk slots for 8.4 M eligible clerks once D2 is removed |
| D6 | Institution split by census wage bill | US health share of administration 62 %; training budget at its cap in USA, GBR, DEU, AUT; teachers get 175 M RUSD of the US 1,657 M education budget |
| D7 | Unfilled slots on day 1 | 19.9 % of placed value added would not be produced (clerks 6.6 %, attendants 5.5 %, laborers 5.0 %, farmers 2.6 %) |
| D8 | Capitalist-owned buildings pay 36 % of value added as wages (sourced: 0.58 non-farm, census of manufactures 1900; 0.50 farm) | food processing 0.11, textiles 0.22, mining 0.37, manufacturing 0.46, services 0.42 (D2 and the scaled P2b producers raised technique) |

**Conclusion.** No option employs the census workforce at sourced wages inside an economy that
covers 48 % of GDP. One of four things must give: the scope of the modelled labour market, the
occupations, the wages, or the size of the covered economy. Under the approved wage rule a 50 %
unemployment rate lowers wages 2 % a month with no floor where there are no peasants (USA, UK),
so the 1900 world cannot start there.

---

## 2. Options

| Option | Mechanism | Data needed | Day-1 effect (measured) | Calibration effect | Risks | Verdict |
|---|---|---|---|---|---|---|
| **A** Owners out, self-employed share work | Capitalists and aristocrats are outside the labour force (property income). Peasants, farmers, shopkeepers are employed in their own businesses where their province has one (Q9 work-sharing extended to owner-operators); their income is the residual | none | world 50.6 % → 26.3 %; peasants 40.9 % → 1.6 %, farmers 57 % → 18 %, shopkeepers 92 % → 61 % (no workshop in their province) | none on output; self-employed income unchanged in total | wage professions still 39–64 % | **adopt** (necessary, not sufficient) |
| **B** Conserving by-job split | Inside each territory, iterative proportional fitting keeps province totals *and* census profession totals; wage, institution and self-employed professions seeded by where their jobs are | none | world 26.3 % → 21.3 %; employment +22 M; output lost 19.9 % → 9.2 % | province totals restored (fixes D1); P4 urban shares per province unchanged; placement inputs (territory and province totals) unchanged | demand of moved blocks re-estimated, not re-placed (one pass) | **adopt** |
| **C** Restore the sourced labour share (levels up, technique down, output kept) in owner buildings, within the 95 % cap | raises wage jobs to wages ÷ value added = 0.58 / 0.50 | sourced rows exist | uncovered share 33.8 % → 28.8 %; output lost 11.7 % → 15.0 % (jobs land in provinces without people) | capitalist profits fall toward the sourced share; more upkeep and maintenance goods | output loss until placement stops concentrating buildings in four provinces | **later**, with a placement de-concentration step |
| **D** Uncovered share (modelled-economy participation) | Per province × profession, s = 1 − job capacity ÷ ((1 − u*) × census eligible), ≥ 0; the labour market's eligible = census eligible × (1 − s). The uncovered workers work in sectors the model does not simulate (housing, government beyond its budgets, private professions, domestic service beyond personal services) and earn nothing in it, as the uncovered GDP does not exist in it | u* (frictional rate) | wage-profession unemployment ≈ u* by construction; the measured content is s, the vacancies and the incomes (§4) | none on incomes or output: the uncovered were already without wages | s must be explained in the UI; uncovered workers cannot take new jobs unless s may fall (R6) | **adopt** as the interim scope |
| **E** Occupations follow jobs | Census workers beyond job capacity relabelled as self-employed | none | u ≈ u*; **388 M persons change profession** (USA 25 M, China 90 M, India 71 M) | census shares lost; shopkeepers and peasants swollen | Harris–Todaro flows out of the swollen self-employed at once | reject |
| **F** Wages clear | Day-1 wage = what the placed value added pays the census workforce | none | US laborers ×0.51, UK ×0.39, Germany ×0.77; engineers ×0.01–0.23; attendants China ×0.07 | contradicts every sourced wage row | — | reject |
| **G** Model the uncovered sectors as employers | Housing services and rent, government services at GDP scale, private professions, domestic service paid by households and the treasury | 1900 rent, domestic-service and public-employment series | the real fix | P6 demand (rent was taken out), fiscal base, coverage | P9–P11 housing and a public-sector stage, not P7 | **later**; D is the placeholder it replaces |
| **H** Frictional target | u* sets day-1 unemployment where people exceed jobs | US 1900 5.0 % (Lebergott, HSUS 1975 D 85-86), UK trade-union 2.5 % (Board of Trade) — **both to verify on the page** (the cached HSUS PDF has no text layer and no renderer is installed here) | — | — | — | part of D, provisional 0.04 |

**Workforce cap (D2) and clerks (D4, D5), all with A + B + D:**

| Variant | Wage slots (M) | Employed (M) | Uncovered share of wage-profession eligible | Output lost to unfilled slots |
|---|---:|---:|---:|---:|
| S0 step-3 tree as generated (no A, B, D) | 113.5 | 229.7 | – (u 54.3 %) | 19.9 % |
| S1 cap as now | 113.5 | 354.9 | 45.0 % | 9.2 % |
| S2 S1 + clerk/academic literacy 0.98 + institution posts ≤ labour force | 106.9 | 356.9 | 45.7 % | 8.5 % |
| S3 S2, cap removed (shortages become vacancies) | 182.7 | 382.6 | 31.5 % | 16.4 % |
| S4 S2, cap from ungated professions only | 130.2 | 374.8 | 35.5 % | 11.3 % |
| S5 S4 + farm jobs follow the territory's farm profession (D3) | 127.3 | 374.9 | 35.5 % | 11.1 % |
| **S6 S5 + clerk job share × 0.575 (to laborers, or attendants in services)** | **127.3** | **377.8** | **33.8 %** | **11.7 %** |
| S7 S6 + labour share restored (option C) | 146.0 | 387.4 | 28.8 % | 15.0 % |

(Employed includes the self-employed sharing work. S0's 229.7 M differs from the generator's
224.7 M only by the US peasant-to-farmer remap, applied in every variant.)

---

## 3. Recommendation: S6 (A + B + D + cap and clerk fixes + institution policy)

| # | Change | Where | Mechanism and data | Status |
|---|---|---|---|---|
| R1 | Owners outside the labour force | sim (counts) | professions with `owns-capital` or `owns-land` are not in eligible, unemployed or vacancy counts; their income is distributed profit; the UI shows them as "owners" | design |
| R2 | Self-employed work-sharing | sim (allocation, settlement) | a self-employed profession's eligible are all employed where the province has a building with its jobs (Q9 extended to owner-operators); jobs in a building owned by the same profession carry **no wage obligation** (income is the residual; their wage only splits income, plan §4.1) — measured residual ÷ notional wage is below 1 for US farmers (0.85), German shopkeepers (0.46), Chinese peasants (0.55), so an obligation would drain their buildings' cash | design |
| R3 | Conserving by-job split | generator | IPF inside each territory; province totals and census profession totals both kept; seeds = job capacity (persons it needs) + 2 % by settlement weight; owners keep their province split | fixes D1 |
| R4 | Uncovered share s | sim state + generator | `World.labourMarket.provinces[].uncoveredShare[professionId]` (as `differential[]`), set by the generator: s = max(0, 1 − capacity ÷ ((1 − u*) × eligible)), s = 1 where the province has no job of the profession (wage professions) or no building of it (self-employed); eligible = floor(working-age × participation × (1 − s) [× literacy]); validated in [0, 1]; serialised; snapshot shows "outside the modelled economy" | provisional interim scope (replaced by option G) |
| R5 | Frictional rate u* = 0.04 | generator only (initial condition) | between the UK 2.5 % and US 5.0 % of 1900 (to verify on the pages); not read by the simulation | provisional |
| R6 | s may only fall, by hiring | sim (monthly, after the refresh) | vacancies of a profession in a province left after the unemployed are filled take workers from its uncovered share (s falls: the modelled economy absorbs workers from the unmodelled one, a dual-economy transfer); layoffs go to unemployment, never back to s, so unemployment stays real; no fixed per-tick increment | design, provisional |
| R7 | Workforce cap from ungated professions only; gated shortages are vacancies | `placement.mjs` step 5 | the cap factor of a building is the largest over its jobs of professions without a literacy or training gate (fixes D2); a clerk shortage shows as clerk vacancies and a wage premium, not as fewer laborer jobs | design |
| R8 | Literacy 0.98 for clerks and academics; clerk job share × 0.575; farm-job variants | `labour-build.mjs` remap + 3–4 catalogue variants | as `LITERATE_PROFESSION_LITERACY` for the other gated professions (D4); clerk workers per throughput unit scaled to the census clerks, the rest to laborers (attendants in services), workers per throughput unit kept (D5); in territories without peasants the three peasant buildings, and without farmers the family farms, use a variant whose self-employed jobs are the territory's farm profession, same recipe (precedent: `commercial-farm-peasant`) (D3) | provisional factor |
| R9 | Institution policy | `labour-build.mjs` + sim | budgets split by function shares, not wage bills: health 6 % of administration, research 8 % and training 6 % of education (**placeholders**, to be sourced: HSUS ch. Y state and local spending by function 1902; Report of the Commissioner of Education 1899–1900, higher education); posts spread over provinces by the profession's people; posts ≤ the country's modelled labour force of the profession (budget not spent stays with the treasury, reported); medic wage from HSUS D 756 (health-service employees, 256 USD, 1901: ratio 0.59 to the laborer); academics keep the clerical ratio until a professor salary is transcribed | placeholders flagged |
| R10 | Participation unchanged (problem 5) | — | Webb p.439 would raise eligible ×1.69 (455 M → 771 M); under R4 that only enlarges s, and fed into the P6 estimate it raises demand ×1.68 (P5b/P6 calibration broken). Record the census ratios as the target for option G | deferred |

Not changed: the wage rule (Q6), the hiring rule (Q8), mobility (Q10), the one-pass income
decision (Q18), output, prices and placement totals.

---

## 4. Expected day-1 numbers under S6 (measured with the generator prototype)

Day-1 unemployment of wage professions is the initial condition u* where people exceed jobs and
lower where jobs exceed people; the measured content is the labour force, the uncovered share,
the vacancies and the incomes.

### 4.1 World, by profession

| Profession | Census eligible (M) | Job capacity (M) | Modelled labour force (M) | Employed (M) | Uncovered (M) | Out of labour force (M) | Unemployment | Vacancies |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| peasants | 231.39 | 140.35 | 230.08 | 230.08 | 1.31 | – | 0.0 % | – |
| farmers | 22.83 | 15.21 | 21.60 | 21.60 | 1.23 | – | 0.0 % | – |
| laborers | 114.24 | 88.22 | 81.03 | 78.86 | 33.20 | – | 2.7 % | 10.6 % |
| attendants | 29.68 | 18.27 | 16.91 | 16.45 | 12.77 | – | 2.7 % | 9.9 % |
| shopkeepers | 24.74 | 1.97 | 11.45 | 11.45 | 13.29 | – | 0.0 % | – |
| clerks | 8.35 | 8.02 | 6.71 | 6.60 | 1.64 | – | 1.6 % | 17.7 % |
| engineers | 2.09 | 0.19 | 0.20 | 0.19 | 1.90 | – | 4.1 % | 1.0 % |
| teachers | 7.34 | 6.13 | 6.38 | 6.13 | 0.96 | – | 4.0 % | 0.0 % |
| medics | 2.21 | 1.79 | 1.87 | 1.79 | 0.34 | – | 4.0 % | 0.0 % |
| academics | 9.59 | 0.39 | 0.41 | 0.39 | 9.18 | – | 4.2 % | 0.0 % |
| bureaucrats | 4.87 | 4.30 | 4.48 | 4.30 | 0.39 | – | 4.0 % | 0.0 % |
| capitalists | 2.71 | – | – | – | – | 2.71 | – | – |
| aristocrats | 1.68 | – | – | – | – | 1.68 | – | – |
| **all** | 461.71 | | 381.12 | 377.84 | 76.20 | 4.39 | **0.9 %** | |

(Step 3 as generated: 455.29 M eligible, 224.71 M employed, 50.6 %. Census eligible rises to
461.71 M with the literacy fix. Shopkeepers' self-employment is the workshop: 13.3 M live in
provinces with none, e.g. all of China's 4.55 M and India's 3.76 M, and are uncovered.
Academics are 96 % uncovered: lawyers, writers, artists and interim clergy are private
professions the model does not simulate.)

### 4.2 Main countries

| Territory | Census eligible (M) | Modelled LF (M) | Employed (M) | Unemployment, all | Unemployment, wage professions | Uncovered share of wage-profession eligible | Measured income, RUSD/person/yr (step 3 → S6) | P6 estimate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| USA | 20.19 | 13.72 | 13.52 | 1.5 % | 2.9 % | 47.2 % | 1647 → 2085 | 2075 |
| United Kingdom | 10.44 | 6.32 | 6.20 | 1.9 % | 2.7 % | 47.7 % | 1398 → 1607 | 1557 |
| Germany | 15.32 | 12.04 | 11.92 | 1.0 % | 2.0 % | 33.0 % | 825 → 860 | 801 |
| France | 10.63 | 6.40 | 6.35 | 0.8 % | 1.7 % | 51.1 % | 614 → 647 | 736 |
| Russia | 39.46 | 33.36 | 33.13 | 0.7 % | 2.5 % | 37.7 % | 61 → 82 | 51 |
| Italy | 9.11 | 7.81 | 7.70 | 1.5 % | 3.8 % | 28.2 % | 417 → 440 | 359 |
| Austria-Hungary | 14.71 | 12.82 | 12.72 | 0.8 % | 2.1 % | 25.9 % | 445 → 455 | 397 |
| Japan | 12.67 | 11.43 | 11.30 | 1.2 % | 3.2 % | 20.6 % | 180 → 188 | 157 |
| China | 120.24 | 102.44 | 101.74 | 0.7 % | 2.8 % | 33.3 % | 70 → 74 | 41 |
| India (British) | 86.90 | 74.58 | 73.83 | 1.0 % | 3.5 % | 26.9 % | 35 → 43 | 40 |
| Spain | 5.18 | 3.83 | 3.81 | 0.7 % | 1.9 % | 46.2 % | 216 → 234 | 261 |
| Brazil | 5.25 | 4.83 | 4.80 | 0.7 % | 2.7 % | 23.1 % | 91 → 122 | 33 |

Measured income = day-1 wages + owner profits at day-1 staffing (the generator's rule: value
added at staffing − hired wages − upkeep, at least 0), buildings and posts only; the step-3
column is the generator's report, S6 the prototype (which reproduces the generator to within
2 % except in the USA, where it already applies the peasant-to-farmer remap). World mean,
prototype: 272 (S0) → 300 (S6) RUSD a person a year.

### 4.3 Unemployment / vacancies (%) by wage profession, with the first-month wage change

Approved rule Δln W = 0.10·max(0, v − u) − 0.04·max(0, u − v), no price change.

| Territory | laborers | attendants | clerks | engineers | teachers | medics | academics | bureaucrats |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| USA | 3/7 (+0.4) | 0/24 (+2.4) | 4/0 (−0.2) | 4/1 (−0.1) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| UK | 4/0 (−0.2) | 0/20 (+2.0) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | – | 4/0 (−0.2) | 4/0 (−0.2) |
| Germany | 2/16 (+1.4) | 1/13 (+1.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| France | 2/17 (+1.5) | 0/53 (+5.3) | 0/36 (+3.6) | 4/1 (−0.1) | 4/0 (−0.2) | 4/0 (−0.2) | 5/0 (−0.2) | 4/0 (−0.2) |
| Russia | 1/32 (+3.1) | 4/0 (−0.2) | 3/6 (+0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| Italy | 4/0 (−0.2) | 4/0 (−0.2) | 0/20 (+2.0) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| Austria-Hungary | 2/8 (+0.6) | 0/20 (+2.0) | 1/17 (+1.6) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| Japan | 3/2 (0.0) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| China | 3/3 (+0.1) | 4/0 (−0.2) | 0/24 (+2.4) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| India | 4/5 (+0.2) | 4/0 (−0.2) | 0/11 (+1.1) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |
| Spain | 3/30 (+2.8) | 0/10 (+1.0) | 0/37 (+3.7) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 5/0 (−0.2) | 4/0 (−0.2) |
| Brazil | 2/15 (+1.3) | 4/0 (−0.2) | 0/65 (+6.5) | 5/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) | 4/0 (−0.2) |

(UK medics: the 1901 table has no medicine row; they sit in academics. To fix in R8.)

### 4.4 Self-employed (M: census eligible / sharing work / uncovered)

| Territory | Peasants | Farmers | Shopkeepers | Owners out of LF |
|---|---:|---:|---:|---:|
| USA | – | 5.22 / 5.22 / 0.00 | 1.51 / 1.50 / 0.01 | 0.20 |
| UK | – | 0.86 / 0.85 / 0.01 | 1.18 / 1.16 / 0.03 | 0.16 |
| Germany | 1.33 / 1.32 / 0.00 | 2.89 / 2.85 / 0.04 | 1.86 / 1.84 / 0.02 | 0.25 |
| France | 1.24 / 1.24 / 0.00 | 2.27 / 1.46 / 0.80 | 1.14 / 0.82 / 0.32 | 0.13 |
| Russia | 22.07 / 22.00 / 0.07 | – | 2.12 / 2.10 / 0.02 | 0.40 |
| China | 76.32 / 76.31 / 0.00 | 1.48 / 1.48 / 0.00 | 4.55 / 0.00 / 4.55 | 0.96 |
| India | 53.61 / 53.61 / 0.00 | – | 3.76 / 0.00 / 3.76 | 0.86 |

(Measured under S1's split; S6 differs only in the farm-job variants.)

---

## 5. What remains under S6

1. **Vacancies where jobs exceed local people** (§4.3): laborers in Russia (32 %), Spain (30 %),
   France and Germany (16–17 %); attendants and clerks in France, Brazil, Spain. Causes: placement
   puts each definition in at most four provinces per territory, and building levels have a
   minimum of 1. Wages rise 1–6.5 % in the first month there and mobility fills the gap; the
   alternative is option C with a placement step that spreads levels by the professions' people.
2. **Output lost to unfilled slots: 11.7 %** of placed value added on day 1 (step 3: 19.9 %):
   laborers 3.8 %, attendants 3.1 %, farmers 2.9 %, peasants 1.2 %, clerks 0.4 %. Prices start
   above the P5b solution where that bites; it is reported per good in the before/after.
3. **Unspent institution budgets:** posts ≤ labour force leaves 7.1 bn RUSD a year unspent
   (USA 3.97 bn, China 0.93 bn, Germany 0.59 bn): the census counts few officials (US "government
   officials" 86,600, Webb p.443) against budgets that in 1900 also paid police, postal and
   public-works staff. Options: keep it with the treasury (reported); open administration posts
   to clerks and laborers in the census public-sector mix; or transcribe 1900 public employment
   (HSUS ch. Y). Recommended: the first now, the third as a source task.
4. **Drift at u\*:** with u = 4 % and v = 0, the approved rule lowers a wage 0.16 % a month
   (1.9 % a year). An optional natural-rate term (u − u\* in place of u) would make u\* wage-neutral;
   it changes approved Q6, so it is a question (Q-f), not part of S6.
5. **Placeholders:** R9's function shares, R5's u\*, R8's 0.575; the HSUS and Board of Trade
   unemployment figures are to be verified on the page.

---

## 6. The five problems, answered

1. **51 % unemployment:** a scope gap (§1.1) plus the cap artefact (D2) and province mismatch
   (D1). S6 gives wage professions 1.7–3.8 % by country with an explicit uncovered share of
   21–51 % of their census workers; wages no longer fall 2 % a month; mobility no longer pushes
   people into peasant farms on day 1.
2. **Professions without slots:** owners leave the labour force (R1); shopkeepers and farmers
   share their businesses (R2); engineers and academics are 91–96 % uncovered (modern-industry
   and private-profession work the 1900 catalogue does not employ); teachers fall to 4 % with the
   institution policy; clerks are fixed by literacy and the job share (R8).
3. **Own-province mismatch:** the conserving split (R3) places wage workers where their jobs
   are and restores province totals.
4. **Institution budgets:** function shares instead of wage bills (R9); health 62 % → 6 % of US
   administration; the training cap no longer binds; medics priced from HSUS D 756.
5. **Participation:** re-deriving from Webb p.439 raises eligible ×1.69 and, through the P6
   estimate, demand ×1.68. Under S6 it would only enlarge the uncovered share. Deferred (R10).

---

## 7. Decisions requested

| # | Question | Recommendation |
|---|---|---|
| Q-a | Adopt S6 (R1–R10) as the step-3 day-1 labour market? | yes |
| Q-b | The uncovered share as the interim scope (R4), falling only by hiring (R6), until option G models those sectors? | yes |
| Q-c | u\* = 0.04 for all territories (or per country from sources once verified)? | 0.04 now |
| Q-d | Workforce cap from ungated professions only (R7), accepting 11.7 % day-1 output loss over S2's 8.5 % with 45.7 % uncovered? | yes |
| Q-e | Unspent administration budgets stay with the treasury, reported (§5.3)? | yes |
| Q-f | Add the natural-rate term to the wage rule (changes approved Q6)? | no for P7; revisit after the long run |
| Q-g | Option C (restore the sourced labour share) as a follow-up together with placement de-concentration? | yes, after P7 |
| Q-h | Participation from Webb p.439 deferred to option G (R10)? | yes |

---

## 8. The occupation distribution (added after review: "there should be farmers in Russia")

**8.1 What is wrong.**

1. **Peasants vs farmers is not sourced anywhere.** `splitAgriculture` gives farmers a share of
   the agricultural owner-operators that rises with GDP per head from 0 at 600 RUSD to 1 at
   3,000 RUSD (log scale), a P7 provisional rule. The GDP per head it reads is P2b's *nominal*
   value (Maddison ratio × US GDP per head × price level), which compresses poor countries:
   Russia 141 RUSD against Italy 957 (6.8×; Maddison's real ratio is about 1.4×). So Russia,
   India, Brazil and the Cape get no farmers at all, China 1.1 %, Japan 6.7 %; the USA, Britain,
   Switzerland and Australia get no peasants. The same nominal scale drives the farm-employee
   rule and the regression that sets the shares of every territory without a census.
2. **Farm employees are sourced for 3 of 16 census territories** (Britain, USA, Russia); the
   other 13 use a GDP rule. The US "agricultural labourers" (4.41 M, Webb p.443) include family
   members working on the home farm, to be split with the Twelfth Census occupations report.
3. **Farm jobs are thin against farm people** (placed agricultural slots ÷ census agricultural
   workers): USA owners 4.07 M slots for 5.85 M, labourers 1.44 M for 4.51 M; Germany 2.67 M
   for 6.16 M and 1.18 M for 3.63 M; France 2.03 for 5.25 and 0.88 for 2.98; India farm
   labourers 1.42 M for 13.25 M; Russia matches (14.5 M for 15.3 M, 2.76 M for 2.72 M). Food is
   fully modelled, so this is not a scope gap: placement prices farm jobs at the manufacturing
   laborer wage, while the sourced 1900 farm wage (HSUS D 779-793, already a source row) is
   247 ÷ 435 = 0.57 of it.
4. **Slots and people disagree on the farm profession:** Russia has 3.48 M farmer slots
   (family farms) and no farmers; the USA 2.38 M peasant slots and no peasants (D3).

**8.2 Measured effect** (same prototype; S8 replaces S6's farm-job variants):

| Variant | Wage slots (M) | Employed (M) | Uncovered (M) | Uncovered share of wage eligible | Output lost |
|---|---:|---:|---:|---:|---:|
| S6 (recommended above) | 127.3 | 377.8 | 76.2 | 33.8 % | 11.7 % |
| S8 = S6, census farm owners split into peasants and farmers in the ratio of the placed farm jobs | 127.3 | 378.3 | 75.8 | 33.8 % | 11.1 % |
| S9 = S8 + farm jobs sized at the sourced farm wage (levels × 1.76, technique ÷ 1.76, output kept, within the 95 % cap) | 134.7 | 383.0 | 71.4 | 31.3 % | 14.0 % |

The split fixes matching (unfillable farmer slots in Russia, peasant slots in the USA, output
loss −0.6 points) but hardly moves the totals: peasants and farmers are both self-employed and
share work under R2. The size of the gap sits with the wage professions (laborers 114 M
eligible for 88 M slots, attendants 30 for 18, shopkeepers and academics without employers),
and its largest lever stays the labour share of capitalist buildings (S7, −9 M uncovered:
textiles pay 0.22 of value added, food processing 0.11, against the sourced 0.58). The farm
wage (S9) is worth −4.4 M, but the simulation pays one laborer wage per province, so it needs
either initial provincial differentials from the farm share of each province's laborer jobs
(approved mechanism, no new state) or a farm-job wage factor (a simulation change).

**8.3 Proposed correction.**

- **Real, not nominal, GDP per head** (the Maddison ratio r) in every occupation proxy: the
  farm-employee rule, the farmer rule and the share regression.
- **Peasants vs farmers from holding sizes where sourced:** Webb 1911 pp.362-367 has holdings
  by size for Germany (1895: under 2 ha 3.24 M, 2-5 ha 1.02 M, 5-100 ha 1.28 M, 100 ha and
  over 25,000 of 5.56 M holdings), Britain, Ireland, Belgium, the Netherlands, the USA,
  Australia and New Zealand (to transcribe from the page images; the cached text layer garbles
  the tables). Rule (provisional): holdings of 5-100 ha are farmers, 2-5 ha peasants, 100 ha
  and over estates; under 2 ha are labourers' plots, counted where the census puts their
  holders. **Russia** needs its own source: the 1905 land census (*Statistika zemlevladeniia
  1905 g.*, Central Statistical Committee, public domain) or the zemstvo household groupings
  by sown area. Elsewhere, the S8 rule (the placed farm jobs) replaces the GDP rule.
- **Farm employees** from census status tables where they exist (Germany 1907 and 1895
  Berufszählung, France 1901, Austria 1900, Italy 1901), the US home-farm split from the
  Twelfth Census, the GDP rule (on real GDP) only as a fallback.
- **Farm wage** as initial provincial differentials (approved mechanism), sourced from D 779-793.

**If approved, step 3 then does:** R3, R7, R8, R9 in the generators; R1, R2, R4, R6 in the
simulation (schema 35 amended or bumped to 36, your choice: 35 is not on `main`); tests for
conservation of persons through s, the work-sharing rule, the uncovered share's serialization
and validation; regenerated data and the before/after report; the scenario-path tests; the
1900-world hash after you review the new before/after; then the full test run and the step-3
commit. The fibre-good test stays failing and is listed as unmet.
