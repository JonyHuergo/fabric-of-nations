# M12e completion report — Oceania and global land-gap provincialization

**Milestone:** M12e (Oceania and global land gaps), the counterpart of M12a Europe,
M12b Asia, M12c Africa and M12d Americas.

**Status:** implemented and verified; **not committed** (the working tree also
contains the uncommitted M12a-M12d work). The four committed continental bundles,
their ids, keys and generated app bundles are preserved unchanged; the shared
build library was extended additively (`detached`/gap support) and the earlier
builds still read their own committed output. The visual review has been
performed; the designer may request changes before the commit.

## 1. Files created or modified

### Created

- `scripts/m12e/oceania-plan.mjs` — authored Oceanian and global-gap province
  inventory, future-polity registry and stable ids.
- `scripts/m12e/build-oceania-provinces.mjs` — deterministic build: seeds the four
  earlier bundles, builds the Oceanian and gap provinces, adds cross-feature and
  straight-frontier seams, and writes the bundle, audit and generated app bundle.
- `scripts/m12e/generate-oceania-doc.mjs` — generates
  `docs/OCEANIA_PROVINCIALIZATION.md` from the committed bundle.
- `scripts/m12e/audit-successors.mjs` — standalone twentieth-century state and
  land-border audit.
- `scripts/m12e/audit-global-land.mjs` — the global land-coverage audit; writes
  `packages/data/data/map/global_land_audit.json`.
- `scripts/m12e/playtest-screenshot-oceania.mjs` — the real exported-campaign
  screenshot playtest.
- `packages/data/data/map/provinces_oceania_1900.json` — the committed Oceania and
  gap bundle (151 provinces).
- `packages/data/data/map/provinces_oceania_1900_audit.json` — its build audit.
- `packages/data/data/map/global_land_audit.json` — the global land audit result.
- `packages/app/src/generated/provincesOceania1900.ts` — the generated app bundle.
- `packages/tests/src/m12e-oceania-provinces.test.ts` — the M12e suite (40 tests).
- `docs/OCEANIA_PROVINCIALIZATION.md` — the generated milestone document.
- `docs/images/m12e-oceania-*.png` — 21 review screenshots.
- `M12E_COMPLETION_REPORT.md` — this report.

### Modified

- `scripts/m12/province-build-lib.mjs` — generic `detached` provinces, gap
  provinces (`feature-residual`, `land-ring`, `authored`), automatic land-ring
  closure, precise (6-decimal) area, and MultiPolygon normalisation in
  `unionPolygons`. The earlier bundles are unchanged.
- `packages/data/src/provinces.ts` — five-bundle loader (Europe, Asia, Africa,
  Americas, Oceania) with collision checks and one polity registry.
- `packages/app/src/provinceMapBundle.ts` — five-bundle render/catalogue merge.
- `packages/tests/src/m12a-provinces.test.ts` — combined-count assertion includes
  Oceania; the Austria-Hungary dissolution helper also transfers the M12e Austrian
  Littoral provinces (Krk/Cres to Yugoslavia, the residual to rump Austria).
- `packages/tests/src/m12b-asia-provinces.test.ts`,
  `m12c-africa-provinces.test.ts`, `m12d-americas-provinces.test.ts` — combined
  counts and border/polity totals include Oceania; every per-bundle assertion is
  preserved.
- `packages/tests/src/m11c1-rendering.test.ts` — the land-mask path assertion now
  expects the two paths (fill and coastline re-stroke) that the M12a rendering
  contract introduced; both must still be inside the zoom transform.
- `packages/sim-worker/src/generated/worldScenario.ts` and
  `packages/app/src/generated/simWorker.ts` — regenerated from the five-bundle data.
- `DECISIONS.md` — D-108.
- `.gitignore` — ignores the local `.cache-m12e/` scratch directory.

## 2. Behaviour implemented

- **Five-bundle catalogue.** Europe + Asia + Africa + Americas + Oceania are loaded
  by one loader in `packages/data/src/provinces.ts` and one render merge in
  `packages/app/src/provinceMapBundle.ts`, with unique ids, one merged border list
  and one polity registry. `World` schema stays 27, the save envelope and worker
  protocol are unchanged.
- **Permanent geography, mutable ownership.** Provinces have stable ids and
  geometry; owner, controller, occupation date, claims and special status are
  mutable simulation state. Country borders are derived from current province
  ownership; the 1900 polity outlines are used only while the province union still
  equals them.
- **Inventories.** 151 Oceanian/gap provinces in 34 map features, 21 owners, 586
  shared border pairs, 25 registry polities (17 future + 8 historical/breakaway),
  24 feature-residual provinces and 0 automatic land-gap provinces (the safety net
  found no ring the authored/residual partition had missed).
- **Australia.** Six colonies + Northern Territory + Federal Capital Territory +
  Jervis Bay + Macquarie Island. The 1901 federation transfers the ten Australian
  provinces to the future Commonwealth (`AUS`, 1400), keeping the country colour.
- **New Zealand.** 16 regional-council provinces, Stewart Island, Chatham, the
  Kermadecs, the Three Kings and five subantarctic island provinces. The 1907
  dominion is a registry status change, not an ownership change.
- **Papua New Guinea.** 14 German New Guinea provinces and 6 British Papua
  provinces, separate permanent groups; the 1906/1914/1920/1949/1975 sequence is
  ordinary control/ownership changes. The PNG/Indonesia border is a seam-backed
  province edge.
- **Melanesia, Micronesia and Polynesia.** Fiji (5 divisions + Rotuma), the Solomon
  Islands (9), the New Hebrides (6 condominium provinces), New Caledonia (3),
  Nauru, the Marshall chains, four Caroline groups, Palau, four Northern Mariana
  units, Guam, three Kiribati groups, Tuvalu, Tonga (5), German Samoa, American
  Samoa, two Cook Island groups, Niue, Tokelau, five French Polynesian
  subdivisions, the French southern lands, two Wallis and Futuna provinces,
  Pitcairn, Easter Island, Juan Fernandez, Revillagigedo, Clipperton, the United
  States Pacific remote islands, Navassa, Heard/McDonald, Chagos, Norfolk,
  Svalbard, the Isle of Man and the Kvarner islands.
- **Global coverage.** Every non-Antarctic M11c land ring belongs to a province.
  Coverage residual provinces close the remaining inland gaps of the earlier
  continents; they are owned by the feature's 1900 sovereign and labelled low
  confidence coverage geometry.
- **Rendering.** Solid thin white province hairlines, thin near-black country
  borders at 1.25 screen px, no dashed province lines. The screenshots show the
  established hierarchy; the M12a-d renderer was not changed.

## 3. Exact commands and results

| Command | Result |
| --- | --- |
| `node scripts/m12e/build-oceania-provinces.mjs` | wrote 151 provinces, 586 border pairs (311 shared + 275 seams), 85,898 segments, 28 unmatched, 0 duplicate ids, 0 unassigned units, 0 duplicate claims; 25 gap provinces, 24 feature residuals, 0 automatic land gaps. Warnings: 1 same-owner Kvarner overlap (0.0197 sq deg); BPO coverage gap 0.023 sq deg; AUS/GNG coverage subtraction estimated by area (polygon-clipping limitation, M12b precedent). |
| `node scripts/m12e/generate-oceania-doc.mjs` | wrote `docs/OCEANIA_PROVINCIALIZATION.md` (26 KiB). |
| `node scripts/m12e/audit-successors.mjs` | 151 provinces; 25 registry entries; 8 historical; 29 successor groups; 28 states checked, 0 missing; 1 modern land border checked, 0 missing; 0 unexpected land-border pairs; global audit summary zero unassigned. Exit 0. |
| `node scripts/m12e/audit-global-land.mjs` | 795 land rings; 93 Antarctic + 1 water-hole exceptions; 701 non-Antarctic rings, 701 assigned, 0 unassigned; unassigned area 0; unassigned samples 0; unassigned vertices 0; 133/133 map features with a province; 0 unassigned admin-1 units. |
| `pnpm -F @century/app typecheck` | passed (tsc --noEmit). |
| `pnpm -F @century/tests typecheck` | passed (tsc --noEmit). |
| `pnpm -F @century/tests test -- m12e-oceania-provinces` | 40/40 tests passed. |
| `pnpm -F @century/tests test -- m12a-provinces m12b-asia-provinces m12c-africa-provinces m12d-americas-provinces m12e-oceania-provinces m11c-geography m11c1-rendering m11c1-map-viewport m11d-map-legibility m11d-map-selection m11d-map-wheel m11e-worldmap-geometry worker-bundle-drift data-version-consistency` | **14 suites / 220 tests passed** in 282 s (after the M11c.1 land-path test update). The M12e suite contributes 40 tests. |
| `pnpm -F @century/sim-worker scenario:build` | wrote `worldScenario.ts` (2,245,602 bytes). |
| `pnpm -F @century/app build:worker` | wrote `simWorker.ts` (script 2010.8 KiB, html 2010.9 KiB). |
| `pnpm run check:worker` | `worker scenario is current`; `worker bundle is current`. |
| `pnpm -F @century/app export:web` | exported `dist-web` (12 MB web bundle). |
| `node scripts/m12e/playtest-screenshot-oceania.mjs` | loaded the 1900 campaign (`game loaded: true date: true`), 21 screenshots, province panel click true. |

The first pass of the targeted suite had one failure: the M11c.1 rendering test
still expected exactly one `d={landPath}` although the M12a rendering contract has
drawn two since the coastline re-stroke was added. The test was updated to require
both land paths to sit inside the zoom transform (no assertion was weakened), and
the final run above passes all 14 suites and 220 tests. The `worker bundle is
stale` line in the Jest stderr is the intentional stale-copy test, which passes by
detecting the copy it deliberately appends. After the last audit-only change (the
`documentedExceptions` summary in the Oceania bundle audit) the M12e suite was
rerun alone: 40/40, and both typechecks pass; the other 13 suites are unaffected
because no code outside the M12e test and audit changed.

## 4. Global land-coverage result

- **795** land rings.
- **93** Antarctic exceptions (maximum latitude below -60: the continent, ice
  shelves, South Shetland/South Orkney).
- **1** water/ice hole exception (the Caspian Sea, an inner ring of the
  Afro-Eurasian land polygon).
- **701** non-Antarctic land rings, **701 assigned**, **0 unassigned**.
- **0** unassigned area, samples and representative vertices.
- **133/133** 1900 map features have at least one province.
- **0** unassigned and **0** duplicate-claimed admin-1 units across the five
  bundle audits.
- The reported coastline quantization band is 53.28 sq deg (sample estimate);
  it is the band between the 0.04 degree land mask and the 0.02 degree province
  simplification, not unassigned land. The audit uses a 0.075 degree tolerance and
  reports it explicitly.

## 5. Test coverage added

`packages/tests/src/m12e-oceania-provinces.test.ts` (40 tests) covers: inventory,
unique ids/keys, disjoint ranges, geometry validity, border polylines, coverage
audit, successor-split edges, the PNG/Indonesia border and the absence of other
Oceanian land borders, the twentieth-century state registry (28 states, 0 missing),
the historical/breakaway registry, ownership transfers, controller/occupation/
claims/special status, reference snapshots (1900, 1901, 1907, 1914-1920,
1986-1994), the global land-coverage audit (committed result plus an independent
land-mask check), rendering contracts (borders, hit testing, solid hairlines),
the five-bundle catalogue, save/load of Oceanian state and M12a-d-era saves,
snapshots, determinism and order sensitivity.

## 6. Assumptions, deviations and limitations

- **Coverage tolerance.** Strict "inside a province" is enforced for every land
  ring's interior samples; the 0.075 degree coastline band is the quantisation
  difference between the land mask and the province geometry, reported separately.
  No land area is exempted from assignment other than Antarctica and the Caspian
  water hole.
- **Non-exposed islands.** Ashmore/Cartier, the Coral Sea islands, the Minerva
  Reefs, Christmas Island and the Cocos (Keeling) Islands are below the 0.02 sq deg
  land-mask threshold and absent from the 1900 features and the admin-1 layer. They
  are documented in the doc and the successor audit rather than silently dropped.
- **Low-confidence 1900 ownership.** Svalbard is Norwegian (terra nullius until
  1920); Heard/McDonald are British (unclaimed in 1900, annexed 1910, transferred
  to Australia 1947). Clipperton has no map geometry and is a small authored island
  polygon.
- **Coarse 1900 features.** The Pacific island features are aggregates; island
  provinces are detached from the feature and use the admin-1 coastline. The
  colonial partition is encoded by which modern units belong to which province
  group (German/British New Guinea, German/American Samoa).
- **New Zealand proxy.** The modern regional-council areas stand in for the 1876
  provincial districts.
- **Coverage residuals.** The feature-residual provinces are coverage geometry, not
  reviewed frontiers; they are low confidence. The AUS and GNG coverage subtraction
  could not complete in polygon-clipping (the M12b/M12c precedent); the audit marks
  those entries `estimated`.
- **Same-owner overlap.** The Krk and Cres/Losinj island clips overlap by 0.0197
  sq deg. Both are Austrian, so the overlap cannot create a foreign-coloured
  enclave.
- **Palette ambiguity.** The 16-colour hash palette gives the Netherlands and
  Germany near-identical tans; on New Guinea the Dutch/German 141 E border is
  therefore carried mainly by the near-black country line. This is a pre-existing
  palette limitation, not changed by M12e.
- **Screenshot limitations.** The smallest atolls (Pitcairn, the Line and Phoenix
  islands, Easter Island) are sub-pixel at the maximum map zoom (18x); the
  screenshots show them as dots. Fiji's label projects onto the antimeridian edge,
  so its screenshot is edge-clipped at the default view. The global and regional
  screenshots show no holes, foreign-coloured enclaves or dotted province lines.
- **Test maintenance.** The M12a Austria-Hungary helper and the M11c.1 land-path
  count were updated for the additive content and the existing renderer; no
  assertion was weakened.

## 7. Uncompleted acceptance criteria

None knowingly. The milestone's hard land-coverage criterion is proven by the
script, the committed audit and the independent test. The visual review is
qualitative and recorded in §6; no commit was made, as requested, pending the
designer's review.
