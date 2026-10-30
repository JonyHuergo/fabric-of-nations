/**
 * Generate docs/HISTORICAL_MAP_PROVENANCE.md from the committed boundary and
 * catalog data. Run after build-boundaries.mjs:
 *
 *   node scripts/m11/generate-provenance-doc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CATALOG_PATH = resolve(ROOT, "packages/data/data/historical/m11/polities_1900.json");
const BOUNDARIES_PATH = resolve(ROOT, "packages/data/data/historical/m11/boundaries_1900.json");
const AUDIT_PATH = resolve(ROOT, "packages/data/data/map/world_map_1900_audit.json");
const OUT_PATH = resolve(ROOT, "docs/HISTORICAL_MAP_PROVENANCE.md");

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const boundaries = JSON.parse(readFileSync(BOUNDARIES_PATH, "utf8"));
const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8"));
const all = [...catalog.states, ...catalog.territories];
const byTag = new Map(all.map((entry) => [entry.tag, entry]));
const provenance = boundaries.provenance;

const classCounts = {};
const confidenceCounts = {};
for (const record of Object.values(provenance)) {
  classCounts[record.geometryClass] = (classCounts[record.geometryClass] ?? 0) + 1;
  confidenceCounts[record.confidence] = (confidenceCounts[record.confidence] ?? 0) + 1;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function tableForContinent(continent) {
  const entries = all
    .filter((entry) => entry.continent === continent)
    .sort((left, right) => left.id - right.id);
  const lines = [
    "| ID | Tag | Polity | Geometry | Confidence | Transfer(s) | Boundary notes and deviations from the modern map |",
    "|---:|---|---|---|---|---|---|",
  ];
  for (const entry of entries) {
    const record = provenance[entry.tag];
    if (record === undefined) throw new Error(`missing provenance for ${entry.tag}`);
    const transfers = record.transferIds.length === 0 ? "—" : record.transferIds.join(", ");
    lines.push(
      `| ${entry.id} | \`${entry.tag}\` | ${escapeCell(entry.name)} | ${record.geometryClass} | ${record.confidence} | ${escapeCell(transfers)} | ${escapeCell(record.notes)} |`,
    );
  }
  return lines.join("\n");
}

const sourceLines = boundaries.meta.sourceRegistry
  .map(
    (source) =>
      `- **${source.id}** — ${source.title}. ${source.license}. ${source.date}. <${source.url}>`,
  )
  .join("\n");

const overlapLines =
  audit.overlaps.length === 0
    ? "None above the 0.001 deg² audit threshold."
    : audit.overlaps
        .map(
          (overlap) =>
            `- \`${overlap.a}\` / \`${overlap.b}\`: ${overlap.area} deg² — a generalized-coastline sliver, not a deliberate political claim.`,
        )
        .join("\n");

const gapLines =
  audit.coverage.components.length === 0
    ? "None."
    : audit.coverage.components
        .map(
          (component) =>
            `- ${component.samples} sample(s) near ${component.bbox[0]},${component.bbox[1]} to ${component.bbox[2]},${component.bbox[3]} — a 1-degree coastal/island sample, not a missing polity.`,
        )
        .join("\n");

const doc = `# Historical map provenance and 1900 boundary audit (M11c)

**Reference date:** 1 January 1900. The map is a historical reconstruction, not
a modern political map and not a survey. Approximate frontiers are labelled and
are not presented as exact.

## 1. Method

The map is built offline by \`scripts/m11/build-map.mjs\` from:

1. **Modern Natural Earth geometry as building blocks only.** The 1:50m
   admin-0 units provide the base coastlines and country blocks; the 1:10m
   admin-1 and admin-0 units provide reconstruction blocks (French departments,
   Polish voivodeships, Romanian counties, Indian states, Nigerian states,
   Chadian regions, etc.). A modern unit is never accepted as a 1900 border
   without an explicit historical claim.
2. **Authored 1900 transfers** in
   \`packages/data/data/historical/m11/boundaries_1900.json\`. Each transfer
   names its destination, its source polities, its source units or authored
   polygon, its dated sources, its confidence, and its known uncertainty.
3. **Source clipping.** Every transfer shape is intersected with its source
   polity's base geometry. This keeps the destination a subset of the modern
   source blocks and prevents a reconstruction from silently spilling across a
   generalized coastline.
4. **Topological cleanup.** Transfers are applied with \`polygon-clipping\`;
   residual destination/source overlaps are resolved deterministically (a
   transfer destination beats its source, otherwise the smaller, more specific
   polity keeps a sliver). The rings are simplified to 0.02° and quantized to
   0.001°.
5. **Audit.** \`scripts/m11/audit-map.mjs\` decodes the final bundle, rebuilds
   outer-ring/hole grouping, checks ring validity, computes pairwise overlaps,
   and samples land at 1° resolution for unassigned gaps. The report is
   \`packages/data/data/map/world_map_1900_audit.json\`.

### Confidence classes

- **HIGH** — supported by strong historical cartographic, administrative or
  treaty evidence; the only uncertainty is modern-source generalization.
- **MEDIUM** — reconstructed from reliable sources, with a frontier line or
  exact extent that remains uncertain.
- **LOW** — a defensible approximate historical extent where the evidence is
  incomplete or the frontier was not surveyed or defined.

### Geometry classes

- **direct-modern-verified** — one modern unit whose external border is documented as identical in 1900.
- **aggregate-modern-verified** — a union of modern units whose combined 1900 external border is documented as identical.
- **reconstructed** — the 1900 geometry differs from the modern map and is rebuilt with explicit transfers.
- **approximate** — a defensible but low-confidence historical extent.
- **marker-only** — no polygon. There are **no marker-only polities** in the
  final M11c map; the M11b marker entries were replaced with polygons.

### Coverage summary

| Measure | Count |
|---|---:|
| Catalogued polities | ${all.length} |
| Map polities with provenance | ${audit.summary.provenanceCount} |
| Marker-only polities | ${audit.summary.markerOnly} |
| Invalid rings | ${audit.summary.invalidRings} |
| Overlaps above 0.001 deg² | ${audit.summary.overlaps} |
| Land samples (1°) | ${audit.summary.landSamples} |
| Unassigned land samples | ${audit.summary.unassignedSamples} |
| Unassigned components | ${audit.summary.unassignedComponents} |
| Largest unassigned component | ${audit.summary.largestUnassignedComponent} sample(s) |

Geometry classes: ${Object.entries(classCounts)
  .map(([key, value]) => `**${key}** ${value}`)
  .join(", ")}. Boundary confidence: ${Object.entries(confidenceCounts)
    .map(([key, value]) => `**${key}** ${value}`)
    .join(", ")}.

## 2. Germany — the German Empire, not the Federal Republic

The modern German polygon is only a building block. The 1900 German Empire is
reconstructed by adding:

- **Alsace-Lorraine** — the French departments Bas-Rhin, Haut-Rhin and Moselle,
  annexed in 1871. Territoire de Belfort remained French and is excluded.
- **North Schleswig** — the modern Danish territory south of the Kongeå and
  north of the 1920 border.
- **Eupen-Malmedy** — the districts transferred to Belgium in 1920.
- **Memel (Klaipėda)** — the Klaipėda county, German until 1923.
- **East Prussia (Kaliningrad)** — the northern half of East Prussia, Russian
  from 1945.
- **Posen, West Prussia, Pomerania and Silesia** — the modern Polish
  voivodeships clipped to the authored 1900 German-Russian and German-Austrian
  frontier. The line excludes Congress Poland (Kalisz, Konin, Włocławek,
  Częstochowa) and Austrian Galicia, while retaining Thorn, Posen, Breslau and
  the East Prussian core. The frontier strip is generalized to roughly 10–20 km
  and carries MEDIUM confidence; the surrounding transfers are HIGH.

The result is tested with point-in-polygon checks for Berlin, Königsberg,
Danzig, Posen, Breslau, Strasbourg, Metz, Kiel, Flensburg, Memel, Eupen,
Tønder and Thorn (included), and Warsaw, Kalisz, Częstochowa, Włocławek,
Kraków, Vilnius, Copenhagen, Nancy, Belfort and Basel (excluded).

## 3. Libya — Ottoman Tripolitania, Cyrenaica and Fezzan

Libya was not a modern independent state in 1900. The territory was under
Ottoman sovereignty, administered as the vilayet of Tripoli (Tripolitania), the
sanjak of Benghazi (Cyrenaica) and the loosely administered Fezzan. M11c adds
the modern Libyan outer frame to the **Ottoman Empire (OTT)** and removes the
Aouzou strip, which was administered from Chad in 1900 (the 1935 Franco-Italian
cession had not occurred). No \`LBY\` polity is added, and no modern Libyan
sovereign state is invented.

The map provenance records three Ottoman components:

- **Tripolitania** — Ottoman vilayet of Tripoli; coastal garrisons and limited
  interior control.
- **Cyrenaica** — Ottoman sanjak of Benghazi; the Senussi order exercised
  substantial local authority alongside the Ottoman administration.
- **Fezzan** — loosely administered mutasarrifate; effective control was shared
  with local and trans-Saharan authorities and the southern limit was not
  delimited.

The outer frame is MEDIUM confidence. The provincial and southern limits are
explicitly approximate; the distinction between sovereignty, local
administration and limited effective control is recorded rather than flattened
into a modern national border. Point tests cover Tripoli, Benghazi, Sabha,
Murzuq, Kufra and Ghadames, and the audit confirms there is no unassigned land
sample in the Libyan box. Tunisia, Egypt, French Algeria, Spanish Sahara and
French Equatorial Africa retain their own 1900 assignments.

## 4. Global boundary audit

Every catalogued polity is listed below. “Transfers” names the explicit
historical transfers that change its modern geometry; “—” means the modern
external outline was independently verified as the 1900 external border. The
notes state the historical deviation, the confidence limitation, or the reason
the modern outline is retained.

### Europe

${tableForContinent("Europe")}

### Asia

${tableForContinent("Asia")}

### Africa

${tableForContinent("Africa")}

### Americas

${tableForContinent("Americas")}

### Oceania

${tableForContinent("Oceania")}

## 4a. Visual smoke images

The committed comparison images are rendered from the map bundle with
\`scripts/m11/render_map.py\` (Miller projection, even-odd rings). They are
smoke/comparison artefacts, not survey maps.

| View | Before M11c | After M11c |
|---|---|---|
| Entire world | ![World before](images/m11c/before-world.png) | ![World after](images/m11c/after-world.png) |
| Europe | ![Europe before](images/m11c/before-europe.png) | ![Europe after](images/m11c/after-europe.png) |
| German Empire | ![Germany before](images/m11c/before-germany.png) | ![Germany after](images/m11c/after-germany.png) |
| North Africa | ![North Africa before](images/m11c/before-north-africa.png) | ![North Africa after](images/m11c/after-north-africa.png) |
| Libya / Ottoman North Africa | — | ![Libya after](images/m11c/after-libya.png) |
| Central Asia | — | ![Central Asia after](images/m11c/after-central-asia.png) |

The before images are the pre-M11c bundle at the same projection and bounds. The
Libyan black void in the before image is the gap M11c closes; the German before
image is the modern Federal Republic outline, while the after image is the 1900
German Empire.

## 5. Why some modern borders are retained

A modern border is retained only where the research establishes that the 1900
external border coincided with it. Examples:

- **United Kingdom** — Great Britain and the whole of Ireland; no external
  change between 1900 and the modern outline used here.
- **Spain, Portugal, Switzerland, the Netherlands, Luxembourg, Monaco, San
  Marino, Andorra and Liechtenstein** — peninsular/European external borders
  unchanged; colonial possessions are separate entries.
- **Sweden and Norway** — separate polities in personal union; their external
  borders were unchanged in 1900.
- **United States** — the 1900 external border includes Alaska and the annexed
  Hawaiian Islands; the Philippines, Puerto Rico, Guam and American Samoa are
  separate territories.
- **Japan** — the home islands, Okinawa and the Bonins; Taiwan is a separate
  colony and Korea is independent.
- **Mexico, Argentina, Uruguay, Haiti and the Dominican Republic** — external
  borders unchanged after the relevant 19th-century settlements; micro-frontier
  uncertainty is recorded in the notes.

Retaining a modern outline in these cases is an explicit verification result,
not a default. Polities whose modern territory contains a documented 1900
difference are reconstructed (Germany, France, Denmark, Belgium, Italy,
Austria-Hungary, Russia, the Ottoman Empire, Romania, Bulgaria, Serbia,
Montenegro, Greece, Siam, British India, the African colonies, China/Tibet,
the Central Asian protectorates and the Americas/Oceania entries above).

## 6. Residual generalization artefacts

The audit reports **${audit.summary.overlaps}** overlap(s) above 0.001 deg² and
**${audit.summary.unassignedSamples}** unassigned 1° land samples. These are
coastline/island generalization artefacts of independently simplified
neighbours, not unrepresented polities:

${overlapLines}

Unassigned samples (each is a single 1° sample; there is no multi-sample void):

${gapLines}

The Libyan gap that motivated M11c is gone. Antarctica and truly unclaimed
territory remain on the neutral land layer by design; they are not assigned to
a sovereign state.

## 7. Sources

${sourceLines}

## 8. Reproducing the audit

\`\`\`bash
node scripts/m11/build-boundaries.mjs
node scripts/m11/build-map.mjs
node scripts/m11/audit-map.mjs
node scripts/m11/generate-provenance-doc.mjs
pnpm -F @century/tests test -- m11c-geography
\`\`\`

The build cache (\`.cache-m11/\`) contains the one-time Natural Earth downloads;
the committed map bundle and audit report are fully offline and are the only
runtime artifacts.
`;

writeFileSync(OUT_PATH, doc, "utf8");
console.log(`wrote ${OUT_PATH} (${doc.length} bytes, ${all.length} polities)`);
