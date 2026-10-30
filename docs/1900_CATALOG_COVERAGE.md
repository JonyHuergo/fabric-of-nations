# 1900 catalog coverage audit

Reference date: **1 January 1900**. This document reconciles the researched
inventory of the world's states and relevant political entities against the
canonical Century catalog (`packages/data/data/historical/m11/polities_1900.json`).
It is an authored historical audit, not a copy of a modern country list.

## 1. Method and sources

The inventory was assembled by region from multiple independent references and
then checked against the catalog:

- **Gleditsch–Ward / Correlates of War** independent-state tradition, as
  documented by **CShapes 2.0** (Schvitz et al. 2022), used as a classification
  cross-check only. CShapes is not redistributed.
- **Encyclopaedia Britannica, 11th edition (1910–1911)**, contemporaneous
  country articles for Austria-Hungary, Sokoto, Wadai, Darfur, Jabal Shammar,
  Crete, Tonga, Tibet, Khiva, Bukhara, Sarawak and the other states.
- **Our World in Data** long-run population series and the **Maddison Project
  Database 2023** for rounded 1900 population totals.
- **Natural Earth 1:50m and 1:10m** cultural vectors for map geometry, with an
  explicit 1900 crosswalk and the M11c historical transfers; boundary
  provenance, confidence and residual limitations are recorded in
  `docs/HISTORICAL_MAP_PROVENANCE.md`.
- Modern country lists were used only to check that no region had been skipped.
  They were never used to define 1900 statehood.

Classification categories:

| Code | Meaning | Selectable |
|---|---|---|
| `independent` | No superior power; includes de facto states with limited recognition (noted per entry) | yes |
| `personal-union` | Separate state institutions under a shared crown (Norway–Sweden) | yes |
| `autonomous-vassal` | Self-governing but tributary/suzerain (Bulgaria, Crete) | yes |
| `dominion` | Self-governing colony with responsible government (Canada, Australia, New Zealand) | yes |
| `occupation` | Recognised government under foreign military occupation (Cuba) | no |
| `protectorate` | Local ruler under a protecting power's foreign-affairs control | no |
| `colony` | Administered dependency without sovereign status | no |
| `autonomous-province` | Autonomous province under suzerainty (Egypt, Finland, Tibet) | no |
| `dependency` | Dependency without separate sovereignty (Iceland, Greenland, Faroes) | no |

## 2. Reconciliation summary

| Measure | Count |
|---|---:|
| Independent sovereign countries identified for 1 January 1900 (`independent` status) | **60** |
| Independent countries already present in the M11 catalog | **54** |
| Independent countries added in M11b | **6** |
| Other self-governing/autonomous states already present (Bulgaria, Norway, Canada, Australia, New Zealand, Cuba) | **6** |
| Other self-governing/autonomous states added (Crete) | **1** |
| Additional dependent/protectorate entities added (Tibet, Khiva, Bukhara, Sarawak) | **4** |
| Final state-tier polities | **67** |
| Final dependent territories | **66** |
| **Final catalogued polities** | **133** |
| Final documented markets | **20** |
| Final selectable states | **66** |

The 60 independent entries include four de facto or partially recognised
states — Sokoto, Wadai, Darfur and Jabal Shammar — which are explicitly marked
in their notes. They are counted as independent because they exercised
meaningful independent government on the reference date; their recognition was
limited. Transvaal and the Orange Free State were internationally recognised
republics at war with Britain and were already present.

## 3. Independent sovereign countries on 1 January 1900

Status `independent` unless noted. “Present before M11b” means the polity was
already in the M11 catalog with the same stable ID.

### Europe

| Polity (tag) | ID | Present before M11b? | Capital | 1900 notes | Primary sources |
|---|---:|:---:|---|---|---|
| Andorra (AND) | 24 | yes | Andorra la Vella | Co-principality under the French president and the Bishop of Urgell | EB11 “Andorra”; CShapes/COW |
| Austria-Hungary (AUT) | 60 | **added** | Vienna / Budapest | Dual monarchy; separate Austrian and Hungarian governments and parliaments, joint foreign/defence/finance; Bosnia jointly administered | EB11 “Austria-Hungary”; CShapes/COW |
| Belgium (BEL) | 10 | yes | Brussels | Constitutional monarchy; neutrality guaranteed 1839 | EB11 “Belgium” |
| Denmark (DNK) | 14 | yes | Copenhagen | Constitutional monarchy; Iceland a dependency | EB11 “Denmark” |
| France (FRA) | 3 | yes | Paris | Third Republic; large colonial empire | EB11 “France” |
| German Empire (DEU) | 2 | yes | Berlin | Federal constitutional monarchy; colonies | EB11 “Germany” |
| Greece (GRC) | 15 | yes | Athens | Kingdom; Crete autonomous under Ottoman suzerainty | EB11 “Greece” |
| Italy (ITA) | 6 | yes | Rome | Kingdom; Eritrea and Somaliland colonies | EB11 “Italy” |
| Liechtenstein (LIE) | 25 | yes | Vaduz | Principality; close customs ties to Austria-Hungary | EB11 “Liechtenstein” |
| Luxembourg (LUX) | 21 | yes | Luxembourg | Grand duchy; personal union with the Netherlands ended in 1890; customs union with Germany | EB11 “Luxembourg” |
| Monaco (MCO) | 22 | yes | Monaco | Principality under French protection | EB11 “Monaco” |
| Montenegro (MNT) | 17 | yes | Cetinje | Principality; independent since 1878 | EB11 “Montenegro” |
| Netherlands (NLD) | 9 | yes | Amsterdam / The Hague | Constitutional monarchy; colonial empire | EB11 “Netherlands” |
| Ottoman Empire (OTT) | 20 | yes | Constantinople | Transcontinental empire; nominal suzerainty over Bulgaria, Crete, Egypt and parts of Arabia | EB11 “Turkey” |
| Portugal (PRT) | 8 | yes | Lisbon | Constitutional monarchy; African and Asian colonies | EB11 “Portugal” |
| Romania (ROM) | 18 | yes | Bucharest | Kingdom since 1881 | EB11 “Roumania” |
| Russian Empire (RUS) | 4 | yes | St Petersburg | Autocracy; Finland autonomous; Central Asian protectorates | EB11 “Russia” |
| San Marino (SMR) | 23 | yes | San Marino | Republic under Italian protection | EB11 “San Marino” |
| Serbia (SRB) | 16 | yes | Belgrade | Kingdom since 1882 | EB11 “Servia” |
| Spain (ESP) | 7 | yes | Madrid | Restoration monarchy; Cuba, Puerto Rico and the Philippines lost in 1898; African colonies remain | EB11 “Spain” |
| Sweden (SWE) | 12 | yes | Stockholm | Personal union with Norway until 1905; union badge on the flag | EB11 “Sweden” |
| Switzerland (CHE) | 11 | yes | Bern | Federal republic; neutrality | EB11 “Switzerland” |
| United Kingdom (GBR) | 1 | yes | London | Constitutional monarchy; largest colonial empire | EB11 “United Kingdom” |

Non-independent European state: **Bulgaria (BGR)** is an autonomous vassal of the
Ottoman Empire (selectable, `autonomous-vassal`); **Norway (NOR)** is a separate
kingdom in personal union with Sweden (`personal-union`); **Crete (CRT)** is an
autonomous state under Ottoman suzerainty (`autonomous-vassal`, added).

### Asia

| Polity (tag) | ID | Present before M11b? | Capital | 1900 notes | Primary sources |
|---|---:|:---:|---|---|---|
| Afghanistan (AFG) | 29 | yes | Kabul | Emirate; foreign affairs contested by Britain and Russia | EB11 “Afghanistan” |
| China / Qing Empire (CHN) | 26 | yes | Peking | Qing dynasty; Tibet, Xinjiang and Mongolia under Qing suzerainty | EB11 “China” |
| Japan (JPN) | 5 | yes | Tokyo | Empire; Taiwan colony since 1895 | EB11 “Japan” |
| Korea (KOR) | 27 | yes | Seoul | Korean Empire (1897–1910); increasingly under Japanese influence | EB11 “Korea” |
| Nepal (NPL) | 30 | yes | Kathmandu | Independent kingdom; close British relationship | EB11 “Nepal” |
| Oman / Muscat and Oman (OMN) | 32 | yes | Muscat | Sultanate; British treaty relationship, not a colony | EB11 “Oman” |
| Persia (PER) | 28 | yes | Tehran | Qajar monarchy; British and Russian spheres of influence | EB11 “Persia” |
| Siam (THA) | 31 | yes | Bangkok | Independent kingdom; buffer between British and French empires | EB11 “Siam” |
| Jabal Shammar / Ha'il (SHM) | 65 | **added** | Ha'il | Rashidi emirate, de facto independent in Najd, nominally Ottoman; limited recognition | EB11 “Jebel Shammar”; CShapes/COW |

Non-independent Asian entities added as territories: **Tibet (TIB)** under Qing
suzerainty (`autonomous-province`, sovereign CHN); **Khiva (KHI)** and
**Bukhara (BUK)** as Russian protectorates; **Sarawak (SAR)** as a British
protectorate. Bhutan, Kuwait, the Trucial States and British Malaya were
already represented as dependencies.

### Africa

| Polity (tag) | ID | Present before M11b? | Capital | 1900 notes | Primary sources |
|---|---:|:---:|---|---|---|
| Ethiopia (ETH) | 33 | yes | Addis Ababa | Ethiopian Empire; defeated Italy at Adwa in 1896 | EB11 “Abyssinia” |
| Liberia (LBR) | 34 | yes | Monrovia | Republic; close United States relationship | EB11 “Liberia” |
| Morocco (MAR) | 35 | yes | Fez | Alaouite sultanate; European spheres of influence, still independent | EB11 “Morocco” |
| Orange Free State (ORF) | 37 | yes | Bloemfontein | Boer republic; at war with Britain on 1 January 1900 | EB11 “Orange Free State” |
| South African Republic / Transvaal (ZAR) | 36 | yes | Pretoria | Boer republic; at war with Britain on 1 January 1900 | EB11 “Transvaal” |
| Sokoto Caliphate (SOK) | 62 | **added** | Sokoto | Fulani Islamic caliphate; de facto independent, limited recognition; conquered by Britain in 1903 | EB11 “Sokoto”; CShapes/COW |
| Sultanate of Wadai (WAD) | 63 | **added** | Abéché | Sahelian sultanate; independent until French conquest 1909–1911; limited recognition | EB11 “Wadai”; CShapes/COW |
| Sultanate of Darfur (DAR) | 64 | **added** | El Fasher | Independent western Sudanese sultanate until 1916; limited recognition | EB11 “Darfur”; CShapes/COW |

Egypt (EGY) was an autonomous Ottoman province under British occupation and is
modelled as a non-selectable territory, not an independent country. The
Anglo-Egyptian Sudan was a condominium. The Boer republics are counted as
independent despite the war.

### Americas

| Polity (tag) | ID | Present before M11b? | Capital | 1900 notes | Primary sources |
|---|---:|:---:|---|---|---|
| United States (USA) | 0 | yes | Washington, D.C. | Federal republic; 45-star flag; Cuba under US occupation | EB11 “United States” |
| Mexico (MEX) | 38 | yes | Mexico City | Porfiriato; long diáz-era stability | EB11 “Mexico” |
| Guatemala (GUA) | 39 | yes | Guatemala City | Liberal republic | EB11 “Guatemala” |
| Honduras (HON) | 40 | yes | Tegucigalpa | Republic | EB11 “Honduras” |
| El Salvador (SAL) | 41 | yes | San Salvador | Republic | EB11 “Salvador” |
| Nicaragua (NIC) | 42 | yes | Managua | Republic | EB11 “Nicaragua” |
| Costa Rica (COS) | 43 | yes | San José | Republic | EB11 “Costa Rica” |
| Colombia (COL) | 44 | yes | Bogotá | Republic; Panama a department until 1903 | EB11 “Colombia” |
| Venezuela (VEN) | 45 | yes | Caracas | Republic; 1863–1905 flag with seven stars | EB11 “Venezuela” |
| Ecuador (ECU) | 46 | yes | Quito | Republic; plain civil tricolour on 1 January 1900 | EB11 “Ecuador” |
| Peru (PRU) | 47 | yes | Lima | Republic; state flag with arms | EB11 “Peru” |
| Bolivia (BOL) | 48 | yes | Sucre / La Paz | Republic | EB11 “Bolivia” |
| Chile (CHL) | 49 | yes | Santiago | Republic | EB11 “Chile” |
| Argentina (ARG) | 50 | yes | Buenos Aires | Republic; Sun of May flag | EB11 “Argentine Republic” |
| Uruguay (URY) | 51 | yes | Montevideo | Republic | EB11 “Uruguay” |
| Paraguay (PRY) | 52 | yes | Asunción | Republic | EB11 “Paraguay” |
| Brazil (BRA) | 53 | yes | Rio de Janeiro | Republic; 1889–1960 flag | EB11 “Brazil” |
| Haiti (HTI) | 54 | yes | Port-au-Prince | Republic | EB11 “Haiti” |
| Dominican Republic (DOM) | 55 | yes | Santo Domingo | Republic | EB11 “Santo Domingo” |

Cuba (CUB) was under United States military occupation and is a non-selectable
state with `occupation` status, not counted among the 60 independent entries.

### Oceania

| Polity (tag) | ID | Present before M11b? | Capital | 1900 notes | Primary sources |
|---|---:|:---:|---|---|---|
| Tonga (TON) | 61 | **added** | Nuku'alofa | Independent kingdom under the 1875 constitution; British protectorate from 18 May 1900, so independent on 1 January 1900 | EB11 “Tonga”; CShapes/COW |

Canada, Australia and New Zealand are self-governing dominions, not sovereign
states in 1900; they are selectable `dominion` states. Newfoundland is a
non-selectable dominion territory.

## 4. New polities and their integration

| Polity (tag) | ID | Kind | Status | Sovereign | Capital | Map integration |
|---|---:|---|---|---|---|---|
| Austria-Hungary (AUT) | 60 | state | independent | — | Vienna / Budapest | Polygon: modern Austria, Hungary, Czechia, Slovakia, Slovenia, Croatia and Bosnia plus reconstructed Galicia, Bukovina, Transylvania, Banat, Vojvodina, South Tyrol, Trieste/Gorizia, Kotor and Cieszyn Silesia |
| Tonga (TON) | 61 | state | independent | — | Nuku'alofa | Polygon from the modern Tongan archipelago; the islands are not disputed |
| Sokoto Caliphate (SOK) | 62 | state | independent | — | Sokoto | Reconstructed core from ten modern northern Nigerian states; LOW confidence, shifting military frontier |
| Sultanate of Wadai (WAD) | 63 | state | independent | — | Abéché | Reconstructed core from six modern Chadian regions; LOW confidence, no surveyed 1900 border |
| Sultanate of Darfur (DAR) | 64 | state | independent | — | El Fasher | Reconstructed from the five modern Darfur states; MEDIUM confidence, conservative core |
| Jabal Shammar (SHM) | 65 | state | independent | — | Ha'il | Reconstructed from Ha'il, Qassim, Riyadh, Northern Borders and al-Jowf; MEDIUM confidence |
| Cretan State (CRT) | 66 | state | autonomous-vassal | Ottoman suzerainty (not modelled as sovereignTag) | Chania | Polygon: modern Crete region, separated from Greece |
| Tibet (TIB) | 162 | territory | autonomous-province | CHN | Lhasa | Polygon: modern Tibet Autonomous Region as a conservative core; LOW confidence, Amdo/Kham not separated |
| Khanate of Khiva (KHI) | 163 | territory | protectorate | RUS | Khiva | Polygon: Xorazm, Karakalpakstan and Daşoguz; LOW confidence |
| Emirate of Bukhara (BUK) | 164 | territory | protectorate | RUS | Bukhara | Polygon: Bukhara, Navoiy, Qashqadaryo, Surxondaryo, Khatlon, Dushanbe and Republican Subordination districts; LOW confidence |
| Raj of Sarawak (SAR) | 165 | territory | protectorate | GBR | Kuching | Polygon: modern Malaysian state of Sarawak, separated from British Malaya |

Every new state is selectable and has a simulation country with its own home
region, population, buildings, treasury, government, technology, market and
AI/player participation. Every new territory is a non-selectable region of its
sovereign country with its own population, buildings and region metadata.

**Stable IDs.** No existing polity ID changed. New state IDs are 60–66; new
territory IDs are 162–165. Existing IDs 0–59 and 100–161 remain with their
original tags and meanings.

## 5. Markets

Two markets were added:

- **18 `austro-hungarian`** — the common Austro-Hungarian customs area.
- **19 `pacific`** — the independent Kingdom of Tonga's market.

Sokoto, Wadai and Darfur join the existing `african-independent` market;
Jabal Shammar and Crete join `ottoman-egyptian`; the new territories use their
sovereign's market. Market grouping remains an authored economic approximation,
not a claim about actual 1900 trade treaties.

## 6. Researched entities deliberately not given separate state entries

These are the main contested or borderline cases; excluding them from the
independent-state inventory is a documented classification decision, not an
oversight.

| Entity | Decision | Reason |
|---|---|---|
| Ashanti / Asante | Not separately modelled | The Asante state was under British military conquest in 1900 and was annexed in 1901; it was not a recognised independent state on 1 January 1900 within the catalog's state system. |
| Bornu (Rabih’s state) | Not separately modelled | Rabih’s Bornu was destroyed by the French at Kousséri in April 1900; its boundaries and institutions were not stable on 1 January 1900 and no reliable 1900 polygon exists. |
| Dervish State (Somali) | Not separately modelled | A resistance polity without internationally recognised boundaries; it is not part of the COW/CShapes state system for 1900 and cannot be mapped reliably. |
| Zanzibar | Not a state; British protectorate | The sultanate was a British protectorate, not independent; it is grouped with British East Africa. |
| Sikkim | Not a state; British protectorate | British protectorate; too small to warrant a separate region at this map/scale, and already within British India's sphere. |
| Zulu, Basutoland, Bechuanaland, Swaziland | Not states; British colonies/protectorates | Already represented within British southern African territories or the Cape/Natal regions. |
| Tibet, Mongolia, Xinjiang | Qing dependencies | Not independent in 1900. Tibet was added as a separately represented autonomous province territory; Mongolia and Xinjiang remain inside Qing China at this resolution. |
| Khiva, Bukhara, Sarawak | Protectorates | Added as non-selectable territories with their sovereign flag and status badge. |
| Native American nations, African chiefdoms | Not states in this model | They lacked the sovereign-state institutions and recognised 1900 boundaries the catalog models. This is a scope decision, not a denial of their historical existence. |

## 7. Map and boundary limitations (M11c)

M11c completed a systematic geographical and political audit of the entire map.
The detailed method, per-polity table and sources are in
`docs/HISTORICAL_MAP_PROVENANCE.md`; the machine-readable audit is
`packages/data/data/map/world_map_1900_audit.json`.

- **No marker-only polities remain.** Tonga, Sokoto, Wadai, Darfur, Jabal
  Shammar, Crete, Tibet, Khiva, Bukhara and Sarawak now have reconstructed
  polygons. The M11b marker fallback was removed because a defensible
  historical extent exists for every one of them.
- **Libya is represented.** The territory is assigned to the Ottoman Empire
  (OTT) as Tripolitania, Cyrenaica and Fezzan, with the three components
  recorded in the map provenance. No modern Libyan sovereign state was added.
- **Germany is the German Empire.** Alsace-Lorraine, the Prussian eastern
  provinces, North Schleswig, Eupen-Malmedy, Memel and East Prussia are
  included. The eastern frontier is a reconstructed line with MEDIUM
  confidence; the surrounding provinces are HIGH confidence.
- **Austria-Hungary, Russia, the Ottoman Empire, Romania, Bulgaria, Serbia,
  Montenegro, Greece, Italy, Denmark, Belgium, France, Siam, British India,
  China/Tibet, the Central Asian protectorates, the African colonies and the
  Americas/Oceania entries** have explicit transfers or verified modern
  matches; see the audit table.
- **Residual generalization artefacts.** The audit finds two overlaps above
  0.001 deg²: Canada/Newfoundland (0.249 deg²) and Bolivia/Brazil around Acre
  (0.016 deg²). These are independently simplified coastline slivers, not
  deliberate political claims. The audit also finds 24 single-sample
  coastal/island gaps at 1° resolution; there is no multi-sample terrestrial
  void. Both are documented in `docs/HISTORICAL_MAP_PROVENANCE.md` §6.
- **South Africa** remains the documented admin-1 approximation: the Cape
  Colony, Natal, the Transvaal and the Orange Free State use modern province
  proxies; the 1900 republican borders differed from the modern provinces.
- **Svalbard** is included in the modern Norwegian outline although it was
  terra nullius until 1920; this is a known small over-assignment recorded in
  the Norwegian provenance note.
- **Antarctica and genuinely unclaimed territory** remain on the neutral land
  layer and are not assigned to a sovereign state.

## 8. Flag coverage

Flag provenance is documented in `docs/FLAG_PROVENANCE.md`. Summary:

- 64 bundled flag images: 62 externally sourced (PD/CC0) and 2 project-authored
  reconstructions (Spain and the Transvaal Vierkleur).
- 131 of 133 polities display a bundled flag; the only monogram fallbacks are
  Wadai (WAD) and Darfur (DAR), where no verified historical flag design could
  be established.
- The five M11 monogram cases — Spain, Spanish Sahara, Spanish Guinea,
  Montenegro and the Transvaal — are resolved.
- Austria-Hungary uses its common civil ensign, because no single unified
  national flag existed; the Austrian and Hungarian halves and the joint
  institutions are documented on the polity and in the flag provenance.
- Dependencies use the sovereign flag plus their existing political-status
  badge, with Egypt as the single documented exception (its own khedival flag).

## 9. Remaining uncertainties

- **Austria-Hungary's exact 1900 borders** in Galicia, Transylvania, Vojvodina,
  South Tyrol and the Littoral are reconstructed from modern administrative
  proxies. The internal crown-land borders are not drawn; the external frontier
  is MEDIUM/HIGH confidence depending on the segment.
- **Sokoto, Wadai, Darfur and Jabal Shammar** now have reconstructed polygons,
  but their 1900 frontiers were military/administrative zones rather than
  surveyed lines. Their populations remain low-confidence rounded estimates and
  their polygons are LOW/MEDIUM confidence. The flag monograms remain because
  no defensible historical national flag design was established.
- **Tibet, Khiva, Bukhara and Sarawak** have conservative reconstructed cores;
  their historical extent was larger or less sharply defined than the modern
  administrative proxies. The notes record the missing Amdo/Kham, Pamir and
  Borneo frontier detail.
- **Germany's eastern frontier strip** is generalized to about 10–20 km. The
  provinces are HIGH confidence; the exact line between the German Empire and
  Congress Poland/Austria-Hungary is MEDIUM confidence.
- **Libya's Ottoman provincial limits** and the southern Fezzan/Aouzou limit
  are approximate. Ottoman sovereignty, local Senussi/tribal authority and
  limited effective control are distinguished in the provenance notes.
- **Crete's** autonomy was internationally guaranteed but its constitutional
  future was contested; it is classified `autonomous-vassal`, not independent.
- **Tonga's** protectorate began on 18 May 1900, after the reference date; it is
  classified independent with the later protectorate recorded.
- The recognition status of the African de facto states is inherently
  contested; the catalog records `independent` plus explicit limited-recognition
  notes rather than pretending they were universally recognised.
- Population totals for the new polities are rounded order-of-magnitude
  estimates, not census values. They carry `low` confidence in the catalog.
