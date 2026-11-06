# P4 — WPP comparison report (validation only)

Game: no-input run of the 1900 world (country AI as in the game, no player actions), seed 20261023, indicators at 1 January of each year from today's levels and age structure (`packages/bench/src/p4Demography.ts`). Regions: UN continental region of each province's modern country (`historical/p4/province_modern_country_1900.json`). WPP: UN World Population Prospects 2024 estimates (`validation/wpp_regions_1975_2000.json`). WPP is never a simulation input (D-124).

Last year reached by the run: **1993**.

Run status: P5 branch (D-143). The run passed the P4 stop of 1917 (fixed, P5 report §7.1) and stopped on simulated day 34,058 (1 February 1993): the P4 validator rejected a block's derived fertility level of 4.009 (range 0..4). Literacy and towns had collapsed (women literate 6.9 %, urban 2.4 %) because households without farms still cannot buy food, so the causal fertility of one block exceeded the P4 bound. A P4 model limit for the designer, not clamped (P5 report §8). The 2000 comparison could not be produced.

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

## 1925 — game only

| Region | TFR | e0 | CBR | CDR | Urban % | Women literate % | Food % | Pop. (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Africa | 5.16 | 16.7 | 45.6 | 52.1 | 3.9 | 24.5 | 60.5 | 106 |
| Asia | 4.44 | 19.9 | 38.0 | 44.4 | 4.5 | 35.7 | 71.5 | 683 |
| Europe | 4.36 | 27.8 | 37.1 | 34.9 | 21.0 | 49.7 | 59.5 | 457 |
| Latin America and the Caribbean | 5.76 | 18.1 | 48.8 | 52.8 | 15.3 | 12.4 | 63.0 | 56 |
| Northern America | 4.07 | 34.5 | 33.1 | 27.7 | 26.6 | 49.6 | 54.4 | 102 |
| Oceania | 4.61 | 38.6 | 35.9 | 25.7 | 28.6 | 47.6 | 68.7 | 8 |
| World | 4.50 | 22.7 | 38.3 | 40.9 | 12.0 | 39.4 | 65.2 | 1411 |

## 1950 — game only

| Region | TFR | e0 | CBR | CDR | Urban % | Women literate % | Food % | Pop. (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Africa | 5.54 | 18.4 | 43.2 | 49.3 | 1.3 | 34.4 | 68.4 | 93 |
| Asia | 4.77 | 24.4 | 36.5 | 39.8 | 1.4 | 48.6 | 85.4 | 600 |
| Europe | 5.32 | 34.1 | 40.0 | 29.6 | 12.0 | 50.6 | 76.1 | 541 |
| Latin America and the Caribbean | 6.61 | 18.2 | 52.0 | 54.1 | 7.9 | 10.3 | 68.6 | 54 |
| Northern America | 5.09 | 40.2 | 36.8 | 24.3 | 13.7 | 46.6 | 73.1 | 131 |
| Oceania | 4.20 | 37.0 | 34.1 | 26.6 | 18.6 | 44.7 | 61.8 | 9 |
| World | 5.13 | 28.4 | 38.8 | 35.6 | 6.9 | 46.7 | 78.8 | 1429 |

## 1975 — against WPP 2024

| Region | TFR game | TFR WPP | e0 game | e0 WPP | CBR game | CBR WPP | CDR game | CDR WPP | Pop. game (M) | Pop. WPP (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Africa | 6.20 | 6.69 | 18.7 | 46.8 | 47.1 | 46.5 | 51.0 | 18.6 | 89 | 418 |
| Asia | 5.65 | 4.43 | 25.0 | 56.6 | 41.7 | 31.8 | 40.2 | 11.6 | 605 | 2389 |
| Europe | 6.31 | 2.07 | 32.1 | 70.9 | 46.6 | 15.2 | 31.7 | 10.3 | 777 | 677 |
| Latin America and the Caribbean | 6.90 | 4.64 | 19.2 | 61.3 | 55.0 | 34.3 | 52.6 | 9.2 | 58 | 322 |
| Northern America | 5.99 | 1.81 | 41.9 | 72.6 | 42.4 | 15.1 | 22.8 | 8.6 | 208 | 242 |
| Oceania | 5.19 | 2.93 | 39.2 | 68.7 | 38.1 | 21.9 | 23.6 | 8.2 | 13 | 22 |
| World | 6.05 | 4.08 | 29.3 | 58.3 | 44.6 | 29.7 | 35.2 | 11.7 | 1749 | 4071 |

## 1993 — game only

| Region | TFR | e0 | CBR | CDR | Urban % | Women literate % | Food % | Pop. (M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Africa | 6.60 | 18.6 | 50.5 | 52.1 | 0.3 | 3.5 | 70.7 | 91 |
| Asia | 6.07 | 23.8 | 45.1 | 42.7 | 0.1 | 5.2 | 85.2 | 650 |
| Europe | 6.53 | 27.7 | 49.5 | 37.0 | 3.9 | 7.0 | 62.4 | 1022 |
| Latin America and the Caribbean | 6.96 | 18.0 | 55.0 | 54.6 | 5.2 | 1.4 | 67.8 | 63 |
| Northern America | 6.22 | 32.2 | 47.0 | 31.4 | 2.1 | 12.4 | 59.5 | 297 |
| Oceania | 5.66 | 37.9 | 42.1 | 24.6 | 5.0 | 7.5 | 66.4 | 18 |
| World | 6.36 | 26.4 | 48.0 | 39.0 | 2.4 | 6.9 | 69.5 | 2141 |

## 2000 — against WPP 2024

Not reached: the run ended in 1993.

## Reading the comparison

Differences are diagnostics for P15, which calibrates the provisional P4 coefficients only after a structural cause is identified (GDD §6.6). They are not corrected by forcing any trajectory.
