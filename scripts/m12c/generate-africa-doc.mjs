/**
 * Generate docs/AFRICA_PROVINCIALIZATION.md from the committed Africa bundle.
 *
 * Run: node scripts/m12c/generate-africa-doc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const BUNDLE = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_africa_1900.json"), "utf8"),
);
const AUDIT = JSON.parse(
  readFileSync(resolve(ROOT, "packages/data/data/map/provinces_africa_1900_audit.json"), "utf8"),
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
      `| ${polity.polityId} | ${polity.tag} | ${escapeCell(polity.historicalName)} | ${polity.status} | ${polity.activeFrom} | ${polity.activeTo ?? "—"} | ${escapeCell(polity.capitalName)} | ${polity.confidence} |`,
  )
  .join("\n");

const mapFeatures = [...new Set(BUNDLE.provinces.map((province) => province.mapTag))].sort();
const overlapLines = AUDIT.overlaps
  .slice(0, 12)
  .map((overlap) => `| \`${overlap.left}\` | \`${overlap.right}\` | ${overlap.area} |`)
  .join("\n");

const seamPairs = (AUDIT.crossFeatureSeamBorders ?? [])
  .map((entry) => {
    const left = BUNDLE.provinces.find((province) => province.id === entry.a);
    const right = BUNDLE.provinces.find((province) => province.id === entry.b);
    return `| \`${left?.key ?? entry.a}\` | \`${right?.key ?? entry.b}\` | ${String(entry.lines)} |`;
  })
  .join("\n");

const doc = `# M12c — African Provincialization (1 January 1900)

Status: implemented. This document is generated from the committed Africa
province bundle and audit; the bundle and the code are authoritative if they
disagree.

## 1. Scope and architecture

- Africa is the direct counterpart of M12a Europe and M12b Asia. The only
  geographical subdivision beneath a polity is the **Province**; there is no
  Polity → Region → Province hierarchy and no parallel geographical region layer.
- The historical simulation \`Region\` remains a population/economy accounting
  unit. It is preserved as \`SimulationRegion\` and is never used to draw or
  hit-test territory. See DECISIONS D-103, D-104 and D-105.
- Province ids start at **200001**, above the M12a European block (maximum
  66001) and the M12b Asian block (100001–100239), and every Africa key is
  prefixed with \`af-\`. A build-time and merge-time check rejects any collision
  with Europe or Asia.
- The three committed bundles stay separate build artifacts:
  - \`packages/data/data/map/provinces_1900.json\` — M12a Europe;
  - \`packages/data/data/map/provinces_asia_1900.json\` — M12b Asia;
  - \`packages/data/data/map/provinces_africa_1900.json\` — M12c Africa.
  A single loader (\`packages/data/src/provinces.ts\` for the simulation and
  \`packages/app/src/provinceMapBundle.ts\` for the renderer) combines all three
  with unique ids, merged borders and one future-polity registry.
- Political state is mutable and separate from geography: legal owner, effective
  controller, occupation date, formal claims and special status live in
  \`World.provinces\`; geometry, id and name never change.
- Country borders are reconstructed from current provincial ownership using the
  same rendering contract as Europe and Asia: province fills by current owner, a
  quiet solid white hairline on every province outline, and a thin near-black
  country border where the two current owners differ. No dotted or dashed
  province lines are used.
- Africa's province geometries are clipped to the authored M11c 1900 polity
  polygons. The M11c polygons remain the underlay for territories outside the
  provincial scope (the Americas and Oceania).

## 2. Inventory summary

- Provinces: **${String(BUNDLE.provinces.length)}** (ids ${String(BUNDLE.provinces[0]?.id)}–${String(BUNDLE.provinces[BUNDLE.provinces.length - 1]?.id)}).
- 1900 owner polities with at least one province: **${String(byOwner.size)}**.
- Map features covered: **${String(mapFeatures.length)}** (\`${mapFeatures.join("`, `")}\`).
- Future successor polities in the registry: **${String(BUNDLE.futurePolities.length)}** (ids 1200–${String(1200 + BUNDLE.futurePolities.length - 1)}).
- Unique province ids/keys: **yes** (build audit: ${String(AUDIT.duplicateProvinceIds)} duplicate ids, ${String(AUDIT.duplicateKeys)} duplicate keys).
- Border pairs: **${String(BUNDLE.borders.length)}**, of which **${String(AUDIT.crossFeatureSeamBorderCount)}** are display-only cross-feature seam borders; shared border segments: **${String(AUDIT.borderSegmentCount)}**; segments with more than two neighbours: **${String(AUDIT.unmatchedBorderSegments)}**.
- Province pairs with a measured overlap above 0.005 deg²: **${String(AUDIT.overlapCount)}** (the largest are listed in §3).
- Confidence: low **${String(confidenceCounts.get("low") ?? 0)}**, medium **${String(confidenceCounts.get("medium") ?? 0)}**, high **${String(confidenceCounts.get("high") ?? 0)}**.
- Admin-1 units whose label point lies inside an African 1900 feature but that no province claims: **${String(AUDIT.unassignedUnitCount)}**.
- Admin-1 units claimed by two provinces of the same feature (rejected): **${String(AUDIT.duplicateUnitClaimCount)}**.

## 3. Method and geometry provenance

The build uses modern Natural Earth 1:10m admin-1 units **only as internal
geometry blocks**. Every province is clipped to its authored M11c 1900 polity
polygon. Where a later frontier cut through a modern unit, the province is split
along that frontier and the approximation is labelled low or medium confidence.
Output geometry is simplified at 0.02° and quantized to thousandths of a degree,
matching the M11c world map.

The M12a/M12b/M12c pipeline is one shared library
(\`scripts/m12/province-build-lib.mjs\`). It applies these rules in order:

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
${overlapLines}

### 3.1 Cross-feature seam borders

| Left | Right | Lines |
|---|---|---:|
${seamPairs}

The committed build products are:

- \`packages/data/data/map/provinces_africa_1900.json\` — province metadata, geometry, shared boundaries and future polities.
- \`packages/data/data/map/provinces_africa_1900_audit.json\` — coverage, overlaps, ids, source count, unassigned units, seam borders and warnings.
- \`packages/app/src/generated/provincesAfrica1900.ts\` — the same bundle for the offline app.
- \`scripts/m12c/africa-plan.mjs\` — the authored historical inventory and grouping rules.
- \`scripts/m12c/build-africa-provinces.mjs\` — the deterministic geometry build.

## 4. Sources

| ID | Title | Licence | Date | URL |
|---|---|---|---|---|
${sourceRows}

## 5. Coverage

Coverage is measured by subtracting each province from its 1900 map polity
polygon, restricted to the African coverage scope for the shared features
(Ottoman Libya, the French Indian Ocean islands, the Portuguese Atlantic islands,
the British Indian and South Atlantic islands, Morocco north of Western Sahara and
the Cape south of the Prince Edward Islands). The residual is **not** promoted to
a duplicate province: it stays under the 1900 polity fill, whose owner is correct,
and is reported here instead. \`estimated\` rows are cases where the polygon
library could not complete a large sequential difference; their residual is
approximated by area. Coastal and frontier slivers below a few hundredths of a
square degree are normal at this simplification level.

| Map feature | Scope (deg²) | Covered (deg²) | Residual |
|---|---:|---:|---:|
${coverageRows}

## 6. Future successor polities

None of these polities is selectable in 1900. They can receive provinces through
an ownership transfer; activation dates are stored as campaign day indices.

| ID | Tag | Historical name | Status | Active from | Active to | Capital | Confidence |
|---:|---|---|---|---|---|---|---|
${futureRows}

South Sudan is registered with an activation of 1 January 2000 rather than its
historical 9 July 2011 because the simulated calendar ends on 1 January 2000. The
southern Sudanese provinces are permanently separate from the northern ones, so
the transfer remains a single ordinary ownership change; see D-105.

## 7. Major historical transfers supported

Reference snapshots are validation references, not forced outcomes. They are
exercised by \`packages/tests/src/map/provinces-africa.test.ts\`.

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

${ownerLines.join("\n")}

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
  Goa, Daman and Diu; those are Asia's \`as-bin-goa\` province and are excluded
  from the African build and its coverage scope.
- **Congo Free State.** The Congo basin region already belongs to Belgium in the
  simulation, so the Congo Free State provinces are owned by Belgium in 1900 and
  the 1908 annexation is a status change rather than an ownership change.
- **Egypt and the Ottoman claim.** Egypt's simulation region belongs to the
  Ottoman Empire, while the provinces are owned by the British occupying power.
  De jure Ottoman suzerainty is representable as a formal claim (exercised by the
  M12c test) rather than as ownership; the 1900 start state seeds no claims, for
  consistency with Europe and Asia.
- **Cross-feature seams.** The ${String(AUDIT.crossFeatureSeamBorderCount)} seam
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

\`\`\`
node scripts/m12c/build-africa-provinces.mjs
node scripts/m12c/generate-africa-doc.mjs
pnpm -F @century/app typecheck
pnpm -F @century/tests test -- m12c-africa-provinces
pnpm -F @century/app export:web
node scripts/m12c/playtest-screenshot-africa.mjs
\`\`\`
`;

writeFileSync(resolve(ROOT, "docs/AFRICA_PROVINCIALIZATION.md"), doc, "utf8");
console.log(
  `wrote docs/AFRICA_PROVINCIALIZATION.md provinces=${BUNDLE.provinces.length} owners=${byOwner.size} futures=${BUNDLE.futurePolities.length}`,
);
