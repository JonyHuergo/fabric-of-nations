# Historical flag provenance — Fabric of Nations 1900

This document records every historical flag bundled for the Fabric of Nations 1900 catalog. The reference date is **1 January 1900**. It is generated from
`packages/data/data/historical/m11/flags_1900.json` by `scripts/m11/build-flags.mjs`; edit the manifest, not this file.

## Summary

- Polities in the 1900 catalog: **133**
- Bundled flag images: **66** (62 externally sourced, 4 project-authored reconstructions)
- Polities displaying a bundled historical flag: **133**
- Polities using the monogram fallback: **0**
- Reference date: **1 January 1900**; assets retrieved **2026-10-30**
- Artwork source: **Wikimedia Commons plus project-authored reconstructions**; licence policy: Externally sourced files are individually verified through the Wikimedia Commons API as Public Domain or CC0. Project-authored reconstructions and the two user-selected representative flag reconstructions are Fabric of Nations-authored, dedicated to the public domain, and recorded separately from their historical or user-selected sources. No share-alike or restricted artwork is bundled.

### Flag-kind counts

| Flag kind | Count |
| --- | ---: |
| autonomous-state-flag | 1 |
| civil-ensign | 1 |
| civil-national | 3 |
| de-facto-national | 1 |
| exact-national | 47 |
| imperial-state-standard | 1 |
| national-form | 1 |
| national-plain | 1 |
| national-under-occupation | 1 |
| national-variant-representative | 1 |
| national-with-union-badge | 1 |
| pre-standardization-representative | 1 |
| project-reconstruction | 2 |
| provincial-national | 1 |
| representative-common-ensign | 1 |
| user-selected-representative | 2 |

### Polity basis counts

| Status | Basis | Polities |
| --- | --- | ---: |
| autonomous-province | documented-exception | 1 |
| autonomous-province | sovereign-flag | 2 |
| autonomous-vassal | national | 2 |
| colony | sovereign-flag | 47 |
| dependency | sovereign-flag | 3 |
| dominion | national | 1 |
| dominion | sovereign-flag | 3 |
| independent | national | 58 |
| independent | user-selected-representative | 2 |
| occupation | national | 1 |
| personal-union | national | 1 |
| protectorate | sovereign-flag | 12 |

## Licensing and verification method

Each file was checked individually through the Wikimedia Commons API (`prop=imageinfo`, `iiprop=extmetadata`). A file is bundled only when the API reports licence code `pd` (Public domain, including PD-old, PD-self and PD-ineligible) or `cc0` (Creative Commons Zero). The script aborts if the reported licence, source SHA-1, author or file page changes. Category-wide assumptions are never used.

The pipeline downloads Wikimedia's PNG rendition of each approved file at a normalized 500 px width, preserving the flag's own aspect ratio, and validates the PNG signature, chunk CRCs, IHDR dimensions, IDAT length and trailing bytes. One approved source is a JPEG (the CC0 1886 Qajar flag); the pipeline converts it to PNG locally with `jimp-compact`, a build-time-only dependency that is already present in the Expo dependency graph. No runtime image library or network access is added to the game.

## Project-authored reconstructions

Four flags are original Fabric of Nations reconstructions rather than externally sourced files: the Spanish restoration flag, the Transvaal Vierkleur, and the two user-selected Darfur and Wadai designs. They are rendered deterministically at build time from documented or user-selected designs and are dedicated to the public domain by the project. Their historical or user-selected sources are recorded separately from Fabric of Nations' authorship; no share-alike or restricted artwork is traced or copied. The Pax Historia rasters were inspected but are not bundled because redistribution permission was not established.

- **`darfur-user-selected`** — User-selected representative flag of the Sultanate of Darfur. User-selected design (green-red-black horizontal triband with a white crescent on the red stripe). It is a representative design chosen for the 1900 scenario, not an exact historical national flag with contemporary documentation. The original Pax Historia raster is not bundled; Fabric of Nations reconstructed the simple geometric design independently because redistribution permission for the raster could not be established.
- **`spain-restoration`** — Restoration-era Spanish state flag (red–yellow–red with the coat of arms). The Spanish state flag of the Restoration (1875–1931) was red–yellow–red with the royal coat of arms. No Public Domain or CC0 file of that exact state flag was available; the plain triband was not the 1900 state flag (it became the merchant flag only in 1927). This is a project-authored composition: a red–yellow–red field with the individually verified Public Domain flag-version coat of arms (Castile–León and the royal crown). The composition and its raster rendering are Fabric of Nations' work, not a copy of any share-alike flag file.
  - Component: coat-of-arms — [File:Flag version of the Coat of arms of Spain (1785-1873 & 1875-1931.png](https://commons.wikimedia.org/wiki/File:Flag_version_of_the_Coat_of_arms_of_Spain_(1785-1873_%26_1875-1931.png); Public domain (pd); author Buho07.
- **`transvaal-vierkleur`** — Vierkleur of the South African Republic (Transvaal). The South African Republic (Transvaal) Vierkleur: a green vertical stripe at the hoist and red, white and blue horizontal stripes in the fly. This is an original project-authored reconstruction from the documented 1857–1902 design. The available Commons Vierkleur vector is CC BY-SA and was not used or traced.
- **`wadai-user-selected`** — User-selected representative flag of the Sultanate of Wadai. User-selected design (white field enclosed by a thin black border). It is a representative design chosen for the 1900 scenario, not an exact historical national flag with contemporary documentation. The original Pax Historia raster is not bundled; Fabric of Nations reconstructed the simple geometric design independently because redistribution permission for the raster could not be established.

## Bundled flags

### `afghanistan-1880` — Black flag of the Emirate of Afghanistan

- **Flag kind:** exact-national
- **Polities:** `AFG` (ID 29)
- **Validity:** 1880-01-01 – 1901-10-01
- **Source:** [File:Flag of Afghanistan (1880–1901).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Afghanistan_(1880%E2%80%931901).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** PaD and Indolences .
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/a/a7/Flag_of_Afghanistan_%281880%E2%80%931901%29.svg) (900×600; SHA-1 `5dc2095a25564132ac9003386174f122fa2d0d40`)
- **Historical accuracy:** Plain black flag used by the Emirate of Afghanistan under Abdur Rahman Khan (1880–1901). The file's documented range ends in 1901, so it covers 1 January 1900.

### `andorra-1866` — Blue-yellow-red flag of Andorra with the princely crown

- **Flag kind:** exact-national
- **Polities:** `AND` (ID 24)
- **Validity:** 1866-01-01 – 1934-12-31
- **Source:** [File:Flag of Andorra (end of the 19th century-c. 1930s).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Andorra_(end_of_the_19th_century-c._1930s).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Esprit04
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/2/20/Flag_of_Andorra_%28end_of_the_19th_century-c._1930s%29.svg) (450×300; SHA-1 `648e42ed3b5b76fb17945fd9656cf556253b353d`)
- **Historical accuracy:** Vertical blue-yellow-red tricolour with a crown, the Andorran flag used from the later nineteenth century until the 1930s. The file's documented range is 'end of the 19th century-c. 1930s'; the start is therefore year-level and approximate.

### `argentina` — Flag of Argentina with the Sun of May

- **Flag kind:** exact-national
- **Polities:** `ARG` (ID 50)
- **Validity:** 1818-02-25 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Argentina.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Argentina.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Manuel Belgrano
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/1/1a/Flag_of_Argentina.svg) (800×500; SHA-1 `b54fa14d4d27a1dc3f763d650f9e5afe155e376b`)
- **Historical accuracy:** Light blue and white horizontal bands with the Sun of May in the centre; the sun was added in 1818. The flag was unchanged in 1900.

### `austria-hungary-civil-ensign` — Common civil ensign of Austria-Hungary (Austrian and Hungarian arms)

- **Flag kind:** representative-common-ensign
- **Polities:** `AUT` (ID 60)
- **Validity:** 1869-01-01 – 1918-11-03
- **Source:** [File:Ensign of Austro-Hungarian civil fleet (1869-1918).svg](https://commons.wikimedia.org/wiki/File:Ensign_of_Austro-Hungarian_civil_fleet_(1869-1918).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Vectorization: Sgt_bilko / Original: Željko Heimer
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/e/e8/Ensign_of_Austro-Hungarian_civil_fleet_%281869-1918%29.svg) (648×432; SHA-1 `d12c9b4fa561c6d114b36d6a5f0eb74ec823080d`)
- **Historical accuracy:** Austria-Hungary had no single unified national flag. The Austrian half used red-white-red with the Austrian arms; the Hungarian half used red-white-green with the Hungarian arms. The common civil ensign from 1869 combined both halves and both coats of arms. It is the historically defensible representative flag of the dual monarchy for 1 January 1900.

### `belgium` — Black-yellow-red flag of Belgium

- **Flag kind:** exact-national
- **Polities:** `BEL` (ID 10), `CFS` (ID 137)
- **Validity:** 1831-01-23 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Belgium (civil).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Belgium_(civil).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Dbenbenn
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/92/Flag_of_Belgium_%28civil%29.svg) (900×600; SHA-1 `6a49004d51c767581802fcc2b320304f203fef60`)
- **Historical accuracy:** Vertical black-yellow-red tricolour, adopted in 1831 and in use in 1900. The civil version is shown at the 2:3 ratio.

### `bolivia` — State flag of Bolivia

- **Flag kind:** exact-national
- **Polities:** `BOL` (ID 48)
- **Validity:** 1851-10-31 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Bolivia (state).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Bolivia_(state).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Not stated on the source file (public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/d/de/Flag_of_Bolivia_%28state%29.svg) (1100×750; SHA-1 `f41feb0ea1af213fbb5fd3b9fe6924f8cedb7394`)
- **Historical accuracy:** Red-yellow-green horizontal tricolour with the Bolivian coat of arms, adopted in 1851 and unchanged in 1900.

### `brazil-1889` — Flag of the United States of Brazil

- **Flag kind:** exact-national
- **Polities:** `BRA` (ID 53)
- **Validity:** 1889-11-19 – 1960-04-21
- **Source:** [File:Flag of Brazil (1889–1960).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Brazil_(1889%E2%80%931960).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Raimundo Teixeira Mendes
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/92/Flag_of_Brazil_%281889%E2%80%931960%29.svg) (1000×700; SHA-1 `312c5b9cbc40d7c4957d020f514f3b5803ddfe9b`)
- **Historical accuracy:** Green field with a yellow rhombus and a blue celestial globe, adopted by the republic in 1889. The star field was updated as new states were admitted; this rendition represents the 1889–1960 design.

### `bulgaria-1879` — White-green-red flag of the Principality of Bulgaria

- **Flag kind:** civil-national
- **Polities:** `BGR` (ID 19)
- **Validity:** 1879-04-16 – 1946-09-15
- **Source:** [File:Flag of Bulgaria.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Bulgaria.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** SKopp
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/9a/Flag_of_Bulgaria.svg) (1000×600; SHA-1 `b976f224d05a6732c4b31f4593418ce4dc09d652`)
- **Historical accuracy:** Horizontal white-green-red tricolour adopted with the Tarnovo Constitution. The plain national/civil flag is shown; separate state and naval ensigns carried the princely/royal arms.

### `canada-red-ensign-1868` — Canadian Red Ensign with the 1868 provincial shield

- **Flag kind:** de-facto-national
- **Polities:** `CAN` (ID 56)
- **Validity:** 1868-01-01 – 1921-01-01
- **Source:** [File:Flag of Canada (1868–1921).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Canada_(1868%E2%80%931921).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Greentubing~commonswiki
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/5/5f/Flag_of_Canada_%281868%E2%80%931921%29.svg) (1200×600; SHA-1 `f23587fdde56429d2d5eb73057127c51225a6672`)
- **Historical accuracy:** The Red Ensign with the Canadian shield, used unofficially on land and sea from 1870 and approved by the British Admiralty for Canadian use at sea in 1892. The Union Jack remained Canada's official national flag in 1900; the Red Ensign was the distinctive de facto Canadian flag. This is not the modern maple-leaf flag.

### `chile` — Flag of Chile

- **Flag kind:** exact-national
- **Polities:** `CHL` (ID 49)
- **Validity:** 1817-10-18 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Chile.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Chile.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Not stated on the source file (public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/7/78/Flag_of_Chile.svg) (900×600; SHA-1 `22a43c801d3d9f56988f6d9947e5a03e1fc59c4b`)
- **Historical accuracy:** White and red horizontal bands with a blue canton bearing a white five-pointed star, the Chilean national flag since 1817.

### `colombia` — Flag of Colombia

- **Flag kind:** exact-national
- **Polities:** `COL` (ID 44)
- **Validity:** 1861-11-26 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Colombia.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Colombia.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Not stated on the source file (public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/2/21/Flag_of_Colombia.svg) (900×600; SHA-1 `a3c233df324c01babf5085147da5987767d72aac`)
- **Historical accuracy:** Yellow-blue-red horizontal tricolour with yellow at half the height, adopted in 1861 and unchanged in 1900.

### `costa-rica-1848` — Flag of Costa Rica with the 1848 coat of arms

- **Flag kind:** exact-national
- **Polities:** `COS` (ID 43)
- **Validity:** 1848-09-29 – 1906-06-27
- **Source:** [File:Flag of Costa Rica (1848–1906).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Costa_Rica_(1848%E2%80%931906).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** HansenBCN
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/4/4c/Flag_of_Costa_Rica_%281848%E2%80%931906%29.svg) (750×500; SHA-1 `763ea03ff09077e1bb85465d41ff29b8d2dbc576`)
- **Historical accuracy:** Blue-white-red horizontal stripes with the 1848 coat of arms, in use until the 1906 reform.

### `crete-1898` — Flag of the autonomous Cretan State

- **Flag kind:** autonomous-state-flag
- **Polities:** `CRT` (ID 66)
- **Validity:** 1898-12-09 – 1913-12-01
- **Source:** [File:Flag of Cretan State.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Cretan_State.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Vectorization: Froztbyte
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/4/43/Flag_of_Cretan_State.svg) (1200×800; SHA-1 `26bca5a6e50e05bcaabef422f1aa676a6e47b93a`)
- **Historical accuracy:** The Cretan State was an autonomous polity under Ottoman suzerainty and Great Power guarantee, with a Greek high commissioner. Its flag combined the Greek blue-and-white cross with a red canton and white five-pointed star. It was not a fully independent sovereign state; the status metadata records autonomous-vassal.

### `cuba` — Flag of Cuba

- **Flag kind:** national-under-occupation
- **Polities:** `CUB` (ID 59)
- **Validity:** 1849-06-26 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Cuba.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Cuba.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Miguel Teurbe Tolón and Narciso López
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/b/bd/Flag_of_Cuba.svg) (1200×600; SHA-1 `7602a27f1a47b84f621ed7fab13ed2451f31f7f8`)
- **Historical accuracy:** The Lone Star flag, designed in 1849 and used by the Cuban independence movement. Cuba was under United States military occupation on 1 January 1900; the Cuban flag was the national flag of the future republic (1902) and was flown by Cuban civil authorities alongside the occupying power's flag. The catalog records the occupation through the OCC status badge.

### `darfur-user-selected` — User-selected representative flag of the Sultanate of Darfur

- **Flag kind:** user-selected-representative
- **Polities:** `DAR` (ID 64)
- **Validity:** 1900 – no end date recorded (in use on 1 January 1900)
- **Source:** project-authored reconstruction (design `darfur-user-selected`), not an externally sourced image.
- **License:** Project-authored reconstruction; dedicated to the public domain by Fabric of Nations (project) — internal:docs/FLAG_PROVENANCE.md#user-selected-representative-flags
- **Author:** Fabric of Nations project (original geometric reconstruction; design selected by the user from Pax Historia)
- **Retrieved:** 2026-10-30
- **Source file:** built by `scripts/m11/build-flags.mjs` at 1000×667; no external flag file is redistributed.
- **Historical accuracy:** User-selected design (green-red-black horizontal triband with a white crescent on the red stripe). It is a representative design chosen for the 1900 scenario, not an exact historical national flag with contemporary documentation. The original Pax Historia raster is not bundled; Fabric of Nations reconstructed the simple geometric design independently because redistribution permission for the raster could not be established.

### `denmark` — Dannebrog, the Danish national flag

- **Flag kind:** exact-national
- **Polities:** `DNK` (ID 14), `ISL` (ID 154), `GRL` (ID 155), `FRO` (ID 156), `DWI` (ID 157)
- **Validity:** 1748-06-11 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Denmark.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Denmark.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Madden and others
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/9c/Flag_of_Denmark.svg) (512×387; SHA-1 `f22f7a2eb507e529f963ad514a03e0ca1bfd6cc6`)
- **Historical accuracy:** Red flag with a white Nordic cross. The Dannebrog was the Danish national flag throughout the nineteenth century.

### `dominican-republic` — Flag of the Dominican Republic

- **Flag kind:** exact-national
- **Polities:** `DOM` (ID 55)
- **Validity:** 1863-09-24 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of the Dominican Republic.svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_Dominican_Republic.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Juan Pablo Duarte
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/9f/Flag_of_the_Dominican_Republic.svg) (900×600; SHA-1 `1593746a787f6d9d7e95068c14949a4cae211616`)
- **Historical accuracy:** Blue and red quarters divided by a white cross, with the Dominican coat of arms, in use in 1900.

### `ecuador-civil` — Civil flag of Ecuador (plain yellow-blue-red tricolour)

- **Flag kind:** civil-ensign
- **Polities:** `ECU` (ID 46)
- **Validity:** 1860-09-26 – 2009-11-05
- **Source:** [File:Civil flag and ensign of Ecuador (1900–2009).svg](https://commons.wikimedia.org/wiki/File:Civil_flag_and_ensign_of_Ecuador_(1900%E2%80%932009).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Tcfc2349
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/7/78/Civil_flag_and_ensign_of_Ecuador_%281900%E2%80%932009%29.svg) (1600×800; SHA-1 `7a6c11310ef5b6f185916dd4057d90a0e893255f`)
- **Historical accuracy:** Yellow (double-width), blue and red horizontal tricolour. The coat of arms was made mandatory for the state flag only by the decree of 5 December 1900, after the reference date, so the plain civil flag is the correct 1 January 1900 form. The file's own title dates the plain design to 1900–2009; the plain tricolour itself dates from 1860.

### `egypt-1882` — Flag of the Khedivate of Egypt

- **Flag kind:** provincial-national
- **Polities:** `EGY` (ID 158)
- **Validity:** 1882-01-01 – 1922-02-28
- **Source:** [File:Flag of Egypt (1882–1922).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Egypt_(1882%E2%80%931922).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Converted to svg by Daniel78
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/7/7d/Flag_of_Egypt_%281882%E2%80%931922%29.svg) (1200×600; SHA-1 `28f8221ff9de2e85fa2c68e213f8f717c699ccce`)
- **Historical accuracy:** Red field with three white crescents and three white stars. Egypt was an autonomous Ottoman province under British occupation in 1900; this distinct khedival flag is a documented exception to the sovereign-flag rule because Egypt had its own recognised flag and was not a colony in the catalog's sense. The AUT status badge remains visible.

### `el-salvador-1875` — Flag of El Salvador with the 1875 coat of arms

- **Flag kind:** exact-national
- **Polities:** `SAL` (ID 41)
- **Validity:** 1875-05-17 – 1912-05-17
- **Source:** [File:Flag of El Salvador (1875–1912).svg](https://commons.wikimedia.org/wiki/File:Flag_of_El_Salvador_(1875%E2%80%931912).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Legislative Assembly of El Salvador
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/1/12/Flag_of_El_Salvador_%281875%E2%80%931912%29.svg) (1116×638; SHA-1 `de02f9300134c29190a8311f6467941862e25b42`)
- **Historical accuracy:** Blue-white-blue tricolour with the 1875 coat of arms, used until the 1912 reform.

### `ethiopia-1897` — Green-yellow-red flag of the Ethiopian Empire with the Lion of Judah

- **Flag kind:** imperial-state-standard
- **Polities:** `ETH` (ID 33)
- **Validity:** 1897-01-01 – 1936-05-05
- **Source:** [File:Flag of Ethiopia (1897–1974).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Ethiopia_(1897%E2%80%931974).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Oren neu dag
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/f/ff/Flag_of_Ethiopia_%281897%E2%80%931974%29.svg) (900×600; SHA-1 `ee414b9e8090013c8fb790db90f2a790809ea37a`)
- **Historical accuracy:** Green-yellow-red tricolour bearing the crowned Lion of Judah with the crossed staff and flag. The tricolour was adopted in 1897; this imperial/state form with the lion is the period representation. The plain tricolour was the civil flag.

### `france-tricolour` — French tricolour

- **Flag kind:** exact-national
- **Polities:** `FRA` (ID 3), `ALG` (ID 121), `TUN` (ID 122), `FWA` (ID 123), `FEA` (ID 124), `FIC` (ID 125), `MAD` (ID 126), `FSO` (ID 127), `FCA` (ID 128), `FPO` (ID 129)
- **Validity:** 1830-08-01 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of France.svg](https://commons.wikimedia.org/wiki/File:Flag_of_France.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Original: Unknown Vector: SKopp
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/c/c3/Flag_of_France.svg) (900×600; SHA-1 `66bdc8e9edf0515a0742b58a4f04fa1103084d56`)
- **Historical accuracy:** Blue-white-red vertical tricolour of the French Third Republic. The same design was in use with interruptions from 1794 and continuously from 1830.

### `germany-1867` — Black-white-red flag of the German Empire

- **Flag kind:** exact-national
- **Polities:** `DEU` (ID 2), `GEA` (ID 130), `GSW` (ID 131), `KAM` (ID 132), `TOG` (ID 133), `GNG` (ID 134), `GSA` (ID 135), `GPN` (ID 136)
- **Validity:** 1867-07-01 – 1918-11-09
- **Source:** [File:Flag of Germany (1867–1918).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Germany_(1867%E2%80%931918).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Original: Adolf Soetbeer , Otto von Bismarck Vector: B1mbo , Madden
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/1/1f/Flag_of_Germany_%281867%E2%80%931918%29.svg) (900×600; SHA-1 `59fe0e22197ef0fa883aeb99f3122f686633d350`)
- **Historical accuracy:** Black-white-red tricolour of the North German Confederation and, from 1871, the German Empire. It is not the modern black-red-gold flag.

### `greece-1822` — National flag of the Kingdom of Greece

- **Flag kind:** national-plain
- **Polities:** `GRC` (ID 15)
- **Validity:** 1822-01-15 – 1978-12-01
- **Source:** [File:Flag of Greece (1822-1978).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Greece_(1822-1978).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** (of code) User:Makaristos
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/6/6e/Flag_of_Greece_%281822-1978%29.svg) (900×600; SHA-1 `464feedccaff45457749c286ab174ae5cb6e104c`)
- **Historical accuracy:** Blue and white flag with a white cross and nine stripes, adopted during the Greek War of Independence and used as the national flag. The plain national flag is shown; a royal state variant with the crown was used from 1863 to 1922.

### `guatemala-1871` — Flag of Guatemala with the 1871 coat of arms

- **Flag kind:** exact-national
- **Polities:** `GUA` (ID 39)
- **Validity:** 1871-08-17 – 1968-09-15
- **Source:** [File:Flag of Guatemala (1871–1968).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Guatemala_(1871%E2%80%931968).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** SVG-image-maker
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/3/3a/Flag_of_Guatemala_%281871%E2%80%931968%29.svg) (900×600; SHA-1 `b09245de9fc3c043c3f038a3e6785fba41a72cce`)
- **Historical accuracy:** Vertical blue-white-blue tricolour with the 1871 coat of arms, in use from the Liberal Revolution until 1968.

### `hail-1835` — Flag of the Emirate of Jabal Shammar (Ha'il)

- **Flag kind:** exact-national
- **Polities:** `SHM` (ID 65)
- **Validity:** 1835-01-01 – 1921-11-02
- **Source:** [File:Flag of the Emirate of Ha'il (1835 - 1920).svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_Emirate_of_Ha%27il_(1835_-_1920).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Orange Tuesday
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/7/77/Flag_of_the_Emirate_of_Ha%27il_%281835_-_1920%29.svg) (600×400; SHA-1 `eba9be7b436107ff3ec5a89ab11b08a3c5aedb6b`)
- **Historical accuracy:** Red flag with a yellow crescent and eight-pointed star in the canton, the Rashidi emirate of Jabal Shammar. It was de facto independent and nominally Ottoman; Ibn Saud conquered it in 1921.

### `haiti-1859` — Flag of Haiti

- **Flag kind:** exact-national
- **Polities:** `HTI` (ID 54)
- **Validity:** 1859-01-01 – 1964-05-25
- **Source:** [File:Flag of Haiti (1820–1849, 1859–1964).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Haiti_(1820%E2%80%931849,_1859%E2%80%931964).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Wrestlingring
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/6/6c/Flag_of_Haiti_%281820%E2%80%931849%2C_1859%E2%80%931964%29.svg) (1000×600; SHA-1 `a09f01e75d5c0ec612afcf0b18ddb8ad791127d0`)
- **Historical accuracy:** Blue and red horizontal bicolour with the coat of arms, restored in 1859 and used until 1964.

### `honduras-1866` — Flag of Honduras with five blue stars

- **Flag kind:** exact-national
- **Polities:** `HON` (ID 40)
- **Validity:** 1866-02-16 – 1949-01-18
- **Source:** [File:Flag of Honduras (1866–1949).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Honduras_(1866%E2%80%931949).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** AquaVacation
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/6/6b/Flag_of_Honduras_%281866%E2%80%931949%29.svg) (1200×600; SHA-1 `06f31d9d256bb4f84de2bc8866e7f0fcb9e44c14`)
- **Historical accuracy:** Blue-white-blue horizontal triband with five blue stars in quincunx, introduced by decree on 16 February 1866. The 1949 decree regulated the shade of blue and confirmed the star arrangement; the 1866 design was the flag in use on 1 January 1900.

### `italy-1861` — Flag of the Kingdom of Italy with the Savoy shield

- **Flag kind:** exact-national
- **Polities:** `ITA` (ID 6), `ERI` (ID 143), `ITS` (ID 144)
- **Validity:** 1861-03-17 – 1946-06-18
- **Source:** [File:Flag of Italy (1861–1946).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Italy_(1861%E2%80%931946).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** F l a n k e r
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/7/78/Flag_of_Italy_%281861%E2%80%931946%29.svg) (1500×1000; SHA-1 `ff060347b1116848ade2b000e617fb1f13ffa279`)
- **Historical accuracy:** Green-white-red vertical tricolour charged with the Savoy shield and crown, the flag of the Kingdom of Italy from 1861 until the 1946 republic. The modern flag without the shield is not the 1900 flag.

### `japan-1870` — Hinomaru, civil and state flag of the Empire of Japan

- **Flag kind:** exact-national
- **Polities:** `JPN` (ID 5), `TWN` (ID 161)
- **Validity:** 1870-02-27 – 1999-08-13
- **Source:** [File:Flag of Japan (1870–1999).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Japan_(1870%E2%80%931999).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** kahusi - (Talk)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/1/1b/Flag_of_Japan_%281870%E2%80%931999%29.svg) (1000×700; SHA-1 `032e27bda4cb886bb6080f293d77f51a0eb9fa19`)
- **Historical accuracy:** Red sun disc on white, proclaimed in 1870 and the national flag of the Empire of Japan in 1900. The 1870–1999 proportions were 7:10; the design itself was unchanged when the modern 2:3 law took effect in 1999.

### `korea-1882` — Taegeukgi of the Korean Empire

- **Flag kind:** exact-national
- **Polities:** `KOR` (ID 27)
- **Validity:** 1882-01-01 – 1910-08-29
- **Source:** [File:Flag of Korea (1882–1910).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Korea_(1882%E2%80%931910).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Daniil Ivanov
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/6/63/Flag_of_Korea_%281882%E2%80%931910%29.svg) (600×400; SHA-1 `356168a4d9a98e62e357c4ddb7396c2f9b287ccf`)
- **Historical accuracy:** White field with the red-blue taegeuk and four black trigrams, used from 1882 and as the flag of the Korean Empire (1897–1910). Korea was annexed by Japan on 29 August 1910.

### `liberia` — Flag of the Republic of Liberia

- **Flag kind:** exact-national
- **Polities:** `LBR` (ID 34)
- **Validity:** 1847-08-24 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Liberia.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Liberia.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Government of Liberia
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/b/b8/Flag_of_Liberia.svg) (1140×600; SHA-1 `3eb8d20b0e144a48bd9e7bd80a054a8d7cc84483`)
- **Historical accuracy:** Eleven horizontal red and white stripes with a blue canton and a single white star, modelled on the United States flag but with one star. In use since independence in 1847.

### `liechtenstein-1852` — Blue and red flag of Liechtenstein

- **Flag kind:** exact-national
- **Polities:** `LIE` (ID 25)
- **Validity:** 1852-01-01 – 1921-10-05
- **Source:** [File:Flag of Liechtenstein (1852–1921).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Liechtenstein_(1852%E2%80%931921).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** arz
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/7/7c/Flag_of_Liechtenstein_%281852%E2%80%931921%29.svg) (1000×600; SHA-1 `42783525f255e564c0453ad299e3cf8cb4407581`)
- **Historical accuracy:** Horizontal blue over red bicolour. The princely crown was added in 1937, so the plain bicolour is correct for 1900.

### `luxembourg` — Red-white-blue flag of Luxembourg

- **Flag kind:** exact-national
- **Polities:** `LUX` (ID 21)
- **Validity:** 1845-06-12 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Luxembourg.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Luxembourg.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Drawn by User:SKopp
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/d/da/Flag_of_Luxembourg.svg) (512×307; SHA-1 `82b0809e9809ce0ed139451900d498814ff9ccd1`)
- **Historical accuracy:** Horizontal red-white-blue tricolour. It was Luxembourg's national flag in 1900.

### `mexico-1893` — Flag of Mexico with the Porfirian coat of arms

- **Flag kind:** exact-national
- **Polities:** `MEX` (ID 38)
- **Validity:** 1893-01-01 – 1916-09-30
- **Source:** [File:Flag of Mexico (1893–1916).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Mexico_(1893%E2%80%931916).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** TownDown
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/e/eb/Flag_of_Mexico_%281893%E2%80%931916%29.svg) (980×560; SHA-1 `5a6f66cf4bdf4bfec0d301ed6c60f2234650bc48`)
- **Historical accuracy:** Green-white-red vertical tricolour with the 1893 coat of arms (the eagle on a nopal with the serpent), used during the Porfiriato and until 1916. Not the modern coat of arms.

### `monaco` — Red and white flag of Monaco

- **Flag kind:** exact-national
- **Polities:** `MCO` (ID 22)
- **Validity:** 1881-04-04 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Monaco.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Monaco.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Drawn by User:SKopp
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/e/ea/Flag_of_Monaco.svg) (1000×800; SHA-1 `9ef05499283f6841cbd8d04d6c1b80d53f4198f4`)
- **Historical accuracy:** Horizontal red over white bicolour, established by the princely decree of 1881.

### `montenegro-1881` — Montenegrin national flag with the princely monogram (1881–1905)

- **Flag kind:** national-variant-representative
- **Polities:** `MNT` (ID 17)
- **Validity:** 1881-01-01 – 1905-12-19
- **Source:** [File:Flag of Montenegro from 1881 to 1905.png](https://commons.wikimedia.org/wiki/File:Flag_of_Montenegro_from_1881_to_1905.png)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Unknown author (public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/4/46/Flag_of_Montenegro_from_1881_to_1905.png) (500×333; SHA-1 `623b186d203a5e05498f9781d10b3a22fa72d3b6`)
- **Historical accuracy:** Red-blue-white tricolour with the monogram and crown of Prince Nicholas I, documented 1881–1905. The file description records it as an unofficial/people's variation of the Montenegrin national flag; it is the closest verified period flag for 1 January 1900. The 1878 war ensign (white field with a red cross) is not used as the national flag.

### `morocco-1666` — Plain red flag of the Sultanate of Morocco

- **Flag kind:** exact-national
- **Polities:** `MAR` (ID 35)
- **Validity:** 1666-01-01 – 1915-11-17
- **Source:** [File:Flag of Morocco (1666–1915).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Morocco_(1666%E2%80%931915).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Flad
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/7/78/Flag_of_Morocco_%281666%E2%80%931915%29.svg) (900×600; SHA-1 `d2d19146823f7aad34582263ff66de50cd8c3e96`)
- **Historical accuracy:** Plain red flag used by Morocco from the Alaouite dynasty until the French protectorate introduced the green pentagram in 1915. In 1900 Morocco was an independent sultanate with a plain red flag.

### `nepal` — Double pennant flag of the Kingdom of Nepal

- **Flag kind:** exact-national
- **Polities:** `NPL` (ID 30)
- **Validity:** 1900-01-01 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Nepal.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Nepal.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Drawn by Pumbaa80 , Achim1999
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/9b/Flag_of_Nepal.svg) (726×885; SHA-1 `9ac8959c438341344230134b748f5ec57d9603c6`)
- **Historical accuracy:** The traditional double pennant with the sun and moon, in use in 1900. The current geometric specification was fixed by the 1962 constitution; the 1900 flag was the same traditional emblem. The non-rectangular shape is preserved by the asset pipeline.

### `netherlands` — Red-white-blue flag of the Kingdom of the Netherlands

- **Flag kind:** exact-national
- **Polities:** `NLD` (ID 9), `DEI` (ID 145), `SUR` (ID 146), `DGC` (ID 147)
- **Validity:** 1813-11-20 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of the Netherlands.svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_Netherlands.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Zscout370
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/2/20/Flag_of_the_Netherlands.svg) (900×600; SHA-1 `e9d6d9f2ffe57c6a8109651ecccb442e14e9a2fd`)
- **Historical accuracy:** Horizontal red-white-blue tricolour, the Dutch national flag throughout the nineteenth century. The official colour specification was only fixed in 1937; the design was unchanged in 1900.

### `nicaragua-1896` — Flag of Nicaragua with the 1896 coat of arms

- **Flag kind:** exact-national
- **Polities:** `NIC` (ID 42)
- **Validity:** 1896-09-04 – 1908-09-04
- **Source:** [File:Flag of Nicaragua (1896–1908).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Nicaragua_(1896%E2%80%931908).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Fornax (Commons author field; public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/6/63/Flag_of_Nicaragua_%281896%E2%80%931908%29.svg) (1772×1063; SHA-1 `f9308c0049708683cb5edc509110e89cc047229f`)
- **Historical accuracy:** Blue-white-blue tricolour with the 1896 coat of arms, in use from 1896 to 1908.

### `norway-1899` — Norwegian national flag without the union badge

- **Flag kind:** exact-national
- **Polities:** `NOR` (ID 13)
- **Validity:** 1899-01-01 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Norway.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Norway.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Original: Fredrik Meltzer Vector: Gutten på Hemsen
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/d/d9/Flag_of_Norway.svg) (512×372; SHA-1 `905b385ab20e146fbec17b14187c999d03970b30`)
- **Historical accuracy:** Red flag with a white-bordered blue Nordic cross. The union badge was removed from the Norwegian national, merchant and state flags by the flag law of 1898; the pure flag was first flown in 1899 and was the national flag on 1 January 1900. The naval war flag retained the badge until 1905. The start date is year-level because the first hoisting date is recorded only as 1899.

### `oman` — Plain red flag of the Sultanate of Muscat and Oman

- **Flag kind:** exact-national
- **Polities:** `OMN` (ID 32)
- **Validity:** 1856-01-01 – 1970-07-23
- **Source:** [File:Flag of Muscat.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Muscat.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Not stated on the source file (public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/6/6f/Flag_of_Muscat.svg) (600×400; SHA-1 `b267cf01af631bc57110aebca0052a0237b191e9`)
- **Historical accuracy:** Plain red flag used by Muscat and Oman in the nineteenth and early twentieth centuries. The modern flag with the khanjar was adopted in 1970.

### `orange-free-state` — Flag of the Orange Free State

- **Flag kind:** exact-national
- **Polities:** `ORF` (ID 37)
- **Validity:** 1857-02-28 – 1902-05-31
- **Source:** [File:Flag of the Orange Free State.svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_Orange_Free_State.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** David Benbennick wrote this file
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/6/6b/Flag_of_the_Orange_Free_State.svg) (420×280; SHA-1 `f8e1baa5b204847eadc8962dc09f6fc98ea685ed`)
- **Historical accuracy:** Orange and white horizontal stripes with the Netherlands flag in the canton, the flag of the Orange Free State from 1857 until the Treaty of Vereeniging in 1902. The Boer republics were at war with Britain on 1 January 1900 but the flag remained the state's flag.

### `ottoman-1844` — Ottoman crescent and star flag

- **Flag kind:** exact-national
- **Polities:** `OTT` (ID 20)
- **Validity:** 1844-01-01 – 1922-11-01
- **Source:** [File:Flag of the Ottoman Empire (1844–1922).svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_Ottoman_Empire_(1844%E2%80%931922).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** User:Orwellianist
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/8/8e/Flag_of_the_Ottoman_Empire_%281844%E2%80%931922%29.svg) (1200×800; SHA-1 `f94cd07a56e664ec196965335687620a62f6ca3c`)
- **Historical accuracy:** Red field with a white crescent and five-pointed star, the Ottoman national flag from the Tanzimat reforms until the abolition of the sultanate. The 1844 design is the one in use in 1900.

### `paraguay-1842` — Flag of Paraguay with the 1842 coat of arms

- **Flag kind:** exact-national
- **Polities:** `PRY` (ID 52)
- **Validity:** 1842-11-25 – 1954-07-15
- **Source:** [File:Flag of Paraguay (1842–1954).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Paraguay_(1842%E2%80%931954).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Kaiser Torikka
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/d/d7/Flag_of_Paraguay_%281842%E2%80%931954%29.svg) (900×600; SHA-1 `14c9e1f420dac960682811152ae0e92325085b2b`)
- **Historical accuracy:** Red-white-blue horizontal tricolour with the Paraguayan coat of arms, in use from 1842 until 1954. The obverse is shown; the reverse traditionally carried a different emblem.

### `persia-qajar` — Qajar Persian tricolour with the lion and sun

- **Flag kind:** pre-standardization-representative
- **Polities:** `PER` (ID 28)
- **Validity:** 1850-01-01 – 1907-10-07
- **Source:** [File:Qajar Persia Flag.jpg](https://commons.wikimedia.org/wiki/File:Qajar_Persia_Flag.jpg)
- **License:** CC0 (cc0) — https://creativecommons.org/publicdomain/zero/1.0/
- **Author:** Weirdsongs
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/0/03/Qajar_Persia_Flag.jpg) (1668×554; SHA-1 `6b0e2ddac28c45c6101fc13419d41965cacd96c8`)
- **Historical accuracy:** Green-white-red tricolour with the lion and sun, the Qajar state flag. The 1907 flag law standardised the design; in 1900 the same elements were in use without a detailed legal specification. The start date is a conservative year-level approximation for the mid-nineteenth-century Qajar tricolour.

### `peru-1884` — State flag of Peru with the coat of arms

- **Flag kind:** exact-national
- **Polities:** `PRU` (ID 47)
- **Validity:** 1884-01-01 – 1950-07-31
- **Source:** [File:Flag of Peru (1884–1950).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Peru_(1884%E2%80%931950).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Huhsunqu
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/99/Flag_of_Peru_%281884%E2%80%931950%29.svg) (900×600; SHA-1 `50688f9e1cb018198fc6bf88c8bc3e3db4e39747`)
- **Historical accuracy:** Red-white-red vertical triband with the Peruvian coat of arms, the state flag from 1884 to 1950.

### `portugal-1830` — Blue-white flag of the Kingdom of Portugal with the royal arms

- **Flag kind:** exact-national
- **Polities:** `PRT` (ID 8), `ANG` (ID 138), `MOZ` (ID 139), `PAI` (ID 140), `PTM` (ID 141), `MAC` (ID 142)
- **Validity:** 1830-07-01 – 1910-10-05
- **Source:** [File:Flag of Portugal (1830–1910).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Portugal_(1830%E2%80%931910).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Tonyjeff , based on ancient national symbol.
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/2/24/Flag_of_Portugal_%281830%E2%80%931910%29.svg) (2100×1400; SHA-1 `0bcc922cc3305450c34a0e13238c7f03d16fd6f4`)
- **Historical accuracy:** Blue and white vertical bicolour with the royal arms, used by the constitutional monarchy from 1830 until the republic was proclaimed on 5 October 1910. Not the modern green-red flag.

### `qing-1889` — Yellow dragon flag of the Qing Empire

- **Flag kind:** exact-national
- **Polities:** `CHN` (ID 26), `TIB` (ID 162)
- **Validity:** 1889-01-01 – 1912-02-12
- **Source:** [File:Flag of China (1889–1912).svg](https://commons.wikimedia.org/wiki/File:Flag_of_China_(1889%E2%80%931912).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Original: zh:清朝政府 Vector: Sodacan
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/b/b6/Flag_of_China_%281889%E2%80%931912%29.svg) (512×341; SHA-1 `1fa7ab71045f183034233831f5c3bab78dd69694`)
- **Historical accuracy:** Yellow field with the blue five-clawed dragon and red flaming pearl, the Qing national flag from 1889 until the abdication of 1912. Not the modern flag of China.

### `romania-1867` — Blue-yellow-red flag of Romania

- **Flag kind:** civil-national
- **Polities:** `ROM` (ID 18)
- **Validity:** 1867-04-22 – 1948-01-03
- **Source:** [File:Flag of Romania (1867–1948).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Romania_(1867%E2%80%931948).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Flag_of_Romania.svg : AdiJapan derivative work: Anime Addict AA ( talk )
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/2/28/Flag_of_Romania_%281867%E2%80%931948%29.svg) (450×300; SHA-1 `8d4c8818d80668ba707b9ecb7ccb79d8c4373a4c`)
- **Historical accuracy:** Vertical blue-yellow-red tricolour, the Romanian national flag from 1867 until the republic. The plain tricolour is shown; the state flag carried the coat of arms.

### `russia-1896` — White-blue-red flag of the Russian Empire

- **Flag kind:** exact-national
- **Polities:** `RUS` (ID 4), `FIN` (ID 160), `KHI` (ID 163), `BUK` (ID 164)
- **Validity:** 1896-05-29 – 1917-11-07
- **Source:** [File:Flag of Russia.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Russia.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Peter the Great
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/f/f3/Flag_of_Russia.svg) (900×600; SHA-1 `82d5af67d5fa23efd124d8a24941f7cc615907d4`)
- **Historical accuracy:** White-blue-red horizontal tricolour, confirmed as the Russian national flag by Nicholas II's decree of 1896 and used until the revolution of 1917.

### `san-marino-1862` — White and blue flag of San Marino with the coat of arms

- **Flag kind:** exact-national
- **Polities:** `SMR` (ID 23)
- **Validity:** 1862-01-01 – 2011-07-22
- **Source:** [File:Flag of San Marino (pre–2011).svg](https://commons.wikimedia.org/wiki/File:Flag_of_San_Marino_(pre%E2%80%932011).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Flag_of_San_Marino.svg : derivative work: Fry1989 eh? 02:30, 10 September 2011 (UTC)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/0/0c/Flag_of_San_Marino_%28pre%E2%80%932011%29.svg) (1280×960; SHA-1 `2c668e88f8e0dc14859de6a82d891818e2100dcd`)
- **Historical accuracy:** White over light-blue bicolour charged with the Sammarinese coat of arms, the flag in use from the nineteenth century until the 2011 revision. The pre-2011 arms are the period-appropriate representation for 1900.

### `serbia-civil` — Civil flag of the Kingdom of Serbia

- **Flag kind:** civil-national
- **Polities:** `SRB` (ID 16)
- **Validity:** 1882-03-06 – 1918-12-01
- **Source:** [File:Civil flag of Serbia.svg](https://commons.wikimedia.org/wiki/File:Civil_flag_of_Serbia.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** National Assembly of the Republic of Serbia (Serbian Parliament)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/3/36/Civil_flag_of_Serbia.svg) (900×600; SHA-1 `eaa2cb46de4f5918cdb2a7aa9ac8b7ebc6a4b315`)
- **Historical accuracy:** Red-blue-white horizontal tricolour, the Serbian civil/national flag. The state flag of the Kingdom of Serbia (1882–1918) additionally bore the royal coat of arms; that artwork is CC BY-SA on Commons and is not bundled.

### `siam-1855` — Red flag of Siam with the white elephant

- **Flag kind:** exact-national
- **Polities:** `THA` (ID 31)
- **Validity:** 1855-01-01 – 1916-01-01
- **Source:** [File:Flag of Siam (1855).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Siam_(1855).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Xiengyod & Sodacan i
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/f/fc/Flag_of_Siam_%281855%29.svg) (900×600; SHA-1 `0e1868fa287cb94bd082caa5a5a9974a3131b551`)
- **Historical accuracy:** Red field with a white elephant, adopted by King Mongkut (Rama IV) in 1855 and used until the 1916 change to the elephant in royal regalia. This is the flag of Siam on 1 January 1900.

### `sokoto` — Green flag of the Sokoto Caliphate

- **Flag kind:** exact-national
- **Polities:** `SOK` (ID 62)
- **Validity:** 1804-01-01 – 1903-03-01
- **Source:** [File:Flag of the Sokoto Caliphate.svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_Sokoto_Caliphate.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Orange Tuesday
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/0/04/Flag_of_the_Sokoto_Caliphate.svg) (600×400; SHA-1 `4949d00691e0ad1603d789fa21ce64bb8ed70ddf`)
- **Historical accuracy:** Plain green flag of the Sokoto Caliphate, the Fulani-led Islamic state in the central Sudan. It was de facto independent with limited international recognition and was conquered by British forces in 1903. Some sources describe variants with a crescent or inscriptions; the plain green field is the verified Commons representation.

### `spain-restoration` — Restoration-era Spanish state flag (red–yellow–red with the coat of arms)

- **Flag kind:** project-reconstruction
- **Polities:** `ESP` (ID 7), `SAH` (ID 148), `SGG` (ID 149)
- **Validity:** 1875-01-01 – 1931-04-14
- **Source:** project-authored reconstruction (design `spain-restoration`), not an externally sourced image.
- **License:** Project-authored (CC0 dedication) (project) — internal:docs/FLAG_PROVENANCE.md#project-artwork
- **Author:** Fabric of Nations project (reconstruction)
- **Retrieved:** 2026-10-30
- **Component:** coat-of-arms — [File:Flag version of the Coat of arms of Spain (1785-1873 & 1875-1931.png](https://commons.wikimedia.org/wiki/File:Flag_version_of_the_Coat_of_arms_of_Spain_(1785-1873_%26_1875-1931.png); Public domain (pd); author Buho07; SHA-256 `fc319cf7a0dff915cb188ba37abe9481f887f65e133fd7f6b6a30ad4005596d9`.
- **Source file:** built by `scripts/m11/build-flags.mjs` at 1000×667; no external flag file is redistributed.
- **Historical accuracy:** The Spanish state flag of the Restoration (1875–1931) was red–yellow–red with the royal coat of arms. No Public Domain or CC0 file of that exact state flag was available; the plain triband was not the 1900 state flag (it became the merchant flag only in 1927). This is a project-authored composition: a red–yellow–red field with the individually verified Public Domain flag-version coat of arms (Castile–León and the royal crown). The composition and its raster rendering are Fabric of Nations' work, not a copy of any share-alike flag file.

### `sweden-1844` — Swedish union flag with the Norway-Sweden union badge

- **Flag kind:** national-with-union-badge
- **Polities:** `SWE` (ID 12)
- **Validity:** 1844-06-20 – 1905-11-01
- **Source:** [File:Swedish civil ensign (1844–1905).svg](https://commons.wikimedia.org/wiki/File:Swedish_civil_ensign_(1844%E2%80%931905).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Jeltz
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/4/4b/Swedish_civil_ensign_%281844%E2%80%931905%29.svg) (1200×750; SHA-1 `0997787cecec903a557ce84d33e63acd8703e435`)
- **Historical accuracy:** Blue flag with a yellow Nordic cross and the union badge in the canton, used by Sweden from 1844 until the dissolution of the union. Sweden retained the badge in all flags until 1 November 1905; Norway had already removed it from its national flag.

### `switzerland` — Square red flag with the white Swiss cross

- **Flag kind:** exact-national
- **Polities:** `CHE` (ID 11)
- **Validity:** 1848-09-12 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Switzerland.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Switzerland.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Original: Unknown Vector: User:Marc Mongenet Credits: User:-xfi- User:Zscout370
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/f/f3/Flag_of_Switzerland.svg) (512×512; SHA-1 `b59554bc284833d9f890531c537d862210d2215f`)
- **Historical accuracy:** Federal flag of Switzerland: a white cross on red. The Swiss national flag is square (1:1), unlike most national flags. The design was confirmed by the federal constitution of 1848.

### `tonga` — Flag of the Kingdom of Tonga

- **Flag kind:** exact-national
- **Polities:** `TON` (ID 61)
- **Validity:** 1862-11-04 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Tonga.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Tonga.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Uelingatoni Ngu Tupoumalohi
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/9/9a/Flag_of_Tonga.svg) (960×480; SHA-1 `943cafb933917bacf6f65a0d6f3017d0c74c95f9`)
- **Historical accuracy:** Red flag with a white canton bearing a red cross, adopted by King George Tupou I in 1862. Tonga was an independent kingdom on 1 January 1900 and became a British protectorate later in 1900 (Treaty of Friendship, 18 May 1900).

### `transvaal-vierkleur` — Vierkleur of the South African Republic (Transvaal)

- **Flag kind:** project-reconstruction
- **Polities:** `ZAR` (ID 36)
- **Validity:** 1857-02-28 – 1902-05-31
- **Source:** project-authored reconstruction (design `transvaal-vierkleur`), not an externally sourced image.
- **License:** Project-authored (CC0 dedication) (project) — internal:docs/FLAG_PROVENANCE.md#project-artwork
- **Author:** Fabric of Nations project (reconstruction)
- **Retrieved:** 2026-10-30
- **Source file:** built by `scripts/m11/build-flags.mjs` at 1000×667; no external flag file is redistributed.
- **Historical accuracy:** The South African Republic (Transvaal) Vierkleur: a green vertical stripe at the hoist and red, white and blue horizontal stripes in the fly. This is an original project-authored reconstruction from the documented 1857–1902 design. The available Commons Vierkleur vector is CC BY-SA and was not used or traced.

### `uk-union-1801` — Union Flag of Great Britain and Ireland

- **Flag kind:** exact-national
- **Polities:** `GBR` (ID 1), `AUS` (ID 57), `NZL` (ID 58), `BIN` (ID 100), `CEY` (ID 101), `MAL` (ID 102), `HKG` (ID 103), `KUW` (ID 104), `TRU` (ID 105), `CYP` (ID 106), `MLT` (ID 107), `BWI` (ID 108), `BSA` (ID 109), `BWA` (ID 110), `BEA` (ID 111), `SUD` (ID 112), `BSO` (ID 113), `CRA` (ID 114), `HCT` (ID 115), `FJI` (ID 116), `BPO` (ID 117), `CAP` (ID 118), `NAT` (ID 119), `NFD` (ID 120), `BHU` (ID 159), `SAR` (ID 165)
- **Validity:** 1801-01-01 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of the United Kingdom.svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_United_Kingdom_(3-5).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Original: Acts of Union 1800 Vector: Yaddah
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/8/83/Flag_of_the_United_Kingdom_%283-5%29.svg) (1000×600; SHA-1 `18b6a6db1e9d736dbf26182edbe63b299134fd7c`)
- **Historical accuracy:** The Union Flag after the Act of Union 1800. In 1900 it was the official national flag of the United Kingdom and the Empire, and the national flag of Australia (federation on 1 January 1901) and New Zealand (which adopted its own ensign in 1902). It is also the sovereign flag used for British colonies and protectorates in this catalog.

### `uruguay` — Flag of Uruguay

- **Flag kind:** exact-national
- **Polities:** `URY` (ID 51)
- **Validity:** 1830-07-11 – no end date recorded (in use on 1 January 1900)
- **Source:** [File:Flag of Uruguay.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Uruguay.svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Not stated on the source file (public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/f/fe/Flag_of_Uruguay.svg) (512×341; SHA-1 `61484b40376000c504e8ba273d4d521727c78749`)
- **Historical accuracy:** Nine white and blue horizontal stripes with a white canton bearing the Sun of May, adopted in 1830.

### `usa-45-star` — United States flag with 45 stars

- **Flag kind:** exact-national
- **Polities:** `USA` (ID 0), `PHL` (ID 150), `PRI` (ID 151), `GUM` (ID 152), `ASM` (ID 153)
- **Validity:** 1896-07-04 – 1908-07-03
- **Source:** [File:Flag of the United States (1896-1908).svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_United_States_(1896%E2%80%931908).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Jacobolus (per the file description; Commons' author field is auto-assumed)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/d/d5/Flag_of_the_United_States_%281896%E2%80%931908%29.svg) (1235×650; SHA-1 `8dd50c30ba488dbfe420c33adfe92f4d172f9571`)
- **Historical accuracy:** Forty-five-star flag after Utah's admission (4 July 1896) until Oklahoma's star (46 stars) took effect on 4 July 1908. The 1818 Flag Act did not prescribe a star arrangement; this rendition uses a period-appropriate star field. Not the modern 50-star flag.

### `venezuela-1863` — Flag of the United States of Venezuela with seven stars

- **Flag kind:** national-form
- **Polities:** `VEN` (ID 45)
- **Validity:** 1863-03-29 – 1905-03-28
- **Source:** [File:Flag of Venezuela (1863–1905).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Venezuela_(1863%E2%80%931905).svg)
- **License:** Public domain (pd) — https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain
- **Author:** Not stated on the source file (public-domain flag design)
- **Retrieved:** 2026-10-30
- **Source file:** [original](https://upload.wikimedia.org/wikipedia/commons/b/b4/Flag_of_Venezuela_%281863%E2%80%931905%29.svg) (900×600; SHA-1 `7ab5ea8731128165a2c25aa62a0550e159a20ed1`)
- **Historical accuracy:** Yellow-blue-red tricolour with seven white stars, the national flag of the United States of Venezuela from 1863 until 1905. The state flag of the period additionally bore the coat of arms; this file shows the national form.

### `wadai-user-selected` — User-selected representative flag of the Sultanate of Wadai

- **Flag kind:** user-selected-representative
- **Polities:** `WAD` (ID 63)
- **Validity:** 1900 – no end date recorded (in use on 1 January 1900)
- **Source:** project-authored reconstruction (design `wadai-user-selected`), not an externally sourced image.
- **License:** Project-authored reconstruction; dedicated to the public domain by Fabric of Nations (project) — internal:docs/FLAG_PROVENANCE.md#user-selected-representative-flags
- **Author:** Fabric of Nations project (original geometric reconstruction; design selected by the user from Pax Historia)
- **Retrieved:** 2026-10-30
- **Source file:** built by `scripts/m11/build-flags.mjs` at 1000×667; no external flag file is redistributed.
- **Historical accuracy:** User-selected design (white field enclosed by a thin black border). It is a representative design chosen for the 1900 scenario, not an exact historical national flag with contemporary documentation. The original Pax Historia raster is not bundled; Fabric of Nations reconstructed the simple geometric design independently because redistribution permission for the raster could not be established.

## Monogram fallbacks

A monogram is retained when no historically correct flag artwork can be established from verified PD/CC0 files or a documented project-authored reconstruction. The existing political-status badges remain visible, and the monogram uses the polity's existing national colour.

| Polity | ID | Status | Reason |
| --- | ---: | --- | --- |

M11c re-checked both cases against FOTW and the Wikimedia Commons file search. The evidence supports retaining the monograms: the only available designs are modern reconstructions, military standards or post-1900 movement flags. The map now gives both polities real territorial polygons, so the monogram is the only remaining representation fallback, not a marker-only map entry.

## Dependencies: sovereign flag plus status badge

Dependent territories do not receive invented national flags. By default they display the historically appropriate flag of the sovereign power together with the existing political-status badge (colony, protectorate, occupation, autonomous province, dependency, dominion). The table below records every dependency and any documented exception.

| Polity | ID | Status | Sovereign | Flag | Basis |
| --- | ---: | --- | --- | --- | --- |
| British India (`BIN`) | 100 | colony | GBR | `uk-union-1801` | sovereign-flag |
| Ceylon (`CEY`) | 101 | colony | GBR | `uk-union-1801` | sovereign-flag |
| British Malaya and Singapore (`MAL`) | 102 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| Hong Kong (`HKG`) | 103 | colony | GBR | `uk-union-1801` | sovereign-flag |
| Kuwait (`KUW`) | 104 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| Trucial States (`TRU`) | 105 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| Cyprus (`CYP`) | 106 | colony | GBR | `uk-union-1801` | sovereign-flag |
| Malta (`MLT`) | 107 | colony | GBR | `uk-union-1801` | sovereign-flag |
| British West Indies (`BWI`) | 108 | colony | GBR | `uk-union-1801` | sovereign-flag |
| British South Atlantic and Pacific islands (`BSA`) | 109 | colony | GBR | `uk-union-1801` | sovereign-flag |
| British West Africa (`BWA`) | 110 | colony | GBR | `uk-union-1801` | sovereign-flag |
| British East Africa (`BEA`) | 111 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| Anglo-Egyptian Sudan (`SUD`) | 112 | colony | GBR | `uk-union-1801` | sovereign-flag |
| British Somaliland (`BSO`) | 113 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| British Central Africa (`CRA`) | 114 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| High Commission Territories (`HCT`) | 115 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| Fiji (`FJI`) | 116 | colony | GBR | `uk-union-1801` | sovereign-flag |
| British Pacific and Indian Ocean islands (`BPO`) | 117 | colony | GBR | `uk-union-1801` | sovereign-flag |
| Cape Colony (`CAP`) | 118 | colony | GBR | `uk-union-1801` | sovereign-flag |
| Natal (`NAT`) | 119 | colony | GBR | `uk-union-1801` | sovereign-flag |
| Newfoundland (`NFD`) | 120 | dominion | GBR | `uk-union-1801` | sovereign-flag |
| Algeria (`ALG`) | 121 | colony | FRA | `france-tricolour` | sovereign-flag |
| Tunisia (`TUN`) | 122 | protectorate | FRA | `france-tricolour` | sovereign-flag |
| French West Africa (`FWA`) | 123 | colony | FRA | `france-tricolour` | sovereign-flag |
| French Equatorial Africa (`FEA`) | 124 | colony | FRA | `france-tricolour` | sovereign-flag |
| French Indochina (`FIC`) | 125 | colony | FRA | `france-tricolour` | sovereign-flag |
| French Madagascar (`MAD`) | 126 | colony | FRA | `france-tricolour` | sovereign-flag |
| French Somaliland (`FSO`) | 127 | colony | FRA | `france-tricolour` | sovereign-flag |
| French Caribbean (`FCA`) | 128 | colony | FRA | `france-tricolour` | sovereign-flag |
| French Pacific (`FPO`) | 129 | colony | FRA | `france-tricolour` | sovereign-flag |
| German East Africa (`GEA`) | 130 | colony | DEU | `germany-1867` | sovereign-flag |
| German South West Africa (`GSW`) | 131 | colony | DEU | `germany-1867` | sovereign-flag |
| Kamerun (`KAM`) | 132 | colony | DEU | `germany-1867` | sovereign-flag |
| Togo (`TOG`) | 133 | colony | DEU | `germany-1867` | sovereign-flag |
| German New Guinea (`GNG`) | 134 | colony | DEU | `germany-1867` | sovereign-flag |
| German Samoa (`GSA`) | 135 | colony | DEU | `germany-1867` | sovereign-flag |
| German Pacific islands (`GPN`) | 136 | colony | DEU | `germany-1867` | sovereign-flag |
| Congo Free State (`CFS`) | 137 | colony | BEL | `belgium` | sovereign-flag |
| Portuguese Angola (`ANG`) | 138 | colony | PRT | `portugal-1830` | sovereign-flag |
| Portuguese Mozambique (`MOZ`) | 139 | colony | PRT | `portugal-1830` | sovereign-flag |
| Portuguese Atlantic islands (`PAI`) | 140 | colony | PRT | `portugal-1830` | sovereign-flag |
| Portuguese Timor (`PTM`) | 141 | colony | PRT | `portugal-1830` | sovereign-flag |
| Macao (`MAC`) | 142 | colony | PRT | `portugal-1830` | sovereign-flag |
| Italian Eritrea (`ERI`) | 143 | colony | ITA | `italy-1861` | sovereign-flag |
| Italian Somaliland (`ITS`) | 144 | colony | ITA | `italy-1861` | sovereign-flag |
| Dutch East Indies (`DEI`) | 145 | colony | NLD | `netherlands` | sovereign-flag |
| Suriname (`SUR`) | 146 | colony | NLD | `netherlands` | sovereign-flag |
| Dutch Caribbean (`DGC`) | 147 | colony | NLD | `netherlands` | sovereign-flag |
| Spanish Sahara (`SAH`) | 148 | colony | ESP | `spain-restoration` | sovereign-flag |
| Spanish Guinea (`SGG`) | 149 | colony | ESP | `spain-restoration` | sovereign-flag |
| Philippine Islands (`PHL`) | 150 | colony | USA | `usa-45-star` | sovereign-flag |
| Puerto Rico (`PRI`) | 151 | colony | USA | `usa-45-star` | sovereign-flag |
| Guam (`GUM`) | 152 | colony | USA | `usa-45-star` | sovereign-flag |
| American Samoa (`ASM`) | 153 | colony | USA | `usa-45-star` | sovereign-flag |
| Iceland (`ISL`) | 154 | dependency | DNK | `denmark` | sovereign-flag |
| Greenland (`GRL`) | 155 | dependency | DNK | `denmark` | sovereign-flag |
| Faroe Islands (`FRO`) | 156 | dependency | DNK | `denmark` | sovereign-flag |
| Danish West Indies (`DWI`) | 157 | colony | DNK | `denmark` | sovereign-flag |
| Egypt (`EGY`) | 158 | autonomous-province | OTT | `egypt-1882` | documented-exception |
| Bhutan (`BHU`) | 159 | protectorate | GBR | `uk-union-1801` | sovereign-flag |
| Grand Duchy of Finland (`FIN`) | 160 | autonomous-province | RUS | `russia-1896` | sovereign-flag |
| Taiwan (Formosa) (`TWN`) | 161 | colony | JPN | `japan-1870` | sovereign-flag |
| Tibet (`TIB`) | 162 | autonomous-province | CHN | `qing-1889` | sovereign-flag |
| Khanate of Khiva (`KHI`) | 163 | protectorate | RUS | `russia-1896` | sovereign-flag |
| Emirate of Bukhara (`BUK`) | 164 | protectorate | RUS | `russia-1896` | sovereign-flag |
| Raj of Sarawak (`SAR`) | 165 | protectorate | GBR | `uk-union-1801` | sovereign-flag |

## Verification targets

- **United States** — `usa-45-star`: 45 stars, in use 4 July 1896 – 3 July 1908. The 50-star flag is not used.
- **German Empire** — `germany-1867`: black-white-red (1867–1918), not the modern black-red-gold.
- **Russian Empire** — `russia-1896`: white-blue-red, confirmed by the 1896 imperial decree.
- **Siam** — `siam-1855`: red field with the white elephant, in use 1855–1916.
- **Qing Empire** — `qing-1889`: yellow dragon flag, in use 1889–1912.
- **Ottoman Empire** — `ottoman-1844`: red field with white crescent and five-pointed star, the 1844–1922 design.
- **Canada** — `canada-red-ensign-1868`: the Red Ensign with the 1868 shield, used unofficially from 1870 and approved for use at sea in 1892; the Union Jack remained the official national flag, and the modern maple-leaf flag is not used.
- **Australia** — `uk-union-1801`: the Union Jack. Australian federation took effect on 1 January 1901, and the Commonwealth blue ensign first flew on 3 September 1901.
- **Transvaal / South African Republic** — `transvaal-vierkleur`: an original Fabric of Nations reconstruction of the 1857–1902 Vierkleur, built from the documented design. The Commons Vierkleur file is CC BY-SA and was neither used nor traced.
- **Orange Free State** — `orange-free-state`: the 1857–1902 Orange Free State flag (orange and white stripes with the Netherlands flag in the canton).
- **Austria-Hungary** — `austria-hungary-civil-ensign`: the common civil ensign of 1869–1918, combining the Austrian red-white-red and Hungarian red-white-green halves with both coats of arms. The dual monarchy had no single unified national flag; the manifest and this document record that distinction. The polity is a single catalog state, not two independent countries.
- **Spain** — `spain-restoration`: a project-authored red–yellow–red reconstruction with the individually verified PD Restoration-era coat of arms. The Spanish colonies SAH and SGG use the same sovereign flag with their colony status badges.
- **Montenegro** — `montenegro-1881`: the verified PD red–blue–white national flag with the princely monogram, documented 1881–1905. The 1878 war ensign is not used as the national flag.
- **Tonga, Sokoto, Ha'il, Crete** — period flags verified on Commons (PD) and recorded with exact/representative flag-kind metadata.

## Offline and runtime guarantees

All PNGs are committed under `packages/app/assets/flags/` and referenced through static imports in `packages/app/src/generated/flagAssets.ts`. The normal game build and `pnpm flags:check` do not access the network. The mapping is keyed by stable numeric polity IDs from `polities_1900.json`; renaming a polity cannot change its flag.

## Reproducing and verifying the assets

```bash
pnpm flags:build    # network: retrieve, verify, convert and rewrite assets, ledger and generated files
pnpm flags:check    # offline: verify committed assets, hashes and generated outputs
pnpm flags:audit    # network: re-verify every Commons licence, author and source SHA-1
pnpm flags:update   # network: deliberately accept a changed rendition and rewrite the ledger
```

## Remaining limitations and unresolved questions

- Wadai (WAD) and Darfur (DAR) remain documented monogram exceptions: no verified historical national/state flag design could be established, and no PD/CC0 artwork documents one. Their independence and reconstructed territories are represented on the map; the flag monogram is a representation fallback only.
- Austria-Hungary's M11c map geometry now includes reconstructed Galicia, Bukovina, Transylvania, Banat, Vojvodina, South Tyrol, Trieste/Gorizia, Kotor and Cieszyn Silesia; the external frontier is documented in `docs/HISTORICAL_MAP_PROVENANCE.md`.
- Sokoto, Wadai, Darfur, Ha'il, Crete, Tonga, Tibet, Khiva, Bukhara and Sarawak no longer use marker-only map integration. M11c gives every one a reconstructed 1900 polygon with provenance and confidence; no marker-only polity remains.
- Several states used a plain civil/national tricolour while the state flag carried a coat of arms available only under CC BY-SA on Commons (Serbia, Romania, Bulgaria, Greece). The plain national flag is bundled with a note; the state-flag variant is deliberately not bundled.
- Ecuador's plain tricolour is shown because the coat of arms became mandatory for the state flag only on 5 December 1900, after the reference date.
- Brazil's star field changed as states were admitted; the bundled 1889–1960 rendition follows the period design rather than a star-by-star 1900 reconstruction.
- Persia's Qajar lion-and-sun tricolour was not legally standardised until 1905–1907; the bundled CC0 1886 artwork is period-appropriate, and the note records the lack of a detailed 1900 specification.
- Canada's Red Ensign was the distinctive de facto flag, while the Union Jack remained the official national flag in 1900; both facts are recorded.
