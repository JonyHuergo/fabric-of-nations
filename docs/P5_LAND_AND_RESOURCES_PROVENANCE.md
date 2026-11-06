# P5 — Land and resources: data provenance (D-121, D-143)

Generated outputs are committed and checked with `node scripts/p5/build-p5-world.mjs --check`
(also run by the `p5-land` tests). Source extracts are regenerated on demand from
git-ignored caches (`.cache-p5/`, `.cache-hyde/`).

## 1. Land

| Item | Source | Processing | Output |
|---|---|---|---|
| Cropland, grazing land 1900 | HYDE 3.3 baseline (CC BY 3.0), as allocated to provinces in P2 (`docs/PROVINCE_GEOGRAPHY.md`) | unchanged | `historical/p5/provinces_1900.json` (`arableLandHa`, `pastureHa`, `landSource`) |
| Land use of buildings | authored (D-143 §1): subsistence, commercial, commercial-peasant and mechanised farms farm cropland; ranches farm grazing land | `scripts/p5/build-p5-world.mjs` | `historical/p5/buildings_definitions_1900.json` |
| Imputed land | 12 provinces whose 1900 farms stand on land HYDE does not record (small islands, land-mask gaps, Paris): the farms' jobs × the country's median hectares per farm job (world median when the country has none), bounded by the province's HYDE land area where known | same | `build_report.json` → `land.imputations` (confidence low) |

Day-0 farm output does not depend on land values: world creation divides each farm's
technique by its 1900 land factor (D-143 §1). Land bounds later expansion.

Known limitation: Guam, the German Caroline Islands (Pohnpei) and Monaco have no HYDE land
area, so their imputed cropland is unbounded (Guam 210,325 ha against a real area of about
54,000 ha). These farms are P2 data artefacts of tiny provinces.

## 2. Deposits

One deposit per (province, resource): coal, oil, gas, iron ore, copper ore, bauxite, tin,
gold, silver, nitrate, uranium, timber. Authored entries take precedence over MRDS sites,
and MRDS sites over SAGE/HYDE forest.

| Source | Use | Licence |
|---|---|---|
| Authored table `historical/p5/deposits_authored_1900.json` (221 entries) | Coal basins, oil and gas provinces, nitrate, uranium and the giant ore bodies, each with size class, quality, 1900 knowledge state and, if hidden, the prospecting technology that reveals it. Citations per entry: IGC 1913 *Coal Resources of the World*, IGC 1910 *Iron Ore Resources of the World*, Yergin (1991), Horn's giant-fields compilation (AAPG), Monteón (1982), OECD-NEA/IAEA Red Book 1999, USGS Mineral Commodity Summaries, Rothwell's *Mineral Industry* 1900 | cited facts; public-domain period sources |
| USGS MRDS CSV (`scripts/p5/extract-mrds.mjs` → `mrds_province_1900.json`) | 131,119 metal sites (iron, copper, aluminium/bauxite, tin, gold, silver, uranium); 129,443 placed inside province polygons, 83 to the nearest label within 0.5°, 1,593 unplaced | public domain (`Use_Constraints: none`) |
| SAGE potential vegetation, 5′ (Ramankutty & Foley 1999) with HYDE 3.3 land, cropland and grazing (`scripts/p5/extract-forest-1900.mjs` → `forest_province_1900.json`) | 1900 forest = forest-biome land not farmed or grazed in 1900: 46.9 M km² world-wide, 1,349 provinces | **no licence stated on the SAGE page (© University of Wisconsin); used with attribution — designer to confirm before release** |

Stock by size class (provisional; order-of-magnitude, not reserve estimates; units per
resource):

| Resource | S | M | L | G | SG |
|---|---:|---:|---:|---:|---:|
| Coal (t) | 1e8 | 1e9 | 1e10 | 1e11 | 1e12 |
| Oil (t) | 1e6 | 1e7 | 1e8 | 1e9 | 1e10 |
| Gas (thousand m³) | 1e6 | 1e7 | 1e8 | 1e9 | 1e10 |
| Iron (t Fe) | 2e6 | 2e7 | 2e8 | 2e9 | 2e10 |
| Copper (t Cu) | 5e4 | 5e5 | 5e6 | 5e7 | 2e8 |
| Bauxite (t) | 5e6 | 5e7 | 5e8 | 2e9 | 5e9 |
| Tin (t Sn) | 5e3 | 5e4 | 3e5 | 2e6 | 5e6 |
| Gold (kg) | 1e3 | 1e4 | 1e5 | 1e6 | 4e7 |
| Silver (kg) | 1e4 | 1e5 | 1e6 | 1e7 | 1e8 |
| Nitrate (t N) | 1e5 | 1e6 | 1e7 | 3e7 | 1e8 |
| Uranium (t U) | 1e3 | 1e4 | 1e5 | 5e5 | 1e6 |

MRDS sites: a large site holds the L stock, a medium site the M stock, a small or unsized
producer a tenth of S; uranium and iron sites one class lower (a US-heavy MRDS otherwise gave New York 2.9 billion t Fe). A province known in 1900 has a site
that produced or was discovered by 1900; otherwise its deposit is hidden behind geological
surveying (uranium: airborne geophysics). Timber: 180 / 120 / 90 m³ per ha of tropical /
temperate / boreal forest (FAO FRA 2020 growing-stock range).

Resulting 1900 world (generated `build_report.json`): 3,834 deposits; known stock /
total stock — coal 1.76e12 / 1.86e12 t; oil 2.1e9 / 1.27e11 t; gas 2.2e7 / 3.7e10
thousand m³; iron 1.1e10 / 1.9e10 t Fe; copper 7.9e8 / 9.8e8 t; gold 6.7e7 / 7.0e7 kg;
uranium 1e3 / 4.5e6 t U; standing timber 6.6e11 m³.

## 3. Prospecting knowledge

Three technologies (content, `technology.json`): geological surveying (era 1),
geophysical prospecting (era 2, after it), airborne geophysics (era 3, after it). They
have no other effect. Countries with a national geological survey by 1900 start knowing
geological surveying: GBR, USA, DEU, FRA, AUT, RUS, JPN, ITA, ESP, PRT, SWE, NOR, BEL,
CAN, AUS, NZL (founding years in `build_report.json`).

## 4. Limitations

- MRDS is about 85 % United States records, so US metal deposits are better resolved than
  elsewhere; outside the US the size classes and the authored giants carry the weight.
- Size classes and stocks are provisional; P15 calibrates.
- Oil and gas fields offshore are assigned to the nearest coastal province.
- No hydro-power sites yet (needed only when electricity is a good, P5b).
- The USGS website refused automated downloads of its historical price and production
  series (HTTP 403), which matters for P5b prices.
