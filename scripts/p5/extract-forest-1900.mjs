#!/usr/bin/env node
/**
 * P5 (D-121, D-143 §4): 1900 forest area by province, for standing-timber deposits.
 *
 * Inputs (not committed; downloaded on demand into git-ignored caches):
 *   .cache-p5/sage/glpotveg_5min.asc   SAGE global potential vegetation, 5 arc-min
 *       (Ramankutty & Foley 1999, Global Biogeochemical Cycles 13(4):997-1027;
 *       https://sage-public-files.s3.amazonaws.com/global-potential-vegetation/glpotveg_5min.asc.gz,
 *       0.5 MB). No licence is stated on the distribution page; used with attribution.
 *   .cache-hyde/hyde-3.3/{maxln_cr,cropland1900AD,grazing1900AD}.asc   HYDE 3.3 (P2 cache)
 *   packages/data/data/map/provinces_*.json   1900 province polygons (committed)
 *
 * Method, per 5-arc-minute cell (both grids share one geometry):
 *   forest 1900 (km²) = max(0, land − cropland 1900 − grazing land 1900)
 *                       when the potential vegetation is a forest or woodland biome
 *                       (classes 1-8), else 0.
 * That is, the natural forest biome less the land HYDE says was farmed or grazed in
 * 1900. Cells go to provinces by the same scanline fill as the P2 HYDE allocation
 * (scripts/p2/build-province-geography.mjs): cell centres inside a polygon, the smaller
 * province winning an overlap. Forest is split into tropical (classes 1-2), temperate
 * (3-5, 8) and boreal (6-7) for growing stock per hectare.
 *
 * Output (committed): packages/data/data/historical/p5/forest_province_1900.json
 * Usage: node scripts/p5/extract-forest-1900.mjs
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const OUT = join(DATA, "historical/p5/forest_province_1900.json");
const QUANTUM = 1 / 1000;
const BUNDLES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];
const GRIDS = {
  potveg: join(ROOT, ".cache-p5/sage/glpotveg_5min.asc"),
  land: join(ROOT, ".cache-hyde/hyde-3.3/maxln_cr.asc"),
  cropland: join(ROOT, ".cache-hyde/hyde-3.3/cropland1900AD.asc"),
  grazing: join(ROOT, ".cache-hyde/hyde-3.3/grazing1900AD.asc"),
};
for (const [name, path] of Object.entries(GRIDS)) {
  if (!existsSync(path)) {
    console.error(`missing ${name} grid ${path}`);
    process.exit(1);
  }
}

async function readGrid(path) {
  const header = {};
  let values = null;
  let index = 0;
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (values === null) {
      const [key, value] = line.trim().split(/\s+/);
      header[key.toLowerCase()] = Number(value);
      if (Object.keys(header).length >= 6) values = new Float32Array(header.ncols * header.nrows);
      continue;
    }
    for (const token of line.trim().split(/\s+/)) {
      if (token === "") continue;
      const number = Number(token);
      values[index] = number === header.nodata_value || !Number.isFinite(number) ? 0 : Math.max(0, number);
      index += 1;
    }
  }
  if (index !== values.length) throw new Error(`${path}: read ${index} of ${values.length} values`);
  return { ncols: header.ncols, nrows: header.nrows, xll: header.xllcorner, yll: header.yllcorner, values };
}

const grids = {};
for (const [name, path] of Object.entries(GRIDS)) grids[name] = await readGrid(path);
const { ncols, nrows } = grids.land;
for (const grid of Object.values(grids)) {
  if (grid.ncols !== ncols || grid.nrows !== nrows) throw new Error("grids differ in geometry");
}
const cellsize = 1 / 12;
const xll = -180;
const yTop = 90;

const provinces = BUNDLES.flatMap((file) => JSON.parse(readFileSync(join(DATA, "map", file), "utf8")).provinces)
  .map((province) => ({
    id: province.id,
    key: province.key,
    area: province.area,
    rings: province.rings.map((ring) => {
      const out = new Float64Array(ring.length);
      let x = 0;
      let y = 0;
      for (let index = 0; index < ring.length; index += 2) {
        x += ring[index];
        y += ring[index + 1];
        out[index] = x * QUANTUM;
        out[index + 1] = y * QUANTUM;
      }
      return out;
    }),
  }))
  .sort((left, right) => left.id - right.id);

const owner = new Int32Array(ncols * nrows).fill(-1);
provinces.forEach((province, provinceIndex) => {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of province.rings) {
    for (let index = 1; index < ring.length; index += 2) {
      minY = Math.min(minY, ring[index]);
      maxY = Math.max(maxY, ring[index]);
    }
  }
  const firstRow = Math.max(0, Math.floor((yTop - maxY) / cellsize));
  const lastRow = Math.min(nrows - 1, Math.floor((yTop - minY) / cellsize));
  for (let row = firstRow; row <= lastRow; row += 1) {
    const yc = yTop - (row + 0.5) * cellsize;
    const crossings = [];
    for (const ring of province.rings) {
      const count = ring.length / 2;
      for (let index = 0; index < count; index += 1) {
        const x1 = ring[index * 2];
        const y1 = ring[index * 2 + 1];
        const next = (index + 1) % count;
        const x2 = ring[next * 2];
        const y2 = ring[next * 2 + 1];
        if ((y1 > yc) !== (y2 > yc)) crossings.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    crossings.sort((left, right) => left - right);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const firstCol = Math.max(0, Math.ceil((crossings[pair] - xll) / cellsize - 0.5));
      const lastCol = Math.min(ncols - 1, Math.floor((crossings[pair + 1] - xll) / cellsize - 0.5));
      for (let col = firstCol; col <= lastCol; col += 1) {
        const cell = row * ncols + col;
        const current = owner[cell];
        if (current === -1 || province.area < provinces[current].area) owner[cell] = provinceIndex;
      }
    }
  }
});

const BIOME = (vegetation) =>
  vegetation === 1 || vegetation === 2
    ? "tropical"
    : vegetation === 6 || vegetation === 7
      ? "boreal"
      : vegetation >= 3 && vegetation <= 8
        ? "temperate"
        : null;
const totals = provinces.map(() => ({ tropical: 0, temperate: 0, boreal: 0 }));
let worldForest = 0;
let unassigned = 0;
for (let cell = 0; cell < owner.length; cell += 1) {
  const biome = BIOME(Math.round(grids.potveg.values[cell]));
  if (biome === null) continue;
  const forest = Math.max(0, grids.land.values[cell] - grids.cropland.values[cell] - grids.grazing.values[cell]);
  if (!(forest > 0)) continue;
  worldForest += forest;
  if (owner[cell] === -1) {
    unassigned += forest;
    continue;
  }
  totals[owner[cell]][biome] += forest;
}

const round = (value) => Math.round(value * 10) / 10;
const out = {
  meta: {
    generator: "scripts/p5/extract-forest-1900.mjs",
    accessDate: new Date().toISOString().slice(0, 10),
    sources: [
      {
        id: "sage-potential-vegetation",
        title: "SAGE Global Potential Vegetation, 5 arc-minute (Ramankutty & Foley 1999)",
        url: "https://sage.nelson.wisc.edu/data-and-models/datasets/global-potential-vegetation-dataset",
        licence: "No licence stated on the distribution page (University of Wisconsin); used with attribution. Designer to confirm before release.",
      },
      { id: "hyde-3.3", title: "HYDE 3.3 1900 land area, cropland and grazing land", licence: "CC BY 3.0" },
    ],
    method: "forest = max(0, land - cropland - grazing) in cells whose potential vegetation is a forest or woodland biome (SAGE classes 1-8)",
    unit: "km²",
    worldForestKm2: Math.round(worldForest),
    unassignedForestKm2: Math.round(unassigned),
  },
  provinces: provinces
    .map((province, index) => ({
      provinceId: province.id,
      key: province.key,
      tropicalKm2: round(totals[index].tropical),
      temperateKm2: round(totals[index].temperate),
      borealKm2: round(totals[index].boreal),
    }))
    .filter((row) => row.tropicalKm2 + row.temperateKm2 + row.borealKm2 > 0),
};
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`world forest ${Math.round(worldForest / 1e6 * 10) / 10} M km², unassigned ${Math.round(unassigned)} km², provinces ${out.provinces.length}`);
