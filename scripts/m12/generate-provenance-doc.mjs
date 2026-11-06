/**
 * Generate docs/EUROPE_PROVINCIALIZATION.md from the committed province bundle.
 *
 * Run: node scripts/m12/generate-provenance-doc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const BUNDLE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_1900.json"), "utf8"),
);
const AUDIT = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_1900_audit.json"), "utf8"),
);
const CATALOG = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/historical/m11/polities_1900.json"), "utf8"),
);

const provinceRows = [];
const byOwner = new Map();
for (const province of [...BUNDLE.provinces].sort((left, right) => left.id - right.id)) {
  if (!byOwner.has(province.initialOwnerTag)) byOwner.set(province.initialOwnerTag, []);
  byOwner.get(province.initialOwnerTag).push(province);
}

const catalogByTag = new Map();
for (const entry of [...CATALOG.states, ...CATALOG.territories]) {
  catalogByTag.set(entry.tag, entry);
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

const ownerLines = [];
for (const [tag, provinces] of [...byOwner.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
  const entry = catalogByTag.get(tag);
  const total = provinces.length;
  ownerLines.push(
    `### ${escapeCell(entry?.name ?? tag)} (${tag}) — ${String(total)} provinces`,
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

const doc = `# M12a — European Provincialization (1 January 1900)

Status: implemented. This document is generated from the committed province
bundle and audit; the bundle and the code are authoritative if they disagree.

## 1. Scope and architecture

- The only geographical subdivision beneath a polity is the **Province**. There
  is no Polity → Region → Province hierarchy and no parallel geographical region
  layer.
- The historical simulation \`Region\` is a population/economy accounting unit,
  not a geographical entity. It is preserved as \`SimulationRegion\` (with the
  existing runtime field name \`regions\` kept for save compatibility) and is
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
  draws province fills by current owner; every province outline carries a quiet
  solid white hairline (shared edges are double-stroked at the same coordinates,
  so they stay continuous and aligned with the fills). At the 1900 start state
  the continuous polity outline is the exact boundary of its province union and
  is used for the country border, with the same thin near-black weight as the
  established non-European borders. After a transfer the changed polity's static
  outline is suppressed and the border is derived from current province
  ownership.
- Non-European territories are outside this milestone. The M11c 1900 polity
  polygons remain the underlay for colonies, Asiatic Russia, Anatolia and other
  non-European areas.

## 2. Inventory summary

- Provinces: **${BUNDLE.provinces.length}**.
- 1900 owner polities with at least one province: **${byOwner.size}**.
- Future successor polities in the registry: **${BUNDLE.futurePolities.length}**.
- Unique province ids/keys: **${AUDIT.duplicateProvinceIds === 0 && AUDIT.duplicateKeys === 0 ? "yes" : "NO"}**.
- Border pairs: **${AUDIT.borderPairCount}**; shared border segments: **${AUDIT.borderSegmentCount}**; segments with more than two neighbours: **${AUDIT.unmatchedBorderSegments}**.
- Significant province-pair overlaps (area > 0.005 deg²): **${AUDIT.overlapCount}** (largest documented in the audit file; all are small, mostly at authored clip seams).
- Confidence: low **${confidenceCounts.get("low") ?? 0}**, medium **${confidenceCounts.get("medium") ?? 0}**, high **${confidenceCounts.get("high") ?? 0}**.

## 3. Method and geometry provenance

The build uses modern Natural Earth 1:10m admin-1 units **only as internal
geometry blocks**. Every province is clipped to its authored M11c 1900 polity
polygon (\`packages/data/data/map/world_map_1900.json\`). Where a later border cut
through a 1900 administrative unit, the province is split along the later border
and the approximation is labelled low or medium confidence. The output is
simplified at ${BUNDLE.meta.simplificationToleranceDegrees}° and quantized to thousandths of a degree,
matching the M11c world map.

The committed build products are:

- \`packages/data/data/map/provinces_1900.json\` — province metadata, geometry, shared boundaries and future polities.
- \`packages/data/data/map/provinces_1900_audit.json\` — coverage, overlaps, ids, source count and warnings.
- \`packages/app/src/generated/provinces1900.ts\` — the same bundle for the offline app.
- \`scripts/m12/province-plan.mjs\` — the authored historical inventory and clip rules.
- \`scripts/m12/build-provinces.mjs\` — the deterministic geometry build.

## 4. Sources

| ID | Title | Licence | Date | URL |
|---|---|---|---|---|
${sourceRows}

## 5. Completeness

The 1900 European polities in the M11c catalog all receive provinces. Coverage is
measured by subtracting each province from its 1900 map polity polygon. Slivers
below the residual threshold are reported rather than promoted into duplicate
provinces: they remain under the 1900 polity fill, which is still drawn beneath
the province layer. \`estimated\` rows are cases where polygonal difference
exceeded the geometry library's limits; their residual is approximated by area.

| Map feature | 1900 scope (deg²) | Covered by provinces (deg²) | Residual |
|---|---:|---:|---:|
${coverageRows}

## 6. Future successor polities

None of these polities is selectable in 1900. They can receive provinces through
an ownership transfer. Activation dates are stored as campaign day indices.

| ID | Tag | Historical name | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|
${futureRows}

## 7. Major historical transfers supported

Reference snapshots are validation references, not forced outcomes. They are
exercised by \`packages/tests/src/map/provinces-europe.test.ts\`.

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

${ownerLines.join("\n")}

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
   \`provinces_1900_audit.json\`. They are not hidden by clamping.


## 10. Verification

- \`pnpm test\` includes \`map/provinces-europe.test.ts\`: bundle/geometry validation,
  1900 ownership, historical subdivision presence, Austria-Hungary dissolution,
  German post-WWI/post-WWII/reunification, Russian fragmentation, Irish
  partition, save/load round-trip and deterministic hashing.
- \`pnpm typecheck\`, \`pnpm lint\` and \`pnpm bench\` are run for the milestone.
- The static verification render is \`docs/images/m12a-provinces-1900.png\`.
`;

writeFileSync(resolve(ROOT, "docs/EUROPE_PROVINCIALIZATION.md"), doc, "utf8");
console.log(`wrote docs/EUROPE_PROVINCIALIZATION.md (${(doc.length / 1024).toFixed(0)} KiB)`);

