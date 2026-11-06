#!/usr/bin/env node
/**
 * P5 (D-121, D-143 §4): USGS MRDS metal-deposit records by 1900 province.
 *
 * Input (not committed; downloaded on demand):
 *   .cache-p5/mrds/mrds.csv   USGS Mineral Resources Data System, CSV release
 *                             (https://mrdata.usgs.gov/mrds/mrds-csv.zip, 25.8 MB;
 *                             public domain, "Use_Constraints: none" in mrds.met).
 *   Fetch: curl -o .cache-p5/mrds/mrds-csv.zip https://mrdata.usgs.gov/mrds/mrds-csv.zip
 *          && unzip it in .cache-p5/mrds/
 *   packages/data/data/map/provinces_*.json   1900 province polygons (committed)
 *
 * Output (committed): packages/data/data/historical/p5/mrds_province_1900.json
 *   Per (province, resource): MRDS sites whose primary commodity is the resource,
 *   by reported production size (L, M, S, Y = producer of unknown size), how many
 *   produced or were discovered by 1900, and the earliest year reported. Iron, copper,
 *   bauxite (aluminum), tin, gold, silver and uranium only: MRDS has almost no coal,
 *   oil, gas or nitrate records (68, 16 and 107 world-wide), which come from the
 *   authored table instead.
 *
 * A site is placed in the province whose polygon contains it; a site outside every
 * polygon (coast, small island) goes to the nearest province label within 0.5°, or
 * is reported unplaced. MRDS is about 85 % United States records, so site counts are
 * not comparable across countries; the build uses the size classes and the 1900
 * dates, never raw counts, for anything outside the United States.
 *
 * Usage: node scripts/p5/extract-mrds.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bboxOf, inMulti, toMultiPolygon } from "../p2/province-geometry-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const CSV = join(ROOT, ".cache-p5/mrds/mrds.csv");
const OUT = join(DATA, "historical/p5/mrds_province_1900.json");
const MAP_FILES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];

/** MRDS primary commodity name -> P5 resource. */
const COMMODITY = {
  Iron: "iron",
  Copper: "copper",
  Aluminum: "bauxite",
  Tin: "tin",
  Gold: "gold",
  Silver: "silver",
  Uranium: "uranium",
};

if (!existsSync(CSV)) {
  console.error(`missing ${CSV}; download https://mrdata.usgs.gov/mrds/mrds-csv.zip and unzip it there`);
  process.exit(1);
}

/** RFC 4180 CSV rows (quoted fields may hold commas, quotes and newlines). */
function* csvRows(text) {
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      yield row;
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}

const provinces = [];
for (const file of MAP_FILES) {
  for (const province of JSON.parse(readFileSync(join(DATA, "map", file), "utf8")).provinces) {
    const multi = toMultiPolygon(province);
    if (multi.length === 0) continue;
    // Labels are stored in degrees; rings in millidegrees (decoded by toMultiPolygon).
    provinces.push({ id: province.id, key: province.key, multi, bbox: bboxOf(multi), label: province.label ?? [0, 0] });
  }
}

function locate(lon, lat) {
  for (const province of provinces) {
    const [minX, minY, maxX, maxY] = province.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (inMulti([lon, lat], province.multi)) return { province, how: "inside" };
  }
  let best = null;
  let bestDistance = 0.5;
  for (const province of provinces) {
    const distance = Math.hypot(province.label[0] - lon, province.label[1] - lat);
    if (distance < bestDistance) {
      best = province;
      bestDistance = distance;
    }
  }
  return best === null ? null : { province: best, how: "nearest" };
}

const year = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 1000 && parsed < 2100 ? parsed : null;
};

const text = readFileSync(CSV, "utf8");
const rows = csvRows(text);
const header = rows.next().value;
const column = Object.fromEntries(header.map((name, index) => [name, index]));
const cells = new Map();
const counts = { records: 0, relevant: 0, placedInside: 0, placedNearest: 0, unplaced: 0 };
for (const row of rows) {
  if (row.length < header.length) continue;
  counts.records += 1;
  const primary = (row[column.commod1] ?? "")
    .split(",")
    .map((entry) => entry.trim().split("-")[0].trim())
    .filter((entry) => entry !== "");
  const resources = [...new Set(primary.map((entry) => COMMODITY[entry]).filter((entry) => entry !== undefined))];
  if (resources.length === 0) continue;
  counts.relevant += 1;
  const lat = Number(row[column.latitude]);
  const lon = Number(row[column.longitude]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    counts.unplaced += 1;
    continue;
  }
  const located = locate(lon, lat);
  if (located === null) {
    counts.unplaced += 1;
    continue;
  }
  if (located.how === "inside") counts.placedInside += 1;
  else counts.placedNearest += 1;
  const size = row[column.prod_size];
  const discovered = year(row[column.disc_yr]);
  const firstProduction = year(row[column.yr_fst_prd]);
  const earliest = [discovered, firstProduction].filter((value) => value !== null);
  const first = earliest.length === 0 ? null : Math.min(...earliest);
  for (const resource of resources) {
    const key = `${located.province.id}:${resource}`;
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = {
        provinceId: located.province.id,
        provinceKey: located.province.key,
        resource,
        sites: 0,
        sizeL: 0,
        sizeM: 0,
        sizeS: 0,
        producerUnknownSize: 0,
        datedSites: 0,
        knownBy1900: 0,
        earliestYear: null,
      };
      cells.set(key, cell);
    }
    cell.sites += 1;
    if (size === "L") cell.sizeL += 1;
    else if (size === "M") cell.sizeM += 1;
    else if (size === "S") cell.sizeS += 1;
    else if (size === "Y") cell.producerUnknownSize += 1;
    if (first !== null) {
      cell.datedSites += 1;
      if (first <= 1900) cell.knownBy1900 += 1;
      cell.earliestYear = cell.earliestYear === null ? first : Math.min(cell.earliestYear, first);
    }
  }
}

const out = {
  meta: {
    dataset: "USGS Mineral Resources Data System (MRDS), CSV release",
    url: "https://mrdata.usgs.gov/mrds/mrds-csv.zip",
    accessDate: new Date().toISOString().slice(0, 10),
    licence: "Public domain (USGS; mrds.met Use_Constraints: none)",
    generator: "scripts/p5/extract-mrds.mjs",
    commodities: COMMODITY,
    counts,
    limitations: [
      "About 85 % of MRDS records are in the United States; site counts are not comparable across countries.",
      "PROD_SIZE (S/M/L, or Y for a producer of unknown size) is a historical, inconsistent classification (mrds.met).",
      "Discovery and first-production years are reported for a minority of sites.",
    ],
  },
  cells: [...cells.values()].sort((left, right) => left.provinceId - right.provinceId || left.resource.localeCompare(right.resource)),
};
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(counts), "cells", out.cells.length);
