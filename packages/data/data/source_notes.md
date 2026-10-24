# M2 data sources and calibration status

## Status

M2 has a **source-backed total world-population reference series** for
1900–2000, but the full demographic calibration remains **partial** because the
initial age structure and age-specific fertility/mortality schedules are still
provisional.

## Integrated population reference

File: `calibration/m2_population_targets.json`

- Metric: total world population.
- Geography: World.
- Units: persons.
- Period: 1899–2000; 1899 is included only to derive January 1, 1900.
- Source: Our World in Data, *Population* long-run series:
  - HYDE v3.3 (2023) for pre-1800;
  - Gapminder v7 (2022) for 1800–1949;
  - UN World Population Prospects 2024 for 1950 onward.
- URL: https://ourworldindata.org/grapher/population.csv?csvType=filtered&useColumnShortNames=true&country=World
- Access date: 2026-10-23.
- Confidence: medium. Post-1950 UN WPP is stronger; 1900–1949 uses Gapminder
  estimates. OWID notes possible breaks at source boundaries.
- License/attribution: Our World in Data (CC BY 4.0 as displayed at access;
  verify before redistribution). Cite OWID/Gapminder/UN WPP.

### Year convention and interpolation

OWID's annual values are treated as **mid-year** values, following UN WPP
practice. The simulation starts at January 1, so the reference comparison uses:

```text
Jan1(Y) = (value(Y - 1) + value(Y)) / 2
```

This is an explicit year-fraction interpolation, not a hidden mix of calendars.
The source's exact year convention should be rechecked against the OWID source
notes before the calibration is treated as final.

### GDD anchor discrepancy

| Year | GDD provisional anchor | OWID mid-year | OWID Jan 1 derived |
|---:|---:|---:|---:|
| 1900 | 1.650B | 1.627B | 1.621B |
| 1950 | 2.500B | 2.493B | 2.481B |
| 2000 | 6.100B | 6.172B | 6.130B |

The GDD anchors are rounded/provisional. The model scenario now starts at the
source-derived Jan 1, 1900 value (1,621,287,278 persons) rather than 1.65B. The
GDD anchors remain useful cross-checks but should not be treated as exact
year-start definitions.

**Recommendation:** revise the GDD anchor table to state whether each anchor is
mid-year or January 1, or replace the rounded anchors with the source-backed
series. Do not tune one model to both definitions; the current target is the
source-backed Jan 1 interpolation.

## Current calibration result

Run through the public tick path against the OWID Jan 1 interpolation:

| Year | Model | Source Jan 1 | Relative error |
|---:|---:|---:|---:|
| 1900 | 1,621,287,278 | 1,621,287,278 | 0.000% |
| 1950 | 2,479,824,315 | 2,480,507,938 | -0.028% |
| 2000 | 6,141,488,510 | 6,130,354,660 | +0.182% |

Maximum annual relative error: **3.707%** at 1924. RMSE across the 101 annual
samples: **1.907%**. These pass the 5% curve and 3% anchor checks against the
source-backed total, but this is not a full historical demographic validation.

The crude birth-rate anchors were adjusted by +0.3 per 1,000 from the earlier
provisional values (31.9/31.9/36.1/25.1 for 1900/1949/1950/2000) to reduce the
total-population error. Age-specific mortality, the 1900 age structure, and the
birth-rate anchors remain provisional inputs, not source-backed history.

## Demographic inputs still provisional

The source-backed total-population series is **not sufficient** to validate all
demographic inputs. Still missing or only stylized:

- 1900 age distribution by 17 five-year bands. The current distribution is a
  stylized young-population shape, scaled to the source-backed 1900 total.
- Age-specific mortality-rate anchors for 1900, 1950, and 2000. Current rates are
  provisional stylized reconstructions.
- Crude birth-rate anchors for 1900, 1949, 1950, and 2000. Current values are
  provisional and intentionally include a stylized 1950 transition to exercise
  the model; they are not source-backed.
- Fertility multipliers by profession. All M2 fixtures use 1.0.
- Profession/household-block shares for the multi-block fixture. These are
  synthetic test inputs, not historical estimates.
- Initial literacy, wealth, and militancy values. These are synthetic fixture
  values.
- Needs quantities and fixture prices. These are test definitions, not
  historical data.

## Needs

`needs.json` uses GDD good keys and provisional per-capita daily quantities.
Fixture prices and supply ratios are explicit test inputs, not historical
prices or production data.

## Source-backed work still required

- Source-backed 1900 age structure. Candidate sources (UN WPP historical
  reconstructions, Gapminder) were not integrated because their age-band
  definitions and 1900 estimates were not validated against the 17-band M2
  classification.
- Age-specific mortality and fertility series for the reference years. UN WPP
  2024 (https://population.un.org/wpp/) provides 1950+ age-specific data but its
  five-year age bands, year convention, and scenario variants still need mapping
  to the M2 cohort model.
- Pre-1950 age-specific mortality/fertility series; the current pre-1950 schedule
  is a stylized reconstruction, not a source-backed historical series.
- Profession/household composition. The current blocks are synthetic fixtures.
- A documented license/attribution review before redistribution.

## Test interpretation

- Mechanics verified by automated tests: conservation, aging, remainders,
  needs allocation, wealth/militancy effects, serialization, determinism.
- Total-population trajectory compared against the integrated OWID series:
  **source-backed total-population reference**, but still **partial calibration**
  because other demographic inputs are provisional.
- Historical calibration against a complete source-backed demographic dataset:
  **not yet verified**.
