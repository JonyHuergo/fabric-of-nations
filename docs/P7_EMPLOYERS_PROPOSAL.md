# P7: new employers for the 1900 world — households, professional practices, shops and peasant farms

**Status:** approved by the designer ("yes, all of it", 2026-11-09) and implemented on
`prosperity/p7-labour`, uncommitted (DECISIONS.md D-154 step 3). Deviations from the text below:
the professional practice sells the existing good *finance and professional services* (good 55,
already demanded by households and firms) instead of a new `professional-services` good, so no
new demand calibration was needed; the uncovered-share state (R4/R6) was not implemented; practice
job mixes sized to unposted teachers, engineers and medics are deferred.
**Measured with:** the day-1 prototype `.cache-p7/proto/proto6.mjs` (built by `make-proto3.py`
… `make-proto6.py` from `proto2.mjs`), run on the generator dump of the occupation
distribution in `docs/P7_OCCUPATIONS_1900.md`. Output in `.cache-p7/proto/out-v6.md`.
**Not measured:** anything in the simulation. Incomes are the prototype's day-1 rule (wages +
owner profits at day-1 staffing, plus the new employers' payments). No test, typecheck or
benchmark was run; performance work is on hold.

---

## 1. The question

The step-3 world employs about half the census workforce, because only half of 1900 GDP has an
employer in the model. Could more building types, and the population itself as an employer,
close the gap honestly, so that the jobs come with output and payers? Yes. Four employers
missing from the model account for almost all of the remaining uncovered workers. Each is
historically documented and has a causal payer.

| Missing employer | 1900 reality | Who pays (causal) | In the model today |
|---|---|---|---|
| **Households employing servants** | 4-11 % of the occupied were domestic servants (13 countries, §3) | the employing household, from its income | nobody: servants counted as attendants compete for shop and service jobs |
| **Professional practices** | lawyers, private physicians, architects, consulting engineers, private teachers, writers and artists, clergy paid by congregations | households (middle and upper), firms, the state | academics have 0.35 M posts for 6.5 M people |
| **Owner-run shops** | most retail was small shops: in Germany in 1907, 61.6 % of trade persons worked in establishments of up to 5 persons (Jahrbuch 1910 p.63) | customers, through the retail margin P6 already charges | retail only in capitalist trading houses; 26.9 M shopkeepers have 2.0 M slots |
| **Peasant and family farms employing hands** | India's 17.6 M field labourers and Italy's 2.8 M day labourers worked for cultivators | the farm's owner-operator, from the farm's output | peasant farms have no hired jobs |

## 2. Measured effect (prototype, cumulative)

| Step | Uncovered (M) | Uncovered share of wage eligible | Output lost | World income (RUSD / person) |
|---|---:|---:|---:|---:|
| S8: the day-1 proposal's recommendation, on the new occupation distribution | 78.4 | 34.1 % | 11.3 % | 304 |
| S18: + movable buildings follow workers, sourced labour share, own-account shopkeepers and academics, laborers and attendants matched to jobs (`P7_OCCUPATIONS_1900.md` §10) | 30.0 | 15.3 % | 5.0 % | 326 |
| S24: + professional practices for the professionals without a post, + households hire servants from the lower-stratum workers firms leave unemployed, up to the census share | 12.5 | 5.7 % | 5.0 % | 351 |
| **S25: + peasant farms hire farm hands at the territory's sourced farm-hand share** | **3.7** | **0.9 %** | 5.6 % | 347 |

Variants tested and rejected:
- **Households hiring first** (S20, S23): it starves shops and services of attendants. Output
  lost rises to 7.4 % or 13.6 %. Households must hire from the workers that firms leave
  unemployed.
- **Farm-wage sizing of estate jobs** (S13): it adds jobs in the wrong provinces (8.5 % lost)
  until farm placement follows farm people.

S25 detail:
- *By profession* (eligible / capacity / uncovered, M): laborers 134.5 / 145.1 / 0.4;
  attendants 19.4 / 20.2 / 0.2; clerks 8.2 / 8.9 / 1.1; peasants 212.8 eligible, all
  employed by work-sharing on 110.0 M slots.
- *Uncovered share of wage eligible by territory:* UK 7.3 %, USA 4.7 %, Germany 2.4 %,
  Japan 0.4 %; France, Russia, Italy, Austria-Hungary, China, India, Spain and Brazil about 0.
- *Measured income (RUSD per person):* USA 2,512, UK 2,024, Germany 915, France 810,
  Russia 97, Italy 457, Austria-Hungary 486, Japan 198, China 72, India 42, Spain 312,
  Brazil 118.
- *Remaining output loss (5.6 %):* laborer slots on farms and in mines in provinces short of
  local hands (3.7 %), plus farmers, attendants and peasants. It shrinks when farm placement
  follows farm people (`P7_OCCUPATIONS_1900.md` §10.4).

## 3. Sources already in hand

- **Domestic servants** as a share of the occupied: Statistisches Jahrbuch für das Deutsche
  Reich 1909, Internationale Übersichten 9, p.14* (Häusliche Dienstboten; read on the page):

  | Germany 1907 | Austria 1900 | Hungary 1900 | Russia 1897 | Italy 1901 | Switzerland 1900 | France 1901 | Netherlands 1899 | Denmark 1901 | Sweden 1900 | Norway 1900 | UK 1901 |
  |---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
  | 1,264,755 | 478,756 | 385,324 | 1,617,489 | 482,080 | 86,225 | 956,195 | 197,511 | 92,356 | 212,753 | 98,413 | 1,739,828 |

  USA: servants and waiters 1,560,800 (Webb p.443). India: indoor servants, cooks and
  water-carriers 1,987,162 (Census 1901, Subsidiary Table V). The shares run from 1.4 %
  (India) to 11.2 % (Norway); other territories use a fit on ln real GDP per head.
- **Domestic wage:** HSUS D 757 (domestic service, 1901) $240 against D 755 (personal
  services) $330. The cash wage only: board and lodging come on top.
- **Farm-hand shares** by territory: the occupation distribution (census or rule).
- **Small retail:** Germany 1907 establishments by size (Jahrbuch 1910 p.63); France 1901
  commerce establishments by employees (Annuaire 1905 p.170).

**Still to source:**
- 1900 earnings of private professionals (the prototype pays them their reference wage);
- firms' and the state's purchases of professional services (no 1900 input-output table;
  provisional coefficients);
- an income gradient of servant-keeping (household budget studies: the Commissioner of Labor
  1903 already cached has "sundries" only);
- the share of retail margin earned by small shops.

## 4. Design

### 4.1 Households as employers of servants (new employer kind; no new good)

- **Demand:** each population block's demand for domestic service, in servant-years, is an
  Engel curve on its permanent income (P6 Q15), as a new P6 category *household service*
  with income elasticity above 1. It is calibrated so that each sourced territory's 1900
  demand equals its census servants. The wealthier strata hold most of it (aristocrats,
  capitalists, the professions, farmers).
- **Hiring:** after firms and institutions hire on a day (they have priority, as measured),
  households hire servants in their own province from the unemployed lower-stratum
  workers (attendants first, then laborers) at the domestic wage. The domestic wage is the
  attendant wage × 240/330 (sourced, cash), plus board in kind: the servant's food is
  bought by the employer, so it is part of the employer's spending, not new money.
- **Payment and output:** the wage moves from the employer block's account to the servant
  block's. The service is consumed by the employer; it is final consumption and enters
  measured GDP at its wage cost, as national accounts treat domestic service.
- **No-Mana:** servants exist only where an income pays them and a worker is free. Nothing
  accumulates.
- **Simulation change:** a third employer kind in the labour market (firms, institutions,
  households), a hiring step after firms, and a per-block servants count in the employment
  state (serialized, schema bump).

### 4.2 Professional services (new good, new building)

- **New good** `professional-services` (unit 1 RUSD of fees, like the other service goods):
  legal, medical private practice, architecture and engineering consulting, accounting,
  private tuition, arts and letters.
- **New building** `professional-practice`, owner-operated by its professionals:
  - jobs: academics, medics, engineers, teachers in the definition's mix, plus clerks;
  - owner: an owner-operator role for these professions, with the R2 work-sharing rule;
  - placement: in every province with such professionals, sized to them;
  - movable (it follows its people).
- **Buyers:**
  - households: a P6 *services* category, income-elastic, mainly the middle and upper tiers;
  - firms: input coefficients on `bank-and-office`, `trading-house` and the heavy-industry
    and power buildings (legal, accounting, engineering), provisional;
  - the state: the administration and health budgets buy a share of their services
    (courts, contracted physicians), provisional, within the budgets already sourced.
- **Clergy:** placed in academics until the religion stage, they earn through this good
  for now. The religion stage replaces that with congregations and tithes.

### 4.3 Owner-run shops (new building, existing good)

- **New building** `shop`: produces the existing `commerce` good (the retail margin P6 already
  charges). Owner: shopkeepers (work-sharing); jobs: shopkeepers and attendants (shop
  assistants), at a lower output per worker than the `trading-house`.
- **Split with trading houses:** placement divides each territory's commerce supply between
  shops and trading houses by the sourced small-establishment share (Germany 1907: 61.6 % of
  trade persons; France 1901: 92 % of commerce establishments had fewer than 5 employees, 311,722 of 338,490), and
  places shops wherever shopkeepers live (movable).
- **Check before adopting:** whether P6's commerce demand pays the census shopkeepers at
  their reference wage. If not, the retail margins (`retailCommercePerUnit`) are recalibrated
  against a sourced retail value added, not raised by assumption. The prototype's "shops
  earn their margin" step (S22, world income +24 RUSD per person) is an upper bound until
  this is measured.

### 4.4 Peasant and family farms employing hands (building data; no new good)

- `subsistence-farm`, `commercial-farm-peasant` and the family farms get laborer jobs. The
  hired share per territory comes from the occupation distribution, held as a per-territory
  job-mix variant of each peasant building in the generator, or as a province field read by
  the job remap.
- Wages are paid by the owner-operator from the farm's output: the peasant household as
  employer. Output is unchanged; the peasants' residual falls by the wage bill.
- Movable placement does not apply (land), so farm placement following farm people
  (`P7_OCCUPATIONS_1900.md` §10.4) is the companion step that removes most of the 3.7 %
  laborer output loss.

### 4.5 Left for their own stages

- *Housing and rent* (P9-P11): landlords and rental housing.
- *Public works and municipal services beyond the sourced budgets* (fiscal stage).
- *Congregations and tithes* (religion stage).
- *Households employing gardeners, coachmen and governesses beyond the servant count:* inside
  4.1 once the demand is calibrated.

## 5. What each needs

| Item | Data | Generator | Simulation | UI (phone) |
|---|---|---|---|---|
| 4.1 household servants | servant shares (read), domestic wage (read), Engel curve (provisional) | household-service demand category; day-1 servants per block | employer kind, hiring step, accounts, serialization, validation, conservation tests | pop panel: servants employed / kept; employment lens shows household jobs |
| 4.2 professional services | professionals' earnings, firm and state coefficients (provisional) | new good and building, placement, owner-operator role | owner-operator role for gated professions; demand from firms and state | new good in markets; practice in the building list |
| 4.3 shops | small-establishment shares (read), retail value added (to source) | new building, commerce split, placement | none (existing good and work-sharing) | building list |
| 4.4 farms hiring hands | farm-hand shares (computed) | per-territory job mix of peasant and family farms | none (owner-operators already pay hired jobs) | none |

Every coefficient goes to the constants module with units, source and status; every new data
row goes through `sources-author.mjs`; conservation of persons and money is tested for the new
hiring step.

## 6. Decisions requested

1. **Adopt the four employers?** Options: all four (recommended; measured uncovered 0.9 %);
   or 4.2-4.4 now and 4.1 (households) with the housing stage.
2. **Household hiring priority:** after firms (measured) or competing at the wage. Competing
   needs the wage rule to settle it over months, not on day 1.
3. **Professional-services buyers:** households only for now; or households, firms and the
   state with provisional coefficients.
4. **Shops:** split commerce with trading houses by the sourced small-establishment share
   (recommended); or keep trading houses as the only commerce producer and give shopkeepers
   craft workshops only.
5. **Order with the S18 package:** implement S18 first, then these four (two
   before/after reports); or both at once (one regeneration, one hash re-pin).

## 7. The UK and the USA (investigated after approval)

Measured on S25 (`.cache-p7/proto/proto6.mjs`, `DIAG_TERRS`):

| | Uncovered (M) | of which clerks | laborers | attendants | Cause |
|---|---:|---:|---:|---:|---|
| USA | 0.60 | 0.56 | 0.00 | 0.00 | the world clerk job share (× 0.575, R8) is sized on the world's census clerks; the USA's 885,000 bookkeepers and clerks (Webb p.443) need about the full clerk share |
| UK | 0.63 | 0.24 | 0.25 | 0.11 | clerks as in the USA; and the UK's placed economy covers only 27 % of UK GDP (P2b `coveredShareOfGdp` 0.274; Germany 0.514, Italy 0.730), so 4.8 M eligible laborers meet 3.5 M laborer slots |

**S26 = S25 + clerk job share per territory**, sized to its census clerks: clerk workers per
throughput unit × f, with f = (1 − u\*) × census clerks ÷ unscaled clerk slots, clamped to
[0.2, 1]; the rest go to laborers, or attendants in services. Result: world uncovered
2.97 M (0.5 %), output lost 5.3 %, income 349 RUSD per person. USA 0.9 %; UK still 7.3 %
(laborers 0.44 M, attendants 0.17 M).

**Also found:** placement puts `subsistence-farm` slots in the USA (2.54 M peasant slots),
a territory with no peasants. The day-1 split of owner-operators by placed farm jobs (S8)
then turns 4.4 M American farmers into peasants. R8's farm-job variants (peasant buildings
only where the census has peasants) are needed and are part of the implementation.

**The UK remainder is a coverage limit of the P5b/P6 economy, not a labour-market one.**
Britain's export manufacturing (cotton alone employed 515,000; Webb pp.430-431), shipping,
finance and overseas income are not placed at their 1900 scale. Fixing it belongs to the
economy calibration (export demand in P5b trade routes, and financial and shipping services);
it is recorded as a follow-up, not hidden by the labour market.
