#!/usr/bin/env node
/**
 * P2 province geometry repair (D-128).
 *
 * The M12 province bundles have three geometry defects that distort both the map and
 * the HYDE allocation (docs/PROVINCE_GEOGRAPHY.md):
 *
 * 1. Greenland exists twice: `grl-greenland` in the European bundle duplicates the
 *    American bundle's North and South Greenland. The European duplicate is removed.
 * 2. Three small provinces were simplified at 0.02 degrees into slivers whose area went
 *    to their neighbours: Goa, Macao and Monaco. Their outlines are restored from the
 *    same Natural Earth 1:10m units the M12 build used, kept at full 0.001-degree
 *    quantisation, and removed from every province they overlap. (Western Macedonia is
 *    a sliver on purpose: only that strip was Greek in 1900; the rest was Ottoman.)
 * 3. Overlaps between provinces. Every overlapping pair found on a 5-arc-minute raster
 *    probe is resolved by subtracting the smaller province from the larger one, so the
 *    more specific outline (an enclave, island, city or corrected sliver) keeps the
 *    shared area and no gap is created.
 *
 * Areas, bounding boxes and, where needed, label points are recomputed for every
 * changed province. Province ids, keys, ownership and metadata are unchanged.
 *
 * Inputs: the five bundles in packages/data/data/map and the cached Natural Earth files
 * in .cache-m11 (ne_10m_admin_1_states_provinces.geojson, ne_10m_admin_0_countries.geojson).
 *
 * Usage: node --max-old-space-size=8192 scripts/p2/repair-provinces.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import polygonClipping from "polygon-clipping";
import {
  bboxOf,
  inMulti,
  multiArea,
  refresh,
  toMultiPolygon,
} from "./province-geometry-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAP_DIR = join(ROOT, "packages/data/data/map");
const BUNDLES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];
const DUPLICATES = ["grl-greenland"];
const RESTORE = [
  { key: "as-bin-goa", layer: "admin1", match: (p) => p.adm0_a3 === "IND" && /^goa$/i.test(p.name) },
  { key: "as-mac-macao", layer: "admin0", match: (p) => p.ADM0_A3 === "MAC" },
  { key: "mco-monaco", layer: "admin0", match: (p) => p.ADM0_A3 === "MCO" },
];
const CELL = 1 / 12;

// ---- load -------------------------------------------------------------------------

const bundles = BUNDLES.map((file) => ({ file, data: JSON.parse(readFileSync(join(MAP_DIR, file), "utf8")) }));
const all = bundles.flatMap(({ data }) => data.provinces);
const byKey = new Map(all.map((province) => [province.key, province]));
const report = { removed: [], restored: [], subtracted: [] };

// 1. Duplicates.
for (const key of DUPLICATES) {
  const province = byKey.get(key);
  if (province === undefined) throw new Error(`missing duplicate ${key}`);
  for (const bundle of bundles) {
    const before = bundle.data.provinces.length;
    bundle.data.provinces = bundle.data.provinces.filter((candidate) => candidate.id !== province.id);
    if (bundle.data.provinces.length !== before) {
      bundle.data.borders = bundle.data.borders.filter((border) => border.a !== province.id && border.b !== province.id);
      if (bundle.data.meta?.provinceCount !== undefined) bundle.data.meta.provinceCount = bundle.data.provinces.length;
    }
  }
  byKey.delete(key);
  report.removed.push({ key, id: province.id });
}
const provinces = bundles.flatMap(({ data }) => data.provinces);
const geometry = new Map(provinces.map((province) => [province.id, toMultiPolygon(province)]));

// 2. Restore slivers from Natural Earth.
const admin1 = JSON.parse(readFileSync(join(ROOT, ".cache-m11/ne_10m_admin_1_states_provinces.geojson"), "utf8"));
const admin0 = JSON.parse(readFileSync(join(ROOT, ".cache-m11/ne_10m_admin_0_countries.geojson"), "utf8"));
const restoredIds = new Set();
for (const entry of RESTORE) {
  const province = byKey.get(entry.key);
  if (province === undefined) throw new Error(`missing province ${entry.key}`);
  const source = (entry.layer === "admin1" ? admin1 : admin0).features.filter((feature) => entry.match(feature.properties));
  if (source.length === 0) throw new Error(`no Natural Earth unit for ${entry.key}`);
  let multi = [];
  for (const feature of source) {
    const parts = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    multi = multi.length === 0 ? parts : polygonClipping.union(multi, parts);
  }
  const before = province.area;
  geometry.set(province.id, multi);
  refresh(province, multi);
  restoredIds.add(province.id);
  report.restored.push({ key: entry.key, areaBefore: before, areaAfter: province.area, sourceUnits: source.length });
}

// 3. Overlaps, found by a raster probe at grid cell centres.
// Even-odd scanline fill of every province on the global 5-arc-minute grid; a cell
// filled by two provinces marks the pair. Restored small units are paired with their
// neighbours by bounding box below instead, since they can be smaller than a cell.
const NCOLS = 4320;
const NROWS = 2160;
const cellOwner = new Int32Array(NCOLS * NROWS).fill(-1);
const pairs = new Map();
for (const province of provinces) {
  const multi = geometry.get(province.id);
  const rings = multi.flat();
  const [, minY, , maxY] = bboxOf(multi);
  const firstRow = Math.max(0, Math.floor((90 - maxY) / CELL));
  const lastRow = Math.min(NROWS - 1, Math.floor((90 - minY) / CELL));
  for (let row = firstRow; row <= lastRow; row += 1) {
    const yc = 90 - (row + 0.5) * CELL;
    const crossings = [];
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        if (y1 > yc !== y2 > yc) crossings.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    crossings.sort((left, right) => left - right);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const firstCol = Math.max(0, Math.ceil((crossings[k] + 180) / CELL - 0.5));
      const lastCol = Math.min(NCOLS - 1, Math.floor((crossings[k + 1] + 180) / CELL - 0.5));
      for (let col = firstCol; col <= lastCol; col += 1) {
        const cell = row * NCOLS + col;
        const other = cellOwner[cell];
        if (other === -1) cellOwner[cell] = province.id;
        else if (other !== province.id) {
          const pair = other < province.id ? `${other}:${province.id}` : `${province.id}:${other}`;
          pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
        }
      }
    }
  }
}
const byId = new Map(provinces.map((province) => [province.id, province]));
// Restored units also take their area back from any neighbour whose box they touch.
for (const id of restoredIds) {
  const [minX, minY, maxX, maxY] = bboxOf(geometry.get(id));
  for (const other of provinces) {
    if (other.id === id) continue;
    const [ox0, oy0, ox1, oy1] = bboxOf(geometry.get(other.id));
    if (ox0 > maxX || ox1 < minX || oy0 > maxY || oy1 < minY) continue;
    const pair = other.id < id ? `${other.id}:${id}` : `${id}:${other.id}`;
    if (!pairs.has(pair)) pairs.set(pair, 0);
  }
}
for (const pair of [...pairs.keys()].sort()) {
  const [idA, idB] = pair.split(":").map(Number);
  const a = byId.get(idA);
  const b = byId.get(idB);
  // Coverage residuals are gap fillers, so they always yield; then a restored unit
  // keeps its outline; otherwise the smaller (more specific) province does.
  const isResidual = (province) => province.residual === true || province.key.startsWith("oc-gap-");
  let smaller;
  if (isResidual(a) !== isResidual(b)) smaller = isResidual(a) ? b : a;
  else if (restoredIds.has(a.id) !== restoredIds.has(b.id)) smaller = restoredIds.has(a.id) ? a : b;
  else smaller = a.area < b.area ? a : b;
  const larger = smaller === a ? b : a;
  const before = multiArea(geometry.get(larger.id));
  let result;
  let method = "difference";
  try {
    result = polygonClipping.difference(geometry.get(larger.id), geometry.get(smaller.id));
  } catch {
    // Large residual multipolygons can defeat the sweep line as a whole. Retry polygon
    // by polygon; a polygon that still fails is dropped if it lies inside the smaller
    // province (a duplicate copy) and otherwise kept unchanged.
    method = "per-polygon";
    const small = geometry.get(smaller.id);
    const [sx0, sy0, sx1, sy1] = bboxOf(small);
    result = [];
    for (const polygon of geometry.get(larger.id)) {
      const [px0, py0, px1, py1] = bboxOf([polygon]);
      if (px0 > sx1 || px1 < sx0 || py0 > sy1 || py1 < sy0) {
        result.push(polygon);
        continue;
      }
      try {
        result.push(...polygonClipping.difference([polygon], small));
      } catch {
        if (!inMulti(polygon[0][0], small)) result.push(polygon);
      }
    }
  }
  const after = multiArea(result);
  if (result.length === 0) {
    report.subtracted.push({ larger: larger.key, smaller: smaller.key, skipped: "would remove the whole province" });
    continue;
  }
  if (before - after < 1e-9) continue;
  geometry.set(larger.id, result);
  refresh(larger, result);
  report.subtracted.push({
    larger: larger.key,
    smaller: smaller.key,
    removedSqDeg: Number((before - after).toFixed(4)),
    method,
  });
}

for (const { file, data } of bundles) writeFileSync(join(MAP_DIR, file), JSON.stringify(data));
writeFileSync(join(MAP_DIR, "province_repair_report.json"), `${JSON.stringify(report, null, 1)}\n`);
console.log(
  `removed ${report.removed.length}, restored ${report.restored.length}, subtracted ${report.subtracted.filter((entry) => entry.removedSqDeg !== undefined).length} overlaps`,
);
console.log(JSON.stringify(report.restored, null, 1));
console.log(JSON.stringify(report.subtracted.filter((entry) => entry.removedSqDeg === undefined || entry.removedSqDeg > 0.05), null, 1));
