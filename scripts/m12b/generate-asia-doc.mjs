/**
 * Generate docs/ASIA_PROVINCIALIZATION.md from the committed Asia bundle.
 *
 * Run: node scripts/m12b/generate-asia-doc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const BUNDLE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_asia_1900.json"), "utf8"),
);
const AUDIT = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_asia_1900_audit.json"), "utf8"),
);
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
      ? "1900 polity not present in the M11 catalog."
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
      `| ${polity.polityId} | ${polity.tag} | ${escapeCell(polity.historicalName)} | ${polity.status} | ${polity.activeFrom} | ${polity.activeTo ?? "—"} | ${escapeCell(polity.capitalName)} | ${polity.confidence} |`,
  )
  .join("\n");

const mapFeatures = [...new Set(BUNDLE.provinces.map((province) => province.mapTag))].sort();
const overlapLines = AUDIT.overlaps
  .slice(0, 12)
  .map((overlap) => `| \`${overlap.left}\` | \`${overlap.right}\` | ${overlap.area} |`)
  .join("\n");

const doc = `# M12b — Asian Provincialization (1 January 1900)

Status: implemented. This document is generated from the committed Asia province
bundle and audit; the bundle and the code are authoritative if they disagree.

## 1. Scope and architecture

- Asia is the direct counterpart of M12a Europe. The only geographical
  subdivision beneath a polity is the **Province**; there is no
  Polity → Region → Province hierarchy and no parallel geographical region layer.
- The historical simulation \`Region\` remains a population/economy accounting
  unit. It is preserved as \`SimulationRegion\` and is never used to draw or
  hit-test territory. See DECISIONS D-103 and D-104.
- Province ids start at **100001**, above the entire M12a European block
  (maximum 66001), and every Asia key is prefixed with \`as-\`. A merge-time check
  rejects any collision with Europe.
- The two committed bundles stay separate build artifacts:
  - \`packages/data/data/map/provinces_1900.json\` — M12a Europe;
  - \`packages/data/data/map/provinces_asia_1900.json\` — M12b Asia.
  A single loader (\`packages/data/src/provinces.ts\` for the simulation and
  \`packages/app/src/provinceMapBundle.ts\` for the renderer) combines them with
  unique ids, merged borders and one future-polity registry.
- Political state is mutable and separate from geography: legal owner, effective
  controller, occupation date, formal claims and special status live in
  \`World.provinces\`; geometry, id and name never change.
- Country borders are reconstructed from current provincial ownership using the
  same rendering contract as Europe: province fills by current owner, a quiet
  solid white hairline on every province outline, and a thin near-black country
  border where the two current owners differ. No dotted or dashed province
  lines are used.
- Asia's province geometries are clipped to the authored M11c 1900 polity
  polygons. The M11c polygons remain the underlay for territories outside the
  provincial scope (the Americas, most of Africa and Oceania).

## 2. Inventory summary

- Provinces: **${String(BUNDLE.provinces.length)}**.
- 1900 owner polities with at least one province: **${String(byOwner.size)}**.
- Map features covered: **${String(mapFeatures.length)}** (\`${mapFeatures.join("`, `")}\`).
- Future successor polities in the registry: **${String(BUNDLE.futurePolities.length)}** (ids 1100–${String(1100 + BUNDLE.futurePolities.length - 1)}).
- Unique province ids/keys: **yes** (build audit).
- Border pairs: **${String(BUNDLE.borders.length)}**; shared border segments: **${String(AUDIT.borderSegmentCount)}**; segments with more than two neighbours: **${String(AUDIT.unmatchedBorderSegments)}**.
- Province pairs with a measured overlap above 0.005 deg²: **${String(AUDIT.overlapCount)}** (the largest are listed in §3).
- Confidence: low **${String(confidenceCounts.get("low") ?? 0)}**, medium **${String(confidenceCounts.get("medium") ?? 0)}**, high **${String(confidenceCounts.get("high") ?? 0)}**.
- Admin-1 units whose label point lies inside an Asian 1900 feature but that no province claims: **${String(AUDIT.unassignedUnitCount)}**.

## 3. Method and geometry provenance

The build uses modern Natural Earth 1:10m admin-1 units **only as internal
geometry blocks**. Every province is clipped to its authored M11c 1900 polity
polygon. Where a later frontier cut through a modern unit, the province is split
along that frontier and the approximation is labelled low or medium confidence.
Output geometry is simplified at 0.02° and quantized to thousandths of a degree,
matching the M11c world map.

The M12a/M12b pipeline is one shared library
(\`scripts/m12/province-build-lib.mjs\`). It applies these rules in order:

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
${overlapLines}

The committed build products are:

- \`packages/data/data/map/provinces_asia_1900.json\` — province metadata, geometry, shared boundaries and future polities.
- \`packages/data/data/map/provinces_asia_1900_audit.json\` — coverage, overlaps, ids, source count, unassigned units and warnings.
- \`packages/app/src/generated/provincesAsia1900.ts\` — the same bundle for the offline app.
- \`scripts/m12b/asia-plan.mjs\` — the authored historical inventory and grouping rules.
- \`scripts/m12b/build-asia-provinces.mjs\` — the deterministic geometry build.

## 4. Sources

| ID | Title | Licence | Date | URL |
|---|---|---|---|---|
${sourceRows}

## 5. Coverage

Coverage is measured by subtracting each province from its 1900 map polity
polygon, restricted to the Asian coverage scope for the transcontinental Russian
and Ottoman features. The residual is **not** promoted to a duplicate province:
it stays under the 1900 polity fill, whose owner is correct, and is reported
here instead. \`estimated\` rows are cases where the polygon library could not
complete a large sequential difference; their residual is approximated by area.
Coastal and frontier slivers below a few hundredths of a square degree are
normal at this simplification level.

| Map feature | Scope (deg²) | Covered (deg²) | Residual |
|---|---:|---:|---:|
${coverageRows}

## 6. Future successor polities

None of these polities is selectable in 1900. They can receive provinces through
an ownership transfer; activation dates are stored as campaign day indices.

| ID | Tag | Historical name | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|
${futureRows}

## 7. Major historical transfers supported

Reference snapshots are validation references, not forced outcomes. They are
exercised by \`packages/tests/src/map/provinces-asia.test.ts\`.

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

${ownerLines.join("\n")}

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

\`\`\`
node scripts/m12/build-provinces.mjs
node scripts/m12b/build-asia-provinces.mjs
node scripts/m12b/generate-asia-doc.mjs
pnpm -F @century/app typecheck
pnpm -F @century/tests test -- m12b-asia-provinces
pnpm -F @century/app export:web
node scripts/m12b/playtest-screenshot-asia.mjs
\`\`\`
`;

writeFileSync(resolve(ROOT, "docs/ASIA_PROVINCIALIZATION.md"), doc, "utf8");
console.log(
  `wrote docs/ASIA_PROVINCIALIZATION.md provinces=${BUNDLE.provinces.length} owners=${byOwner.size} futures=${BUNDLE.futurePolities.length}`,
);
