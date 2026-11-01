# M12a — European Provincialization (1 January 1900)

Status: implemented. This document is generated from the committed province
bundle and audit; the bundle and the code are authoritative if they disagree.

## 1. Scope and architecture

- The only geographical subdivision beneath a polity is the **Province**. There
  is no Polity → Region → Province hierarchy and no parallel geographical region
  layer.
- The historical simulation `Region` is a population/economy accounting unit,
  not a geographical entity. It is preserved as `SimulationRegion` (with the
  existing runtime field name `regions` kept for save compatibility) and is
  never used to draw or hit-test territory. See DECISIONS D-103.
- A province has a stable numeric id, a stable key, a historical 1900 name, a
  display name, aliases, a 1900 owner polity id, a simulation-region reference,
  historical administrative affiliation and optional grouping, provenance
  sources, a confidence class and notes.
- Political state is separate from geography: legal owner, effective controller,
  occupation date, formal claims and special status are mutable; the geometry,
  id and name never change. A province split is an explicit data change with a
  new id and documented coverage, not dynamic geometry surgery.
- Country borders are reconstructed from current provincial ownership. The map
  draws province fills by current owner; every internal province edge is a quiet
  solid white hairline; a thin near-black country border is drawn only where the
  two neighbouring provinces have different current owners. Province boundaries
  therefore remain visible between provinces of the same country. The country
  border weight matches the established non-European polity borders.
- Non-European territories are outside this milestone. The M11c 1900 polity
  polygons remain the underlay for colonies, Asiatic Russia, Anatolia and other
  non-European areas.

## 2. Inventory summary

- Provinces: **570**.
- 1900 owner polities with at least one province: **26**.
- Future successor polities in the registry: **17**.
- Unique province ids/keys: **yes**.
- Border pairs: **1528**; shared border segments: **32981**; segments with more than two neighbours: **2**.
- Significant province-pair overlaps (area > 0.005 deg²): **38** (largest documented in the audit file; all are small, mostly at authored clip seams).
- Confidence: low **38**, medium **307**, high **225**.

## 3. Method and geometry provenance

The build uses modern Natural Earth 1:10m admin-1 units **only as internal
geometry blocks**. Every province is clipped to its authored M11c 1900 polity
polygon (`packages/data/data/map/world_map_1900.json`). Where a later border cut
through a 1900 administrative unit, the province is split along the later border
and the approximation is labelled low or medium confidence. The output is
simplified at 0.02° and quantized to thousandths of a degree,
matching the M11c world map.

The committed build products are:

- `packages/data/data/map/provinces_1900.json` — province metadata, geometry, shared boundaries and future polities.
- `packages/data/data/map/provinces_1900_audit.json` — coverage, overlaps, ids, source count and warnings.
- `packages/app/src/generated/provinces1900.ts` — the same bundle for the offline app.
- `scripts/m12/province-plan.mjs` — the authored historical inventory and clip rules.
- `scripts/m12/build-provinces.mjs` — the deterministic geometry build.

## 4. Sources

| ID | Title | Licence | Date | URL |
|---|---|---|---|---|
| `natural-earth-10m-admin1` | Natural Earth 1:10m admin-1 states and provinces | Public domain | 2024 | https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/ |
| `natural-earth-50m-admin0` | Natural Earth 1:50m admin-0 countries | Public domain | 2024 | https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/ |
| `eb1911-austria` | Encyclopaedia Britannica (1911), 'Austria-Hungary' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Austria-Hungary |
| `eb1911-germany` | Encyclopaedia Britannica (1911), 'Germany' and 'Prussia' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Germany |
| `eb1911-russia` | Encyclopaedia Britannica (1911), 'Russia' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Russia |
| `eb1911-poland` | Encyclopaedia Britannica (1911), 'Poland' and 'Russia' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Poland |
| `eb1911-united-kingdom` | Encyclopaedia Britannica (1911), 'United Kingdom' and 'Ireland' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/United_Kingdom |
| `treaty-versailles-1919` | Treaty of Versailles (1919), territorial clauses | Public domain | 1919 | https://en.wikisource.org/wiki/Treaty_of_Versailles |
| `treaty-saint-germain-1919` | Treaty of Saint-Germain (1919), Austro-Hungarian territorial clauses | Public domain | 1919 | https://en.wikisource.org/wiki/Treaty_of_Saint-Germain-en-Laye |
| `treaty-trianon-1920` | Treaty of Trianon (1920), Hungarian territorial clauses | Public domain | 1920 | https://en.wikisource.org/wiki/Treaty_of_Trianon |
| `treaty-lausanne-1923` | Treaty of Lausanne (1923), Ottoman successor boundaries | Public domain | 1923 | https://en.wikisource.org/wiki/Treaty_of_Lausanne |
| `treaty-of-london-1915` | Treaty of London (1915) and the Adriatic settlement | Public domain | 1915 | https://en.wikisource.org/wiki/Treaty_of_London_(1915) |
| `potdam-1945` | Potsdam Agreement (1945), German territorial clauses | Public domain | 1945 | https://en.wikisource.org/wiki/Potsdam_Agreement |
| `basic-law-1949` | Basic Law for the Federal Republic of Germany (1949) and GDR constitution | Public domain | 1949 | https://en.wikisource.org/wiki/Basic_Law_for_the_Federal_Republic_of_Germany |
| `two-plus-four-1990` | Treaty on the Final Settlement with Respect to Germany (1990) | Public domain | 1990 | https://en.wikisource.org/wiki/Treaty_on_the_Final_Settlement_with_Respect_to_Germany |
| `project-authored-1900` | Century M11c authored 1900 boundary reconstruction | Project data | 2026 | internal:packages/data/data/historical/m11/boundaries_1900.json |
| `project-authored-m12` | Century M12a authored provincial partition | Project data | 2026 | internal:scripts/m12/province-plan.mjs |

## 5. Completeness

The 1900 European polities in the M11c catalog all receive provinces. Coverage is
measured by subtracting each province from its 1900 map polity polygon. Slivers
below the residual threshold are reported rather than promoted into duplicate
provinces: they remain under the 1900 polity fill, which is still drawn beneath
the province layer. `estimated` rows are cases where polygonal difference
exceeded the geometry library's limits; their residual is approximated by area.

| Map feature | 1900 scope (deg²) | Covered by provinces (deg²) | Residual |
|---|---:|---:|---:|
| AND | 0.05 | 0.05 | 0.00 |
| AUT | 81.36 | 80.45 | 0.90 |
| BEL | 3.76 | 3.67 | 0.08 |
| BGR | 11.52 | 11.41 | 0.11 |
| CHE | 4.87 | 4.73 | 0.14 |
| CRT | 0.78 | 0.78 | 0.00 |
| CYP | 0.90 | 0.90 | 0.00 |
| DEU | 70.77 | 69.29 | 1.49 |
| DNK | 5.46 | 5.09 | 0.37 |
| ESP | 53.04 | 52.56 | 0.48 |
| FIN | 62.29 | 61.78 | 0.51 |
| FRA | 62.50 | 23.36 | 39.14 (estimated) |
| FRO | 0.17 | 0.17 | 0.00 |
| GBR | 42.39 | 25.03 | 17.35 (estimated) |
| GRC | 6.69 | 5.26 | 1.43 (estimated) |
| GRL | 663.71 | 663.70 | 0.01 |
| ISL | 19.33 | 19.33 | 0.00 |
| ITA | 31.49 | 6.61 | 24.88 (estimated) |
| LIE | 0.02 | 0.02 | 0.00 |
| LUX | 0.33 | 0.32 | 0.01 |
| MCO | 0.00 | 0.00 | 0.00 |
| MLT | 0.03 | 0.03 | 0.00 |
| MNT | 1.06 | 1.03 | 0.03 |
| NLD | 4.86 | 4.74 | 0.12 |
| NOR | 86.32 | 47.88 | 38.44 (estimated) |
| OTT | 18.02 | 16.49 | 1.53 |
| PRT | 9.24 | 9.06 | 0.18 |
| ROM | 15.45 | 13.80 | 1.65 |
| RUS | 703.38 | 679.80 | 23.58 |
| SMR | 0.01 | 0.01 | 0.00 |
| SRB | 5.80 | 5.71 | 0.09 |
| SWE | 78.46 | 77.73 | 0.72 |

## 6. Future successor polities

None of these polities is selectable in 1900. They can receive provinces through
an ownership transfer. Activation dates are stored as campaign day indices.

| ID | Tag | Historical name | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|
| 1000 | POL | Republic of Poland | independent | 1918-11-11 | — | Warsaw | high |
| 1001 | CZE | Czechoslovak Republic | independent | 1918-10-28 | 1992-12-31 | Prague | high |
| 1002 | YUG | Kingdom of Serbs, Croats and Slovenes | independent | 1918-12-01 | 2000-01-01 | Belgrade | high |
| 1003 | FIN | Republic of Finland | independent | 1917-12-06 | — | Helsinki | high |
| 1004 | EST | Republic of Estonia | independent | 1918-02-24 | — | Tallinn | high |
| 1005 | LVA | Republic of Latvia | independent | 1918-11-18 | — | Riga | high |
| 1006 | LTU | Republic of Lithuania | independent | 1918-02-16 | — | Vilnius | high |
| 1007 | DDR | German Democratic Republic | independent | 1949-10-07 | 1990-10-03 | East Berlin | high |
| 1008 | FRG | Federal Republic of Germany | independent | 1949-05-23 | — | Bonn | high |
| 1009 | IRL | Irish Free State | independent | 1922-12-06 | — | Dublin | high |
| 1010 | AUT | Republic of Austria | independent | 1918-11-12 | — | Vienna | high |
| 1011 | HUN | Kingdom of Hungary | independent | 1918-11-16 | — | Budapest | high |
| 1012 | DAN | Free City of Danzig | independent | 1920-11-15 | 1939-09-01 | Danzig | medium |
| 1013 | ALB | Principality of Albania | independent | 1912-11-28 | — | Tirana | high |
| 1014 | UKR | Ukrainian People's Republic | independent | 1917-11-20 | — | Kyiv | high |
| 1015 | BLR | Belarusian People's Republic | independent | 1918-03-25 | — | Minsk | high |
| 1016 | MDA | Moldavian Democratic Republic | independent | 1917-12-15 | — | Chișinău | high |

## 7. Major historical transfers supported

Reference snapshots are validation references, not forced outcomes. They are
exercised by `packages/tests/src/m12a-provinces.test.ts`.

- **1918–1920**: Austria-Hungary transfers Bohemia, Moravia, Austrian Silesia,
  Hultschin, Slovakia and Carpathian Ruthenia to Czechoslovakia; Galicia and
  Cieszyn Silesia to Poland; Transylvania, Székely Land, Partium, Banat and
  Bukovina to Romania; Croatia-Slavonia, Bosnia-Herzegovina, Dalmatia, Carniola,
  Lower Styria, Bačka and Syrmia to Yugoslavia; the Trentino, South Tyrol,
  Trieste, Gorizia and Istria to Italy; the Austrian crown lands to Austria and
  the Hungarian core to Hungary.
- **1919–1923**: Alsace and Lorraine to France; northern Schleswig to Denmark;
  Eupen-Malmedy to Belgium; Posen, West Prussia and Upper Silesia to Poland;
  Danzig as a free city; Memel to Lithuania; the Saar as a League mandate under
  French control while ownership remains German.
- **1938–1939**: the province model supports any transfer sequence; no forced
  annexation is baked into the 1900 state.
- **1945**: northern East Prussia to the Soviet Union; southern East Prussia,
  Pomerania, Lower/Middle/Upper Silesia, the Lebus district and Danzig to Poland.
  The former eastern territories leave German sovereignty.
- **1949**: western provinces to the Federal Republic of Germany, eastern
  provinces to the German Democratic Republic, Berlin with a special status.
- **1990–1991**: the GDR's provinces accede to the Federal Republic; the former
  eastern territories are **not** restored. Finland, Estonia, Latvia, Lithuania,
  Poland, Ukraine, Belarus and Moldova can receive their provinces from Russia
  (and, for Finland, from the Grand Duchy).
- **Ireland**: the 26 counties transfer to the Irish Free State in 1922; the six
  counties of Northern Ireland remain with the United Kingdom.

## 8. Province inventory by 1900 owner

### Co-Principality of Andorra (AND) — 1 provinces

independent; 1900 population estimate 5000; geometry AND.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 24001 | `and-andorra` | Andorra | Co-Principality of Andorra | — | high |

### Austro-Hungarian Monarchy (AUT) — 53 provinces

independent; 1900 population estimate 51000000; geometry AUT, HUN, CZE, SVK, SVN, HRV, BIH.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 60001 | `aut-vienna` | Vienna | Austrian Crown Land | Austrian half | high |
| 60002 | `aut-lower-austria` | Lower Austria | Austrian Crown Land | Austrian half | high |
| 60003 | `aut-upper-austria` | Upper Austria | Austrian Crown Land | Austrian half | high |
| 60004 | `aut-salzburg` | Salzburg | Austrian Crown Land | Austrian half | high |
| 60005 | `aut-styria` | Styria | Austrian Crown Land | Austrian half | high |
| 60006 | `aut-carinthia` | Carinthia | Austrian Crown Land | Austrian half | high |
| 60007 | `aut-tyrol` | Tyrol | Austrian Crown Land | Austrian half | high |
| 60008 | `aut-vorarlberg` | Vorarlberg | Austrian Crown Land | Austrian half | high |
| 60009 | `aut-prague` | Prague | Austrian Crown Land (Bohemia) | Austrian half | high |
| 60010 | `aut-bohemia` | Bohemia | Austrian Crown Land | Austrian half | medium |
| 60011 | `aut-moravia` | Moravia | Austrian Crown Land | Austrian half | medium |
| 60012 | `aut-austrian-silesia` | Austrian Silesia | Austrian Crown Land | Austrian half | medium |
| 60013 | `aut-hultschin` | Hultschin | Austrian Crown Land (Silesia) | Austrian half | low |
| 60014 | `aut-western-galicia` | Western Galicia | Austrian Crown Land (Galicia) | Austrian half | medium |
| 60015 | `aut-eastern-galicia` | Eastern Galicia | Austrian Crown Land (Galicia) | Austrian half | medium |
| 60016 | `aut-tarnopol` | Tarnopol | Austrian Crown Land (Galicia) | Austrian half | medium |
| 60017 | `aut-northern-bukovina` | Northern Bukovina | Austrian Crown Land (Bukovina) | Austrian half | medium |
| 60018 | `aut-southern-bukovina` | Southern Bukovina | Austrian Crown Land (Bukovina) | Austrian half | medium |
| 60019 | `aut-carpathian-ruthenia` | Carpathian Ruthenia | Hungarian county (Ung, Bereg, Ugocsa, Máramaros) | Hungarian half | medium |
| 60020 | `aut-carniola` | Carniola | Austrian Crown Land | Austrian half | low |
| 60021 | `aut-lower-styria` | Lower Styria | Austrian Crown Land (Styria) | Austrian half | low |
| 60022 | `aut-gorizia-gradisca` | Gorizia and Gradisca | Austrian Littoral | Austrian half | low |
| 60023 | `aut-istria` | Istria | Austrian Littoral | Austrian half | medium |
| 60024 | `aut-trieste` | Trieste | Austrian Littoral | Austrian half | high |
| 60025 | `aut-south-tyrol` | South Tyrol | Austrian Crown Land (Tyrol) | Austrian half | high |
| 60026 | `aut-trentino` | Trentino | Austrian Crown Land (Tyrol) | Austrian half | high |
| 60027 | `aut-northern-dalmatia` | Northern Dalmatia | Austrian Crown Land (Dalmatia) | Austrian half | medium |
| 60028 | `aut-southern-dalmatia` | Southern Dalmatia | Austrian Crown Land (Dalmatia) | Austrian half | medium |
| 60029 | `aut-fiume` | Fiume | Hungarian corpus separatum | Hungarian half | medium |
| 60030 | `aut-bosnia` | Bosnia | Bosnia and Herzegovina (joint administration) | Joint Austro-Hungarian administration | medium |
| 60031 | `aut-herzegovina` | Herzegovina | Bosnia and Herzegovina (joint administration) | Joint Austro-Hungarian administration | medium |
| 60032 | `aut-croatia-proper` | Croatia Proper | Kingdom of Croatia-Slavonia | Hungarian half | medium |
| 60033 | `aut-slavonia` | Slavonia | Kingdom of Croatia-Slavonia | Hungarian half | medium |
| 60034 | `aut-hun-central-hungary` | Central Hungary | Hungarian county grouping | Hungarian half | medium |
| 60035 | `aut-hun-transdanubia` | Transdanubia | Hungarian county grouping | Hungarian half | medium |
| 60036 | `aut-hun-northern-hungary` | Northern Hungary | Hungarian county grouping | Hungarian half | medium |
| 60037 | `aut-hun-great-hungarian-plain` | Great Hungarian Plain | Hungarian county grouping | Hungarian half | medium |
| 60038 | `aut-burgenland` | Burgenland | Hungarian western border counties | Hungarian half | medium |
| 60039 | `aut-svk-pressburg` | Pressburg | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60040 | `aut-svk-nagyszombat` | Nagyszombat | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60041 | `aut-svk-nyitra` | Nyitra | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60042 | `aut-svk-trencsen` | Trencsén | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60043 | `aut-svk-turoc` | Turóc | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60044 | `aut-svk-besztercebanya` | Besztercebánya | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60045 | `aut-svk-kassa` | Kassa | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60046 | `aut-svk-eperjes` | Eperjes | Hungarian county grouping (Upper Hungary) | Hungarian half | medium |
| 60047 | `aut-transylvania` | Transylvania | Hungarian county grouping (Transylvania) | Hungarian half | medium |
| 60048 | `aut-szekely-land` | Székely Land | Hungarian county grouping (Transylvania) | Hungarian half | medium |
| 60049 | `aut-partium` | Partium | Hungarian county grouping (Partium) | Hungarian half | medium |
| 60050 | `aut-banat` | Banat | Hungarian county grouping (Banat) | Hungarian half | medium |
| 60051 | `aut-backa` | Bačka | Hungarian county grouping (Bács-Bodrog) | Hungarian half | medium |
| 60052 | `aut-syrmia` | Syrmia | Hungarian county grouping (Szerém) | Hungarian half | medium |
| 60053 | `aut-cieszyn-silesia` | Cieszyn Silesia | Austrian Crown Land (Silesia) | Austrian half | low |

### Kingdom of Belgium (BEL) — 11 provinces

independent; 1900 population estimate 6700000; geometry BEL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 10001 | `bel-west-flanders` | West Flanders | Belgian province | Kingdom of Belgium | high |
| 10002 | `bel-hainaut` | Hainaut | Belgian province | Kingdom of Belgium | high |
| 10003 | `bel-namur` | Namur | Belgian province | Kingdom of Belgium | high |
| 10004 | `bel-luxembourg` | Luxembourg | Belgian province | Kingdom of Belgium | high |
| 10005 | `bel-liege` | Liege | Belgian province | Kingdom of Belgium | high |
| 10006 | `bel-east-flanders` | East Flanders | Belgian province | Kingdom of Belgium | high |
| 10007 | `bel-antwerp` | Antwerp | Belgian province | Kingdom of Belgium | high |
| 10008 | `bel-limburg` | Limburg | Belgian province | Kingdom of Belgium | high |
| 10009 | `bel-brussels` | Brussels | Belgian province | Kingdom of Belgium | high |
| 10010 | `bel-flemish-brabant` | Flemish Brabant | Belgian province | Kingdom of Belgium | high |
| 10011 | `bel-walloon-brabant` | Walloon Brabant | Belgian province | Kingdom of Belgium | high |

### Principality of Bulgaria (BGR) — 6 provinces

autonomous-vassal; 1900 population estimate 3700000; geometry BGR.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 19001 | `bgr-sofia` | Sofia | Bulgarian okrug grouping | Principality of Bulgaria | medium |
| 19002 | `bgr-plovdiv` | Plovdiv | Bulgarian okrug grouping | Principality of Bulgaria | medium |
| 19003 | `bgr-stara-zagora` | Stara Zagora | Bulgarian okrug grouping | Principality of Bulgaria | medium |
| 19004 | `bgr-ruse` | Ruse | Bulgarian okrug grouping | Principality of Bulgaria | medium |
| 19005 | `bgr-varna` | Varna | Bulgarian okrug grouping | Principality of Bulgaria | medium |
| 19006 | `bgr-pleven` | Pleven | Bulgarian okrug grouping | Principality of Bulgaria | medium |

### Swiss Confederation (CHE) — 26 provinces

independent; 1900 population estimate 3300000; geometry CHE.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 11001 | `che-valais` | Valais | Swiss canton | Swiss Confederation | high |
| 11002 | `che-ticino` | Ticino | Swiss canton | Swiss Confederation | high |
| 11003 | `che-graubunden` | Graubünden | Swiss canton | Swiss Confederation | high |
| 11004 | `che-schaffhausen` | Schaffhausen | Swiss canton | Swiss Confederation | high |
| 11005 | `che-thurgau` | Thurgau | Swiss canton | Swiss Confederation | high |
| 11006 | `che-zurich` | Zürich | Swiss canton | Swiss Confederation | high |
| 11007 | `che-aargau` | Aargau | Swiss canton | Swiss Confederation | high |
| 11008 | `che-basel-stadt` | Basel-Stadt | Swiss canton | Swiss Confederation | high |
| 11009 | `che-basel-landschaft` | Basel-Landschaft | Swiss canton | Swiss Confederation | high |
| 11010 | `che-sankt-gallen` | Sankt Gallen | Swiss canton | Swiss Confederation | high |
| 11011 | `che-solothurn` | Solothurn | Swiss canton | Swiss Confederation | high |
| 11012 | `che-jura` | Jura | Swiss canton | Swiss Confederation | high |
| 11013 | `che-geneve` | Genève | Swiss canton | Swiss Confederation | high |
| 11014 | `che-vaud` | Vaud | Swiss canton | Swiss Confederation | high |
| 11015 | `che-neuchatel` | Neuchâtel | Swiss canton | Swiss Confederation | high |
| 11016 | `che-bern` | Bern | Swiss canton | Swiss Confederation | high |
| 11017 | `che-lucerne` | Lucerne | Swiss canton | Swiss Confederation | high |
| 11018 | `che-zug` | Zug | Swiss canton | Swiss Confederation | high |
| 11019 | `che-uri` | Uri | Swiss canton | Swiss Confederation | high |
| 11020 | `che-schwyz` | Schwyz | Swiss canton | Swiss Confederation | high |
| 11021 | `che-glarus` | Glarus | Swiss canton | Swiss Confederation | high |
| 11022 | `che-nidwalden` | Nidwalden | Swiss canton | Swiss Confederation | high |
| 11023 | `che-fribourg` | Fribourg | Swiss canton | Swiss Confederation | high |
| 11024 | `che-obwalden` | Obwalden | Swiss canton | Swiss Confederation | high |
| 11025 | `che-appenzell-ausserrhoden` | Appenzell Ausserrhoden | Swiss canton | Swiss Confederation | high |
| 11026 | `che-appenzell-innerrhoden` | Appenzell Innerrhoden | Swiss canton | Swiss Confederation | high |

### Cretan State (CRT) — 1 provinces

autonomous-vassal; 1900 population estimate 300000; geometry adm1:GR-M.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 66001 | `crt-crete` | Crete | Cretan State | — | medium |

### German Empire (DEU) — 34 provinces

independent; 1900 population estimate 56367000; geometry DEU.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 2001 | `deu-bavaria` | Bavaria | Kingdom of Bavaria | German Empire | high |
| 2002 | `deu-saxony` | Saxony | Kingdom of Saxony | German Empire | high |
| 2003 | `deu-prussian-saxony` | Prussian Saxony | Prussian Province of Saxony | German Empire | high |
| 2004 | `deu-thuringia` | Thuringia | Thuringian states | German Empire | high |
| 2005 | `deu-hesse` | Hesse | Hesse and Hesse-Nassau | German Empire | high |
| 2006 | `deu-hamburg` | Hamburg | Free and Hanseatic City of Hamburg | German Empire | high |
| 2007 | `deu-bremen` | Bremen | Free Hanseatic City of Bremen | German Empire | high |
| 2008 | `deu-berlin` | Berlin | Royal capital and residence city | German Empire | high |
| 2009 | `deu-brandenburg` | Brandenburg | Prussian Province of Brandenburg | German Empire | high |
| 2010 | `deu-brandenburg-lebus` | Brandenburg (Lebus) | Prussian Province of Brandenburg (Lebus) | German Empire | high |
| 2011 | `deu-schleswig-holstein` | Schleswig-Holstein | Prussian Province of Schleswig-Holstein | German Empire | high |
| 2012 | `deu-saar` | Saar | Prussian Rhine Province (Saar district) | German Empire | medium |
| 2013 | `deu-baden` | Baden | Grand Duchy of Baden | German Empire | low |
| 2014 | `deu-wurttemberg` | Württemberg | Kingdom of Württemberg | German Empire | low |
| 2015 | `deu-hohenzollern` | Hohenzollern | Prussian Province of the Rhine (Hohenzollern) | German Empire | low |
| 2016 | `deu-mecklenburg` | Mecklenburg | Grand Duchies of Mecklenburg-Schwerin and Mecklenburg-Strelitz | German Empire | medium |
| 2017 | `deu-pomerania` | Pomerania | Prussian Province of Pomerania | German Empire | medium |
| 2018 | `deu-west-prussia` | West Prussia | Prussian Province of West Prussia | German Empire | medium |
| 2019 | `deu-danzig` | Danzig | Prussian Province of West Prussia (Danzig) | German Empire | low |
| 2020 | `deu-posen` | Posen | Prussian Province of Posen | German Empire | medium |
| 2021 | `deu-lower-silesia` | Lower Silesia | Prussian Province of Silesia (Lower Silesia) | German Empire | medium |
| 2022 | `deu-middle-silesia` | Middle Silesia | Prussian Province of Upper Silesia (Oppeln) | German Empire | medium |
| 2023 | `deu-upper-silesia` | Upper Silesia | Prussian Province of Upper Silesia (Katowice) | German Empire | medium |
| 2024 | `deu-east-prussia-north` | Königsberg | Prussian Province of East Prussia | German Empire | medium |
| 2025 | `deu-east-prussia-south` | Allenstein | Prussian Province of East Prussia | German Empire | medium |
| 2026 | `deu-memel` | Memel | Prussian Province of East Prussia (Memel) | German Empire | medium |
| 2027 | `deu-north-schleswig` | North Schleswig | Prussian Province of Schleswig-Holstein | German Empire | medium |
| 2028 | `deu-eupen-malmedy` | Eupen-Malmedy | Prussian Rhine Province (Eupen, Malmedy, Sankt Vith) | German Empire | low |
| 2029 | `deu-alsace` | Alsace | Reichsland Alsace-Lorraine (Bas-Rhin and Haut-Rhin) | German Empire | high |
| 2030 | `deu-lorraine` | Lorraine | Reichsland Alsace-Lorraine (Moselle) | German Empire | high |
| 2031 | `deu-hanover` | Hanover | Prussian Province of Hanover | German Empire | medium |
| 2032 | `deu-westphalia` | Westphalia | Prussian Province of Westphalia | German Empire | low |
| 2033 | `deu-rhine-province` | Rhine Province | Prussian Rhine Province | German Empire | low |
| 2034 | `deu-palatinate` | Palatinate | Kingdom of Bavaria (Palatinate) | German Empire | low |

### Kingdom of Denmark (DNK) — 8 provinces

independent; 1900 population estimate 2400000; geometry DNK.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 14001 | `dnk-north-jutland` | North Jutland | Danish region (amt) | Kingdom of Denmark | medium |
| 14002 | `dnk-central-jutland` | Central Jutland | Danish region (amt) | Kingdom of Denmark | medium |
| 14003 | `dnk-south-jutland` | South Jutland | Danish region (amt) | Kingdom of Denmark | medium |
| 14004 | `dnk-copenhagen` | Copenhagen | Danish region (amt) | Kingdom of Denmark | medium |
| 14005 | `dnk-zealand` | Zealand | Danish region (amt) | Kingdom of Denmark | medium |
| 14006 | `isl-iceland` | Iceland | Danish Iceland | — | high |
| 14007 | `fro-faroe-islands` | Faroe Islands | Danish Faroe Islands | — | high |
| 14008 | `grl-greenland` | Greenland | Danish Arctic dependency | — | low |

### Kingdom of Spain (ESP) — 50 provinces

independent; 1900 population estimate 18600000; geometry ESP.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 7001 | `esp-navarra` | Navarra | Spanish province | Kingdom of Spain | high |
| 7002 | `esp-gipuzkoa` | Gipuzkoa | Spanish province | Kingdom of Spain | high |
| 7003 | `esp-huesca` | Huesca | Spanish province | Kingdom of Spain | high |
| 7004 | `esp-lerida` | Lérida | Spanish province | Kingdom of Spain | high |
| 7005 | `esp-gerona` | Gerona | Spanish province | Kingdom of Spain | high |
| 7006 | `esp-badajoz` | Badajoz | Spanish province | Kingdom of Spain | high |
| 7007 | `esp-cadiz` | Cádiz | Spanish province | Kingdom of Spain | high |
| 7008 | `esp-orense` | Orense | Spanish province | Kingdom of Spain | high |
| 7009 | `esp-caceres` | Cáceres | Spanish province | Kingdom of Spain | high |
| 7010 | `esp-salamanca` | Salamanca | Spanish province | Kingdom of Spain | high |
| 7011 | `esp-zamora` | Zamora | Spanish province | Kingdom of Spain | high |
| 7012 | `esp-pontevedra` | Pontevedra | Spanish province | Kingdom of Spain | high |
| 7013 | `esp-huelva` | Huelva | Spanish province | Kingdom of Spain | high |
| 7014 | `esp-barcelona` | Barcelona | Spanish province | Kingdom of Spain | high |
| 7015 | `esp-tarragona` | Tarragona | Spanish province | Kingdom of Spain | high |
| 7016 | `esp-castellon` | Castellón | Spanish province | Kingdom of Spain | high |
| 7017 | `esp-valencia` | Valencia | Spanish province | Kingdom of Spain | high |
| 7018 | `esp-alicante` | Alicante | Spanish province | Kingdom of Spain | high |
| 7019 | `esp-murcia` | Murcia | Spanish province | Kingdom of Spain | high |
| 7020 | `esp-almeria` | Almería | Spanish province | Kingdom of Spain | high |
| 7021 | `esp-granada` | Granada | Spanish province | Kingdom of Spain | high |
| 7022 | `esp-malaga` | Málaga | Spanish province | Kingdom of Spain | high |
| 7023 | `esp-sevilla` | Sevilla | Spanish province | Kingdom of Spain | high |
| 7024 | `esp-la-coruna` | La Coruña | Spanish province | Kingdom of Spain | high |
| 7025 | `esp-lugo` | Lugo | Spanish province | Kingdom of Spain | high |
| 7026 | `esp-asturias` | Asturias | Spanish province | Kingdom of Spain | high |
| 7027 | `esp-cantabria` | Cantabria | Spanish province | Kingdom of Spain | high |
| 7028 | `esp-bizkaia` | Bizkaia | Spanish province | Kingdom of Spain | high |
| 7029 | `esp-santa-cruz-de-tenerife` | Santa Cruz de Tenerife | Spanish province | Kingdom of Spain | high |
| 7030 | `esp-las-palmas` | Las Palmas | Spanish province | Kingdom of Spain | high |
| 7031 | `esp-baleares` | Baleares | Spanish province | Kingdom of Spain | high |
| 7032 | `esp-zaragoza` | Zaragoza | Spanish province | Kingdom of Spain | high |
| 7033 | `esp-la-rioja` | La Rioja | Spanish province | Kingdom of Spain | high |
| 7034 | `esp-alava` | Álava | Spanish province | Kingdom of Spain | high |
| 7035 | `esp-albacete` | Albacete | Spanish province | Kingdom of Spain | high |
| 7036 | `esp-teruel` | Teruel | Spanish province | Kingdom of Spain | high |
| 7037 | `esp-cuenca` | Cuenca | Spanish province | Kingdom of Spain | high |
| 7038 | `esp-toledo` | Toledo | Spanish province | Kingdom of Spain | high |
| 7039 | `esp-leon` | León | Spanish province | Kingdom of Spain | high |
| 7040 | `esp-soria` | Soria | Spanish province | Kingdom of Spain | high |
| 7041 | `esp-burgos` | Burgos | Spanish province | Kingdom of Spain | high |
| 7042 | `esp-avila` | Ávila | Spanish province | Kingdom of Spain | high |
| 7043 | `esp-palencia` | Palencia | Spanish province | Kingdom of Spain | high |
| 7044 | `esp-ciudad-real` | Ciudad Real | Spanish province | Kingdom of Spain | high |
| 7045 | `esp-cordoba` | Córdoba | Spanish province | Kingdom of Spain | high |
| 7046 | `esp-guadalajara` | Guadalajara | Spanish province | Kingdom of Spain | high |
| 7047 | `esp-jaen` | Jaén | Spanish province | Kingdom of Spain | high |
| 7048 | `esp-madrid` | Madrid | Spanish province | Kingdom of Spain | high |
| 7049 | `esp-segovia` | Segovia | Spanish province | Kingdom of Spain | high |
| 7050 | `esp-valladolid` | Valladolid | Spanish province | Kingdom of Spain | high |

### French Republic (FRA) — 93 provinces

independent; 1900 population estimate 38900000; geometry FRA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 3001 | `fra-nord` | Nord | French department | Metropolitan France | medium |
| 3002 | `fra-ardennes` | Ardennes | French department | Metropolitan France | medium |
| 3003 | `fra-aisne` | Aisne | French department | Metropolitan France | medium |
| 3004 | `fra-meuse` | Meuse | French department | Metropolitan France | medium |
| 3005 | `fra-meurthe-et-moselle` | Meurthe-et-Moselle | French department | Metropolitan France | medium |
| 3006 | `fra-alpes-maritimes` | Alpes-Maritimes | French department | Metropolitan France | medium |
| 3007 | `fra-alpes-de-haute-provence` | Alpes-de-Haute-Provence | French department | Metropolitan France | medium |
| 3008 | `fra-hautes-alpes` | Hautes-Alpes | French department | Metropolitan France | medium |
| 3009 | `fra-savoie` | Savoie | French department | Metropolitan France | medium |
| 3010 | `fra-haute-savoie` | Haute-Savoie | French department | Metropolitan France | medium |
| 3011 | `fra-pyrenees-atlantiques` | Pyrénées-Atlantiques | French department | Metropolitan France | medium |
| 3012 | `fra-haute-garonne` | Haute-Garonne | French department | Metropolitan France | medium |
| 3013 | `fra-hautes-pyrenees` | Hautes-Pyrénées | French department | Metropolitan France | medium |
| 3014 | `fra-ariege` | Ariège | French department | Metropolitan France | medium |
| 3015 | `fra-pyrenees-orientales` | Pyrénées-Orientales | French department | Metropolitan France | medium |
| 3016 | `fra-territoire-de-belfort` | Territoire de Belfort | French department | Metropolitan France | medium |
| 3017 | `fra-doubs` | Doubs | French department | Metropolitan France | medium |
| 3018 | `fra-ain` | Ain | French department | Metropolitan France | medium |
| 3019 | `fra-jura` | Jura | French department | Metropolitan France | medium |
| 3020 | `fra-var` | Var | French department | Metropolitan France | medium |
| 3021 | `fra-bouches-du-rhone` | Bouches-du-Rhône | French department | Metropolitan France | medium |
| 3022 | `fra-gard` | Gard | French department | Metropolitan France | medium |
| 3023 | `fra-herault` | Hérault | French department | Metropolitan France | medium |
| 3024 | `fra-aude` | Aude | French department | Metropolitan France | medium |
| 3025 | `fra-landes` | Landes | French department | Metropolitan France | medium |
| 3026 | `fra-gironde` | Gironde | French department | Metropolitan France | medium |
| 3027 | `fra-charente-maritime` | Charente-Maritime | French department | Metropolitan France | medium |
| 3028 | `fra-vendee` | Vendée | French department | Metropolitan France | medium |
| 3029 | `fra-loire-atlantique` | Loire-Atlantique | French department | Metropolitan France | medium |
| 3030 | `fra-morbihan` | Morbihan | French department | Metropolitan France | medium |
| 3031 | `fra-finistere` | Finistère | French department | Metropolitan France | medium |
| 3032 | `fra-cotes-d-armor` | Côtes-d'Armor | French department | Metropolitan France | medium |
| 3033 | `fra-ille-et-vilaine` | Ille-et-Vilaine | French department | Metropolitan France | medium |
| 3034 | `fra-manche` | Manche | French department | Metropolitan France | medium |
| 3035 | `fra-calvados` | Calvados | French department | Metropolitan France | medium |
| 3036 | `fra-eure` | Eure | French department | Metropolitan France | medium |
| 3037 | `fra-seine-maritime` | Seine-Maritime | French department | Metropolitan France | medium |
| 3038 | `fra-somme` | Somme | French department | Metropolitan France | medium |
| 3039 | `fra-pas-de-calais` | Pas-de-Calais | French department | Metropolitan France | medium |
| 3040 | `fra-haute-corse` | Haute-Corse | French department | Metropolitan France | medium |
| 3041 | `fra-corse-du-sud` | Corse-du-Sud | French department | Metropolitan France | medium |
| 3042 | `fra-gers` | Gers | French department | Metropolitan France | medium |
| 3043 | `fra-haute-vienne` | Haute-Vienne | French department | Metropolitan France | medium |
| 3044 | `fra-correze` | Corrèze | French department | Metropolitan France | medium |
| 3045 | `fra-tarn-et-garonne` | Tarn-et-Garonne | French department | Metropolitan France | medium |
| 3046 | `fra-tarn` | Tarn | French department | Metropolitan France | medium |
| 3047 | `fra-isere` | Isère | French department | Metropolitan France | medium |
| 3048 | `fra-drome` | Drôme | French department | Metropolitan France | medium |
| 3049 | `fra-aveyron` | Aveyron | French department | Metropolitan France | medium |
| 3050 | `fra-lot` | Lot | French department | Metropolitan France | medium |
| 3051 | `fra-indre-et-loire` | Indre-et-Loire | French department | Metropolitan France | medium |
| 3052 | `fra-indre` | Indre | French department | Metropolitan France | medium |
| 3053 | `fra-loir-et-cher` | Loir-et-Cher | French department | Metropolitan France | medium |
| 3054 | `fra-creuse` | Creuse | French department | Metropolitan France | medium |
| 3055 | `fra-mayenne` | Mayenne | French department | Metropolitan France | medium |
| 3056 | `fra-sarthe` | Sarthe | French department | Metropolitan France | medium |
| 3057 | `fra-vaucluse` | Vaucluse | French department | Metropolitan France | medium |
| 3058 | `fra-haute-marne` | Haute-Marne | French department | Metropolitan France | medium |
| 3059 | `fra-marne` | Marne | French department | Metropolitan France | medium |
| 3060 | `fra-dordogne` | Dordogne | French department | Metropolitan France | medium |
| 3061 | `fra-rhone` | Rhône | French department | Metropolitan France | medium |
| 3062 | `fra-vosges` | Vosges | French department | Metropolitan France | medium |
| 3063 | `fra-ardeche` | Ardèche | French department | Metropolitan France | medium |
| 3064 | `fra-loire` | Loire | French department | Metropolitan France | medium |
| 3065 | `fra-puy-de-dome` | Puy-de-Dôme | French department | Metropolitan France | medium |
| 3066 | `fra-allier` | Allier | French department | Metropolitan France | medium |
| 3067 | `fra-loiret` | Loiret | French department | Metropolitan France | medium |
| 3068 | `fra-maine-et-loire` | Maine-et-Loire | French department | Metropolitan France | medium |
| 3069 | `fra-aube` | Aube | French department | Metropolitan France | medium |
| 3070 | `fra-paris` | Paris | French department | Metropolitan France | medium |
| 3071 | `fra-hauts-de-seine` | Hauts-de-Seine | French department | Metropolitan France | medium |
| 3072 | `fra-seine-saint-denis` | Seine-Saint-Denis | French department | Metropolitan France | medium |
| 3073 | `fra-val-d-oise` | Val-d'Oise | French department | Metropolitan France | medium |
| 3074 | `fra-yvelines` | Yvelines | French department | Metropolitan France | medium |
| 3075 | `fra-charente` | Charente | French department | Metropolitan France | medium |
| 3076 | `fra-cher` | Cher | French department | Metropolitan France | medium |
| 3077 | `fra-eure-et-loir` | Eure-et-Loir | French department | Metropolitan France | medium |
| 3078 | `fra-haute-loire` | Haute-Loire | French department | Metropolitan France | medium |
| 3079 | `fra-cantal` | Cantal | French department | Metropolitan France | medium |
| 3080 | `fra-lot-et-garonne` | Lot-et-Garonne | French department | Metropolitan France | medium |
| 3081 | `fra-lozere` | Lozère | French department | Metropolitan France | medium |
| 3082 | `fra-nievre` | Nièvre | French department | Metropolitan France | medium |
| 3083 | `fra-cote-d-or` | Côte-d'Or | French department | Metropolitan France | medium |
| 3084 | `fra-oise` | Oise | French department | Metropolitan France | medium |
| 3085 | `fra-orne` | Orne | French department | Metropolitan France | medium |
| 3086 | `fra-haute-saone` | Haute-Saône | French department | Metropolitan France | medium |
| 3087 | `fra-saone-et-loire` | Saône-et-Loire | French department | Metropolitan France | medium |
| 3088 | `fra-deux-sevres` | Deux-Sèvres | French department | Metropolitan France | medium |
| 3089 | `fra-vienne` | Vienne | French department | Metropolitan France | medium |
| 3090 | `fra-yonne` | Yonne | French department | Metropolitan France | medium |
| 3091 | `fra-essonne` | Essonne | French department | Metropolitan France | medium |
| 3092 | `fra-seien-et-marne` | Seien-et-Marne | French department | Metropolitan France | medium |
| 3093 | `fra-val-de-marne` | Val-de-Marne | French department | Metropolitan France | medium |

### United Kingdom of Great Britain and Ireland (GBR) — 51 provinces

independent; 1900 population estimate 41155000; geometry GBR, IRL, IMN, JEY, GGY.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 1001 | `gbr-northumberland-and-durham` | Northumberland and Durham | Historic English county grouping | England | medium |
| 1002 | `gbr-lancashire-and-cheshire` | Lancashire and Cheshire | Historic English county grouping | England | medium |
| 1003 | `gbr-yorkshire` | Yorkshire | Historic English county grouping | England | medium |
| 1004 | `gbr-derbyshire-and-nottinghamshire` | Derbyshire and Nottinghamshire | Historic English county grouping | England | medium |
| 1005 | `gbr-staffordshire-and-warwickshire` | Staffordshire and Warwickshire | Historic English county grouping | England | medium |
| 1006 | `gbr-east-anglia-and-essex` | East Anglia and Essex | Historic English county grouping | England | medium |
| 1007 | `gbr-middlesex-and-london` | Middlesex and London | Historic English county grouping | England | medium |
| 1008 | `gbr-surrey-kent-and-sussex` | Surrey, Kent and Sussex | Historic English county grouping | England | medium |
| 1009 | `gbr-devon-and-cornwall` | Devon and Cornwall | Historic English county grouping | England | medium |
| 1010 | `gbr-wessex` | Wessex | Historic English county grouping | England | medium |
| 1011 | `gbr-north-wales` | North Wales | Historic Welsh county grouping | Wales | medium |
| 1012 | `gbr-mid-wales` | Mid Wales | Historic Welsh county grouping | Wales | medium |
| 1013 | `gbr-south-wales` | South Wales | Historic Welsh county grouping | Wales | medium |
| 1014 | `gbr-highlands-and-islands` | Highlands and Islands | Historic Scottish county grouping | Scotland | medium |
| 1015 | `gbr-north-east-scotland` | North East Scotland | Historic Scottish county grouping | Scotland | medium |
| 1016 | `gbr-east-scotland` | East Scotland | Historic Scottish county grouping | Scotland | medium |
| 1017 | `gbr-south-west-scotland` | South West Scotland | Historic Scottish county grouping | Scotland | medium |
| 1018 | `gbr-ni-antrim` | County Antrim | Historic Irish county | Ireland (Northern Ireland) | high |
| 1019 | `gbr-ni-down` | County Down | Historic Irish county | Ireland (Northern Ireland) | high |
| 1020 | `gbr-ni-armagh` | County Armagh | Historic Irish county | Ireland (Northern Ireland) | high |
| 1021 | `gbr-ni-fermanagh` | County Fermanagh | Historic Irish county | Ireland (Northern Ireland) | high |
| 1022 | `gbr-ni-londonderry` | County Londonderry | Historic Irish county | Ireland (Northern Ireland) | high |
| 1023 | `gbr-ni-tyrone` | County Tyrone | Historic Irish county | Ireland (Northern Ireland) | high |
| 1024 | `gbr-ie-clare` | County Clare | Historic Irish county | Ireland | high |
| 1025 | `gbr-ie-cavan` | County Cavan | Historic Irish county | Ireland | high |
| 1026 | `gbr-ie-cork` | County Cork | Historic Irish county | Ireland | high |
| 1027 | `gbr-ie-carlow` | County Carlow | Historic Irish county | Ireland | high |
| 1028 | `gbr-ie-dublin` | County Dublin | Historic Irish county | Ireland | high |
| 1029 | `gbr-ie-donegal` | County Donegal | Historic Irish county | Ireland | high |
| 1030 | `gbr-ie-galway` | County Galway | Historic Irish county | Ireland | high |
| 1031 | `gbr-ie-kildare` | County Kildare | Historic Irish county | Ireland | high |
| 1032 | `gbr-ie-kilkenny` | County Kilkenny | Historic Irish county | Ireland | high |
| 1033 | `gbr-ie-kerry` | County Kerry | Historic Irish county | Ireland | high |
| 1034 | `gbr-ie-longford` | County Longford | Historic Irish county | Ireland | high |
| 1035 | `gbr-ie-louth` | County Louth | Historic Irish county | Ireland | high |
| 1036 | `gbr-ie-limerick` | County Limerick | Historic Irish county | Ireland | high |
| 1037 | `gbr-ie-leitrim` | County Leitrim | Historic Irish county | Ireland | high |
| 1038 | `gbr-ie-laois` | County Laois | Historic Irish county | Ireland | high |
| 1039 | `gbr-ie-meath` | County Meath | Historic Irish county | Ireland | high |
| 1040 | `gbr-ie-monaghan` | County Monaghan | Historic Irish county | Ireland | high |
| 1041 | `gbr-ie-mayo` | County Mayo | Historic Irish county | Ireland | high |
| 1042 | `gbr-ie-offaly` | County Offaly | Historic Irish county | Ireland | high |
| 1043 | `gbr-ie-roscommon` | County Roscommon | Historic Irish county | Ireland | high |
| 1044 | `gbr-ie-sligo` | County Sligo | Historic Irish county | Ireland | high |
| 1045 | `gbr-ie-tipperary` | County Tipperary | Historic Irish county | Ireland | high |
| 1046 | `gbr-ie-waterford` | County Waterford | Historic Irish county | Ireland | high |
| 1047 | `gbr-ie-westmeath` | County Westmeath | Historic Irish county | Ireland | high |
| 1048 | `gbr-ie-wicklow` | County Wicklow | Historic Irish county | Ireland | high |
| 1049 | `gbr-ie-wexford` | County Wexford | Historic Irish county | Ireland | high |
| 1050 | `cyp-cyprus` | Cyprus | British Cyprus | — | medium |
| 1051 | `mlt-malta` | Malta | British Malta | — | high |

### Kingdom of Greece (GRC) — 11 provinces

independent; 1900 population estimate 2400000; geometry GRC.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 15001 | `grc-attica` | Attica | Historic Greek region | Kingdom of Greece | medium |
| 15002 | `grc-peloponnese` | Peloponnese | Historic Greek region | Kingdom of Greece | medium |
| 15003 | `grc-thessaly` | Thessaly | Historic Greek region | Kingdom of Greece | medium |
| 15004 | `grc-central-greece` | Central Greece | Historic Greek region | Kingdom of Greece | medium |
| 15005 | `grc-ionian-islands` | Ionian Islands | Historic Greek region | Kingdom of Greece | medium |
| 15006 | `grc-northern-aegean-islands` | Northern Aegean Islands | Historic Greek region | Kingdom of Greece | medium |
| 15007 | `grc-southern-aegean-islands` | Southern Aegean Islands | Historic Greek region | Kingdom of Greece | medium |
| 15008 | `grc-epirus` | Epirus | Historic Greek region | Kingdom of Greece | low |
| 15009 | `grc-macedonia` | Macedonia | Historic Greek region | Kingdom of Greece | low |
| 15010 | `grc-western-macedonia` | Western Macedonia | Historic Greek region | Kingdom of Greece | low |
| 15011 | `grc-thrace` | Thrace | Historic Greek region | Kingdom of Greece | low |

### Kingdom of Italy (ITA) — 19 provinces

independent; 1900 population estimate 32475000; geometry ITA, VAT.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 6001 | `ita-piedmont` | Piedmont | Historic Italian region | Kingdom of Italy | medium |
| 6002 | `ita-aosta` | Aosta | Historic Italian region | Kingdom of Italy | medium |
| 6003 | `ita-liguria` | Liguria | Historic Italian region | Kingdom of Italy | medium |
| 6004 | `ita-lombardy` | Lombardy | Historic Italian region | Kingdom of Italy | medium |
| 6005 | `ita-venetia` | Venetia | Historic Italian region | Kingdom of Italy | medium |
| 6006 | `ita-emilia-romagna` | Emilia-Romagna | Historic Italian region | Kingdom of Italy | medium |
| 6007 | `ita-tuscany` | Tuscany | Historic Italian region | Kingdom of Italy | medium |
| 6008 | `ita-umbria` | Umbria | Historic Italian region | Kingdom of Italy | medium |
| 6009 | `ita-marche` | Marche | Historic Italian region | Kingdom of Italy | medium |
| 6010 | `ita-lazio` | Lazio | Historic Italian region | Kingdom of Italy | medium |
| 6011 | `ita-abruzzo` | Abruzzo | Historic Italian region | Kingdom of Italy | medium |
| 6012 | `ita-molise` | Molise | Historic Italian region | Kingdom of Italy | medium |
| 6013 | `ita-campania` | Campania | Historic Italian region | Kingdom of Italy | medium |
| 6014 | `ita-apulia` | Apulia | Historic Italian region | Kingdom of Italy | medium |
| 6015 | `ita-basilicata` | Basilicata | Historic Italian region | Kingdom of Italy | medium |
| 6016 | `ita-calabria` | Calabria | Historic Italian region | Kingdom of Italy | medium |
| 6017 | `ita-sicily` | Sicily | Historic Italian region | Kingdom of Italy | medium |
| 6018 | `ita-sardinia` | Sardinia | Historic Italian region | Kingdom of Italy | medium |
| 6019 | `ita-friuli` | Friuli | Historic Italian region | Kingdom of Italy | medium |

### Principality of Liechtenstein (LIE) — 1 provinces

independent; 1900 population estimate 7500; geometry LIE.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 25001 | `lie-liechtenstein` | Liechtenstein | Principality of Liechtenstein | — | high |

### Grand Duchy of Luxembourg (LUX) — 3 provinces

independent; 1900 population estimate 240000; geometry LUX.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 21001 | `lux-diekirch` | Diekirch | Luxembourg district | Grand Duchy of Luxembourg | high |
| 21002 | `lux-grevenmacher` | Grevenmacher | Luxembourg district | Grand Duchy of Luxembourg | high |
| 21003 | `lux-luxembourg` | Luxembourg | Luxembourg district | Grand Duchy of Luxembourg | high |

### Principality of Monaco (MCO) — 1 provinces

independent; 1900 population estimate 15000; geometry MCO.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 22001 | `mco-monaco` | Monaco | Principality of Monaco | — | high |

### Principality of Montenegro (MNT) — 3 provinces

independent; 1900 population estimate 300000; geometry MNE.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 17001 | `mnt-montenegro` | Montenegro | Montenegrin district | Principality of Montenegro | low |
| 17002 | `mnt-brda` | Brda | Montenegrin district | Principality of Montenegro | low |
| 17003 | `mnt-old-herzegovina` | Old Herzegovina | Montenegrin district | Principality of Montenegro | low |

### Kingdom of the Netherlands (NLD) — 12 provinces

independent; 1900 population estimate 5100000; geometry NLD.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 9001 | `nld-groningen` | Groningen | Dutch province | Kingdom of the Netherlands | high |
| 9002 | `nld-drenthe` | Drenthe | Dutch province | Kingdom of the Netherlands | high |
| 9003 | `nld-overijssel` | Overijssel | Dutch province | Kingdom of the Netherlands | high |
| 9004 | `nld-gelderland` | Gelderland | Dutch province | Kingdom of the Netherlands | high |
| 9005 | `nld-limburg` | Limburg | Dutch province | Kingdom of the Netherlands | high |
| 9006 | `nld-zeeland` | Zeeland | Dutch province | Kingdom of the Netherlands | high |
| 9007 | `nld-noord-brabant` | Noord-Brabant | Dutch province | Kingdom of the Netherlands | high |
| 9008 | `nld-zuid-holland` | Zuid-Holland | Dutch province | Kingdom of the Netherlands | high |
| 9009 | `nld-noord-holland` | Noord-Holland | Dutch province | Kingdom of the Netherlands | high |
| 9010 | `nld-friesland` | Friesland | Dutch province | Kingdom of the Netherlands | high |
| 9011 | `nld-flevoland` | Flevoland | Dutch province | Kingdom of the Netherlands | low |
| 9012 | `nld-utrecht` | Utrecht | Dutch province | Kingdom of the Netherlands | high |

### Kingdom of Norway (NOR) — 19 provinces

personal-union; 1900 population estimate 2200000; geometry NOR.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 13001 | `nor-troms` | Troms | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13002 | `nor-nordland` | Nordland | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13003 | `nor-nord-tr-ndelag` | Nord-Trøndelag | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13004 | `nor-s-r-tr-ndelag` | Sør-Trøndelag | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13005 | `nor-hedmark` | Hedmark | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13006 | `nor-akershus` | Akershus | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13007 | `nor-stfold` | Østfold | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13008 | `nor-finnmark` | Finnmark | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13009 | `nor-oslo` | Oslo | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13010 | `nor-buskerud` | Buskerud | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13011 | `nor-vestfold` | Vestfold | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13012 | `nor-telemark` | Telemark | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13013 | `nor-aust-agder` | Aust-Agder | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13014 | `nor-vest-agder` | Vest-Agder | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13015 | `nor-rogaland` | Rogaland | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13016 | `nor-hordaland` | Hordaland | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13017 | `nor-sogn-og-fjordane` | Sogn og Fjordane | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13018 | `nor-m-re-og-romsdal` | Møre og Romsdal | Norwegian county (amt/fylke) | Kingdom of Norway | high |
| 13019 | `nor-oppland` | Oppland | Norwegian county (amt/fylke) | Kingdom of Norway | high |

### Ottoman Empire (OTT) — 7 provinces

independent; 1900 population estimate 24000000; geometry TUR, SYR, LBN, ISR, PSX, JOR, IRQ, SAU, YEM, QAT, ALB, MKD, KOS.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 20001 | `ott-constantinople` | Constantinople | Ottoman vilayet grouping | European Ottoman Empire | low |
| 20002 | `ott-adrianople` | Adrianople | Ottoman vilayet grouping | European Ottoman Empire | low |
| 20003 | `ott-salonika` | Salonika | Ottoman vilayet grouping | European Ottoman Empire | low |
| 20004 | `ott-monastir` | Monastir | Ottoman vilayet grouping | European Ottoman Empire | low |
| 20005 | `ott-kosovo` | Kosovo | Ottoman vilayet grouping | European Ottoman Empire | low |
| 20006 | `ott-scutari` | Scutari | Ottoman vilayet grouping | European Ottoman Empire | low |
| 20007 | `ott-janina` | Janina | Ottoman vilayet grouping | European Ottoman Empire | low |

### Kingdom of Portugal (PRT) — 20 provinces

independent; 1900 population estimate 5400000; geometry PRT.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 8001 | `prt-evora` | Évora | Portuguese district | Kingdom of Portugal | high |
| 8002 | `prt-portalegre` | Portalegre | Portuguese district | Kingdom of Portugal | high |
| 8003 | `prt-viana-do-castelo` | Viana do Castelo | Portuguese district | Kingdom of Portugal | high |
| 8004 | `prt-castelo-branco` | Castelo Branco | Portuguese district | Kingdom of Portugal | high |
| 8005 | `prt-guarda` | Guarda | Portuguese district | Kingdom of Portugal | high |
| 8006 | `prt-braganca` | Bragança | Portuguese district | Kingdom of Portugal | high |
| 8007 | `prt-vila-real` | Vila Real | Portuguese district | Kingdom of Portugal | high |
| 8008 | `prt-braga` | Braga | Portuguese district | Kingdom of Portugal | high |
| 8009 | `prt-faro` | Faro | Portuguese district | Kingdom of Portugal | high |
| 8010 | `prt-beja` | Beja | Portuguese district | Kingdom of Portugal | high |
| 8011 | `prt-setubal` | Setúbal | Portuguese district | Kingdom of Portugal | high |
| 8012 | `prt-lisboa` | Lisboa | Portuguese district | Kingdom of Portugal | high |
| 8013 | `prt-santarem` | Santarém | Portuguese district | Kingdom of Portugal | high |
| 8014 | `prt-leiria` | Leiria | Portuguese district | Kingdom of Portugal | high |
| 8015 | `prt-coimbra` | Coimbra | Portuguese district | Kingdom of Portugal | high |
| 8016 | `prt-aveiro` | Aveiro | Portuguese district | Kingdom of Portugal | high |
| 8017 | `prt-porto` | Porto | Portuguese district | Kingdom of Portugal | high |
| 8018 | `prt-madeira` | Madeira | Portuguese district | Kingdom of Portugal | high |
| 8019 | `prt-azores` | Azores | Portuguese district | Kingdom of Portugal | high |
| 8020 | `prt-viseu` | Viseu | Portuguese district | Kingdom of Portugal | high |

### Kingdom of Romania (ROM) — 4 provinces

independent; 1900 population estimate 6000000; geometry ROU.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 18001 | `rom-muntenia` | Muntenia | Historic Romanian province | Kingdom of Romania | medium |
| 18002 | `rom-oltenia` | Oltenia | Historic Romanian province | Kingdom of Romania | medium |
| 18003 | `rom-moldavia` | Moldavia | Historic Romanian province | Kingdom of Romania | medium |
| 18004 | `rom-dobruja` | Dobruja | Historic Romanian province | Kingdom of Romania | medium |

### Russian Empire (RUS) — 109 provinces

independent; 1900 population estimate 133300000; geometry RUS, EST, LVA, LTU, BLR, UKR, MDA, GEO, ARM, AZE, KAZ, UZB, TKM, TJK, KGZ, POL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 4001 | `rus-fin-uusimaa` | Uusimaa | Finnish lääni | Grand Duchy of Finland | medium |
| 4002 | `rus-fin-finland-proper` | Finland Proper | Finnish lääni | Grand Duchy of Finland | medium |
| 4003 | `rus-fin-hame` | Häme | Finnish lääni | Grand Duchy of Finland | medium |
| 4004 | `rus-fin-kymi` | Kymi | Finnish lääni | Grand Duchy of Finland | medium |
| 4005 | `rus-fin-mikkeli` | Mikkeli | Finnish lääni | Grand Duchy of Finland | medium |
| 4006 | `rus-fin-kuopio` | Kuopio | Finnish lääni | Grand Duchy of Finland | medium |
| 4007 | `rus-fin-vaasa` | Vaasa | Finnish lääni | Grand Duchy of Finland | medium |
| 4008 | `rus-fin-oulu` | Oulu | Finnish lääni | Grand Duchy of Finland | medium |
| 4009 | `rus-fin-lapland` | Lapland | Finnish lääni | Grand Duchy of Finland | medium |
| 4010 | `rus-fin-aland` | Åland | Finnish lääni (Åland) | Grand Duchy of Finland | medium |
| 4011 | `rus-est-harju` | Harju | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4012 | `rus-est-jarva` | Järva | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4013 | `rus-est-viru` | Viru | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4014 | `rus-est-tartu` | Tartu | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4015 | `rus-est-voru` | Võru | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4016 | `rus-est-viljandi` | Viljandi | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4017 | `rus-est-parnu` | Pärnu | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4018 | `rus-est-laane` | Lääne | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4019 | `rus-est-saare` | Saare | Estonian governorate (Estlyandskaya) | Baltic Provinces | medium |
| 4020 | `rus-lva-riga` | Riga | Baltic governorate (Courland, Livonia or Vitebsk) | Baltic Provinces | low |
| 4021 | `rus-lva-vidzeme` | Vidzeme | Baltic governorate (Courland, Livonia or Vitebsk) | Baltic Provinces | low |
| 4022 | `rus-lva-kurzeme` | Kurzeme | Baltic governorate (Courland, Livonia or Vitebsk) | Baltic Provinces | low |
| 4023 | `rus-lva-zemgale` | Zemgale | Baltic governorate (Courland, Livonia or Vitebsk) | Baltic Provinces | low |
| 4024 | `rus-lva-latgale` | Latgale | Baltic governorate (Courland, Livonia or Vitebsk) | Baltic Provinces | low |
| 4025 | `rus-ltu-vilnius` | Vilnius | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4026 | `rus-ltu-kaunas` | Kaunas | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4027 | `rus-ltu-siauliai` | Šiauliai | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4028 | `rus-ltu-panevezys` | Panevėžys | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4029 | `rus-ltu-alytus` | Alytus | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4030 | `rus-ltu-marijampole` | Marijampolė | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4031 | `rus-ltu-taurage` | Tauragė | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4032 | `rus-ltu-telsiai` | Telšiai | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4033 | `rus-ltu-utena` | Utena | Lithuanian governorate (Kovno, Vilna or Suwalki) | Western Provinces | medium |
| 4034 | `rus-pol-warsaw` | Warsaw | Polish governorate (Vistula Land) | Congress Poland | medium |
| 4035 | `rus-pol-odz` | Łódź | Polish governorate (Vistula Land) | Congress Poland | medium |
| 4036 | `rus-pol-lublin` | Lublin | Polish governorate (Vistula Land) | Congress Poland | medium |
| 4037 | `rus-pol-siedlce` | Siedlce | Polish governorate (Vistula Land) | Congress Poland | medium |
| 4038 | `rus-pol-kielce` | Kielce | Polish governorate (Vistula Land) | Congress Poland | medium |
| 4039 | `rus-pol-kalisz` | Kalisz | Polish governorate (Vistula Land) | Congress Poland | medium |
| 4040 | `rus-blr-brest` | Brest | Belarusian governorate | Western Provinces | medium |
| 4041 | `rus-blr-grodno` | Grodno | Belarusian governorate | Western Provinces | medium |
| 4042 | `rus-blr-minsk` | Minsk | Belarusian governorate | Western Provinces | medium |
| 4043 | `rus-blr-mogilev` | Mogilev | Belarusian governorate | Western Provinces | medium |
| 4044 | `rus-blr-gomel` | Gomel | Belarusian governorate | Western Provinces | medium |
| 4045 | `rus-blr-vitebsk` | Vitebsk | Belarusian governorate | Western Provinces | medium |
| 4046 | `rus-ukr-kiev` | Kiev | Ukrainian governorate | Ukrainian Provinces | medium |
| 4047 | `rus-ukr-volhynia` | Volhynia | Ukrainian governorate | Ukrainian Provinces | medium |
| 4048 | `rus-ukr-podolia` | Podolia | Ukrainian governorate | Ukrainian Provinces | medium |
| 4049 | `rus-ukr-kherson` | Kherson | Ukrainian governorate | Ukrainian Provinces | medium |
| 4050 | `rus-ukr-yekaterinoslav` | Yekaterinoslav | Ukrainian governorate | Ukrainian Provinces | medium |
| 4051 | `rus-ukr-taurida` | Taurida | Ukrainian governorate | Ukrainian Provinces | medium |
| 4052 | `rus-ukr-kharkov` | Kharkov | Ukrainian governorate | Ukrainian Provinces | medium |
| 4053 | `rus-ukr-poltava` | Poltava | Ukrainian governorate | Ukrainian Provinces | medium |
| 4054 | `rus-ukr-chernigov` | Chernigov | Ukrainian governorate | Ukrainian Provinces | medium |
| 4055 | `rus-ukr-donetsk` | Donetsk | Ukrainian governorate | Ukrainian Provinces | medium |
| 4056 | `rus-ukr-odessa` | Odessa | Ukrainian governorate | Ukrainian Provinces | medium |
| 4057 | `rus-mda-kishinev` | Kishinev | Bessarabian district | Bessarabia | low |
| 4058 | `rus-mda-bender` | Bender | Bessarabian district | Bessarabia | low |
| 4059 | `rus-mda-izmail` | Izmail | Bessarabian district | Bessarabia | low |
| 4060 | `rus-moscow` | Moscow | Russian governorate or oblast | European Russia | medium |
| 4061 | `rus-saint-petersburg` | Saint Petersburg | Russian governorate or oblast | European Russia | medium |
| 4062 | `rus-novgorod` | Novgorod | Russian governorate or oblast | European Russia | medium |
| 4063 | `rus-pskov` | Pskov | Russian governorate or oblast | European Russia | medium |
| 4064 | `rus-smolensk` | Smolensk | Russian governorate or oblast | European Russia | medium |
| 4065 | `rus-tver` | Tver | Russian governorate or oblast | European Russia | medium |
| 4066 | `rus-yaroslavl` | Yaroslavl | Russian governorate or oblast | European Russia | medium |
| 4067 | `rus-kostroma` | Kostroma | Russian governorate or oblast | European Russia | medium |
| 4068 | `rus-vladimir` | Vladimir | Russian governorate or oblast | European Russia | medium |
| 4069 | `rus-ivanovo` | Ivanovo | Russian governorate or oblast | European Russia | medium |
| 4070 | `rus-nizhny-novgorod` | Nizhny Novgorod | Russian governorate or oblast | European Russia | medium |
| 4071 | `rus-ryazan` | Ryazan | Russian governorate or oblast | European Russia | medium |
| 4072 | `rus-tula` | Tula | Russian governorate or oblast | European Russia | medium |
| 4073 | `rus-kaluga` | Kaluga | Russian governorate or oblast | European Russia | medium |
| 4074 | `rus-bryansk` | Bryansk | Russian governorate or oblast | European Russia | medium |
| 4075 | `rus-orel` | Orel | Russian governorate or oblast | European Russia | medium |
| 4076 | `rus-kursk` | Kursk | Russian governorate or oblast | European Russia | medium |
| 4077 | `rus-belgorod` | Belgorod | Russian governorate or oblast | European Russia | medium |
| 4078 | `rus-voronezh` | Voronezh | Russian governorate or oblast | European Russia | medium |
| 4079 | `rus-tsaritsyn` | Tsaritsyn | Russian governorate or oblast | European Russia | medium |
| 4080 | `rus-kurgan` | Kurgan | Russian governorate or oblast | European Russia | medium |
| 4081 | `rus-lipetsk` | Lipetsk | Russian governorate or oblast | European Russia | medium |
| 4082 | `rus-tambov` | Tambov | Russian governorate or oblast | European Russia | medium |
| 4083 | `rus-penza` | Penza | Russian governorate or oblast | European Russia | medium |
| 4084 | `rus-saratov` | Saratov | Russian governorate or oblast | European Russia | medium |
| 4085 | `rus-samara` | Samara | Russian governorate or oblast | European Russia | medium |
| 4086 | `rus-simbirsk` | Simbirsk | Russian governorate or oblast | European Russia | medium |
| 4087 | `rus-kazan` | Kazan | Russian governorate or oblast | European Russia | medium |
| 4088 | `rus-chuvash` | Chuvash | Russian governorate or oblast | European Russia | medium |
| 4089 | `rus-mari-el` | Mari El | Russian governorate or oblast | European Russia | medium |
| 4090 | `rus-mordovia` | Mordovia | Russian governorate or oblast | European Russia | medium |
| 4091 | `rus-udmurt` | Udmurt | Russian governorate or oblast | European Russia | medium |
| 4092 | `rus-vyatka` | Vyatka | Russian governorate or oblast | European Russia | medium |
| 4093 | `rus-perm` | Perm | Russian governorate or oblast | European Russia | medium |
| 4094 | `rus-vologda` | Vologda | Russian governorate or oblast | European Russia | medium |
| 4095 | `rus-arkhangelsk` | Arkhangelsk | Russian governorate or oblast | European Russia | medium |
| 4096 | `rus-olonets` | Olonets | Russian governorate or oblast | European Russia | medium |
| 4097 | `rus-ust-sysolsk` | Ust-Sysolsk | Russian governorate or oblast | European Russia | medium |
| 4098 | `rus-orenburg` | Orenburg | Russian governorate or oblast | European Russia | medium |
| 4099 | `rus-ufa` | Ufa | Russian governorate or oblast | European Russia | medium |
| 4100 | `rus-yekaterinburg` | Yekaterinburg | Russian governorate or oblast | European Russia | medium |
| 4101 | `rus-chelyabinsk` | Chelyabinsk | Russian governorate or oblast | European Russia | medium |
| 4102 | `rus-don` | Don | Russian governorate or oblast | European Russia | medium |
| 4103 | `rus-kuban` | Kuban | Russian governorate or oblast | European Russia | medium |
| 4104 | `rus-stavropol` | Stavropol | Russian governorate or oblast | European Russia | medium |
| 4105 | `rus-terek` | Terek | Russian governorate or oblast | European Russia | medium |
| 4106 | `rus-dagestan` | Dagestan | Russian governorate or oblast | European Russia | medium |
| 4107 | `rus-astrakhan` | Astrakhan | Russian governorate or oblast | European Russia | medium |
| 4108 | `rus-kalmykia` | Kalmykia | Russian governorate or oblast | European Russia | medium |
| 4109 | `rus-alexandrovsk` | Alexandrovsk | Russian governorate or oblast | European Russia | low |

### Most Serene Republic of San Marino (SMR) — 1 provinces

independent; 1900 population estimate 11000; geometry SMR.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 23001 | `smr-san-marino` | San Marino | Most Serene Republic of San Marino | — | high |

### Kingdom of Serbia (SRB) — 5 provinces

independent; 1900 population estimate 2500000; geometry SRB.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 16001 | `srb-belgrade` | Belgrade | Serbian district (okrug) | Kingdom of Serbia | medium |
| 16002 | `srb-sumadija` | Šumadija | Serbian district (okrug) | Kingdom of Serbia | medium |
| 16003 | `srb-podrinje` | Podrinje | Serbian district (okrug) | Kingdom of Serbia | medium |
| 16004 | `srb-nis` | Niš | Serbian district (okrug) | Kingdom of Serbia | medium |
| 16005 | `srb-timok` | Timok | Serbian district (okrug) | Kingdom of Serbia | medium |

### Kingdom of Sweden (SWE) — 21 provinces

independent; 1900 population estimate 5100000; geometry SWE.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 12001 | `swe-norrbotten` | Norrbotten | Swedish county (län) | Kingdom of Sweden | high |
| 12002 | `swe-vasterbotten` | Västerbotten | Swedish county (län) | Kingdom of Sweden | high |
| 12003 | `swe-jamtland` | Jämtland | Swedish county (län) | Kingdom of Sweden | high |
| 12004 | `swe-dalarna` | Dalarna | Swedish county (län) | Kingdom of Sweden | high |
| 12005 | `swe-varmland` | Värmland | Swedish county (län) | Kingdom of Sweden | high |
| 12006 | `swe-vastra-gotaland` | Västra Götaland | Swedish county (län) | Kingdom of Sweden | high |
| 12007 | `swe-vasternorrland` | Västernorrland | Swedish county (län) | Kingdom of Sweden | high |
| 12008 | `swe-gavleborg` | Gävleborg | Swedish county (län) | Kingdom of Sweden | high |
| 12009 | `swe-uppsala` | Uppsala | Swedish county (län) | Kingdom of Sweden | high |
| 12010 | `swe-stockholm` | Stockholm | Swedish county (län) | Kingdom of Sweden | high |
| 12011 | `swe-sodermanland` | Södermanland | Swedish county (län) | Kingdom of Sweden | high |
| 12012 | `swe-ostergotland` | Östergötland | Swedish county (län) | Kingdom of Sweden | high |
| 12013 | `swe-kalmar` | Kalmar | Swedish county (län) | Kingdom of Sweden | high |
| 12014 | `swe-blekinge` | Blekinge | Swedish county (län) | Kingdom of Sweden | high |
| 12015 | `swe-skane` | Skåne | Swedish county (län) | Kingdom of Sweden | high |
| 12016 | `swe-halland` | Halland | Swedish county (län) | Kingdom of Sweden | high |
| 12017 | `swe-gotland` | Gotland | Swedish county (län) | Kingdom of Sweden | high |
| 12018 | `swe-vastmanland` | Västmanland | Swedish county (län) | Kingdom of Sweden | high |
| 12019 | `swe-jonkoping` | Jönköping | Swedish county (län) | Kingdom of Sweden | high |
| 12020 | `swe-orebro` | Orebro | Swedish county (län) | Kingdom of Sweden | high |
| 12021 | `swe-kronoberg` | Kronoberg | Swedish county (län) | Kingdom of Sweden | high |


## 9. Known uncertainties and limitations

1. Modern admin-1 boundaries are proxies for historical internal boundaries.
   Provinces whose modern unit differs materially from the 1900 unit are labelled
   low or medium confidence and documented in their notes.
2. Several historical borders are approximated by authored clip lines: the
   Baden-Württemberg split, the Westphalia/Rhine Province split, the
   Palatinate/Rhine split, Kuyavia's split between Posen and West Prussia, and
   the Ottoman vilayet groupings. Their notes say so.
3. The M11c 1900 base places Hultschin and Cieszyn Silesia in Austria-Hungary
   rather than Germany; the provinces follow the committed base and document the
   deviation. Hultschin therefore transfers from Austria-Hungary to
   Czechoslovakia.
4. The M11c base does not separate Åland, so Åland is cut from the Finnish
   polygon by an explicit low-level clip.
5. Flevoland is post-1900 reclaimed land; it is retained as a low-confidence
   modern overlay inherited from the base map.
6. Small constituent German states inside modern Lower Saxony and
   Saxony-Anhalt (Oldenburg, Brunswick, Anhalt, Lippe) are merged into the
   neighbouring Prussian provinces for map legibility.
7. European Russia is provincialized west of the Urals and north of the
   Kuma-Manych/Kazakh fringe. Asiatic Russia, Central Asia, Anatolia and the Arab
   provinces are outside the M12a scope and remain under the polity fill.
8. Province-level population, buildings, resources and taxation are not
   redistributed in this milestone. Each province references the simulation
   region that currently contains its population; moving those simulation values
   with a provincial transfer is a future milestone.
9. Coverage residuals and small clip-seam overlaps are reported in
   `provinces_1900_audit.json`. They are not hidden by clamping.

## 10. Verification

- `pnpm test` includes `m12a-provinces.test.ts`: bundle/geometry validation,
  1900 ownership, historical subdivision presence, Austria-Hungary dissolution,
  German post-WWI/post-WWII/reunification, Russian fragmentation, Irish
  partition, save/load round-trip and deterministic hashing.
- `pnpm typecheck`, `pnpm lint` and `pnpm bench` are run for the milestone.
- The static verification render is `docs/images/m12a-provinces-1900.png`.
