# P7: the 1900 world by the sixteen professions — sources, rules and result

**Status:** prototype result, 2026-11-09 (second pass, after the designer asked for the whole
working world to be distributed "in the most historically accurate and realistic way").
Nothing is committed, and no committed or step-3 generator, source table or generated file was
changed. The distribution was produced by a scratch copy of the generator with a prototype share
module behind `P7_OCC_PROTO=1`; module, report, dataset and outputs are in the git-ignored
`.cache-p7/occ/` (`occ-proto-v2.mjs`, `occ-report-v2.json`, `occupations_1900_v2.json`,
`out-v2-S6.md`, `out-v2-S8.md`). Wiring it into `scripts/p7/` and regenerating the 1900 data
waits for your go-ahead (§9).
**Not run:** `pnpm test`, `pnpm typecheck`; `pnpm bench`, perfPhases and perfBench skipped
(performance hold). No simulation run: day-1 figures are the generator's placement plus
`.cache-p7/proto/proto2.mjs`, as in `docs/P7_DAY1_LABOUR_PROPOSAL.md`.

---

## 1. Result in brief

World, 1,584.1 M people, persons by profession (millions; dependants follow the earner):

| Peasants | Farmers | Laborers | of which farm hands | Attendants | Shopkeepers | Clerks | Capitalists | Aristocrats | Academics | Teachers | Medics | Engineers | Bureaucrats | Servicemen | Officers | Clergy |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 557.1 | 160.7 | 524.2 | 222.2 | 133.1 | 86.1 | 26.7 | 11.1 | 5.0 | 14.9 | 14.9 | 4.5 | 6.0 | 13.7 | 20.5 | 1.5 | 4.4 |

With the interim placement (servicemen in laborers, officers in bureaucrats, clergy in
academics): laborers 544.7, bureaucrats 15.2, academics 19.2. Step-3 tree today: peasants
679.0, farmers 67.0, laborers 502.8, attendants 130.6, shopkeepers 79.2, clerks 27.1,
capitalists 11.9, aristocrats 7.4, academics 28.6, teachers 21.9, medics 6.6, engineers 6.2,
bureaucrats 15.9.

- **Sourced agrarian structure** for the USA, Britain, Germany, France, Italy, Russia, India,
  Belgium, the Netherlands, Hungary, Canada, Australia and New Zealand. Japan's landlords are
  sourced. Every other territory follows the same rules, fitted on those sources, applied to
  real GDP per head.
- **Status in employment** of industry and trade is sourced for Germany and France (until now
  it was a constant everywhere), and the army and navy are carved out of public service for
  ten census territories.
- **Proxy fit:** leave-one-out error over the 16 census territories is 10.3 % of persons
  misallocated (the step-3 tree's nominal-GDP proxy: 11.4 %).
- **Day 1 (S6):** uncovered 76.2 → 80.1 M, uncovered share of wage-profession eligible 33.8 →
  34.5 %, output lost to unfilled slots 11.7 → 11.9 %, world measured income 300 → 302 RUSD per
  person.
- **Day-1 improvements (§10, prototype):**
  - Movable buildings follow workers inside each territory.
  - The sourced labour share is restored in capitalist and aristocrat buildings.
  - Shopkeepers and own-account professionals are employed in their own establishments.
  - Laborers and attendants are matched to the job mix inside each territory.

  Together (S18) these bring uncovered from 78.4 M to 30.0 M and output lost from 11.3 % to
  5.0 %, and raise world measured income from 304 to 326 RUSD per person. The occupation correction does not close the day-1 gap. Eligible laborers rise from
  114.2 M to 123.3 M, mostly farm hands with no farm jobs to fill (§7).

## 2. Sources

All public-domain works. Every figure used was read on a page image and checked against the
printed totals unless stated otherwise. **PD-IA** = Internet Archive scan with no use
restriction; **Google** = Google-digitized public-domain scan (Google asks for non-commercial use
of its files; the facts are not affected, noted for the record); **PD-US** = US government;
**PD-DLI** = Digital Library of India scan.

| Territory | Source and locator | What was used | Scan |
|---|---|---|---|
| USA | *Occupations at the Twelfth Census* (1904), Table I, p.xxiii (census.gov) | farm labourers 4,410,877, of which members of the family 2,366,149 and hired 1,999,696 | PD-US |
| USA, Germany, Austria, Hungary, Russia, Italy, Switzerland, France, Belgium, Netherlands, Sweden, Norway, UK | Statistisches Jahrbuch für das Deutsche Reich 1909, Internationale Übersichten 9, p.14* | army and navy (USA 126,744; Russia 1,132,723; Germany 651,194; France 597,445; Austria 229,037; Hungary 132,336; Italy 204,012; UK 203,993; Sweden 38,847; Belgium 33,400; Netherlands 19,622; Norway 6,053; Switzerland 2,292); cross-check of Webb p.428 | PD-IA |
| Germany | Jahrbuch 1909 p.10 (Berufszählung 1907, status a/b/c); Jahrbuch 1910 pp.30-31 (farm census 1907 by holding size: heads, family, hired), p.63 (establishments by size), pp.64-65 (family helpers) | §3 R1, R3, R4 | PD-IA |
| France | Annuaire statistique 1905, pp.170-171 (census 1901: chefs, employés et ouvriers, isolés; establishments by employees) | §3 R2, R4 | PD-IA |
| Italy | *Censimento della popolazione del Regno d'Italia al 10 febbraio 1901*, p.7 (Classe I, persons aged 9 and over): owner-cultivators 2,583,490; emphyteutic holders 50,348; cash tenants 691,844; sharecroppers 2,010,050; bound farm hands 1,023,576; day labourers 2,828,846; shepherds 247,835; total 9,611,003 | §3 R2 | Google |
| Russia | *Voenno-konskaia perepis' 1899-1901* (horse census, 44 guberniias), pp.xi-xii: commune households with horses 7,271,159 (1 horse 3,282,771; 2: 2,175,327; 3: 951,437; 4: 432,860; 5: 196,422; more 232,342); horseless 28.7 %; non-commune owners 480,669 (1-4 horses 395,292; 5 and more 85,377) | §3 R5 | PD-IA |
| India | *Census of India 1901*, vol. I, Report, Subsidiary Table V, p.230 | farm servants 2,496,352, field labourers 17,632,463, tea-garden labourers 639,125 of 88,347,718 in agriculture | PD-DLI |
| Japan | *Japan Year Book* 1907, p.321: farming households 1904 5,414,632 of 8,411,536; land tilled by owners 50 % of paddy, 61 % of upland. *Japan Year Book* 1928, p.491: landowners of 10 cho and over 50,062 (1926) against 5,555,157 farm families | §3 R6; tenure not used for the split (no household counts) | PD-IA / Google |
| Britain, Ireland, Belgium, Netherlands, Hungary, Canada, Australia (NSW, Victoria), New Zealand | Webb 1911, pp.361-367: holdings by size | §3 R1 | PD-IA |
| All census territories | Webb 1911, pp.428-447 (the existing step-1 rows) | census groups | PD-IA |

**Searched, not usable:**
- Philippines 1903 census: farmers and farm labourers are combined.
- Mexico 1900 *Resumen general*: Bertillon groups only, with no split between peones,
  rancheros and hacendados.
- China Year Book 1919, 1922, 1925-6: no tenure statistics.
- Japan Year Book 1910: item files broken.
- 1897 *Obshchii svod*: its agricultural rows read from the text layer only, and they are
  superseded by Webb.
- Not found on archive.org: Austrian, Hungarian and Spanish 1900 occupation volumes, and an
  Egypt 1897/1907 census.
- **Not searched:** national repositories (INE, IBGE, INEGI, Hungaricana, ANNO, ISTAT, Gallica,
  HathiTrust).

## 3. Rules (decided for this distribution; each a provisional constant)

| # | Rule | Applied to |
|---|---|---|
| R1 | **Holding size, Europe and settler colonies:** holders of 2-5 ha are peasants, 5 ha and over farmers; holdings under 2 ha are labourers' plots and do not enter the split; a class straddling a boundary is divided by log-area overlap (open lower class from 0.25 ha). German heads under 2 ha who farm as their main occupation remain peasants | Germany (persons by class), UK, Belgium, Netherlands, Hungary, Canada, Australia, New Zealand |
| R2 | **Market orientation where sizes are missing:** France: *isolés* and heads of farms with no employee are peasants. Italy: owner-cultivators and sharecroppers are peasants, cash tenants and market gardeners farmers. USA: no subsistence class (all holders farmers) | France, Italy, USA |
| R3 | **Family workers go to the holder's profession** (farm and shop) | USA, Germany |
| R4 | **Industry and trade:** working alone or heading an establishment of up to 5 persons → shopkeeper; a larger one → capitalist; salaried staff → clerks and engineers (5 : 2); workers keep the group's wage mapping | Germany, France |
| R5 | **Russia's farmer layer:** commune households with 3 or more horses (the "well-to-do" group of the period's statistics) and non-commune owners with 1-4 horses are farmers; non-commune owners with 5 or more horses are estates (aristocrats); the rest peasants. The 44-guberniia shares are applied to the whole of `rus-home` | Russia |
| R6 | **Aristocrats (landed households):** Germany: heads and families of holdings of 100 ha and over (0.34 % of farm persons). Hungary: holdings of 100 ha and over by R1. Russia: R5. Other estate territories: the mean of those three (0.84 % of owner-operators). Japan, China, Korea, Taiwan: Japan's landowners of 10 cho and over (0.90 % of farm families), as the East Asian analog. Elsewhere 0.2 % of agriculture (unchanged) | all |
| R7 | **Army and navy** carved out of the census group holding them; 93 % servicemen, 7 % officers (existing split). France: the army's share of public service | ten census territories and France |
| R8 | **Rules for territories without agrarian data, fitted on the sourced points on ln real GDP per head y** (P2b's Maddison ratio × US GDP per head). Farm-hand share of agriculture = −0.2270 + 0.0707 ln y (7 points: USA 0.197, Germany 0.248, France 0.359, India 0.235, Italy 0.439, Russia 0.149, UK 0.496). Farmer share of owner-operators = −1.3301 + 0.2356 ln y (8 points: Germany 0.473, France 0.421, Russia 0.208, Italy 0.137, UK 0.757, Belgium 0.452, Netherlands 0.669, Hungary 0.704; the USA's assumed 1.0 is left out of the fit) | Austria, Sweden, Norway, Denmark, Switzerland and all proxy territories |
| R9 | **Mediterranean analog:** Spain and Portugal take Italy's farm-hand and farmer shares | Spain, Portugal |
| R10 | **Belgium's "other non-industrial occupations"** split like France's 1901 liberal professions vs personal service (0.279 : 0.721) | Belgium |
| R11 | **Proxy territories:** each profession's share by least squares on [1, ln y, urban share] over the 16 census territories; then the agricultural block (peasants + farmers + aristocrats + farm hands) is re-split by R6, R8 and R1 (Canada, Australia, New Zealand holdings), so that agrarian structure follows one rule set everywhere. Regions as regressors were tested and rejected (they raised the leave-one-out error) | about 120 territories |

**Fit:** leave-one-out error, by territory (% of persons misallocated): USA 11.6, UK 15.3,
Germany 9.3, France 17.1, Netherlands 5.6, Belgium 9.3, Switzerland 6.5, Sweden 10.8,
Norway 2.8, Denmark 8.6, Russia 7.9, Italy 6.9, Austria-Hungary 13.8, India 17.4, Cape 14.2,
Australia 10.5 (first-pass figures; mean after the final fixes 10.3 %).

## 4. Main territories (percent of population, interim placement applied)

Laborers include servicemen; bureaucrats include officers; academics include clergy. The last
two columns show the raw servicemen / officers / clergy and the farm hands within laborers.

| Territory | Pea | Far | Lab | Att | Shp | Clk | Cap | Ari | Aca | Tch | Med | Eng | Bur | Svc / Off / Clg | Farm hands |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| USA | 0.0 | 28.6 | 46.4 | 7.6 | 6.3 | 4.9 | 1.1 | 0.1 | 2.0 | 1.5 | 0.5 | 0.7 | 0.3 | 0.4 / 0.0 / 0.4 | 7.0 |
| United Kingdom | 1.5 | 4.7 | 56.3 | 14.5 | 9.2 | 5.7 | 1.6 | 0.1 | 2.5 | 1.5 | 0.0 | 1.0 | 1.5 | 1.0 / 0.1 / 0.3 | 6.1 |
| Germany | 13.9 | 12.5 | 44.3 | 7.1 | 12.8 | 3.5 | 1.1 | 0.1 | 1.6 | 1.2 | 0.4 | 0.7 | 0.8 | 2.2 / 0.2 / 0.3 | 8.7 |
| France | 15.4 | 11.2 | 37.6 | 9.1 | 17.3 | 2.6 | 0.6 | 0.1 | 0.5 | 0.9 | 0.6 | 0.4 | 3.7 | 2.8 / 0.2 / 0.0 | 14.9 |
| Russia | 38.6 | 10.2 | 29.9 | 9.0 | 5.1 | 1.8 | 0.7 | 0.4 | 1.6 | 1.2 | 0.4 | 0.4 | 0.8 | 3.3 / 0.3 / 0.3 | 8.6 |
| Italy | 26.7 | 4.2 | 46.4 | 10.3 | 5.5 | 1.8 | 0.9 | 0.1 | 1.3 | 1.0 | 0.1 | 0.4 | 1.3 | 1.1 / 0.1 / 0.9 | 24.2 |
| Austria-Hungary | 19.2 | 23.5 | 36.9 | 5.8 | 5.1 | 1.8 | 0.8 | 0.4 | 2.6 | 2.0 | 0.6 | 0.4 | 0.9 | 1.5 / 0.1 / 0.5 | 18.8 |
| Japan | 26.4 | 13.1 | 36.7 | 9.8 | 6.5 | 2.1 | 0.8 | 0.4 | 1.4 | 1.1 | 0.3 | 0.4 | 0.9 | 1.1 / 0.1 / 0.3 | 14.9 |
| China | 46.6 | 8.0 | 28.0 | 8.9 | 3.9 | 0.8 | 0.5 | 0.5 | 0.9 | 0.8 | 0.3 | 0.2 | 0.6 | 1.4 / 0.1 / 0.3 | 15.2 |
| British India | 41.4 | 6.9 | 37.2 | 4.8 | 4.1 | 1.3 | 0.7 | 0.4 | 0.7 | 0.6 | 0.2 | 0.4 | 1.4 | 0.2 / 0.0 / 0.1 | 15.0 |
| Spain | 22.1 | 3.5 | 45.3 | 12.9 | 7.6 | 2.4 | 1.0 | 0.1 | 1.6 | 1.2 | 0.3 | 0.5 | 1.4 | 1.3 / 0.1 / 0.3 | 20.1 |
| Brazil | 46.4 | 6.5 | 26.6 | 12.0 | 3.8 | 0.6 | 0.5 | 0.4 | 0.9 | 0.7 | 0.2 | 0.2 | 1.1 | 1.7 / 0.1 / 0.2 | 14.1 |
| Mexico | 29.3 | 12.3 | 35.0 | 10.3 | 6.1 | 1.8 | 0.8 | 0.4 | 1.4 | 1.0 | 0.3 | 0.4 | 0.9 | 1.3 / 0.1 / 0.3 | 14.8 |
| Ottoman Empire | 35.4 | 11.4 | 32.8 | 9.4 | 5.3 | 1.5 | 0.7 | 0.1 | 1.2 | 0.9 | 0.3 | 0.3 | 0.8 | 1.3 / 0.1 / 0.3 | 15.2 |
| Netherlands | 6.7 | 13.6 | 41.4 | 17.1 | 10.1 | 3.5 | 1.5 | 0.1 | 2.3 | 1.7 | 0.5 | 0.5 | 0.9 | 0.9 / 0.1 / 0.5 | 10.3 |
| Belgium | 7.6 | 6.2 | 44.7 | 15.1 | 11.6 | 3.5 | 1.7 | 0.0 | 3.1 | 2.3 | 0.7 | 0.7 | 2.9 | 0.9 / 0.1 / 0.5 | 7.3 |
| Sweden | 19.5 | 15.1 | 38.9 | 14.3 | 5.8 | 2.0 | 0.9 | 0.1 | 1.2 | 0.9 | 0.3 | 0.4 | 0.6 | 1.8 / 0.1 / 0.2 | 15.1 |
| Argentina | 12.3 | 12.9 | 43.3 | 11.9 | 9.3 | 3.3 | 1.2 | 0.2 | 1.9 | 1.5 | 0.4 | 0.6 | 1.3 | 1.0 / 0.1 / 0.4 | 12.3 |
| Canada | 4.6 | 21.2 | 43.6 | 11.2 | 9.2 | 3.4 | 1.2 | 0.1 | 1.9 | 1.5 | 0.4 | 0.6 | 1.2 | 0.9 / 0.1 / 0.4 | 12.6 |
| Australia | 1.2 | 14.0 | 44.4 | 15.3 | 11.7 | 4.3 | 1.7 | 0.0 | 2.6 | 1.9 | 0.6 | 0.6 | 1.6 | 0.0 / 0.0 / 0.5 | 8.2 |

The step-3 tree's shares for the same territories are in `.cache-p7/occ/occ-tables-v2.md`
(the "old" rows). Main changes: Russia gets 10.2 % farmers (was 0); India and China lose about
10 points of peasants to farm hands and farmers; Germany and France gain small peasants; the
USA's 2.4 M family farm hands become farmers; Italy and Spain get their day-labourer class;
academics fall wherever the army sat inside "public service and professions".

## 5. Every territory

Appendix A lists all 134 territories (population, source kind C = census / P = proxy, and the
sixteen raw shares). The machine-readable version with per-territory method, shares and persons
is `.cache-p7/occ/occupations_1900_v2.json`.

## 6. Known weaknesses (what remains provisional)

- **No agrarian source for China, Mexico, Brazil, the Ottoman Empire, Austria, Japan's
  farmers, Southeast Asia or Africa.** Their split comes from R8 on real GDP, which
  extrapolates the European and Russian points. Mexico's peonage and the haciendas are
  probably understated (14.8 % farm hands); China's farm hands (15.2 %) rest on the same rule.
- **Russia:** 44 guberniias stand for the empire, including Poland, the Caucasus, Siberia and
  Central Asia. The 3-horse threshold for farmers is a choice; 4 horses would give about
  half as many farmers.
- **India:** farmers (6.9 %) come from R8; the census itself warns that its landholder/tenant
  split is unreliable.
- **USA:** no peasants is an assumption (R2). Southern sharecroppers are counted as farmers,
  being commercial cotton growers.
- **France:** where the census put family workers is unknown. As returned, 35.9 % of farm
  workers are employees.
- **Non-agricultural shares outside Germany and France** still use the provisional
  `GROUP_TO_PROFESSIONS` splits (census territories) or the regression (proxy territories). The
  regression puts, for example, 0.8 % of China's people among teachers, which is probably high.
- **Australia's** P2b price level (1.435) puts its real GDP below its nominal; this matters
  only for the R8 rules, which Australia no longer uses for its farmers.
- **Italy's** class rows sum 490 above the printed total (a 3/8 misreading in the typeface,
  immaterial).

## 7. Day-1 effect (prototype, same placement code and `proto2.mjs`)

| Variant | Eligible (M) | Capacity, all professions (M) | Wage slots (M) | Employed (M) | Uncovered (M) | Uncovered share of wage eligible | Output lost | World measured income (RUSD / person) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| S6, step-3 occupations | 461.72 | 284.96 | 127.31 | 377.84 | 76.21 | 33.8 % | 11.7 % | 300 |
| **S6, this distribution** | 456.99 | 300.55 | 134.70 | 370.36 | 80.13 | 34.5 % | 11.9 % | 302 |
| S8, step-3 occupations | 461.72 | 284.96 | 127.31 | 378.28 | 75.78 | 33.8 % | 11.1 % | 302 |
| **S8, this distribution** | 456.99 | 300.55 | 134.70 | 372.04 | 78.41 | 34.1 % | 11.3 % | 304 |

S6 by profession (this distribution):
- peasants: 189.7 M eligible, 140.2 M slots;
- farmers: 55.5 M eligible, 23.8 M slots;
- laborers: 123.3 M eligible, 98.4 M slots, 38.0 M uncovered;
- attendants: 30.2 M eligible, 18.1 M slots;
- shopkeepers: 26.9 M eligible, 2.0 M slots.

Uncovered share of wage eligible by territory (S6): USA 40.9 %, UK 48.3 %, Germany 28.4 %,
France 46.0 %, Russia 37.1 %, Italy 39.7 %, Austria-Hungary 24.5 %, Japan 21.8 %, China 32.8 %,
India 34.7 %, Spain 52.8 %, Brazil 25.7 %.

Reading: the sourced farm-labour classes of Italy, Spain, India and Russia add wage workers that
placement gives no farm jobs, so the uncovered total rises by 3.9 M even though wage slots rise
by 7.4 M. The day-1 proposal's levers are unchanged: the labour share of capitalist buildings
(S7) and the farm wage (S9, which sizes farm jobs at the sourced farm wage).

## 8. Decisions taken in this pass (formerly D1-D8)

| Former question | Taken | Why |
|---|---|---|
| D1 boundary | 5 ha, Europe and settler colonies only; market orientation or analogs elsewhere | a single area threshold misreads rice and steppe agriculture |
| D2 German heads under 2 ha | peasants | they farm as their main occupation |
| D3 100 ha and over | aristocrats where sourced (Germany, Hungary, Russia), else R6 shares | landed households living on land income |
| D4 France family workers | as returned | no source read for the alternative |
| D5 India farmers | R8 rule (6.9 %) | no sourced split; the rule matches Russia's sourced point at similar real GDP |
| D6 USA peasants | none | commercial agriculture; no size table read |
| D7 Russia | horse census (R5) | public-domain primary source found on archive.org |
| D8 proxy | real GDP + urban share, with the agrarian re-split | lowest leave-one-out error tested |

## 9. To adopt (needs your go-ahead)

1. **Transcription.** Add the rows of Appendix B through `scripts/p7/sources-author.mjs`.
   This needs new group codes (agri-family, agri-hired, status-employer, status-own-account,
   status-salaried, status-workers, holdings by size class, horses by class) and a
   change to the committed source schema.
2. **Rules into the generator.** Move R1-R11 into `scripts/p7/labour.mjs` and
   `labour-build.mjs` as named provisional constants, replacing `AGRI_EMPLOYEE_SHARE`,
   `AGRI_FARMER_SHARE`, `ARISTOCRAT_SHARE` and `fitShareProxy`, and record them in
   `DECISIONS.md`.
3. **Regenerate and verify.** Regenerate the 1900 data and the before/after report, then run
   `pnpm test` and `pnpm typecheck`. The 1900-world hash re-pin waits for your review, and so
   does the step-3 commit.
4. **Further sources, by weight:**
   - Mexico 1900 state volumes (peones);
   - a Chinese tenure source (e.g. the 1917 Ministry of Agriculture and Commerce returns);
   - Austria and Hungary 1900 status tables (Hungaricana, ANNO);
   - Spain 1900 (INE), Brazil 1920 (IBGE), Egypt 1907;
   - the US 1900 farm-size table.

## 10. Is it ready, what is lacking, and what improves day 1

### 10.1 The distribution: usable, not finished

It is the best distribution the public-domain sources found so far support.

**Searched again in this pass, without a usable result:**
- *Mexico:* the 1895 census volume on archive.org is a single state, with agricultores and
  peones de campo by district; there is no national summary.
- *Brazil:* the 1900 *Synopse* has no occupations; the 1920 agriculture volumes exist but
  were not read.
- *Spain:* only the 1877 census was found.
- *China:* no tenure source.
- *Hungary:* only the 1907 gazetteer was found.

**Still open, by weight:**
- *China* (400 M people): no tenure or hired-labour source.
- *Mexico:* summing the 1900 state volumes (archive.org has several).
- *Austria and Hungary 1900, Spain 1900, Egypt 1907:* national repositories (ANNO,
  Hungaricana, INE), not archive.org.
- *US 1900 farm sizes.*
- *Status in industry and trade outside Germany and France.*

### 10.2 What the day-1 model lacks (measured)

The uncovered and the output lost have five causes. The first two are the large ones.

1. **Placement concentrates buildings where people are not.** Inside one territory,
   laborers are idle in one province while laborer slots stand empty in another. This was most
   of the 11.3 % output loss.
2. **No employer for own-account work.** Shopkeepers (artisans, retailers: 26.9 M eligible)
   have 2.0 M slots, and academics (lawyers, writers, clergy: 6.5 M) have 0.35 M. The census
   counts them as working on their own account, but the model only employs a self-employed
   person where a building of their kind stands in their province.
3. **Capitalist buildings pay too little of their value added as wages** (0.36 against the
   sourced 0.58), so they offer too few jobs (D8 of the day-1 proposal).
4. **A sharp census line between laborers and attendants.** Attendants are short of people in
   some territories while laborers are uncovered there, although the census's general
   labourers, carters and porters could do either.
5. **No household or public employers beyond the budgets** (domestic service, housing, public
   works): the 52 % of GDP the model does not cover.
6. **Smaller:** one laborer wage per province, so farm jobs are priced at the urban wage;
   2.0 M census engineers for 0.2 M engineer slots; literacy-gated clerks fill 79 % of their
   slots.

### 10.3 Improvements measured (prototype `.cache-p7/proto/proto5.mjs`, this distribution)

| Variant | Wage slots (M) | Employed (M) | Uncovered (M) | Uncovered share of wage eligible | Output lost | World income (RUSD / person) |
|---|---:|---:|---:|---:|---:|---:|
| S8 (proposal's recommendation, this distribution) | 134.7 | 372.0 | 78.4 | 34.1 % | 11.3 % | 304 |
| S11 = S8 + movable buildings follow workers inside each territory (farms, ranches, mines and other land or deposit buildings stay) | 134.7 | 384.3 | 64.5 | 26.5 % | 6.9 % | 319 |
| S12 = S11 + sourced labour share in capitalist and aristocrat buildings (within 95 % of the territory's workforce) | 151.8 | 396.8 | 51.6 | 19.4 % | 7.1 % | 319 |
| S13 = S12 + farm jobs sized at the sourced farm wage | 156.8 | 400.7 | 48.3 | 17.5 % | 8.5 % | 314 |
| S14 = S13 + shopkeepers employed in their own establishments | 156.8 | 414.9 | 34.1 | 17.5 % | 8.5 % | 314 |
| S15 = S14 + academics (with clergy) employed in their own practice | 162.9 | 421.0 | 28.0 | 14.2 % | 8.5 % | 314 |
| S16 = S15 + laborers and attendants matched to the job mix inside each territory (persons conserved) | 162.9 | 422.0 | 26.5 | 13.4 % | 6.9 % | 319 |
| **S18 = S16 without the farm-wage sizing (recommended)** | 157.9 | 418.3 | 30.0 | 15.3 % | **5.0 %** | **326** |
| S17 = S16 + households employ every census attendant (upper bound) | 165.4 | 424.5 | 24.6 | 12.3 % | 6.9 % | 319 |
| S10 = S8 + every building movable (upper bound for placement) | 134.7 | 390.5 | 58.5 | 24.9 % | 2.6 % | 353 |
| S19 = S18 + owner-operators split into peasants and farmers by province (rejected: no gain) | 157.9 | 418.6 | 29.7 | 15.3 % | 5.1 % | 325 |

**S18 by profession** (eligible / capacity / employed / uncovered, M):

| Profession | Eligible | Capacity | Employed | Uncovered |
|---|---:|---:|---:|---:|
| Peasants | 212.8 | 142.7 | 211.5 | 1.3 |
| Farmers | 31.8 | 21.1 | 30.9 | 0.9 |
| Laborers | 130.7 | 112.5 | 105.4 | 21.4 |
| Attendants | 23.3 | 20.2 | 20.1 | 2.5 |
| Shopkeepers | 26.9 | 26.9 | 26.9 | 0 |
| Clerks | 8.2 | 8.9 | 7.1 | 1.1 |
| Engineers | 2.0 | 0.2 | 0.2 | 1.8 |
| Academics | 6.5 | 6.5 | 6.5 | 0 |
| Teachers, medics, bureaucrats | — | — | — | 1.1 together |

Uncovered share of wage eligible by territory (S18):

| USA | UK | Germany | France | Russia | Italy | Austria-Hungary | Japan | China | India | Spain | Brazil |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 13.1 % | 22.4 % | 3.7 % | 10.2 % | 12.8 % | 19.2 % | 3.8 % | 9.7 % | 15.0 % | 24.8 % | 18.3 % | 9.3 % |

Measured income (S8 → S18, RUSD per person): USA 2,194 → 2,343, UK 1,672 → 1,761,
Germany 826 → 904, France 630 → 752, Spain 229 → 272.

The remaining output loss in S18 (5.0 %) comes from three sources:
- farm and mine laborer slots in provinces short of laborers (1.8 %);
- peasant and farmer slots exceeding the local owner-operators (1.8 % and 0.8 %);
- clerks (0.3 %).

All three are farm and mine placement against HYDE's distribution of people. Moving farms
to the provinces where farm people live would close most of the gap to the 2.6 % bound (S10).

### 10.4 What each improvement needs (none applied)

| Step | Where | Kind |
|---|---|---|
| Movable buildings follow workers (S11) | `scripts/p5b/placement.mjs`: spread non-land, non-deposit buildings over a territory's provinces by available workers | generator |
| Labour share restored (S12) | placement levels × wage bill to sourced labour share, technique lowered, output kept | generator (step-3 option C) |
| Own-account shopkeepers and professionals (S14, S15) | a small own-account establishment (workshop or shop, professional practice) placed in every province with such people, owner-operated with work-sharing (R2 extended); their income beyond its output stays outside the covered economy | generator + simulation rule |
| Laborer/attendant matching (S16) | day-1 relabelling inside each territory, persons conserved, recorded in the report | generator |
| Farm wage (S13) | only after farms follow farm people; until then as provincial wage differentials (no extra jobs) | generator, later |
| Households employ servants (S17) | households as employers, paid from household income | simulation feature (housing stage) |
| Farm placement follows farm people | land buildings allocated to provinces with farm workers within the territory's land | generator, next |

## Appendix B. Rows for transcription (not applied)

Webb rows keep `webb-1911`. New source ids: `us-census-1900-occupations` (PD-US),
`statjb-dr-1909`, `statjb-dr-1910`, `annuaire-fr-1905`, `voenno-konskaia-1899-1901` (PD-IA),
`census-india-1901-report` (PD-DLI), `censimento-1901` (Google), `japan-year-book-1907` (PD-IA),
`japan-year-book-1928` (Google).

| Row family | Locator | Values |
|---|---|---|
| USA farm labour 1900 | Occupations at the Twelfth Census, Table I, p.xxiii | hired 1,999,696; family 2,366,149; garden 45,032; farmers and planters 5,483,618; farmers (members of family) 168,999 |
| Germany status 1907 and 1895 | Jahrbuch 1909, I.10, pp.10-11 | A 2,500,974 / 98,812 / 7,283,471; B 1,977,122 / 686,007 / 8,593,125; C 1,012,192 / 505,909 / 1,959,525; D 471,695; E 1,738,530; F 3,404,983; 1895 A 2,568,725 / 96,173 / 5,627,794 |
| Germany farm persons 1907 by 18 size classes | Jahrbuch 1910, III.2, pp.30-31 | totals: heads 2,929,493; family permanent 4,680,485; temporary 3,011,630; supervisors 77,162; servants 1,545,951; day labourers 882,732; non-permanent 2,042,096 |
| Germany establishments 1907 | Jahrbuch 1910, V.1b p.63; V.2 pp.64-65 | industry and trade by size class; family helpers 298,204 and 611,161 |
| France 1901 status and establishments | Annuaire statistique 1905, pp.170-171 | by section: undeclared, chefs, employés et ouvriers, sans emploi, isolés; establishments by employees |
| Italy 1901 agriculture | Censimento 1901, p.7 | 16 classes, total 9,611,003 |
| Russia horse census 1899-1901 | Voenno-konskaia perepis', pp.xi-xii | households by horses and owner class; horseless 28.7 % |
| India 1901 agriculture | Census of India 1901, vol. I, Subsidiary Table V, p.230 | rent receivers 20,529,898; rent payers 45,035,286; farm servants 2,496,352; field labourers 17,632,463; jhum 859,313; tea-garden labourers 639,125 |
| Japan | Japan Year Book 1907 p.321; 1928 p.491 | farming households 1904 5,414,632 of 8,411,536; landowners by area 1926 |
| Army and navy | Jahrbuch 1909, p.14* | 13 countries (§2) |
| Holdings by size | Webb pp.361-367 | GB 1907, Ireland 1901, Hungary 1895, Belgium 1895 (74-99 acres = 3,190), Netherlands 1895, Canada 1901, NSW and Victoria 1906, New Zealand 1903-4 |

## Appendix A. All territories (percent of population, sixteen professions before the interim placement)

| Territory | Src | Pop (M) | Peasants | Farmers | Laborers | Attendants | Shopkeepers | Clerks | Capitalists | Aristocrats | Academics | Teachers | Medics | Engineers | Bureaucrats | Servicemen | Officers | Clergy |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chn-home | P | 400.00 | 46.6 | 8.0 | 26.6 | 8.9 | 3.9 | 0.8 | 0.5 | 0.5 | 0.7 | 0.8 | 0.3 | 0.2 | 0.5 | 1.4 | 0.1 | 0.3 |
| bin | C | 294.00 | 41.4 | 6.9 | 37.0 | 4.8 | 4.1 | 1.3 | 0.7 | 0.4 | 0.6 | 0.6 | 0.2 | 0.4 | 1.4 | 0.2 | 0.0 | 0.1 |
| rus-home | C | 133.30 | 38.6 | 10.2 | 26.5 | 9.0 | 5.1 | 1.8 | 0.7 | 0.4 | 1.3 | 1.2 | 0.4 | 0.4 | 0.6 | 3.3 | 0.3 | 0.3 |
| usa-home | C | 76.09 | 0.0 | 28.6 | 46.0 | 7.6 | 6.3 | 4.9 | 1.1 | 0.1 | 1.7 | 1.5 | 0.5 | 0.7 | 0.3 | 0.4 | 0.0 | 0.4 |
| deu-home | C | 56.37 | 13.9 | 12.5 | 42.1 | 7.1 | 12.8 | 3.5 | 1.1 | 0.1 | 1.3 | 1.2 | 0.4 | 0.7 | 0.6 | 2.2 | 0.2 | 0.3 |
| aut-home | C | 51.00 | 19.2 | 23.5 | 35.5 | 5.8 | 5.1 | 1.8 | 0.8 | 0.4 | 2.1 | 2.0 | 0.6 | 0.4 | 0.8 | 1.5 | 0.1 | 0.5 |
| jpn-home | P | 44.10 | 26.4 | 13.1 | 35.5 | 9.8 | 6.5 | 2.1 | 0.8 | 0.4 | 1.1 | 1.1 | 0.3 | 0.4 | 0.8 | 1.1 | 0.1 | 0.3 |
| dei | P | 42.00 | 42.1 | 9.7 | 28.7 | 8.9 | 4.4 | 1.1 | 0.6 | 0.1 | 0.8 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| gbr-home | C | 41.16 | 1.5 | 4.7 | 55.2 | 14.5 | 9.2 | 5.7 | 1.6 | 0.1 | 2.2 | 1.5 | 0.0 | 1.0 | 1.4 | 1.0 | 0.1 | 0.3 |
| fra-home | C | 38.90 | 15.4 | 11.2 | 34.8 | 9.1 | 17.3 | 2.6 | 0.6 | 0.1 | 0.5 | 0.9 | 0.6 | 0.4 | 3.5 | 2.8 | 0.2 | 0.0 |
| ita-home | C | 32.48 | 26.7 | 4.2 | 45.3 | 10.3 | 5.5 | 1.8 | 0.9 | 0.1 | 0.4 | 1.0 | 0.1 | 0.4 | 1.2 | 1.1 | 0.1 | 0.9 |
| ott-home | P | 24.00 | 35.4 | 11.4 | 31.5 | 9.4 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.7 | 1.3 | 0.1 | 0.3 |
| bwa | P | 20.00 | 44.2 | 9.1 | 27.9 | 8.7 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| esp-home | P | 18.60 | 22.1 | 3.5 | 44.0 | 12.9 | 7.6 | 2.4 | 1.0 | 0.1 | 1.3 | 1.2 | 0.3 | 0.5 | 1.3 | 1.3 | 0.1 | 0.3 |
| bra-home | P | 17.60 | 46.4 | 6.5 | 24.8 | 12.0 | 3.8 | 0.6 | 0.5 | 0.4 | 0.7 | 0.7 | 0.2 | 0.2 | 1.0 | 1.7 | 0.1 | 0.2 |
| kor-home | P | 17.00 | 42.5 | 8.9 | 27.9 | 9.9 | 4.3 | 1.0 | 0.6 | 0.5 | 0.8 | 0.8 | 0.3 | 0.3 | 0.7 | 1.4 | 0.1 | 0.3 |
| fic | P | 15.00 | 46.0 | 8.3 | 26.9 | 9.0 | 4.0 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.4 | 0.1 | 0.3 |
| mex-home | P | 13.60 | 29.3 | 12.3 | 33.8 | 10.3 | 6.1 | 1.8 | 0.8 | 0.4 | 1.0 | 1.0 | 0.3 | 0.4 | 0.8 | 1.3 | 0.1 | 0.3 |
| eth-home | P | 11.00 | 44.4 | 9.2 | 28.0 | 8.5 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| sok-home | P | 10.00 | 44.2 | 9.1 | 27.9 | 8.6 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| fwa | P | 10.00 | 44.7 | 9.2 | 28.0 | 8.2 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| per-home | P | 9.90 | 34.9 | 11.2 | 31.4 | 9.9 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.7 | 1.3 | 0.1 | 0.3 |
| egy | P | 9.70 | 34.3 | 11.0 | 31.3 | 10.6 | 5.4 | 1.4 | 0.7 | 0.1 | 0.9 | 1.0 | 0.3 | 0.3 | 0.8 | 1.4 | 0.1 | 0.3 |
| cfs | P | 9.00 | 44.5 | 9.2 | 28.0 | 8.3 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| phl | P | 7.60 | 44.0 | 8.0 | 26.6 | 10.9 | 4.1 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.2 | 0.9 | 1.6 | 0.1 | 0.3 |
| tha-home | P | 7.30 | 45.5 | 8.2 | 26.9 | 9.5 | 4.0 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.6 | 1.4 | 0.1 | 0.3 |
| gea | P | 7.00 | 45.1 | 9.3 | 28.1 | 7.8 | 4.1 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.2 | 0.1 | 0.3 |
| bel-home | C | 6.70 | 7.6 | 6.2 | 43.8 | 15.1 | 11.6 | 3.5 | 1.7 | 0.0 | 2.6 | 2.3 | 0.7 | 0.7 | 2.8 | 0.9 | 0.1 | 0.5 |
| rom-home | P | 6.00 | 37.3 | 11.4 | 31.2 | 8.4 | 5.1 | 1.4 | 0.6 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.5 | 1.2 | 0.1 | 0.3 |
| prt-home | P | 5.40 | 27.5 | 4.4 | 45.2 | 8.7 | 6.4 | 2.0 | 0.8 | 0.1 | 1.1 | 1.1 | 0.3 | 0.4 | 0.6 | 1.0 | 0.1 | 0.3 |
| can-home | P | 5.18 | 4.6 | 21.2 | 42.6 | 11.2 | 9.2 | 3.4 | 1.2 | 0.1 | 1.5 | 1.5 | 0.4 | 0.6 | 1.1 | 0.9 | 0.1 | 0.4 |
| nld-home | C | 5.10 | 6.7 | 13.6 | 40.5 | 17.1 | 10.1 | 3.5 | 1.5 | 0.1 | 1.8 | 1.7 | 0.5 | 0.5 | 0.9 | 0.9 | 0.1 | 0.5 |
| swe-home | C | 5.10 | 19.5 | 15.1 | 37.1 | 14.3 | 5.8 | 2.0 | 0.9 | 0.1 | 1.0 | 0.9 | 0.3 | 0.4 | 0.5 | 1.8 | 0.1 | 0.2 |
| npl-home | P | 5.00 | 48.3 | 8.1 | 26.5 | 8.0 | 3.8 | 0.8 | 0.5 | 0.1 | 0.7 | 0.7 | 0.3 | 0.2 | 0.4 | 1.3 | 0.1 | 0.3 |
| mar-home | P | 5.00 | 35.0 | 11.3 | 31.4 | 9.8 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.7 | 1.3 | 0.1 | 0.3 |
| arg-home | P | 4.70 | 12.3 | 12.9 | 42.3 | 11.9 | 9.3 | 3.3 | 1.2 | 0.2 | 1.6 | 1.5 | 0.4 | 0.6 | 1.2 | 1.0 | 0.1 | 0.4 |
| alg | P | 4.70 | 35.4 | 11.4 | 31.5 | 9.4 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.6 | 1.3 | 0.1 | 0.3 |
| afg-home | P | 4.50 | 48.0 | 8.0 | 26.5 | 8.4 | 3.8 | 0.8 | 0.5 | 0.1 | 0.7 | 0.7 | 0.3 | 0.2 | 0.4 | 1.3 | 0.1 | 0.3 |
| col-home | P | 4.00 | 39.8 | 8.4 | 27.5 | 12.5 | 4.6 | 0.9 | 0.6 | 0.4 | 0.8 | 0.8 | 0.3 | 0.3 | 1.1 | 1.7 | 0.1 | 0.2 |
| bea | P | 4.00 | 44.9 | 9.3 | 28.0 | 8.0 | 4.1 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| ang | P | 4.00 | 44.6 | 9.2 | 28.0 | 8.3 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| cey | P | 3.90 | 28.7 | 13.7 | 35.6 | 8.0 | 6.3 | 2.0 | 0.8 | 0.1 | 1.0 | 1.1 | 0.3 | 0.4 | 0.5 | 1.0 | 0.1 | 0.3 |
| aus-home | C | 3.80 | 1.2 | 14.0 | 44.4 | 15.3 | 11.7 | 4.3 | 1.7 | 0.0 | 2.1 | 1.9 | 0.6 | 0.6 | 1.6 | 0.0 | 0.0 | 0.5 |
| bgr-home | P | 3.70 | 38.5 | 10.8 | 30.4 | 8.8 | 4.9 | 1.3 | 0.6 | 0.1 | 0.8 | 0.9 | 0.3 | 0.3 | 0.5 | 1.2 | 0.1 | 0.3 |
| pru-home | P | 3.70 | 40.4 | 8.4 | 27.5 | 12.0 | 4.5 | 0.9 | 0.6 | 0.4 | 0.8 | 0.8 | 0.3 | 0.3 | 1.0 | 1.6 | 0.1 | 0.3 |
| mad | P | 3.50 | 44.4 | 9.1 | 28.0 | 8.5 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| che-home | C | 3.30 | 8.0 | 12.0 | 48.3 | 8.8 | 11.6 | 3.9 | 1.7 | 0.1 | 1.5 | 1.5 | 0.4 | 0.9 | 0.7 | 0.1 | 0.0 | 0.4 |
| mal | P | 3.30 | 49.9 | 5.9 | 24.1 | 10.9 | 3.5 | 0.5 | 0.5 | 0.1 | 0.6 | 0.7 | 0.2 | 0.2 | 0.8 | 1.7 | 0.1 | 0.2 |
| chl-home | P | 3.00 | 17.8 | 14.0 | 40.2 | 10.0 | 8.1 | 2.8 | 1.0 | 0.3 | 1.4 | 1.3 | 0.4 | 0.5 | 0.8 | 1.0 | 0.1 | 0.4 |
| cra | P | 3.00 | 44.4 | 9.2 | 28.0 | 8.4 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| fea | P | 3.00 | 44.3 | 9.1 | 27.9 | 8.6 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| moz | P | 3.00 | 45.1 | 9.3 | 28.1 | 7.8 | 4.1 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.3 | 1.2 | 0.1 | 0.3 |
| twn | P | 3.00 | 42.4 | 8.9 | 27.9 | 9.9 | 4.3 | 1.0 | 0.6 | 0.5 | 0.8 | 0.8 | 0.3 | 0.3 | 0.7 | 1.4 | 0.1 | 0.3 |
| fin | P | 2.70 | 21.9 | 13.7 | 37.8 | 10.3 | 7.3 | 2.4 | 0.9 | 0.1 | 1.2 | 1.2 | 0.4 | 0.5 | 0.9 | 1.1 | 0.1 | 0.3 |
| srb-home | P | 2.50 | 38.9 | 11.0 | 30.5 | 8.3 | 4.9 | 1.3 | 0.6 | 0.1 | 0.8 | 0.9 | 0.3 | 0.3 | 0.5 | 1.2 | 0.1 | 0.3 |
| dnk-home | C | 2.40 | 15.3 | 16.8 | 39.7 | 11.2 | 7.7 | 2.8 | 1.1 | 0.1 | 1.7 | 1.6 | 0.5 | 0.5 | 0.8 | 0.0 | 0.0 | 0.4 |
| grc-home | P | 2.40 | 29.8 | 13.6 | 35.2 | 7.7 | 6.1 | 2.0 | 0.8 | 0.1 | 1.0 | 1.1 | 0.3 | 0.4 | 0.4 | 1.0 | 0.1 | 0.3 |
| ven-home | P | 2.40 | 28.4 | 12.1 | 33.7 | 11.1 | 6.2 | 1.8 | 0.8 | 0.3 | 1.1 | 1.1 | 0.3 | 0.4 | 1.0 | 1.3 | 0.1 | 0.3 |
| cap | C | 2.40 | 35.9 | 11.9 | 24.4 | 19.1 | 4.1 | 1.3 | 0.6 | 0.1 | 1.0 | 0.9 | 0.3 | 0.2 | 0.0 | 0.0 | 0.0 | 0.2 |
| nor-home | C | 2.20 | 16.2 | 12.3 | 39.7 | 13.8 | 8.7 | 3.2 | 1.2 | 0.1 | 1.2 | 1.1 | 0.3 | 0.6 | 0.5 | 0.6 | 0.0 | 0.3 |
| bwi | P | 2.00 | 47.0 | 7.4 | 25.8 | 10.1 | 3.8 | 0.7 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.2 | 0.7 | 1.5 | 0.1 | 0.3 |
| sud | P | 2.00 | 44.5 | 9.2 | 28.0 | 8.4 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| kam | P | 2.00 | 44.3 | 9.1 | 28.0 | 8.5 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| buk | P | 2.00 | 35.9 | 11.5 | 31.6 | 8.8 | 5.2 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.6 | 1.2 | 0.1 | 0.3 |
| tun | P | 1.90 | 34.5 | 11.1 | 31.3 | 10.4 | 5.4 | 1.4 | 0.7 | 0.1 | 0.9 | 1.0 | 0.3 | 0.3 | 0.8 | 1.4 | 0.1 | 0.3 |
| bol-home | P | 1.80 | 34.8 | 11.2 | 31.4 | 9.9 | 5.3 | 1.5 | 0.7 | 0.4 | 0.9 | 0.9 | 0.3 | 0.3 | 0.7 | 1.3 | 0.1 | 0.3 |
| cub-home | P | 1.60 | 28.5 | 11.1 | 32.6 | 12.9 | 6.1 | 1.7 | 0.8 | 0.3 | 1.1 | 1.0 | 0.3 | 0.4 | 1.2 | 1.5 | 0.1 | 0.3 |
| hti-home | P | 1.50 | 48.0 | 7.5 | 26.0 | 9.2 | 3.7 | 0.7 | 0.5 | 0.1 | 0.7 | 0.7 | 0.3 | 0.2 | 0.6 | 1.4 | 0.1 | 0.3 |
| gua-home | P | 1.40 | 42.0 | 8.8 | 27.8 | 10.3 | 4.4 | 1.0 | 0.6 | 0.4 | 0.8 | 0.8 | 0.3 | 0.3 | 0.8 | 1.5 | 0.1 | 0.3 |
| ecu-home | P | 1.40 | 41.5 | 8.9 | 27.9 | 10.5 | 4.4 | 1.0 | 0.6 | 0.4 | 0.8 | 0.8 | 0.3 | 0.3 | 0.8 | 1.5 | 0.1 | 0.3 |
| zar-home | P | 1.20 | 34.7 | 11.5 | 31.7 | 9.6 | 5.4 | 1.5 | 0.7 | 0.1 | 0.9 | 1.0 | 0.3 | 0.3 | 0.7 | 1.3 | 0.1 | 0.3 |
| tib | P | 1.20 | 47.5 | 7.9 | 26.4 | 8.8 | 3.8 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.2 | 0.5 | 1.4 | 0.1 | 0.3 |
| nat | P | 1.10 | 34.7 | 11.5 | 31.7 | 9.6 | 5.4 | 1.5 | 0.7 | 0.1 | 0.9 | 1.0 | 0.3 | 0.3 | 0.7 | 1.3 | 0.1 | 0.3 |
| wad-home | P | 1.00 | 44.8 | 9.2 | 28.0 | 8.1 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| shm-home | P | 1.00 | 35.5 | 11.4 | 31.5 | 9.3 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.6 | 1.3 | 0.1 | 0.3 |
| hct | P | 1.00 | 36.8 | 12.2 | 32.2 | 7.2 | 5.2 | 1.5 | 0.6 | 0.1 | 0.9 | 0.9 | 0.3 | 0.4 | 0.3 | 1.0 | 0.1 | 0.3 |
| tog | P | 1.00 | 44.5 | 9.2 | 28.0 | 8.4 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| pri | P | 0.95 | 44.6 | 7.0 | 25.5 | 12.4 | 4.0 | 0.7 | 0.5 | 0.1 | 0.7 | 0.8 | 0.2 | 0.2 | 1.1 | 1.8 | 0.1 | 0.2 |
| sal-home | P | 0.90 | 41.5 | 8.7 | 27.7 | 11.0 | 4.4 | 0.9 | 0.6 | 0.1 | 0.8 | 0.8 | 0.3 | 0.3 | 0.9 | 1.6 | 0.1 | 0.3 |
| ury-home | P | 0.90 | 15.4 | 12.1 | 39.0 | 13.9 | 8.4 | 2.8 | 1.1 | 0.2 | 1.4 | 1.3 | 0.4 | 0.5 | 1.5 | 1.3 | 0.1 | 0.3 |
| nzl-home | P | 0.80 | 2.6 | 16.4 | 45.2 | 12.5 | 10.6 | 4.0 | 1.4 | 0.1 | 1.8 | 1.6 | 0.4 | 0.7 | 1.4 | 0.9 | 0.1 | 0.4 |
| khi | P | 0.80 | 35.5 | 11.4 | 31.5 | 9.3 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.6 | 1.3 | 0.1 | 0.3 |
| lbr-home | P | 0.60 | 37.5 | 11.4 | 31.2 | 8.2 | 5.0 | 1.4 | 0.6 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.5 | 1.2 | 0.1 | 0.3 |
| pry-home | P | 0.60 | 34.0 | 10.9 | 31.2 | 10.8 | 5.4 | 1.4 | 0.7 | 0.4 | 0.9 | 1.0 | 0.3 | 0.3 | 0.9 | 1.4 | 0.1 | 0.3 |
| dom-home | P | 0.60 | 46.6 | 7.3 | 25.8 | 10.5 | 3.9 | 0.7 | 0.5 | 0.1 | 0.7 | 0.8 | 0.2 | 0.2 | 0.8 | 1.6 | 0.1 | 0.2 |
| dar-home | P | 0.60 | 44.5 | 9.2 | 28.0 | 8.3 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| omn-home | P | 0.50 | 36.8 | 11.8 | 31.8 | 7.8 | 5.1 | 1.5 | 0.6 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.4 | 1.1 | 0.1 | 0.3 |
| hon-home | P | 0.50 | 43.1 | 9.1 | 28.0 | 9.4 | 4.3 | 1.0 | 0.5 | 0.1 | 0.8 | 0.8 | 0.3 | 0.3 | 0.6 | 1.4 | 0.1 | 0.3 |
| gng | P | 0.50 | 47.3 | 8.6 | 27.1 | 7.7 | 3.9 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.3 | 1.3 | 0.1 | 0.3 |
| sar | P | 0.50 | 45.0 | 8.1 | 26.8 | 10.0 | 4.1 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.2 | 0.7 | 1.5 | 0.1 | 0.3 |
| goa | P | 0.48 | 46.5 | 7.8 | 26.3 | 9.8 | 3.9 | 0.7 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.2 | 0.7 | 1.5 | 0.1 | 0.3 |
| nic-home | P | 0.40 | 41.1 | 8.6 | 27.6 | 11.4 | 4.5 | 0.9 | 0.6 | 0.1 | 0.8 | 0.8 | 0.3 | 0.3 | 0.9 | 1.6 | 0.1 | 0.3 |
| fca | P | 0.40 | 37.7 | 5.9 | 24.4 | 19.1 | 4.5 | 0.6 | 0.6 | 0.1 | 0.9 | 0.8 | 0.2 | 0.2 | 2.2 | 2.4 | 0.2 | 0.2 |
| its | P | 0.40 | 44.5 | 9.2 | 28.0 | 8.4 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| mnt-home | P | 0.30 | 38.2 | 10.7 | 30.4 | 9.1 | 4.9 | 1.3 | 0.6 | 0.1 | 0.8 | 0.9 | 0.3 | 0.3 | 0.6 | 1.3 | 0.1 | 0.3 |
| orf-home | P | 0.30 | 35.0 | 11.6 | 31.8 | 9.2 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.6 | 1.2 | 0.1 | 0.3 |
| cos-home | P | 0.30 | 41.3 | 8.7 | 27.7 | 11.2 | 4.5 | 0.9 | 0.6 | 0.1 | 0.8 | 0.8 | 0.3 | 0.3 | 0.9 | 1.6 | 0.1 | 0.3 |
| crt-home | P | 0.30 | 30.1 | 13.7 | 35.3 | 7.4 | 6.1 | 2.0 | 0.8 | 0.1 | 1.0 | 1.0 | 0.3 | 0.4 | 0.4 | 0.9 | 0.1 | 0.3 |
| hkg | P | 0.30 | 20.3 | 10.4 | 34.2 | 17.3 | 7.3 | 2.0 | 1.0 | 0.1 | 1.3 | 1.2 | 0.3 | 0.4 | 2.0 | 1.9 | 0.1 | 0.3 |
| bpo | P | 0.30 | 46.8 | 8.5 | 27.0 | 8.3 | 3.9 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| pai | P | 0.30 | 29.0 | 14.0 | 35.9 | 7.3 | 6.3 | 2.1 | 0.8 | 0.1 | 1.0 | 1.1 | 0.3 | 0.4 | 0.4 | 0.9 | 0.1 | 0.3 |
| eri | P | 0.30 | 44.6 | 9.2 | 28.0 | 8.3 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| bhu | P | 0.30 | 48.4 | 8.1 | 26.5 | 7.9 | 3.7 | 0.8 | 0.5 | 0.1 | 0.7 | 0.7 | 0.3 | 0.2 | 0.4 | 1.3 | 0.1 | 0.3 |
| lux-home | P | 0.24 | 8.5 | 11.4 | 43.8 | 13.5 | 10.2 | 3.7 | 1.3 | 0.1 | 1.7 | 1.6 | 0.4 | 0.6 | 1.5 | 1.1 | 0.1 | 0.4 |
| cyp | P | 0.24 | 29.9 | 13.7 | 35.3 | 7.6 | 6.1 | 2.0 | 0.8 | 0.1 | 1.0 | 1.1 | 0.3 | 0.4 | 0.4 | 1.0 | 0.1 | 0.3 |
| nfd | P | 0.22 | 12.6 | 13.4 | 42.6 | 11.1 | 9.2 | 3.4 | 1.2 | 0.1 | 1.5 | 1.5 | 0.4 | 0.6 | 1.1 | 0.9 | 0.1 | 0.4 |
| mlt | P | 0.20 | 14.1 | 10.8 | 37.8 | 17.0 | 8.6 | 2.7 | 1.2 | 0.1 | 1.5 | 1.4 | 0.4 | 0.5 | 2.0 | 1.7 | 0.1 | 0.3 |
| bso | P | 0.20 | 44.5 | 9.2 | 28.0 | 8.4 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| fpo | P | 0.20 | 45.5 | 8.2 | 26.9 | 9.5 | 4.0 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.6 | 1.4 | 0.1 | 0.3 |
| gsw | P | 0.20 | 43.8 | 9.0 | 27.9 | 9.1 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.6 | 1.4 | 0.1 | 0.3 |
| sgg | P | 0.15 | 44.7 | 9.2 | 28.0 | 8.2 | 4.2 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| fji | P | 0.12 | 45.5 | 8.2 | 26.9 | 9.5 | 4.0 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.6 | 1.4 | 0.1 | 0.3 |
| ptm | P | 0.10 | 42.5 | 9.8 | 28.8 | 8.5 | 4.4 | 1.1 | 0.6 | 0.1 | 0.8 | 0.8 | 0.3 | 0.3 | 0.5 | 1.3 | 0.1 | 0.3 |
| tru | P | 0.08 | 35.2 | 11.3 | 31.4 | 9.7 | 5.3 | 1.5 | 0.7 | 0.1 | 0.9 | 0.9 | 0.3 | 0.3 | 0.7 | 1.3 | 0.1 | 0.3 |
| mac | P | 0.08 | 32.6 | 5.6 | 23.9 | 23.4 | 4.8 | 0.5 | 0.7 | 0.1 | 1.0 | 0.8 | 0.2 | 0.1 | 3.0 | 2.8 | 0.2 | 0.1 |
| sur | P | 0.08 | 44.9 | 7.0 | 25.5 | 12.1 | 4.0 | 0.7 | 0.5 | 0.1 | 0.7 | 0.8 | 0.2 | 0.2 | 1.0 | 1.7 | 0.1 | 0.2 |
| isl | P | 0.08 | 21.0 | 11.3 | 35.0 | 15.4 | 7.2 | 2.1 | 1.0 | 0.1 | 1.3 | 1.2 | 0.3 | 0.4 | 1.7 | 1.7 | 0.1 | 0.3 |
| gpn | P | 0.06 | 47.4 | 8.6 | 27.1 | 7.7 | 3.9 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.3 | 1.3 | 0.1 | 0.3 |
| kuw | P | 0.05 | 33.2 | 10.7 | 31.0 | 11.9 | 5.5 | 1.4 | 0.7 | 0.1 | 1.0 | 1.0 | 0.3 | 0.3 | 1.1 | 1.5 | 0.1 | 0.3 |
| fso | P | 0.05 | 41.1 | 8.5 | 27.4 | 11.7 | 4.5 | 0.9 | 0.6 | 0.1 | 0.8 | 0.8 | 0.3 | 0.3 | 1.0 | 1.6 | 0.1 | 0.3 |
| dgc | P | 0.05 | 41.0 | 6.4 | 25.0 | 15.8 | 4.3 | 0.6 | 0.6 | 0.1 | 0.8 | 0.8 | 0.2 | 0.2 | 1.6 | 2.1 | 0.2 | 0.2 |
| sah | P | 0.05 | 45.4 | 9.4 | 28.1 | 7.5 | 4.1 | 1.0 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.3 | 1.2 | 0.1 | 0.3 |
| gsa | P | 0.04 | 46.3 | 8.4 | 27.0 | 8.7 | 4.0 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.5 | 1.4 | 0.1 | 0.3 |
| dwi | P | 0.03 | 42.5 | 6.7 | 25.2 | 14.4 | 4.2 | 0.6 | 0.6 | 0.1 | 0.8 | 0.8 | 0.2 | 0.2 | 1.4 | 1.9 | 0.1 | 0.2 |
| ton-home | P | 0.02 | 46.6 | 8.4 | 27.0 | 8.4 | 3.9 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.4 | 1.3 | 0.1 | 0.3 |
| mco-home | P | 0.01 | 16.1 | 16.9 | 44.6 | 4.6 | 8.6 | 3.4 | 1.1 | 0.1 | 1.4 | 1.4 | 0.4 | 0.6 | 0.0 | 0.3 | 0.0 | 0.4 |
| bsa | P | 0.01 | 45.2 | 8.2 | 26.8 | 9.8 | 4.0 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.2 | 0.7 | 1.5 | 0.1 | 0.3 |
| fro | P | 0.01 | 27.0 | 14.5 | 37.0 | 7.2 | 6.6 | 2.2 | 0.8 | 0.1 | 1.1 | 1.1 | 0.4 | 0.5 | 0.4 | 0.9 | 0.1 | 0.4 |
| grl | P | 0.01 | 25.4 | 13.6 | 36.4 | 9.4 | 6.8 | 2.2 | 0.9 | 0.1 | 1.1 | 1.1 | 0.3 | 0.4 | 0.7 | 1.1 | 0.1 | 0.3 |
| smr-home | P | 0.01 | 21.4 | 16.3 | 41.2 | 5.3 | 7.6 | 2.8 | 0.9 | 0.1 | 1.2 | 1.2 | 0.4 | 0.5 | 0.1 | 0.5 | 0.0 | 0.4 |
| gum | P | 0.01 | 47.4 | 8.6 | 27.1 | 7.7 | 3.9 | 0.8 | 0.5 | 0.1 | 0.7 | 0.8 | 0.3 | 0.3 | 0.3 | 1.3 | 0.1 | 0.3 |
| lie-home | P | 0.01 | 15.4 | 16.3 | 44.3 | 5.7 | 8.8 | 3.4 | 1.1 | 0.1 | 1.4 | 1.4 | 0.4 | 0.6 | 0.2 | 0.4 | 0.0 | 0.4 |
| asm | P | 0.01 | 43.7 | 7.9 | 26.6 | 11.2 | 4.2 | 0.8 | 0.5 | 0.1 | 0.8 | 0.8 | 0.3 | 0.2 | 0.9 | 1.6 | 0.1 | 0.3 |
| and-home | P | 0.01 | 21.1 | 13.2 | 37.5 | 11.2 | 7.4 | 2.4 | 1.0 | 0.1 | 1.3 | 1.2 | 0.4 | 0.5 | 1.0 | 1.2 | 0.1 | 0.3 |
