/**
 * Generate docs/OCEANIA_PROVINCIALIZATION.md from the committed M12e bundle.
 *
 * The document is data-derived: inventory, groupings, split-edge proofs, the
 * twentieth-century state/border audit and the global land audit are read from
 * the committed bundle and audit rather than retyped.
 *
 * Run: node scripts/m12e/generate-oceania-doc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OCEANIA = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_oceania_1900.json"), "utf8"),
);
const AUDIT = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_oceania_1900_audit.json"), "utf8"),
);
const GLOBAL = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/global_land_audit.json"), "utf8"),
);
const EUROPE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_1900.json"), "utf8"),
);
const ASIA = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_asia_1900.json"), "utf8"),
);
const AFRICA = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_africa_1900.json"), "utf8"),
);
const AMERICAS = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
);
const PROVINCES = [
  ...EUROPE.provinces,
  ...ASIA.provinces,
  ...AFRICA.provinces,
  ...AMERICAS.provinces,
  ...OCEANIA.provinces,
];
const PROVINCE_BY_ID = new Map(PROVINCES.map((province) => [province.id, province]));
const BY_KEY = new Map(OCEANIA.provinces.map((province) => [province.key, province]));

const OCEANIA_KEYS = [
  ["oc-aus-", "Australia"],
  ["oc-nzl-", "New Zealand"],
  ["oc-bpo-norfolk-", "Australia (Norfolk Island)"],
  ["oc-gng-", "German New Guinea"],
  ["oc-bpo-papua-", "British New Guinea (Papua)"],
  ["oc-gap-gng-", "Papua coastal islets (German New Guinea feature residual)"],
  ["oc-fji-", "Fiji"],
  ["oc-bpo-solomon-", "Solomon Islands"],
  ["oc-bpo-new-hebrides-", "New Hebrides (Vanuatu)"],
  ["oc-fpo-new-caledonia-", "New Caledonia"],
  ["oc-gpn-nauru", "Nauru"],
  ["oc-gpn-marshall-", "Marshall Islands"],
  ["oc-gpn-caroline-", "Caroline Islands"],
  ["oc-gpn-palau", "Palau"],
  ["oc-gpn-northern-marianas-", "Northern Mariana Islands"],
  ["oc-gum-", "Guam"],
  ["oc-bpo-gilbert-", "Gilbert Islands"],
  ["oc-bpo-line-", "Line Islands"],
  ["oc-bpo-phoenix-", "Phoenix Islands"],
  ["oc-bpo-ellice-", "Ellice Islands (Tuvalu)"],
  ["oc-ton-", "Tonga"],
  ["oc-gsa-", "German Samoa"],
  ["oc-asm-", "American Samoa"],
  ["oc-bpo-cook-", "Cook Islands"],
  ["oc-bpo-niue", "Niue"],
  ["oc-nzl-tokelau", "Tokelau"],
  ["oc-fpo-windward-", "French Polynesia"],
  ["oc-fpo-leeward-", "French Polynesia"],
  ["oc-fpo-tuamotu-", "French Polynesia"],
  ["oc-fpo-austral-", "French Polynesia"],
  ["oc-fpo-marquesas-", "French Polynesia"],
  ["oc-fpo-french-southern-", "French Southern and Antarctic Lands"],
  ["oc-fpo-wallis-", "Wallis and Futuna"],
  ["oc-fpo-futuna-", "Wallis and Futuna"],
  ["oc-bsa-", "British South Atlantic and Pacific islands"],
  ["oc-bpo-heard-", "Heard and McDonald Islands"],
  ["oc-chl-", "Chilean Pacific islands"],
  ["oc-mex-", "Mexican Pacific islands"],
  ["oc-usa-", "United States Pacific islands"],
  ["oc-gbr-", "Isle of Man"],
  ["oc-nor-", "Svalbard"],
  ["oc-aut-", "Austrian Littoral islands"],
  ["oc-fra-", "Clipperton"],
  ["oc-gap-", "Global coverage residual"],
];

function clusterOf(key) {
  let best = null;
  for (const [prefix, name] of OCEANIA_KEYS) {
    if (key.startsWith(prefix) && (best === null || prefix.length > best[0].length)) {
      best = [prefix, name];
    }
  }
  return best === null ? "Other" : best[1];
}

function round(value, digits = 3) {
  return Number(value).toFixed(digits);
}

function table(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  return lines.join("\n");
}

function borderBetween(leftKey, rightKey) {
  const left = BY_KEY.get(leftKey)?.id;
  const right = BY_KEY.get(rightKey)?.id;
  if (left === undefined || right === undefined) return 0;
  return OCEANIA.borders
    .filter(
      (border) =>
        (border.a === left && border.b === right) || (border.a === right && border.b === left),
    )
    .reduce((sum, border) => sum + border.lines.length, 0);
}

const clusters = new Map();
for (const province of OCEANIA.provinces) {
  const cluster = clusterOf(province.key);
  if (!clusters.has(cluster)) clusters.set(cluster, []);
  clusters.get(cluster).push(province);
}
const ownerRows = [...new Set(OCEANIA.provinces.map((province) => province.initialOwnerTag))]
  .sort()
  .map((tag) => {
    const list = OCEANIA.provinces.filter((province) => province.initialOwnerTag === tag);
    return [
      tag,
      String(list.length),
      `${round(list.reduce((sum, province) => sum + province.area, 0), 2)}`,
      [...new Set(list.map((province) => province.mapTag))].sort().join(", "),
    ];
  });
const featureRows = [...new Set(OCEANIA.provinces.map((province) => province.mapTag))]
  .sort()
  .map((tag) => {
    const list = OCEANIA.provinces.filter((province) => province.mapTag === tag);
    return [
      tag,
      String(list.length),
      `${round(list.reduce((sum, province) => sum + province.area, 0), 2)}`,
      [...new Set(list.map((province) => province.initialOwnerTag))].sort().join(", "),
    ];
  });

const SPLIT_PAIRS = [
  ["oc-aus-new-south-wales", "oc-aus-victoria", "NSW / Victoria colonial border"],
  ["oc-aus-new-south-wales", "oc-aus-queensland", "NSW / Queensland (29 S)"],
  ["oc-aus-new-south-wales", "oc-aus-south-australia", "NSW / South Australia (141 E)"],
  ["oc-aus-victoria", "oc-aus-south-australia", "Victoria / South Australia (141 E and the Murray)"],
  ["oc-aus-south-australia", "oc-aus-northern-territory", "South Australia / Northern Territory (26 S, 1911 transfer)"],
  ["oc-aus-south-australia", "oc-aus-western-australia", "South Australia / Western Australia (129 E)"],
  ["oc-aus-queensland", "oc-aus-northern-territory", "Queensland / Northern Territory"],
  ["oc-aus-new-south-wales", "oc-aus-federal-capital-territory", "NSW / Federal Capital Territory (1911 transfer)"],
  ["oc-gng-morobe", "oc-bpo-papua-gulf", "German New Guinea / British New Guinea (1885 central range)"],
  ["oc-gng-morobe", "oc-bpo-papua-central", "German New Guinea / British New Guinea (1885 central range)"],
  ["oc-gng-sandaun-west-sepik", "oc-bpo-papua-western", "German New Guinea / British New Guinea (1885 central range)"],
  ["oc-gng-eastern-highlands", "oc-bpo-papua-gulf", "German New Guinea / British New Guinea (1885 central range)"],
  ["oc-gng-southern-highlands", "oc-bpo-papua-western", "German New Guinea / British New Guinea (1885 central range)"],
  ["oc-nzl-southland", "oc-nzl-otago", "Southland / Otago regional boundary"],
  ["oc-fpo-new-caledonia-north-province", "oc-fpo-new-caledonia-south-province", "New Caledonia North / South provinces"],
];
const splitRows = SPLIT_PAIRS.map(([left, right, note]) => {
  const lines = borderBetween(left, right);
  return [left, right, String(lines), lines > 0 ? "shared edge" : "**MISSING**", note];
});

const STATES = [
  ["Australia", "1900 catalog (Australian colonies), 1901 Commonwealth (AUS, 1400)", "federation transfer of the 10 colonial provinces"],
  ["New Zealand", "1900 catalog (NZL, 58); 1907 dominion is a status change", "no ownership transfer"],
  ["Tonga", "1900 catalog (TON, 61)", "1970 end of British protection is a status change"],
  ["Fiji", "future FJI (1414), 10 October 1970", "independence transfer"],
  ["Western Samoa", "future WSM (1402), 1 January 1962", "1920 New Zealand mandate, 1962 independence"],
  ["Nauru", "future NRU (1403), 31 January 1968", "German, Australian mandate, UN trust, independence"],
  ["Papua New Guinea", "future PNG (1401), 16 September 1975", "1906/1914/1920/1949/1975 sequence"],
  ["Tuvalu", "future TUV (1404), 1 October 1978", "Ellice Islands separation and independence"],
  ["Solomon Islands", "future SLB (1405), 7 July 1978", "protectorate to independence"],
  ["Kiribati", "future KIR (1406), 12 July 1979", "Gilbert, Phoenix and Line islands"],
  ["Vanuatu", "future VUT (1407), 30 July 1980", "Anglo-French condominium to independence"],
  ["Marshall Islands", "future MHL (1408), 21 October 1986", "Japanese mandate, US trust, Compact"],
  ["Federated States of Micronesia", "future FSM (1409), 3 November 1986", "Japanese mandate, US trust, Compact"],
  ["Palau", "future PLW (1410), 1 October 1994", "Japanese mandate, US trust, Compact"],
  ["Cook Islands", "future COK (1411), 4 August 1965", "British protectorate, 1901 New Zealand, self-government"],
  ["Niue", "future NIU (1412), 19 October 1974", "British protectorate, 1901 New Zealand, self-government"],
  ["Tokelau", "1900 territory TKL (1413)", "British protectorate, 1926 New Zealand, remains a territory"],
  ["Northern Mariana Islands", "future MNP (1415), 9 January 1978", "German, Japanese mandate, US trust, commonwealth"],
  ["New Zealand dominion", "registry NZD (1416), 26 September 1907", "status change only; owns no province"],
];

const doc = `# Oceania and global land-gap provincialization (M12e)

**Status:** implemented. This document is generated by
\`scripts/m12e/generate-oceania-doc.mjs\` from the committed bundle
\`packages/data/data/map/provinces_oceania_1900.json\`, its audit and the global land
audit. Do not edit the data tables by hand.

## 1. What this milestone adds

M12a Europe, M12b Asia, M12c Africa and M12d Americas left Oceania and a number of
remote islands without permanent provinces. M12e adds them, and closes every
remaining non-Antarctic land-coverage gap in the world, using the same province
model and rendering contracts as the four earlier bundles. There is still exactly
one geographical subdivision, \`Province\`; there is no Polity -> Region ->
Province hierarchy, and the simulation \`Region\` remains a population/economy
accounting aggregate only.

The M12e bundle is **151 permanent provinces** with ids from 400001 and \`oc-\`
keys. Together with the earlier bundles the world has **${PROVINCES.length}**
provinces in one catalogue. Oceania uses the id block 400001-404999 for authored
provinces, 405001-405999 for one residual province per 1900 map feature and
406001-406999 for the automatic land-ring closure.

## 2. Inventory

${table(
  ["Metric", "Value"],
  [
    ["Provinces", String(OCEANIA.provinces.length)],
    ["1900 owners", String(ownerRows.length)],
    ["1900 map features", String(featureRows.length)],
    ["Shared border pairs", String(OCEANIA.borders.length)],
    ["Border segments", String(AUDIT.borderSegmentCount)],
    ["Feature residual provinces", String(AUDIT.featureResidualProvinces.length)],
    ["Automatic land-gap provinces", String(AUDIT.autoLandGapProvinceCount)],
    ["Combined five-bundle provinces", String(PROVINCES.length)],
    ["Future/registry polities", String(OCEANIA.futurePolities.length)],
    ["Historical/breakaway polities", String(OCEANIA.futurePolities.filter((p) => p.kind === "historical").length)],
  ],
)}

### 2.1 Provinces by 1900 owner

${table(["Owner", "Provinces", "Area (sq deg)", "Map features"], ownerRows)}

### 2.2 Provinces by 1900 map feature

${table(["Map feature", "Provinces", "Area (sq deg)", "Owners"], featureRows)}

### 2.3 Province groups

${table(
  ["Group", "Provinces", "Ids", "Owner", "Special status"],
  [...clusters.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([cluster, list]) => [
      cluster,
      String(list.length),
      `${list[0].id}-${list[list.length - 1].id}`,
      [...new Set(list.map((province) => province.initialOwnerTag))].sort().join(", "),
      [...new Set(list.map((province) => province.initialSpecialStatus))]
        .filter((status) => status !== "ordinary")
        .join(", ") || "ordinary",
    ]),
)}

## 3. Grouping policy

- **Australia.** One province per 1900 colony: New South Wales, Victoria,
  Queensland, South Australia, Western Australia and Tasmania. The Northern
  Territory was part of South Australia and the Federal Capital Territory (and
  Jervis Bay) part of New South Wales, so they are separate permanent provinces
  and the 1911 transfers are ordinary ownership changes. The 1901 federation is a
  transfer of the ten Australian provinces (including Macquarie Island) to the
  future Commonwealth of Australia polity (tag \`AUS\`, id 1400); the tag is shared
  with the 1900 catalog so the palette colour does not change.
- **New Zealand.** The modern regional-council areas are the permanent proxy for
  the 1900 provincial-district subdivision (the provinces were abolished in 1876).
  Stewart Island, the Chatham Islands, the Kermadecs, the Three Kings, the
  Auckland Islands, Campbell Island, the Antipodes and The Snares are separate
  permanent provinces. The 1907 dominion is a status change, not an ownership
  change; the registry records it as \`NZD\`.
- **Papua New Guinea.** German New Guinea (Kaiser-Wilhelmsland, the Bismarck
  Archipelago and Bougainville) and British New Guinea (Papua) are separate 1900
  province groups. The M11c \`german-new-guinea-papua\` map patch assigns the
  southern first-level units to the British feature; the modern PNG province
  boundaries are the permanent provinces and the proxy for the 1885-86
  central-range line. The 1906 Australian administration of Papua, the 1914
  occupation, the 1920 League mandate, the 1949 union and 1975 independence are
  ordinary control/ownership changes. The only modern sovereign land border in
  Oceania is the 141 E Papua New Guinea / Indonesia line.
- **Melanesia.** Fiji uses its five colonial divisions (Viti Levu is divided
  between the Central and Western divisions; Vanua Levu is in the Northern
  division; Lau in the Eastern division; Rotuma is separate). The Solomon Islands
  use the modern provincial units of the 1900 British protectorate; the northern
  Solomons (Bougainville and Buka) were German and are part of German New Guinea.
  The New Hebrides are six condominium provinces (special status \`condominium\`,
  owned by the United Kingdom because the feature is the British Pacific one;
  France is the co-administrator). New Caledonia uses its three modern provinces.
- **Micronesia.** Nauru, the Marshall chains, the four Caroline groups, Palau, the
  four Northern Mariana units and Guam are separate permanent provinces. Kiribati
  is three groups (Gilbert, Line, Phoenix); the Ellice Islands are one province
  (Tuvalu). The German, Japanese mandate and United States trust sequences are
  ordinary ownership/control changes.
- **Polynesia.** Tonga's five divisions, German Samoa (one province), American
  Samoa (one province), the Cook Islands (southern and northern groups), Niue,
  Tokelau, the five French Polynesian subdivisions, Wallis and Futuna (two
  provinces), Pitcairn, Easter Island and Juan Fernandez are permanent provinces.
- **Remote islands.** Islands the coarse 1900 feature omits (Pitcairn, Easter
  Island, Juan Fernandez, Revillagigedo, Clipperton, Wake/Midway/Johnston/Palmyra,
  Tokelau, Kermadec, the New Zealand subantarctic islands, Heard/McDonald, Chagos,
  Navassa) are detached provinces whose geometry is the modern admin-1 island (or
  an authored island clip when the map has no other geometry). They are never
  rectangular *frontier* corrections; an island clip isolates a coastline and is
  labelled as such.

## 4. Successor-border splits

A province is the permanent geographical unit, but one 1900 administrative area is
represented by more than one permanent province wherever a later successor
frontier runs through it. The table lists every required split and proves that the
pair shares a continuous province edge.

${table(["Left province", "Right province", "Border lines", "Status", "Split"], splitRows)}

The PNG / Indonesia border is the one modern sovereign Oceanian land border. The
seam pass adds a display-only edge between the Papua province and the Asian Dutch
East Indies province on the 141 E line; the audit reports
**${String(AUDIT.crossFeatureSeamBorderCount)}** seam pairs, of which
**${String(AUDIT.crossFeatureBundles)}** connect to an earlier bundle. The
standalone \`scripts/m12e/audit-successors.mjs\` prints the same result.

## 5. Twentieth-century state and border audit

${table(["State/entity", "Registration", "Transition"], STATES)}

The only modern sovereign Oceanian land border is **Papua New Guinea / Indonesia**.
Every other state is an island state with no land neighbour. The test and
\`scripts/m12e/audit-successors.mjs\` assert that the border is backed by a province
edge, that there is no unexpected land-border pair, and that every state above is
registered as a 1900 catalog polity, a 1400-1499 future polity, a 1900 map
territory or a documented historical entry.

### 5.1 Historical and breakaway polities

${table(
  ["Tag", "Name", "Id", "Active", "Notes"],
  OCEANIA.futurePolities
    .filter((polity) => polity.kind === "historical")
    .map((polity) => [
      polity.tag,
      polity.historicalName,
      String(polity.polityId),
      `${polity.activeFrom} to ${polity.activeTo ?? "open"}`,
      polity.notes,
    ]),
)}

The Kingdom of Hawaii is registered by the M12d Americas bundle (\`HAW\`); a tag may
not repeat across the one combined registry, so the M12e registry adds the
Republic of Hawaii (\`RHI\`) alongside the Tahitian, Fijian, Bougainville, Tafea,
Vemerana, Minerva and Hutt River entries. Historical entries own no province in
1900 and are available for alternate-history transfers only.

## 6. Global land-coverage audit

**Hard acceptance criterion:** every piece of land on the M11c 1900 map belongs to
a province, except Antarctica and a short, explicitly documented exception list.
\`scripts/m12e/audit-global-land.mjs\` and
\`packages/tests/src/map/provinces-oceania.test.ts\` prove it.

### 6.1 Method

- Decode the 795 land rings from \`world_map_1900.json#land\`.
- Reconstruct land polygons with their holes. The land topology stores
  endorheic seas as separate rings; a ring whose representative point lies inside
  a larger land ring is a water/ice artifact, not land.
- Classify Antarctica as every ring whose maximum latitude is below -60 degrees.
- For every remaining land ring, test representative vertices and a deterministic
  interior sample grid against every province with a bbox-filtered
  point-in-polygon (no global polygon union).
- A sample is assigned when it is inside a province or within the **${String(
  GLOBAL.method.coastToleranceDegrees,
)} degree** coastline quantization band of a province outline. The band is the
  difference between the 1:50m land mask (0.04 degree simplification) and the
  1:10m admin-1 provinces (0.02 degree simplification); it is reported separately,
  not used as an exemption for unassigned land.
- Audit every 1900 polity feature (every feature with land must have a province),
  every Natural Earth admin-1 unit (recorded by the five bundle audits) and every
  remote island that lies outside all features.

### 6.2 Result

${table(
  ["Metric", "Value"],
  [
    ["Land rings", String(GLOBAL.landRingCount)],
    ["Antarctic exception rings", String(GLOBAL.exceptions.antarcticaRingCount)],
    ["Water/ice hole exceptions", String(GLOBAL.exceptions.waterHoleRingCount)],
    ["Non-Antarctic land rings", String(GLOBAL.totals.nonAntarcticLandRingCount)],
    ["Assigned land rings", String(GLOBAL.totals.assignedRingCount)],
    ["Unassigned land rings", String(GLOBAL.totals.unassignedRingCount)],
    ["Land area (sq deg)", round(GLOBAL.totals.landArea, 2)],
    ["Unassigned land area (sq deg)", String(GLOBAL.totals.unassignedArea)],
    ["Coastline quantization band (sq deg, sample estimate)", round(GLOBAL.totals.coastlineBandArea, 2)],
    ["Interior samples", String(GLOBAL.totals.sampleCount)],
    ["Unassigned samples", String(GLOBAL.totals.unassignedSampleCount)],
    ["Representative vertices", String(GLOBAL.totals.representativeVertexCount)],
    ["Unassigned vertices", String(GLOBAL.totals.unassignedVertexCount)],
    ["Map features with a province", `${String(GLOBAL.features.mapFeatureCount - GLOBAL.features.featuresWithoutProvince.length)}/${String(GLOBAL.features.mapFeatureCount)}`],
    ["Admin-1 unassigned units (five audits)", String(GLOBAL.admin1Units.unassignedUnitTotal)],
  ],
)}

### 6.3 Exceptions

The exception list is short and explicit:

- **Antarctica** (${String(GLOBAL.exceptions.antarcticaRingCount)} rings): the
  continent, its ice shelves and the South Shetland/South Orkney islands. There is
  no 1900 polity and no permanent province; the neutral land mask draws them.
- **Water/ice holes** (${String(GLOBAL.exceptions.waterHoleRingCount)} ring): the
  Caspian Sea, stored as an inner ring of the Afro-Eurasian land polygon. It is
  water, not land.

Every other land ring is assigned to a province. The worst remaining land-ring
residual is a coastline quantization band, not an unassigned area.

### 6.4 Islands the map does not expose

Ashmore/Cartier, the Coral Sea islands and the Minerva Reefs are below the M11c
land-mask area threshold (0.02 square degrees per ring), absent from the 1900
polity features and absent from the admin-1 layer. They are documented here rather
than silently dropped; they are not part of the M11c map. Christmas Island and the
Cocos (Keeling) Islands are also absent from the M11c land mask, the 1900 features
and the admin-1 layer; they are documented in the same way. Clipperton is absent
too but is required by the milestone, so it is a small authored island polygon
(low confidence, coastline approximation).

**No duplicated provinces.** The Philippines, Indonesia and Portuguese Timor are
already covered by the M12b Asian bundle; Hawaii by the M12d Americas bundle
(\`am-usa-hawaii\`); the Galápagos by M12d (\`am-ecu-galapagos\`). M12e adds only the
missing island rings of those shared features (for example the Philippine and
Indonesian sliver residuals in the global-gap section) and never a second province
for a 1900 territory that already has one. The coverage clips for Chile, Mexico,
the United States, the British South Atlantic feature and the British Pacific
feature are audit boundaries scoped to the Oceanian part of a shared feature; they
are not political borders.

### 6.5 Global land-gap provinces

The bundle also closes the remaining gaps of the earlier continents. These
provinces are coverage geometry, not reviewed frontiers:

${table(
  ["Province", "Feature", "Owner", "Area (sq deg)"],
  AUDIT.featureResidualProvinces.map((key) => {
    const province = BY_KEY.get(key);
    return [key, province.mapTag, province.initialOwnerTag, round(province.area, 3)];
  }),
)}

A residual is \`feature - every province of every bundle\`. It is owned by the
feature's 1900 sovereign, so the residual stays the correct underlay colour. The
German New Guinea residual is owned by the United Kingdom because the M11c feature
retains pre-1885 coastal islets that belong to British Papua. The automatic
land-ring closure is a safety net: after all authored and residual provinces, any
non-Antarctic M11c land ring still completely outside the catalogue is attached to
the 1900 polity that contains it. In the committed build it emits no province
because the authored and residual partition already covers every ring; the audit
records the skipped rings and reasons.

## 7. Borders, seams and the antimeridian

- Shared border extraction is exact only within one 1900 map feature. The build
  adds display-only seam passes for cross-feature frontiers and for straight
  same-feature frontiers whose two admin-1 units carry different vertex densities
  (the 141 E NSW/SA line, the 26 S SA/NT line). The pass is point-to-segment (not
  vertex-to-vertex), with land, 1900-polity and third-province filters.
- The Oceanian cross-feature pass also compares against the committed earlier
  bundles, so the Papua New Guinea / Indonesia border is a seam pair rather than a
  missing frontier.
- The Pacific crosses the antimeridian. Province rings are stored unwrapped (the
  Russian Empire feature runs to 190 E) and the renderer draws every ring at
  -360/0/+360 degrees. The global audit tests every sample point at the same three
  longitude offsets; the independent test does the same. Fiji, Kiribati and Tonga
  are the main antimeridian cases.
- Seam borders are display-only: they change no province polygon, id or simulation
  state. At the 1900 start state the 1900 polity outlines are the country borders;
  after an ownership change the derived province edges (including the seam pairs)
  become the national border.

## 8. Rendering

The M12a-M12d rendering contract is unchanged. Province fills carry a solid,
subtle white hairline (no dashed or dotted province lines). Country borders are
thin near-black lines at the established 1.25 screen-px weight and take priority
over province lines. Country borders are derived from current province ownership;
the 1900 polity outline is used only while the province union still equals it. The
16-colour hash palette is unchanged; some Oceanian polities can share a near
identical colour, which is pre-existing and recorded as a known visual limitation
(no enclave was observed to be ambiguous in the review screenshots).

## 9. Confidence, assumptions and limitations

- Modern admin-1 units are proxies for the 1900 internal boundaries. Australia and
  New Zealand are high/medium confidence; the Pacific island group outlines are
  high confidence; the German/British New Guinea partition follows the M11c patch
  and is medium confidence; the finer 1900 provincial districts of New Zealand and
  the colonial divisions of Fiji are medium confidence.
- The 1900 owner of Svalbard is recorded as Norway with low confidence: the
  archipelago was terra nullius until the 1920 Svalbard Treaty. Heard and McDonald
  are attached to the British Pacific group with low confidence because they were
  unclaimed on 1 January 1900 (annexed by the United Kingdom in 1910, transferred
  to Australia in 1947). The Isle of Man is a British Crown dependency with the
  \`autonomous\` special status. The New Hebrides carry the \`condominium\` special
  status.
- The Cook Islands, Niue and Tokelau were British protectorates in 1900 and their
  provinces are owned by the United Kingdom; the 1901 New Zealand annexation and
  the 1926 Tokelau transfer are ordinary ownership changes.
- Clipperton is an authored ~0.06 degree island polygon because the M11c map has
  no geometry for it; this is the only authored coastline approximation in the
  bundle and is low confidence.
- The Kvarner provinces (Krk; Cres and Losinj) have a small same-owner overlap
  (0.0197 square degrees) because their island clips overlap; both are Austrian
  and the overlap cannot create a foreign-coloured enclave.
- The 1900 map features for the German Pacific islands and the British Pacific
  islands are coarse aggregates. Island provinces are detached from the feature
  and use the admin-1 coastline; the colonial partition is encoded by which
  modern units belong to which province group. The coverage audit reports a
  0.023 square degree British Pacific residual, below the review threshold.

## 10. Commands

\`\`\`
node scripts/m12e/build-oceania-provinces.mjs
node scripts/m12e/generate-oceania-doc.mjs
node scripts/m12e/audit-successors.mjs
node scripts/m12e/audit-global-land.mjs
node scripts/m12e/playtest-screenshot-oceania.mjs
pnpm -F @century/tests test -- map/provinces-oceania
pnpm -F @century/app typecheck
pnpm -F @century/tests typecheck
pnpm -F @century/sim-worker scenario:build
pnpm -F @century/app build:worker
pnpm run check:worker
pnpm -F @century/app export:web
\`\`\`
`;

const OUT = resolve(ROOT, "docs/OCEANIA_PROVINCIALIZATION.md");
writeFileSync(OUT, doc, "utf8");
console.log(
  `wrote ${OUT} (${(doc.length / 1024).toFixed(0)} KiB) provinces=${OCEANIA.provinces.length} borders=${OCEANIA.borders.length}`,
);
