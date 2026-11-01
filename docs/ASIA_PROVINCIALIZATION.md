# M12b — Asian Provincialization (1 January 1900)

Status: implemented. This document is generated from the committed Asia province
bundle and audit; the bundle and the code are authoritative if they disagree.

## 1. Scope and architecture

- Asia is the direct counterpart of M12a Europe. The only geographical
  subdivision beneath a polity is the **Province**; there is no
  Polity → Region → Province hierarchy and no parallel geographical region layer.
- The historical simulation `Region` remains a population/economy accounting
  unit. It is preserved as `SimulationRegion` and is never used to draw or
  hit-test territory. See DECISIONS D-103 and D-104.
- Province ids start at **100001**, above the entire M12a European block
  (maximum 66001), and every Asia key is prefixed with `as-`. A merge-time check
  rejects any collision with Europe.
- The two committed bundles stay separate build artifacts:
  - `packages/data/data/map/provinces_1900.json` — M12a Europe;
  - `packages/data/data/map/provinces_asia_1900.json` — M12b Asia.
  A single loader (`packages/data/src/provinces.ts` for the simulation and
  `packages/app/src/provinceMapBundle.ts` for the renderer) combines them with
  unique ids, merged borders and one future-polity registry.
- Political state is mutable and separate from geography: legal owner, effective
  controller, occupation date, formal claims and special status live in
  `World.provinces`; geometry, id and name never change.
- Country borders are reconstructed from current provincial ownership using the
  same rendering contract as Europe: province fills by current owner, a quiet
  solid white hairline on every province outline, and a thin near-black country
  border where the two current owners differ. No dotted or dashed province
  lines are used.
- Asia's province geometries are clipped to the authored M11c 1900 polity
  polygons. The M11c polygons remain the underlay for territories outside the
  provincial scope (the Americas, most of Africa and Oceania).

## 2. Inventory summary

- Provinces: **239**.
- 1900 owner polities with at least one province: **16**.
- Map features covered: **29** (`AFG`, `BHU`, `BIN`, `BPO`, `BUK`, `CEY`, `CHN`, `DEI`, `FIC`, `HKG`, `JPN`, `KHI`, `KOR`, `KUW`, `MAC`, `MAL`, `NPL`, `OMN`, `OTT`, `PER`, `PHL`, `PTM`, `RUS`, `SAR`, `SHM`, `THA`, `TIB`, `TRU`, `TWN`).
- Future successor polities in the registry: **45** (ids 1100–1144).
- Unique province ids/keys: **yes** (build audit).
- Border pairs: **633**; shared border segments: **155016**; segments with more than two neighbours: **64**.
- Province pairs with a measured overlap above 0.005 deg²: **64** (the largest are listed in §3).
- Confidence: low **17**, medium **208**, high **14**.
- Admin-1 units whose label point lies inside an Asian 1900 feature but that no province claims: **0**.

## 3. Method and geometry provenance

The build uses modern Natural Earth 1:10m admin-1 units **only as internal
geometry blocks**. Every province is clipped to its authored M11c 1900 polity
polygon. Where a later frontier cut through a modern unit, the province is split
along that frontier and the approximation is labelled low or medium confidence.
Output geometry is simplified at 0.02° and quantized to thousandths of a degree,
matching the M11c world map.

The M12a/M12b pipeline is one shared library
(`scripts/m12/province-build-lib.mjs`). It applies these rules in order:

1. union the authored admin-1 blocks, then apply authored clip/exclude shapes;
2. intersect with the 1900 polity polygon;
3. subtract earlier provinces of a different owner (M12a Europe is seeded first);
4. simplify, then re-trim cross-owner overlaps that simplification expanded;
5. extract shared borders from the **unsimplified** source rings;
6. audit coverage, overlaps, duplicate ids and unassigned units.

The largest remaining overlaps are within a single map feature (almost all
between provinces of the same owner): deliberate seams between authored clip
lines or simplification residues inside one polity. They cannot paint a
foreign-colour enclave unless the two provinces have different owners; any such
case is listed in the audit for review.

| Left | Right | Area (deg²) |
|---|---|---:|
| `as-tib-u-tsang` | `as-tib-kham` | 0.0359 |
| `as-rus-yeniseysk` | `as-rus-yakutsk` | 0.026 |
| `as-rus-amur` | `as-rus-khabarovsk` | 0.0179 |
| `as-rus-tomsk` | `as-rus-yeniseysk` | 0.0158 |
| `as-rus-yeniseysk` | `as-rus-irkutsk` | 0.0148 |
| `as-rus-uralsk` | `as-rus-transcaspia` | 0.0145 |
| `as-rus-transbaikal` | `as-rus-kamchatka` | 0.0145 |
| `as-chn-inner-mongolia` | `as-chn-eastern-and-gobi-mongolia` | 0.0138 |
| `as-rus-transbaikal` | `as-rus-yakutsk` | 0.0135 |
| `as-rus-semipalatinsk` | `as-rus-tomsk` | 0.0123 |
| `as-rus-semipalatinsk` | `as-rus-altai` | 0.0117 |
| `as-chn-khalkha-mongolia` | `as-chn-eastern-and-gobi-mongolia` | 0.0111 |

The committed build products are:

- `packages/data/data/map/provinces_asia_1900.json` — province metadata, geometry, shared boundaries and future polities.
- `packages/data/data/map/provinces_asia_1900_audit.json` — coverage, overlaps, ids, source count, unassigned units and warnings.
- `packages/app/src/generated/provincesAsia1900.ts` — the same bundle for the offline app.
- `scripts/m12b/asia-plan.mjs` — the authored historical inventory and grouping rules.
- `scripts/m12b/build-asia-provinces.mjs` — the deterministic geometry build.

## 4. Sources

| ID | Title | Licence | Date | URL |
|---|---|---|---|---|
| `natural-earth-10m-admin1` | Natural Earth 1:10m admin-1 states and provinces | Public domain | 2024 | https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/ |
| `natural-earth-50m-admin0` | Natural Earth 1:50m admin-0 countries | Public domain | 2024 | https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/ |
| `eb1911-ottoman-asia` | Encyclopaedia Britannica (1911), 'Turkey' (Asiatic provinces) | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Turkey |
| `eb1911-persia` | Encyclopaedia Britannica (1911), 'Persia' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Persia |
| `eb1911-afghanistan` | Encyclopaedia Britannica (1911), 'Afghanistan' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Afghanistan |
| `eb1911-india` | Encyclopaedia Britannica (1911), 'India' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/India |
| `eb1911-china` | Encyclopaedia Britannica (1911), 'China' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/China |
| `eb1911-japan` | Encyclopaedia Britannica (1911), 'Japan' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Japan |
| `eb1911-korea` | Encyclopaedia Britannica (1911), 'Korea' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Korea |
| `eb1911-indochina` | Encyclopaedia Britannica (1911), 'French Indo-China' and 'Siam' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/French_Indo-China |
| `eb1911-east-indies` | Encyclopaedia Britannica (1911), 'Dutch East Indies' and 'Philippine Islands' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Dutch_East_Indies |
| `treaty-sevres-1920` | Treaty of Sevres (1920), Ottoman territorial clauses | Public domain | 1920 | https://en.wikisource.org/wiki/Treaty_of_S%C3%A8vres |
| `treaty-lausanne-1923` | Treaty of Lausanne (1923), Turco-Greek and Middle Eastern clauses | Public domain | 1923 | https://en.wikisource.org/wiki/Treaty_of_Lausanne |
| `treaty-versailles-1919` | Treaty of Versailles (1919), Shandong and Pacific clauses | Public domain | 1919 | https://en.wikisource.org/wiki/Treaty_of_Versailles |
| `treaty-saint-germain-1919` | Treaty of Saint-Germain (1919), Asian and Pacific clauses | Public domain | 1919 | https://en.wikisource.org/wiki/Treaty_of_Saint-Germain-en-Laye |
| `treaty-san-francisco-1951` | Treaty of San Francisco (1951), Japanese territorial clauses | Public domain | 1951 | https://en.wikisource.org/wiki/Treaty_of_San_Francisco |
| `simla-convention-1914` | Simla Convention (1914) and the McMahon Line | Public domain | 1914 | https://en.wikisource.org/wiki/Simla_Convention |
| `project-authored-1900` | Fabric of Nations M11c authored 1900 boundary reconstruction | Project data | 2026 | internal:packages/data/data/historical/m11/boundaries_1900.json |
| `project-authored-m12` | Fabric of Nations M12a/M12b authored provincial partition | Project data | 2026 | internal:scripts/m12/asia-plan.mjs |

## 5. Coverage

Coverage is measured by subtracting each province from its 1900 map polity
polygon, restricted to the Asian coverage scope for the transcontinental Russian
and Ottoman features. The residual is **not** promoted to a duplicate province:
it stays under the 1900 polity fill, whose owner is correct, and is reported
here instead. `estimated` rows are cases where the polygon library could not
complete a large sequential difference; their residual is approximated by area.
Coastal and frontier slivers below a few hundredths of a square degree are
normal at this simplification level.

| Map feature | Scope (deg²) | Covered (deg²) | Residual |
|---|---:|---:|---:|
| AFG | 62.53 | 62.22 | 0.31 |
| BHU | 3.63 | 3.59 | 0.05 |
| BIN | 455.39 | 453.36 | 2.03 |
| BPO | 0.00 | 0.00 | 0.00 |
| BUK | 26.62 | 26.61 | 0.01 |
| CEY | 5.38 | 5.30 | 0.08 (estimated) |
| CHN | 1028.21 | 1025.24 | 2.97 |
| DEI | 151.55 | 149.18 | 2.37 (estimated) |
| FIC | 55.97 | 55.54 | 0.43 (estimated) |
| HKG | 0.09 | 0.07 | 0.02 |
| JPN | 37.90 | 37.06 | 0.84 (estimated) |
| KHI | 26.96 | 26.94 | 0.02 |
| KOR | 22.71 | 22.27 | 0.44 |
| KUW | 1.60 | 1.58 | 0.02 |
| MAC | 0.00 | 0.00 | 0.00 |
| MAL | 14.10 | 13.81 | 0.29 (estimated) |
| NPL | 13.51 | 13.32 | 0.18 |
| OMN | 27.35 | 27.20 | 0.15 |
| OTT | 258.48 | 257.55 | 0.93 |
| PER | 156.07 | 155.56 | 0.52 |
| PHL | 23.98 | 23.21 | 0.78 |
| PTM | 1.23 | 1.19 | 0.05 |
| RUS | 2554.98 | 2554.98 | 0.00 (estimated) |
| SAR | 9.83 | 9.82 | 0.01 |
| SHM | 71.85 | 71.79 | 0.06 |
| THA | 52.88 | 52.49 | 0.39 (estimated) |
| TIB | 107.24 | 107.24 | 0.00 (estimated) |
| TRU | 6.35 | 6.24 | 0.10 |
| TWN | 3.16 | 3.11 | 0.04 |

## 6. Future successor polities

None of these polities is selectable in 1900. They can receive provinces through
an ownership transfer; activation dates are stored as campaign day indices.

| ID | Tag | Historical name | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|
| 1100 | TUR | Republic of Turkey | independent | 1923-10-29 | — | Ankara | high |
| 1101 | HEJ | Kingdom of Hejaz | independent | 1916-06-10 | 1925-12-23 | Mecca | high |
| 1102 | SAU | Kingdom of Saudi Arabia | independent | 1932-09-23 | — | Riyadh | high |
| 1103 | IRQ | Kingdom of Iraq | independent | 1921-08-23 | — | Baghdad | high |
| 1104 | SYR | Syrian Republic | independent | 1920-03-08 | — | Damascus | high |
| 1105 | LBN | State of Greater Lebanon | independent | 1920-09-01 | — | Beirut | high |
| 1106 | JOR | Emirate of Transjordan | independent | 1921-04-11 | — | Amman | high |
| 1107 | ISR | State of Israel | independent | 1948-05-14 | — | Jerusalem | high |
| 1108 | YEM | Mutawakkilite Kingdom of Yemen | independent | 1918-10-30 | — | Sana'a | high |
| 1109 | KWT | State of Kuwait | independent | 1961-06-19 | — | Kuwait City | high |
| 1110 | ARE | United Arab Emirates | independent | 1971-12-02 | — | Abu Dhabi | high |
| 1111 | QAT | State of Qatar | independent | 1971-09-03 | — | Doha | high |
| 1112 | BHR | Kingdom of Bahrain | independent | 1971-08-15 | — | Manama | high |
| 1113 | IND | Dominion of India | independent | 1947-08-15 | — | New Delhi | high |
| 1114 | PAK | Dominion of Pakistan | independent | 1947-08-14 | — | Karachi | high |
| 1115 | BGD | People's Republic of Bangladesh | independent | 1971-03-26 | — | Dhaka | high |
| 1116 | LKA | Dominion of Ceylon | independent | 1948-02-04 | — | Colombo | high |
| 1117 | MMR | Union of Burma | independent | 1948-01-04 | — | Rangoon | high |
| 1118 | MYS | Federation of Malaya | independent | 1957-08-31 | — | Kuala Lumpur | high |
| 1119 | SGP | Republic of Singapore | independent | 1965-08-09 | — | Singapore | high |
| 1120 | IDN | Republic of Indonesia | independent | 1945-08-17 | — | Jakarta | high |
| 1121 | PHL | Republic of the Philippines | independent | 1946-07-04 | — | Manila | high |
| 1122 | VNM | Democratic Republic of Vietnam | independent | 1945-09-02 | — | Hanoi | high |
| 1123 | LAO | Kingdom of Laos | independent | 1949-07-19 | — | Vientiane | high |
| 1124 | KHM | Kingdom of Cambodia | independent | 1953-11-09 | — | Phnom Penh | high |
| 1125 | PRK | Democratic People's Republic of Korea | independent | 1948-09-09 | — | Pyongyang | high |
| 1126 | ROK | Republic of Korea | independent | 1948-08-15 | — | Seoul | high |
| 1127 | MNG | Mongolian People's Republic | independent | 1924-11-26 | — | Ulaanbaatar | high |
| 1128 | TIB | Tibet | independent | 1913-02-13 | — | Lhasa | medium |
| 1129 | ROC | Republic of China | independent | 1912-01-01 | — | Nanjing | high |
| 1130 | PRC | People's Republic of China | independent | 1949-10-01 | — | Beijing | high |
| 1131 | MAN | Manchukuo | independent | 1932-03-01 | 1945-08-18 | Xinjing | medium |
| 1132 | KAZ | Republic of Kazakhstan | independent | 1991-12-16 | — | Almaty | high |
| 1133 | UZB | Republic of Uzbekistan | independent | 1991-08-31 | — | Tashkent | high |
| 1134 | TKM | Turkmenistan | independent | 1991-10-27 | — | Ashgabat | high |
| 1135 | TJK | Republic of Tajikistan | independent | 1991-09-09 | — | Dushanbe | high |
| 1136 | KGZ | Kyrgyz Republic | independent | 1991-08-31 | — | Bishkek | high |
| 1137 | GEO | Democratic Republic of Georgia | independent | 1991-04-09 | — | Tbilisi | high |
| 1138 | ARM | Republic of Armenia | independent | 1991-09-21 | — | Yerevan | high |
| 1139 | AZE | Republic of Azerbaijan | independent | 1991-08-30 | — | Baku | high |
| 1140 | TLS | Democratic Republic of Timor-Leste | independent | 1975-11-28 | — | Dili | high |
| 1141 | BRN | Brunei Darussalam | independent | 1984-01-01 | — | Bandar Seri Begawan | high |
| 1142 | MDV | Republic of Maldives | independent | 1965-07-26 | — | Male | high |
| 1143 | BHU | Kingdom of Bhutan | independent | 1949-08-08 | — | Thimphu | high |
| 1144 | PSE | State of Palestine | independent | 1988-11-15 | — | Ramallah | medium |

## 7. Major historical transfers supported

Reference snapshots are validation references, not forced outcomes. They are
exercised by `packages/tests/src/m12b-asia-provinces.test.ts`.

- **1918–1920**: the Ottoman Arab provinces transfer to the Syrian, Lebanese,
  Iraqi and Transjordanian successor polities; Hejaz and Yemen become
  independent; the Levant and Mesopotamia are administered as French and British
  mandates while legal ownership sits with the local polity; the Dodecanese pass
  to Italy; Tiflis/Kutais/Batum, Erivan/Kars and Baku/Elisavetpol/Zakatala/
  Nakhchivan form Georgia, Armenia and Azerbaijan.
- **1921–1923**: the Republic of Turkey receives the remaining Ottoman Asian
  provinces after Lausanne; Kars, Ardahan, Artvin and Iğdır return from Russia,
  Urfa passes from Syria to Turkey, and Afghan sovereignty over the Wakhan is
  recognised. Hatay remains in Syria.
- **1932–1939**: Manchukuo receives Fengtian, Jilin, Heilongjiang and Xing'an in
  1932 and Rehe in 1933; the Japanese occupation of the lower Yangtze is modelled
  as control without ownership, so a negotiated restoration remains possible;
  Hatay passes from Syria to Turkey in 1939.
- **1945**: Manchukuo is dissolved, Taiwan returns to China, and Chinese
  sovereignty is restored over the mainland.
- **1947–1971**: the Indian provinces split into India, Pakistan and Bangladesh;
  West Punjab, Sind, the North-West Frontier, Baluchistan and Azad Kashmir form
  Pakistan, East Bengal joins Pakistan in 1947 and becomes Bangladesh in 1971,
  and Aksai Chin passes to Chinese administration in 1962.
- **1948–1949**: Korea divides into the DPRK and the Republic of Korea; the
  Republic of China loses the mainland to the People's Republic of China while
  retaining Taiwan.
- **1948–1988**: the Jerusalem province becomes Israel and the Palestine province
  becomes the State of Palestine; both are ordinary ownership transfers.
- **1990–1991**: Kazakhstan, Uzbekistan, Turkmenistan, Tajikistan, Kyrgyzstan,
  Georgia, Armenia and Azerbaijan receive their provinces from the Soviet
  successor state; the Russian core in Siberia remains Russian.

## 8. Province inventory by 1900 owner

### Emirate of Afghanistan (AFG) — 6 provinces

independent; 1900 population estimate 4500000; geometry AFG.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100051 | `as-afg-kabul` | Kabul | Afghan province | Emirate of Afghanistan | medium |
| 100052 | `as-afg-herat` | Herat | Afghan province | Emirate of Afghanistan | medium |
| 100053 | `as-afg-kandahar` | Kandahar | Afghan province | Emirate of Afghanistan | medium |
| 100054 | `as-afg-afghan-turkestan` | Afghan Turkestan | Afghan province | Emirate of Afghanistan | medium |
| 100055 | `as-afg-hazarajat` | Hazarajat | Afghan province | Emirate of Afghanistan | medium |
| 100056 | `as-afg-badakhshan` | Badakhshan | Afghan province | Emirate of Afghanistan | medium |

### Qing Empire (CHN) — 31 provinces

independent; 1900 population estimate 400000000; geometry CHN, MNG.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100072 | `as-chn-zhili` | Zhili | Qing province | Qing Empire | medium |
| 100073 | `as-chn-shandong` | Shandong | Qing province | Qing Empire | medium |
| 100074 | `as-chn-shanxi` | Shanxi | Qing province | Qing Empire | medium |
| 100075 | `as-chn-henan` | Henan | Qing province | Qing Empire | medium |
| 100076 | `as-chn-shaanxi` | Shaanxi | Qing province | Qing Empire | medium |
| 100077 | `as-chn-gansu` | Gansu | Qing province | Qing Empire | medium |
| 100078 | `as-chn-qinghai` | Qinghai | Qing province | Qing Empire | medium |
| 100079 | `as-chn-jiangsu` | Jiangsu | Qing province | Qing Empire | medium |
| 100080 | `as-chn-anhui` | Anhui | Qing province | Qing Empire | medium |
| 100081 | `as-chn-jiangxi` | Jiangxi | Qing province | Qing Empire | medium |
| 100082 | `as-chn-zhejiang` | Zhejiang | Qing province | Qing Empire | medium |
| 100083 | `as-chn-fujian` | Fujian | Qing province | Qing Empire | medium |
| 100084 | `as-chn-hubei` | Hubei | Qing province | Qing Empire | medium |
| 100085 | `as-chn-hunan` | Hunan | Qing province | Qing Empire | medium |
| 100086 | `as-chn-guangdong` | Guangdong | Qing province | Qing Empire | medium |
| 100087 | `as-chn-guangxi` | Guangxi | Qing province | Qing Empire | medium |
| 100088 | `as-chn-sichuan` | Sichuan | Qing province | Qing Empire | medium |
| 100089 | `as-chn-yunnan` | Yunnan | Qing province | Qing Empire | medium |
| 100090 | `as-chn-guizhou` | Guizhou | Qing province | Qing Empire | medium |
| 100091 | `as-chn-xinjiang` | Xinjiang | Qing province | Qing Empire | medium |
| 100092 | `as-chn-fengtian` | Fengtian | Qing province | Qing Empire | medium |
| 100093 | `as-chn-jilin` | Jilin | Qing province | Qing Empire | medium |
| 100094 | `as-chn-heilongjiang` | Heilongjiang | Qing province | Qing Empire | medium |
| 100095 | `as-chn-rehe` | Rehe | Qing province | Qing Empire | low |
| 100096 | `as-chn-xing-an` | Xing'an | Qing province | Qing Empire | low |
| 100097 | `as-chn-inner-mongolia` | Inner Mongolia | Qing province | Qing Empire | medium |
| 100098 | `as-chn-khalkha-mongolia` | Khalkha Mongolia | Qing province | Qing Empire | medium |
| 100099 | `as-chn-western-mongolia` | Western Mongolia | Qing province | Qing Empire | medium |
| 100100 | `as-chn-eastern-and-gobi-mongolia` | Eastern and Gobi Mongolia | Qing province | Qing Empire | medium |
| 100101 | `as-tib-u-tsang` | U-Tsang | Tibetan province grouping | Tibet | medium |
| 100102 | `as-tib-kham` | Kham | Tibetan province grouping | Tibet | low |

### French Republic (FRA) — 6 provinces

independent; 1900 population estimate 38900000; geometry FRA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100209 | `as-fic-tonkin` | Tonkin | French protectorate or colony | French Indochina | medium |
| 100210 | `as-fic-annam` | Annam | French protectorate or colony | French Indochina | medium |
| 100211 | `as-fic-cochinchina` | Cochinchina | French protectorate or colony | French Indochina | medium |
| 100212 | `as-fic-cambodia` | Cambodia | French protectorate or colony | French Indochina | medium |
| 100213 | `as-fic-laos` | Laos | French protectorate or colony | French Indochina | medium |
| 100214 | `as-fic-french-india` | French India | French protectorate or colony | French Indochina | medium |

### United Kingdom of Great Britain and Ireland (GBR) — 44 provinces

independent; 1900 population estimate 41155000; geometry GBR, IRL, IMN, JEY, GGY.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100037 | `as-kuw-kuwait` | Kuwait | British protectorate | Kuwait | high |
| 100038 | `as-tru-trucial-coast` | Trucial Coast | British protectorate | Trucial Coast and Bahrain | medium |
| 100039 | `as-tru-bahrain` | Bahrain | British protectorate | Trucial Coast and Bahrain | medium |
| 100059 | `as-bhu-western-bhutan` | Western Bhutan | British suzerainty | Kingdom of Bhutan | medium |
| 100060 | `as-bhu-eastern-bhutan` | Eastern Bhutan | British suzerainty | Kingdom of Bhutan | medium |
| 100169 | `as-bin-bengal` | Bengal | British Indian province | British India | medium |
| 100170 | `as-bin-eastern-bengal` | Eastern Bengal | British Indian province | British India | medium |
| 100171 | `as-bin-assam` | Assam | British Indian province | British India | medium |
| 100172 | `as-bin-bihar` | Bihar | British Indian province | British India | medium |
| 100173 | `as-bin-orissa` | Orissa | British Indian province | British India | medium |
| 100174 | `as-bin-united-provinces` | United Provinces | British Indian province | British India | medium |
| 100175 | `as-bin-punjab` | Punjab | British Indian province | British India | medium |
| 100176 | `as-bin-west-punjab` | West Punjab | British Indian province | British India | medium |
| 100177 | `as-bin-sind` | Sind | British Indian province | British India | medium |
| 100178 | `as-bin-north-west-frontier` | North-West Frontier | British Indian province | British India | medium |
| 100179 | `as-bin-baluchistan` | Baluchistan | British Indian province | British India | medium |
| 100180 | `as-bin-kashmir` | Kashmir | British Indian province | British India | medium |
| 100181 | `as-bin-azad-kashmir` | Azad Kashmir | British Indian province | British India | low |
| 100182 | `as-bin-aksai-chin` | Aksai Chin | British Indian province | British India | low |
| 100183 | `as-bin-rajputana` | Rajputana | British Indian province | British India | medium |
| 100184 | `as-bin-central-provinces` | Central Provinces | British Indian province | British India | medium |
| 100185 | `as-bin-bombay` | Bombay | British Indian province | British India | medium |
| 100186 | `as-bin-madras` | Madras | British Indian province | British India | medium |
| 100187 | `as-bin-hyderabad` | Hyderabad | British Indian province | British India | high |
| 100188 | `as-bin-mysore` | Mysore | British Indian province | British India | high |
| 100189 | `as-bin-travancore-and-cochin` | Travancore and Cochin | British Indian province | British India | medium |
| 100190 | `as-bin-andaman-and-nicobar` | Andaman and Nicobar | British Indian province | British India | medium |
| 100191 | `as-bin-sikkim` | Sikkim | British Indian province | British India | medium |
| 100192 | `as-bin-burma` | Burma | British Indian province | British India | medium |
| 100193 | `as-bin-shan-states` | Shan States | British Indian province | British India | medium |
| 100194 | `as-bin-frontier-divisions` | Frontier Divisions | British Indian province | British India | medium |
| 100195 | `as-bin-aden` | Aden | British Indian province | British India | medium |
| 100197 | `as-cey-western-ceylon` | Western Ceylon | Ceylonese province grouping | Ceylon | medium |
| 100198 | `as-cey-central-ceylon` | Central Ceylon | Ceylonese province grouping | Ceylon | medium |
| 100199 | `as-cey-northern-ceylon` | Northern Ceylon | Ceylonese province grouping | Ceylon | medium |
| 100200 | `as-cey-southern-ceylon` | Southern Ceylon | Ceylonese province grouping | Ceylon | medium |
| 100201 | `as-mal-straits-settlements` | Straits Settlements | British Malayan state grouping | British Malaya | medium |
| 100202 | `as-mal-federated-malay-states` | Federated Malay States | British Malayan state grouping | British Malaya | medium |
| 100203 | `as-mal-johor` | Johor | British Malayan state grouping | British Malaya | medium |
| 100204 | `as-mal-british-north-borneo` | British North Borneo | British Malayan state grouping | British Malaya | medium |
| 100205 | `as-mal-brunei` | Brunei | British Malayan state grouping | British Malaya | medium |
| 100206 | `as-sar-sarawak` | Sarawak | British protectorate | Raj of Sarawak | medium |
| 100207 | `as-hkg-hong-kong` | Hong Kong | British crown colony | Hong Kong | high |
| 100239 | `as-bpo-maldives` | Maldives | British protectorate | Maldives | medium |

### Empire of Japan (JPN) — 12 provinces

independent; 1900 population estimate 44103000; geometry JPN.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100112 | `as-jpn-kanto` | Kanto | Japanese region | Empire of Japan | high |
| 100113 | `as-jpn-chubu` | Chubu | Japanese region | Empire of Japan | high |
| 100114 | `as-jpn-kansai` | Kansai | Japanese region | Empire of Japan | high |
| 100115 | `as-jpn-chugoku` | Chugoku | Japanese region | Empire of Japan | high |
| 100116 | `as-jpn-shikoku` | Shikoku | Japanese region | Empire of Japan | high |
| 100117 | `as-jpn-kyushu` | Kyushu | Japanese region | Empire of Japan | high |
| 100118 | `as-jpn-tohoku` | Tohoku | Japanese region | Empire of Japan | high |
| 100119 | `as-jpn-hokkaido` | Hokkaido | Japanese region | Empire of Japan | high |
| 100120 | `as-jpn-ryukyu` | Ryukyu | Japanese region | Empire of Japan | high |
| 100121 | `as-twn-taihoku` | Taihoku | Taiwanese prefecture grouping | Taiwan | medium |
| 100122 | `as-twn-taichung` | Taichung | Taiwanese prefecture grouping | Taiwan | medium |
| 100123 | `as-twn-tainan` | Tainan | Taiwanese prefecture grouping | Taiwan | medium |

### Korean Empire (KOR) — 9 provinces

independent; 1900 population estimate 17000000; geometry KOR, PRK.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100103 | `as-kor-hamgyong` | Hamgyong | Korean province | Korean Empire | medium |
| 100104 | `as-kor-pyongan` | Pyongan | Korean province | Korean Empire | medium |
| 100105 | `as-kor-hwanghae` | Hwanghae | Korean province | Korean Empire | medium |
| 100106 | `as-kor-gangwon` | Gangwon | Korean province | Korean Empire | medium |
| 100107 | `as-kor-north-kangwon` | North Kangwon | Korean province | Korean Empire | medium |
| 100108 | `as-kor-gyeonggi` | Gyeonggi | Korean province | Korean Empire | medium |
| 100109 | `as-kor-chungcheong` | Chungcheong | Korean province | Korean Empire | medium |
| 100110 | `as-kor-jeolla` | Jeolla | Korean province | Korean Empire | medium |
| 100111 | `as-kor-gyeongsang` | Gyeongsang | Korean province | Korean Empire | medium |

### Kingdom of the Netherlands (NLD) — 18 provinces

independent; 1900 population estimate 5100000; geometry NLD.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100215 | `as-dei-west-java` | West Java | Dutch administrative region | Dutch East Indies | medium |
| 100216 | `as-dei-central-java` | Central Java | Dutch administrative region | Dutch East Indies | medium |
| 100217 | `as-dei-east-java` | East Java | Dutch administrative region | Dutch East Indies | medium |
| 100218 | `as-dei-aceh` | Aceh | Dutch administrative region | Dutch East Indies | medium |
| 100219 | `as-dei-north-sumatra` | North Sumatra | Dutch administrative region | Dutch East Indies | medium |
| 100220 | `as-dei-west-sumatra` | West Sumatra | Dutch administrative region | Dutch East Indies | medium |
| 100221 | `as-dei-riau-and-jambi` | Riau and Jambi | Dutch administrative region | Dutch East Indies | medium |
| 100222 | `as-dei-south-sumatra` | South Sumatra | Dutch administrative region | Dutch East Indies | medium |
| 100223 | `as-dei-west-borneo` | West Borneo | Dutch administrative region | Dutch East Indies | medium |
| 100224 | `as-dei-central-borneo` | Central Borneo | Dutch administrative region | Dutch East Indies | medium |
| 100225 | `as-dei-south-and-east-borneo` | South and East Borneo | Dutch administrative region | Dutch East Indies | medium |
| 100226 | `as-dei-north-sulawesi` | North Sulawesi | Dutch administrative region | Dutch East Indies | medium |
| 100227 | `as-dei-central-sulawesi` | Central Sulawesi | Dutch administrative region | Dutch East Indies | medium |
| 100228 | `as-dei-south-sulawesi` | South Sulawesi | Dutch administrative region | Dutch East Indies | medium |
| 100229 | `as-dei-moluccas` | Moluccas | Dutch administrative region | Dutch East Indies | medium |
| 100230 | `as-dei-bali-and-lombok` | Bali and Lombok | Dutch administrative region | Dutch East Indies | medium |
| 100231 | `as-dei-timor-and-flores` | Timor and Flores | Dutch administrative region | Dutch East Indies | medium |
| 100232 | `as-dei-new-guinea` | New Guinea | Dutch administrative region | Dutch East Indies | medium |

### Kingdom of Nepal (NPL) — 2 provinces

independent; 1900 population estimate 5000000; geometry NPL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100057 | `as-npl-western-nepal` | Western Nepal | Nepalese province grouping | Kingdom of Nepal | medium |
| 100058 | `as-npl-eastern-nepal` | Eastern Nepal | Nepalese province grouping | Kingdom of Nepal | medium |

### Sultanate of Muscat and Oman (OMN) — 3 provinces

independent; 1900 population estimate 500000; geometry OMN.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100034 | `as-omn-muscat` | Muscat | Omani province | Sultanate of Muscat and Oman | medium |
| 100035 | `as-omn-dhofar` | Dhofar | Omani province | Sultanate of Muscat and Oman | medium |
| 100036 | `as-omn-gwadar` | Gwadar | Omani province | Sultanate of Muscat and Oman | low |

### Ottoman Empire (OTT) — 30 provinces

independent; 1900 population estimate 24000000; geometry TUR, SYR, LBN, ISR, PSX, JOR, IRQ, SAU, YEM, QAT, ALB, MKD, KOS.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100001 | `as-ott-hudavendigar` | Hudavendigar | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100002 | `as-ott-aydin` | Aydin | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100003 | `as-ott-konya` | Konya | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100004 | `as-ott-ankara` | Ankara | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100005 | `as-ott-kastamonu` | Kastamonu | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100006 | `as-ott-sivas` | Sivas | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100007 | `as-ott-trabzon` | Trabzon | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100008 | `as-ott-erzurum` | Erzurum | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100009 | `as-ott-van` | Van | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100010 | `as-ott-bitlis` | Bitlis | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100011 | `as-ott-diyarbekir` | Diyarbekir | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100012 | `as-ott-mamuret-ul-aziz` | Mamuret-ul-Aziz | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100013 | `as-ott-adana` | Adana | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100014 | `as-ott-hatay` | Hatay | Ottoman vilayet grouping | Ottoman Asia | low |
| 100015 | `as-ott-aleppo` | Aleppo | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100016 | `as-ott-urfa` | Urfa | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100017 | `as-ott-lebanon` | Lebanon | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100018 | `as-ott-syrian-coast` | Syrian Coast | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100019 | `as-ott-damascus` | Damascus | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100020 | `as-ott-jerusalem` | Jerusalem | Ottoman vilayet grouping | Ottoman Asia | low |
| 100021 | `as-ott-palestine` | Palestine | Ottoman vilayet grouping | Ottoman Asia | low |
| 100022 | `as-ott-transjordan` | Transjordan | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100023 | `as-ott-baghdad` | Baghdad | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100024 | `as-ott-basra` | Basra | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100025 | `as-ott-mosul` | Mosul | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100026 | `as-ott-hejaz` | Hejaz | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100027 | `as-ott-yemen` | Yemen | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100028 | `as-ott-asir` | Asir | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100029 | `as-ott-al-hasa` | Al-Hasa | Ottoman vilayet grouping | Ottoman Asia | medium |
| 100030 | `as-ott-dodecanese` | Dodecanese | Ottoman vilayet grouping | Ottoman Asia | low |

### Sublime State of Persia (PER) — 11 provinces

independent; 1900 population estimate 9900000; geometry IRN.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100040 | `as-per-azerbaijan` | Azerbaijan | Qajar province | Qajar Persia | medium |
| 100041 | `as-per-gilan` | Gilan | Qajar province | Qajar Persia | medium |
| 100042 | `as-per-mazandaran` | Mazandaran | Qajar province | Qajar Persia | medium |
| 100043 | `as-per-khorasan` | Khorasan | Qajar province | Qajar Persia | medium |
| 100044 | `as-per-kerman` | Kerman | Qajar province | Qajar Persia | medium |
| 100045 | `as-per-sistan` | Sistan | Qajar province | Qajar Persia | medium |
| 100046 | `as-per-fars` | Fars | Qajar province | Qajar Persia | medium |
| 100047 | `as-per-isfahan` | Isfahan | Qajar province | Qajar Persia | medium |
| 100048 | `as-per-kermanshah` | Kermanshah | Qajar province | Qajar Persia | medium |
| 100049 | `as-per-tehran` | Tehran | Qajar province | Qajar Persia | medium |
| 100050 | `as-per-khuzestan` | Khuzestan | Qajar province | Qajar Persia | medium |

### Kingdom of Portugal (PRT) — 3 provinces

independent; 1900 population estimate 5400000; geometry PRT.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100196 | `as-bin-goa` | Goa | Portuguese colony | Portuguese India | low |
| 100208 | `as-mac-macao` | Macao | Portuguese colony | Macao | high |
| 100238 | `as-ptm-timor` | Timor | Portuguese colony | Portuguese Timor | medium |

### Russian Empire (RUS) — 45 provinces

independent; 1900 population estimate 133300000; geometry RUS, EST, LVA, LTU, BLR, UKR, MDA, GEO, ARM, AZE, KAZ, UZB, TKM, TJK, KGZ, POL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100124 | `as-rus-tiflis` | Tiflis | Russian governorate or oblast | Caucasus | medium |
| 100125 | `as-rus-kutais` | Kutais | Russian governorate or oblast | Caucasus | medium |
| 100126 | `as-rus-batum` | Batum | Russian governorate or oblast | Caucasus | medium |
| 100127 | `as-rus-artvin` | Artvin | Russian governorate or oblast | Caucasus | low |
| 100128 | `as-rus-kars` | Kars | Russian governorate or oblast | Caucasus | low |
| 100129 | `as-rus-erivan` | Erivan | Russian governorate or oblast | Caucasus | medium |
| 100130 | `as-rus-igdir` | Igdir | Russian governorate or oblast | Caucasus | low |
| 100131 | `as-rus-baku` | Baku | Russian governorate or oblast | Caucasus | medium |
| 100132 | `as-rus-elisavetpol` | Elisavetpol | Russian governorate or oblast | Caucasus | medium |
| 100133 | `as-rus-zakatala` | Zakatala | Russian governorate or oblast | Caucasus | medium |
| 100134 | `as-rus-nakhchivan` | Nakhchivan | Russian governorate or oblast | Caucasus | medium |
| 100135 | `as-rus-uralsk` | Uralsk | Russian oblast | Turkestan | medium |
| 100136 | `as-rus-turgai` | Turgai | Russian oblast | Turkestan | medium |
| 100137 | `as-rus-akmolinsk` | Akmolinsk | Russian oblast | Turkestan | medium |
| 100138 | `as-rus-semipalatinsk` | Semipalatinsk | Russian oblast | Turkestan | medium |
| 100139 | `as-rus-semirechye` | Semirechye | Russian oblast | Turkestan | medium |
| 100140 | `as-rus-kazakh-syr-darya` | Kazakh Syr-Darya | Russian oblast | Turkestan | medium |
| 100141 | `as-rus-uzbek-syr-darya` | Uzbek Syr-Darya | Russian oblast | Turkestan | medium |
| 100142 | `as-rus-fergana` | Fergana | Russian oblast | Turkestan | medium |
| 100143 | `as-rus-osh` | Osh | Russian oblast | Turkestan | medium |
| 100144 | `as-rus-samarkand` | Samarkand | Russian oblast | Turkestan | medium |
| 100145 | `as-rus-khojand` | Khojand | Russian oblast | Turkestan | low |
| 100146 | `as-rus-transcaspia` | Transcaspia | Russian oblast | Turkestan | medium |
| 100147 | `as-rus-kyrgyz-steppe` | Kyrgyz Steppe | Russian oblast | Turkestan | medium |
| 100148 | `as-rus-pamir` | Pamir | Russian oblast | Turkestan | low |
| 100149 | `as-rus-wakhan` | Wakhan | Russian oblast | Turkestan | low |
| 100150 | `as-rus-tobolsk` | Tobolsk | Russian governorate or oblast | Siberia | medium |
| 100151 | `as-rus-omsk` | Omsk | Russian governorate or oblast | Siberia | medium |
| 100152 | `as-rus-tomsk` | Tomsk | Russian governorate or oblast | Siberia | medium |
| 100153 | `as-rus-altai` | Altai | Russian governorate or oblast | Siberia | medium |
| 100154 | `as-rus-yeniseysk` | Yeniseysk | Russian governorate or oblast | Siberia | medium |
| 100155 | `as-rus-irkutsk` | Irkutsk | Russian governorate or oblast | Siberia | medium |
| 100156 | `as-rus-transbaikal` | Transbaikal | Russian governorate or oblast | Siberia | medium |
| 100157 | `as-rus-yakutsk` | Yakutsk | Russian governorate or oblast | Siberia | medium |
| 100158 | `as-rus-amur` | Amur | Russian governorate or oblast | Siberia | medium |
| 100159 | `as-rus-primorye` | Primorye | Russian governorate or oblast | Siberia | medium |
| 100160 | `as-rus-khabarovsk` | Khabarovsk | Russian governorate or oblast | Siberia | medium |
| 100161 | `as-rus-sakhalin` | Sakhalin | Russian governorate or oblast | Siberia | medium |
| 100162 | `as-rus-kamchatka` | Kamchatka | Russian governorate or oblast | Siberia | medium |
| 100163 | `as-rus-uriankhai` | Uriankhai | Russian governorate or oblast | Siberia | medium |
| 100164 | `as-khi-khiva` | Khiva | Russian protectorate | Khanate of Khiva | medium |
| 100165 | `as-khi-tashauz` | Tashauz | Russian protectorate | Khanate of Khiva | medium |
| 100166 | `as-khi-karakalpak` | Karakalpak | Russian protectorate | Khanate of Khiva | medium |
| 100167 | `as-buk-bukhara` | Bukhara | Russian protectorate | Emirate of Bukhara | medium |
| 100168 | `as-buk-eastern-bukhara` | Eastern Bukhara | Russian protectorate | Emirate of Bukhara | medium |

### Emirate of Jabal Shammar (Ha'il) (SHM) — 3 provinces

independent; 1900 population estimate 1000000; geometry adm1:SA-01, adm1:SA-05, adm1:SA-06, adm1:SA-08, adm1:SA-12.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100031 | `as-shm-ha-il` | Ha'il | Rashidi emirate | Emirate of Jabal Shammar | medium |
| 100032 | `as-shm-riyadh` | Riyadh | Rashidi emirate | Emirate of Jabal Shammar | medium |
| 100033 | `as-shm-northern-arabia` | Northern Arabia | Rashidi emirate | Emirate of Jabal Shammar | medium |

### Kingdom of Siam (THA) — 11 provinces

independent; 1900 population estimate 7300000; geometry THA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100061 | `as-tha-bangkok` | Bangkok | Siamese monthon grouping | Kingdom of Siam | medium |
| 100062 | `as-tha-nakhon-sawan` | Nakhon Sawan | Siamese monthon grouping | Kingdom of Siam | medium |
| 100063 | `as-tha-phitsanulok` | Phitsanulok | Siamese monthon grouping | Kingdom of Siam | medium |
| 100064 | `as-tha-nakhon-ratchasima` | Nakhon Ratchasima | Siamese monthon grouping | Kingdom of Siam | medium |
| 100065 | `as-tha-nakhon-si-thammarat` | Nakhon Si Thammarat | Siamese monthon grouping | Kingdom of Siam | medium |
| 100066 | `as-tha-chanthaburi` | Chanthaburi | Siamese monthon grouping | Kingdom of Siam | medium |
| 100067 | `as-tha-inner-cambodia` | Inner Cambodia | Siamese monthon grouping | Kingdom of Siam | medium |
| 100068 | `as-tha-kedah-and-perlis` | Kedah and Perlis | Siamese monthon grouping | Kingdom of Siam | medium |
| 100069 | `as-tha-kelantan` | Kelantan | Siamese monthon grouping | Kingdom of Siam | medium |
| 100070 | `as-tha-terengganu` | Terengganu | Siamese monthon grouping | Kingdom of Siam | medium |
| 100071 | `as-tha-xaignabouri` | Xaignabouri | Siamese monthon grouping | Kingdom of Siam | medium |

### United States of America (USA) — 5 provinces

independent; 1900 population estimate 76094000; geometry USA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 100233 | `as-phl-manila-and-central-luzon` | Manila and Central Luzon | United States insular territory | Philippine Islands | medium |
| 100234 | `as-phl-northern-luzon` | Northern Luzon | United States insular territory | Philippine Islands | medium |
| 100235 | `as-phl-visayas` | Visayas | United States insular territory | Philippine Islands | medium |
| 100236 | `as-phl-palawan` | Palawan | United States insular territory | Philippine Islands | medium |
| 100237 | `as-phl-mindanao-and-sulu` | Mindanao and Sulu | United States insular territory | Philippine Islands | medium |


## 9. Asia-specific assumptions and limitations

- **Admin-1 proxies.** Modern first-level units are proxies for 1900
  administrative boundaries. Ottoman vilayets, Qing provinces, Indian
  presidencies and princely states, Japanese regions, Korean provinces and
  Siamese monthon are grouped from modern units; the grouping is labelled low or
  medium confidence where the modern unit does not match the historical unit.
- **Successor-border splits.** Several 1900 provinces are deliberately split into
  two or three permanent provinces so a later successor frontier can be formed
  without moving a polygon: Indian/West Punjab; Indian/Azad/Aksai Chin Kashmir;
  Lebanon/Syrian Coast; Aleppo/Urfa; Hatay; Jerusalem/Palestine; South/North
  Gangwon; Batum/Artvin; Erivan/Iğdır; Kars; Kazakh/Uzbek Syr-Darya;
  Fergana/Osh; Samarkand/Khojand; Pamir/Wakhan; and Khiva/Tashauz. The split
  lines follow modern first-level units or the 1900 M11c frontier and are
  labelled low confidence; they are the mechanism that makes the 1947-1991
  successor borders representable at all.
- **Manchuria.** Fengtian, Jilin, Heilongjiang, Rehe and Xing'an are the
  Qing/Manchukuo-scale provinces. Rehe and Xing'an follow authored historical
  lines through modern Hebei, Liaoning and Inner Mongolia because Natural Earth
  has no Chinese prefecture-level blocks. Manchukuo can therefore be formed with
  its 1932 core (Fengtian, Jilin, Heilongjiang, Xing'an) plus Rehe from 1933.
  The Republic of China's nine 1945 Northeast provinces and Manchukuo's later
  internal provinces are not separately represented; the five provinces remain
  transferable to the ROC and PRC.
- **Siam's 1907/1909 losses.** Inner Cambodia (Battambang, Siem Reap, Sisophon),
  Xaignabouri, Kedah, Perlis, Kelantan and Terengganu are Siamese provinces in
  1900 and become French or British through later transfers. The modern units
  are clipped to the 1900 Siamese polygon.
- **Gwadar.** The Omani enclave on the Makran coast is a low-confidence Omani
  province clipped to the Omani 1900 polygon; the rest of modern Baluchistan is
  British.
- **Dodecanese.** Rhodes and the Dodecanese are Ottoman in 1900, occupied by
  Italy in 1912 and transferred to Italy in the reference snapshot.
- **Pamir/Wakhan and Tuva.** The M11c Russian, Afghan and Chinese frontiers in the
  Pamir and the Uriankhai region are approximations. The Pamir province is
  clipped to the Russian 1900 polygon and labelled low confidence; Tuva is
  represented as a Siberian province in the 1900 model.
- **Taiwan's offshore islands.** Kinmen is included in the Japanese Taiwan
  polygon in the M11c map even though it remained Chinese in 1900; it is carried
  in the Taihoku province with low confidence.
- **Portuguese and French India.** Goa/Daman/Diu and Pondicherry are separate
  Portuguese and French provinces inside the British Indian and French Indochina
  map features; their simulation-region reference is the nearest available
  Portuguese/French aggregate.
- **Coverage slivers.** The residual reported in §5 is the sum of many small
  coastal and frontier slivers, not a single missing province. Because the
  residual stays under the correct 1900 owner's polity fill it never appears as
  a foreign-coloured enclave. The build audit lists every unassigned unit and
  every province code whose label point falls outside its map feature.
- **Population/economy.** Province-level population and production are not
  redistributed; provinces reference the existing simulation regions and the
  1900 starting conditions are unchanged.
- **Save compatibility.** The world schema, save envelope and snapshot protocol
  are unchanged. The combined catalogue is additive: an M12a-era save contains
  only the 570 European ownership records, so its Asian provinces have no
  mutable record until a new campaign is started. The project keeps its strict
  same-version save policy.

## 10. Build and verification commands

```
node scripts/m12/build-provinces.mjs
node scripts/m12b/build-asia-provinces.mjs
node scripts/m12b/generate-asia-doc.mjs
pnpm -F @century/app typecheck
pnpm -F @century/tests test -- m12b-asia-provinces
pnpm -F @century/app export:web
node scripts/m12b/playtest-screenshot-asia.mjs
```
