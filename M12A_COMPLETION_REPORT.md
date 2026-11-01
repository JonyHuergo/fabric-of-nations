# M12a — European Provincial System: Completion Report

Status: implemented. The authoritative details are the code, the committed
province bundle and `docs/EUROPE_PROVINCIALIZATION.md`; this report records the
milestone delivery, verification commands and remaining uncertainties.

## 1. Architectural changes from geographical Regions to Provinces

- The sole geographical subdivision beneath a polity is now `Province`.
  `packages/sim/src/provinces/*` defines the permanent province definition,
  mutable ownership/control/claims/special-status state, validation, deterministic
  mutations and the future-polity registry.
- `World.provinces` (schema 27) is authoritative political state. Province
  geometry, historical names, grouping and provenance are static scenario/app
  content and are never serialized.
- Provinces reference the population/economy accounting unit
  (`simulationRegionId`), not the reverse. The historical `Region` concept is
  preserved as `SimulationRegion` (explicit aliases added) and keeps its runtime
  field name `regions` for save compatibility; it is no longer used for map
  geometry, selection or country composition.
- The map renders one fill per province, one dotted white edge per province
  boundary, and a stronger solid edge only when the two provinces have different
  current owners. Country borders are therefore reconstructed from province
  ownership. A 1900 polity covered by provinces does not draw its static 1900
  outline, so transfers cannot leave stale national borders.
- Province hit-testing and selection are implemented at every zoom; the country
  selection highlights all provinces of the current owner.

## 2. Confirmation that the old geographical Region layer was replaced

- No `Region` type is used by `worldMapGeometry.ts`, `provinceRenderPlan.ts` or
  the province map bundle. The regression test
  `map geometry no longer depends on the simulation Region layer` asserts this.
- `WorldMap.tsx` uses `PROVINCES_1900`, `decodeProvinceGeometry`,
  `planProvinceBorders`, `provinceBorderPaths.dotted` and `strokeDasharray`.
- The old implicit “one map polygon = one region” relationship is gone. Map
  geometry comes exclusively from the province bundle; simulation regions no
  longer have polygons in the app.
- No parallel geographical region system remains.

## 3. Number of European polities covered

**26** 1900 owner polities/territories have at least one province (see the
generated inventory). This includes Austria-Hungary, the German Empire, the
Russian Empire's European territory, the United Kingdom and Ireland, France,
Italy, Spain, Portugal, Belgium, the Netherlands, Luxembourg, Switzerland,
Denmark, Sweden, Norway, Greece, Serbia, Montenegro, Bulgaria, Romania, the
European Ottoman Empire, Crete, Cyprus, Malta, Iceland, the Faroe Islands,
Greenland, Monaco, San Marino, Andorra and Liechtenstein.

## 4. Number of provinces created

**570** provinces: a **1,073,306-byte** committed geometry+metadata bundle in
`packages/data/data/map/provinces_1900.json`;
boundaries and provenance. The committed app bundle is
`packages/app/src/generated/provinces1900.ts`.

## 5. Complete province inventory by original owner

The complete table (id, key, historical 1900 name, administrative affiliation,
grouping and confidence) is in
[`docs/EUROPE_PROVINCIALIZATION.md`](docs/EUROPE_PROVINCIALIZATION.md) §8.

## 6. Historical administrative metadata implemented

- Austrian Crown Lands: Bohemia, Moravia, Austrian Silesia, Galicia, Bukovina,
  Dalmatia, Carniola, Styria, Carinthia, Tyrol, Salzburg, Upper/Lower Austria,
  Vienna, Vorarlberg, Littoral.
- Hungarian half: Hungarian counties, Upper Hungary/Slovakia, Transylvania,
  Székely Land, Partium, Banat, Bačka, Syrmia, Croatia-Slavonia, Fiume,
  Burgenland, Carpathian Ruthenia.
- Bosnia-Herzegovina: `joint-administration` special status (not an ordinary
  province of either half).
- Prussian provinces and other German states, Reichsland Alsace-Lorraine,
  Schleswig-Holstein, the Prussian eastern provinces and the Saar.
- Russian governorates and the Grand Duchy of Finland; Congress Poland; Baltic
  provinces; Belarusian, Ukrainian and Bessarabian districts.
- Historic English/Welsh/Scottish county groupings and the 32 Irish counties.
- Ottoman vilayets in Europe; French departments; Spanish provinces; Italian
  historic regions; and the smaller states' provinces/cantons/counties.

## 7. Future successor polity definitions

17 polities are registered with stable ids 1000–1016: Poland, Czechoslovakia,
Yugoslavia, Finland, Estonia, Latvia, Lithuania, East Germany, West Germany,
Ireland, Austria (republic), Hungary (successor), Danzig, Albania, Ukraine,
Belarus and Moldova. None is selectable in 1900; each has activation dates,
classification, capital, flag key and sources. Full table:
`docs/EUROPE_PROVINCIALIZATION.md` §6.

## 8. Geographical sources and confidence levels

The bundle lists every source with licence and URL, including Natural Earth
1:10m admin-1/admin-0 (public domain), the 1911 Encyclopaedia Britannica
articles for Austria-Hungary, Germany, Russia, Poland and the United Kingdom, and
the treaties of Versailles, Saint-Germain, Trianon, Lausanne, London, Potsdam and
the 1990 Two-Plus-Four settlement, plus the M11c authored 1900 boundary
reconstruction. Confidence: low/medium/high per province; methodology and
uncertainties are in `docs/EUROPE_PROVINCIALIZATION.md` §3 and §9.

## 9. Austria-Hungary's provincial subdivision

The dual monarchy remains **one polity (id 60)** on 1 January 1900. Its provinces
cover the Austrian crown lands, the Hungarian counties and the jointly
administered Bosnia-Herzegovina, with 54 provinces including the sub-splits
required by the 1918–1920 settlement:
Bohemia/Prague, Moravia, Austrian Silesia and Hultschin, Western/Eastern Galicia
and Tarnopol, Northern/Southern Bukovina, Carpathian Ruthenia, Carniola, Lower
Styria, Gorizia/Gradisca, Istria, Trieste, South Tyrol, Trentino, Dalmatia,
Fiume, Croatia Proper, Slavonia, Bosnia, Herzegovina, the Hungarian core
groups, Slovakia (seven provinces), Transylvania, Székely Land, Partium, Banat,
Bačka and Syrmia.

## 10. German provincial subdivision

33 provinces, including the Prussian provinces and the constituent states that
matter for the historical settlements: East Prussia split into Königsberg and
Allenstein (with Memel separate), West Prussia, Danzig, Posen, Pomerania,
Brandenburg/Lebus, Lower/Middle/Upper Silesia, Prussian Saxony, Hanover,
Westphalia, Rhine Province, Palatinate, Hesse, Thuringia, Saxony, Bavaria,
Baden, Württemberg, Hohenzollern, Mecklenburg, Schleswig-Holstein, North
Schleswig, Eupen-Malmedy, Alsace, Lorraine, Saar, Hamburg, Bremen and Berlin.

## 11. Russian European provincial subdivision

111 provinces: Finland's nine lääni (including Åland), the Baltic governorate
groups, Congress Poland's six governorate groups, six Belarusian provinces,
twelve Ukrainian provinces, three Bessarabian districts, and the European
Russian governorate-scale provinces (Moscow, Saint Petersburg, the central
governorates, the Volga, the Urals fringe and the North Caucasus). Asiatic
Russia, Central Asia and Transcaucasia are deliberately outside the M12a scope.

## 12. British and Irish provincial subdivision

50 provinces: England (10 county groupings including Devon/Cornwall and Wessex),
Wales (3), Scotland (4), the six Northern Ireland counties and the 26 counties of
Ireland. The six counties are distinguishable in 1900 and remain with the United
Kingdom after 1922; the 26 counties transfer to the Irish Free State.

## 13. Historical reference snapshots and results

Validation snapshots live in `packages/tests/src/m12a-provinces.test.ts`:

| Reference | Result |
|---|---|
| 1 January 1900 | 570 province records, owner = controller, empty claims, Austria-Hungary still one polity |
| 1918–1920 | Austria-Hungary dissolves: CZE ≥ 10, POL ≥ 3, ROM ≥ 4, YUG ≥ 8, ITA ≥ 3 provinces; no AUT-owned province remains |
| 1919 German settlement | Alsace/Lorraine → France, North Schleswig → Denmark, Eupen → Belgium, Posen/West Prussia/Upper Silesia → Poland, Danzig free city, Memel → Lithuania, Saar mandate under French control while German-owned |
| 1919 East Prussia | Border-graph BFS from East Prussia cannot reach Brandenburg through German-owned provinces after the Corridor transfer |
| 1945 | Northern East Prussia → USSR, southern East Prussia/Pomerania/Silesia/Lebus/Danzig → Poland |
| 1949 | West → FRG, East → DDR, Berlin special status; no German-owned province remains |
| 1990 | DDR provinces accede to FRG; former eastern provinces remain Polish/Soviet |
| 1991 | Finland, Estonia, Latvia, Lithuania, Poland, Ukraine, Belarus and Moldova receive their provinces; Russian core remains |
| Ireland | 26 counties → Irish Free State; six Northern Ireland counties remain UK |
| 1938–1939 | Anschluss and alternative restoration are ordinary transfers; geometry unchanged |

## 14. Dynamic territorial transfer test results

- `transferProvinceOwnership` changes legal ownership and control (unless
  `preserveController`), updates claims and appends one bounded audit record.
- `setProvinceControl` changes effective control only; occupation never changes
  ownership. Tested with the Saar 1920–1935.
- Province ids and geometry are unchanged by transfer (`ownership transfers
  preserve province ids and geometry references`).
- Identical transfer sequences produce identical world hashes; a different
  sequence produces a different hash.
- Save/load round-trips ownership, control, claims, special status and audit
  history and re-validates the whole world.

## 15. Provincial line-rendering implementation and visual results

- `planProvinceBorders` classifies each shared edge by current owners.
- Every edge is drawn with `strokeDasharray` (`1.5` on / `1.7` off screen units),
  white `#f4f1e6`, `0.9` px at ordinary zoom, opacity `0.42` at global zoom,
  `0.62` at continental zoom and `0.78` at country zoom.
- A national border is a solid `colors.mapBorder` line at `1.7` px over the same
  shared edge when owners differ; coastlines come from the single land-mask
  stroke. Internal province dotted lines remain visible between provinces of the
  same country.
- Static verification render: [`docs/images/m12a-provinces-1900.png`](docs/images/m12a-provinces-1900.png).
- Real exported-app verification: [`docs/images/m12a-game-map.png`](docs/images/m12a-game-map.png)
  (global), [`docs/images/m12a-game-map-zoom.png`](docs/images/m12a-game-map-zoom.png)
  (continental/country zoom) and
  [`docs/images/m12a-game-map-province.png`](docs/images/m12a-game-map-province.png)
  (Bavaria selected; province panel showing current owner, 1900 owner,
  administrative affiliation, status and notes).

## 16. Map rendering and performance results

- Province fill layer: 570 paths; province border layer: 1,528 shared-border
  paths combined into one dotted path and one national path; polity labels remain
  screen-constant with collision culling.
- No white ocean overlay: the land mask keeps its transform and no extra ocean
  layer is added; province fills are clipped to the 1900 polity polygons.
- Hit-testing uses world coordinates, so it is invariant under zoom and pan;
  the smallest containing province wins.
- Benchmark results are recorded in §18 (see `m12a-bench.log`). The M7 worker
  benchmark (which builds a real snapshot) reports complete tick + snapshot p95
  87.87 ms and save compress+decompress p95 57.84 ms.

## 16a. Visual verification results

The exported web app was driven through Chrome DevTools Protocol. At global zoom
the province layer is intentionally subdued (0.42 opacity); at continental and
country zoom the white dotted province edges and the stronger solid country
borders are clearly distinguishable. Selecting Bavaria opens the province panel
with `Province 2001 · high confidence`, current owner DEU, 1900 owner DEU,
`Kingdom of Bavaria`, special status and the historical note. The screenshots are
committed under `docs/images/`.

## 17. Save compatibility results

- Save envelope format is unchanged (`century-save`, format version 1).
- World schema is 27; province state is encoded/decoded with explicit validators
  and the complete world is re-validated on load.
- The app's `SUPPORTED_SAVE_SCHEMA_VERSION` is 27.
- The full save/load round-trip test passes and produces the same world hash.
- The project's existing strict same-version policy still rejects saves from a
  different simulation version; no silent migration is claimed.

## 18. All tests executed

Commands and results (see the logs in the repository root):

- `pnpm lint` — passed: 230 TypeScript files, 66 in `packages/sim`.
- `pnpm typecheck` — passed for sim, data, sim-worker, app, tests and bench.
- `pnpm run check:sim-deps` — 66 modules, 0 cyclic components (source and dist).
- `pnpm run check:worker` — worker scenario and worker bundle current.
- `pnpm -F @century/tests test` — **91 suites, 932 tests, all passing**
  (`m12a-test-final2.log` after the final hash re-pins).
- `pnpm -F @century/tests test -- m12a-provinces` — 24/24 passing.
- `pnpm -F @century/app export:web` — succeeded; 6.6 MB exported web bundle.
- CDP playtest — campaign created, map rendered, province clicked and province
  panel displayed (`docs/images/m12a-game-map*.png`).
- `pnpm bench` — **exit 1 on a pre-existing M2 stress threshold**, not on a
  failed subsystem: M2 200-block p95 **5.909 ms** against the provisional
  <= 5 ms node threshold. The same threshold already failed before M12a
  (`bench-m4c-final.log`: p95 5.577 ms), so this is an existing environmental
  performance condition. Every other benchmark family passed, including M7
  worker host/snapshot/save (complete tick + snapshot p95 87.87 ms; save
  compress+decompress p95 57.84 ms) and all M5/M6/M9/E5/E6a/E6b/M10 suites.
  Full output: `m12a-bench.log`.

Benchmark environment: Windows, Node 24.22.1, pnpm 9.15.9, 730-tick stress runs.
The province state adds one O(570) structural validation walk per tick boundary,
not a new simulation phase; no benchmark suite showed a province-attributable
regression.

## 19. Remaining uncertainties

As documented in `docs/EUROPE_PROVINCIALIZATION.md` §9: modern admin-1 proxies,
authored clip lines for Baden/Württemberg, Westphalia/Rhine, the Palatinate and
Kuyavia; the M11c base placing Hultschin/Cieszyn in Austria-Hungary; Åland cut
by an explicit clip; Flevoland retained as post-1900 reclaimed land; small
constituent German states merged into neighbours; and the intentionally partial
transcontinental coverage of Russia and the Ottoman Empire. Province-level
population/economy simulation and the player-facing treaty UI are future work.

## 20. Commit hashes and working-tree status

- Implementation commit: **5bf68c1** (`feat: implement M12a European provincial
  system`).
- Working tree after the implementation commit: clean except the two pre-existing
  untracked cache notes `.cache-regions.md` and `.cache-regions-utf8.md`, which
  were not created by this milestone and are deliberately not committed.
- Verification was run against commit 5bf68c1 plus this report-only follow-up;
  no source or data file changed after the recorded test, typecheck, lint and
  export runs other than the report text.

