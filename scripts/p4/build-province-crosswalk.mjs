#!/usr/bin/env node
/**
 * P4 (D-142): province → modern country crosswalk.
 *
 * Each 1900 province is assigned the modern country (ISO 3166-1 alpha-3) and UN
 * continental region under its label point, using Natural Earth 1:10m admin-0
 * countries (public domain; cached locally in `.cache-m11/` by the M11 geometry
 * build). A label that falls in no polygon (a coastal or island label just off the
 * 1:10m coastline) takes the country with the nearest boundary vertex. Colonies get
 * their own modern country (British India → IND), which is why demographic levels are
 * set per province, not per 1900 sovereign.
 *
 * Output (committed): packages/data/data/historical/p4/province_modern_country_1900.json
 * Usage: node scripts/p4/build-province-crosswalk.mjs [--check]
 *   --check needs the Natural Earth cache; without it the check is reported as skipped.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAP = join(ROOT, "packages/data/data/map");
const CACHE = join(ROOT, ".cache-m11/ne_10m_admin_0_countries.geojson");
const OUT = join(ROOT, "packages/data/data/historical/p4/province_modern_country_1900.json");
const check = process.argv.includes("--check");

if (!existsSync(CACHE)) {
  const message = `Natural Earth cache missing (${CACHE}); crosswalk ${check ? "check skipped" : "not built"}.`;
  if (check) {
    console.log(message);
    process.exit(0);
  }
  throw new Error(message);
}

const PROVINCE_FILES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];

function regionOf(properties) {
  const region = properties.REGION_UN;
  if (region === "Americas") return properties.SUBREGION === "Northern America" ? "northern-america" : "latin-america-caribbean";
  if (region === "Africa") return "africa";
  if (region === "Asia") return "asia";
  if (region === "Europe") return "europe";
  if (region === "Oceania") return "oceania";
  return "other";
}

function isoOf(properties) {
  const candidates = [properties.ISO_A3, properties.ISO_A3_EH, properties.ADM0_A3];
  const iso = candidates.find((value) => typeof value === "string" && /^[A-Z]{3}$/.test(value));
  return iso === undefined ? null : iso.toLowerCase();
}

function insideRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

const countries = JSON.parse(readFileSync(CACHE, "utf8"))
  .features.map((feature) => ({
    iso: isoOf(feature.properties),
    name: feature.properties.NAME,
    region: regionOf(feature.properties),
    polygons: polygonsOf(feature.geometry),
  }))
  .filter((country) => country.iso !== null)
  .sort((left, right) => (left.iso < right.iso ? -1 : left.iso > right.iso ? 1 : 0));

function containing(x, y) {
  for (const country of countries) {
    for (const polygon of country.polygons) {
      if (!insideRing(x, y, polygon[0])) continue;
      if (polygon.slice(1).some((hole) => insideRing(x, y, hole))) continue;
      return country;
    }
  }
  return null;
}

function nearest(x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const country of countries) {
    for (const polygon of country.polygons) {
      for (const [px, py] of polygon[0]) {
        const distance = (px - x) ** 2 + (py - y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = country;
        }
      }
    }
  }
  return { country: best, distanceDegrees: Math.sqrt(bestDistance) };
}

/** Province rings are delta-encoded in thousandths of a degree. */
function decodeRing(encoded) {
  const points = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index + 1 < encoded.length; index += 2) {
    x += encoded[index];
    y += encoded[index + 1];
    points.push([x / 1000, y / 1000]);
  }
  return points;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

function ringCentroid(ring) {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    area += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (area === 0) return ring[0];
  return [cx / (3 * area), cy / (3 * area)];
}

/**
 * The province's own point: its label when the label lies inside one of its rings
 * (some labels are off-map placeholders), otherwise the centroid of its largest ring,
 * otherwise that ring's first vertex.
 */
function provincePoint(province) {
  const rings = (province.rings ?? []).map(decodeRing).filter((ring) => ring.length >= 3);
  const [lx, ly] = province.label;
  if (rings.some((ring) => insideRing(lx, ly, ring))) return { point: [lx, ly], source: "label" };
  if (rings.length === 0) return { point: [lx, ly], source: "label" };
  const largest = rings.reduce((best, ring) => (Math.abs(ringArea(ring)) > Math.abs(ringArea(best)) ? ring : best));
  const centroid = ringCentroid(largest);
  if (insideRing(centroid[0], centroid[1], largest)) return { point: centroid, source: "centroid" };
  return { point: largest[0], source: "vertex" };
}

const rows = [];
for (const file of PROVINCE_FILES) {
  for (const province of JSON.parse(readFileSync(join(MAP, file), "utf8")).provinces) {
    const { point, source } = provincePoint(province);
    const [x, y] = point;
    const found = containing(x, y);
    if (found !== null) {
      rows.push({ provinceId: province.id, key: province.key, iso3: found.iso, region: found.region, method: `${source}-in-country` });
    } else {
      const near = nearest(x, y);
      rows.push({
        provinceId: province.id,
        key: province.key,
        iso3: near.country.iso,
        region: near.country.region,
        method: `${source}-nearest-boundary`,
        distanceDegrees: Math.round(near.distanceDegrees * 1000) / 1000,
      });
    }
  }
}
rows.sort((left, right) => left.provinceId - right.provinceId);

const output = {
  meta: {
    description:
      "1900 province → modern country (ISO 3166-1 alpha-3, lower case) and UN continental region under the province label point. P4 input (D-142).",
    source: "Natural Earth 1:10m Cultural Vectors, Admin 0 – Countries (public domain), cached by the M11 geometry build",
    method:
      "Point in polygon of the province's own point: its label when the label lies inside the province (some labels are off-map placeholders), otherwise the centroid of its largest ring (or that ring's first vertex). A point outside every country takes the country of the nearest boundary vertex (method *-nearest-boundary).",
    provinces: rows.length,
    nearestBoundary: rows.filter((row) => row.method.endsWith("nearest-boundary")).length,
  },
  provinces: rows,
};
const text = `${JSON.stringify(output, null, 1)}\n`;
if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error(`${OUT} is stale; run node scripts/p4/build-province-crosswalk.mjs`);
    process.exit(1);
  }
  console.log("province crosswalk is current");
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${rows.length} provinces, ${output.meta.nearestBoundary} by nearest boundary`);
}
