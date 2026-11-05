# P4 — WPP comparison report (validation only)

Game: no-input run of the 1900 world (country AI as in the game, no player actions), seed 20261023, indicators at 1 January of each year from today's levels and age structure (`packages/bench/src/p4Demography.ts`). Regions: UN continental region of each province's modern country (`historical/p4/province_modern_country_1900.json`). WPP: UN World Population Prospects 2024 estimates (`validation/wpp_regions_1975_2000.json`). WPP is never a simulation input (D-124).

Last year reached by the run: **1917**.

Run status: the run stopped on simulated day 6,320 (April 1917): the rollback runner rejected the day because a market sale had a total that was zero or not finite (settlement invariant `pendingTransactions[7250].totalRUSD must be finite and strictly positive`), after seventeen years in which households could afford about a third of their food. This is an economic-model failure, not a demographic one; the 1975 and 2000 comparisons could not be produced (P4 completion report §7).

## 1900 — game only

| Region | TFR | e0 | CBR | CDR | Urban % | Women literate % | Food % | Pop. (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Africa | 6.52 | 32.4 | 47.9 | 32.0 | 7.8 | 7.5 | 100.0 | 125 |
| Asia | 5.71 | 29.8 | 43.1 | 34.0 | 9.3 | 12.7 | 100.0 | 895 |
| Europe | 5.06 | 39.3 | 37.2 | 24.5 | 28.9 | 62.1 | 100.0 | 413 |
| Latin America and the Caribbean | 6.09 | 31.8 | 45.3 | 32.1 | 24.3 | 21.3 | 100.0 | 64 |
| Northern America | 3.89 | 49.2 | 28.2 | 18.1 | 39.6 | 84.3 | 100.0 | 82 |
| Oceania | 4.09 | 44.6 | 30.6 | 19.9 | 31.9 | 73.5 | 100.0 | 6 |
| World | 5.52 | 32.9 | 41.2 | 30.4 | 16.6 | 29.2 | 100.0 | 1584 |

## 1917 — game only

| Region | TFR | e0 | CBR | CDR | Urban % | Women literate % | Food % | Pop. (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Africa | 3.26 | 8.3 | 38.6 | 61.3 | 7.0 | 18.6 | 19.4 | 76 |
| Asia | 2.46 | 6.7 | 29.3 | 61.2 | 8.8 | 27.8 | 11.6 | 494 |
| Europe | 4.28 | 23.7 | 38.4 | 39.3 | 26.2 | 50.4 | 50.7 | 455 |
| Latin America and the Caribbean | 3.17 | 11.2 | 36.5 | 56.8 | 23.8 | 15.9 | 22.3 | 41 |
| Northern America | 4.33 | 32.5 | 33.9 | 30.6 | 31.9 | 55.8 | 55.4 | 100 |
| Oceania | 4.43 | 38.0 | 35.4 | 26.8 | 32.0 | 52.1 | 68.1 | 7 |
| World | 3.29 | 14.8 | 34.1 | 49.7 | 18.1 | 36.3 | 31.7 | 1173 |

## 1925 — game only

Not reached: the run ended in 1917.

## 1950 — game only

Not reached: the run ended in 1917.

## 1975 — against WPP 2024

Not reached: the run ended in 1917.

## 2000 — against WPP 2024

Not reached: the run ended in 1917.

## Reading the comparison

Differences are diagnostics for P15, which calibrates the provisional P4 coefficients only after a structural cause is identified (GDD §6.6). They are not corrected by forcing any trajectory.
