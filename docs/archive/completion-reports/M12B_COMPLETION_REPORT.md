# M12b — Asian Provincial System: Completion Report

Status: implemented and visually reviewed. This report records the delivery,
the exact verification commands and results, the design decisions and the known
limitations. The committed province bundles, code and
[`docs/ASIA_PROVINCIALIZATION.md`](../../ASIA_PROVINCIALIZATION.md) are
authoritative if they disagree with this report.

## 1. Architecture

- Asia is the direct counterpart of M12a Europe. The sole geographical
  subdivision beneath a polity remains `Province`; no Polity → Region → Province
  hierarchy and no parallel geographical region layer were introduced.
- Europe and Asia are separate deterministic build artifacts:
  - `packages/data/data/map/provinces_1900.json` (M12a Europe, preserved);
  - `packages/data/data/map/provinces_asia_1900.json` (M12b Asia).
- One loader combines them with unique ids and merged border data:
  - `packages/data/src/provinces.ts` for the simulation definitions and
    future-polity registry;
  - `packages/app/src/provinceMapBundle.ts` for rendering, border planning and
    the province panel.
- Asia province ids start at **100001**, above the entire M12a block (maximum
  66001), and every key is prefixed `as-`. The build and both loaders reject a
  collision rather than silently replacing a province. Europe ids and keys are
  unchanged.
- The shared geometry pipeline was extracted to
  `scripts/m12/province-build-lib.mjs`. `scripts/m12/build-provinces.mjs` is now
  a thin Europe wrapper; `scripts/m12b/build-asia-provinces.mjs` is the Asia
  wrapper. Re-running the Europe build reproduces the committed European bundle
  exactly (570 provinces, 1604 border pairs, 142610 segments, 67
  multi-neighbour segments, 38 small overlaps).
- Ownership, control, occupation, claims and special status remain mutable in
  `World.provinces`; geometry, ids and names never change. Country borders are
  reconstructed from current province ownership through the existing M12a
  contract.

## 2. Inventory

- Asia provinces: **239** (ids 100001–100239).
- Asia future successor polities: **45** (ids 1100–1144).
- Asia border pairs: **633**; shared segments: **155016**; segments with more
  than two neighbours: **64**.
- 1900 owner polities with Asian provinces: **16** — Ottoman Empire, Jabal
  Shammar, Muscat and Oman, Qajar Persia, Afghanistan, Nepal, Siam, Qing China,
  Korean Empire, Empire of Japan, Russian Empire, United Kingdom, France,
  Portugal, Netherlands and the United States (Philippines).
- Map features covered: **29** — OTT, SHM, OMN, PER, AFG, NPL, BHU, THA, CHN,
  TIB, KOR, JPN, TWN, RUS, KHI, BUK, BIN, CEY, MAL, HKG, KUW, TRU, DEI, FIC,
  PHL, PTM, MAC, SAR and BPO (Maldives).
- Confidence: low 17, medium 208, high 14.
- Unique ids/keys: yes; duplicated ids/keys: 0; unassigned admin-1 units: 0.
- Combined catalogue: **809** provinces, **62** future polities, **2237** border
  pairs (570/17/1604 Europe + 239/45/633 Asia).

Several 1900 provinces are deliberately split so the successor borders are
representable at all: West/East Punjab; Indian/Azad/Aksai Chin Kashmir;
Lebanon/Syrian Coast; Aleppo/Urfa; Hatay; Jerusalem/Palestine; South/North
Gangwon; Batum/Artvin; Erivan/Iğdır; Kars; Kazakh/Uzbek Syr-Darya;
Fergana/Osh; Samarkand/Khojand; Pamir/Wakhan; and Khiva/Tashauz. The split lines
follow modern first-level units or the 1900 M11c frontier and are labelled low
confidence; no split moves an existing province polygon, and every successor
snapshot is an ordinary ownership transfer.

Coverage includes at minimum:

- Ottoman Asia: Anatolia, the Levant, Mesopotamia, Arabia, Hejaz, Yemen, the
  Gulf, the Dodecanese and Ottoman Transjordan, with separate Levantine and
  Mesopotamian provinces for Lebanon, Syria, Jordan, Iraq, Israel and Palestine.
- Qajar Persia, Afghanistan, Nepal, Bhutan and Central Asia (including the
  Khivan and Bukharan protectorates).
- Russian Asia: the Caucasus (including the 1878 Kars/Ardahan/Batum
  annexations), the Kazakh steppe, Turkestan, Siberia and the Far East.
- Qing China including Tibet, Xinjiang, Mongolia and Manchuria; Hong Kong and
  Macao as separate colonies. Manchuria has five permanent provinces — Fengtian,
  Jilin, Heilongjiang, Rehe and Xing’an — so Manchukuo’s 1932 core plus Rehe
  (1933) and the later ROC/PRC ownership are all representable. The ROC’s nine
  1945 Northeast provinces and Manchukuo’s later internal provinces are not
  separately represented.
- Japan, the Korean Empire, Taiwan and the Japanese home islands.
- British India including the presidency/province scale plus the major princely
  states, Burma, Aden, Ceylon, Malaya, Singapore, British North Borneo, Brunei,
  Sarawak and the Maldives.
- Siam, French Indochina (including French India), the Dutch East Indies, the
  Philippines, Portuguese Timor and Portuguese India.

## 3. Historical snapshots supported

`packages/tests/src/m12b-asia-provinces.test.ts` exercises these references; they
are validation paths, not forced outcomes:

| Reference | Result |
|---|---|
| 1 January 1900 | Every Asia province has one ownership record, owner = controller, no claims; future polities own nothing |
| 1918–1920 | Levant and Mesopotamia become Syrian/Lebanese/Iraqi/Transjordanian polities under French/British mandate control; Hejaz and Yemen independent; Dodecanese to Italy; Georgia, Armenia and Azerbaijan formed from the Caucasus |
| 1921–1923 | The Republic of Turkey receives the remaining Ottoman Asian provinces; Kars, Ardahan, Artvin and Iğdır return from Russia; Urfa passes from Syria to Turkey; the Wakhan returns to Afghan sovereignty; Hatay remains in Syria |
| 1932–1939 | Manchukuo receives Fengtian, Jilin, Heilongjiang and Xing’an in 1932 and Rehe in 1933; the Japanese occupation of Jiangsu is control without ownership; Hatay passes from Syria to Turkey in 1939; a negotiated restoration remains possible |
| 1945 | Manchukuo dissolved; Taiwan and the mainland return to the Republic of China; Korea remains one polity |
| 1947–1971 | West Punjab, Sind, the North-West Frontier, Baluchistan and Azad Kashmir form Pakistan; East Bengal joins Pakistan and becomes Bangladesh in 1971; India keeps the Indian Punjab, Indian Kashmir and West Bengal; Aksai Chin passes to China in 1962 |
| 1948–1949 | The DPRK and the Republic of Korea receive the northern and southern Korean provinces (including split Gangwon); the PRC receives the mainland while the ROC retains Taiwan |
| 1948–1988 | Israel receives the Jerusalem province and the State of Palestine receives the Palestine province |
| 1990–1991 | Kazakhstan, Uzbekistan, Turkmenistan, Tajikistan, Kyrgyzstan, Georgia, Armenia and Azerbaijan receive their split provinces; the Russian core in Siberia remains Russian |

Dynamic behaviour is covered by the same suite: transfers preserve ids and
geometry references; occupation changes only the controller; claims survive
transfers and never imply ownership; mandates and autonomy are explicit
special statuses; save/load round-trips the whole provincial state; identical
sequences produce identical world hashes and a different order produces a
different history.

## 4. Geometry method

The Asia build uses Natural Earth 1:10m admin-1 units only as internal geometry
blocks. Every province is clipped to its authored M11c 1900 polity polygon.
Later frontiers that cut through a modern unit are split and labelled low or
medium confidence. Output is simplified at 0.02° and quantized to thousandths of
a degree.

The shared pipeline applies:

1. union the authored admin-1 blocks and authored clip/exclude shapes;
2. intersect with the 1900 polity polygon;
3. subtract earlier provinces of a different owner, with the committed M12a
   Europe bundle seeded first so an Asian province cannot paint a
   foreign-coloured sliver across a reviewed European frontier;
4. simplify, then re-trim cross-owner overlaps that simplification expanded;
5. extract shared borders from the unsimplified source rings;
6. audit coverage, overlaps, duplicate ids/keys and unassigned units.

Enclosed microstates/colonies (Hong Kong, Macao, Kuwait, Trucial Coast,
Sarawak, Khiva, Bukhara) are exempt from cross-owner subtraction so they cannot
disappear. The coverage audit is reported in the bundle audit; estimated rows
occur where the polygon library cannot complete a very large sequential
difference.

## 5. Border rendering

The M12a rendering contract is reused without a fork:

- every province fill carries a solid thin white hairline (0.9 screen px, never
  dotted or dashed);
- the country border is a thin near-black line at the established
  **1.25 screen px** weight, derived from current province ownership when the
  1900 polity outline no longer equals the province union;
- province lines are subdued at global zoom and remain visible at continental
  and country zoom;
- country borders have visual priority; derived shared edges are deduplicated
  by province adjacency, so the derived national path does not double-stroke a
  shared frontier.

Visual review was performed on the exported web app at global and regional
zoom. Screenshots:

- [Global map](../../images/m12b-asia-global.png)
- [Anatolia and the Levant](../../images/m12b-asia-anatolia-levant.png)
- [Levant successor splits](../../images/m12b-asia-levant-split.png)
- [Punjab and Kashmir splits](../../images/m12b-asia-punjab-kashmir.png)
- [Persia](../../images/m12b-asia-persia.png)
- [India](../../images/m12b-asia-india.png)
- [China](../../images/m12b-asia-china.png)
- [Manchuria](../../images/m12b-asia-manchuria.png)
- [Japan and Korea](../../images/m12b-asia-japan-korea.png)
- [Korean split](../../images/m12b-asia-korea-split.png)
- [Indochina](../../images/m12b-asia-indochina.png)
- [Indonesia](../../images/m12b-asia-indonesia.png)
- [Siberia](../../images/m12b-asia-siberia.png)
- [Province panel: Bengal](../../images/m12b-asia-province.png)

Observed results:

- the split pairs share continuous province edges, so each successor frontier is
  drawable without gaps or duplicated polygons: the build has a shared border
  for West/East Punjab, Indian/Azad/Aksai Chin Kashmir, Lebanon/Syrian Coast,
  Jerusalem/Palestine, South/North Gangwon, Batum/Artvin, Erivan/Iğdır,
  Kars/Artvin, Kazakh/Uzbek Syr-Darya, Fergana/Osh, Samarkand/Khojand,
  Pamir/Wakhan and Khiva/Tashauz;
- Manchuria has five permanent provinces — Fengtian, Jilin, Heilongjiang,
  Xing’an and Rehe. Manchukuo receives the first four in 1932 and Rehe in 1933;
  the ROC receives all five in 1945 and the PRC receives the mainland in 1949;
  the transfers are covered by the reference tests;
- no foreign-coloured enclave or missing-land patch was found in the reviewed
  regions; the Levant, Mesopotamia and Arabia were additionally checked through
  the live DOM (Damascus, Baghdad, Aleppo and Jerusalem resolve to the Ottoman
  province paths and the correct 1900 polity fill), and the other regional
  screenshots show correct province/polity fills;
- province hairlines are continuous and solid; no dotted/dashed province lines
  were observed;
- country borders remain thin near-black lines, not black bands; the China/Tibet,
  India/Nepal, Siam/Indochina and Russia/China frontiers read correctly at
  regional zoom;
- the province panel opens for an Asian province: Bengal, id 100167, current
  owner GBR, 1900 owner GBR, “British Indian province”, ordinary status.

The global map is intentionally subdued for province lines; continental zoom is
the intended scale for reading the provincial grid.

## 6. Commands executed and results

All commands were run from `C:\vibe-games\century`.

| Command | Result |
|---|---|
| `node scripts/m12/build-provinces.mjs` | Passed. Wrote Europe bundle: 570 provinces, 1604 borders, 142610 segments, 67 unmatched, 0 duplicate ids. Output matched the pre-existing M12a working-tree bundle. |
| `node scripts/m12b/build-asia-provinces.mjs` | Passed. Wrote Asia bundle: 239 provinces, 633 borders, 155016 segments, 64 unmatched, 0 duplicate ids, 0 unassigned units. 64 small overlap pairs within a map feature (largest 0.0359 deg², Tibet’s two provinces); coverage warnings are documented. |
| `node scripts/m12b/generate-asia-doc.mjs` | Passed. Regenerated `docs/ASIA_PROVINCIALIZATION.md` (239 provinces, 16 owners, 45 future polities). |
| `pnpm -F @century/tests typecheck` | Passed. |
| `pnpm -F @century/app typecheck` | Passed. |
| `pnpm -F @century/tests test -- "m12b-asia-provinces\|m12a-provinces\|m11e-worldmap-geometry\|m11d-map"` | Passed: 6 suites, **71 tests**, 0 failures. The M12b suite alone is 32/32. |
| `pnpm -F @century/sim-worker scenario:build` | Passed. Regenerated `worldScenario.ts` (1,460,746 bytes) with the combined province catalogue. |
| `pnpm -F @century/app build:worker` | Passed. Worker script 1453.5 KiB; verified it contains Asian province data. |
| `pnpm run check:worker` | Passed: worker scenario and worker bundle are current. |
| `pnpm -F @century/app export:web` | Passed. Exported `dist-web` with a **7.7 MB** JavaScript bundle; verified the bundle contains the Asian province catalogue and combined loader. |
| `node scripts/m12b/playtest-screenshot-asia.mjs` | Passed. Campaign created, map rendered at 1900-01-01, 14 screenshots captured, province panel opened for Bengal. |

The full test suite, benchmarks and non-web exports were deliberately not run
because the task requested targeted verification only.

## 7. Save and state compatibility

- `World` schema remains **27**; the save envelope and worker snapshot protocol
  are unchanged. M12b is additive content, not a new state shape.
- The combined catalogue is 809 static definitions; the world creates 809
  ownership records on a new campaign.
- An M12a-era save contains only the 570 European ownership records. It still
  loads under the project’s strict same-version policy (verified by the
  “M12a-era save with only European ownership records” test), but its Asian
  provinces have no mutable record until a new campaign is created; the map
  falls back to the authored 1900 owner for rendering. This is documented as a
  known limitation rather than silently migrated.
- No population, building, market, region or treasury values were changed.
  Province-level population/economy simulation remains future work.

## 8. Assumptions, deviations and known limitations

- Modern Natural Earth admin-1 units are proxies for 1900 internal boundaries;
  Ottoman vilayets, Qing provinces, Indian presidencies/princely states,
  Japanese regions, Korean provinces, Siamese monthon and Russian
  governorates are groupings of modern units.
- Siam’s 1907/1909 losses are modelled: Inner Cambodia, Xaignabouri, Kedah,
  Perlis, Kelantan and Terengganu are Siamese provinces in 1900 and become
  French/British through later transfers. The modern units are clipped to the
  1900 Siamese polygon.
- Gwadar is a low-confidence Omani enclave clipped to the Omani polygon.
  The Dodecanese are Ottoman in 1900 and transfer to Italy in the reference
  snapshot.
- The M11c Russian/Afghan/Chinese Pamir and Uriankhai (Tuva) frontiers are
  approximations; the Pamir province is low confidence and Tuva is represented
  as a Siberian province in the 1900 model.
- Kinmen is included in the M11c Taiwan polygon although it remained Chinese in
  1900; it is carried in the Taihoku province with low confidence.
- Portuguese India (Goa/Daman/Diu) and French India (Pondicherry) are separate
  low/medium-confidence provinces inside the British India and French Indochina
  map features; their simulation-region reference is the nearest available
  Portuguese/French aggregate.
- The successor-border splits are deliberate low-confidence subdivisions of 1900
  administrative areas: West/East Punjab; Indian/Azad/Aksai Chin Kashmir;
  Lebanon/Syrian Coast; Aleppo/Urfa; Hatay; Jerusalem/Palestine; South/North
  Gangwon; Batum/Artvin; Erivan/Iğdır; Kars; Kazakh/Uzbek Syr-Darya;
  Fergana/Osh; Samarkand/Khojand; Pamir/Wakhan; and Khiva/Tashauz. Their lines
  follow modern first-level units or the 1900 M11c frontier, so they approximate
  the Radcliffe line, the 1949 armistice lines, the 38th parallel and the 1921
  Turkish frontier rather than surveying them.
- Coverage residual is the sum of many small coastal/frontier slivers rather
  than one missing province. Because the residual stays under the correct 1900
  owner’s polity fill it does not appear as a foreign-coloured enclave. RUS,
  TIB, THA, DEI, FIC, JPN, CEY and MAL coverage rows are marked `estimated`
  where the geometry library could not complete the sequential difference.
- Country-border derivation after a transfer is covered by the render-plan test
  (a shared Bengal/Eastern Bengal edge becomes national after the transfer), but
  no in-app transfer UI exists in this milestone, so the post-transfer border was
  not driven visually through the exported campaign. The M12a global suppression
  rule is reused unchanged: after a transfer the changed polity’s static 1900
  outline is suppressed and its shared province edges supply the border; its
  border with a non-province area is still drawn by the existing underlay/coast
  layers, not by the derived national path.
- No benchmark was run; province geometry is static content and the snapshot
  gains 239 ownership records (809 total). The full test suite and non-web
  exports were not run because the task requested targeted verification.

## 9. Files created or modified

Created:

- `scripts/m12/province-build-lib.mjs`
- `scripts/m12b/asia-plan.mjs`
- `scripts/m12b/build-asia-provinces.mjs`
- `scripts/m12b/generate-asia-doc.mjs`
- `scripts/m12b/playtest-screenshot-asia.mjs`
- `packages/data/data/map/provinces_asia_1900.json`
- `packages/data/data/map/provinces_asia_1900_audit.json`
- `packages/app/src/generated/provincesAsia1900.ts`
- `packages/app/src/provinceMapBundle.ts`
- `packages/tests/src/m12b-asia-provinces.test.ts`
- `docs/ASIA_PROVINCIALIZATION.md`
- `docs/images/m12b-asia-global.png`, `m12b-asia-anatolia-levant.png`,
  `m12b-asia-levant-split.png`, `m12b-asia-punjab-kashmir.png`,
  `m12b-asia-persia.png`, `m12b-asia-india.png`, `m12b-asia-china.png`,
  `m12b-asia-manchuria.png`, `m12b-asia-japan-korea.png`,
  `m12b-asia-korea-split.png`, `m12b-asia-indochina.png`,
  `m12b-asia-indonesia.png`, `m12b-asia-siberia.png`,
  `m12b-asia-province.png`
- `M12B_COMPLETION_REPORT.md`

Modified:

- `scripts/m12/build-provinces.mjs` — thin wrapper over the shared library;
  Europe output unchanged.
- `packages/data/src/provinces.ts` — combined Europe + Asia loader, collision
  checks and future-polity merge.
- `packages/app/src/components/WorldMap.tsx` — uses the combined catalogue.
- `packages/app/src/screens/GameShell.tsx` — province panel uses the combined
  catalogue.
- `packages/sim-worker/src/generated/worldScenario.ts` — regenerated with the
  combined province definitions.
- `packages/app/src/generated/simWorker.ts` — regenerated worker bundle.
- `packages/tests/src/m12a-provinces.test.ts` — combined-catalogue expectations
  and the combined map loader assertion; all Europe assertions preserved.
- `DECISIONS.md` — D-104.

Preserved from the pre-existing M12a working tree (not reset or rewritten):
`M12A_COMPLETION_REPORT.md`, `docs/EUROPE_PROVINCIALIZATION.md`, the four
`docs/images/m12a-*.png` screenshots, `scripts/m12/province-plan.mjs`,
`scripts/m12/generate-provenance-doc.mjs`, `scripts/m12/playtest-screenshot.mjs`
and the Europe bundle/audit content. The Europe rebuild reproduced the same
bundle values.

## 10. Working-tree status

No commit was made: the task requires the visual result to be reviewed first.
The working tree contains the M12a follow-up changes that were already present
when M12b started, plus the M12b files listed above. The pre-existing untracked
notes `.cache-regions.md` and `.cache-regions-utf8.md` were not created by this
milestone and were left untouched.
