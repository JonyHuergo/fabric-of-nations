/**
 * Generate docs/AMERICAS_PROVINCIALIZATION.md from the committed Americas bundle.
 *
 * Run: node scripts/m12d/generate-americas-doc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const BUNDLE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_americas_1900.json"), "utf8"),
);
const AUDIT = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_americas_1900_audit.json"), "utf8"),
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
const COMBINED_PROVINCES =
  EUROPE.provinces.length + ASIA.provinces.length + AFRICA.provinces.length + BUNDLE.provinces.length;
const COMBINED_FUTURE =
  EUROPE.futurePolities.length +
  ASIA.futurePolities.length +
  AFRICA.futurePolities.length +
  BUNDLE.futurePolities.length;
const COMBINED_BORDERS =
  EUROPE.borders.length + ASIA.borders.length + AFRICA.borders.length + BUNDLE.borders.length;
const CATALOG = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/historical/m11/polities_1900.json"), "utf8"),
);

const catalogByTag = new Map();
for (const entry of [...CATALOG.states, ...CATALOG.territories]) catalogByTag.set(entry.tag, entry);

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

const byOwner = new Map();
for (const province of [...BUNDLE.provinces].sort((left, right) => left.id - right.id)) {
  if (!byOwner.has(province.initialOwnerTag)) byOwner.set(province.initialOwnerTag, []);
  byOwner.get(province.initialOwnerTag).push(province);
}

const ownerLines = [];
for (const [tag, provinces] of [...byOwner.entries()].sort((left, right) =>
  left[0].localeCompare(right[0]),
)) {
  const entry = catalogByTag.get(tag);
  ownerLines.push(
    `### ${escapeCell(entry?.name ?? tag)} (${tag}) — ${String(provinces.length)} provinces`,
    "",
    entry === undefined
      ? "1900 polity not present in the M11c catalog."
      : `${entry.status}; 1900 population estimate ${String(entry.population1900)}; geometry ${entry.geometry.join(", ")}.`,
    "",
    "| ID | Key | Historical name (1900) | Administrative affiliation | Historical grouping | Confidence |",
    "|---:|---|---|---|---|---|",
  );
  for (const province of provinces) {
    ownerLines.push(
      `| ${String(province.id)} | \`${province.key}\` | ${escapeCell(province.historicalName)} | ${escapeCell(province.historicalAdminAffiliation)} | ${escapeCell(province.historicalGrouping ?? "—")} | ${province.confidence} |`,
    );
  }
  ownerLines.push("");
}

const confidenceCounts = new Map();
for (const province of BUNDLE.provinces) {
  confidenceCounts.set(province.confidence, (confidenceCounts.get(province.confidence) ?? 0) + 1);
}

const coverageRows = AUDIT.coverage
  .slice()
  .sort((left, right) => right.residualArea - left.residualArea)
  .map(
    (entry) =>
      `| ${entry.tag} | ${entry.scopeArea.toFixed(2)} | ${entry.coveredArea.toFixed(2)} | ${entry.residualArea.toFixed(2)}${entry.estimated ? " (estimated)" : ""} |`,
  )
  .join("\n");

const sourceRows = BUNDLE.sources
  .map(
    (source) =>
      `| \`${source.id}\` | ${escapeCell(source.title)} | ${escapeCell(source.license)} | ${escapeCell(source.date)} | ${escapeCell(source.url)} |`,
  )
  .join("\n");

const futureRows = BUNDLE.futurePolities
  .map(
    (polity) =>
      `| ${polity.polityId} | ${polity.tag} | ${escapeCell(polity.historicalName)} | ${polity.kind ?? "future-state"} | ${polity.status} | ${polity.activeFrom} | ${polity.activeTo ?? "—"} | ${escapeCell(polity.capitalName)} | ${polity.confidence} |`,
  )
  .join("\n");

const historicalPolities = BUNDLE.futurePolities.filter(
  (polity) => polity.kind === "historical",
);
const successorPolities = BUNDLE.futurePolities.filter(
  (polity) => polity.kind !== "historical",
);
const historicalRows = historicalPolities
  .map(
    (polity) =>
      `| ${polity.polityId} | ${polity.tag} | ${escapeCell(polity.historicalName)} | ${polity.status} | ${polity.confidence} | ${escapeCell(polity.notes)} |`,
  )
  .join("\n");

const mapFeatures = [...new Set(BUNDLE.provinces.map((province) => province.mapTag))].sort();
const overlapRows = AUDIT.overlaps
  .slice(0, 12)
  .map((overlap) => `| \`${overlap.left}\` | \`${overlap.right}\` | ${overlap.area} |`)
  .join("\n");

function provinceKey(id) {
  return BUNDLE.provinces.find((province) => province.id === id)?.key ?? String(id);
}

const seamRows = (AUDIT.crossFeatureSeamBorders ?? [])
  .map(
    (entry) =>
      `| \`${provinceKey(entry.a)}\` | \`${provinceKey(entry.b)}\` | ${String(entry.lines)} | ${entry.kind} |`,
  )
  .join("\n");

const seamFeaturePairs = new Map();
for (const entry of AUDIT.crossFeatureSeamBorders ?? []) {
  const left = BUNDLE.provinces.find((province) => province.id === entry.a);
  const right = BUNDLE.provinces.find((province) => province.id === entry.b);
  if (left === undefined || right === undefined) continue;
  const key =
    left.mapTag < right.mapTag ? `${left.mapTag}/${right.mapTag}` : `${right.mapTag}/${left.mapTag}`;
  seamFeaturePairs.set(key, (seamFeaturePairs.get(key) ?? 0) + 1);
}
const seamPairSummary = [...seamFeaturePairs.entries()]
  .sort((left, right) => right[1] - left[1])
  .map(([pair, count]) => `| ${pair} | ${String(count)} |`)
  .join("\n");

const missingCoverage = AUDIT.coverage
  .filter((entry) => !entry.estimated && entry.residualArea >= 0.01)
  .sort((left, right) => right.residualArea - left.residualArea);
const estimatedCoverage = AUDIT.coverage
  .filter((entry) => entry.estimated)
  .sort((left, right) => right.residualArea - left.residualArea);

const doc = `# M12d — American Provincialization (1 January 1900)

Status: implemented and visually reviewed. This document is generated from the
committed Americas province bundle and audit; the bundle and the code are
authoritative if they disagree. The companion decision record is DECISIONS
D-106.

## 1. Scope and architecture

- The Americas are the direct counterpart of M12a Europe, M12b Asia and M12c
  Africa. The only geographical subdivision beneath a polity is the **Province**;
  there is no Polity → Region → Province hierarchy and no parallel geographical
  region layer.
- The historical simulation \`Region\` remains a population/economy accounting
  unit. It is preserved as \`SimulationRegion\` and is never used to draw or
  hit-test territory. See DECISIONS D-103, D-104, D-105 and D-106.
- Province ids start at **300001**, above the M12a European block (maximum
  66001), the M12b Asian block (100001–100239) and the M12c African block
  (200001–200260), and every American key is prefixed with \`am-\`. A build-time
  and merge-time check rejects any collision with the earlier bundles.
- The four committed bundles stay separate build artifacts:
  - \`packages/data/data/map/provinces_1900.json\` — M12a Europe;
  - \`packages/data/data/map/provinces_asia_1900.json\` — M12b Asia;
  - \`packages/data/data/map/provinces_africa_1900.json\` — M12c Africa;
  - \`packages/data/data/map/provinces_americas_1900.json\` — M12d Americas.
  A single loader (\`packages/data/src/provinces.ts\` for the simulation and
  \`packages/app/src/provinceMapBundle.ts\` for the renderer) combines all four
  with unique ids, merged borders and one future-polity registry.
- Political state is mutable and separate from geography: legal owner, effective
  controller, occupation date, formal claims and special status live in
  \`World.provinces\`; geometry, id and name never change.
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

- Provinces: **${String(BUNDLE.provinces.length)}** (ids ${String(BUNDLE.provinces[0]?.id)}–${String(BUNDLE.provinces[BUNDLE.provinces.length - 1]?.id)}).
- 1900 owner polities with at least one province: **${String(byOwner.size)}**.
- Map features covered: **${String(mapFeatures.length)}** (\`${mapFeatures.join("`, `")}\`).
- Polity registry: **${String(BUNDLE.futurePolities.length)}** entries (ids 1300–${String(1300 + BUNDLE.futurePolities.length - 1)}): **${String(successorPolities.length)}** post-1900 successors and **${String(historicalPolities.length)}** historical/breakaway entries. Newfoundland is the one 1900-active non-selectable entry.
- Unique province ids/keys: **yes** (build audit: ${String(AUDIT.duplicateProvinceIds)} duplicate ids, ${String(AUDIT.duplicateKeys)} duplicate keys).
- Border pairs: **${String(BUNDLE.borders.length)}**, of which **${String(AUDIT.crossFeatureSeamBorderCount)}** are display-only cross-feature seam borders; shared border segments: **${String(AUDIT.borderSegmentCount)}**; segments with more than two neighbours: **${String(AUDIT.unmatchedBorderSegments)}**.
- Province pairs with a measured overlap above 0.005 deg²: **${String(AUDIT.overlapCount)}** (the largest are listed in §5).
- Confidence: low **${String(confidenceCounts.get("low") ?? 0)}**, medium **${String(confidenceCounts.get("medium") ?? 0)}**, high **${String(confidenceCounts.get("high") ?? 0)}**.
- Admin-1 units whose label point lies inside an American 1900 feature but that no province claims: **${String(AUDIT.unassignedUnitCount)}**.
- Admin-1 units claimed by two provinces (rejected): **${String(AUDIT.duplicateUnitClaimCount)}**.
- Combined catalogue: **${String(COMBINED_PROVINCES)}** provinces (${String(EUROPE.provinces.length)} Europe + ${String(ASIA.provinces.length)} Asia + ${String(AFRICA.provinces.length)} Africa + ${String(BUNDLE.provinces.length)} Americas), **${String(COMBINED_FUTURE)}** polity registry entries and **${String(COMBINED_BORDERS)}** border pairs.

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

The shared pipeline \`scripts/m12/province-build-lib.mjs\` applies:

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

- **Colombia / Panama**: the Panamanian provinces (\`am-pan-*\`) are separate from
  the Colombian departments from 1900, so the 1903 separation is an ordinary
  transfer. The Panama provinces use the modern Panamanian units and are clipped
  to the 1900 Colombian feature.
- **Canada / Newfoundland**: Newfoundland and Labrador is a separate 1900
  dominion (\`am-nfd-newfoundland-and-labrador\`), adjacent to Quebec. It joins
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
polity \`CUB\`; Panama, the British Caribbean independences, Belize, Guyana and
Suriname are future polities. Newfoundland is the one non-selectable 1900
registry entry. The registry also carries the historical and breakaway polities
in §4.2; they own nothing at the 1900 start.

| ID | Tag | Historical name | Kind | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|---|
${futureRows}

The audit list is: United States, Canada, Mexico, Guatemala, Honduras, El
Salvador, Nicaragua, Costa Rica, Colombia, Venezuela, Ecuador, Peru, Bolivia,
Chile, Argentina, Uruguay, Paraguay, Brazil, Haiti, the Dominican Republic,
Cuba, Newfoundland, Panama, Jamaica, Trinidad and Tobago, Barbados, Guyana, the
Bahamas, Grenada, Suriname, Dominica, Saint Lucia, Saint Vincent and the
Grenadines, Antigua and Barbuda, Belize and Saint Kitts and Nevis. The standalone
audit \`scripts/m12d/audit-successors.mjs\` prints
**36 states checked, 0 without a registered polity or province group**.

### 4.1 Decisions on the optional twentieth-century episodes

- **West Indies Federation (1958–1962):** registered as historical entry \`WIF\`
  (1328). It was a federation of Crown colonies; the constituent colonies
  retained British sovereignty and the federation never held provincial
  ownership. It owns nothing in 1900 and is not selectable, but a scenario can
  transfer the island provinces to it to represent the federation episode. The
  1962 dissolution is then an ordinary transfer back to the metropolitan or
  successor polity.
- **Netherlands Antilles (1954) and Aruba (1986):** registered as future
  polities \`ANT\` (1315) and \`ARU\` (1316). The Dutch Caribbean provinces are
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
  1900 polity (\`kind: "state"\`, \`activeFrom: 1900-01-01\`) so its provinces are
  permanently distinct and the 1949 union is an ordinary transfer.
- **Falklands/Malvinas and South Georgia:** GBR-owned in 1900. The Argentine claim
  is representable through the claims system and is not seeded as a 1900
  ownership record, consistent with the Europe/Asia/Africa start states.

### 4.2 Historical and breakaway polities

The registry includes **${String(historicalPolities.length)}** historical,
breakaway and predecessor polities. They are \`kind: "historical"\`,
\`selectable1900: false\`, and own no province on 1 January 1900. A pre-1900
state cannot use its real activation date inside the 1900–2000 campaign
calendar, so its registry \`activeFrom\`/\`activeTo\` is clamped to
1900-01-01 (or to the real end when that falls inside the window); the real
dates are recorded in the notes. A historical entry is registry metadata only:
it changes no province, id or geometry, and the M12d test proves that an
alternate-history or breakaway scenario can transfer a province to Texas,
California, the Riograndense Republic or Yucatán by an ordinary ownership
transfer.

| ID | Tag | Historical name | Status | Confidence | Real existence / note |
|---:|---|---|---|---|---|
${historicalRows}

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

Neither pass changes a province polygon, id or simulation state. **${String(AUDIT.crossFeatureSeamBorderCount)}** seam pairs are committed (${String(AUDIT.crossFeaturePolityFrontierSeamCount)} of them polity-frontier seams). Seam borders are drawn only after an ownership transfer; at the 1900 start state the renderer draws the authored polity outlines, so the reviewed 1900 map is unchanged. The M12d test verifies the seams structurally and through the render plan.

Seam pairs by feature pair:

| Feature pair | Seam pairs |
|---|---:|
${seamPairSummary}

Every committed seam pair:

| Province A | Province B | Lines | Kind |
|---|---|---|---|
${seamRows}

### 5.1 Twentieth-century land-border audit

The M12d test contains the full list of **38** modern American sovereign land
borders and asserts that every one is backed by at least one shared or seam
province edge between the two successor groups. \`scripts/m12d/audit-successors.mjs\`
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
marked \`estimated\`; the audit still records every measurable residual. The
largest non-estimated residuals are:

${missingCoverage
  .slice(0, 15)
  .map(
    (entry) =>
      `- **${entry.tag}**: ${entry.residualArea.toFixed(3)} deg² residual out of ${entry.scopeArea.toFixed(2)} deg² (${((entry.residualArea / entry.scopeArea) * 100).toFixed(2)}%).`,
  )
  .join("\n")}

The residual is the sum of small coastal, river and frontier slivers. It stays
under the correct 1900 owner's polity fill, so it cannot appear as a
foreign-coloured enclave. The audit records every unassigned unit and every
cross-frontier code assignment.

The largest \`estimated\` rows are ${estimatedCoverage
  .slice(0, 2)
  .map(
    (entry) =>
      `**${entry.tag}** at ${entry.residualArea.toFixed(2)} deg² of ${entry.scopeArea.toFixed(2)} deg²`,
  )
  .join(" and ")}. These are measurement fallbacks for very large features where the
sequential difference could not complete; they too stay under the correct
owner's underlay and are not promoted to duplicate provinces.

### 5.3 Measured overlaps

Same-owner overlaps between adjacent modern units are not trimmed (they cannot
produce a foreign-coloured enclave); the largest are listed below. The build
trims cross-owner overlaps in plan order.

| Province A | Province B | Area (deg²) |
|---|---|---:|
${overlapRows}

## 6. Historical snapshots supported

\`packages/tests/src/m12d-americas-provinces.test.ts\` exercises these references;
they are validation paths, not forced outcomes.

| Reference | Result |
|---|---|
| 1 January 1900 | Every American province has one ownership record; owner = controller; no claims; Cuba, Puerto Rico and the Philippines-adjacent territories are United States-owned; Newfoundland is the separate 1900 dominion; no future polity except NFD owns anything |
| 1902 | Cuba transfers from the United States occupation to the Republic of Cuba (\`CUB\`) |
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
reviewed images are committed under \`docs/images/\`:

| Image | Region |
|---|---|
| \`m12d-americas-global.png\` | Global 1900 map |
| \`m12d-americas-north-america.png\` | Canada and the northern United States |
| \`m12d-americas-united-states.png\` | Eastern United States and the Great Lakes |
| \`m12d-americas-alaska.png\` | Alaska and the Canadian north-west |
| \`m12d-americas-greenland.png\` | Greenland and the North Atlantic |
| \`m12d-americas-mexico-central-america.png\` | Mexico and Central America |
| \`m12d-americas-panama-isthmus.png\` | Panama and the isthmus |
| \`m12d-americas-caribbean-cuba.png\` | Cuba and the Greater Antilles |
| \`m12d-americas-caribbean-greater-antilles.png\` | Hispaniola and Puerto Rico |
| \`m12d-americas-caribbean-lesser-antilles.png\` | Trinidad and the Lesser Antilles |
| \`m12d-americas-caribbean-guadeloupe.png\` | Guadeloupe and the northern chain |
| \`m12d-americas-caribbean-barbados.png\` | Barbados and the Windwards |
| \`m12d-americas-guianas.png\` | British Guiana, Suriname and French Guiana |
| \`m12d-americas-andes.png\` | Colombia, Ecuador, Peru and Bolivia |
| \`m12d-americas-brazil-amazon.png\` | Brazil and the Amazon |
| \`m12d-americas-southern-cone.png\` | Argentina, Uruguay and Paraguay |
| \`m12d-americas-patagonia.png\` | Chile, Patagonia and Tierra del Fuego |
| \`m12d-americas-falklands.png\` | The Falkland Islands |
| \`m12d-americas-pacific-coast.png\` | The Pacific coast and the Andes |
| \`m12d-americas-province.png\` | Province panel: Panama, id 300179 |

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

- \`World\` schema remains **27**; the save envelope and worker snapshot protocol
  are unchanged. M12d is additive content, not a new state shape.
- The combined catalogue is ${String(COMBINED_PROVINCES)} static definitions; the world creates ${String(COMBINED_PROVINCES)}
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
${sourceRows}

## 11. Coverage audit table

| Map feature | Scope (deg²) | Covered (deg²) | Residual (deg²) |
|---|---:|---:|---:|
${coverageRows}

## 12. Full province inventory

The inventory is grouped by 1900 owner. Every province is a permanent
geographical unit; the owner, controller, claims and special status are mutable
simulation state.

${ownerLines.join("\n")}
`;

writeFileSync(resolve(ROOT, "docs/AMERICAS_PROVINCIALIZATION.md"), doc, "utf8");
console.log(
  `wrote docs/AMERICAS_PROVINCIALIZATION.md (${String(doc.length)} bytes, ${String(BUNDLE.provinces.length)} provinces, ${String(byOwner.size)} owners, ${String(BUNDLE.futurePolities.length)} future polities)`,
);
