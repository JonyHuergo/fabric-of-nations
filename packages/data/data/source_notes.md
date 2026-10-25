# M2.1 demographic sources and calibration status

## Status

M2.1 has:

- a **source-backed total world-population series** for 1900–2000 (OWID);
- **source-backed WPP 2024 age/sex and age-specific fertility/mortality
  reference values for 1950, 1975, and 2000**;
- a **WPP 1950-initialized validation scenario** for age-structure testing;
- **provisional** 1900 age/sex structure and 1900–1949 age-specific
  fertility/mortality schedules.

Full historical demographic calibration is **not complete**: the 1900 age
structure and pre-1950 age-specific schedules are not source-backed.

## Total population reference (1900–2000)

File: `calibration/m2_population_targets.json`

- Metric: total world population.
- Geography: World.
- Units: persons.
- Period: 1899–2000; 1899 is included only to derive January 1, 1900.
- Source: Our World in Data, *Population* long-run series (HYDE 2023;
  Gapminder v7 2022; UN WPP 2024).
- URL: https://ourworldindata.org/grapher/population.csv?csvType=filtered&useColumnShortNames=true&country=World
- Access date: 2026-10-23.
- Confidence: medium.
- License/attribution: OWID/CC BY 4.0 attribution; verify before redistribution.
- Year convention: OWID annual values are treated as mid-year; January 1
  comparison values are the average of adjacent mid-year values.

## WPP 2024 age/sex, fertility, and mortality references

File: `calibration/wpp_age_sex_reference.json`

Source: United Nations, *World Population Prospects: The 2024 Revision*,
https://population.un.org/wpp/.

Downloaded files (World, medium variant, access date 2026-10-23):

- `WPP2024_Population1JanuaryBySingleAgeSex_Medium_1950-2023.csv.gz`
- `WPP2024_PopulationBySingleAgeSex_Medium_1950-2023.csv.gz`
- `WPP2024_DeathsBySingleAgeSex_Medium_1950-2023.csv.gz`
- `WPP2024_Fertility_by_Age5.csv.gz`

### Definitions and units

- Population: persons, WPP **1 January** estimates for age structure.
- ASFR: live births per 1,000 women per year, by five-year maternal age group.
- Mortality: central death rate per 1,000 person-years, derived as age-sex
  deaths divided by mid-year age-sex population for the same year.
- Geography: World.
- Variant: Medium.
- Age/sex validation reference years stored in `wpp_age_sex_reference.json`:
  1950, 1975, 2000.
- ASFR and sex-specific mortality are integrated **annually for every year
  1950–2000** in `demography.json`; the model does not interpolate only three
  benchmark years.

### Age-band mapping

WPP five-year bands map directly to the simulation's 17 reporting bands:

`0-4, 5-9, ..., 75-79, 80+`.

Within a five-year band, the simulation expands the source total uniformly
across five single-year ages (terminal 80+ remains at age 80). This is an
explicit assumption; WPP does not provide the single-year age resolution used
internally by M2.1 for every published aggregate.

ASFR maternal bands:

`15-19, 20-24, 25-29, 30-34, 35-39, 40-44, 45-49` → seven simulation maternal
bands. Ages 10–14 are excluded; M2.1 treats reproductive age as 15–49.

### TFR consistency check

TFR implied by the integrated annual ASFR schedules (`sum(ASFR) * 5 / 1000`):

| Year | Implied TFR |
|---:|---:|
| 1950 | 4.8268 |
| 1975 | 4.0546 |
| 2000 | 2.7357 |

These are consistency checks only; TFR is not substituted for ASFR. Annual WPP
ASFR values are used directly for 1950–2000.

### Mortality limitations

- Mortality is derived from deaths and mid-year population, not from a published
  `mx` table; source rounding and denominator choices introduce small uncertainty.
- Rates are mapped to single-year ages by applying the five-year band rate to
  each age in that band.
- The 80+ rate is applied to the open-ended 80+ aggregate.

## WPP 1950 validation scenario

File: `scenarios/m2_wpp_1950_validation.json`

- Starts at 1 January 1950 with WPP 1950 age/sex groups.
- Total: 2,471,424,002.
- Used only to validate 1975 and 2000 age structure; it is not the campaign
  start and is not a source for 1900.
- Single-year expansion from the 1950 five-year groups is uniform; 80+ remains
  open-ended.
- `World.startDayIndex` is 1950-01-01 for this scenario, so the initial January 1
  is not aged before the first simulated day.

## 1900 initial population and pre-1950 schedules

The campaign starts at January 1, 1900 with total **1,621,287,278** from the OWID
January 1 interpolation.

**The 1900 age/sex distribution is provisional.** The previous stylized
17-band age shares were retained and split by WPP 1950 age-specific sex shares.
This is a projection assumption, not a 1900 source. It is not presented as a
historical age structure.

**1900–1949 ASFR and mortality are provisional.**

- 1900 ASFR: WPP 1950 schedule × 1.05 (implied TFR ≈ 5.07).
- 1949 ASFR: WPP 1950 schedule × 1.00.
- 1900/1949 mortality: the earlier stylized age-band schedule, duplicated by
  sex, multiplied by **1.45** and capped at 1,000 per 1,000. This factor is a
  total-population calibration of provisional rates, not a historical mortality
  observation. It was selected to align the pre-1950 trajectory with the
  source-backed OWID/WPP 1950 total.

These provisional inputs must be replaced by source-backed historical age
structure and age-specific schedules before claiming full demographic
calibration.

## Campaign gameplay baseline result

The campaign is a **no-shock gameplay baseline**, not the historical validation
configuration. It uses the provisional 1900 age/sex distribution and pre-1950
schedules.

Public tick path, aggregate campaign scenario, January 1 samples:

| Year | Model | Source Jan 1 | Relative error |
|---:|---:|---:|---:|
| 1900 | 1,621,287,278 | 1,621,287,278 | 0.000% |
| 1950 | 2,454,331,503 | 2,480,507,938 | -1.055% |
| 2000 | 6,715,972,921 | 6,130,354,660 | +9.553% |

- Maximum annual relative error: **9.553%** at 2000.
- RMSE across 101 annual samples: **5.320%**.
- Full-century aggregate hash: `d421eaf5f04a207b` (seed 20261023, schema 4).

The 2000 excess is not a coefficient failure: the campaign's 1950 age/sex
composition is materially younger than WPP because the 1900 distribution and
pre-1950 schedules are provisional. That composition produces more women in
reproductive ages and lower old-age mortality than WPP. It is documented rather
than tuned away with a safety margin.

### Campaign 1950 versus WPP 1950

| Metric | Campaign | WPP | Absolute difference |
|---|---:|---:|---:|
| Total | 2,454,331,503 | 2,471,424,002 | -17,092,499 |
| Male | 1,256,665,701 | 1,230,604,799 | +26,060,902 |
| Female | 1,197,665,802 | 1,240,819,203 | -43,153,401 |
| Women 15–49 | 637,625,086 | 617,119,833 | +20,505,253 |
| Expected annual births at 1950 schedules | 95,854,757 | 90,456,385 | +5,398,372 |
| Expected annual deaths at 1950 schedules | 39,850,043 | 47,854,576 | -8,004,533 |

The 1950 five-year shares are also too young: 0–14 is about 39.0% versus 34.7%
in WPP; 50+ is about 7.7% versus 15.6%. Male excess is largely because the
provisional 1900/1949 mortality is duplicated by sex; WPP has higher male
mortality. The campaign 1950 total is close, but its age/sex composition is not
a historical validation result.

## WPP 1950-initialized historical validation

The WPP-initialized scenario uses the source-backed 1950 age/sex distribution and
source-backed annual 1950–2000 ASFR/mortality.

| Year | Model total | WPP total | Total error | Max five-year share difference | Male-share difference |
|---:|---:|---:|---:|---:|---:|
| 1950 | 2,471,424,002 | 2,471,424,002 | 0.00% | 0.00 pp | 0.00 pp |
| 1975 | 4,041,822,105 | 4,034,031,762 | +0.193% | 1.08 pp | -0.085 pp |
| 2000 | 6,205,160,776 | 6,129,943,964 | +1.227% | 0.55 pp | -0.185 pp |

Cumulative model vs WPP flows for 1950–1999:

| Flow | Model | WPP | Error |
|---|---:|---:|---:|
| Births | 6,117,076,588 | 6,089,003,488 | +0.461% |
| Deaths | 2,383,339,814 | 2,430,494,039 | -1.939% |
| Net change | 3,733,736,774 | 3,658,509,449 | +2.057% |

The annual-source schedules remove the previous 5.2–5.5% shortfall. Before this
correction, using only 1950/1975/2000 anchors produced 5,683,675,382 births and
2,363,974,692 deaths, ending at 5,791,124,003. The shortfall was primarily the
missing 1960s fertility peak and annual fertility decline, not an age-transition
or newborn-assignment defect. The remaining +1.2% total difference is small and
is not tuned away.

The full validation-regression digest is `858773b2d559b2fc` (schema 4).

## GDD anchor discrepancy

| Year | GDD provisional anchor | OWID mid-year | OWID Jan 1 derived |
|---:|---:|---:|---:|
| 1900 | 1.650B | 1.627B | 1.621B |
| 1950 | 2.500B | 2.493B | 2.481B |
| 2000 | 6.100B | 6.172B | 6.130B |

The GDD anchors are rounded/provisional. The campaign starts from the source-
derived Jan 1, 1900 value. Recommend explicitly defining the GDD anchors as
mid-year or January 1, or replacing them with the source-backed series.

## Financial-budget deviation

GDD §6.2 describes daily needs funding from household financial assets plus
income received, less mandatory payments. M2/M2.1 use **annual disposable
income only** and do not draw down savings. This is a documented, task-mandated
deviation; account balances are unchanged and are not used to finance needs.

## Performance

The single-year, sex-separated state increases work relative to the 17-band M2
model. M2.1 benchmarks use 200/1,000/3,000/6,000 blocks and report Node timings;
these are not mobile evidence. See README/DECISIONS for latest measurements.

## Sources still missing

- Source-backed 1900 age structure and pre-1950 age-specific fertility/mortality.
- A published source for the sex ratio at birth; the current 1.05 male/female
  ratio is provisional.
- Exact single-year within-band distribution; the current expansion is uniform.
- A full WPP-derived mortality table rather than deaths/mid-year-population
  derivation.
- Independent US Census benchmark cross-check.
- Full historical demographic calibration; total-population agreement is not
  sufficient to claim it.

## M3a provisional economy inputs

The M3a economy catalog is synthetic and provisional, not historical
calibration:

- `goods.json`: eight goods. Base prices, transport costs, elasticities, and
  spoilage rates are provisional units of SUSD per physical unit; spoilage is set
  to zero because spoilage is deferred. `unitLabel` documents the physical unit.
- `professions.json`: four professions. Participation rates, qualification
  thresholds, base annual wages (SUSD/worker-year), training costs, and
  dimensionless productivity modifiers are provisional.
- `buildings.json`: eight definitions. Recipe quantities are physical units per
  TU; staffing coefficients are workers per (TU/day); upkeep and construction
  costs are SUSD; storage capacities are physical units. Resource requirements
  are empty because regional resource limits are deferred.
- `m3_needs.json`: per-capita daily basket quantities in the good's physical
  unit. Service lines are omitted because non-storable services are deferred.
- `scenarios/m3_small_economy.json`: synthetic population, initial stock, prices,
  accounts, and employment assignments. It is a structural fixture, not a
  historical scenario.

These values are not source-backed, calibrated, or historically validated.
M3a implements only definitions, state, validation, serialization, and the cash
ledger; no production, employment matching, market clearing, wages, or pricing
behavior exists.
