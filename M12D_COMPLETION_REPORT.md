# M12d — American Provincial System: Completion Report

Status: implemented and visually reviewed. This report records the delivery, the
exact verification commands and results, the design decisions and the known
limitations. It includes the post-M12d addendum for historical and breakaway
polities (D-107). The committed province bundles, the code and
[`docs/AMERICAS_PROVINCIALIZATION.md`](docs/AMERICAS_PROVINCIALIZATION.md) are
authoritative if they disagree with this report.

## 1. Architecture

- The Americas are the direct counterpart of M12a Europe, M12b Asia and M12c
  Africa. The sole geographical subdivision beneath a polity remains `Province`;
  no Polity → Region → Province hierarchy and no parallel geographical region
  layer were introduced.
- Europe, Asia, Africa and the Americas are separate deterministic build
  artifacts:
  - `packages/data/data/map/provinces_1900.json` (M12a Europe, preserved);
  - `packages/data/data/map/provinces_asia_1900.json` (M12b Asia, preserved);
  - `packages/data/data/map/provinces_africa_1900.json` (M12c Africa, preserved);
  - `packages/data/data/map/provinces_americas_1900.json` (M12d Americas).
- One loader combines all four with unique ids and merged border data:
  - `packages/data/src/provinces.ts` for the simulation definitions and the
    future-polity registry;
  - `packages/app/src/provinceMapBundle.ts` for rendering, border planning and
    the province panel.
- Americas province ids start at **300001**, above the M12a block (maximum 66001),
  the M12b block (100001–100239) and the M12c block (200001–200260), and every
  key is prefixed `am-`. The build and both loaders reject a collision rather than
  silently replacing a province. Europe, Asia and Africa ids, keys and bundles
  are unchanged.
- Americas polity registry entries use ids **1300–1346** (17 post-1900 successors
  plus 30 historical/breakaway entries); Europe (1000–1016), Asia (1100–1144) and
  Africa (1200–1256) are untouched.
- The shared geometry pipeline `scripts/m12/province-build-lib.mjs` is reused.
  The Americas build seeds **all three** committed bundles (Europe first, then
  Asia, then Africa) as higher-priority cross-owner geometry.
- Ownership, control, occupation, claims and special status remain mutable in
  `World.provinces`; geometry, ids and names never change. Country borders are
  reconstructed from current province ownership through the existing M12a
  contract.
- Newfoundland is the one 1900-active registry entry. It was a self-governing
  Dominion on 1 January 1900 but is absent from the 67-polity M11c selectable
  catalog. It is registered as a non-selectable 1900 polity
  (`kind: "state"`, `activeFrom: 1900-01-01`, `activeTo: 1949-03-31`) so its
  provinces are permanently distinct and the 1949 union is an ordinary transfer.
- The registry now also carries 30 **historical/breakaway** entries
  (`kind: "historical"`, ids 1317–1346). They are registry-only: they own
  nothing in 1900, are never selectable, and exist so an alternate-history or
  breakaway scenario can transfer provinces to them. Pre-1900 activation dates
  are clamped to 1900-01-01 and the real dates are recorded in the entry notes.
  The data loader now reads an optional `kind`/`selectable1900` from a registry
  record; the defaults remain `future-state`/`false`, so the earlier bundles are
  unchanged.

## 2. Inventory

- Americas provinces: **469** (ids 300001–300469).
- 1900 owner polities with American provinces: **25** — United States (59),
  United Kingdom (35), French Republic (9), Kingdom of the Netherlands (7),
  Kingdom of Denmark (5), Mexico (31), Guatemala (22), Honduras (18), El Salvador
  (14), Nicaragua (17), Costa Rica (7), Colombia (37), Venezuela (25), Ecuador
  (24), Peru (24), Bolivia (10), Chile (17), Argentina (24), Uruguay (19),
  Paraguay (18), Brazil (20), Haiti (10), the Dominican Republic (5), Canada (11)
  and Newfoundland (1).
- Map features covered: **31** — USA, CAN, NFD, MEX, GUA, HON, SAL, NIC, COS,
  COL, VEN, ECU, PRU, BOL, CHL, ARG, URY, PRY, BRA, HTI, DOM, CUB, PRI, BWI, BSA,
  FCA, DGC, DWI, SUR, GRL and FRA.
- Americas polity registry entries: **47** — 17 post-1900 successors and 30
  historical/breakaway entries (ids 1300–1346).
- Border pairs: **1369** — 1191 shared province edges plus **178** display-only
  cross-feature seam borders (all 178 from the province-outline pass; the
  polity-frontier pass was not needed); shared segments 188,180; segments with
  more than two neighbours 0.
- Province pairs with a measured overlap above 0.005 deg²: **38**, all within a
  single map feature and all between provinces of the same owner (the largest is
  0.0347 deg² between Argentine Río Negro and Chubut). Same-owner overlap cannot
  produce a foreign-coloured enclave.
- Confidence: low 9, medium 378, high 82.
- Unique ids/keys: yes; duplicated ids/keys: 0; duplicate unit claims: 0;
  unassigned admin-1 units inside an American 1900 feature: 0.
- Combined catalogue: **1538** provinces, **166** polity registry entries and
  **4444** border pairs (570/17/1604 Europe + 239/45/633 Asia + 260/57/838 Africa +
  469/47/1369 Americas), 48 owner polities.

Coverage includes at minimum:

- **United States**: the 48 contiguous states plus the District of Columbia,
  Oklahoma Territory and Indian Territory (grouped as one province until 1907),
  the Arizona and New Mexico territories, Alaska (purchased 1867), Hawaii
  (annexed 1898) and Puerto Rico (ceded 1898). The Philippines, Guam and American
  Samoa are Asia/Oceania and are not duplicated.
- **Canada**: Ontario, Quebec, Nova Scotia, New Brunswick, Manitoba, British
  Columbia, Prince Edward Island, Yukon, the Northwest Territories (including
  modern Nunavut), and the Alberta and Saskatchewan districts that became
  provinces in 1905.
- **Newfoundland**: a separate 1900 Dominion including Labrador, joining Canada
  on 31 March 1949.
- **Mexico**: the Porfiriato states and territories, a single 1900 Baja
  California, the Federal District and the Yucatán.
- **Central America**: Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica,
  British Honduras (six districts) and Panama as part of Colombia.
- **South America**: Argentina, Bolivia (including Acre), Brazil (the 1900 states
  without the modern Federal District), Chile (including Magallanes and
  Chilean-occupied Tacna), Colombia (including Panama), Ecuador (including the
  Galápagos), Paraguay, Peru, Uruguay and Venezuela.
- **The Guianas**: British Guiana (Essequibo, Demerara and Berbice), Dutch Guiana
  (four permanent provinces) and French Guiana.
- **The Caribbean**: Cuba (US-occupied), Puerto Rico, Haiti, the Dominican
  Republic, Jamaica, Trinidad and Tobago, Barbados, the Bahamas, Bermuda, the
  Turks and Caicos, the Cayman Islands, the British Virgin Islands, Anguilla,
  Antigua and Barbuda, Saint Kitts and Nevis, Montserrat, Dominica, Saint Lucia,
  Saint Vincent and the Grenadines, Grenada, the French Antilles,
  Saint-Pierre-et-Miquelon, the Dutch Antilles exposed by the map, the Danish
  West Indies and the South Atlantic dependencies.
- **South Atlantic**: the Falkland Islands and South Georgia and the South
  Sandwich Islands, GBR-owned in 1900.
- **Greenland**: the North and South Greenland inspectorates.

### 2.1 Twentieth-century state and border audit

Every sovereign American state that appears between 1900 and 2000 is registered
as a 1900 catalog polity, a future polity, or both. The audit list is: United
States, Canada, Mexico, Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica,
Colombia, Venezuela, Ecuador, Peru, Bolivia, Chile, Argentina, Uruguay, Paraguay,
Brazil, Haiti, the Dominican Republic, Cuba, Newfoundland, Panama, Jamaica,
Trinidad and Tobago, Barbados, Guyana, the Bahamas, Grenada, Suriname, Dominica,
Saint Lucia, Saint Vincent and the Grenadines, Antigua and Barbuda, Belize and
Saint Kitts and Nevis. `scripts/m12d/audit-successors.mjs` prints **36 states
checked, 0 without a registered polity or province group**.

`packages/tests/src/m12d-americas-provinces.test.ts` contains the full list of
**38 modern American sovereign land borders** and asserts that every one is
backed by at least one shared or seam province edge between the two successor
groups; the standalone audit prints the same result: **38 checked, 0 without a
province edge**. The only American land border deliberately outside the
sovereign audit is the non-sovereign Saint-Martin/Sint Maarten line: both halves
are separate permanent provinces, but the M11c land mask does not resolve the
small island, so no derived seam is drawn there.

The mandatory successor-border splits are implemented and tested:

- Colombia/Panama: the Panama provinces (`am-pan-*`) are separate from the
  Colombian departments; the 1903 separation is an ordinary transfer.
- Canada/Newfoundland: `am-nfd-newfoundland-and-labrador` is a separate 1900
  province adjacent to Quebec; the 1949 union is an ordinary transfer.
- Danish West Indies / US Virgin Islands: Saint Croix, Saint Thomas and Saint
  John are separate provinces; the 1917 transfer moves three permanent units.
- The British Caribbean: British Honduras (six districts), Jamaica (three
  counties), Trinidad and Tobago (two islands), Barbados, the Bahamas (New
  Providence, Grand Bahama and the Out Islands), Grenada, Dominica, Saint Lucia,
  Saint Vincent and the Grenadines, Antigua and Barbuda, Saint Kitts and Nevis
  and British Guiana (Essequibo, Demerara and Berbice) are separate permanent
  province groups. Anguilla, Montserrat, Bermuda, the Turks and Caicos, the
  Cayman Islands and the British Virgin Islands remain separate British
  territories.
- The French and Dutch Caribbean: Guadeloupe (Basse-Terre, Grande-Terre and
  Marie-Galante), Martinique, French Guiana, Saint-Martin, Saint-Barthélemy,
  Saint-Pierre and Miquelon remain separate French provinces; Aruba, Curaçao and
  Sint Maarten remain separate Dutch provinces.
- Alaska, Hawaii and Puerto Rico are separate US provinces.
- Acre is a separate Bolivian province until the 1903 transfer to Brazil; Tacna
  is a separate Chilean-occupied province until its 1929 return to Peru.

### 2.2 Historical and breakaway polities

The registry now also answers the broader historical question the designer
asked: every declared American breakaway or short-lived state that could appear
in a 20th-century alternate history is available as a registry polity. The 30
entries are ids **1317–1346**:

- **United States:** Texas (TEX), California (CAL), Deseret (DES), Confederate
  States of America (CSA), West Florida (WFL), the Floridas (FLR), Indian Stream
  (INS) and Madawaska (MDW).
- **Latin America:** Riograndense Republic (RGR), Juliana Republic (JUL), Republic
  of the Rio Grande (RRG), Yucatán (YUC), Acre (ACR), Counani (CNU), Sonora
  (SON), Lower California (LBC), the Equator (EQT), Bahia (BAH), Pernambuco (PEM)
  and Entre Ríos (ERY).
- **Canada:** Republic of Canada (RCN) and Republic of Lower Canada (RLC).
- **Short-lived 20th-century states:** Acre (real 1899–1903; start clamped),
  Anguilla (1967–1969) and the West Indies Federation (1958–1962).
- **Predecessor unions:** Gran Colombia (GCO), United Provinces of the Río de la
  Plata (UPR), Argentine Confederation (ACF), State of Buenos Aires (SBA) and
  the Peru-Bolivian Confederation (PBC).

They are `kind: "historical"`, `selectable1900: false`, own nothing on
1 January 1900, and are not simulation countries. A pre-1900 entry is clamped to
`activeFrom`/`activeTo` 1900-01-01 (documented last resort) with the real dates
in its notes; Acre, Anguilla and the West Indies Federation keep the part of
their real window that falls inside 1900–2000. The M12d test proves that Texas,
California, the Riograndense Republic and Yucatán can each receive a province by
an ordinary ownership transfer. Semihistorical entries are labelled low or
medium confidence. The registry boundary is deliberate: it includes states with
a declared government and a documented name, not every filibuster or proposed
subdivision.

## 3. Historical snapshots supported

`packages/tests/src/m12d-americas-provinces.test.ts` exercises these references;
they are validation paths, not forced outcomes.

| Reference | Result |
|---|---|
| 1 January 1900 | Every American province has one ownership record; owner = controller; no claims; Cuba, Puerto Rico and Alaska/Hawaii are United States-owned; Newfoundland is the separate 1900 dominion; no future polity except NFD owns anything |
| 1902 | Cuba transfers from the United States occupation to the Republic of Cuba (`CUB`) |
| 1903 | Panama separates from Colombia; Acre passes from Bolivia to Brazil |
| 1915–1934 | The United States occupies Haiti; ownership stays Haitian and only the controller changes, then reverts in 1934 (this covers the 1917–20 and 1935–36 reference windows) |
| 1917 | Saint Croix, Saint Thomas and Saint John transfer from Denmark to the United States |
| 1929 | Tacna returns from Chile to Peru |
| 1949 | Newfoundland and Labrador join Canada |
| 1954/1986 | The Netherlands Antilles becomes a constituent country; Aruba separates |
| 1962–1983 | Jamaica, Trinidad and Tobago, Barbados, Guyana, the Bahamas, Grenada, Suriname, Dominica, Saint Lucia, Saint Vincent and the Grenadines, Antigua and Barbuda, Belize and Saint Kitts and Nevis become independent; Anguilla, Montserrat, Bermuda, the Turks and Caicos, the Cayman Islands and the British Virgin Islands remain British |
| 1975 | Suriname becomes independent from the Netherlands |
| 1904–1979 | The Panama Canal Zone is a United States-controlled special area on the Panama province, then reverts |

The 1935–36 and 1945 reference windows contain no American sovereignty transfer
in the M11c model. The 1915–1934 Haitian occupation covers the 1917–20 and
1935–36 windows with a controller-only change; the 1946 departmentalisation of
the French Caribbean is representable as a special-status change. The 1959 Cuban
Revolution is a government change, not an ownership change; the 1962 Jamaican and
Trinidadian independences are the ownership events in the 1959–62 window. The
1990–91 window has no American sovereignty change.

Dynamic behaviour is covered by the same suite: transfers preserve ids and
geometry references; occupation changes only the controller; claims survive
transfers and never imply ownership (the Argentine claim to the Falklands);
special statuses are explicit; save/load round-trips the whole provincial state;
M12a-era (570 records), M12b-era (809 records) and M12c-era (1069 records) saves
still load; identical sequences produce identical world hashes and a different
order produces a different history.

## 4. Geometry method

The Americas build uses Natural Earth 1:10m admin-1 units only as internal
geometry blocks. Every province is clipped to its authored M11c 1900 polity
polygon. Later frontiers that cut through a modern unit are split and labelled
low or medium confidence. Output is simplified at 0.02° and quantized to
thousandths of a degree.

The shared pipeline applies:

1. union the authored admin-1 blocks and authored clip/exclude shapes;
2. intersect with the 1900 polity polygon;
3. subtract earlier provinces of a different owner, with the committed Europe,
   Asia and Africa bundles seeded first;
4. simplify, then re-trim cross-owner overlaps that simplification expanded;
5. extract shared borders from the unsimplified source rings;
6. audit coverage, overlaps, duplicate ids/keys/claims and unassigned units.

The shared pipeline now accepts a **multi-ring coverage scope**. The Americas
build scopes the French feature to French Guiana and the French Antilles
separately, so metropolitan France, Corsica, Réunion and Mayotte are not charged
to the Americas, and scopes the British South Atlantic feature to the Falklands,
South Georgia and the South Sandwich Islands. Coverage clips are audit
boundaries, not political borders.

Two display-only seam passes complete the borders between provinces of different
1900 map features:

1. **Province-outline pass.** Each vertex of one province is matched to the
   nearest point on the other province's outline (point-to-segment, because
   treaty straight lines have very few vertices); midpoints closer than 0.5° are
   chained and emitted as ordinary border records. The midpoint must be on land,
   inside one of the two 1900 polities, and outside any third province.
2. **Polity-frontier pass.** For feature pairs the first pass cannot connect, the
   midline between the two 1900 polity outlines within 0.4° is attributed to the
   nearest province on each side, with the same land/third-polity filters.

The committed bundle has **178** seam pairs, all from the province-outline pass.
Neither pass changes a province polygon, id or simulation state. Seams are only
drawn after an ownership transfer, because the 1900 start state draws the polity
outlines. The M12d test verifies the seams structurally and through the render
plan; no in-app transfer UI exists to drive the post-transfer border visually.

Coverage is measured only over the American part of shared features. The largest
measurable residuals are BRA 1.605 deg², VEN 0.540 deg², BWI 0.427 deg², BSA
0.236 deg² and ECU 0.269 deg²; ten large-feature rows are marked `estimated` where
the polygon library could not complete the sequential difference (the largest are
Canada 16.80 deg² and Greenland 12.16 deg², both measurement fallbacks). The
residual is the sum of many small coastal, river and frontier slivers. It stays
under the correct 1900 owner's polity fill, so it cannot appear as a
foreign-coloured enclave.

## 5. Border rendering and visual review

The M12a/M12b/M12c rendering contract is reused without a fork:

- every province fill carries a solid thin white hairline (0.9 screen px, never
  dotted or dashed);
- the country border is a thin near-black line at the established **1.25 screen
  px** weight, derived from current province ownership when the 1900 polity
  outline no longer equals the province union;
- province lines are subdued at global zoom and remain visible at continental
  and country zoom;
- country borders have visual priority; derived shared edges are deduplicated by
  province adjacency, so the derived national path does not double-stroke a
  shared frontier.

Visual review was performed on the exported web app at global, continental,
regional and maximum zoom. Screenshots:

- [Global map](docs/images/m12d-americas-global.png)
- [Canada and the northern United States](docs/images/m12d-americas-north-america.png)
- [Eastern United States](docs/images/m12d-americas-united-states.png)
- [Alaska](docs/images/m12d-americas-alaska.png)
- [Greenland](docs/images/m12d-americas-greenland.png)
- [Mexico and Central America](docs/images/m12d-americas-mexico-central-america.png)
- [Panama and the isthmus](docs/images/m12d-americas-panama-isthmus.png)
- [Cuba and the Greater Antilles](docs/images/m12d-americas-caribbean-cuba.png)
- [Hispaniola and Puerto Rico](docs/images/m12d-americas-caribbean-greater-antilles.png)
- [Trinidad and the Lesser Antilles](docs/images/m12d-americas-caribbean-lesser-antilles.png)
- [Guadeloupe and the northern chain](docs/images/m12d-americas-caribbean-guadeloupe.png)
- [Barbados and the Windwards](docs/images/m12d-americas-caribbean-barbados.png)
- [The Guianas](docs/images/m12d-americas-guianas.png)
- [The Andes](docs/images/m12d-americas-andes.png)
- [Brazil and the Amazon](docs/images/m12d-americas-brazil-amazon.png)
- [The Southern Cone](docs/images/m12d-americas-southern-cone.png)
- [Patagonia and Tierra del Fuego](docs/images/m12d-americas-patagonia.png)
- [The Falkland Islands](docs/images/m12d-americas-falklands.png)
- [The Pacific coast](docs/images/m12d-americas-pacific-coast.png)
- [Province panel: Panama](docs/images/m12d-americas-province.png)

Observed results:

- province hairlines are continuous and solid; no dotted or dashed province
  lines were observed at any zoom;
- country borders remain thin near-black lines, not thick bands; the
  USA/Canada, USA/Mexico, Colombia/Panama, Haiti/Dominican Republic,
  Chile/Argentina, Argentina/Brazil and Guyana/Suriname frontiers read correctly
  at regional and maximum zoom;
- no foreign-coloured enclave or missing-land patch was found in the reviewed
  regions; the province fills are continuous with the 1900 polity underlay;
- the Panama isthmus at maximum zoom shows the six permanent Panama provinces
  (all COL-owned in 1900); the Canal Zone is represented by controller/special
  status, not a separate polygon;
- the province panel opens for Panama, id 300179, current owner COL, 1900 owner
  COL, “Colombian department”, ordinary status.

Two pre-existing rendering observations, neither a data defect:

- the 16-colour hash palette gives identical or near-identical colours to some
  pairs. Haiti and the Dominican Republic both render brown on Hispaniola, and
  Chile and Argentina both render pink in the Southern Cone. The country border
  still separates them and no enclave is ambiguous. Changing the palette would
  alter the already reviewed Europe/Asia/Africa rendering, so it is left
  unchanged and recorded as a limitation.
- the authored world-map label for a multi-island feature is placed at the centre
  of its whole bounding box (for example “British West Indies” and “British South
  Atlantic islands”), so it overlays the Caribbean Sea and the South Atlantic at
  regional zoom. This is pre-existing M11c label behaviour; maximum-zoom
  screenshots were used to inspect the individual islands.

The app's maximum zoom is 18×, so the smallest Lesser Antilles islands remain a
few pixels even at maximum zoom. They still render as solid fills with solid
white outlines; the chain is visible and no island is missing. A deeper zoom
would require changing the reviewed viewport limit and is out of scope.

## 6. Commands executed and results

All commands were run from `C:\vibe-games\century`.

| Command | Result |
|---|---|
| `node scripts/m12d/build-americas-provinces.mjs` | Passed. Wrote the Americas bundle: 469 provinces, 1369 border pairs (1191 shared + 178 seam), 188,180 segments, 0 unmatched, 0 duplicate ids, 0 duplicate unit claims, 0 unassigned units, 38 same-owner overlaps. Re-running produced byte-identical bundle, audit and generated app bundle (SHA-256 verified: `085E7D78…5180AF`, `C078A4D4…F08DF7`, `C45491AD…E3CF6F`). |
| `node scripts/m12d/generate-americas-doc.mjs` | Passed. Regenerated `docs/AMERICAS_PROVINCIALIZATION.md` (112,832 characters / 113,163 UTF-8 bytes, 469 provinces, 25 owners, 47 polity registry entries). |
| `node scripts/m12d/audit-successors.mjs` | Passed. 469 provinces, 47 registry entries (30 historical/breakaway), 46 successor groups, 36 twentieth-century states checked with 0 missing, 38 modern sovereign land borders checked with **0 without a province edge**. The non-sovereign FRA|NLD Saint-Martin line is reported separately. |
| `pnpm -F @century/app typecheck` | Passed. |
| `pnpm -F @century/tests typecheck` | Passed. |
| `pnpm -F @century/tests test -- "m12d-americas-provinces\|m12a-provinces\|m12b-asia-provinces\|m12c-africa-provinces\|m11e-worldmap-geometry\|m11d-map\|m11c-geography\|worker-bundle-drift"` | Passed: 10 suites, **169 tests**, 0 failures. The M12d suite alone is 35/35. |
| `pnpm -F @century/sim-worker scenario:build` | Passed. Regenerated `worldScenario.ts` (2,095,633 bytes) with the combined four-bundle catalogue and the historical registry. |
| `pnpm -F @century/app build:worker` | Passed. Worker script 1901.1 KiB. |
| `pnpm run check:worker` | Passed: worker scenario and worker bundle are current. |
| `pnpm -F @century/app export:web` | Passed. Exported `dist-web` with a **10 MB** JavaScript bundle. |
| `node scripts/m12d/playtest-screenshot-americas.mjs` | Passed. Campaign created, map rendered at 1900-01-01, 20 screenshots captured, province panel opened for Panama. |

The full test suite, benchmarks and non-web exports were deliberately not run
because the task requested targeted verification only.

## 7. Save and state compatibility

- `World` schema remains **27**; the save envelope and worker snapshot protocol
  are unchanged. M12d is additive content, not a new state shape.
- The combined catalogue is 1538 static definitions; the world creates 1538
  ownership records on a new campaign.
- An M12a-era save (570 European records), an M12b-era save (809 European and
  Asian records) or an M12c-era save (1069 European, Asian and African records)
  still loads under the project's strict same-version policy (verified by the
  three compatibility tests), but its American provinces have no mutable record
  until a new campaign is created; the map falls back to the authored 1900 owner
  for rendering. This is documented as a known limitation rather than silently
  migrated.
- No population, building, market, region or treasury values were changed.
  Province-level population/economy simulation remains future work.

## 8. Assumptions, deviations and known limitations

- Modern Natural Earth admin-1 units are proxies for 1900 internal boundaries.
  U.S. states and territories, Canadian provinces, Mexican states and the larger
  South American first-level units are reasonable proxies; Central American
  departments and some Caribbean parish groupings are labelled medium or low
  confidence.
- Oklahoma Territory and Indian Territory are grouped into one permanent
  province because the modern Oklahoman outline is the only available unit; the
  1907 statehood is not a transfer.
- Alberta and Saskatchewan are 1900 districts of the Northwest Territories and
  become provinces in 1905; they are separate permanent provinces so the change
  is representable. Nunavut is grouped with the Northwest Territories because it
  was part of them until 1999.
- Baja California is one 1900 territory; the modern Norte/Sur split is not a
  1900 boundary.
- Acre and Tacna are separate provinces as described in §2.1. The Acre geometry
  comes from the modern Brazilian unit clipped to the 1900 Bolivian feature; the
  Tacna geometry comes from the modern Peruvian unit clipped to the 1900 Chilean
  feature.
- The Brazilian Federal District is part of the Goiás province; the 1960 capital
  transfer is not represented as a province split. This follows the milestone's
  explicit “states and NOT the federal district” instruction.
- The M11c land mask does not resolve Sint Maarten, so the Saint-Martin/Sint
  Maarten seam is absent; both halves remain separate provinces.
- Bonaire, Saba and Sint Eustatius are not exposed by the M11c map and are not
  separate provinces; they are recorded in the Dutch Caribbean note.
- Carriacou and Petite Martinique are grouped with Grenada because the M11c BWI
  polygon does not expose the dependency as a separate ring. San Andrés and
  Providencia are attached to the Bolívar province for the same reason.
- The Falklands/Malvinas and South Georgia are GBR-owned; the Argentine claim is
  representable but not seeded. The 1982 war is not modelled.
- The Panama Canal Zone is a control/special-status sequence, not a province: it
  was a lease, not a sovereignty transfer, and a five-mile strip would require a
  crude authored rectangle.
- The West Indies Federation is registered as historical entry `WIF` (1328). It
  was a federation of Crown colonies and never held provincial ownership; it owns
  nothing in 1900 and is not selectable, but a scenario can transfer the island
  provinces to it to represent the 1958–1962 episode. The islands remain separate
  permanent provinces.
- The Netherlands Antilles (1954) and Aruba (1986) are registered as future
  polities and driven by ordinary transfers; they were not sovereign states.
- Newfoundland is registered as a non-selectable 1900 polity because the M11c
  selectable catalog does not include it. Its 1900 status is a Dominion, not an
  independent state in the Correlates-of-War sense.
- The 30 historical/breakaway entries are registry-only and own nothing in 1900.
  Pre-1900 activation dates are clamped to 1900-01-01, with the real dates in the
  notes. Counani, West Florida, the Floridas, Indian Stream, Madawaska, the
  Canadian rebellions, Sonora/Lower California and the Brazilian provincial
  republics are low confidence; they are semihistorical and are not presented as
  uncontested sovereign facts. The predecessor unions are registered as
  historical entries rather than 1900 owners.
- Province geometry adds about 1.1 MiB and 469 paths to the map. The map remains
  one offline SVG render.
- The app's 16-colour hash palette is pre-existing. Some polities receive
  near-identical colours (Haiti/Dominican Republic, Chile/Argentina, the United
  States and some Caribbean territories); country borders still separate them.
  Changing the palette would alter the already reviewed Europe/Asia/Africa
  rendering, so it is left unchanged.
- No benchmark was run; province geometry is static content and the snapshot
  gains 469 ownership records (1538 total). Targeted verification only, as
  requested.

Remaining uncertainties: the 1900 internal boundaries of Central America, the
Caribbean and the Andean republics are modern first-level proxies rather than
surveyed historical lines; the M11c 1900 outer polygons for the Guianas and
Central America are themselves authored reconstructions; the exact placement of
the non-sovereign Saint-Martin/Sint Maarten seam depends on a land mask that does
not resolve the island; and the post-transfer derived border was verified
structurally rather than through an in-app transfer, because no transfer UI
exists in this milestone.

## 9. Files created or modified

Created:

- `scripts/m12d/americas-plan.mjs`
- `scripts/m12d/build-americas-provinces.mjs`
- `scripts/m12d/generate-americas-doc.mjs`
- `scripts/m12d/audit-successors.mjs`
- `scripts/m12d/playtest-screenshot-americas.mjs`
- `packages/data/data/map/provinces_americas_1900.json`
- `packages/data/data/map/provinces_americas_1900_audit.json`
- `packages/app/src/generated/provincesAmericas1900.ts`
- `packages/tests/src/m12d-americas-provinces.test.ts`
- `docs/AMERICAS_PROVINCIALIZATION.md`
- `docs/images/m12d-americas-global.png`,
  `m12d-americas-north-america.png`, `m12d-americas-united-states.png`,
  `m12d-americas-alaska.png`, `m12d-americas-greenland.png`,
  `m12d-americas-mexico-central-america.png`,
  `m12d-americas-panama-isthmus.png`, `m12d-americas-caribbean-cuba.png`,
  `m12d-americas-caribbean-greater-antilles.png`,
  `m12d-americas-caribbean-lesser-antilles.png`,
  `m12d-americas-caribbean-guadeloupe.png`,
  `m12d-americas-caribbean-barbados.png`, `m12d-americas-guianas.png`,
  `m12d-americas-andes.png`, `m12d-americas-brazil-amazon.png`,
  `m12d-americas-southern-cone.png`, `m12d-americas-patagonia.png`,
  `m12d-americas-falklands.png`, `m12d-americas-pacific-coast.png`,
  `m12d-americas-province.png`
- `M12D_COMPLETION_REPORT.md`

Modified:

- `scripts/m12/province-build-lib.mjs` — added the backward-compatible
  multi-ring coverage scope (single-ring clips behave exactly as before; the
  Europe/Asia/Africa bundles were not rebuilt).
- `packages/sim/src/provinces/types.ts` — `PolityDef.kind` gains
  `"historical"` for registry-only breakaway/predecessor states.
- `packages/sim/src/provinces/state.ts` — accepts and validates historical
  registry entries (never selectable, never a simulation country id).
- `packages/data/src/provinces.ts` — four-bundle loader, collision checks and
  future-polity merge; optional registry `kind`/`selectable1900` (NFD and the
  historical entries).
- `packages/app/src/provinceMapBundle.ts` — four-bundle merge.
- `packages/app/src/provinceCatalogTypes.ts` — optional registry `kind`/
  `selectable1900`, including `"historical"`.
- `packages/sim-worker/src/generated/worldScenario.ts` — regenerated with the
  combined province definitions.
- `packages/app/src/generated/simWorker.ts` — regenerated worker bundle.
- `packages/tests/src/m12a-provinces.test.ts` — combined owner-aggregation
  assertion now includes Americas.
- `packages/tests/src/m12b-asia-provinces.test.ts` — combined-catalogue
  assertion includes Americas; all Asia assertions preserved.
- `packages/tests/src/m12c-africa-provinces.test.ts` — combined-catalogue
  assertion includes Americas; all Africa assertions preserved.
- `DECISIONS.md` — D-106 and D-107.

Preserved from the pre-existing working tree (not reset or rewritten): the M12a,
M12b and M12c completion reports, all three provincialization documents, the
`docs/images/m12a-*`, `docs/images/m12b-*` and `docs/images/m12c-*` screenshots,
`scripts/m12/*`, `scripts/m12b/*`, `scripts/m12c/*`, the Europe, Asia and Africa
bundles/audits and their generated app bundles,
`packages/app/src/components/WorldMap.tsx`,
`packages/app/src/screens/GameShell.tsx`,
`packages/app/src/generated/provinces1900.ts` and
`packages/app/src/generated/worldMap1900.ts`. The Europe, Asia and Africa
bundles were not rebuilt and their hashes are unchanged by this milestone.

## 10. Working-tree status

No commit was made: the task requires the visual result to be reviewed first. The
working tree contains the M12a/M12b/M12c changes that were already present when
M12d started, plus the M12d files listed above. The pre-existing untracked notes
`.cache-regions.md` and `.cache-regions-utf8.md` were not created by this
milestone and were left untouched. The M12d scratch analysis scripts, crops and
command logs remain under the gitignored `.cache-m11d/` directory and are not
part of the deliverable.
