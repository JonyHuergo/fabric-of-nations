# P7: where the 1900 buildings stand inside each territory — sourced shares and a workforce rule

**Status:** approved by the designer, 2026-11-10 ("Good, I approve everything"), with a
standing principle that amends §4: *"the availability or future availability of a resource
doesn't have anything to do with the initial buildings in the region, otherwise there wouldn't
be any reason to build."* Resources decide only whether a province can host a building; the
weights below no longer use stock, quality, hectares or potential. In implementation. The P2b scaling fix (D-154 item 5e) is
in the working tree, uncommitted.
**Measured with:** read-only scripts over the generated step-3 data (after item 5e) and one
simulated day of the 1900 world (scratchpad `missing.mjs`, `proto-dist.mjs`, `proto-land.mjs`,
`rows-est.mjs`). Historical statements marked *(to source)* are not yet read on a page; they are
what the sourced shares in §3 are meant to establish or correct.
**Not run:** benchmarks (performance hold).

---

## 1. The finding

`placeCatalogue` (scripts/p5b/placement.mjs, `provinceWeights`, `placeInTerritory`) puts each
P5b producer of a territory in at most four provinces (`MAX_PROVINCES_PER_TERRITORY`), the
heaviest by one weight, and splits the levels by that weight:

| Building kind | Weight today |
|---|---|
| mine, oil field, logging camp (`extracts`) | the deposit's initial stock × quality |
| farm with a land use | arable or pasture hectares |
| crop with a latitude band (cotton, sugar, plantation, rubber, silk) | arable hectares + 1 |
| everything else | urban population + 1 |

The weight measures reserves and land, not where production stood in 1900. Placed levels in the
step-3 data:

| Building | Placed | 1900 *(to source)* |
|---|---|---|
| US logging | Alaska 228 of 309 levels (64,000 people) | Lake States, Pacific Northwest, South |
| Russian logging | Yakutsk 471, Yeniseysk 287, Kamchatka 185, Tobolsk 175 | European north and centre |
| Indian logging | Burma, Frontier Divisions, Assam, Central Provinces (2,300-2,635 each) | — |
| US coal | Wyoming, Pennsylvania, Illinois, West Virginia, 80 levels each | Pennsylvania far ahead |
| US oil | California 91 of 94 | Pennsylvania, Ohio, West Virginia |
| US gold / copper | Nevada first in both | Colorado and California / Montana, Michigan, Arizona |
| US cotton | Iowa, Kansas, Missouri, Illinois | the South |
| US cane sugar | Texas 31, Alabama 15, Louisiana 9 | Louisiana |
| DEI sugar | South Sumatra, Riau and Jambi, North Sumatra, West Borneo | Java |
| Brazil coffee and sugar | Rio Grande do Sul first | São Paulo and Minas; the Northeast |
| Indian tea (plantation) | Bombay, Central Provinces | Assam, Bengal |

Day 1 of the simulation: building jobs that their province cannot fill are 40 % of the 24.2 M
jobs of deposit buildings, 3 % of the 126 M of land buildings and 6 % of the rest. The US
livestock price failure (P2b test D-136) follows from it: US logging staffed at 34 % → US
timber 27.5 k a day against 73 k used → no timber on day 2 → no paper → no commerce → no
household reaches tiers 3 and 6 → food stocks pile up and prices fall 3-5 % a day.

The province populations and their professions (P4, P7) are not in question.

## 2. Scope

**In scope:** the P5b producers with a land use, a deposit or a latitude band — logging camp,
market garden, cotton farm, plantation, dairy farm, coal mine, sugar estate, beet-sugar works,
silk farm, tobacco farm, gold, oil, rubber estate, tin, copper, iron, silver, nitrate and bauxite
(1,514 rows today) — and the hydro stations (the four largest potentials; same rule, §4).

**Out of scope:** the P2b producers (subsistence, peasant and commercial farms, ranches,
fisheries, food processing, textiles, workshops), which keep their P2b rows and are already
spread over most provinces; movable buildings (they already follow the workers, D-154 item 4);
the territory totals (sourced country shares and local demand stay as they are).

## 3. Sourced shares (tier 1)

Where a 1900 source gives production (or acreage, or output value) by state or province, the
territory's levels are split by those shares. Each row is transcribed into
`historical/p7/sources_1900.json` as keyed `distributionRows` with page locators (the existing
format), mapped to the game's provinces. Proposed list, by economic weight:

| Territory | Buildings | Source | Status |
|---|---|---|---|
| USA | coal, gold and silver mines, cotton, cane sugar, tobacco, iron ore (pig iron as now, by state) | Statistical Abstract of the United States 1901: tables 86 (coal by state, p.357), 23 (gold and silver by state, p.50), 99 (cotton by state, p.379), 79 (Louisiana and other Southern sugar, p.350), 100 (tobacco by state, p.382), 88 (pig iron by state, p.363) | on hand (`.cache-p5b/census-statab-1901`, scanned; read by rendering) |
| USA | copper, petroleum | The Mineral Industry 1900 (production by states) | on hand (`.cache-p5b/ia-ocr/mi1900-layout.txt`) |
| USA | logging | Twelfth Census 1900, Manufactures, lumber and timber products by state | download (census.gov, public domain) |
| USA | dairy, market garden | Twelfth Census 1900, Agriculture (dairy products, vegetables by state) | download, or the rule if not found |
| British India | tea, cotton, sugar, tobacco, coal, logging | Statistical Abstract relating to British India (1891-92 to 1900-01): crop acreage by province, tea, coal by province, forest outturn | download (archive.org, public domain) |
| Dutch East Indies | sugar, coffee, tobacco | Koloniaal Verslag 1901 (by residency) | on hand |
| Brazil | coffee, sugar, rubber | United States of Brazil 1901 (Bureau of the American Republics); Coffee (IBA 1909) | on hand |
| Germany | coal, beet sugar, logging | Statistisches Jahrbuch für das Deutsche Reich 1909/1910 (Oberbergamt districts; sugar factories by state; forest area) | on hand |
| Russia | beet sugar, coal, gold, logging | a public-domain survey with guberniya figures (e.g. *The Industries of Russia*, 1893, or *Russia: its industries and trade*, 1901) | to find; ask before any HathiTrust copy |
| Austria-Hungary | coal, beet sugar | Österreichisches Statistisches Handbuch c.1900 | to find |
| Japan | coal, copper, silk | Financial and Economic Annual of Japan 1906 | on hand (`jpn-fea-1906`) |

Territories and goods without a source take the rule (§4); China has none (as for occupations).
A source unit that spans several game provinces is split among them by the rule; a source unit
whose provinces cannot host the building (no deposit, outside the band) is reported, and its
share goes to the territory's other host provinces by the rule.

## 4. The rule (tier 2)

For a territory without a sourced share, each host province p (a province that can host the
building: deposit, land use, latitude band and technology, as today) gets the weight

- mines, oil, crops, dairy, market gardens: **w(p) = workers(p)**, the ungated eligible
  workers of its P7 blocks (laborers, peasants and farmers of working age × participation).
  The deposit, land use and latitude band decide only whether p can host the building
  (designer's principle above); the 1900 industry stood where the people worked it.
- logging camps: **w(p) = population(p)** over the provinces with a discovered timber stock. In
  1900 timber was cut close to where it was used (bulky, low value per tonne); the territory's
  placed timber already equals its own demand.
- hydro stations: workers, as above, each province still bounded by its own hydro capacity
  (a physical limit on the station, not a weight).

Levels go to every host province by weight (no four-province cap). A province that would get
less than one level is dropped and its share redistributed over the rest (at least one row per
territory), the same minimum-size idea as D-148's consolidation.

## 5. What it changes

- Building rows: 1,514 placed rows become about 2,700 (estimate; 16,365 → about 17,550 in all,
  +7 %). Performance is for the designer to test.
- Day-1 vacancies of deposit buildings should fall from 40 % towards the land buildings' 3 %;
  the P7 R3 split will move professions within each province towards the new jobs (province
  totals unchanged).
- Modelled output by province changes; territory totals do not (same territory targets).
- A regenerated before/after (P5b, P6, P7), the 1900-world hash and the digest pins after
  review, as before.
- New regression tests: (a) each sourced share is reproduced in the placed levels within
  rounding; (b) no placed building has more ungated jobs than a stated share of its province's
  eligible workers (reported per definition, threshold to agree); (c) the US livestock week
  test passes again (expected, not assumed).

## 6. Found on the way, not in this change (reported)

- **Logging volume:** 22 M logging jobs in the world, 9.6 M of them in India, about eight times
  the US jobs per person. It comes from India's low technique factor (more workers per unit),
  not from distribution. To look at after this change, with the timber demand of home building.
- **Baku:** 300 levels of oil field, about 300,000 jobs, against 144,000 eligible laborers in
  the province; the location is right, the labour per tonne may not be.
- The cascade is fragile by rule: goods open with one day of stock, producers buy only from
  opening stock, and any unmet tier-1 good closes tiers 3 and 6 for the whole market.

## 7. Questions

1. Approve the source list in §3 and the downloads it needs (census.gov, archive.org), each in
   its own folder under `.cache-p7/`.
2. Approve the rule in §4: workers (amended from suitability × workers by the designer's
   principle); logging by population; no four-province cap; one level minimum per row.
3. Order: US and British India first (the largest gaps), then DEI, Brazil, Germany, Japan,
   Russia, Austria-Hungary; one regeneration and before/after at the end, or one per batch?
