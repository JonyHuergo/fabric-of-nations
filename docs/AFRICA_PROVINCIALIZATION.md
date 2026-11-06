# M12c — African Provincialization (1 January 1900)

Status: implemented. This document is generated from the committed Africa
province bundle and audit; the bundle and the code are authoritative if they
disagree.

## 1. Scope and architecture

- Africa is the direct counterpart of M12a Europe and M12b Asia. The only
  geographical subdivision beneath a polity is the **Province**; there is no
  Polity → Region → Province hierarchy and no parallel geographical region layer.
- The historical simulation `Region` remains a population/economy accounting
  unit. It is preserved as `SimulationRegion` and is never used to draw or
  hit-test territory. See DECISIONS D-103, D-104 and D-105.
- Province ids start at **200001**, above the M12a European block (maximum
  66001) and the M12b Asian block (100001–100239), and every Africa key is
  prefixed with `af-`. A build-time and merge-time check rejects any collision
  with Europe or Asia.
- The three committed bundles stay separate build artifacts:
  - `packages/data/data/map/provinces_1900.json` — M12a Europe;
  - `packages/data/data/map/provinces_asia_1900.json` — M12b Asia;
  - `packages/data/data/map/provinces_africa_1900.json` — M12c Africa.
  A single loader (`packages/data/src/provinces.ts` for the simulation and
  `packages/app/src/provinceMapBundle.ts` for the renderer) combines all three
  with unique ids, merged borders and one future-polity registry.
- Political state is mutable and separate from geography: legal owner, effective
  controller, occupation date, formal claims and special status live in
  `World.provinces`; geometry, id and name never change.
- Country borders are reconstructed from current provincial ownership using the
  same rendering contract as Europe and Asia: province fills by current owner, a
  quiet solid white hairline on every province outline, and a thin near-black
  country border where the two current owners differ. No dotted or dashed
  province lines are used.
- Africa's province geometries are clipped to the authored M11c 1900 polity
  polygons. The M11c polygons remain the underlay for territories outside the
  provincial scope (the Americas and Oceania).

## 2. Inventory summary

- Provinces: **260** (ids 200001–200260).
- 1900 owner polities with at least one province: **16**.
- Map features covered: **39** (`ALG`, `ANG`, `BEA`, `BPO`, `BSA`, `BSO`, `BWA`, `CAP`, `CFS`, `CRA`, `DAR`, `EGY`, `ERI`, `ETH`, `FEA`, `FRA`, `FSO`, `FWA`, `GEA`, `GSW`, `HCT`, `ITS`, `KAM`, `LBR`, `MAD`, `MAR`, `MOZ`, `NAT`, `ORF`, `OTT`, `PAI`, `SAH`, `SGG`, `SOK`, `SUD`, `TOG`, `TUN`, `WAD`, `ZAR`).
- Future successor polities in the registry: **57** (ids 1200–1256).
- Unique province ids/keys: **yes** (build audit: 0 duplicate ids, 0 duplicate keys).
- Border pairs: **838**, of which **183** are display-only cross-feature seam borders; shared border segments: **71494**; segments with more than two neighbours: **0**.
- Province pairs with a measured overlap above 0.005 deg²: **33** (the largest are listed in §3).
- Confidence: low **25**, medium **226**, high **9**.
- Admin-1 units whose label point lies inside an African 1900 feature but that no province claims: **0**.
- Admin-1 units claimed by two provinces of the same feature (rejected): **0**.

## 3. Method and geometry provenance

The build uses modern Natural Earth 1:10m admin-1 units **only as internal
geometry blocks**. Every province is clipped to its authored M11c 1900 polity
polygon. Where a later frontier cut through a modern unit, the province is split
along that frontier and the approximation is labelled low or medium confidence.
Output geometry is simplified at 0.02° and quantized to thousandths of a degree,
matching the M11c world map.

The M12a/M12b/M12c pipeline is one shared library
(`scripts/m12/province-build-lib.mjs`). It applies these rules in order:

1. union the authored admin-1 blocks, then apply authored clip/exclude shapes;
2. intersect with the 1900 polity polygon;
3. subtract earlier provinces of a different owner (the committed M12a Europe and
   M12b Asia bundles are seeded first, in that order);
4. simplify, then re-trim cross-owner overlaps that simplification expanded;
5. extract shared borders from the **unsimplified** source rings;
6. audit coverage, overlaps, duplicate ids and unassigned units.

Two display-only seam passes then add a shared border between adjacent provinces
of **different** 1900 map features (Eritrea/Ethiopia, British/Italian Somaliland,
Kenya/Tanganyika, Cabinda/Congo, Nigeria/Kamerun, ...). The two sides of such a
frontier are clipped by two independently authored polity polygons and can be up
to several tenths of a degree apart, so the exact segment match used inside one
feature fails.

1. The province-outline pass matches each vertex of one province to the nearest
   **point on the other province's outline** (point-to-segment, because colonial
   straight-line frontiers have very few vertices), takes the midpoint of every
   match closer than 0.5°, chains the midpoints along the ring and emits an
   ordinary border record. Three filters keep it honest: the midpoint must be on
   land, must lie inside one of the two 1900 polities and must not lie inside a
   province of a third feature.
2. The polity-frontier pass runs only for feature pairs the first pass could not
   connect (and for the forced Algeria/Mauritania pair): it takes the midline
   between the two **1900 polity outlines** within 0.4°, attributes each run to
   the nearest province on each side, and applies the same land/third-polity
   filters.

Neither pass changes a province polygon or any simulation state, and both are
deterministic. They are the same technique the M11c map uses for its display-only
seam bridges. The seams are listed in §3.1 and in the audit; they are only drawn
after an ownership transfer, because the 1900 start state draws the polity
outlines. Together they give every modern African land border a province edge
except the Botswana/Zambia quadripoint, the undelimited Kenya/South Sudan Ilemi
Triangle and the Djibouti/Somalia pair, which is mediated by Somaliland.

The largest remaining overlaps are within a single map feature (almost all
between provinces of the same owner): deliberate seams between authored clip
lines or simplification residues inside one polity. They cannot paint a
foreign-colour enclave unless the two provinces have different owners; any such
case is listed in the audit for review.

| Left | Right | Area (deg²) |
|---|---|---:|
| `af-egy-sohag-and-qena` | `af-egy-the-western-desert` | 0.0145 |
| `af-alg-bechar-and-the-west-sahara` | `af-alg-ouargla-and-the-east-sahara` | 0.0128 |
| `af-alg-constantine-and-the-east` | `af-alg-laghouat-and-the-southern-territories` | 0.0118 |
| `af-egy-cairo` | `af-egy-minya-and-asyut` | 0.0106 |
| `af-fwa-niger-the-sahel` | `af-fwa-niger-the-sahara` | 0.0098 |
| `af-egy-aswan-and-the-red-sea` | `af-egy-the-western-desert` | 0.0095 |
| `af-sud-blue-nile-and-sennar` | `af-sud-kassala-and-the-red-sea` | 0.0091 |
| `af-sud-khartoum` | `af-sud-northern-province` | 0.0082 |
| `af-cfs-kwango-and-bandundu` | `af-cfs-kasai` | 0.0082 |
| `af-cfs-maniema` | `af-cfs-south-kivu` | 0.008 |
| `af-fwa-french-sudan-kayes-bamako-and-koulikoro` | `af-fwa-guinea-the-upper-niger` | 0.0074 |
| `af-moz-nampula` | `af-moz-zambezia` | 0.0072 |

### 3.1 Cross-feature seam borders

| Left | Right | Lines |
|---|---|---:|
| `af-sah-saguia-el-hamra` | `af-fwa-mauritania-adrar-and-the-hodh` | 2 |
| `af-sah-saguia-el-hamra` | `af-alg-bechar-and-the-west-sahara` | 1 |
| `af-sah-rio-de-oro` | `af-fwa-mauritania-adrar-and-the-hodh` | 1 |
| `af-pai-bissau-and-cacheu` | `af-fwa-senegal-the-interior` | 3 |
| `af-pai-bafata-and-gabu` | `af-fwa-senegal-the-interior` | 2 |
| `af-pai-bafata-and-gabu` | `af-fwa-guinea-boke` | 1 |
| `af-pai-bolama-and-quinara` | `af-fwa-guinea-boke` | 3 |
| `af-sgg-rio-muni` | `af-kam-southern-kamerun` | 1 |
| `af-sgg-rio-muni` | `af-fea-gabon-the-estuary-and-the-coast` | 1 |
| `af-sgg-rio-muni` | `af-fea-gabon-the-interior` | 1 |
| `af-bso-british-somaliland` | `af-its-mudug-galguduud-and-bari` | 2 |
| `af-bso-british-somaliland` | `af-fso-french-somaliland` | 1 |
| `af-its-hiiraan-bakool-and-bay` | `af-eth-ogaden` | 1 |
| `af-its-mudug-galguduud-and-bari` | `af-eth-ogaden` | 1 |
| `af-eri-hamasien` | `af-eth-tigray` | 1 |
| `af-eri-barka-and-gash` | `af-eth-tigray` | 1 |
| `af-eri-barka-and-gash` | `af-sud-kassala-and-the-red-sea` | 2 |
| `af-eri-akele-guzai` | `af-eth-tigray` | 1 |
| `af-eri-akele-guzai` | `af-eth-afar` | 1 |
| `af-eri-akele-guzai` | `af-sud-kassala-and-the-red-sea` | 2 |
| `af-eri-massawa-and-the-dankalia-coast` | `af-fso-french-somaliland` | 1 |
| `af-eth-amhara-and-begemder` | `af-sud-blue-nile-and-sennar` | 2 |
| `af-eth-amhara-and-begemder` | `af-sud-kassala-and-the-red-sea` | 1 |
| `af-eth-afar` | `af-fso-french-somaliland` | 1 |
| `af-eth-oromia` | `af-sud-upper-nile` | 1 |
| `af-eth-oromia` | `af-bea-ukamba-and-nairobi` | 2 |
| `af-eth-sidamo-and-the-southern-provinces` | `af-sud-equatoria` | 2 |
| `af-eth-sidamo-and-the-southern-provinces` | `af-sud-upper-nile` | 2 |
| `af-eth-sidamo-and-the-southern-provinces` | `af-bea-ukamba-and-nairobi` | 1 |
| `af-eth-sidamo-and-the-southern-provinces` | `af-bea-rift-valley` | 1 |
| `af-eth-ogaden` | `af-bea-ukamba-and-nairobi` | 1 |
| `af-eth-ogaden` | `af-bea-jubaland` | 1 |
| `af-eth-ogaden` | `af-fso-french-somaliland` | 1 |
| `af-eth-benishangul` | `af-sud-blue-nile-and-sennar` | 2 |
| `af-eth-benishangul` | `af-sud-upper-nile` | 1 |
| `af-eth-gambela` | `af-sud-upper-nile` | 2 |
| `af-egy-aswan-and-the-red-sea` | `af-sud-northern-province` | 2 |
| `af-egy-the-western-desert` | `af-sud-northern-province` | 1 |
| `af-egy-the-western-desert` | `af-ott-derna-butnan-and-ajdabiya` | 2 |
| `af-sud-northern-province` | `af-ott-kufra` | 1 |
| `af-sud-bahr-el-ghazal` | `af-fea-ubangi-shari-the-east` | 3 |
| `af-sud-equatoria` | `af-cfs-orientale` | 2 |
| `af-sud-equatoria` | `af-bea-northern-province-of-uganda` | 1 |
| `af-sud-equatoria` | `af-fea-ubangi-shari-the-east` | 2 |
| `af-dar-south-and-west-darfur` | `af-fea-ubangi-shari-the-east` | 2 |
| `af-dar-south-and-west-darfur` | `af-fea-chad-the-east` | 2 |
| `af-wad-borkou-ennedi-and-tibesti` | `af-fwa-niger-the-sahara` | 1 |
| `af-sok-sokoto-and-gwandu` | `af-fwa-dahomey-the-north` | 1 |
| `af-sok-sokoto-and-gwandu` | `af-fwa-niger-the-niger-valley` | 1 |
| `af-sok-sokoto-and-gwandu` | `af-fwa-niger-the-sahel` | 2 |
| `af-sok-kano` | `af-fwa-niger-the-sahel` | 1 |
| `af-sok-bauchi-and-adamawa` | `af-kam-northern-kamerun` | 6 |
| `af-gea-tanga-and-the-usambara` | `af-bea-mombasa-and-the-coast` | 1 |
| `af-gea-kilimanjaro-and-moshi` | `af-bea-mombasa-and-the-coast` | 2 |
| `af-gea-kilimanjaro-and-moshi` | `af-bea-rift-valley` | 1 |
| `af-gea-arusha-and-the-maasai-steppe` | `af-bea-rift-valley` | 1 |
| `af-gea-tabora-and-kigoma` | `af-cfs-katanga` | 1 |
| `af-gea-tabora-and-kigoma` | `af-cfs-south-kivu` | 1 |
| `af-gea-bukoba-mwanza-and-the-lake` | `af-bea-western-province-of-uganda` | 2 |
| `af-gea-iringa-mbeya-and-rukwa` | `af-cfs-katanga` | 2 |
| `af-gea-iringa-mbeya-and-rukwa` | `af-cra-nyasaland-northern-province` | 2 |
| `af-gea-iringa-mbeya-and-rukwa` | `af-cra-northern-rhodesia-north-eastern` | 1 |
| `af-gea-lindi-mtwara-and-ruvuma` | `af-moz-cabo-delgado` | 2 |
| `af-gea-lindi-mtwara-and-ruvuma` | `af-moz-niassa` | 1 |
| `af-gea-lindi-mtwara-and-ruvuma` | `af-cra-nyasaland-northern-province` | 1 |
| `af-gea-rwanda` | `af-cfs-north-kivu` | 1 |
| `af-gea-rwanda` | `af-cfs-south-kivu` | 2 |
| `af-gea-rwanda` | `af-bea-western-province-of-uganda` | 1 |
| `af-gea-burundi` | `af-cfs-south-kivu` | 2 |
| `af-kam-southern-cameroons` | `af-bwa-southern-nigeria-the-east` | 3 |
| `af-kam-southern-cameroons` | `af-bwa-southern-nigeria-the-middle-belt` | 1 |
| `af-kam-northern-kamerun` | `af-bwa-southern-nigeria-the-middle-belt` | 1 |
| `af-kam-northern-kamerun` | `af-bwa-northern-nigeria-borno-and-the-chad-frontier` | 1 |
| `af-kam-southern-kamerun` | `af-fea-gabon-the-interior` | 2 |
| `af-kam-southern-kamerun` | `af-fea-middle-congo-the-north` | 1 |
| `af-kam-southern-kamerun` | `af-fea-ubangi-shari-the-west` | 2 |
| `af-tog-french-togoland-maritime-and-plateaux` | `af-fwa-dahomey-the-coast` | 1 |
| `af-tog-french-togoland-maritime-and-plateaux` | `af-fwa-dahomey-the-north` | 1 |
| `af-tog-french-togoland-centre` | `af-bwa-northern-territories-of-the-gold-coast` | 1 |
| `af-tog-french-togoland-centre` | `af-fwa-dahomey-the-north` | 1 |
| `af-tog-french-togoland-kara-and-savanes` | `af-bwa-northern-territories-of-the-gold-coast` | 2 |
| `af-tog-french-togoland-kara-and-savanes` | `af-fwa-upper-volta-tenkodogo` | 1 |
| `af-tog-french-togoland-kara-and-savanes` | `af-fwa-upper-volta-fada-n-gourma` | 1 |
| `af-tog-french-togoland-kara-and-savanes` | `af-fwa-dahomey-the-north` | 2 |
| `af-gsw-hereroland` | `af-hct-bechuanaland-ngamiland-and-chobe` | 1 |
| `af-gsw-ovamboland` | `af-ang-cunene` | 1 |
| `af-gsw-kaokoland` | `af-ang-namibe` | 1 |
| `af-gsw-kaokoland` | `af-ang-cunene` | 1 |
| `af-gsw-kavango-and-caprivi` | `af-ang-cuando-cubango` | 2 |
| `af-gsw-kavango-and-caprivi` | `af-cra-northern-rhodesia-barotseland` | 1 |
| `af-gsw-kavango-and-caprivi` | `af-cra-northern-rhodesia-southern` | 1 |
| `af-gsw-kavango-and-caprivi` | `af-hct-bechuanaland-ngamiland-and-chobe` | 2 |
| `af-cfs-leopoldville-and-bas-congo` | `af-ang-uige-and-zaire` | 1 |
| `af-cfs-leopoldville-and-bas-congo` | `af-ang-cabinda` | 3 |
| `af-cfs-leopoldville-and-bas-congo` | `af-fea-middle-congo-brazzaville-and-the-pool` | 1 |
| `af-cfs-leopoldville-and-bas-congo` | `af-fea-middle-congo-the-south` | 1 |
| `af-cfs-kwango-and-bandundu` | `af-ang-uige-and-zaire` | 1 |
| `af-cfs-kwango-and-bandundu` | `af-ang-lunda` | 1 |
| `af-cfs-kwango-and-bandundu` | `af-fea-middle-congo-brazzaville-and-the-pool` | 2 |
| `af-cfs-kwango-and-bandundu` | `af-fea-middle-congo-the-south` | 1 |
| `af-cfs-equateur` | `af-fea-middle-congo-the-north` | 2 |
| `af-cfs-equateur` | `af-fea-middle-congo-the-south` | 1 |
| `af-cfs-equateur` | `af-fea-ubangi-shari-the-west` | 1 |
| `af-cfs-equateur` | `af-fea-ubangi-shari-the-centre` | 1 |
| `af-cfs-equateur` | `af-fea-ubangi-shari-the-east` | 1 |
| `af-cfs-orientale` | `af-bea-northern-province-of-uganda` | 1 |
| `af-cfs-orientale` | `af-fea-ubangi-shari-the-east` | 1 |
| `af-cfs-kasai` | `af-ang-lunda` | 1 |
| `af-cfs-katanga` | `af-ang-moxico` | 2 |
| `af-cfs-katanga` | `af-ang-lunda` | 2 |
| `af-cfs-katanga` | `af-cra-northern-rhodesia-barotseland` | 1 |
| `af-cfs-katanga` | `af-cra-northern-rhodesia-central` | 2 |
| `af-cfs-north-kivu` | `af-bea-western-province-of-uganda` | 1 |
| `af-ang-cabinda` | `af-fea-middle-congo-the-south` | 2 |
| `af-ang-cuando-cubango` | `af-cra-northern-rhodesia-barotseland` | 1 |
| `af-moz-niassa` | `af-cra-nyasaland-northern-province` | 1 |
| `af-moz-niassa` | `af-cra-nyasaland-central-province` | 1 |
| `af-moz-niassa` | `af-cra-nyasaland-southern-province` | 1 |
| `af-moz-zambezia` | `af-cra-nyasaland-southern-province` | 3 |
| `af-moz-tete` | `af-cra-nyasaland-central-province` | 1 |
| `af-moz-tete` | `af-cra-nyasaland-southern-province` | 3 |
| `af-moz-tete` | `af-cra-northern-rhodesia-central` | 1 |
| `af-moz-tete` | `af-cra-northern-rhodesia-southern` | 2 |
| `af-moz-tete` | `af-cra-southern-rhodesia-mashonaland` | 2 |
| `af-moz-tete` | `af-cra-southern-rhodesia-victoria-and-the-midlands` | 1 |
| `af-moz-manica-and-sofala` | `af-cra-southern-rhodesia-victoria-and-the-midlands` | 2 |
| `af-moz-gaza` | `af-cra-southern-rhodesia-victoria-and-the-midlands` | 1 |
| `af-moz-lourenco-marques` | `af-hct-swaziland` | 2 |
| `af-moz-lourenco-marques` | `af-zar-lydenburg-and-the-eastern-transvaal` | 2 |
| `af-cra-southern-rhodesia-matabeleland` | `af-zar-zoutpansberg-and-the-northern-transvaal` | 2 |
| `af-hct-bechuanaland-central-district` | `af-zar-zoutpansberg-and-the-northern-transvaal` | 1 |
| `af-hct-bechuanaland-kgalagadi-and-the-south` | `af-cap-northern-cape-and-griqualand-west` | 3 |
| `af-hct-bechuanaland-kgalagadi-and-the-south` | `af-zar-potchefstroom-and-the-western-transvaal` | 1 |
| `af-hct-basutoland-the-lowlands` | `af-cap-eastern-cape-and-the-transkei` | 1 |
| `af-hct-basutoland-the-highlands` | `af-cap-eastern-cape-and-the-transkei` | 3 |
| `af-bwa-gold-coast-colony` | `af-fwa-ivory-coast-the-south` | 2 |
| `af-bwa-gold-coast-colony` | `af-fwa-ivory-coast-the-north` | 1 |
| `af-bwa-ashanti` | `af-fwa-ivory-coast-the-north` | 2 |
| `af-bwa-northern-territories-of-the-gold-coast` | `af-fwa-ivory-coast-the-north` | 1 |
| `af-bwa-northern-territories-of-the-gold-coast` | `af-fwa-upper-volta-koudougou` | 1 |
| `af-bwa-northern-territories-of-the-gold-coast` | `af-fwa-upper-volta-manga` | 1 |
| `af-bwa-northern-territories-of-the-gold-coast` | `af-fwa-upper-volta-tenkodogo` | 1 |
| `af-bwa-gambia` | `af-fwa-senegal-the-communes-and-the-coast` | 5 |
| `af-bwa-gambia` | `af-fwa-senegal-the-interior` | 4 |
| `af-bwa-sierra-leone-protectorate` | `af-fwa-guinea-faranah` | 1 |
| `af-bwa-sierra-leone-protectorate` | `af-fwa-guinea-the-forest-region` | 2 |
| `af-bwa-sierra-leone-protectorate` | `af-lbr-western-liberia` | 1 |
| `af-bwa-southern-nigeria-the-west` | `af-fwa-dahomey-the-coast` | 1 |
| `af-bwa-southern-nigeria-the-west` | `af-fwa-dahomey-the-north` | 2 |
| `af-bwa-southern-nigeria-the-middle-belt` | `af-fwa-dahomey-the-north` | 2 |
| `af-bwa-northern-nigeria-borno-and-the-chad-frontier` | `af-fwa-niger-the-sahel` | 2 |
| `af-bwa-northern-nigeria-borno-and-the-chad-frontier` | `af-fwa-niger-the-sahara` | 1 |
| `af-bwa-northern-nigeria-borno-and-the-chad-frontier` | `af-fea-chad-the-chari-and-the-lake` | 2 |
| `af-bwa-northern-nigeria-the-niger-province` | `af-fwa-dahomey-the-north` | 2 |
| `af-fwa-guinea-the-forest-region` | `af-lbr-nimba-and-bong` | 1 |
| `af-fwa-guinea-the-forest-region` | `af-lbr-western-liberia` | 3 |
| `af-fwa-ivory-coast-the-south` | `af-lbr-sinoe-grand-kru-and-grand-gedeh` | 2 |
| `af-fwa-ivory-coast-the-south` | `af-lbr-maryland` | 1 |
| `af-fwa-ivory-coast-the-south` | `af-lbr-nimba-and-bong` | 2 |
| `af-fwa-niger-the-sahara` | `af-fea-chad-the-chari-and-the-lake` | 1 |
| `af-fwa-niger-the-sahara` | `af-fea-chad-the-east` | 1 |
| `af-fwa-niger-the-sahara` | `af-ott-murzuq-and-ghat` | 1 |
| `af-fea-chad-the-east` | `af-ott-murzuq-and-ghat` | 1 |
| `af-alg-constantine-and-the-east` | `af-tun-bizerte-and-the-north-west` | 1 |
| `af-alg-oran-and-the-west` | `af-mar-eastern-morocco` | 2 |
| `af-alg-laghouat-and-the-southern-territories` | `af-tun-bizerte-and-the-north-west` | 1 |
| `af-alg-laghouat-and-the-southern-territories` | `af-tun-gabes-and-the-south` | 1 |
| `af-alg-laghouat-and-the-southern-territories` | `af-mar-eastern-morocco` | 2 |
| `af-alg-bechar-and-the-west-sahara` | `af-mar-fez-and-meknes` | 1 |
| `af-alg-bechar-and-the-west-sahara` | `af-mar-souss-the-anti-atlas-and-tarfaya` | 1 |
| `af-alg-bechar-and-the-west-sahara` | `af-mar-eastern-morocco` | 1 |
| `af-alg-ouargla-and-the-east-sahara` | `af-tun-gabes-and-the-south` | 1 |
| `af-alg-ouargla-and-the-east-sahara` | `af-ott-sabha-wadi-al-hayaa-and-ash-shati` | 1 |
| `af-alg-ouargla-and-the-east-sahara` | `af-ott-murzuq-and-ghat` | 4 |
| `af-tun-kairouan-and-the-centre` | `af-ott-misrata-and-the-gulf-coast` | 1 |
| `af-tun-kairouan-and-the-centre` | `af-ott-sirte-ghadames-and-the-jufra` | 1 |
| `af-tun-gabes-and-the-south` | `af-ott-sirte-ghadames-and-the-jufra` | 3 |
| `af-bpo-zanzibar` | `af-gea-dar-es-salaam-and-the-coast` | 3 |
| `af-bpo-zanzibar` | `af-gea-tanga-and-the-usambara` | 1 |
| `af-bpo-pemba` | `af-gea-tanga-and-the-usambara` | 2 |
| `af-dar-south-and-west-darfur` | `af-wad-wadai-and-ouaddai` | 2 |
| `af-moz-lourenco-marques` | `af-nat-natal-and-zululand` | 1 |
| `af-fwa-mauritania-adrar-and-the-hodh` | `af-alg-bechar-and-the-west-sahara` | 1 |

The committed build products are:

- `packages/data/data/map/provinces_africa_1900.json` — province metadata, geometry, shared boundaries and future polities.
- `packages/data/data/map/provinces_africa_1900_audit.json` — coverage, overlaps, ids, source count, unassigned units, seam borders and warnings.
- `packages/app/src/generated/provincesAfrica1900.ts` — the same bundle for the offline app.
- `scripts/m12c/africa-plan.mjs` — the authored historical inventory and grouping rules.
- `scripts/m12c/build-africa-provinces.mjs` — the deterministic geometry build.

## 4. Sources

| ID | Title | Licence | Date | URL |
|---|---|---|---|---|
| `natural-earth-10m-admin1` | Natural Earth 1:10m admin-1 states and provinces | Public domain | 2024 | https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/ |
| `natural-earth-50m-admin0` | Natural Earth 1:50m admin-0 countries | Public domain | 2024 | https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/ |
| `eb1911-africa` | Encyclopaedia Britannica (1911), 'Africa' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Africa |
| `eb1911-egypt` | Encyclopaedia Britannica (1911), 'Egypt' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Egypt |
| `eb1911-sudan` | Encyclopaedia Britannica (1911), 'Sudan' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Sudan |
| `eb1911-south-africa` | Encyclopaedia Britannica (1911), 'South Africa' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/South_Africa |
| `eb1911-morocco` | Encyclopaedia Britannica (1911), 'Morocco' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Morocco |
| `eb1911-german-africa` | Encyclopaedia Britannica (1911), German African colonies | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/German_East_Africa |
| `eb1911-congo` | Encyclopaedia Britannica (1911), 'Congo Free State' | Public domain | 1911 | https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Congo_Free_State |
| `treaty-anglo-egyptian-1899` | Anglo-Egyptian Condominium Agreement (1899) | Public domain | 1899 | https://en.wikisource.org/wiki/Anglo-Egyptian_Condominium_Agreement |
| `treaty-anglo-german-1890` | Heligoland-Zanzibar Treaty (1890) | Public domain | 1890 | https://en.wikisource.org/wiki/Heligoland%E2%80%93Zanzibar_Treaty |
| `treaty-fashoda-1898` | Fashoda settlement (1898-1899) and the Anglo-French frontier | Public domain | 1899 | https://en.wikisource.org/wiki/Fashoda_Incident |
| `treaty-versailles-1919` | Treaty of Versailles (1919), German colonies | Public domain | 1919 | https://en.wikisource.org/wiki/Treaty_of_Versailles |
| `treaty-saint-germain-1919` | Treaty of Saint-Germain (1919), African clauses | Public domain | 1919 | https://en.wikisource.org/wiki/Treaty_of_Saint-Germain-en-Laye |
| `treaty-lausanne-1923` | Treaty of Lausanne (1923), Libyan and Egyptian clauses | Public domain | 1923 | https://en.wikisource.org/wiki/Treaty_of_Lausanne |
| `treaty-anglo-italian-1925` | Anglo-Italian Convention (1925), Jubaland | Public domain | 1925 | https://en.wikisource.org/wiki/Anglo-Italian_Convention_of_1925 |
| `treaty-anglo-egyptian-1953` | Anglo-Egyptian Agreement (1953) and the 1956 independence of the Sudan | Public domain | 1953 | https://en.wikisource.org/wiki/Anglo-Egyptian_Agreement_of_1953 |
| `oau-1964-cairo` | Organisation of African Unity, Cairo Resolution (1964) | Public domain | 1964 | https://en.wikisource.org/wiki/Organisation_of_African_Unity |
| `project-authored-1900` | Fabric of Nations M11c authored 1900 boundary reconstruction | Project data | 2026 | internal:packages/data/data/historical/m11/boundaries_1900.json |
| `project-authored-m12` | Fabric of Nations M12a/M12b/M12c authored provincial partition | Project data | 2026 | internal:scripts/m12c/africa-plan.mjs |

## 5. Coverage

Coverage is measured by subtracting each province from its 1900 map polity
polygon, restricted to the African coverage scope for the shared features
(Ottoman Libya, the French Indian Ocean islands, the Portuguese Atlantic islands,
the British Indian and South Atlantic islands, Morocco north of Western Sahara and
the Cape south of the Prince Edward Islands). The residual is **not** promoted to
a duplicate province: it stays under the 1900 polity fill, whose owner is correct,
and is reported here instead. `estimated` rows are cases where the polygon
library could not complete a large sequential difference; their residual is
approximated by area. Coastal and frontier slivers below a few hundredths of a
square degree are normal at this simplification level.

| Map feature | Scope (deg²) | Covered (deg²) | Residual |
|---|---:|---:|---:|
| FEA | 151.15 | 147.64 | 3.50 |
| ITS | 28.24 | 26.60 | 1.64 (estimated) |
| ALG | 213.65 | 212.37 | 1.28 |
| FWA | 392.19 | 391.26 | 0.93 |
| MAR | 38.53 | 37.79 | 0.74 |
| BEA | 77.00 | 76.26 | 0.74 |
| CFS | 189.61 | 188.98 | 0.63 (estimated) |
| BWA | 73.38 | 72.78 | 0.60 |
| CRA | 106.21 | 105.67 | 0.54 |
| ANG | 103.57 | 103.11 | 0.46 |
| SUD | 165.13 | 164.68 | 0.45 |
| MOZ | 67.02 | 66.57 | 0.45 |
| MAD | 51.16 | 50.75 | 0.42 |
| GEA | 81.18 | 80.85 | 0.34 |
| EGY | 90.81 | 90.48 | 0.33 |
| KAM | 37.92 | 37.63 | 0.30 |
| ETH | 92.65 | 92.36 | 0.29 |
| GSW | 71.98 | 71.77 | 0.21 |
| BSO | 14.84 | 14.65 | 0.19 |
| ERI | 10.38 | 10.19 | 0.18 |
| TUN | 15.31 | 15.13 | 0.18 |
| PAI | 3.01 | 2.85 | 0.16 |
| HCT | 54.96 | 54.81 | 0.15 |
| LBR | 7.80 | 7.67 | 0.13 |
| OTT | 147.79 | 147.70 | 0.08 |
| DAR | 42.77 | 42.72 | 0.06 |
| TOG | 6.31 | 6.25 | 0.05 |
| ZAR | 29.09 | 29.03 | 0.05 |
| CAP | 63.38 | 63.35 | 0.04 |
| ORF | 11.97 | 11.95 | 0.02 |
| SGG | 2.15 | 2.13 | 0.02 |
| WAD | 55.37 | 55.36 | 0.02 |
| SOK | 26.03 | 26.01 | 0.02 |
| FSO | 1.78 | 1.77 | 0.02 |
| BPO | 0.35 | 0.34 | 0.01 |
| FRA | 0.25 | 0.24 | 0.01 |
| SAH | 8.06 | 8.05 | 0.01 |
| NAT | 8.68 | 8.67 | 0.00 |
| BSA | 0.01 | 0.01 | 0.00 |

## 6. Future successor polities

None of these polities is selectable in 1900. They can receive provinces through
an ownership transfer; activation dates are stored as campaign day indices.

| ID | Tag | Historical name | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|
| 1200 | EGY | Kingdom of Egypt | independent | 1922-02-28 | — | Cairo | high |
| 1201 | SDN | Republic of the Sudan | independent | 1956-01-01 | — | Khartoum | high |
| 1202 | SSD | Republic of South Sudan | independent | 2000-01-01 | — | Juba | medium |
| 1203 | LBY | United Kingdom of Libya | independent | 1951-12-24 | — | Tripoli | high |
| 1204 | TUN | Kingdom of Tunisia | independent | 1956-03-20 | — | Tunis | high |
| 1205 | DZA | People's Democratic Republic of Algeria | independent | 1962-07-05 | — | Algiers | high |
| 1206 | ERI | State of Eritrea | independent | 1993-05-24 | — | Asmara | high |
| 1207 | SOM | Somali Republic | independent | 1960-07-01 | — | Mogadishu | high |
| 1208 | SOL | State of Somaliland | independent | 1991-05-18 | — | Hargeisa | medium |
| 1209 | KEN | Kenya | independent | 1963-12-12 | — | Nairobi | high |
| 1210 | UGA | Uganda | independent | 1962-10-09 | — | Kampala | high |
| 1211 | TZA | United Republic of Tanzania | independent | 1964-10-29 | — | Dodoma | high |
| 1212 | TAN | Tanganyika | independent | 1961-12-09 | 1964-10-29 | Dar es Salaam | high |
| 1213 | ZAN | Sultanate of Zanzibar | independent | 1963-12-10 | 1964-04-26 | Zanzibar City | high |
| 1214 | RWA | Republic of Rwanda | independent | 1962-07-01 | — | Kigali | high |
| 1215 | BDI | Kingdom of Burundi | independent | 1962-07-01 | — | Bujumbura | high |
| 1216 | ZMB | Republic of Zambia | independent | 1964-10-24 | — | Lusaka | high |
| 1217 | ZWE | Republic of Zimbabwe | independent | 1980-04-18 | — | Harare | high |
| 1218 | MWI | Republic of Malawi | independent | 1964-07-06 | — | Zomba | high |
| 1219 | NAM | Republic of Namibia | independent | 1990-03-21 | — | Windhoek | high |
| 1220 | ZAF | Union of South Africa | independent | 1910-05-31 | — | Pretoria | high |
| 1221 | BWA | Republic of Botswana | independent | 1966-09-30 | — | Gaborone | high |
| 1222 | LSO | Kingdom of Lesotho | independent | 1966-10-04 | — | Maseru | high |
| 1223 | SWZ | Kingdom of Swaziland | independent | 1968-09-06 | — | Mbabane | high |
| 1224 | NGA | Federation of Nigeria | independent | 1960-10-01 | — | Lagos | high |
| 1225 | GHA | Ghana | independent | 1957-03-06 | — | Accra | high |
| 1226 | SLE | Sierra Leone | independent | 1961-04-27 | — | Freetown | high |
| 1227 | GMB | Republic of the Gambia | independent | 1965-02-18 | — | Bathurst | high |
| 1228 | MRT | Islamic Republic of Mauritania | independent | 1960-11-28 | — | Nouakchott | high |
| 1229 | MLI | Republic of Mali | independent | 1960-09-22 | — | Bamako | high |
| 1230 | SEN | Republic of Senegal | independent | 1960-04-04 | — | Dakar | high |
| 1231 | GIN | Republic of Guinea | independent | 1958-10-02 | — | Conakry | high |
| 1232 | CIV | Republic of Côte d'Ivoire | independent | 1960-08-07 | — | Abidjan | high |
| 1233 | BFA | Republic of Upper Volta | independent | 1960-08-05 | — | Ouagadougou | high |
| 1234 | BEN | Republic of Dahomey | independent | 1960-08-01 | — | Porto-Novo | high |
| 1235 | NER | Republic of the Niger | independent | 1960-08-03 | — | Niamey | high |
| 1236 | TCD | Republic of Chad | independent | 1960-08-11 | — | Fort-Lamy | high |
| 1237 | CAF | Central African Republic | independent | 1960-08-13 | — | Bangui | high |
| 1238 | COG | Republic of the Congo | independent | 1960-08-15 | — | Brazzaville | high |
| 1239 | GAB | Gabonese Republic | independent | 1960-08-17 | — | Libreville | high |
| 1240 | COD | Republic of the Congo (Léopoldville) | independent | 1960-06-30 | — | Léopoldville | high |
| 1241 | CMR | Republic of Cameroon | independent | 1960-01-01 | — | Yaoundé | high |
| 1242 | TGO | Togolese Republic | independent | 1960-04-27 | — | Lomé | high |
| 1243 | MDG | Malagasy Republic | independent | 1960-06-26 | — | Tananarive | high |
| 1244 | COM | Federal Islamic Republic of the Comoros | independent | 1975-07-06 | — | Moroni | high |
| 1245 | DJI | Republic of Djibouti | independent | 1977-06-27 | — | Djibouti | high |
| 1246 | AGO | People's Republic of Angola | independent | 1975-11-11 | — | Luanda | high |
| 1247 | MOZ | People's Republic of Mozambique | independent | 1975-06-25 | — | Maputo | high |
| 1248 | GNB | Republic of Guinea-Bissau | independent | 1973-09-24 | — | Bissau | high |
| 1249 | CPV | Republic of Cape Verde | independent | 1975-07-05 | — | Praia | high |
| 1250 | STP | Democratic Republic of São Tomé and Príncipe | independent | 1975-07-12 | — | São Tomé | high |
| 1251 | GNQ | Republic of Equatorial Guinea | independent | 1968-10-12 | — | Santa Isabel | high |
| 1252 | SADR | Sahrawi Arab Democratic Republic | independent | 1976-02-27 | — | Laayoune | medium |
| 1253 | MUS | Mauritius | independent | 1968-03-12 | — | Port Louis | high |
| 1254 | SYC | Republic of Seychelles | independent | 1976-06-29 | — | Victoria | high |
| 1255 | RHO | Rhodesia | independent | 1965-11-11 | 1979-06-01 | Salisbury | medium |
| 1256 | ZRW | Zimbabwe Rhodesia | independent | 1979-06-01 | 1980-04-18 | Salisbury | medium |

South Sudan is registered with an activation of 1 January 2000 rather than its
historical 9 July 2011 because the simulated calendar ends on 1 January 2000. The
southern Sudanese provinces are permanently separate from the northern ones, so
the transfer remains a single ordinary ownership change; see D-105.

## 7. Major historical transfers supported

Reference snapshots are validation references, not forced outcomes. They are
exercised by `packages/tests/src/map/provinces-africa.test.ts`.

- **1903–1916**: Britain annexes the Sokoto Caliphate; France annexes Wadai; the
  Anglo-Egyptian Sudan annexes Darfur. The emirates and sultanates are separate
  provinces from 1900, so each annexation is an ordinary transfer.
- **1910**: the Cape Colony (including the Walvis Bay exclave), Natal, the South
  African Republic and the Orange Free State form the Union of South Africa.
- **1911–1923**: Italy occupies and then acquires Ottoman Libya; Tripolitania,
  Cyrenaica and Fezzan are separate province groups so the 1951 federal kingdom
  is an ordinary transfer.
- **1912**: Morocco is divided into French and Spanish zones by a change of
  controller, not of ownership; the 1956 restoration is a liberation.
- **1919–1922**: German East Africa becomes Tanganyika, Ruanda and Urundi;
  Kamerun and Togoland are partitioned between France and Britain; German South
  West Africa becomes a South African mandate. Egypt becomes independent.
- **1936–1941**: Italy annexes Ethiopia and is expelled in 1941.
- **1943–1945**: the former Italian colonies pass to British military
  administration; ownership is unchanged, only effective control moves, until the
  1947 peace treaty and the 1949-1950 United Nations decisions.
- **1956–1968**: the decolonisation wave: Sudan, Tunisia, Morocco, Ghana, Guinea,
  Nigeria, Somalia, Mauritania, Mali, Senegal, Ivory Coast, Upper Volta, Dahomey,
  Niger, Chad, Ubangi-Shari, Middle Congo, Gabon, the Congo, Madagascar, Cameroon,
  Togo, Sierra Leone, Uganda, Rwanda, Burundi, Kenya, Tanganyika, Zanzibar,
  Nyasaland, Northern Rhodesia, the Gambia, Bechuanaland, Basutoland, Swaziland,
  Mauritius, Equatorial Guinea and Algeria.
- **1975–1977**: the Portuguese empire collapses into Angola, Mozambique,
  Guinea-Bissau, Cape Verde and São Tomé and Príncipe; the Comoros and Djibouti
  become independent; Spanish Sahara is proclaimed as the SADR.
- **1980–1994**: Southern Rhodesia becomes Zimbabwe, Namibia becomes independent,
  Walvis Bay is transferred from South Africa to Namibia, Eritrea becomes
  independent, and Somaliland is proclaimed.
- **2011 (campaign boundary)**: the southern Sudanese provinces are transferred to
  South Sudan at the last representable day.

## 8. Province inventory by 1900 owner

### Kingdom of Belgium (BEL) — 9 provinces

independent; 1900 population estimate 6700000; geometry BEL.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200102 | `af-cfs-leopoldville-and-bas-congo` | Léopoldville and Bas-Congo | Congo Free State district | Congo Free State | medium |
| 200103 | `af-cfs-kwango-and-bandundu` | Kwango and Bandundu | Congo Free State district | Congo Free State | medium |
| 200104 | `af-cfs-equateur` | Équateur | Congo Free State district | Congo Free State | medium |
| 200105 | `af-cfs-orientale` | Orientale | Congo Free State district | Congo Free State | medium |
| 200106 | `af-cfs-kasai` | Kasaï | Congo Free State district | Congo Free State | medium |
| 200107 | `af-cfs-katanga` | Katanga | Congo Free State district | Congo Free State | medium |
| 200108 | `af-cfs-maniema` | Maniema | Congo Free State district | Congo Free State | medium |
| 200109 | `af-cfs-north-kivu` | North Kivu | Congo Free State district | Congo Free State | medium |
| 200110 | `af-cfs-south-kivu` | South Kivu | Congo Free State district | Congo Free State | medium |

### Sultanate of Darfur (DAR) — 2 provinces

independent; 1900 population estimate 2000000; geometry adm1:SD-DE, adm1:SD-DN, adm1:SD-DS, adm1:SD-DW.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200067 | `af-dar-north-darfur` | North Darfur | Darfuri sultanate province | Sultanate of Darfur | medium |
| 200068 | `af-dar-south-and-west-darfur` | South and West Darfur | Darfuri sultanate province | Sultanate of Darfur | medium |

### German Empire (DEU) — 27 provinces

independent; 1900 population estimate 56367000; geometry DEU.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200075 | `af-gea-tanga-and-the-usambara` | Tanga and the Usambara | German colonial district | German East Africa | medium |
| 200076 | `af-gea-kilimanjaro-and-moshi` | Kilimanjaro and Moshi | German colonial district | German East Africa | medium |
| 200077 | `af-gea-arusha-and-the-maasai-steppe` | Arusha and the Maasai Steppe | German colonial district | German East Africa | medium |
| 200078 | `af-gea-dar-es-salaam-and-the-coast` | Dar es Salaam and the Coast | German colonial district | German East Africa | medium |
| 200079 | `af-gea-morogoro-and-the-rufiji` | Morogoro and the Rufiji | German colonial district | German East Africa | medium |
| 200080 | `af-gea-dodoma-and-singida` | Dodoma and Singida | German colonial district | German East Africa | medium |
| 200081 | `af-gea-tabora-and-kigoma` | Tabora and Kigoma | German colonial district | German East Africa | medium |
| 200082 | `af-gea-bukoba-mwanza-and-the-lake` | Bukoba, Mwanza and the Lake | German colonial district | German East Africa | medium |
| 200083 | `af-gea-iringa-mbeya-and-rukwa` | Iringa, Mbeya and Rukwa | German colonial district | German East Africa | medium |
| 200084 | `af-gea-lindi-mtwara-and-ruvuma` | Lindi, Mtwara and Ruvuma | German colonial district | German East Africa | medium |
| 200085 | `af-gea-rwanda` | Rwanda | German colonial district | Ruanda-Urundi | medium |
| 200086 | `af-gea-burundi` | Burundi | German colonial district | Ruanda-Urundi | medium |
| 200087 | `af-kam-southern-cameroons` | Southern Cameroons | German colonial territory | Kamerun | low |
| 200088 | `af-kam-northern-kamerun` | Northern Kamerun | German colonial territory | Kamerun | low |
| 200089 | `af-kam-central-kamerun` | Central Kamerun | German colonial territory | Kamerun | low |
| 200090 | `af-kam-southern-kamerun` | Southern Kamerun | German colonial territory | Kamerun | low |
| 200091 | `af-tog-british-togoland` | British Togoland | German colonial territory | Togoland | low |
| 200092 | `af-tog-french-togoland-maritime-and-plateaux` | French Togoland: Maritime and Plateaux | German colonial territory | Togoland | medium |
| 200093 | `af-tog-french-togoland-centre` | French Togoland: Centre | German colonial territory | Togoland | medium |
| 200094 | `af-tog-french-togoland-kara-and-savanes` | French Togoland: Kara and Savanes | German colonial territory | Togoland | medium |
| 200095 | `af-gsw-windhoek-and-the-khomas-highlands` | Windhoek and the Khomas Highlands | German colonial district | German South West Africa | medium |
| 200096 | `af-gsw-erongo-and-the-central-coast` | Erongo and the Central Coast | German colonial district | German South West Africa | medium |
| 200097 | `af-gsw-namaland` | Namaland | German colonial district | German South West Africa | medium |
| 200098 | `af-gsw-hereroland` | Hereroland | German colonial district | German South West Africa | medium |
| 200099 | `af-gsw-ovamboland` | Ovamboland | German colonial district | German South West Africa | medium |
| 200100 | `af-gsw-kaokoland` | Kaokoland | German colonial district | German South West Africa | medium |
| 200101 | `af-gsw-kavango-and-caprivi` | Kavango and Caprivi | German colonial district | German South West Africa | medium |

### Kingdom of Spain (ESP) — 4 provinces

independent; 1900 population estimate 18600000; geometry ESP.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200001 | `af-sah-saguia-el-hamra` | Saguia el-Hamra | Spanish colonial territory | Spanish Sahara | low |
| 200002 | `af-sah-rio-de-oro` | Río de Oro | Spanish colonial territory | Spanish Sahara | low |
| 200015 | `af-sgg-rio-muni` | Río Muni | Spanish colonial territory | Spanish Guinea | medium |
| 200016 | `af-sgg-fernando-po` | Fernando Pó | Spanish colonial territory | Spanish Guinea | medium |

### Ethiopian Empire (ETH) — 10 provinces

independent; 1900 population estimate 11000000; geometry ETH.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200038 | `af-eth-tigray` | Tigray | Ethiopian province | Ethiopian Empire | medium |
| 200039 | `af-eth-amhara-and-begemder` | Amhara and Begemder | Ethiopian province | Ethiopian Empire | medium |
| 200040 | `af-eth-afar` | Afar | Ethiopian province | Ethiopian Empire | medium |
| 200041 | `af-eth-shewa-and-addis-ababa` | Shewa and Addis Ababa | Ethiopian province | Ethiopian Empire | medium |
| 200042 | `af-eth-oromia` | Oromia | Ethiopian province | Ethiopian Empire | medium |
| 200043 | `af-eth-sidamo-and-the-southern-provinces` | Sidamo and the Southern Provinces | Ethiopian province | Ethiopian Empire | medium |
| 200044 | `af-eth-hararghe` | Hararghe | Ethiopian province | Ethiopian Empire | medium |
| 200045 | `af-eth-ogaden` | Ogaden | Ethiopian province | Ethiopian Empire | medium |
| 200046 | `af-eth-benishangul` | Benishangul | Ethiopian province | Ethiopian Empire | medium |
| 200047 | `af-eth-gambela` | Gambela | Ethiopian province | Ethiopian Empire | medium |

### French Republic (FRA) — 70 provinces

independent; 1900 population estimate 38900000; geometry FRA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200019 | `af-fra-reunion` | Réunion | French colony | French Indian Ocean islands | high |
| 200020 | `af-fra-mayotte` | Mayotte | French colony | French Indian Ocean islands | high |
| 200021 | `af-mad-antananarivo` | Antananarivo | French colony | French Madagascar | medium |
| 200022 | `af-mad-fianarantsoa` | Fianarantsoa | French colony | French Madagascar | medium |
| 200023 | `af-mad-toamasina` | Toamasina | French colony | French Madagascar | medium |
| 200024 | `af-mad-mahajanga` | Mahajanga | French colony | French Madagascar | medium |
| 200025 | `af-mad-toliara` | Toliara | French colony | French Madagascar | medium |
| 200026 | `af-mad-antsiranana` | Antsiranana | French colony | French Madagascar | medium |
| 200027 | `af-mad-grande-comore` | Grande Comore | French protectorate | Comoros | medium |
| 200028 | `af-mad-anjouan` | Anjouan | French protectorate | Comoros | medium |
| 200029 | `af-mad-moheli` | Mohéli | French protectorate | Comoros | medium |
| 200180 | `af-fwa-senegal-the-communes-and-the-coast` | Senegal: the Communes and the Coast | French colony or territory | French West Africa | medium |
| 200181 | `af-fwa-senegal-the-interior` | Senegal: the Interior | French colony or territory | French West Africa | medium |
| 200182 | `af-fwa-mauritania-trarza-and-the-coast` | Mauritania: Trarza and the Coast | French colony or territory | French West Africa | medium |
| 200183 | `af-fwa-mauritania-adrar-and-the-hodh` | Mauritania: Adrar and the Hodh | French colony or territory | French West Africa | medium |
| 200184 | `af-fwa-mauritania-dakhlet-nouadhibou` | Mauritania: Dakhlet Nouadhibou | French colony or territory | French West Africa | low |
| 200185 | `af-fwa-french-sudan-kayes-bamako-and-koulikoro` | French Sudan: Kayes, Bamako and Koulikoro | French colony or territory | French West Africa | medium |
| 200186 | `af-fwa-french-sudan-segou-and-mopti` | French Sudan: Ségou and Mopti | French colony or territory | French West Africa | medium |
| 200187 | `af-fwa-french-sudan-sikasso` | French Sudan: Sikasso | French colony or territory | French West Africa | medium |
| 200188 | `af-fwa-french-sudan-tombouctou-gao-and-kidal` | French Sudan: Tombouctou, Gao and Kidal | French colony or territory | French West Africa | medium |
| 200189 | `af-fwa-guinea-conakry-and-the-coast` | Guinea: Conakry and the Coast | French colony or territory | French West Africa | medium |
| 200190 | `af-fwa-guinea-fouta-djallon` | Guinea: Fouta Djallon | French colony or territory | French West Africa | medium |
| 200191 | `af-fwa-guinea-the-middle-niger` | Guinea: the Middle Niger | French colony or territory | French West Africa | medium |
| 200192 | `af-fwa-guinea-the-upper-niger` | Guinea: the Upper Niger | French colony or territory | French West Africa | medium |
| 200193 | `af-fwa-guinea-faranah` | Guinea: Faranah | French colony or territory | French West Africa | medium |
| 200194 | `af-fwa-guinea-the-forest-region` | Guinea: the Forest Region | French colony or territory | French West Africa | medium |
| 200195 | `af-fwa-guinea-boke` | Guinea: Boké | French colony or territory | French West Africa | medium |
| 200196 | `af-fwa-ivory-coast-the-south` | Ivory Coast: the South | French colony or territory | French West Africa | medium |
| 200197 | `af-fwa-ivory-coast-the-north` | Ivory Coast: the North | French colony or territory | French West Africa | medium |
| 200198 | `af-fwa-upper-volta-ouagadougou` | Upper Volta: Ouagadougou | French colony or territory | French West Africa | medium |
| 200199 | `af-fwa-upper-volta-bobo-dioulasso` | Upper Volta: Bobo-Dioulasso | French colony or territory | French West Africa | medium |
| 200200 | `af-fwa-upper-volta-banfora` | Upper Volta: Banfora | French colony or territory | French West Africa | medium |
| 200201 | `af-fwa-upper-volta-dedougou` | Upper Volta: Dédougou | French colony or territory | French West Africa | medium |
| 200202 | `af-fwa-upper-volta-koudougou` | Upper Volta: Koudougou | French colony or territory | French West Africa | medium |
| 200203 | `af-fwa-upper-volta-manga` | Upper Volta: Manga | French colony or territory | French West Africa | medium |
| 200204 | `af-fwa-upper-volta-tenkodogo` | Upper Volta: Tenkodogo | French colony or territory | French West Africa | medium |
| 200205 | `af-fwa-upper-volta-kaya` | Upper Volta: Kaya | French colony or territory | French West Africa | medium |
| 200206 | `af-fwa-upper-volta-ouahigouya` | Upper Volta: Ouahigouya | French colony or territory | French West Africa | medium |
| 200207 | `af-fwa-upper-volta-dori` | Upper Volta: Dori | French colony or territory | French West Africa | medium |
| 200208 | `af-fwa-upper-volta-fada-n-gourma` | Upper Volta: Fada N'Gourma | French colony or territory | French West Africa | medium |
| 200209 | `af-fwa-upper-volta-gaoua` | Upper Volta: Gaoua | French colony or territory | French West Africa | medium |
| 200210 | `af-fwa-upper-volta-ziniare` | Upper Volta: Ziniaré | French colony or territory | French West Africa | medium |
| 200211 | `af-fwa-dahomey-the-coast` | Dahomey: the Coast | French colony or territory | French West Africa | medium |
| 200212 | `af-fwa-dahomey-the-north` | Dahomey: the North | French colony or territory | French West Africa | medium |
| 200213 | `af-fwa-niger-the-niger-valley` | Niger: the Niger Valley | French colony or territory | French West Africa | medium |
| 200214 | `af-fwa-niger-the-sahel` | Niger: the Sahel | French colony or territory | French West Africa | medium |
| 200215 | `af-fwa-niger-the-sahara` | Niger: the Sahara | French colony or territory | French West Africa | medium |
| 200216 | `af-fea-gabon-the-estuary-and-the-coast` | Gabon: the Estuary and the Coast | French colony or territory | French Equatorial Africa | medium |
| 200217 | `af-fea-gabon-the-interior` | Gabon: the Interior | French colony or territory | French Equatorial Africa | medium |
| 200218 | `af-fea-middle-congo-brazzaville-and-the-pool` | Middle Congo: Brazzaville and the Pool | French colony or territory | French Equatorial Africa | medium |
| 200219 | `af-fea-middle-congo-the-north` | Middle Congo: the North | French colony or territory | French Equatorial Africa | medium |
| 200220 | `af-fea-middle-congo-the-south` | Middle Congo: the South | French colony or territory | French Equatorial Africa | medium |
| 200221 | `af-fea-ubangi-shari-the-west` | Ubangi-Shari: the West | French colony or territory | French Equatorial Africa | medium |
| 200222 | `af-fea-ubangi-shari-the-centre` | Ubangi-Shari: the Centre | French colony or territory | French Equatorial Africa | medium |
| 200223 | `af-fea-ubangi-shari-the-east` | Ubangi-Shari: the East | French colony or territory | French Equatorial Africa | medium |
| 200224 | `af-fea-chad-the-chari-and-the-lake` | Chad: the Chari and the Lake | French colony or territory | French Equatorial Africa | medium |
| 200225 | `af-fea-chad-the-south` | Chad: the South | French colony or territory | French Equatorial Africa | medium |
| 200226 | `af-fea-chad-the-east` | Chad: the East | French colony or territory | French Equatorial Africa | medium |
| 200227 | `af-alg-algiers-and-the-mitidja` | Algiers and the Mitidja | French department or territory | French Algeria | medium |
| 200228 | `af-alg-the-kabylie` | The Kabylie | French department or territory | French Algeria | medium |
| 200229 | `af-alg-constantine-and-the-east` | Constantine and the East | French department or territory | French Algeria | medium |
| 200230 | `af-alg-oran-and-the-west` | Oran and the West | French department or territory | French Algeria | medium |
| 200231 | `af-alg-laghouat-and-the-southern-territories` | Laghouat and the Southern Territories | French department or territory | French Algeria | medium |
| 200232 | `af-alg-bechar-and-the-west-sahara` | Béchar and the West Sahara | French department or territory | French Algeria | medium |
| 200233 | `af-alg-ouargla-and-the-east-sahara` | Ouargla and the East Sahara | French department or territory | French Algeria | medium |
| 200234 | `af-tun-tunis-and-the-sahel` | Tunis and the Sahel | French protectorate | French Tunisia | medium |
| 200235 | `af-tun-bizerte-and-the-north-west` | Bizerte and the North-West | French protectorate | French Tunisia | medium |
| 200236 | `af-tun-kairouan-and-the-centre` | Kairouan and the Centre | French protectorate | French Tunisia | medium |
| 200237 | `af-tun-gabes-and-the-south` | Gabès and the South | French protectorate | French Tunisia | medium |
| 200246 | `af-fso-french-somaliland` | French Somaliland | French colony | French Somaliland | high |

### United Kingdom of Great Britain and Ireland (GBR) — 69 provinces

independent; 1900 population estimate 41155000; geometry GBR, IRL, IMN, JEY, GGY.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200003 | `af-cap-walvis-bay` | Walvis Bay | British colonial exclave | Cape Colony | low |
| 200004 | `af-bpo-zanzibar` | Zanzibar | British protectorate | Zanzibar | high |
| 200005 | `af-bpo-pemba` | Pemba | British protectorate | Zanzibar | high |
| 200006 | `af-bpo-seychelles` | Seychelles | British crown colony | British Indian Ocean islands | medium |
| 200007 | `af-bpo-mauritius` | Mauritius | British crown colony | British Indian Ocean islands | medium |
| 200017 | `af-bsa-st-helena` | St Helena | British crown colony | British South Atlantic islands | high |
| 200018 | `af-bsa-ascension` | Ascension | British crown colony | British South Atlantic islands | high |
| 200030 | `af-bso-british-somaliland` | British Somaliland | British protectorate | British Somaliland | medium |
| 200048 | `af-egy-alexandria-and-beheira` | Alexandria and Beheira | British occupation administration | Egypt | medium |
| 200049 | `af-egy-gharbia-and-menufia` | Gharbia and Menufia | British occupation administration | Egypt | medium |
| 200050 | `af-egy-dakahlia-and-damietta` | Dakahlia and Damietta | British occupation administration | Egypt | medium |
| 200051 | `af-egy-sharqia-and-the-canal` | Sharqia and the Canal | British occupation administration | Egypt | medium |
| 200052 | `af-egy-cairo` | Cairo | British occupation administration | Egypt | medium |
| 200053 | `af-egy-fayyum-and-beni-suef` | Fayyum and Beni Suef | British occupation administration | Egypt | medium |
| 200054 | `af-egy-minya-and-asyut` | Minya and Asyut | British occupation administration | Egypt | medium |
| 200055 | `af-egy-sohag-and-qena` | Sohag and Qena | British occupation administration | Egypt | medium |
| 200056 | `af-egy-aswan-and-the-red-sea` | Aswan and the Red Sea | British occupation administration | Egypt | medium |
| 200057 | `af-egy-sinai` | Sinai | British occupation administration | Egypt | medium |
| 200058 | `af-egy-the-western-desert` | The Western Desert | British occupation administration | Egypt | medium |
| 200059 | `af-sud-khartoum` | Khartoum | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200060 | `af-sud-blue-nile-and-sennar` | Blue Nile and Sennar | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200061 | `af-sud-kassala-and-the-red-sea` | Kassala and the Red Sea | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200062 | `af-sud-northern-province` | Northern Province | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200063 | `af-sud-kordofan` | Kordofan | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200064 | `af-sud-bahr-el-ghazal` | Bahr el Ghazal | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200065 | `af-sud-equatoria` | Equatoria | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200066 | `af-sud-upper-nile` | Upper Nile | Anglo-Egyptian condominium | Anglo-Egyptian Sudan | medium |
| 200133 | `af-cra-nyasaland-northern-province` | Nyasaland: Northern Province | British South Africa Company territory | British Central Africa | medium |
| 200134 | `af-cra-nyasaland-central-province` | Nyasaland: Central Province | British South Africa Company territory | British Central Africa | medium |
| 200135 | `af-cra-nyasaland-southern-province` | Nyasaland: Southern Province | British South Africa Company territory | British Central Africa | medium |
| 200136 | `af-cra-northern-rhodesia-barotseland` | Northern Rhodesia: Barotseland | British South Africa Company territory | British Central Africa | medium |
| 200137 | `af-cra-northern-rhodesia-north-eastern` | Northern Rhodesia: North-Eastern | British South Africa Company territory | British Central Africa | medium |
| 200138 | `af-cra-northern-rhodesia-central` | Northern Rhodesia: Central | British South Africa Company territory | British Central Africa | medium |
| 200139 | `af-cra-northern-rhodesia-southern` | Northern Rhodesia: Southern | British South Africa Company territory | British Central Africa | medium |
| 200140 | `af-cra-southern-rhodesia-mashonaland` | Southern Rhodesia: Mashonaland | British South Africa Company territory | British Central Africa | medium |
| 200141 | `af-cra-southern-rhodesia-matabeleland` | Southern Rhodesia: Matabeleland | British South Africa Company territory | British Central Africa | medium |
| 200142 | `af-cra-southern-rhodesia-victoria-and-the-midlands` | Southern Rhodesia: Victoria and the Midlands | British South Africa Company territory | British Central Africa | medium |
| 200143 | `af-hct-bechuanaland-ngamiland-and-chobe` | Bechuanaland: Ngamiland and Chobe | British protectorate | High Commission Territories | medium |
| 200144 | `af-hct-bechuanaland-central-district` | Bechuanaland: Central District | British protectorate | High Commission Territories | medium |
| 200145 | `af-hct-bechuanaland-kgalagadi-and-the-south` | Bechuanaland: Kgalagadi and the South | British protectorate | High Commission Territories | medium |
| 200146 | `af-hct-basutoland-the-lowlands` | Basutoland: the Lowlands | British protectorate | High Commission Territories | medium |
| 200147 | `af-hct-basutoland-the-highlands` | Basutoland: the Highlands | British protectorate | High Commission Territories | medium |
| 200148 | `af-hct-swaziland` | Swaziland | British protectorate | High Commission Territories | medium |
| 200149 | `af-cap-cape-peninsula-and-the-western-districts` | Cape Peninsula and the Western Districts | British colony | Cape Colony | medium |
| 200150 | `af-cap-eastern-cape-and-the-transkei` | Eastern Cape and the Transkei | British colony | Cape Colony | medium |
| 200151 | `af-cap-northern-cape-and-griqualand-west` | Northern Cape and Griqualand West | British colony | Cape Colony | medium |
| 200152 | `af-nat-natal-and-zululand` | Natal and Zululand | British colony | Natal | medium |
| 200158 | `af-bea-mombasa-and-the-coast` | Mombasa and the Coast | East Africa Protectorate province | British East Africa | medium |
| 200159 | `af-bea-ukamba-and-nairobi` | Ukamba and Nairobi | East Africa Protectorate province | British East Africa | medium |
| 200160 | `af-bea-nyanza-and-the-western-province` | Nyanza and the Western Province | East Africa Protectorate province | British East Africa | medium |
| 200161 | `af-bea-rift-valley` | Rift Valley | East Africa Protectorate province | British East Africa | medium |
| 200162 | `af-bea-northern-frontier-district` | Northern Frontier District | East Africa Protectorate province | British East Africa | medium |
| 200163 | `af-bea-buganda` | Buganda | East Africa Protectorate province | British East Africa | medium |
| 200164 | `af-bea-eastern-province-of-uganda` | Eastern Province of Uganda | East Africa Protectorate province | British East Africa | medium |
| 200165 | `af-bea-northern-province-of-uganda` | Northern Province of Uganda | East Africa Protectorate province | British East Africa | medium |
| 200166 | `af-bea-western-province-of-uganda` | Western Province of Uganda | East Africa Protectorate province | British East Africa | medium |
| 200167 | `af-bea-jubaland` | Jubaland | East Africa Protectorate province | British East Africa | medium |
| 200168 | `af-bwa-gold-coast-colony` | Gold Coast Colony | British West African colony or protectorate | British West Africa | medium |
| 200169 | `af-bwa-ashanti` | Ashanti | British West African colony or protectorate | British West Africa | medium |
| 200170 | `af-bwa-northern-territories-of-the-gold-coast` | Northern Territories of the Gold Coast | British West African colony or protectorate | British West Africa | medium |
| 200171 | `af-bwa-gambia` | Gambia | British West African colony or protectorate | British West Africa | medium |
| 200172 | `af-bwa-sierra-leone-colony` | Sierra Leone Colony | British West African colony or protectorate | British West Africa | medium |
| 200173 | `af-bwa-sierra-leone-protectorate` | Sierra Leone Protectorate | British West African colony or protectorate | British West Africa | medium |
| 200174 | `af-bwa-lagos-colony` | Lagos Colony | British West African colony or protectorate | British West Africa | medium |
| 200175 | `af-bwa-southern-nigeria-the-west` | Southern Nigeria: the West | British West African colony or protectorate | British West Africa | medium |
| 200176 | `af-bwa-southern-nigeria-the-east` | Southern Nigeria: the East | British West African colony or protectorate | British West Africa | medium |
| 200177 | `af-bwa-southern-nigeria-the-middle-belt` | Southern Nigeria: the Middle Belt | British West African colony or protectorate | British West Africa | medium |
| 200178 | `af-bwa-northern-nigeria-borno-and-the-chad-frontier` | Northern Nigeria: Borno and the Chad Frontier | British West African colony or protectorate | British West Africa | medium |
| 200179 | `af-bwa-northern-nigeria-the-niger-province` | Northern Nigeria: the Niger Province | British West African colony or protectorate | British West Africa | medium |

### Kingdom of Italy (ITA) — 7 provinces

independent; 1900 population estimate 32475000; geometry ITA, VAT.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200031 | `af-its-banaadir-and-the-lower-shabelle` | Banaadir and the Lower Shabelle | Italian colony | Italian Somaliland | medium |
| 200032 | `af-its-hiiraan-bakool-and-bay` | Hiiraan, Bakool and Bay | Italian colony | Italian Somaliland | medium |
| 200033 | `af-its-mudug-galguduud-and-bari` | Mudug, Galguduud and Bari | Italian colony | Italian Somaliland | medium |
| 200034 | `af-eri-hamasien` | Hamasien | Italian colony | Italian Eritrea | medium |
| 200035 | `af-eri-barka-and-gash` | Barka and Gash | Italian colony | Italian Eritrea | medium |
| 200036 | `af-eri-akele-guzai` | Akele Guzai | Italian colony | Italian Eritrea | medium |
| 200037 | `af-eri-massawa-and-the-dankalia-coast` | Massawa and the Dankalia Coast | Italian colony | Italian Eritrea | medium |

### Republic of Liberia (LBR) — 6 provinces

independent; 1900 population estimate 600000; geometry LBR.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200247 | `af-lbr-montserrado` | Montserrado | Liberian county | Liberia | medium |
| 200248 | `af-lbr-grand-bassa` | Grand Bassa | Liberian county | Liberia | medium |
| 200249 | `af-lbr-sinoe-grand-kru-and-grand-gedeh` | Sinoe, Grand Kru and Grand Gedeh | Liberian county | Liberia | medium |
| 200250 | `af-lbr-maryland` | Maryland | Liberian county | Liberia | medium |
| 200251 | `af-lbr-nimba-and-bong` | Nimba and Bong | Liberian county | Liberia | medium |
| 200252 | `af-lbr-western-liberia` | Western Liberia | Liberian county | Liberia | medium |

### Sultanate of Morocco (MAR) — 8 provinces

independent; 1900 population estimate 5000000; geometry MAR.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200238 | `af-mar-tangier-and-tetouan` | Tangier and Tetouan | Moroccan province or Spanish zone | Sultanate of Morocco | low |
| 200239 | `af-mar-the-rif-and-the-eastern-zone` | The Rif and the Eastern Zone | Moroccan province or Spanish zone | Sultanate of Morocco | low |
| 200240 | `af-mar-gharb-and-the-atlantic-plain` | Gharb and the Atlantic Plain | Moroccan province or Spanish zone | Sultanate of Morocco | medium |
| 200241 | `af-mar-fez-and-meknes` | Fez and Meknes | Moroccan province or Spanish zone | Sultanate of Morocco | medium |
| 200242 | `af-mar-casablanca-the-chaouia-and-tadla` | Casablanca, the Chaouia and Tadla | Moroccan province or Spanish zone | Sultanate of Morocco | medium |
| 200243 | `af-mar-marrakech-and-the-south` | Marrakech and the South | Moroccan province or Spanish zone | Sultanate of Morocco | medium |
| 200244 | `af-mar-souss-the-anti-atlas-and-tarfaya` | Souss, the Anti-Atlas and Tarfaya | Moroccan province or Spanish zone | Sultanate of Morocco | medium |
| 200245 | `af-mar-eastern-morocco` | Eastern Morocco | Moroccan province or Spanish zone | Sultanate of Morocco | medium |

### Orange Free State (ORF) — 1 provinces

independent; 1900 population estimate 300000; geometry adm1:ZA-FS.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200157 | `af-orf-orange-free-state` | Orange Free State | Orange Free State district | Orange Free State | low |

### Ottoman Empire (OTT) — 8 provinces

independent; 1900 population estimate 24000000; geometry TUR, SYR, LBN, ISR, PSX, JOR, IRQ, SAU, YEM, QAT, ALB, MKD, KOS.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200253 | `af-ott-tripoli-and-the-jefara` | Tripoli and the Jefara | Ottoman sanjak grouping | Tripolitania | medium |
| 200254 | `af-ott-misrata-and-the-gulf-coast` | Misrata and the Gulf Coast | Ottoman sanjak grouping | Tripolitania | low |
| 200255 | `af-ott-sirte-ghadames-and-the-jufra` | Sirte, Ghadames and the Jufra | Ottoman sanjak grouping | Tripolitania | low |
| 200256 | `af-ott-benghazi-and-the-jabal-al-akhdar` | Benghazi and the Jabal al Akhdar | Ottoman sanjak grouping | Cyrenaica | low |
| 200257 | `af-ott-derna-butnan-and-ajdabiya` | Derna, Butnan and Ajdabiya | Ottoman sanjak grouping | Cyrenaica | low |
| 200258 | `af-ott-kufra` | Kufra | Ottoman sanjak grouping | Cyrenaica | low |
| 200259 | `af-ott-sabha-wadi-al-hayaa-and-ash-shati` | Sabha, Wadi al Hayaa and Ash Shati | Ottoman sanjak grouping | Fezzan | low |
| 200260 | `af-ott-murzuq-and-ghat` | Murzuq and Ghat | Ottoman sanjak grouping | Fezzan | low |

### Kingdom of Portugal (PRT) — 29 provinces

independent; 1900 population estimate 5400000; geometry PRT.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200008 | `af-pai-bissau-and-cacheu` | Bissau and Cacheu | Portuguese colonial territory | Portuguese Guinea | medium |
| 200009 | `af-pai-bafata-and-gabu` | Bafatá and Gabú | Portuguese colonial territory | Portuguese Guinea | medium |
| 200010 | `af-pai-bolama-and-quinara` | Bolama and Quinara | Portuguese colonial territory | Portuguese Guinea | medium |
| 200011 | `af-pai-barlavento-islands` | Barlavento Islands | Portuguese colonial territory | Cape Verde | medium |
| 200012 | `af-pai-sotavento-islands` | Sotavento Islands | Portuguese colonial territory | Cape Verde | medium |
| 200013 | `af-pai-sao-tome` | São Tomé | Portuguese colonial territory | São Tomé and Príncipe | high |
| 200014 | `af-pai-principe` | Príncipe | Portuguese colonial territory | São Tomé and Príncipe | high |
| 200111 | `af-ang-luanda` | Luanda | Portuguese colonial district | Portuguese Angola | medium |
| 200112 | `af-ang-cuanza` | Cuanza | Portuguese colonial district | Portuguese Angola | medium |
| 200113 | `af-ang-malanje` | Malanje | Portuguese colonial district | Portuguese Angola | medium |
| 200114 | `af-ang-uige-and-zaire` | Uíge and Zaire | Portuguese colonial district | Portuguese Angola | medium |
| 200115 | `af-ang-cabinda` | Cabinda | Portuguese colonial district | Portuguese Angola | medium |
| 200116 | `af-ang-benguela` | Benguela | Portuguese colonial district | Portuguese Angola | medium |
| 200117 | `af-ang-huambo-and-bie` | Huambo and Bié | Portuguese colonial district | Portuguese Angola | medium |
| 200118 | `af-ang-huila` | Huíla | Portuguese colonial district | Portuguese Angola | medium |
| 200119 | `af-ang-namibe` | Namibe | Portuguese colonial district | Portuguese Angola | medium |
| 200120 | `af-ang-cunene` | Cunene | Portuguese colonial district | Portuguese Angola | medium |
| 200121 | `af-ang-cuando-cubango` | Cuando Cubango | Portuguese colonial district | Portuguese Angola | medium |
| 200122 | `af-ang-moxico` | Moxico | Portuguese colonial district | Portuguese Angola | medium |
| 200123 | `af-ang-lunda` | Lunda | Portuguese colonial district | Portuguese Angola | medium |
| 200124 | `af-moz-cabo-delgado` | Cabo Delgado | Portuguese colonial district | Portuguese Mozambique | medium |
| 200125 | `af-moz-niassa` | Niassa | Portuguese colonial district | Portuguese Mozambique | medium |
| 200126 | `af-moz-nampula` | Nampula | Portuguese colonial district | Portuguese Mozambique | medium |
| 200127 | `af-moz-zambezia` | Zambézia | Portuguese colonial district | Portuguese Mozambique | medium |
| 200128 | `af-moz-tete` | Tete | Portuguese colonial district | Portuguese Mozambique | medium |
| 200129 | `af-moz-manica-and-sofala` | Manica and Sofala | Portuguese colonial district | Portuguese Mozambique | medium |
| 200130 | `af-moz-inhambane` | Inhambane | Portuguese colonial district | Portuguese Mozambique | medium |
| 200131 | `af-moz-gaza` | Gaza | Portuguese colonial district | Portuguese Mozambique | medium |
| 200132 | `af-moz-lourenco-marques` | Lourenço Marques | Portuguese colonial district | Portuguese Mozambique | medium |

### Sokoto Caliphate (SOK) — 4 provinces

independent; 1900 population estimate 10000000; geometry adm1:NG-SO, adm1:NG-KE, adm1:NG-ZA, adm1:NG-KT, adm1:NG-KN, adm1:NG-JI, adm1:NG-KD, adm1:NG-AD, adm1:NG-BA, adm1:NG-GO.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200071 | `af-sok-sokoto-and-gwandu` | Sokoto and Gwandu | Sokoto emirate | Sokoto Caliphate | medium |
| 200072 | `af-sok-kano` | Kano | Sokoto emirate | Sokoto Caliphate | medium |
| 200073 | `af-sok-zaria` | Zaria | Sokoto emirate | Sokoto Caliphate | medium |
| 200074 | `af-sok-bauchi-and-adamawa` | Bauchi and Adamawa | Sokoto emirate | Sokoto Caliphate | medium |

### Sultanate of Wadai (WAD) — 2 provinces

independent; 1900 population estimate 2000000; geometry adm1:TD-OD, adm1:TD-WF, adm1:TD-BA, adm1:TD-BO, adm1:TD-X01~, adm1:TD-SA.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200069 | `af-wad-wadai-and-ouaddai` | Wadai and Ouaddaï | Wadai sultanate province | Sultanate of Wadai | low |
| 200070 | `af-wad-borkou-ennedi-and-tibesti` | Borkou, Ennedi and Tibesti | Wadai sultanate province | Sultanate of Wadai | low |

### South African Republic (Transvaal) (ZAR) — 4 provinces

independent; 1900 population estimate 1200000; geometry adm1:ZA-GT, adm1:ZA-NW, adm1:ZA-MP, adm1:ZA-LP.

| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |
|---:|---|---|---|---|---|
| 200153 | `af-zar-pretoria-and-the-witwatersrand` | Pretoria and the Witwatersrand | Transvaal district | South African Republic | low |
| 200154 | `af-zar-lydenburg-and-the-eastern-transvaal` | Lydenburg and the Eastern Transvaal | Transvaal district | South African Republic | low |
| 200155 | `af-zar-zoutpansberg-and-the-northern-transvaal` | Zoutpansberg and the Northern Transvaal | Transvaal district | South African Republic | low |
| 200156 | `af-zar-potchefstroom-and-the-western-transvaal` | Potchefstroom and the Western Transvaal | Transvaal district | South African Republic | low |


## 9. Africa-specific assumptions and limitations

- **Admin-1 proxies.** Modern first-level units are proxies for 1900
  administrative boundaries. Colonial provinces are grouped from modern units;
  the grouping is labelled low or medium confidence where the modern unit does not
  match the historical unit. The Cape Colony, Natal, the Orange Free State and the
  Bechuanaland protectorate are coarser than their 1900 magisterial divisions
  because Natural Earth has no equivalent modern layer.
- **Successor-border splits.** These 1900 areas are deliberately split into more
  than one permanent province so a later successor frontier can be formed without
  moving a polygon: Sudan/South Sudan; German East Africa (Tanganyika, Rwanda,
  Burundi); Kamerun (French and British); Togoland (French and British); Nigeria
  (Lagos, Southern, Northern) and the separate Sokoto emirates; French West
  Africa and French Equatorial Africa into their modern successor groups; Northern
  and Southern Rhodesia and Nyasaland; Basutoland, Bechuanaland and Swaziland; the
  Cape Colony and Walvis Bay; Libya (Tripolitania, Cyrenaica, Fezzan); Morocco
  (Spanish and French zones); Portuguese Guinea, Cape Verde, São Tomé and
  Príncipe. Every pair above shares a continuous province edge in the bundle.
- **Spanish Sahara.** The M11c polygon runs from 20.8°N to 27.7°N, which includes
  the Tarfaya strip that was Moroccan until 1912-1916. The two provinces (Saguia
  el-Hamra north of 26°N, Río de Oro south) follow the M11c underlay; the internal
  26th-parallel line is an authored historical approximation.
- **Morocco and Western Sahara.** Natural Earth's Morocco outline includes Western
  Sahara, so the M11c Morocco polygon does too. The Spanish Sahara provinces own
  the area and the Moroccan coverage scope is clipped north of 27.66°N so the
  overlap is not reported as a Moroccan gap.
- **Ceuta and Melilla.** The M11c map does not expose the Spanish North African
  presidios as separate geometry: the Spanish polygon excludes them and the
  Moroccan polygon contains them. They therefore remain inside the 1900 Moroccan
  provinces and are not modelled as Spanish provinces.
- **Walvis Bay.** The Cape Colony exclave is carried as a separate low-confidence
  province extracted from the existing Cape ring. It is a bounding-box clip of
  that ring, not a new frontier; the province outline is the authored 1900
  coastline.
- **Zanzibar, Pemba, Seychelles, Mauritius, Réunion, Mayotte, the Comoros, St
  Helena and Ascension.** The M11c map carries these islands inside the BPO, BSA,
  FRA and MAD features; only the African islands become provinces. Rodrigues,
  Chagos/Diego Garcia, the outer Seychelles, Annobón, Corisco and the Canaries
  (Europe) are not separately represented.
- **Portuguese India.** The M11c Portuguese Atlantic islands feature also contains
  Goa, Daman and Diu; those are Asia's `as-bin-goa` province and are excluded
  from the African build and its coverage scope.
- **Congo Free State.** The Congo basin region already belongs to Belgium in the
  simulation, so the Congo Free State provinces are owned by Belgium in 1900 and
  the 1908 annexation is a status change rather than an ownership change.
- **Egypt and the Ottoman claim.** Egypt's simulation region belongs to the
  Ottoman Empire, while the provinces are owned by the British occupying power.
  De jure Ottoman suzerainty is representable as a formal claim (exercised by the
  M12c test) rather than as ownership; the 1900 start state seeds no claims, for
  consistency with Europe and Asia.
- **Cross-feature seams.** The 183 seam
  borders are display-only approximations: they follow the midpoint between two
  province outlines or between the two 1900 polity frontiers, within the stated
  tolerances. They never change a province polygon and are only drawn after an
  ownership transfer. Three land-border-like pairs are deliberately not seams:
  Botswana/Zambia meet only at the Kazungula quadripoint; the Kenya/South Sudan
  Ilemi Triangle is undelimited and unassigned in the M11c map; and Djibouti's
  land border with Somalia is mediated by the Somaliland province (the 1960 union
  covers it).
- **Coverage slivers.** The residual reported in §5 is the sum of many small
  coastal, lake and frontier slivers (Lake Turkana, the Algerian Sahara frontier,
  the Tarfaya overlap and similar), not a single missing province. Because the
  residual stays under the correct 1900 owner's polity fill it never appears as a
  foreign-coloured enclave. The build audit lists every unassigned unit and every
  province code whose label point falls outside its map feature.
- **Population/economy.** Province-level population and production are not
  redistributed; provinces reference the existing simulation regions and the 1900
  starting conditions are unchanged.
- **Save compatibility.** The world schema stays 27, the save envelope and the
  worker protocol are unchanged. The combined catalogue is additive: an M12a-era
  save contains only the 570 European ownership records and an M12b-era save only
  the 809 European and Asian records; their African provinces have no mutable
  record until a new campaign is started. The project keeps its strict
  same-version save policy.

## 10. Build and verification commands

```
node scripts/m12c/build-africa-provinces.mjs
node scripts/m12c/generate-africa-doc.mjs
pnpm -F @century/app typecheck
pnpm -F @century/tests test -- map/provinces-africa
pnpm -F @century/app export:web
node scripts/m12c/playtest-screenshot-africa.mjs
```
