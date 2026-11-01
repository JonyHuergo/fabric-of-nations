# M12c — African Provincial System: Completion Report

Status: implemented and visually reviewed. This report records the delivery, the
exact verification commands and results, the design decisions and the known
limitations. The committed province bundles, the code and
[`docs/AFRICA_PROVINCIALIZATION.md`](docs/AFRICA_PROVINCIALIZATION.md) are
authoritative if they disagree with this report.

## 1. Architecture

- Africa is the direct counterpart of M12a Europe and M12b Asia. The sole
  geographical subdivision beneath a polity remains `Province`; no Polity →
  Region → Province hierarchy and no parallel geographical region layer were
  introduced.
- Europe, Asia and Africa are separate deterministic build artifacts:
  - `packages/data/data/map/provinces_1900.json` (M12a Europe, preserved);
  - `packages/data/data/map/provinces_asia_1900.json` (M12b Asia, preserved);
  - `packages/data/data/map/provinces_africa_1900.json` (M12c Africa).
- One loader combines all three with unique ids and merged border data:
  - `packages/data/src/provinces.ts` for the simulation definitions and the
    future-polity registry;
  - `packages/app/src/provinceMapBundle.ts` for rendering, border planning and
    the province panel.
- Africa province ids start at **200001**, above the M12a block (maximum 66001)
  and the M12b block (100001–100239), and every key is prefixed `af-`. The build
  and both loaders reject a collision rather than silently replacing a province.
  Europe and Asia ids, keys and bundles are unchanged.
- Africa future successor polities use ids **1200–1256**; Europe (1000–1016) and
  Asia (1100–1144) are untouched.
- The shared geometry pipeline `scripts/m12/province-build-lib.mjs` is reused
  without modification. The Africa build seeds **both** committed bundles (Europe
  first, then Asia) as higher-priority cross-owner geometry.
- Ownership, control, occupation, claims and special status remain mutable in
  `World.provinces`; geometry, ids and names never change. Country borders are
  reconstructed from current province ownership through the existing M12a
  contract.

## 2. Inventory

- Africa provinces: **260** (ids 200001–200260).
- 1900 owner polities with African provinces: **16** — United Kingdom, German
  Empire, French Republic, Kingdom of Italy, Kingdom of Spain, Kingdom of
  Portugal, Kingdom of Belgium, Ottoman Empire, Ethiopian Empire, Liberia,
  Morocco, the South African Republic, the Orange Free State, Sokoto, Wadai and
  Darfur.
- Map features covered: **39** — EGY, SUD, BSO, BEA, BWA, CAP, NAT, HCT, CRA,
  FWA, FEA, ALG, TUN, MAR, FSO, MAD, GEA, GSW, KAM, TOG, CFS, ANG, MOZ, PAI, ERI,
  ITS, SAH, SGG, ETH, LBR, ZAR, ORF, SOK, WAD, DAR, OTT, BPO, BSA and FRA.
- Africa future successor polities: **57** (ids 1200–1256).
- Border pairs: **838** — 655 shared province edges plus **183** display-only
  cross-feature seam borders (10 of them polity-frontier seams); shared segments
  71,494; segments with more than two neighbours 0.
- Province pairs with a measured overlap above 0.005 deg²: **33**, all within a
  single map feature and almost all between provinces of the same owner (the
  largest is 0.0145 deg² inside Egypt).
- Confidence: low 25, medium 226, high 9.
- Unique ids/keys: yes; duplicated ids/keys: 0; duplicate unit claims: 0;
  unassigned admin-1 units inside an African 1900 feature: 0.
- Combined catalogue: **1069** provinces, **119** future polities, **3075**
  border pairs (570/17/1604 Europe + 239/45/633 Asia + 260/57/838 Africa),
  44 owner polities.

Coverage includes at minimum:

- **British Africa**: Egypt and the Anglo-Egyptian Sudan, British Somaliland,
  British East Africa (Kenya, Uganda and Jubaland), Zanzibar, Pemba, Nigeria
  (Lagos, Southern and Northern Nigeria), the Gold Coast, Sierra Leone, Gambia,
  the Cape Colony (including Walvis Bay), Natal, Bechuanaland, Basutoland,
  Swaziland, Southern and Northern Rhodesia, Nyasaland, Mauritius, Seychelles, St
  Helena and Ascension.
- **French Africa**: Algeria, Tunisia, French West Africa (Senegal, French Sudan,
  Guinea, Ivory Coast, Dahomey, Upper Volta, Mauritania, Niger), French
  Equatorial Africa (Gabon, Middle Congo, Ubangi-Shari, Chad), French Somaliland,
  Madagascar, the Comoros, Réunion and Mayotte.
- **German Africa**: German East Africa (Tanganyika, Rwanda, Burundi), Kamerun,
  Togoland and German South West Africa.
- **Portuguese Africa**: Angola (including Cabinda), Mozambique, Portuguese
  Guinea, Cape Verde, São Tomé and Príncipe.
- **Italian Africa**: Eritrea and Italian Somaliland. **Ottoman Libya**
  (Tripolitania, Cyrenaica and Fezzan) and the Ottoman claim to Egypt.
- **Spanish Africa**: Spanish Sahara (Saguia el-Hamra and Río de Oro) and Spanish
  Guinea (Río Muni and Fernando Pó).
- **Belgian/Congo**: the Congo Free State districts (the Belgian Congo successor
  is the same ownership in the model).
- **Independent African polities**: Ethiopia, Liberia, Morocco, the South African
  Republic (Transvaal), the Orange Free State, Sokoto, Wadai and Darfur.
- **Islands**: Zanzibar, Pemba, Seychelles, Mauritius, Réunion, Mayotte, the
  Comoros, Cape Verde, São Tomé and Príncipe, St Helena and Ascension. Europe's
  Canaries/Azores/Madeira and Asia's Maldives/Socotra are not duplicated; the
  Portuguese India rings in the shared Portuguese feature remain Asia's
  `as-bin-goa`.

### 2.1 Twentieth-century successor completeness audit

Every sovereign African state that appeared between 1900 and 2000 is registered
as a 1900 catalog polity, a future polity, or both. The registry holds the whole
decolonisation sequence: Egypt, Sudan, South Sudan, Libya, Tunisia, Algeria,
Morocco, Eritrea, Somalia, Somaliland, Djibouti, Kenya, Uganda, Tanganyika,
Zanzibar, Tanzania, Rwanda, Burundi, Zambia, Rhodesia, Zimbabwe Rhodesia,
Zimbabwe, Malawi, Namibia, South Africa (with Walvis Bay as a separate province),
Botswana, Lesotho, Swaziland, Nigeria, Ghana, Sierra Leone, the Gambia,
Mauritania, Mali, Senegal, Guinea, Ivory Coast, Upper Volta, Dahomey, Niger,
Chad, Ubangi-Shari, Middle Congo, Gabon, the Congo, Cameroon, Togo, Angola,
Mozambique, Guinea-Bissau, Cape Verde, São Tomé and Príncipe, Equatorial Guinea,
Western Sahara, Madagascar, the Comoros, Mauritius and Seychelles. Rhodesia
(1965) and Zimbabwe Rhodesia (1979) were added after the first audit pass because
they are genuine 20th-century states that the initial registry missed.

The province model makes the transitions ordinary ownership transfers. For
example, German East Africa's mainland provinces become Tanganyika in 1961; the
Zanzibar and Pemba provinces become Zanzibar in 1963; and the 1964 union
transfers both sets to Tanzania. The test suite exercises exactly this sequence.

The same audit checks that the **borders needed to draw those states exist as
province edges**. `packages/tests/src/m12c-africa-provinces.test.ts` contains the
full list of 107 modern African land borders and asserts that every one of them
is backed by at least one shared or seam province edge between the two successor
groups; `scripts/m12c/audit-successors.mjs` is the standalone audit that prints
the same result. The only three land-border-like pairs without an edge are not
borders:

- **Botswana/Zambia** meet only at the Kazungula quadripoint (a few hundred
  metres), so there is no border line to draw;
- **Kenya/South Sudan** share the undelimited Ilemi Triangle, which the M11c map
  leaves unassigned; the provinces exist and transfer cleanly, but the drawn
  frontier is absent along that stretch and is recorded as a limitation;
- **Djibouti/Somalia** is mediated by Somaliland: Djibouti's land border is the
  Djibouti/Somaliland pair, which does have a province edge, and the 1960 union
  makes it a Somalia border.

Several 1900 areas are deliberately split so the successor borders are
representable at all: Sudan/South Sudan; German East Africa into Tanganyika,
Rwanda and Burundi; Kamerun into its French and British portions; Togoland intoits French and British portions; Nigeria into Lagos, Southern and Northern
Nigeria plus the separate Sokoto emirates; French West Africa and French
Equatorial Africa into their modern successor groups; Northern and Southern
Rhodesia and Nyasaland; Bechuanaland, Basutoland and Swaziland; the Cape Colony
and Walvis Bay; Libya into Tripolitania, Cyrenaica and Fezzan; Morocco into its
Spanish and French zones; Portuguese Guinea, Cape Verde, São Tomé and Príncipe.
Each split pair shares a continuous province edge in the bundle, proved by the
test suite; no split moves an existing province polygon.

## 3. Historical snapshots supported

`packages/tests/src/m12c-africa-provinces.test.ts` exercises these references;
they are validation paths, not forced outcomes.

| Reference | Result |
|---|---|
| 1 January 1900 | Every Africa province has one ownership record, owner = controller, no claims; Sudan starts as an explicit `condominium`; no future polity owns anything |
| 1903–1916 | Sokoto transfers to Britain, Wadai to France, Darfur to the Anglo-Egyptian Sudan (ordinary transfers on already separate provinces) |
| 1910 | The Cape Colony (including Walvis Bay), Natal, the Transvaal and the Orange Free State form the Union of South Africa (future polity 1220) |
| 1911–1923 | Italy occupies and then acquires Ottoman Libya; Tripolitania/Cyrenaica/Fezzan remain separate provinces for the 1951 federation |
| 1912–1956 | Morocco is divided into French and Spanish zones by controller changes only; the 1956 restoration is a liberation |
| 1919–1922 | German East Africa becomes Tanganyika (GBR), Rwanda and Burundi (BEL); Kamerun and Togoland are partitioned between France and Britain; German South West Africa becomes a South African mandate; Egypt becomes independent |
| 1925 | Jubaland passes from British East Africa to Italian Somaliland |
| 1936–1941 | Italy annexes Ethiopia and is expelled in 1941 |
| 1943–1945 | The former Italian colonies (Libya, Eritrea, Italian Somaliland) pass to British military administration by a controller change; ownership stays Italian/Ottoman until the 1947 peace treaty |
| 1956–1968 | Sudan, Tunisia, Morocco, Ghana, Guinea, Nigeria, Somalia, Mauritania, Mali, Senegal, Ivory Coast, Upper Volta, Dahomey, Niger, Chad, Ubangi-Shari, Middle Congo, Gabon, the Congo, Madagascar, Cameroon, Togo, Sierra Leone, Uganda, Rwanda, Burundi, Kenya, Tanganyika, Zanzibar, Nyasaland, Northern Rhodesia, the Gambia, Bechuanaland, Basutoland, Swaziland, Mauritius, Equatorial Guinea and Algeria |
| 1975–1977 | Angola, Mozambique, Guinea-Bissau, Cape Verde, São Tomé and Príncipe, the Comoros, Djibouti and the proclamation of the Sahrawi Arab Democratic Republic |
| 1980–1994 | Zimbabwe, Namibia, the transfer of Walvis Bay to Namibia, Eritrea and Somaliland |
| 2011 | The southern Sudanese provinces transfer to South Sudan at the last representable day (2000-01-01) |

Dynamic behaviour is covered by the same suite: transfers preserve ids and
geometry references; occupation changes only the controller; claims survive
transfers and never imply ownership (the Ottoman claim to Egypt); condominium and
mandate statuses are explicit; save/load round-trips the whole provincial state;
M12a-era (570 records) and M12b-era (809 records) saves still load; identical
sequences produce identical world hashes and a different order produces a
different history.

## 4. Geometry method

The Africa build uses Natural Earth 1:10m admin-1 units only as internal geometry
blocks. Every province is clipped to its authored M11c 1900 polity polygon. Later
frontiers that cut through a modern unit are split and labelled low or medium
confidence. Output is simplified at 0.02° and quantized to thousandths of a
degree.

The shared pipeline applies:

1. union the authored admin-1 blocks and authored clip/exclude shapes;
2. intersect with the 1900 polity polygon;
3. subtract earlier provinces of a different owner, with the committed Europe and
   Asia bundles seeded first;
4. simplify, then re-trim cross-owner overlaps that simplification expanded;
5. extract shared borders from the unsimplified source rings;
6. audit coverage, overlaps, duplicate ids/keys/claims and unassigned units.

Two display-only seam passes then complete the borders between provinces of
different 1900 map features. Such a frontier is clipped by two independently
authored polity polygons and the two sides can be several tenths of a degree
apart, so the exact segment match used inside one feature fails and the derived
national border would be missing there after a transfer.

1. **Province-outline pass.** Each vertex of one province is matched to the
   nearest point on the other province's outline (point-to-segment, because
   colonial straight-line frontiers have very few vertices); the midpoint of every
   match closer than 0.5° is kept, chained along the ring and emitted as an
   ordinary border record. The midpoint must be on land, must lie inside one of
   the two 1900 polities, and must not lie inside a province of a third feature.
2. **Polity-frontier pass.** For feature pairs the first pass cannot connect (and
   for the forced Algeria/Mauritania frontier) the midline between the two 1900
   polity outlines within 0.4° is attributed to the nearest province on each side,
   with the same land/third-polity filters.

Neither changes a province polygon or any simulation state, both are
deterministic, and both follow the M11c map's existing display-only seam-bridge
precedent. **183** seam pairs are committed (10 of them polity-frontier seams) and
listed in the audit. They are only drawn after an ownership transfer, because the
1900 start state draws the polity outlines, so they do not alter the reviewed 1900
map.

Coverage is measured only over the African part of features shared with Europe or
Asia: Ottoman Libya, Réunion/Mayotte, the African islands in the Portuguese
Atlantic and British Indian/South Atlantic features, Morocco north of Western
Sahara and the Cape without the Prince Edward Islands. The largest residual rows
are the sum of many small coastal, lake and frontier slivers (Lake Turkana, the
Algerian Sahara frontier, the Tarfaya overlap, the German East Africa coast). The
residual is never promoted to a duplicate province: it stays under the correct
1900 owner's polity fill, so it cannot appear as a foreign-coloured enclave. The
Congo Free State and Italian Somaliland rows are marked `estimated` where the
polygon library could not complete the sequential difference.

## 5. Border rendering

The M12a/M12b rendering contract is reused without a fork:

- every province fill carries a solid thin white hairline (0.9 screen px, never
  dotted or dashed);
- the country border is a thin near-black line at the established **1.25 screen
  px** weight, derived from current province ownership when the 1900 polity
  outline no longer equals the province union;
- province lines are subdued at global zoom and remain visible at continental and
  country zoom;
- country borders have visual priority; derived shared edges are deduplicated by
  province adjacency, so the derived national path does not double-stroke a
  shared frontier.

Visual review was performed on the exported web app at global and regional zoom.
Screenshots:

- [Global map](docs/images/m12c-africa-global.png)
- [Egypt and the Nile](docs/images/m12c-africa-egypt-nile.png)
- [Nile Delta](docs/images/m12c-africa-nile-delta.png)
- [Maghreb](docs/images/m12c-africa-maghreb.png)
- [Morocco zones and Spanish Sahara](docs/images/m12c-africa-morocco-zones.png)
- [Libya](docs/images/m12c-africa-libya.png)
- [West Africa](docs/images/m12c-africa-west-africa.png)
- [Gold Coast and Togo](docs/images/m12c-africa-gold-coast.png)
- [Central Africa](docs/images/m12c-africa-central-africa.png)
- [East Africa](docs/images/m12c-africa-east-africa.png)
- [Horn of Africa](docs/images/m12c-africa-horn.png)
- [Southern Africa](docs/images/m12c-africa-southern-africa.png)
- [Cape Colony](docs/images/m12c-africa-cape.png)
- [Madagascar and the islands](docs/images/m12c-africa-madagascar.png)
- [Province panel: Cairo](docs/images/m12c-africa-province.png)

Observed results:

- province hairlines are continuous and solid; no dotted/dashed province lines
  were observed at any zoom;
- country borders remain thin near-black lines, not thick bands; the
  Egypt/Libya, Algeria/Morocco, Gold Coast/Togo, Kenya/Tanganyika and
  Angola/Congo frontiers read correctly at regional zoom;
- no foreign-coloured enclave or missing-land patch was found in the reviewed
  regions; the French West Africa, Congo, East Africa, Horn and southern Africa
  screenshots show continuous province/polity fills;
- the province panel opens for Cairo, id 200052, current owner GBR, 1900 owner
  GBR, “British occupation administration”, ordinary status;
- the sub-Saharan map is legible at continental zoom; the Saharan interior is
  correctly sparse because 1900 Saharan administration was sparse.

The 1900 screenshots are unchanged by the seam work: at the 1900 start state the
renderer draws the static polity outlines, and the seam borders are display-only
records that participate in the derived national path only after an ownership
transfer. The seam quality is therefore verified structurally (all 107 modern land
borders are backed by a province edge; each seam midpoint is on land, inside one of
the two polities and outside any third province) and by the render-plan tests,
which turn cross-feature province pairs national after an owner change.

Two palette observations, both pre-existing app behaviour and not data defects:
the 16-colour hash palette gives the United Kingdom a pale blue-green that is
close to the Ottoman pale green, and it gives identical colours to some pairs
(Morocco/Spain, Ethiopia/Darfur, Italy/Sudan/Wadai, France/Germany-adjacent
shades). Country borders still separate them. Changing the palette would alter
the already reviewed Europe/Asia rendering, so it was left unchanged and is
recorded as a limitation.

## 6. Commands executed and results

All commands were run from `C:\vibe-games\century`.

| Command | Result |
|---|---|
| `node scripts/m12c/build-africa-provinces.mjs` | Passed. Wrote the Africa bundle: 260 provinces, 838 border pairs (655 shared + 183 seam, 10 of them polity-frontier seams), 71,494 segments, 0 unmatched, 0 duplicate ids, 0 duplicate unit claims, 0 unassigned units. Re-running produced byte-identical bundle and audit files (SHA-256 verified). |
| `node scripts/m12c/generate-africa-doc.mjs` | Passed. Regenerated `docs/AFRICA_PROVINCIALIZATION.md` (260 provinces, 16 owners, 57 future polities). |
| `node scripts/m12c/audit-successors.mjs` | Passed. 57 successor groups with provinces; 107 modern land borders checked, **0 without a province edge**. The three land-border-like pairs that are deliberately not borders (Botswana/Zambia quadripoint, Kenya/South Sudan Ilemi Triangle, Djibouti/Somalia through Somaliland) are excluded and asserted separately by the M12c test. |
| `pnpm -F @century/app typecheck` | Passed. |
| `pnpm -F @century/tests typecheck` | Passed. |
| `pnpm -F @century/tests test -- "m12c-africa-provinces\|m12a-provinces\|m12b-asia-provinces\|m11e-worldmap-geometry\|m11d-map\|m11c-geography\|worker-bundle-drift"` | Passed: 9 suites, **134 tests**, 0 failures. The M12c suite alone is 40/40. |
| `pnpm -F @century/sim-worker scenario:build` | Passed. Regenerated `worldScenario.ts` (1,703,510 bytes) with the combined province catalogue. |
| `pnpm -F @century/app build:worker` | Passed. Worker script 1625.8 KiB. |
| `pnpm run check:worker` | Passed: worker scenario and worker bundle are current. |
| `pnpm -F @century/app export:web` | Passed. Exported `dist-web` with an **8.6 MB** JavaScript bundle. |
| `node scripts/m12c/playtest-screenshot-africa.mjs` | Passed. Campaign created, map rendered at 1900-01-01, 15 screenshots captured (global, 13 regions, province panel), province panel opened for Cairo. |

The full test suite, benchmarks and non-web exports were deliberately not run
because the task requested targeted verification only.

## 7. Save and state compatibility

- `World` schema remains **27**; the save envelope and worker snapshot protocol
  are unchanged. M12c is additive content, not a new state shape.
- The combined catalogue is 1069 static definitions; the world creates 1069
  ownership records on a new campaign.
- An M12a-era save (570 European records) or an M12b-era save (809 European and
  Asian records) still loads under the project's strict same-version policy
  (verified by the two compatibility tests), but its African provinces have no
  mutable record until a new campaign is created; the map falls back to the
  authored 1900 owner for rendering. This is documented as a known limitation
  rather than silently migrated.
- No population, building, market, region or treasury values were changed.
  Province-level population/economy simulation remains future work.

## 8. Assumptions, deviations and known limitations

- Modern Natural Earth admin-1 units are proxies for 1900 internal boundaries.
  Colonial provinces, emirates, sultanates and Ethiopian provinces are groupings
  of modern units; the grouping is labelled low or medium confidence where the
  modern unit does not match the historical unit.
- The Cape Colony, Natal, the Orange Free State and Bechuanaland are coarser than
  their 1900 magisterial divisions because Natural Earth has no equivalent modern
  layer. Walvis Bay is a separate low-confidence province extracted from the
  existing Cape ring with a bounding-box clip; its outline follows the authored
  1900 coastline, not the rectangle.
- Spanish Sahara follows the M11c polygon (20.8°N–27.7°N), which includes the
  Tarfaya strip that was Moroccan until 1912–1916. The Saguia el-Hamra/Río de Oro
  split at 26°N is an authored historical approximation.
- Natural Earth's Morocco outline includes Western Sahara, so the M11c Morocco
  polygon does too; the Spanish Sahara provinces own that area and the Moroccan
  coverage scope is clipped north of 27.66°N. Ceuta and Melilla are not exposed as
  separate geometry by the M11c map (the Spanish polygon excludes them and the
  Moroccan polygon contains them), so they remain inside the 1900 Moroccan
  provinces.
- Libya's internal Tripolitania/Cyrenaica/Fezzan lines, the French/Spanish
  Moroccan zone line, the British/French Togoland and Cameroons partition lines
  and the Ethiopian province groupings are approximations labelled low
  confidence.
- Rodrigues, Chagos/Diego Garcia, the outer Seychelles, Annobón, Corisco, the
  Canaries (Europe) and Portuguese India (Asia) are not African provinces.
- The Congo basin simulation region already belongs to Belgium, so the Congo Free
  State provinces are Belgian-owned in 1900 and the 1908 annexation is a status
  change rather than an ownership change.
- Egypt's simulation region belongs to the Ottoman Empire while its provinces are
  owned by the British occupying power; de jure Ottoman suzerainty is a formal
  claim (exercised by the test), not the 1900 ownership record. The 1900 start
  state seeds no claims, for consistency with Europe and Asia.
- South Sudan's historical independence (9 July 2011) is outside the simulated
  calendar (1900-01-01–2000-01-01). Its future-polity activation is clamped to
  2000-01-01 and the note records the real date; the transfer remains an ordinary
  ownership change on permanently separate provinces.
- Cross-feature seam borders are display-only approximations (midpoints between
  province outlines within 0.5° or between the two 1900 polity frontiers within
  0.4°). They are not surveyed lines and they do not change the province
  polygons; their purpose is that the derived national border exists on every
  African frontier after a transfer. Three land-border-like pairs are deliberately
  not seams: the Botswana/Zambia quadripoint, the undelimited Kenya/South Sudan
  Ilemi Triangle (unassigned in the M11c map, so no derived border is drawn along
  that stretch) and Djibouti/Somalia, which is mediated by Somaliland.
- Country-border derivation after a transfer is covered by the render-plan tests
  (same-feature and cross-feature pairs become national after an owner change),
  but no in-app transfer UI exists in this milestone, so the post-transfer border
  was not driven visually through the exported campaign. The M12a global
  suppression rule is reused unchanged.
- `packages/sim` is still free of DOM/platform dependencies: the build, the
  generated app bundle and the renderer are the only new geometry consumers.
- No benchmark was run; province geometry is static content and the snapshot
  gains 260 ownership records (1069 total). Targeted verification only, as
  requested.

## 9. Files created or modified

Created:

- `scripts/m12c/africa-plan.mjs`
- `scripts/m12c/build-africa-provinces.mjs`
- `scripts/m12c/generate-africa-doc.mjs`
- `scripts/m12c/playtest-screenshot-africa.mjs`
- `scripts/m12c/audit-successors.mjs`
- `packages/data/data/map/provinces_africa_1900.json`
- `packages/data/data/map/provinces_africa_1900_audit.json`
- `packages/app/src/generated/provincesAfrica1900.ts`
- `packages/tests/src/m12c-africa-provinces.test.ts`
- `docs/AFRICA_PROVINCIALIZATION.md`
- `docs/images/m12c-africa-global.png`, `m12c-africa-egypt-nile.png`,
  `m12c-africa-nile-delta.png`, `m12c-africa-maghreb.png`,
  `m12c-africa-morocco-zones.png`, `m12c-africa-libya.png`,
  `m12c-africa-west-africa.png`, `m12c-africa-gold-coast.png`,
  `m12c-africa-central-africa.png`, `m12c-africa-east-africa.png`,
  `m12c-africa-horn.png`, `m12c-africa-southern-africa.png`,
  `m12c-africa-cape.png`, `m12c-africa-madagascar.png`,
  `m12c-africa-province.png`
- `M12C_COMPLETION_REPORT.md`

Modified:

- `packages/data/src/provinces.ts` — combined Europe + Asia + Africa loader,
  collision checks and future-polity merge.
- `packages/app/src/provinceMapBundle.ts` — three-bundle merge.
- `packages/sim-worker/src/generated/worldScenario.ts` — regenerated with the
  combined province definitions.
- `packages/app/src/generated/simWorker.ts` — regenerated worker bundle.
- `packages/tests/src/m12a-provinces.test.ts` — the owner-aggregation assertion
  now counts the combined three-bundle catalogue, and the European “Germany owns
  nothing after 1949” assertion is scoped to European province ids (the African
  German colonies legitimately remain German in that European sequence).
- `packages/tests/src/m12b-asia-provinces.test.ts` — the combined-catalogue
  assertion now includes Africa; all Asia assertions are preserved.
- `DECISIONS.md` — D-105.

Preserved from the pre-existing working tree (not reset or rewritten): the M12a
and M12b completion reports, both provincialization documents, the
`docs/images/m12a-*` and `docs/images/m12b-*` screenshots, `scripts/m12/*`,
`scripts/m12b/*`, the Europe and Asia bundles/audits and their generated app
bundles, `packages/app/src/components/WorldMap.tsx`,
`packages/app/src/screens/GameShell.tsx`, `packages/app/src/generated/provinces1900.ts`
and `packages/app/src/generated/worldMap1900.ts`. The Europe and Asia bundles were
not rebuilt and their hashes are unchanged by this milestone.

## 10. Working-tree status

No commit was made: the task requires the visual result to be reviewed first. The
working tree contains the M12a/M12b changes that were already present when M12c
started, plus the M12c files listed above. The pre-existing untracked notes
`.cache-regions.md` and `.cache-regions-utf8.md` were not created by this
milestone and were left untouched; the M12c scratch analysis scripts and their
outputs were removed after use.
