# M11 requirements map

Requirement → implementation → evidence. This is a traceability index, not a
substitute for the GDD.

## Historical catalog and classification

| Requirement | Implementation | Evidence |
|---|---|---|
| Campaign starts 1 Jan 1900 | `meta.startDayIndex = 0`; calendar | `m11-world.test.ts` catalog start date |
| Documented country classification | `polities_1900.json` `meta.classification`; `COUNTRY_STATUSES` | GDD §17I.1; provenance doc |
| Every independent state playable | 54 independent + personal-union + autonomous-vassal + 3 dominions = 59 | catalog test; six-country creation test |
| No invented/omitted states | authored list derived from GWD/COW tradition | catalog test checks key tags |
| Dependencies not independent | 62 territories, all `selectable: false` | catalog test |
| Status/parent/capital/geometry/sources/confidence | catalog fields + `countryMeta`/`regionMeta` | loader validation; provenance doc |
| Historical names, not modern substitutions | catalog names (e.g. Qing Empire, Transvaal, Siam) | catalog test; picker screenshot |

## World expansion

| Requirement | Implementation | Evidence |
|---|---|---|
| Every selectable country has a valid state | generator + `createEconomyWorld` | world validator test over 122 regions |
| Regions, population, age cohorts, professions | `regions_1900`, `pops_1900` | world test; loader |
| Accounts, treasury, government, fiscal state | `countries_1900` | world test; ordinary validators |
| Market membership and currency | `markets_1900`; currency identities | market tests |
| Laws, politics, technology | `countries_1900` politics/technology inputs | world test |
| AI/player control assignment | `countryAI` + `playerCountryId` | AI exclusion test |
| One coherent world, not isolated campaigns | one scenario/world | host creation |
| No cloned economies | tier/population/sector-driven generation | provenance/source notes |

## Country selection and persistence

| Requirement | Implementation | Evidence |
|---|---|---|
| Main menu → new game → date → picker → confirm → game | `App.tsx`, `MainMenuScreen`, brief, picker | browser smoke screenshots |
| Search and continent/status filters | picker | source; browser smoke |
| Map selection equals list selection | shared `selectedTag` | source; screenshots |
| Selected country detail | picker detail panel | screenshots |
| Confirm initializes that country | `CREATE_GAME` | host tests for six regions |
| No implicit country 0 | host rejects unknown/non-selectable | rejection tests |
| Player survives save/load | `World.playerCountryId` + serialization | save/load test |
| Worker restart keeps identity | provider re-create effect | source; design record |
| AI excludes player | `runCountryAIPhase` skip | AI test |
| Selection test across regions | USA, JPN, ZAR, BRA, RUS, ETH | parametrised host test |

## Map

| Requirement | Implementation | Evidence |
|---|---|---|
| Real interactive historical map | `WorldMap.tsx` + generated geometry | screenshots |
| Pan/zoom, click, touch | PanResponder, zoom buttons, SVG onPress | source; browser smoke |
| Borders, labels, capitals, small states | map bundle + renderer | screenshots |
| Sovereignty vs occupation | political fill + control overlay | snapshot fields; source |
| Market layer from actual membership | `marketIdFor` + market metadata | source; market tests |
| Legend, projection, antimeridian | Miller, offsets, legend | map data test |
| Offline | bundled JSON/TS, no runtime fetch | map data test; source |
| Licensing | Natural Earth/public domain, world-atlas ISC | provenance/map docs |
| Map→simulation ids | polity id = country/region id | market/country tests |

## Markets

| Requirement | Implementation | Evidence |
|---|---|---|
| No opaque `Market N` identity | authored names; derived fallback | snapshot test |
| Membership, multi-country lists | `memberCountryIds`, `regionIds` | snapshot test; Markets screen |
| Customs distinct from sovereignty | `customsCountryId` + country ownership | market test |
| Discovery from map/screens | markets screen + highlight | source; screenshots |

## Sliders

| Requirement | Implementation | Evidence |
|---|---|---|
| Sliders for continuous inputs | `SliderField` across policy screens | inventory doc |
| Values, min/max/step/unit/ticks | component props | source |
| Precise entry | paired numeric input | source |
| Authoritative actions | `onCommit` → `APPLY_ACTION` | browser smoke action |
| Race safety | `useDeferredCommit`, busy gating | source; design record |
| Ranges valid | tests over fiscal/funding/training/trade endpoints | actions test |
| Accessibility | adjustable role/actions, labels, step buttons | source |

## UI

| Requirement | Implementation | Evidence |
|---|---|---|
| Map-first shell | `GameShell` | screenshots |
| Top bar/navigation/context panel | shell | screenshots |
| Country identity | emblem/name/status/capital | screenshots |
| Design system | `theme.ts`, `components/ui.tsx` | source |
| Responsive | rail vs horizontal nav, stacked picker | 500px screenshot |
| No dead nav | nav maps to implemented screens | `e1-ui-wiring` |
| Actual simulation state | snapshot-only UI | architecture tests |

## Persistence, determinism, compatibility

| Requirement | Implementation | Evidence |
|---|---|---|
| Player country persisted | save payload | save/load test |
| Map/country associations preserved | scenario id + static metadata | load validation |
| Deterministic new campaigns | fixed seed + ordered actions | determinism tests |
| Validators pass | `assertValidWorld` | world test |
| Versioning coherent | schema 26, sim 0.27.0, protocol 14, data v12 | version tests/check |

## Documentation

| Requirement | Document |
|---|---|
| GDD history preserved; v2.17 restored; v2.18 created | `Century_GDD_v2.17.md`, `Century_GDD_v2.18.md` |
| Change report | `GDD_V2.18_CHANGE_REPORT.md` |
| Decisions | `DECISIONS.md` D-086–D-093 |
| README | `README.md` |
| Provenance/licensing | `docs/HISTORICAL_DATA_PROVENANCE.md` |
| Map preparation | `docs/MAP_DATA.md` |
| Slider inventory | `docs/M11_SLIDER_INVENTORY.md` |
| Playtest | `docs/PLAYTEST_GUIDE.md` |
| Source notes | `packages/data/data/historical/m11/source_notes.md` |
