# M12d — American Provincialization (1 January 1900)

Status: implemented and visually reviewed. This document is generated from the
committed Americas province bundle and audit; the bundle and the code are
authoritative if they disagree. The companion decision record is DECISIONS
D-106.

## 1. Scope and architecture

- The Americas are the direct counterpart of M12a Europe, M12b Asia and M12c
  Africa. The only geographical subdivision beneath a polity is the **Province**;
  there is no Polity → Region → Province hierarchy and no parallel geographical
  region layer.
- The historical simulation `Region` remains a population/economy accounting
  unit. It is preserved as `SimulationRegion` and is never used to draw or
  hit-test territory. See DECISIONS D-103, D-104, D-105 and D-106.
- Province ids start at **300001**, above the M12a European block (maximum
  66001), the M12b Asian block (100001–100239) and the M12c African block
  (200001–200260), and every American key is prefixed with `am-`. A build-time
  and merge-time check rejects any collision with the earlier bundles.
- The four committed bundles stay separate build artifacts:
  - `packages/data/data/map/provinces_1900.json` — M12a Europe;
  - `packages/data/data/map/provinces_asia_1900.json` — M12b Asia;
  - `packages/data/data/map/provinces_africa_1900.json` — M12c Africa;
  - `packages/data/data/map/provinces_americas_1900.json` — M12d Americas.
  A single loader (`packages/data/src/provinces.ts` for the simulation and
  `packages/app/src/provinceMapBundle.ts` for the renderer) combines all four
  with unique ids, merged borders and one future-polity registry.
- Political state is mutable and separate from geography: legal owner, effective
  controller, occupation date, formal claims and special status live in
  `World.provinces`; geometry, id and name never change.
- Country borders are reconstructed from current provincial ownership using the
  same rendering contract as Europe, Asia and Africa: province fills by current
  owner, a quiet solid white hairline on every province outline, and a thin
  near-black country border where the two current owners differ. No dotted or
  dashed province lines are used.
- The Americas build seeds the committed Europe, Asia and Africa bundles as
  higher-priority cross-owner geometry. An American province therefore cannot
  paint a foreign-coloured sliver across an already reviewed frontier.
- The M11c world-map bundle remains the political underlay. The Americas build
  covers the American part of every shared map feature; the rest of each shared
  feature remains the earlier bundle's scope.

## 2. Inventory summary

- Provinces: **469** (ids 300001–300469).
- 1900 owner polities with at least one province: **25**.
- Map features covered: **31** (`ARG`, `BOL`, `BRA`, `BSA`, `BWI`, `CAN`, `CHL`, `COL`, `COS`, `CUB`, `DGC`, `DOM`, `DWI`, `ECU`, `FCA`, `FRA`, `GRL`, `GUA`, `HON`, `HTI`, `MEX`, `NFD`, `NIC`, `PRI`, `PRU`, `PRY`, `SAL`, `SUR`, `URY`, `USA`, `VEN`).
- Polity registry: **47** entries (ids 1300–1346): **17** post-1900 successors and **30** historical/breakaway entries. Newfoundland is the one 1900-active non-selectable entry.
- Unique province ids/keys: **yes** (build audit: 0 duplicate ids, 0 duplicate keys).
- Border pairs: **1369**, of which **178** are display-only cross-feature seam borders; shared border segments: **188180**; segments with more than two neighbours: **0**.
- Province pairs with a measured overlap above 0.005 deg²: **38** (the largest are listed in §5).
- Confidence: low **9**, medium **378**, high **82**.
- Admin-1 units whose label point lies inside an American 1900 feature but that no province claims: **0**.
- Admin-1 units claimed by two provinces (rejected): **0**.
- Combined catalogue: **1538** provinces (570 Europe + 239 Asia + 260 Africa + 469 Americas), **166** polity registry entries and **4444** border pairs.

Coverage includes at minimum:

- **North America**: the 48 contiguous United States plus the District of
  Columbia, Oklahoma Territory and Indian Territory (one province), the Arizona
  and New Mexico territories, Alaska, Hawaii and Puerto Rico; the seven 1900
  Canadian provinces, Yukon, the Northwest Territories (including modern
  Nunavut), the Alberta and Saskatchewan districts, and the separate Dominion of
  Newfoundland and Labrador; the Porfiriato Mexican states and territories,
  including a single 1900 Baja California and the Federal District.
- **Central America**: Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica,
  British Honduras (Belize) and Panama as part of Colombia.
- **South America**: Argentina, Bolivia (including Acre), Brazil (the 1900 states
  without the modern Federal District), Chile (including Tacna under occupation
  and Magallanes), Colombia (including Panama), Ecuador (including the
  Galápagos), Paraguay, Peru, Uruguay and Venezuela.
- **The Guianas**: British Guiana, Dutch Guiana (Suriname) and French Guiana.
- **The Caribbean**: Cuba (US-occupied), Puerto Rico, Haiti, the Dominican
  Republic, Jamaica, Trinidad and Tobago, Barbados, the Bahamas, Bermuda, the
  Turks and Caicos, the Cayman Islands, the British Virgin Islands, Anguilla,
  Antigua and Barbuda, Saint Kitts and Nevis, Montserrat, Dominica, Saint Lucia,
  Saint Vincent and the Grenadines, Grenada, the French Antilles,
  Saint-Pierre-et-Miquelon, the Dutch Antilles exposed by the map, the Danish
  West Indies and Aruba/Curaçao/Sint Maarten.
- **South Atlantic**: the Falkland Islands and South Georgia and the South
  Sandwich Islands, GBR-owned in 1900.
- **Greenland**: the North and South Greenland inspectorates.

## 3. Method and geometry provenance

The build uses modern Natural Earth 1:10m admin-1 units **only as internal
geometry blocks**. Every province is clipped to its authored M11c 1900 polity
polygon. Where a later frontier cut through a modern unit, the province is split
along that frontier and the approximation is labelled low or medium confidence.
Output geometry is simplified at 0.02° and quantized to thousandths of a degree,
matching the M11c world map.

The shared pipeline `scripts/m12/province-build-lib.mjs` applies:

1. union the authored admin-1 blocks and authored clip/exclude shapes;
2. intersect with the 1900 polity polygon;
3. subtract earlier provinces of a different owner, with the committed Europe,
   Asia and Africa bundles seeded first;
4. simplify, then re-trim cross-owner overlaps that simplification expanded;
5. extract shared borders from the unsimplified source rings;
6. audit coverage, overlaps, duplicate ids/keys/claims and unassigned units.

The Americas build additionally passes a **multi-ring coverage scope** for the
shared French feature: French Guiana and the French Antilles are measured
separately so metropolitan France, Corsica, Réunion and Mayotte are not charged
to the Americas. The British South Atlantic feature is scoped to the Falklands,
South Georgia and the South Sandwich Islands; St Helena, Ascension, Diego Garcia
and Pitcairn remain the Africa/Asia/Oceania scope. Coverage clips are audit
boundaries, not political borders.

### 3.1 Mandatory successor-border splits

A permanent province may not span two later successor states when that border is
required. The following 1900 units are deliberately split; each pair shares a
continuous province edge in the bundle and is exercised by the M12d test:

- **Colombia / Panama**: the Panamanian provinces (`am-pan-*`) are separate from
  the Colombian departments from 1900, so the 1903 separation is an ordinary
  transfer. The Panama provinces use the modern Panamanian units and are clipped
  to the 1900 Colombian feature.
- **Canada / Newfoundland**: Newfoundland and Labrador is a separate 1900
  dominion (`am-nfd-newfoundland-and-labrador`), adjacent to Quebec. It joins
  Canada in 1949 by an ordinary union transfer.
- **Danish West Indies / United States Virgin Islands**: Saint Croix, Saint
  Thomas and Saint John are separate provinces, so the 1917 transfer moves three
  permanent units without touching geometry.
- **The British Caribbean**: British Honduras (six districts), Jamaica (three
  counties), Trinidad and Tobago (two islands), Barbados, the Bahamas (New
  Providence, Grand Bahama and the Out Islands), Grenada, Dominica, Saint Lucia,
  Saint Vincent and the Grenadines, Antigua and Barbuda, Saint Kitts and Nevis
  and British Guiana (Essequibo, Demerara and Berbice) are separate permanent
  province groups. Anguilla, Montserrat, Bermuda, the Turks and Caicos, the
  Cayman Islands and the British Virgin Islands remain separate British
  territories.
- **The French and Dutch Caribbean**: Guadeloupe (Basse-Terre, Grande-Terre and
  Marie-Galante), Martinique, French Guiana, Saint-Martin, Saint-Barthélemy,
  Saint-Pierre and Miquelon remain separate French provinces; Aruba, Curaçao and
  Sint Maarten remain separate Dutch provinces. Each later status change is an
  ordinary ownership transfer or special-status change.
- **Alaska, Hawaii and Puerto Rico**: Alaska, Hawaii and Puerto Rico are separate
  permanent provinces owned by the United States in 1900. The Philippines, Guam
  and American Samoa are Asia/Oceania and are not duplicated here.
- **Acre and Tacna**: Acre is a separate Bolivian province until the 1903
  transfer to Brazil; Tacna is a separate Chilean-occupied province until its
  1929 return to Peru. Both are permanent provinces, so the transfers are
  ordinary ownership changes.
- **The Brazilian territories**: Roraima and Rondônia are grouped into Amazonas,
  Amapá into Pará, Tocantins and the modern Federal District into Goiás, and
  Mato Grosso do Sul into Mato Grosso. The modern Federal District is not a
  1900 province.

No split uses a crude rectangular correction box. The internal lines follow
modern first-level units or the 1900 M11c frontier as appropriate. The few
island bounding boxes used to isolate a coastline (Guadeloupe, Martinique,
Sint Maarten, and the French Guiana / Falklands coverage scopes) are clip
boundaries, not drawn political lines.

## 4. Polity registry and the twentieth-century state audit

Every sovereign American state that appears between 1900 and 2000 is registered
as a 1900 catalog polity, a future polity, or both. Cuba is the 1900 catalog
polity `CUB`; Panama, the British Caribbean independences, Belize, Guyana and
Suriname are future polities. Newfoundland is the one non-selectable 1900
registry entry. The registry also carries the historical and breakaway polities
in §4.2; they own nothing at the 1900 start.

| ID | Tag | Historical name | Kind | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|---|
| 1300 | NFD | Dominion of Newfoundland | state | dominion | 1900-01-01 | 1949-03-31 | St. John's | high |
| 1301 | PAN | Republic of Panama | future-state | independent | 1903-11-03 | — | Panama City | high |
| 1302 | JAM | Jamaica | future-state | independent | 1962-08-06 | — | Kingston | high |
| 1303 | TTO | Trinidad and Tobago | future-state | independent | 1962-08-31 | — | Port of Spain | high |
| 1304 | BRB | Barbados | future-state | independent | 1966-11-30 | — | Bridgetown | high |
| 1305 | GUY | Guyana | future-state | independent | 1966-05-26 | — | Georgetown | high |
| 1306 | BHS | Commonwealth of the Bahamas | future-state | independent | 1973-07-10 | — | Nassau | high |
| 1307 | GRD | Grenada | future-state | independent | 1974-02-07 | — | St. George's | high |
| 1308 | SUR | Republic of Suriname | future-state | independent | 1975-11-25 | — | Paramaribo | high |
| 1309 | DMA | Commonwealth of Dominica | future-state | independent | 1978-11-03 | — | Roseau | high |
| 1310 | LCA | Saint Lucia | future-state | independent | 1979-02-22 | — | Castries | high |
| 1311 | VCT | Saint Vincent and the Grenadines | future-state | independent | 1979-10-27 | — | Kingstown | high |
| 1312 | ATG | Antigua and Barbuda | future-state | independent | 1981-11-01 | — | St. John's | high |
| 1313 | BLZ | Belize | future-state | independent | 1981-09-21 | — | Belmopan | high |
| 1314 | KNA | Saint Kitts and Nevis | future-state | independent | 1983-09-19 | — | Basseterre | high |
| 1315 | ANT | Netherlands Antilles | future-state | autonomous-province | 1954-12-15 | — | Willemstad | medium |
| 1316 | ARU | Aruba | future-state | autonomous-province | 1986-01-01 | — | Oranjestad | medium |
| 1317 | TEX | Republic of Texas | historical | independent | 1900-01-01 | 1900-01-01 | Austin | high |
| 1318 | RGR | Riograndense Republic | historical | independent | 1900-01-01 | 1900-01-01 | Piratini | medium |
| 1319 | JUL | Juliana Republic | historical | independent | 1900-01-01 | 1900-01-01 | Laguna | medium |
| 1320 | RRG | Republic of the Rio Grande | historical | independent | 1900-01-01 | 1900-01-01 | Laredo | medium |
| 1321 | YUC | Republic of Yucatán | historical | independent | 1900-01-01 | 1900-01-01 | Mérida | medium |
| 1322 | CAL | California Republic | historical | independent | 1900-01-01 | 1900-01-01 | Sonoma | high |
| 1323 | DES | State of Deseret | historical | independent | 1900-01-01 | 1900-01-01 | Salt Lake City | low |
| 1324 | CSA | Confederate States of America | historical | independent | 1900-01-01 | 1900-01-01 | Richmond | high |
| 1325 | HAW | Republic of Hawaii | historical | independent | 1900-01-01 | 1900-01-01 | Honolulu | high |
| 1326 | ACR | Republic of Acre | historical | independent | 1900-01-01 | 1903-11-17 | Porto Acre | medium |
| 1327 | AIA | Republic of Anguilla | historical | independent | 1967-07-12 | 1969-03-19 | The Valley | medium |
| 1328 | WIF | West Indies Federation | historical | dominion | 1958-01-03 | 1962-05-31 | Port of Spain | high |
| 1329 | CNU | Republic of Counani | historical | independent | 1900-01-01 | 1900-01-01 | Counani | low |
| 1330 | WFL | Republic of West Florida | historical | independent | 1900-01-01 | 1900-01-01 | Pensacola | medium |
| 1331 | FLR | Republic of the Floridas | historical | independent | 1900-01-01 | 1900-01-01 | Fernandina | low |
| 1332 | INS | Republic of Indian Stream | historical | independent | 1900-01-01 | 1900-01-01 | Indian Stream | low |
| 1333 | MDW | Republic of Madawaska | historical | independent | 1900-01-01 | 1900-01-01 | Madawaska | low |
| 1334 | RCN | Republic of Canada | historical | independent | 1900-01-01 | 1900-01-01 | Toronto | low |
| 1335 | RLC | Republic of Lower Canada | historical | independent | 1900-01-01 | 1900-01-01 | Montreal | low |
| 1336 | SON | Republic of Sonora | historical | independent | 1900-01-01 | 1900-01-01 | La Paz | low |
| 1337 | LBC | Republic of Lower California | historical | independent | 1900-01-01 | 1900-01-01 | Ensenada | low |
| 1338 | EQT | Republic of the Equator | historical | independent | 1900-01-01 | 1900-01-01 | Belém | low |
| 1339 | BAH | Republic of Bahia | historical | independent | 1900-01-01 | 1900-01-01 | Salvador | low |
| 1340 | PEM | Republic of Pernambuco | historical | independent | 1900-01-01 | 1900-01-01 | Recife | low |
| 1341 | GCO | Gran Colombia | historical | independent | 1900-01-01 | 1900-01-01 | Bogotá | medium |
| 1342 | UPR | United Provinces of the Río de la Plata | historical | independent | 1900-01-01 | 1900-01-01 | Buenos Aires | medium |
| 1343 | ACF | Argentine Confederation | historical | independent | 1900-01-01 | 1900-01-01 | Paraná | medium |
| 1344 | SBA | State of Buenos Aires | historical | independent | 1900-01-01 | 1900-01-01 | Buenos Aires | medium |
| 1345 | PBC | Peru-Bolivian Confederation | historical | independent | 1900-01-01 | 1900-01-01 | Tacna | medium |
| 1346 | ERY | Republic of Entre Ríos | historical | independent | 1900-01-01 | 1900-01-01 | Concepción del Uruguay | low |

The audit list is: United States, Canada, Mexico, Guatemala, Honduras, El
Salvador, Nicaragua, Costa Rica, Colombia, Venezuela, Ecuador, Peru, Bolivia,
Chile, Argentina, Uruguay, Paraguay, Brazil, Haiti, the Dominican Republic,
Cuba, Newfoundland, Panama, Jamaica, Trinidad and Tobago, Barbados, Guyana, the
Bahamas, Grenada, Suriname, Dominica, Saint Lucia, Saint Vincent and the
Grenadines, Antigua and Barbuda, Belize and Saint Kitts and Nevis. The standalone
audit `scripts/m12d/audit-successors.mjs` prints
**36 states checked, 0 without a registered polity or province group**.

### 4.1 Decisions on the optional twentieth-century episodes

- **West Indies Federation (1958–1962):** registered as historical entry `WIF`
  (1328). It was a federation of Crown colonies; the constituent colonies
  retained British sovereignty and the federation never held provincial
  ownership. It owns nothing in 1900 and is not selectable, but a scenario can
  transfer the island provinces to it to represent the federation episode. The
  1962 dissolution is then an ordinary transfer back to the metropolitan or
  successor polity.
- **Netherlands Antilles (1954) and Aruba (1986):** registered as future
  polities `ANT` (1315) and `ARU` (1316). The Dutch Caribbean provinces are
  Netherlands-owned in 1900; the 1954 constituent-country status and the 1986
  Aruba separation are ordinary transfers. Bonaire, Saba and Sint Eustatius are
  not separately exposed by the M11c map and are not separate provinces.
- **Danish West Indies (1917):** the three island provinces are separate and the
  transfer to the United States is an ordinary cession. No future polity is
  needed because the United States is a 1900 catalog polity.
- **Panama Canal Zone (1903–1979):** not a separate province. The zone was a
  lease, not a transfer of sovereignty, and Natural Earth has no unit for a
  five-mile strip; an authored rectangle would be a crude correction box, which
  this milestone forbids. The 1904–1979 United States control and the 1979
  reversion are representable as controller/special-status changes on the Panama
  province, and the M12d test drives exactly that sequence.
- **Newfoundland:** absent from the 67-polity M11c selectable catalog but a
  self-governing Dominion on 1 January 1900. It is registered as a non-selectable
  1900 polity (`kind: "state"`, `activeFrom: 1900-01-01`) so its provinces are
  permanently distinct and the 1949 union is an ordinary transfer.
- **Falklands/Malvinas and South Georgia:** GBR-owned in 1900. The Argentine claim
  is representable through the claims system and is not seeded as a 1900
  ownership record, consistent with the Europe/Asia/Africa start states.

### 4.2 Historical and breakaway polities

The registry includes **30** historical,
breakaway and predecessor polities. They are `kind: "historical"`,
`selectable1900: false`, and own no province on 1 January 1900. A pre-1900
state cannot use its real activation date inside the 1900–2000 campaign
calendar, so its registry `activeFrom`/`activeTo` is clamped to
1900-01-01 (or to the real end when that falls inside the window); the real
dates are recorded in the notes. A historical entry is registry metadata only:
it changes no province, id or geometry, and the M12d test proves that an
alternate-history or breakaway scenario can transfer a province to Texas,
California, the Riograndense Republic or Yucatán by an ordinary ownership
transfer.

| ID | Tag | Historical name | Status | Confidence | Real existence / note |
|---:|---|---|---|---|---|
| 1317 | TEX | Republic of Texas | independent | high | Real existence 2 March 1836 - 19 February 1845, before the simulated calendar. Registry activation is clamped to 1900-01-01 so an alternate-history or breakaway scenario can transfer Texas provinces to it; it owns nothing in 1900 and is never selectable. |
| 1318 | RGR | Riograndense Republic | independent | medium | The Republic of Piratini (Riograndense Republic) existed 11 September 1836 - 1 March 1845, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1319 | JUL | Juliana Republic | independent | medium | The Juliana Republic (Santa Catarina) existed 24 July - 15 November 1839, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1320 | RRG | Republic of the Rio Grande | independent | medium | The Republic of the Rio Grande existed 17 January - 6 November 1840, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1321 | YUC | Republic of Yucatán | independent | medium | The Republic of Yucatán declared independence in 1841 and rejoined Mexico in 1848, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1322 | CAL | California Republic | independent | high | The California Republic existed 14 June - 9 July 1846, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1323 | DES | State of Deseret | independent | low | The provisional State of Deseret existed 1849-1850, before the simulated calendar; it was never recognized as a sovereign state. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1324 | CSA | Confederate States of America | independent | high | The Confederate States of America existed 8 February 1861 - 5 May 1865, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1325 | HAW | Republic of Hawaii | independent | high | The Republic of Hawaii existed 4 July 1894 - 12 August 1898, before the simulated calendar; it was annexed by the United States in 1898. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1326 | ACR | Republic of Acre | independent | medium | The Acre breakaway was proclaimed on 14 July 1899, before the simulated calendar; the start is clamped to 1900-01-01 and the end is the 17 November 1903 Treaty of Petrópolis transfer to Brazil. Registered so the Acre episode can be represented; it owns nothing in 1900 and is never selectable. |
| 1327 | AIA | Republic of Anguilla | independent | medium | Anguilla unilaterally declared independence on 12 July 1967 and returned to British administration on 19 March 1969. Registered so the breakaway episode is representable; the permanent Anguilla province is GBR-owned in 1900. |
| 1328 | WIF | West Indies Federation | dominion | high | A federation of British Crown colonies, 3 January 1958 - 31 May 1962. It never held sovereign ownership of the islands, but it is registered as a historical entry so a scenario can represent the federation episode as an ownership layer; the constituent islands are permanent provinces. |
| 1329 | CNU | Republic of Counani | independent | low | A semihistorical republic in the contested Brazil/France Guiana borderland, declared in 1886, suppressed in 1891, and revived in 1904. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1330 | WFL | Republic of West Florida | independent | medium | The Republic of West Florida existed 23 September - 10 December 1810, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1331 | FLR | Republic of the Floridas | independent | low | Gregor MacGregor's short-lived Republic of the Floridas was proclaimed in 1817, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1332 | INS | Republic of Indian Stream | independent | low | The Republic of Indian Stream existed 1832-1835 in the disputed New Hampshire/Canada borderland, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1333 | MDW | Republic of Madawaska | independent | low | The semihistorical Republic of Madawaska was declared in 1827 in the disputed Maine/New Brunswick borderland, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1334 | RCN | Republic of Canada | independent | low | The short-lived Republic of Canada was proclaimed during the 1837-1838 Upper Canada rebellion, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1335 | RLC | Republic of Lower Canada | independent | low | The Republic of Lower Canada was proclaimed during the 1837-1838 Lower Canada rebellion, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1336 | SON | Republic of Sonora | independent | low | William Walker's filibuster Republic of Sonora existed 1853-1854, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1337 | LBC | Republic of Lower California | independent | low | William Walker's filibuster Republic of Lower California existed 1853-1854, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1338 | EQT | Republic of the Equator | independent | low | The Republic of the Equator was a short-lived 1837-1839 breakaway in northern Brazil, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1339 | BAH | Republic of Bahia | independent | low | The Sabinada Republic of Bahia existed 1837-1838, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1340 | PEM | Republic of Pernambuco | independent | low | The 1817 and 1824 Pernambuco republics predate the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |
| 1341 | GCO | Gran Colombia | independent | medium | Gran Colombia existed 1819-1831, before the simulated calendar. It is registered as a historical predecessor union so an alternate-history scenario can restore it; it owns nothing in 1900 and is never selectable. |
| 1342 | UPR | United Provinces of the Río de la Plata | independent | medium | The United Provinces of the Río de la Plata existed 1810-1831, before the simulated calendar. It is registered as a historical predecessor union; it owns nothing in 1900 and is never selectable. |
| 1343 | ACF | Argentine Confederation | independent | medium | The Argentine Confederation existed 1831-1861, before the simulated calendar. It is registered as a historical predecessor union; it owns nothing in 1900 and is never selectable. |
| 1344 | SBA | State of Buenos Aires | independent | medium | The State of Buenos Aires existed 1852-1861, before the simulated calendar. It is registered as a historical breakaway; it owns nothing in 1900 and is never selectable. |
| 1345 | PBC | Peru-Bolivian Confederation | independent | medium | The Peru-Bolivian Confederation existed 1836-1839, before the simulated calendar. It is registered as a historical predecessor union; it owns nothing in 1900 and is never selectable. |
| 1346 | ERY | Republic of Entre Ríos | independent | low | The Republic of Entre Ríos existed 1820-1821, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable. |

## 5. Border method, seams and audit

Shared border extraction is exact only between two provinces of the same 1900 map
feature. Frontiers between two features (USA/Canada, USA/Mexico,
Mexico/Guatemala, Colombia/Panama, Brazil/Guyana, Haiti/Dominican Republic, ...)
are clipped by two independently authored polity polygons and can be a few
thousandths of a degree apart. The build adds deterministic, display-only seams
in two passes, exactly as M12c does:

1. **Province-outline pass.** Each vertex of one province is matched to the
   nearest point on the other province's outline (point-to-segment, because
   treaty straight lines have very few vertices); midpoints closer than 0.5° are
   chained and emitted as ordinary border records. The midpoint must be on land,
   inside one of the two 1900 polities, and outside any third province.
2. **Polity-frontier pass.** For feature pairs the first pass cannot connect, the
   midline between the two 1900 polity outlines within 0.4° is attributed to the
   nearest province on each side, with the same land/third-polity filters.

Neither pass changes a province polygon, id or simulation state. **178** seam pairs are committed (0 of them polity-frontier seams). Seam borders are drawn only after an ownership transfer; at the 1900 start state the renderer draws the authored polity outlines, so the reviewed 1900 map is unchanged. The M12d test verifies the seams structurally and through the render plan.

Seam pairs by feature pair:

| Feature pair | Seam pairs |
|---|---:|
| ARG/CHL | 22 |
| CAN/USA | 12 |
| HON/SAL | 12 |
| ECU/PRU | 11 |
| ARG/PRY | 11 |
| COL/VEN | 10 |
| HON/NIC | 9 |
| MEX/USA | 6 |
| GUA/HON | 6 |
| BRA/PRY | 6 |
| DOM/HTI | 6 |
| GUA/SAL | 5 |
| BOL/CHL | 5 |
| COL/ECU | 4 |
| BOL/PRU | 4 |
| ARG/URY | 4 |
| ARG/BRA | 4 |
| BRA/URY | 4 |
| GUA/MEX | 3 |
| BWI/VEN | 3 |
| BOL/BRA | 3 |
| ARG/BOL | 3 |
| BOL/PRY | 3 |
| BRA/BWI | 3 |
| BWI/MEX | 2 |
| COS/NIC | 2 |
| COL/COS | 2 |
| COL/PRU | 2 |
| BRA/VEN | 2 |
| BWI/SUR | 2 |
| CAN/NFD | 1 |
| BWI/GUA | 1 |
| BRA/COL | 1 |
| BRA/PRU | 1 |
| BRA/SUR | 1 |
| BRA/FRA | 1 |
| FRA/SUR | 1 |

Every committed seam pair:

| Province A | Province B | Lines | Kind |
|---|---|---|---|
| `am-usa-alaska` | `am-can-yukon` | 5 | province-outline |
| `am-usa-arizona-territory` | `am-mex-sonora` | 2 | province-outline |
| `am-usa-california` | `am-mex-baja-california` | 1 | province-outline |
| `am-usa-idaho` | `am-can-british-columbia` | 1 | province-outline |
| `am-usa-maine` | `am-can-quebec` | 1 | province-outline |
| `am-usa-maine` | `am-can-new-brunswick` | 1 | province-outline |
| `am-usa-michigan` | `am-can-ontario` | 1 | province-outline |
| `am-usa-minnesota` | `am-can-manitoba` | 1 | province-outline |
| `am-usa-new-hampshire` | `am-can-quebec` | 2 | province-outline |
| `am-usa-new-mexico-territory` | `am-mex-chihuahua` | 1 | province-outline |
| `am-usa-new-york` | `am-can-ontario` | 1 | province-outline |
| `am-usa-new-york` | `am-can-quebec` | 1 | province-outline |
| `am-usa-ohio` | `am-can-ontario` | 1 | province-outline |
| `am-usa-pennsylvania` | `am-can-ontario` | 1 | province-outline |
| `am-usa-texas` | `am-mex-chihuahua` | 2 | province-outline |
| `am-usa-texas` | `am-mex-coahuila` | 1 | province-outline |
| `am-usa-texas` | `am-mex-tamaulipas` | 2 | province-outline |
| `am-usa-washington` | `am-can-british-columbia` | 1 | province-outline |
| `am-can-northwest-territories` | `am-nfd-newfoundland-and-labrador` | 1 | province-outline |
| `am-mex-campeche` | `am-gua-peten` | 1 | province-outline |
| `am-mex-chiapas` | `am-gua-peten` | 2 | province-outline |
| `am-mex-quintana-roo` | `am-bwi-blz-corozal` | 1 | province-outline |
| `am-mex-quintana-roo` | `am-bwi-blz-orange-walk` | 1 | province-outline |
| `am-mex-tabasco` | `am-gua-peten` | 1 | province-outline |
| `am-gua-chiquimula` | `am-hon-copan` | 2 | province-outline |
| `am-gua-chiquimula` | `am-hon-ocotepeque` | 3 | province-outline |
| `am-gua-chiquimula` | `am-sal-chalatenango` | 1 | province-outline |
| `am-gua-chiquimula` | `am-sal-santa-ana` | 2 | province-outline |
| `am-gua-izabal` | `am-hon-copan` | 3 | province-outline |
| `am-gua-izabal` | `am-hon-cortes` | 1 | province-outline |
| `am-gua-izabal` | `am-hon-santa-barbara` | 2 | province-outline |
| `am-gua-izabal` | `am-bwi-blz-toledo` | 1 | province-outline |
| `am-gua-jutiapa` | `am-hon-ocotepeque` | 1 | province-outline |
| `am-gua-jutiapa` | `am-sal-ahuachapan` | 4 | province-outline |
| `am-gua-jutiapa` | `am-sal-chalatenango` | 1 | province-outline |
| `am-gua-jutiapa` | `am-sal-santa-ana` | 2 | province-outline |
| `am-hon-choluteca` | `am-nic-chinandega` | 1 | province-outline |
| `am-hon-choluteca` | `am-nic-madriz` | 1 | province-outline |
| `am-hon-choluteca` | `am-nic-nueva-segovia` | 1 | province-outline |
| `am-hon-el-paraiso` | `am-nic-jinotega` | 2 | province-outline |
| `am-hon-el-paraiso` | `am-nic-madriz` | 1 | province-outline |
| `am-hon-el-paraiso` | `am-nic-nueva-segovia` | 3 | province-outline |
| `am-hon-francisco-morazan` | `am-sal-la-union` | 1 | province-outline |
| `am-hon-gracias-a-dios` | `am-nic-atlantico-norte` | 2 | province-outline |
| `am-hon-intibuca` | `am-sal-cabanas` | 1 | province-outline |
| `am-hon-intibuca` | `am-sal-morazan` | 1 | province-outline |
| `am-hon-intibuca` | `am-sal-san-miguel` | 2 | province-outline |
| `am-hon-lempira` | `am-sal-cabanas` | 3 | province-outline |
| `am-hon-lempira` | `am-sal-chalatenango` | 2 | province-outline |
| `am-hon-lempira` | `am-sal-cuscatlan` | 1 | province-outline |
| `am-hon-la-paz` | `am-sal-morazan` | 3 | province-outline |
| `am-hon-la-paz` | `am-sal-la-union` | 3 | province-outline |
| `am-hon-ocotepeque` | `am-sal-chalatenango` | 2 | province-outline |
| `am-hon-ocotepeque` | `am-sal-santa-ana` | 2 | province-outline |
| `am-hon-olancho` | `am-nic-atlantico-norte` | 1 | province-outline |
| `am-hon-olancho` | `am-nic-jinotega` | 1 | province-outline |
| `am-hon-valle` | `am-sal-la-union` | 1 | province-outline |
| `am-nic-rivas` | `am-cos-guanacaste` | 1 | province-outline |
| `am-nic-rio-san-juan` | `am-cos-alajuela` | 2 | province-outline |
| `am-cos-limon` | `am-pan-chiriqui-and-bocas-del-toro` | 3 | province-outline |
| `am-cos-puntarenas` | `am-pan-chiriqui-and-bocas-del-toro` | 1 | province-outline |
| `am-col-amazonas` | `am-pru-loreto` | 1 | province-outline |
| `am-col-arauca` | `am-ven-apure` | 1 | province-outline |
| `am-col-cesar` | `am-ven-zulia` | 1 | province-outline |
| `am-col-guainia` | `am-ven-amazonas` | 3 | province-outline |
| `am-col-guainia` | `am-bra-amazonas` | 1 | province-outline |
| `am-col-la-guajira` | `am-ven-zulia` | 3 | province-outline |
| `am-col-narino` | `am-ecu-carchi` | 2 | province-outline |
| `am-col-narino` | `am-ecu-esmeraldas` | 2 | province-outline |
| `am-col-narino` | `am-ecu-sucumbios` | 1 | province-outline |
| `am-col-norte-de-santander` | `am-ven-apure` | 1 | province-outline |
| `am-col-norte-de-santander` | `am-ven-tachira` | 2 | province-outline |
| `am-col-norte-de-santander` | `am-ven-zulia` | 1 | province-outline |
| `am-col-putumayo` | `am-ecu-sucumbios` | 1 | province-outline |
| `am-col-putumayo` | `am-pru-loreto` | 2 | province-outline |
| `am-col-vichada` | `am-ven-apure` | 1 | province-outline |
| `am-col-vichada` | `am-ven-bolivar` | 1 | province-outline |
| `am-col-vichada` | `am-ven-amazonas` | 2 | province-outline |
| `am-ven-bolivar` | `am-bra-amazonas` | 1 | province-outline |
| `am-ven-bolivar` | `am-bwi-guy-essequibo` | 2 | province-outline |
| `am-ven-bolivar` | `am-bwi-guy-demerara` | 1 | province-outline |
| `am-ven-delta-amacuro` | `am-bwi-guy-essequibo` | 1 | province-outline |
| `am-ven-amazonas` | `am-bra-amazonas` | 3 | province-outline |
| `am-ecu-orellana` | `am-pru-loreto` | 1 | province-outline |
| `am-ecu-loja` | `am-pru-piura` | 2 | province-outline |
| `am-ecu-loja` | `am-pru-tumbes` | 2 | province-outline |
| `am-ecu-el-oro` | `am-pru-tumbes` | 2 | province-outline |
| `am-ecu-morona-santiago` | `am-pru-amazonas` | 1 | province-outline |
| `am-ecu-morona-santiago` | `am-pru-loreto` | 1 | province-outline |
| `am-ecu-sucumbios` | `am-pru-loreto` | 2 | province-outline |
| `am-ecu-pastaza` | `am-pru-loreto` | 1 | province-outline |
| `am-ecu-zamora-chinchipe` | `am-pru-amazonas` | 1 | province-outline |
| `am-ecu-zamora-chinchipe` | `am-pru-cajamarca` | 2 | province-outline |
| `am-ecu-zamora-chinchipe` | `am-pru-piura` | 1 | province-outline |
| `am-pru-loreto` | `am-bol-acre` | 1 | province-outline |
| `am-pru-loreto` | `am-bra-amazonas` | 3 | province-outline |
| `am-pru-madre-de-dios` | `am-bol-la-paz` | 1 | province-outline |
| `am-pru-puno` | `am-bol-la-paz` | 2 | province-outline |
| `am-pru-ucayali` | `am-bol-acre` | 3 | province-outline |
| `am-bol-el-beni` | `am-bra-amazonas` | 1 | province-outline |
| `am-bol-la-paz` | `am-chl-arica-y-parinacota` | 1 | province-outline |
| `am-bol-pando` | `am-bra-amazonas` | 1 | province-outline |
| `am-bol-oruro` | `am-chl-arica-y-parinacota` | 2 | province-outline |
| `am-bol-oruro` | `am-chl-tarapaca` | 1 | province-outline |
| `am-bol-potosi` | `am-chl-antofagasta` | 1 | province-outline |
| `am-bol-potosi` | `am-chl-tarapaca` | 2 | province-outline |
| `am-bol-potosi` | `am-arg-salta` | 1 | province-outline |
| `am-bol-potosi` | `am-arg-jujuy` | 1 | province-outline |
| `am-bol-santa-cruz` | `am-pry-alto-paraguay` | 2 | province-outline |
| `am-bol-santa-cruz` | `am-pry-boqueron` | 1 | province-outline |
| `am-bol-santa-cruz` | `am-bra-amazonas` | 1 | province-outline |
| `am-bol-tarija` | `am-arg-salta` | 1 | province-outline |
| `am-bol-tarija` | `am-pry-boqueron` | 1 | province-outline |
| `am-chl-aisen-del-general-carlos-ibanez-del-campo` | `am-arg-chubut` | 1 | province-outline |
| `am-chl-aisen-del-general-carlos-ibanez-del-campo` | `am-arg-santa-cruz` | 1 | province-outline |
| `am-chl-antofagasta` | `am-arg-salta` | 1 | province-outline |
| `am-chl-antofagasta` | `am-arg-catamarca` | 1 | province-outline |
| `am-chl-antofagasta` | `am-arg-jujuy` | 1 | province-outline |
| `am-chl-atacama` | `am-arg-la-rioja` | 1 | province-outline |
| `am-chl-atacama` | `am-arg-san-juan` | 1 | province-outline |
| `am-chl-atacama` | `am-arg-catamarca` | 1 | province-outline |
| `am-chl-bio-bio` | `am-arg-neuquen` | 1 | province-outline |
| `am-chl-coquimbo` | `am-arg-san-juan` | 2 | province-outline |
| `am-chl-libertador-general-bernardo-o-higgins` | `am-arg-mendoza` | 1 | province-outline |
| `am-chl-los-lagos` | `am-arg-neuquen` | 1 | province-outline |
| `am-chl-los-lagos` | `am-arg-rio-negro` | 2 | province-outline |
| `am-chl-los-lagos` | `am-arg-chubut` | 2 | province-outline |
| `am-chl-los-rios` | `am-arg-neuquen` | 2 | province-outline |
| `am-chl-magallanes` | `am-arg-tierra-del-fuego` | 5 | province-outline |
| `am-chl-magallanes` | `am-arg-santa-cruz` | 6 | province-outline |
| `am-chl-maule` | `am-arg-mendoza` | 1 | province-outline |
| `am-chl-maule` | `am-arg-neuquen` | 1 | province-outline |
| `am-chl-nuble` | `am-arg-neuquen` | 1 | province-outline |
| `am-chl-region-metropolitana-de-santiago` | `am-arg-mendoza` | 1 | province-outline |
| `am-chl-valparaiso` | `am-arg-mendoza` | 1 | province-outline |
| `am-arg-salta` | `am-pry-boqueron` | 1 | province-outline |
| `am-arg-entre-rios` | `am-ury-artigas` | 1 | province-outline |
| `am-arg-entre-rios` | `am-ury-paysandu` | 1 | province-outline |
| `am-arg-entre-rios` | `am-ury-salto` | 2 | province-outline |
| `am-arg-chaco` | `am-pry-neembucu` | 1 | province-outline |
| `am-arg-misiones` | `am-pry-alto-parana` | 2 | province-outline |
| `am-arg-misiones` | `am-pry-itapua` | 1 | province-outline |
| `am-arg-misiones` | `am-bra-parana` | 1 | province-outline |
| `am-arg-misiones` | `am-bra-santa-catarina` | 1 | province-outline |
| `am-arg-misiones` | `am-bra-rio-grande-do-sul` | 1 | province-outline |
| `am-arg-formosa` | `am-pry-central` | 1 | province-outline |
| `am-arg-formosa` | `am-pry-neembucu` | 1 | province-outline |
| `am-arg-formosa` | `am-pry-boqueron` | 1 | province-outline |
| `am-arg-formosa` | `am-pry-asuncion` | 1 | province-outline |
| `am-arg-corrientes` | `am-ury-artigas` | 2 | province-outline |
| `am-arg-corrientes` | `am-pry-neembucu` | 1 | province-outline |
| `am-arg-corrientes` | `am-pry-itapua` | 1 | province-outline |
| `am-arg-corrientes` | `am-pry-misiones` | 1 | province-outline |
| `am-arg-corrientes` | `am-bra-rio-grande-do-sul` | 1 | province-outline |
| `am-ury-artigas` | `am-bra-rio-grande-do-sul` | 2 | province-outline |
| `am-ury-cerro-largo` | `am-bra-rio-grande-do-sul` | 2 | province-outline |
| `am-ury-rocha` | `am-bra-rio-grande-do-sul` | 1 | province-outline |
| `am-ury-rivera` | `am-bra-rio-grande-do-sul` | 2 | province-outline |
| `am-pry-concepcion` | `am-bra-mato-grosso` | 3 | province-outline |
| `am-pry-alto-parana` | `am-bra-parana` | 2 | province-outline |
| `am-pry-amambay` | `am-bra-mato-grosso` | 2 | province-outline |
| `am-pry-canindeyu` | `am-bra-mato-grosso` | 1 | province-outline |
| `am-pry-canindeyu` | `am-bra-parana` | 1 | province-outline |
| `am-pry-alto-paraguay` | `am-bra-mato-grosso` | 1 | province-outline |
| `am-bra-amazonas` | `am-bwi-guy-essequibo` | 2 | province-outline |
| `am-bra-amazonas` | `am-bwi-guy-demerara` | 3 | province-outline |
| `am-bra-para` | `am-bwi-guy-demerara` | 1 | province-outline |
| `am-bra-para` | `am-sur-suriname-interior` | 1 | province-outline |
| `am-bra-para` | `am-fra-french-guiana` | 1 | province-outline |
| `am-bwi-guy-demerara` | `am-sur-nickerie` | 1 | province-outline |
| `am-bwi-guy-demerara` | `am-sur-suriname-interior` | 4 | province-outline |
| `am-sur-suriname-interior` | `am-fra-french-guiana` | 1 | province-outline |
| `am-hti-centre` | `am-dom-santiago` | 1 | province-outline |
| `am-hti-centre` | `am-dom-azua` | 2 | province-outline |
| `am-hti-nord-est` | `am-dom-santiago` | 1 | province-outline |
| `am-hti-nord-est` | `am-dom-azua` | 1 | province-outline |
| `am-hti-ouest` | `am-dom-azua` | 2 | province-outline |
| `am-hti-sud-est` | `am-dom-azua` | 1 | province-outline |

### 5.1 Twentieth-century land-border audit

The M12d test contains the full list of **38** modern American sovereign land
borders and asserts that every one is backed by at least one shared or seam
province edge between the two successor groups. `scripts/m12d/audit-successors.mjs`
prints the same result: **38 borders checked, 0 without a province edge**.

The only American land border deliberately outside the sovereign audit is the
Saint-Martin / Sint Maarten line between the French and Dutch halves of the
island. Both halves are separate permanent provinces and the status is
representable, but the M11c land mask does not resolve the small island, so no
derived seam is drawn there. It is a non-sovereign border, not a sovereign-state
frontier.

### 5.2 Coverage

Coverage is measured over the American part of each feature. The build's
sequential difference cannot complete for the largest features (USA, Canada,
Mexico, Colombia, Peru, Chile, Argentina, Bolivia, Costa Rica, Greenland), so those rows are
marked `estimated`; the audit still records every measurable residual. The
largest non-estimated residuals are:

- **BRA**: 1.605 deg² residual out of 693.96 deg² (0.23%).
- **VEN**: 0.540 deg² residual out of 74.60 deg² (0.72%).
- **BWI**: 0.427 deg² residual out of 21.88 deg² (1.95%).
- **CUB**: 0.271 deg² residual out of 9.50 deg² (2.86%).
- **ECU**: 0.269 deg² residual out of 20.70 deg² (1.30%).
- **BSA**: 0.236 deg² residual out of 1.99 deg² (11.86%).
- **PRY**: 0.220 deg² residual out of 35.33 deg² (0.62%).
- **HON**: 0.197 deg² residual out of 9.49 deg² (2.07%).
- **URY**: 0.155 deg² residual out of 17.12 deg² (0.91%).
- **NIC**: 0.151 deg² residual out of 10.72 deg² (1.41%).
- **HTI**: 0.102 deg² residual out of 2.28 deg² (4.49%).
- **SUR**: 0.096 deg² residual out of 11.81 deg² (0.81%).
- **DOM**: 0.095 deg² residual out of 4.14 deg² (2.29%).
- **GUA**: 0.093 deg² residual out of 9.12 deg² (1.02%).
- **NFD**: 0.092 deg² residual out of 52.63 deg² (0.17%).

The residual is the sum of small coastal, river and frontier slivers. It stays
under the correct 1900 owner's polity fill, so it cannot appear as a
foreign-coloured enclave. The audit records every unassigned unit and every
cross-frontier code assignment.

The largest `estimated` rows are **CAN** at 16.80 deg² of 1633.29 deg² and **GRL** at 12.16 deg² of 663.71 deg². These are measurement fallbacks for very large features where the
sequential difference could not complete; they too stay under the correct
owner's underlay and are not promoted to duplicate provinces.

### 5.3 Measured overlaps

Same-owner overlaps between adjacent modern units are not trimmed (they cannot
produce a foreign-coloured enclave); the largest are listed below. The build
trims cross-owner overlaps in plan order.

| Province A | Province B | Area (deg²) |
|---|---|---:|
| `am-arg-rio-negro` | `am-arg-chubut` | 0.0347 |
| `am-can-ontario` | `am-can-manitoba` | 0.0258 |
| `am-usa-virginia` | `am-usa-west-virginia` | 0.0153 |
| `am-usa-oregon` | `am-usa-washington` | 0.0124 |
| `am-bra-bahia` | `am-bra-minas-gerais` | 0.0116 |
| `am-bra-sao-paulo` | `am-bra-minas-gerais` | 0.0106 |
| `am-arg-salta` | `am-arg-jujuy` | 0.0101 |
| `am-bra-maranhao` | `am-bra-piaui` | 0.0098 |
| `am-bol-chuquisaca` | `am-bol-potosi` | 0.0095 |
| `am-arg-entre-rios` | `am-arg-santa-fe` | 0.0086 |
| `am-pru-cusco` | `am-pru-madre-de-dios` | 0.0083 |
| `am-can-ontario` | `am-can-quebec` | 0.0082 |

## 6. Historical snapshots supported

`packages/tests/src/map/provinces-americas.test.ts` exercises these references;
they are validation paths, not forced outcomes.

| Reference | Result |
|---|---|
| 1 January 1900 | Every American province has one ownership record; owner = controller; no claims; Cuba, Puerto Rico and the Philippines-adjacent territories are United States-owned; Newfoundland is the separate 1900 dominion; no future polity except NFD owns anything |
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

Dynamic behaviour covered by the same suite: transfers preserve ids and geometry
references; occupation changes only the controller; claims survive transfers and
never imply ownership (the Argentine claim to the Falklands); special statuses
are explicit; save/load round-trips the whole provincial state; M12a-era (570
records), M12b-era (809 records) and M12c-era (1069 records) saves still load;
identical sequences produce identical world hashes and a different order
produces a different history.

## 7. Border rendering

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

### 7.1 Visual review

The exported web app was driven through a real 1900 campaign as the United
States and screenshotted at global, continental, regional and maximum zoom. The
reviewed images are committed under `docs/images/`:

| Image | Region |
|---|---|
| `m12d-americas-global.png` | Global 1900 map |
| `m12d-americas-north-america.png` | Canada and the northern United States |
| `m12d-americas-united-states.png` | Eastern United States and the Great Lakes |
| `m12d-americas-alaska.png` | Alaska and the Canadian north-west |
| `m12d-americas-greenland.png` | Greenland and the North Atlantic |
| `m12d-americas-mexico-central-america.png` | Mexico and Central America |
| `m12d-americas-panama-isthmus.png` | Panama and the isthmus |
| `m12d-americas-caribbean-cuba.png` | Cuba and the Greater Antilles |
| `m12d-americas-caribbean-greater-antilles.png` | Hispaniola and Puerto Rico |
| `m12d-americas-caribbean-lesser-antilles.png` | Trinidad and the Lesser Antilles |
| `m12d-americas-caribbean-guadeloupe.png` | Guadeloupe and the northern chain |
| `m12d-americas-caribbean-barbados.png` | Barbados and the Windwards |
| `m12d-americas-guianas.png` | British Guiana, Suriname and French Guiana |
| `m12d-americas-andes.png` | Colombia, Ecuador, Peru and Bolivia |
| `m12d-americas-brazil-amazon.png` | Brazil and the Amazon |
| `m12d-americas-southern-cone.png` | Argentina, Uruguay and Paraguay |
| `m12d-americas-patagonia.png` | Chile, Patagonia and Tierra del Fuego |
| `m12d-americas-falklands.png` | The Falkland Islands |
| `m12d-americas-pacific-coast.png` | The Pacific coast and the Andes |
| `m12d-americas-province.png` | Province panel: Panama, id 300179 |

Observed results:

- province hairlines are continuous and solid; no dotted or dashed province
  lines were observed at any zoom;
- country borders remain thin near-black lines, not thick bands; the
  USA/Canada, USA/Mexico, Colombia/Panama, Haiti/Dominican Republic,
  Chile/Argentina, Argentina/Brazil and Guyana/Suriname frontiers read
  correctly at regional and maximum zoom;
- no foreign-coloured enclave or missing-land patch was found in the reviewed
  regions; the province fills are continuous with the 1900 polity underlay;
- the Panama isthmus at maximum zoom shows the six permanent Panama provinces
  (all COL-owned in 1900), the Canal Zone being represented by controller/special
  status rather than a separate polygon;
- the province panel opens for Panama, id 300179, current owner COL, 1900 owner
  COL, “Colombian department”, ordinary status.

Two pre-existing rendering observations, neither a data defect:

- the 16-colour hash palette gives identical or near-identical colours to some
  pairs. Haiti and the Dominican Republic both render brown on Hispaniola, and
  Chile and Argentina both render pink in the Southern Cone. The country border
  still separates them, and no enclave is ambiguous. Changing the palette would
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

Seam and derived country borders are drawn only after an ownership transfer. The
1900 screenshots therefore show the static polity outlines. There is no in-app
transfer UI in this milestone, so the post-transfer derived border was verified
structurally by the M12d render-plan tests (a same-feature pair and a
cross-feature seam pair become national after an owner change) rather than driven
visually through the exported campaign. This mirrors the M12c verification.

## 8. Save and state compatibility

- `World` schema remains **27**; the save envelope and worker snapshot protocol
  are unchanged. M12d is additive content, not a new state shape.
- The combined catalogue is 1538 static definitions; the world creates 1538
  ownership records on a new campaign.
- An M12a-era save (570 European records), an M12b-era save (809 European and
  Asian records) or an M12c-era save (1069 European, Asian and African records)
  still loads under the strict same-version policy, but its American provinces
  have no mutable record until a new campaign is created; the map falls back to
  the authored 1900 owner for rendering. This is documented as a known
  limitation rather than silently migrated.
- No population, building, market, region or treasury values were changed.
  Province-level population/economy simulation remains future work.

## 9. Assumptions, deviations and known limitations

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
- Acre and Tacna are separate provinces as described in §3.1. The Acre geometry
  comes from the modern Brazilian unit clipped to the 1900 Bolivian feature; the
  Tacna geometry comes from the modern Peruvian unit clipped to the 1900 Chilean
  feature.
- The Brazilian Federal District is part of the Goiás province; the 1960 capital
  transfer is not represented as a province split. This follows the milestone's
  explicit "states and NOT the federal district" instruction.
- The M11c land mask does not resolve Sint Maarten, so the Saint-Martin/Sint
  Maarten seam is absent; both halves remain separate provinces.
- Bonaire, Saba and Sint Eustatius are not exposed by the M11c map and are not
  separate provinces; they are recorded in the Dutch Caribbean note.
- Carriacou and Petite Martinique are grouped with Grenada because the M11c BWI
  polygon does not expose the dependency as a separate ring. San Andrés and
  Providencia are attached to the Bolívar province for the same reason.
- The Falklands/Malvinas and South Georgia are GBR-owned; the Argentine claim is
  representable but not seeded. The 1982 war is not modelled.
- The Panama Canal Zone is a control/special-status sequence, not a province
  (see §4.1).
- The West Indies Federation is not an ownership layer (see §4.1).
- Newfoundland is registered as a non-selectable 1900 polity because the M11c
  selectable catalog does not include it. Its 1900 status is a Dominion, not an
  independent state in the Correlates-of-War sense.
- Province geometry adds about 1.1 MiB and 469 paths to the map. The map remains
  one offline SVG render.
- The app's 16-colour hash palette is pre-existing. Some polities receive
  near-identical colours (for example the United States and some Caribbean
  territories); country borders still separate them. Changing the palette would
  alter the already reviewed Europe/Asia/Africa rendering, so it is left
  unchanged.

## 10. Sources

| ID | Title | License | Date | URL |
|---|---|---|---|---|
| `natural-earth-10m-admin1` | Natural Earth 1:10m admin-1 states and provinces | Public domain | 2024 | https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/ |
| `natural-earth-50m-admin0` | Natural Earth 1:50m admin-0 countries | Public domain | 2024 | https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/ |
| `eb1911-americas` | Encyclopaedia Britannica (1911), American states and colonies | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica |
| `treaty-paris-1898` | Treaty of Paris (1898) | Public domain | 1898 | https://en.wikisource.org/wiki/Treaty_of_Paris_(1898) |
| `treaty-hay-herran-1903` | Hay-Herrán Treaty (1903) and the separation of Panama | Public domain | 1903 | https://en.wikisource.org/wiki/Hay%E2%80%93Herr%C3%A1n_Treaty |
| `treaty-danish-west-indies-1916` | Treaty of the Danish West Indies (1916) | Public domain | 1916 | https://en.wikisource.org/wiki/Treaty_of_the_Danish_West_Indies |
| `british-north-america-act-1949` | British North America Act, 1949 (Newfoundland) | Public domain | 1949 | https://en.wikisource.org/wiki/British_North_America_Act,_1949 |
| `westminster-1931` | Statute of Westminster (1931) | Public domain | 1931 | https://en.wikisource.org/wiki/Statute_of_Westminster,_1931 |
| `project-authored-1900` | Fabric of Nations M11c authored 1900 boundary reconstruction | Project data | 2026 | internal:packages/data/data/map/world_map_1900.json |
| `project-authored-m12` | Fabric of Nations M12a/M12b/M12c/M12d authored provincial partition | Project data | 2026 | internal:scripts/m12d/americas-plan.mjs |

## 11. Coverage audit table

| Map feature | Scope (deg²) | Covered (deg²) | Residual (deg²) |
|---|---:|---:|---:|
| CAN | 1633.29 | 1616.49 | 16.80 (estimated) |
| GRL | 663.71 | 651.55 | 12.16 (estimated) |
| USA | 1114.93 | 1110.28 | 4.65 (estimated) |
| CHL | 78.18 | 74.63 | 3.55 (estimated) |
| BRA | 693.96 | 692.35 | 1.60 |
| ARG | 278.47 | 277.44 | 1.03 (estimated) |
| MEX | 174.19 | 173.34 | 0.85 (estimated) |
| COL | 98.56 | 97.98 | 0.58 (estimated) |
| VEN | 74.60 | 74.06 | 0.54 |
| BWI | 21.88 | 21.45 | 0.43 |
| PRU | 105.13 | 104.72 | 0.41 (estimated) |
| CUB | 9.50 | 9.23 | 0.27 |
| ECU | 20.70 | 20.43 | 0.27 |
| BSA | 1.99 | 1.76 | 0.24 |
| BOL | 104.82 | 104.59 | 0.23 (estimated) |
| PRY | 35.33 | 35.11 | 0.22 |
| HON | 9.49 | 9.29 | 0.20 |
| URY | 17.12 | 16.96 | 0.16 |
| NIC | 10.72 | 10.57 | 0.15 |
| HTI | 2.28 | 2.18 | 0.10 |
| SUR | 11.81 | 11.71 | 0.10 |
| DOM | 4.14 | 4.05 | 0.09 |
| GUA | 9.12 | 9.03 | 0.09 |
| NFD | 52.63 | 52.54 | 0.09 |
| COS | 4.22 | 4.13 | 0.09 (estimated) |
| FRA | 6.98 | 6.90 | 0.08 |
| SAL | 1.68 | 1.64 | 0.04 |
| PRI | 0.76 | 0.73 | 0.03 |
| DWI | 0.02 | 0.02 | 0.01 |
| FCA | 0.03 | 0.02 | 0.00 |
| DGC | 0.05 | 0.05 | 0.00 |

## 12. Full province inventory

The inventory is grouped by 1900 owner. Every province is a permanent
geographical unit; the owner, controller, claims and special status are mutable
simulation state.

### Argentine Republic (ARG) — 24 provinces

independent; 1900 population estimate 4700000; geometry ARG.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300316 | `am-arg-salta` | Salta | Argentine province or national territory | Argentine Republic | medium |
| 300317 | `am-arg-buenos-aires` | Buenos Aires | Argentine province or national territory | Argentine Republic | medium |
| 300318 | `am-arg-ciudad-de-buenos-aires` | Buenos Aires (Federal Capital) | Argentine federal district | Argentine Republic | medium |
| 300319 | `am-arg-san-luis` | San Luis | Argentine province or national territory | Argentine Republic | medium |
| 300320 | `am-arg-entre-rios` | Entre Ríos | Argentine province or national territory | Argentine Republic | medium |
| 300321 | `am-arg-la-rioja` | La Rioja | Argentine province or national territory | Argentine Republic | medium |
| 300322 | `am-arg-santiago-del-estero` | Santiago del Estero | Argentine province or national territory | Argentine Republic | medium |
| 300323 | `am-arg-chaco` | Chaco | Argentine province or national territory | Argentine Republic | medium |
| 300324 | `am-arg-san-juan` | San Juan | Argentine province or national territory | Argentine Republic | medium |
| 300325 | `am-arg-catamarca` | Catamarca | Argentine province or national territory | Argentine Republic | medium |
| 300326 | `am-arg-la-pampa` | La Pampa | Argentine province or national territory | Argentine Republic | medium |
| 300327 | `am-arg-mendoza` | Mendoza | Argentine province or national territory | Argentine Republic | medium |
| 300328 | `am-arg-misiones` | Misiones | Argentine province or national territory | Argentine Republic | medium |
| 300329 | `am-arg-formosa` | Formosa | Argentine province or national territory | Argentine Republic | medium |
| 300330 | `am-arg-neuquen` | Neuquén | Argentine province or national territory | Argentine Republic | medium |
| 300331 | `am-arg-rio-negro` | Río Negro | Argentine province or national territory | Argentine Republic | medium |
| 300332 | `am-arg-santa-fe` | Santa Fe | Argentine province or national territory | Argentine Republic | medium |
| 300333 | `am-arg-tucuman` | Tucumán | Argentine province or national territory | Argentine Republic | medium |
| 300334 | `am-arg-chubut` | Chubut | Argentine province or national territory | Argentine Republic | medium |
| 300335 | `am-arg-tierra-del-fuego` | Tierra del Fuego | Argentine national territory | Argentine Republic | medium |
| 300336 | `am-arg-corrientes` | Corrientes | Argentine province or national territory | Argentine Republic | medium |
| 300337 | `am-arg-cordoba` | Córdoba | Argentine province or national territory | Argentine Republic | medium |
| 300338 | `am-arg-jujuy` | Jujuy | Argentine province or national territory | Argentine Republic | medium |
| 300339 | `am-arg-santa-cruz` | Santa Cruz | Argentine province or national territory | Argentine Republic | medium |

### Republic of Bolivia (BOL) — 10 provinces

independent; 1900 population estimate 1800000; geometry BOL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300289 | `am-bol-el-beni` | El Beni | Bolivian department | Republic of Bolivia | medium |
| 300290 | `am-bol-cochabamba` | Cochabamba | Bolivian department | Republic of Bolivia | medium |
| 300291 | `am-bol-chuquisaca` | Chuquisaca | Bolivian department | Republic of Bolivia | medium |
| 300292 | `am-bol-la-paz` | La Paz | Bolivian department | Republic of Bolivia | medium |
| 300293 | `am-bol-pando` | Pando | Bolivian department | Republic of Bolivia | medium |
| 300294 | `am-bol-oruro` | Oruro | Bolivian department | Republic of Bolivia | medium |
| 300295 | `am-bol-potosi` | Potosí | Bolivian department | Republic of Bolivia | medium |
| 300296 | `am-bol-santa-cruz` | Santa Cruz | Bolivian department | Republic of Bolivia | medium |
| 300297 | `am-bol-tarija` | Tarija | Bolivian department | Republic of Bolivia | medium |
| 300298 | `am-bol-acre` | Acre | Bolivian territory | Republic of Bolivia | medium |

### Republic of the United States of Brazil (BRA) — 20 provinces

independent; 1900 population estimate 17600000; geometry BRA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300377 | `am-bra-amazonas` | Amazonas | Brazilian state | United States of Brazil | medium |
| 300378 | `am-bra-para` | Pará | Brazilian state | United States of Brazil | medium |
| 300379 | `am-bra-maranhao` | Maranhão | Brazilian state | United States of Brazil | medium |
| 300380 | `am-bra-piaui` | Piauí | Brazilian state | United States of Brazil | medium |
| 300381 | `am-bra-ceara` | Ceará | Brazilian state | United States of Brazil | medium |
| 300382 | `am-bra-rio-grande-do-norte` | Rio Grande do Norte | Brazilian state | United States of Brazil | medium |
| 300383 | `am-bra-paraiba` | Paraíba | Brazilian state | United States of Brazil | medium |
| 300384 | `am-bra-pernambuco` | Pernambuco | Brazilian state | United States of Brazil | medium |
| 300385 | `am-bra-alagoas` | Alagoas | Brazilian state | United States of Brazil | medium |
| 300386 | `am-bra-sergipe` | Sergipe | Brazilian state | United States of Brazil | medium |
| 300387 | `am-bra-bahia` | Bahia | Brazilian state | United States of Brazil | medium |
| 300388 | `am-bra-espirito-santo` | Espírito Santo | Brazilian state | United States of Brazil | medium |
| 300389 | `am-bra-rio-de-janeiro` | Rio de Janeiro | Brazilian state | United States of Brazil | medium |
| 300390 | `am-bra-sao-paulo` | São Paulo | Brazilian state | United States of Brazil | medium |
| 300391 | `am-bra-minas-gerais` | Minas Gerais | Brazilian state | United States of Brazil | medium |
| 300392 | `am-bra-goias` | Goiás | Brazilian state | United States of Brazil | medium |
| 300393 | `am-bra-mato-grosso` | Mato Grosso | Brazilian state | United States of Brazil | medium |
| 300394 | `am-bra-parana` | Paraná | Brazilian state | United States of Brazil | medium |
| 300395 | `am-bra-santa-catarina` | Santa Catarina | Brazilian state | United States of Brazil | medium |
| 300396 | `am-bra-rio-grande-do-sul` | Rio Grande do Sul | Brazilian state | United States of Brazil | medium |

### Dominion of Canada (CAN) — 11 provinces

dominion; 1900 population estimate 5180000; geometry CAN.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300052 | `am-can-ontario` | Ontario | Canadian province or territory | Dominion of Canada | high |
| 300053 | `am-can-quebec` | Quebec | Canadian province or territory | Dominion of Canada | high |
| 300054 | `am-can-nova-scotia` | Nova Scotia | Canadian province or territory | Dominion of Canada | high |
| 300055 | `am-can-new-brunswick` | New Brunswick | Canadian province or territory | Dominion of Canada | high |
| 300056 | `am-can-manitoba` | Manitoba | Canadian province or territory | Dominion of Canada | high |
| 300057 | `am-can-british-columbia` | British Columbia | Canadian province or territory | Dominion of Canada | high |
| 300058 | `am-can-prince-edward-island` | Prince Edward Island | Canadian province or territory | Dominion of Canada | high |
| 300059 | `am-can-yukon` | Yukon | Canadian province or territory | Dominion of Canada | high |
| 300060 | `am-can-northwest-territories` | Northwest Territories | Canadian province or territory | Dominion of Canada | medium |
| 300061 | `am-can-alberta-district` | Alberta District | Canadian province or territory | Dominion of Canada | medium |
| 300062 | `am-can-saskatchewan-district` | Saskatchewan District | Canadian province or territory | Dominion of Canada | medium |

### Republic of Chile (CHL) — 17 provinces

independent; 1900 population estimate 3000000; geometry CHL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300299 | `am-chl-aisen-del-general-carlos-ibanez-del-campo` | Aisén del General Carlos Ibáñez del Campo | Chilean province | Republic of Chile | medium |
| 300300 | `am-chl-antofagasta` | Antofagasta | Chilean province | Republic of Chile | medium |
| 300301 | `am-chl-arica-y-parinacota` | Arica y Parinacota | Chilean province | Republic of Chile | medium |
| 300302 | `am-chl-la-araucania` | La Araucanía | Chilean province | Republic of Chile | medium |
| 300303 | `am-chl-atacama` | Atacama | Chilean province | Republic of Chile | medium |
| 300304 | `am-chl-bio-bio` | Bío-Bío | Chilean province | Republic of Chile | medium |
| 300305 | `am-chl-coquimbo` | Coquimbo | Chilean province | Republic of Chile | medium |
| 300306 | `am-chl-libertador-general-bernardo-o-higgins` | Libertador General Bernardo O'Higgins | Chilean province | Republic of Chile | medium |
| 300307 | `am-chl-los-lagos` | Los Lagos | Chilean province | Republic of Chile | medium |
| 300308 | `am-chl-los-rios` | Los Ríos | Chilean province | Republic of Chile | medium |
| 300309 | `am-chl-magallanes` | Magallanes | Chilean province | Republic of Chile | medium |
| 300310 | `am-chl-maule` | Maule | Chilean province | Republic of Chile | medium |
| 300311 | `am-chl-nuble` | Ñuble | Chilean province | Republic of Chile | medium |
| 300312 | `am-chl-region-metropolitana-de-santiago` | Región Metropolitana de Santiago | Chilean province | Republic of Chile | medium |
| 300313 | `am-chl-tarapaca` | Tarapacá | Chilean province | Republic of Chile | medium |
| 300314 | `am-chl-valparaiso` | Valparaíso | Chilean province | Republic of Chile | medium |
| 300315 | `am-chl-tacna` | Tacna | Chilean-occupied Peruvian province | Republic of Chile | medium |

### Republic of Colombia (COL) — 37 provinces

independent; 1900 population estimate 4000000; geometry COL, PAN.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300179 | `am-pan-panama` | Panama | Colombian department | Panama | medium |
| 300180 | `am-pan-colon` | Colón | Colombian department | Panama | medium |
| 300181 | `am-pan-chiriqui-and-bocas-del-toro` | Chiriquí and Bocas del Toro | Colombian department | Panama | medium |
| 300182 | `am-pan-veraguas-and-azero` | Veraguas, Herrera and Los Santos | Colombian department | Panama | medium |
| 300183 | `am-pan-cocle` | Coclé | Colombian department | Panama | medium |
| 300184 | `am-pan-darien-and-the-comarcas` | Darién and the Comarcas | Colombian department | Panama | medium |
| 300185 | `am-col-amazonas` | Amazonas | Colombian department | Republic of Colombia | medium |
| 300186 | `am-col-antioquia` | Antioquia | Colombian department | Republic of Colombia | medium |
| 300187 | `am-col-arauca` | Arauca | Colombian department | Republic of Colombia | medium |
| 300188 | `am-col-atlantico` | Atlántico | Colombian department | Republic of Colombia | medium |
| 300189 | `am-col-bolivar` | Bolívar | Colombian department | Republic of Colombia | medium |
| 300190 | `am-col-boyaca` | Boyacá | Colombian department | Republic of Colombia | medium |
| 300191 | `am-col-caldas` | Caldas | Colombian department | Republic of Colombia | medium |
| 300192 | `am-col-caqueta` | Caquetá | Colombian department | Republic of Colombia | medium |
| 300193 | `am-col-casanare` | Casanare | Colombian department | Republic of Colombia | medium |
| 300194 | `am-col-cauca` | Cauca | Colombian department | Republic of Colombia | medium |
| 300195 | `am-col-cesar` | Cesar | Colombian department | Republic of Colombia | medium |
| 300196 | `am-col-choco` | Chocó | Colombian department | Republic of Colombia | medium |
| 300197 | `am-col-cordoba` | Córdoba | Colombian department | Republic of Colombia | medium |
| 300198 | `am-col-bogota` | Cundinamarca and Bogotá | Colombian department | Republic of Colombia | medium |
| 300199 | `am-col-guainia` | Guainía | Colombian department | Republic of Colombia | medium |
| 300200 | `am-col-guaviare` | Guaviare | Colombian department | Republic of Colombia | medium |
| 300201 | `am-col-huila` | Huila | Colombian department | Republic of Colombia | medium |
| 300202 | `am-col-la-guajira` | La Guajira | Colombian department | Republic of Colombia | medium |
| 300203 | `am-col-magdalena` | Magdalena | Colombian department | Republic of Colombia | medium |
| 300204 | `am-col-meta` | Meta | Colombian department | Republic of Colombia | medium |
| 300205 | `am-col-narino` | Nariño | Colombian department | Republic of Colombia | medium |
| 300206 | `am-col-norte-de-santander` | Norte de Santander | Colombian department | Republic of Colombia | medium |
| 300207 | `am-col-putumayo` | Putumayo | Colombian department | Republic of Colombia | medium |
| 300208 | `am-col-quindio` | Quindío | Colombian department | Republic of Colombia | medium |
| 300209 | `am-col-risaralda` | Risaralda | Colombian department | Republic of Colombia | medium |
| 300210 | `am-col-santander` | Santander | Colombian department | Republic of Colombia | medium |
| 300211 | `am-col-sucre` | Sucre | Colombian department | Republic of Colombia | medium |
| 300212 | `am-col-tolima` | Tolima | Colombian department | Republic of Colombia | medium |
| 300213 | `am-col-valle-del-cauca` | Valle del Cauca | Colombian department | Republic of Colombia | medium |
| 300214 | `am-col-vaupes` | Vaupés | Colombian department | Republic of Colombia | medium |
| 300215 | `am-col-vichada` | Vichada | Colombian department | Republic of Colombia | medium |

### Republic of Costa Rica (COS) — 7 provinces

independent; 1900 population estimate 300000; geometry CRI.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300166 | `am-cos-alajuela` | Alajuela | Costa Rican province | Republic of Costa Rica | medium |
| 300167 | `am-cos-cartago` | Cartago | Costa Rican province | Republic of Costa Rica | medium |
| 300168 | `am-cos-guanacaste` | Guanacaste | Costa Rican province | Republic of Costa Rica | medium |
| 300169 | `am-cos-heredia` | Heredia | Costa Rican province | Republic of Costa Rica | medium |
| 300170 | `am-cos-limon` | Limón | Costa Rican province | Republic of Costa Rica | medium |
| 300171 | `am-cos-puntarenas` | Puntarenas | Costa Rican province | Republic of Costa Rica | medium |
| 300172 | `am-cos-san-jose` | San José | Costa Rican province | Republic of Costa Rica | medium |

### Kingdom of Denmark (DNK) — 5 provinces

independent; 1900 population estimate 2400000; geometry DNK.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300462 | `am-dwi-saint-croix` | Saint Croix | Danish colonial territory | Danish West Indies | high |
| 300463 | `am-dwi-saint-thomas` | Saint Thomas | Danish colonial territory | Danish West Indies | high |
| 300464 | `am-dwi-saint-john` | Saint John | Danish colonial territory | Danish West Indies | high |
| 300467 | `am-grl-north-greenland` | North Greenland | Danish dependency | Greenland | low |
| 300468 | `am-grl-south-greenland` | South Greenland | Danish dependency | Greenland | medium |

### Dominican Republic (DOM) — 5 provinces

independent; 1900 population estimate 600000; geometry DOM.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300422 | `am-dom-santo-domingo` | Santo Domingo | Dominican province grouping | Dominican Republic | low |
| 300423 | `am-dom-santiago` | Santiago | Dominican province grouping | Dominican Republic | low |
| 300424 | `am-dom-la-vega` | La Vega | Dominican province grouping | Dominican Republic | low |
| 300425 | `am-dom-azua` | Azua | Dominican province grouping | Dominican Republic | low |
| 300426 | `am-dom-el-seibo` | El Seibo | Dominican province grouping | Dominican Republic | low |

### Republic of Ecuador (ECU) — 24 provinces

independent; 1900 population estimate 1400000; geometry ECU.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300241 | `am-ecu-azuay` | Azuay | Ecuadorian province | Republic of Ecuador | medium |
| 300242 | `am-ecu-bolivar` | Bolivar | Ecuadorian province | Republic of Ecuador | medium |
| 300243 | `am-ecu-carchi` | Carchi | Ecuadorian province | Republic of Ecuador | medium |
| 300244 | `am-ecu-orellana` | Orellana | Ecuadorian province | Republic of Ecuador | medium |
| 300245 | `am-ecu-esmeraldas` | Esmeraldas | Ecuadorian province | Republic of Ecuador | medium |
| 300246 | `am-ecu-canar` | Cañar | Ecuadorian province | Republic of Ecuador | medium |
| 300247 | `am-ecu-guayas` | Guayas | Ecuadorian province | Republic of Ecuador | medium |
| 300248 | `am-ecu-chimborazo` | Chimborazo | Ecuadorian province | Republic of Ecuador | medium |
| 300249 | `am-ecu-imbabura` | Imbabura | Ecuadorian province | Republic of Ecuador | medium |
| 300250 | `am-ecu-loja` | Loja | Ecuadorian province | Republic of Ecuador | medium |
| 300251 | `am-ecu-manabi` | Manabi | Ecuadorian province | Republic of Ecuador | medium |
| 300252 | `am-ecu-napo` | Napo | Ecuadorian province | Republic of Ecuador | medium |
| 300253 | `am-ecu-el-oro` | El Oro | Ecuadorian province | Republic of Ecuador | medium |
| 300254 | `am-ecu-pichincha` | Pichincha | Ecuadorian province | Republic of Ecuador | medium |
| 300255 | `am-ecu-los-rios` | Los Rios | Ecuadorian province | Republic of Ecuador | medium |
| 300256 | `am-ecu-morona-santiago` | Morona Santiago | Ecuadorian province | Republic of Ecuador | medium |
| 300257 | `am-ecu-santo-domingo-de-los-tsachilas` | Santo Domingo de los Tsáchilas | Ecuadorian province | Republic of Ecuador | medium |
| 300258 | `am-ecu-santa-elena` | Santa Elena | Ecuadorian province | Republic of Ecuador | medium |
| 300259 | `am-ecu-tungurahua` | Tungurahua | Ecuadorian province | Republic of Ecuador | medium |
| 300260 | `am-ecu-sucumbios` | Sucumbios | Ecuadorian province | Republic of Ecuador | medium |
| 300261 | `am-ecu-galapagos` | Galápagos | Ecuadorian island territory | Republic of Ecuador | medium |
| 300262 | `am-ecu-cotopaxi` | Cotopaxi | Ecuadorian province | Republic of Ecuador | medium |
| 300263 | `am-ecu-pastaza` | Pastaza | Ecuadorian province | Republic of Ecuador | medium |
| 300264 | `am-ecu-zamora-chinchipe` | Zamora Chinchipe | Ecuadorian province | Republic of Ecuador | medium |

### French Republic (FRA) — 9 provinces

independent; 1900 population estimate 38900000; geometry FRA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300404 | `am-fra-french-guiana` | French Guiana | French colony | French Guiana | high |
| 300451 | `am-fca-saint-martin` | Saint-Martin | French colony | French Caribbean | high |
| 300452 | `am-fca-saint-barthelemy` | Saint-Barthélemy | French colony | French Caribbean | high |
| 300453 | `am-fca-saint-pierre` | Saint-Pierre | French colony | French Caribbean | high |
| 300454 | `am-fca-miquelon` | Miquelon | French colony | French Caribbean | high |
| 300455 | `am-fca-guadeloupe-basse-terre` | Guadeloupe (Basse-Terre) | French colony | French Caribbean | high |
| 300456 | `am-fca-guadeloupe-grande-terre` | Guadeloupe (Grande-Terre) | French colony | French Caribbean | high |
| 300457 | `am-fca-marie-galante` | Marie-Galante | French colony | French Caribbean | medium |
| 300458 | `am-fca-martinique` | Martinique | French colony | French Caribbean | high |

### United Kingdom of Great Britain and Ireland (GBR) — 35 provinces

independent; 1900 population estimate 41155000; geometry GBR, IRL, IMN, JEY, GGY.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300173 | `am-bwi-blz-belize` | Belize District | British colonial district | British Honduras | medium |
| 300174 | `am-bwi-blz-cayo` | Cayo | British colonial district | British Honduras | medium |
| 300175 | `am-bwi-blz-corozal` | Corozal | British colonial district | British Honduras | medium |
| 300176 | `am-bwi-blz-orange-walk` | Orange Walk | British colonial district | British Honduras | medium |
| 300177 | `am-bwi-blz-stann-creek` | Stann Creek | British colonial district | British Honduras | medium |
| 300178 | `am-bwi-blz-toledo` | Toledo | British colonial district | British Honduras | medium |
| 300397 | `am-bwi-guy-essequibo` | Essequibo | British colonial county | British Guiana | medium |
| 300398 | `am-bwi-guy-demerara` | Demerara | British colonial county | British Guiana | medium |
| 300399 | `am-bwi-guy-berbice` | Berbice | British colonial county | British Guiana | medium |
| 300427 | `am-bwi-jam-cornwall` | Cornwall County | British colonial county | Jamaica | medium |
| 300428 | `am-bwi-jam-middlesex` | Middlesex County | British colonial county | Jamaica | medium |
| 300429 | `am-bwi-jam-surrey` | Surrey County | British colonial county | Jamaica | medium |
| 300430 | `am-bwi-tto-trinidad` | Trinidad | British colonial island | Trinidad and Tobago | medium |
| 300431 | `am-bwi-tto-tobago` | Tobago | British colonial island | Trinidad and Tobago | medium |
| 300432 | `am-bwi-brb-barbados` | Barbados | British colony | Barbados | high |
| 300433 | `am-bwi-bhs-new-providence` | New Providence | British colonial district grouping | The Bahamas | medium |
| 300434 | `am-bwi-bhs-grand-bahama` | Grand Bahama | British colonial district grouping | The Bahamas | medium |
| 300435 | `am-bwi-bhs-out-islands` | The Out Islands | British colonial district grouping | The Bahamas | low |
| 300436 | `am-bwi-bmu-bermuda` | Bermuda | British colony | Bermuda | high |
| 300437 | `am-bwi-tca-turks-and-caicos` | Turks and Caicos Islands | British colony | Turks and Caicos Islands | medium |
| 300438 | `am-bwi-cym-cayman-islands` | Cayman Islands | British colony | Cayman Islands | medium |
| 300439 | `am-bwi-vgb-british-virgin-islands` | British Virgin Islands | British colony | British Virgin Islands | medium |
| 300440 | `am-bwi-aia-anguilla` | Anguilla | British colony | Anguilla | medium |
| 300441 | `am-bwi-atg-antigua` | Antigua | British colony | Antigua and Barbuda | medium |
| 300442 | `am-bwi-atg-barbuda` | Barbuda | British colony | Antigua and Barbuda | medium |
| 300443 | `am-bwi-kna-saint-kitts` | Saint Kitts | British colony | Saint Kitts and Nevis | medium |
| 300444 | `am-bwi-kna-nevis` | Nevis | British colony | Saint Kitts and Nevis | medium |
| 300445 | `am-bwi-msr-montserrat` | Montserrat | British colony | Montserrat | medium |
| 300446 | `am-bwi-dma-dominica` | Dominica | British colony | Dominica | high |
| 300447 | `am-bwi-lca-saint-lucia` | Saint Lucia | British colony | Saint Lucia | high |
| 300448 | `am-bwi-vct-saint-vincent` | Saint Vincent | British colony | Saint Vincent and the Grenadines | medium |
| 300449 | `am-bwi-vct-grenadines` | The Grenadines | British colony | Saint Vincent and the Grenadines | medium |
| 300450 | `am-bwi-grd-grenada` | Grenada | British colony | Grenada | medium |
| 300465 | `am-bsa-falkland-islands` | Falkland Islands | British crown colony | British South Atlantic islands | high |
| 300466 | `am-bsa-south-georgia` | South Georgia and the South Sandwich Islands | British crown colony | British South Atlantic islands | medium |

### Republic of Guatemala (GUA) — 22 provinces

independent; 1900 population estimate 1400000; geometry GTM.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300095 | `am-gua-alta-verapaz` | Alta Verapaz | Guatemalan department | Republic of Guatemala | medium |
| 300096 | `am-gua-baja-verapaz` | Baja Verapaz | Guatemalan department | Republic of Guatemala | medium |
| 300097 | `am-gua-chimaltenango` | Chimaltenango | Guatemalan department | Republic of Guatemala | medium |
| 300098 | `am-gua-chiquimula` | Chiquimula | Guatemalan department | Republic of Guatemala | medium |
| 300099 | `am-gua-escuintla` | Escuintla | Guatemalan department | Republic of Guatemala | medium |
| 300100 | `am-gua-guatemala` | Guatemala | Guatemalan department | Republic of Guatemala | medium |
| 300101 | `am-gua-huehuetenango` | Huehuetenango | Guatemalan department | Republic of Guatemala | medium |
| 300102 | `am-gua-izabal` | Izabal | Guatemalan department | Republic of Guatemala | medium |
| 300103 | `am-gua-jalapa` | Jalapa | Guatemalan department | Republic of Guatemala | medium |
| 300104 | `am-gua-jutiapa` | Jutiapa | Guatemalan department | Republic of Guatemala | medium |
| 300105 | `am-gua-peten` | Petén | Guatemalan department | Republic of Guatemala | medium |
| 300106 | `am-gua-el-progreso` | El Progreso | Guatemalan department | Republic of Guatemala | medium |
| 300107 | `am-gua-quiche` | Quiché | Guatemalan department | Republic of Guatemala | medium |
| 300108 | `am-gua-quezaltenango` | Quezaltenango | Guatemalan department | Republic of Guatemala | medium |
| 300109 | `am-gua-retalhuleu` | Retalhuleu | Guatemalan department | Republic of Guatemala | medium |
| 300110 | `am-gua-sacatepequez` | Sacatepéquez | Guatemalan department | Republic of Guatemala | medium |
| 300111 | `am-gua-san-marcos` | San Marcos | Guatemalan department | Republic of Guatemala | medium |
| 300112 | `am-gua-solola` | Sololá | Guatemalan department | Republic of Guatemala | medium |
| 300113 | `am-gua-santa-rosa` | Santa Rosa | Guatemalan department | Republic of Guatemala | medium |
| 300114 | `am-gua-suchitepequez` | Suchitepéquez | Guatemalan department | Republic of Guatemala | medium |
| 300115 | `am-gua-totonicapan` | Totonicapán | Guatemalan department | Republic of Guatemala | medium |
| 300116 | `am-gua-zacapa` | Zacapa | Guatemalan department | Republic of Guatemala | medium |

### Republic of Honduras (HON) — 18 provinces

independent; 1900 population estimate 500000; geometry HND.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300117 | `am-hon-atlantida` | Atlántida | Honduran department | Republic of Honduras | medium |
| 300118 | `am-hon-choluteca` | Choluteca | Honduran department | Republic of Honduras | medium |
| 300119 | `am-hon-colon` | Colón | Honduran department | Republic of Honduras | medium |
| 300120 | `am-hon-comayagua` | Comayagua | Honduran department | Republic of Honduras | medium |
| 300121 | `am-hon-copan` | Copán | Honduran department | Republic of Honduras | medium |
| 300122 | `am-hon-cortes` | Cortés | Honduran department | Republic of Honduras | medium |
| 300123 | `am-hon-el-paraiso` | El Paraíso | Honduran department | Republic of Honduras | medium |
| 300124 | `am-hon-francisco-morazan` | Francisco Morazán | Honduran department | Republic of Honduras | medium |
| 300125 | `am-hon-gracias-a-dios` | Gracias a Dios | Honduran department | Republic of Honduras | medium |
| 300126 | `am-hon-islas-de-la-bahia` | Islas de la Bahía | Honduran department | Republic of Honduras | medium |
| 300127 | `am-hon-intibuca` | Intibucá | Honduran department | Republic of Honduras | medium |
| 300128 | `am-hon-lempira` | Lempira | Honduran department | Republic of Honduras | medium |
| 300129 | `am-hon-la-paz` | La Paz | Honduran department | Republic of Honduras | medium |
| 300130 | `am-hon-ocotepeque` | Ocotepeque | Honduran department | Republic of Honduras | medium |
| 300131 | `am-hon-olancho` | Olancho | Honduran department | Republic of Honduras | medium |
| 300132 | `am-hon-santa-barbara` | Santa Bárbara | Honduran department | Republic of Honduras | medium |
| 300133 | `am-hon-valle` | Valle | Honduran department | Republic of Honduras | medium |
| 300134 | `am-hon-yoro` | Yoro | Honduran department | Republic of Honduras | medium |

### Republic of Haiti (HTI) — 10 provinces

independent; 1900 population estimate 1500000; geometry HTI.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300412 | `am-hti-l-artibonite` | L'Artibonite | Haitian department | Republic of Haiti | medium |
| 300413 | `am-hti-centre` | Centre | Haitian department | Republic of Haiti | medium |
| 300414 | `am-hti-grand-anse` | Grand'Anse | Haitian department | Republic of Haiti | medium |
| 300415 | `am-hti-nord` | Nord | Haitian department | Republic of Haiti | medium |
| 300416 | `am-hti-nord-est` | Nord-Est | Haitian department | Republic of Haiti | medium |
| 300417 | `am-hti-nippes` | Nippes | Haitian department | Republic of Haiti | medium |
| 300418 | `am-hti-nord-ouest` | Nord-Ouest | Haitian department | Republic of Haiti | medium |
| 300419 | `am-hti-ouest` | Ouest | Haitian department | Republic of Haiti | medium |
| 300420 | `am-hti-sud` | Sud | Haitian department | Republic of Haiti | medium |
| 300421 | `am-hti-sud-est` | Sud-Est | Haitian department | Republic of Haiti | medium |

### United Mexican States (MEX) — 31 provinces

independent; 1900 population estimate 13600000; geometry MEX.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300064 | `am-mex-aguascalientes` | Aguascalientes | Mexican state or territory | United Mexican States | medium |
| 300065 | `am-mex-baja-california` | Baja California | Mexican federal territory | United Mexican States | high |
| 300066 | `am-mex-campeche` | Campeche | Mexican state or territory | United Mexican States | medium |
| 300067 | `am-mex-chihuahua` | Chihuahua | Mexican state or territory | United Mexican States | medium |
| 300068 | `am-mex-chiapas` | Chiapas | Mexican state or territory | United Mexican States | medium |
| 300069 | `am-mex-coahuila` | Coahuila | Mexican state or territory | United Mexican States | medium |
| 300070 | `am-mex-colima` | Colima | Mexican state or territory | United Mexican States | medium |
| 300071 | `am-mex-distrito-federal` | Distrito Federal | Mexican federal district | United Mexican States | high |
| 300072 | `am-mex-durango` | Durango | Mexican state or territory | United Mexican States | medium |
| 300073 | `am-mex-guerrero` | Guerrero | Mexican state or territory | United Mexican States | medium |
| 300074 | `am-mex-guanajuato` | Guanajuato | Mexican state or territory | United Mexican States | medium |
| 300075 | `am-mex-hidalgo` | Hidalgo | Mexican state or territory | United Mexican States | medium |
| 300076 | `am-mex-jalisco` | Jalisco | Mexican state or territory | United Mexican States | medium |
| 300077 | `am-mex-mexico` | México | Mexican state or territory | United Mexican States | medium |
| 300078 | `am-mex-michoacan` | Michoacán | Mexican state or territory | United Mexican States | medium |
| 300079 | `am-mex-morelos` | Morelos | Mexican state or territory | United Mexican States | medium |
| 300080 | `am-mex-nayarit` | Nayarit | Mexican state or territory | United Mexican States | medium |
| 300081 | `am-mex-nuevo-leon` | Nuevo León | Mexican state or territory | United Mexican States | medium |
| 300082 | `am-mex-oaxaca` | Oaxaca | Mexican state or territory | United Mexican States | medium |
| 300083 | `am-mex-puebla` | Puebla | Mexican state or territory | United Mexican States | medium |
| 300084 | `am-mex-queretaro` | Querétaro | Mexican state or territory | United Mexican States | medium |
| 300085 | `am-mex-quintana-roo` | Quintana Roo | Mexican federal territory | United Mexican States | medium |
| 300086 | `am-mex-sinaloa` | Sinaloa | Mexican state or territory | United Mexican States | medium |
| 300087 | `am-mex-san-luis-potosi` | San Luis Potosí | Mexican state or territory | United Mexican States | medium |
| 300088 | `am-mex-sonora` | Sonora | Mexican state or territory | United Mexican States | medium |
| 300089 | `am-mex-tabasco` | Tabasco | Mexican state or territory | United Mexican States | medium |
| 300090 | `am-mex-tamaulipas` | Tamaulipas | Mexican state or territory | United Mexican States | medium |
| 300091 | `am-mex-tlaxcala` | Tlaxcala | Mexican state or territory | United Mexican States | medium |
| 300092 | `am-mex-veracruz` | Veracruz | Mexican state or territory | United Mexican States | medium |
| 300093 | `am-mex-yucatan` | Yucatán | Mexican state | United Mexican States | high |
| 300094 | `am-mex-zacatecas` | Zacatecas | Mexican state or territory | United Mexican States | medium |

### Newfoundland (NFD) — 1 provinces

dominion; 1900 population estimate 220000; geometry adm1:CA-NL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300063 | `am-nfd-newfoundland-and-labrador` | Newfoundland and Labrador | Dominion of Newfoundland | Dominion of Newfoundland | high |

### Republic of Nicaragua (NIC) — 17 provinces

independent; 1900 population estimate 400000; geometry NIC.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300149 | `am-nic-atlantico-norte` | Atlántico Norte | Nicaraguan department | Republic of Nicaragua | medium |
| 300150 | `am-nic-atlantico-sur` | Atlántico Sur | Nicaraguan department | Republic of Nicaragua | medium |
| 300151 | `am-nic-boaco` | Boaco | Nicaraguan department | Republic of Nicaragua | medium |
| 300152 | `am-nic-carazo` | Carazo | Nicaraguan department | Republic of Nicaragua | medium |
| 300153 | `am-nic-chinandega` | Chinandega | Nicaraguan department | Republic of Nicaragua | medium |
| 300154 | `am-nic-chontales` | Chontales | Nicaraguan department | Republic of Nicaragua | medium |
| 300155 | `am-nic-esteli` | Estelí | Nicaraguan department | Republic of Nicaragua | medium |
| 300156 | `am-nic-granada` | Granada | Nicaraguan department | Republic of Nicaragua | medium |
| 300157 | `am-nic-jinotega` | Jinotega | Nicaraguan department | Republic of Nicaragua | medium |
| 300158 | `am-nic-leon` | León | Nicaraguan department | Republic of Nicaragua | medium |
| 300159 | `am-nic-madriz` | Madriz | Nicaraguan department | Republic of Nicaragua | medium |
| 300160 | `am-nic-managua` | Managua | Nicaraguan department | Republic of Nicaragua | medium |
| 300161 | `am-nic-masaya` | Masaya | Nicaraguan department | Republic of Nicaragua | medium |
| 300162 | `am-nic-matagalpa` | Matagalpa | Nicaraguan department | Republic of Nicaragua | medium |
| 300163 | `am-nic-nueva-segovia` | Nueva Segovia | Nicaraguan department | Republic of Nicaragua | medium |
| 300164 | `am-nic-rivas` | Rivas | Nicaraguan department | Republic of Nicaragua | medium |
| 300165 | `am-nic-rio-san-juan` | Rio San Juan | Nicaraguan department | Republic of Nicaragua | medium |

### Kingdom of the Netherlands (NLD) — 7 provinces

independent; 1900 population estimate 5100000; geometry NLD.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300400 | `am-sur-paramaribo-and-the-coast` | Paramaribo and the coastal districts | Dutch colonial district | Dutch Guiana (Suriname) | medium |
| 300401 | `am-sur-nickerie` | Nickerie | Dutch colonial district | Dutch Guiana (Suriname) | medium |
| 300402 | `am-sur-suriname-interior` | Suriname (interior) | Dutch colonial district | Dutch Guiana (Suriname) | low |
| 300403 | `am-sur-marowijne` | Marowijne | Dutch colonial district | Dutch Guiana (Suriname) | medium |
| 300459 | `am-dgc-aruba` | Aruba | Dutch colonial territory | Dutch Caribbean | high |
| 300460 | `am-dgc-curacao` | Curaçao | Dutch colonial territory | Dutch Caribbean | high |
| 300461 | `am-dgc-sint-maarten` | Sint Maarten | Dutch colonial territory | Dutch Caribbean | low |

### Republic of Peru (PRU) — 24 provinces

independent; 1900 population estimate 3700000; geometry PER.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300265 | `am-pru-amazonas` | Amazonas | Peruvian department | Republic of Peru | medium |
| 300266 | `am-pru-ancash` | Áncash | Peruvian department | Republic of Peru | medium |
| 300267 | `am-pru-apurimac` | Apurímac | Peruvian department | Republic of Peru | medium |
| 300268 | `am-pru-arequipa` | Arequipa | Peruvian department | Republic of Peru | medium |
| 300269 | `am-pru-ayacucho` | Ayacucho | Peruvian department | Republic of Peru | medium |
| 300270 | `am-pru-cajamarca` | Cajamarca | Peruvian department | Republic of Peru | medium |
| 300271 | `am-pru-callao` | Callao | Peruvian department | Republic of Peru | medium |
| 300272 | `am-pru-cusco` | Cusco | Peruvian department | Republic of Peru | medium |
| 300273 | `am-pru-huanuco` | Huánuco | Peruvian department | Republic of Peru | medium |
| 300274 | `am-pru-huancavelica` | Huancavelica | Peruvian department | Republic of Peru | medium |
| 300275 | `am-pru-ica` | Ica | Peruvian department | Republic of Peru | medium |
| 300276 | `am-pru-junin` | Junín | Peruvian department | Republic of Peru | medium |
| 300277 | `am-pru-la-libertad` | La Libertad | Peruvian department | Republic of Peru | medium |
| 300278 | `am-pru-lambayeque` | Lambayeque | Peruvian department | Republic of Peru | medium |
| 300279 | `am-pru-lima` | Lima and Callao | Peruvian department | Republic of Peru | medium |
| 300280 | `am-pru-loreto` | Loreto | Peruvian department | Republic of Peru | medium |
| 300281 | `am-pru-madre-de-dios` | Madre de Dios | Peruvian department | Republic of Peru | medium |
| 300282 | `am-pru-moquegua` | Moquegua | Peruvian department | Republic of Peru | medium |
| 300283 | `am-pru-pasco` | Pasco | Peruvian department | Republic of Peru | medium |
| 300284 | `am-pru-piura` | Piura | Peruvian department | Republic of Peru | medium |
| 300285 | `am-pru-puno` | Puno | Peruvian department | Republic of Peru | medium |
| 300286 | `am-pru-san-martin` | San Martín | Peruvian department | Republic of Peru | medium |
| 300287 | `am-pru-tumbes` | Tumbes | Peruvian department | Republic of Peru | medium |
| 300288 | `am-pru-ucayali` | Ucayali | Peruvian department | Republic of Peru | medium |

### Republic of Paraguay (PRY) — 18 provinces

independent; 1900 population estimate 600000; geometry PRY.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300359 | `am-pry-concepcion` | Concepción | Paraguayan department | Republic of Paraguay | medium |
| 300360 | `am-pry-alto-parana` | Alto Paraná | Paraguayan department | Republic of Paraguay | medium |
| 300361 | `am-pry-central` | Central | Paraguayan department | Republic of Paraguay | medium |
| 300362 | `am-pry-neembucu` | Ñeembucú | Paraguayan department | Republic of Paraguay | medium |
| 300363 | `am-pry-amambay` | Amambay | Paraguayan department | Republic of Paraguay | medium |
| 300364 | `am-pry-canindeyu` | Canindeyú | Paraguayan department | Republic of Paraguay | medium |
| 300365 | `am-pry-presidente-hayes` | Presidente Hayes | Paraguayan department | Republic of Paraguay | medium |
| 300366 | `am-pry-alto-paraguay` | Alto Paraguay | Paraguayan department | Republic of Paraguay | medium |
| 300367 | `am-pry-boqueron` | Boquerón | Paraguayan department | Republic of Paraguay | medium |
| 300368 | `am-pry-san-pedro` | San Pedro | Paraguayan department | Republic of Paraguay | medium |
| 300369 | `am-pry-cordillera` | Cordillera | Paraguayan department | Republic of Paraguay | medium |
| 300370 | `am-pry-guaira` | Guairá | Paraguayan department | Republic of Paraguay | medium |
| 300371 | `am-pry-caaguazu` | Caaguazú | Paraguayan department | Republic of Paraguay | medium |
| 300372 | `am-pry-caazapa` | Caazapá | Paraguayan department | Republic of Paraguay | medium |
| 300373 | `am-pry-itapua` | Itapúa | Paraguayan department | Republic of Paraguay | medium |
| 300374 | `am-pry-misiones` | Misiones | Paraguayan department | Republic of Paraguay | medium |
| 300375 | `am-pry-paraguari` | Paraguarí | Paraguayan department | Republic of Paraguay | medium |
| 300376 | `am-pry-asuncion` | Asunción | Paraguayan department | Republic of Paraguay | medium |

### Republic of El Salvador (SAL) — 14 provinces

independent; 1900 population estimate 900000; geometry SLV.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300135 | `am-sal-ahuachapan` | Ahuachapán | Salvadoran department | Republic of El Salvador | medium |
| 300136 | `am-sal-cabanas` | Cabañas | Salvadoran department | Republic of El Salvador | medium |
| 300137 | `am-sal-chalatenango` | Chalatenango | Salvadoran department | Republic of El Salvador | medium |
| 300138 | `am-sal-cuscatlan` | Cuscatlán | Salvadoran department | Republic of El Salvador | medium |
| 300139 | `am-sal-la-libertad` | La Libertad | Salvadoran department | Republic of El Salvador | medium |
| 300140 | `am-sal-morazan` | Morazán | Salvadoran department | Republic of El Salvador | medium |
| 300141 | `am-sal-la-paz` | La Paz | Salvadoran department | Republic of El Salvador | medium |
| 300142 | `am-sal-santa-ana` | Santa Ana | Salvadoran department | Republic of El Salvador | medium |
| 300143 | `am-sal-san-miguel` | San Miguel | Salvadoran department | Republic of El Salvador | medium |
| 300144 | `am-sal-sonsonate` | Sonsonate | Salvadoran department | Republic of El Salvador | medium |
| 300145 | `am-sal-san-salvador` | San Salvador | Salvadoran department | Republic of El Salvador | medium |
| 300146 | `am-sal-san-vicente` | San Vicente | Salvadoran department | Republic of El Salvador | medium |
| 300147 | `am-sal-la-union` | La Unión | Salvadoran department | Republic of El Salvador | medium |
| 300148 | `am-sal-usulutan` | Usulután | Salvadoran department | Republic of El Salvador | medium |

### Oriental Republic of Uruguay (URY) — 19 provinces

independent; 1900 population estimate 900000; geometry URY.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300340 | `am-ury-artigas` | Artigas | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300341 | `am-ury-canelones` | Canelones | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300342 | `am-ury-cerro-largo` | Cerro Largo | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300343 | `am-ury-colonia` | Colonia | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300344 | `am-ury-durazno` | Durazno | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300345 | `am-ury-florida` | Florida | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300346 | `am-ury-flores` | Flores | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300347 | `am-ury-lavalleja` | Lavalleja | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300348 | `am-ury-maldonado` | Maldonado | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300349 | `am-ury-montevideo` | Montevideo | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300350 | `am-ury-paysandu` | Paysandú | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300351 | `am-ury-rio-negro` | Río Negro | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300352 | `am-ury-rocha` | Rocha | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300353 | `am-ury-rivera` | Rivera | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300354 | `am-ury-salto` | Salto | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300355 | `am-ury-san-jose` | San José | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300356 | `am-ury-soriano` | Soriano | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300357 | `am-ury-tacuarembo` | Tacuarembó | Uruguayan department | Oriental Republic of Uruguay | medium |
| 300358 | `am-ury-treinta-y-tres` | Treinta y Tres | Uruguayan department | Oriental Republic of Uruguay | medium |

### United States of America (USA) — 59 provinces

independent; 1900 population estimate 76094000; geometry USA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300001 | `am-usa-alaska` | Alaska | U.S. district | United States of America | high |
| 300002 | `am-usa-alabama` | Alabama | U.S. state | United States of America | high |
| 300003 | `am-usa-arkansas` | Arkansas | U.S. state | United States of America | high |
| 300004 | `am-usa-arizona-territory` | Arizona Territory | U.S. territory | United States of America | high |
| 300005 | `am-usa-california` | California | U.S. state | United States of America | high |
| 300006 | `am-usa-colorado` | Colorado | U.S. state | United States of America | high |
| 300007 | `am-usa-connecticut` | Connecticut | U.S. state | United States of America | high |
| 300008 | `am-usa-district-of-columbia` | District of Columbia | U.S. federal district | United States of America | high |
| 300009 | `am-usa-delaware` | Delaware | U.S. state | United States of America | high |
| 300010 | `am-usa-florida` | Florida | U.S. state | United States of America | high |
| 300011 | `am-usa-georgia` | Georgia | U.S. state | United States of America | high |
| 300012 | `am-usa-hawaii` | Hawaii | U.S. annexed territory | United States of America | high |
| 300013 | `am-usa-iowa` | Iowa | U.S. state | United States of America | high |
| 300014 | `am-usa-idaho` | Idaho | U.S. state | United States of America | high |
| 300015 | `am-usa-illinois` | Illinois | U.S. state | United States of America | high |
| 300016 | `am-usa-indiana` | Indiana | U.S. state | United States of America | high |
| 300017 | `am-usa-kansas` | Kansas | U.S. state | United States of America | high |
| 300018 | `am-usa-kentucky` | Kentucky | U.S. state | United States of America | high |
| 300019 | `am-usa-louisiana` | Louisiana | U.S. state | United States of America | high |
| 300020 | `am-usa-massachusetts` | Massachusetts | U.S. state | United States of America | high |
| 300021 | `am-usa-maryland` | Maryland | U.S. state | United States of America | high |
| 300022 | `am-usa-maine` | Maine | U.S. state | United States of America | high |
| 300023 | `am-usa-michigan` | Michigan | U.S. state | United States of America | high |
| 300024 | `am-usa-minnesota` | Minnesota | U.S. state | United States of America | high |
| 300025 | `am-usa-missouri` | Missouri | U.S. state | United States of America | high |
| 300026 | `am-usa-mississippi` | Mississippi | U.S. state | United States of America | high |
| 300027 | `am-usa-montana` | Montana | U.S. state | United States of America | high |
| 300028 | `am-usa-north-carolina` | North Carolina | U.S. state | United States of America | high |
| 300029 | `am-usa-north-dakota` | North Dakota | U.S. state | United States of America | high |
| 300030 | `am-usa-nebraska` | Nebraska | U.S. state | United States of America | high |
| 300031 | `am-usa-new-hampshire` | New Hampshire | U.S. state | United States of America | high |
| 300032 | `am-usa-new-jersey` | New Jersey | U.S. state | United States of America | high |
| 300033 | `am-usa-new-mexico-territory` | New Mexico Territory | U.S. territory | United States of America | high |
| 300034 | `am-usa-nevada` | Nevada | U.S. state | United States of America | high |
| 300035 | `am-usa-new-york` | New York | U.S. state | United States of America | high |
| 300036 | `am-usa-ohio` | Ohio | U.S. state | United States of America | high |
| 300037 | `am-usa-oklahoma-territory-and-indian-territory` | Oklahoma Territory and Indian Territory | U.S. territory | Oklahoma and Indian Territory | high |
| 300038 | `am-usa-oregon` | Oregon | U.S. state | United States of America | high |
| 300039 | `am-usa-pennsylvania` | Pennsylvania | U.S. state | United States of America | high |
| 300040 | `am-usa-rhode-island` | Rhode Island | U.S. state | United States of America | high |
| 300041 | `am-usa-south-carolina` | South Carolina | U.S. state | United States of America | high |
| 300042 | `am-usa-south-dakota` | South Dakota | U.S. state | United States of America | high |
| 300043 | `am-usa-tennessee` | Tennessee | U.S. state | United States of America | high |
| 300044 | `am-usa-texas` | Texas | U.S. state | United States of America | high |
| 300045 | `am-usa-utah` | Utah | U.S. state | United States of America | high |
| 300046 | `am-usa-virginia` | Virginia | U.S. state | United States of America | high |
| 300047 | `am-usa-vermont` | Vermont | U.S. state | United States of America | high |
| 300048 | `am-usa-washington` | Washington | U.S. state | United States of America | high |
| 300049 | `am-usa-wisconsin` | Wisconsin | U.S. state | United States of America | high |
| 300050 | `am-usa-west-virginia` | West Virginia | U.S. state | United States of America | high |
| 300051 | `am-usa-wyoming` | Wyoming | U.S. state | United States of America | high |
| 300405 | `am-cub-pinar-del-rio` | Pinar del Río | United States military occupation | Cuba | medium |
| 300406 | `am-cub-la-habana` | La Habana | United States military occupation | Cuba | medium |
| 300407 | `am-cub-matanzas` | Matanzas | United States military occupation | Cuba | medium |
| 300408 | `am-cub-santa-clara` | Santa Clara | United States military occupation | Cuba | medium |
| 300409 | `am-cub-camaguey` | Camagüey | United States military occupation | Cuba | medium |
| 300410 | `am-cub-oriente` | Oriente | United States military occupation | Cuba | medium |
| 300411 | `am-cub-isle-of-pines` | Isle of Pines | United States military occupation | Cuba | medium |
| 300469 | `am-pri-puerto-rico` | Puerto Rico | United States military occupation | Puerto Rico | high |

### United States of Venezuela (VEN) — 25 provinces

independent; 1900 population estimate 2400000; geometry VEN.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 300216 | `am-ven-distrito-capital` | Distrito Capital | Venezuelan state or territory | United States of Venezuela | medium |
| 300217 | `am-ven-anzoategui` | Anzoátegui | Venezuelan state or territory | United States of Venezuela | medium |
| 300218 | `am-ven-apure` | Apure | Venezuelan state or territory | United States of Venezuela | medium |
| 300219 | `am-ven-aragua` | Aragua | Venezuelan state or territory | United States of Venezuela | medium |
| 300220 | `am-ven-barinas` | Barinas | Venezuelan state or territory | United States of Venezuela | medium |
| 300221 | `am-ven-bolivar` | Bolívar | Venezuelan state or territory | United States of Venezuela | medium |
| 300222 | `am-ven-carabobo` | Carabobo | Venezuelan state or territory | United States of Venezuela | medium |
| 300223 | `am-ven-cojedes` | Cojedes | Venezuelan state or territory | United States of Venezuela | medium |
| 300224 | `am-ven-falcon` | Falcón | Venezuelan state or territory | United States of Venezuela | medium |
| 300225 | `am-ven-guarico` | Guárico | Venezuelan state or territory | United States of Venezuela | medium |
| 300226 | `am-ven-lara` | Lara | Venezuelan state or territory | United States of Venezuela | medium |
| 300227 | `am-ven-merida` | Mérida | Venezuelan state or territory | United States of Venezuela | medium |
| 300228 | `am-ven-miranda` | Miranda | Venezuelan state or territory | United States of Venezuela | medium |
| 300229 | `am-ven-monagas` | Monagas | Venezuelan state or territory | United States of Venezuela | medium |
| 300230 | `am-ven-nueva-esparta` | Nueva Esparta | Venezuelan state or territory | United States of Venezuela | medium |
| 300231 | `am-ven-portuguesa` | Portuguesa | Venezuelan state or territory | United States of Venezuela | medium |
| 300232 | `am-ven-sucre` | Sucre | Venezuelan state or territory | United States of Venezuela | medium |
| 300233 | `am-ven-tachira` | Táchira | Venezuelan state or territory | United States of Venezuela | medium |
| 300234 | `am-ven-trujillo` | Trujillo | Venezuelan state or territory | United States of Venezuela | medium |
| 300235 | `am-ven-yaracuy` | Yaracuy | Venezuelan state or territory | United States of Venezuela | medium |
| 300236 | `am-ven-zulia` | Zulia | Venezuelan state or territory | United States of Venezuela | medium |
| 300237 | `am-ven-dependencias-federales` | Federal Dependencies | Venezuelan state or territory | United States of Venezuela | medium |
| 300238 | `am-ven-vargas` | Vargas | Venezuelan state or territory | United States of Venezuela | medium |
| 300239 | `am-ven-delta-amacuro` | Delta Amacuro | Venezuelan state or territory | United States of Venezuela | medium |
| 300240 | `am-ven-amazonas` | Amazonas | Venezuelan state or territory | United States of Venezuela | medium |

