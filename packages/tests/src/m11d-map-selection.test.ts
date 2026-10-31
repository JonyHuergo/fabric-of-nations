/**
 * M11d map selection regression.
 *
 * Country labels are drawn at polity centroids. Playtesting hit British India's
 * centroid and the click did nothing: the SVG text became the pointer target
 * and swallowed the press intended for the country below it.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../app");
const source = readFileSync(join(APP, "src/components/WorldMap.tsx"), "utf8");

describe("M11d map selection hit testing", () => {
  test("country labels do not intercept clicks meant for the polity", () => {
    const labelStart = source.indexOf("{labelLayout.map((label) => (");
    expect(labelStart).toBeGreaterThan(0);
    const labelBlock = source.slice(labelStart, labelStart + 1_000);
    expect(labelBlock).toContain('pointerEvents="none"');
  });

  test("labels scale with the country and avoid collisions", () => {
    expect(source).toContain("const fitByWidth = countryWidth /");
    expect(source).toContain("Math.sqrt(countryWidth * countryHeight)");
    expect(source).toContain("boxes.some(");
    expect(source).toContain("fontSize = (screenFontSize + (selected ? 1.5 : 0)) / screenScale");
  });

  test("polity fills and small-state markers remain selectable", () => {
    const fillStart = source.indexOf("onPress={() => onSelect(polity.tag)}");
    expect(fillStart).toBeGreaterThan(0);
    const markerStart = source.indexOf("key={`marker-${polity.tag}`}");
    expect(markerStart).toBeGreaterThan(0);
    expect(source.slice(markerStart, markerStart + 500)).toContain("onPress={() => onSelect(polity.tag)}");
  });
});
