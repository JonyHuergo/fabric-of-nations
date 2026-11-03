#!/usr/bin/env node
/**
 * P2 (D-121): distribute 1900 population, urban population, cropland and pasture
 * over the permanent provinces using HYDE 3.3 grids.
 *
 * Input (not committed; place the files from the HYDE 3.3 release here):
 *   .cache-hyde/hyde-3.3/   any of the 1900 grids, found by name:
 *     population count   popc_1900AD.asc
 *     urban population   urbc_1900AD.asc
 *     cropland (km2)     cropland1900AD.asc
 *     pasture (km2)      pasture1900AD.asc (intensively used grazing land)
 *     grazing (km2)      grazing1900AD.asc (pasture plus rangeland)
 *     irrigated (km2)    tot_irri1900AD.asc
 *     land area (km2)    maxln_cr.asc (maximum land area per cell, general files)
 *   They come from original/hyde33_c7_base_mrt2023/zip/1900AD_pop.zip,
 *   1900AD_lu.zip and original/general_files.zip of the release.
 *
 * Output (committed): packages/data/data/map/province_geography_1900.json
 *   One record per province with the summed grid values over the cells whose
 *   centres fall inside it, plus an audit of cells no province covers.
 *
 * Method: each province's decoded rings are filled by an even-odd scanline at the
 * grid's row centres, so holes and multipolygons need no special case. A cell
 * claimed by two provinces goes to the smaller one (an enclave or island inside a
 * coarser outline), equal areas to the lower id, and is counted as an overlap.
 * A populated or farmed cell that no province covers (coastline simplification at
 * 0.02 degrees is coarser than the 5-minute grid) goes to the nearest covered cell
 * within NEAREST_RADIUS cells; anything farther is reported as unassigned.
 * Country totals are not taken from HYDE: the scenario builder uses these values
 * only as within-country shares of the authored totals (D-121 §1).
 *
 * Usage: node scripts/p2/build-province-geography.mjs [--check] [--input <dir>]
 */

import { createReadStream, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAP_DIR = join(ROOT, "packages/data/data/map");
const BUNDLES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];
const OUTPUT = join(MAP_DIR, "province_geography_1900.json");
const QUANTUM = 0.001;
const NEAREST_RADIUS = 3;
const LAYERS = [
  { key: "population", patterns: [/^popc_1900AD\.asc$/i] },
  { key: "urbanPopulation", patterns: [/^urbc_1900AD\.asc$/i] },
  { key: "croplandKm2", patterns: [/^cropland1900AD\.asc$/i] },
  { key: "pastureKm2", patterns: [/^pasture1900AD\.asc$/i] },
  { key: "grazingKm2", patterns: [/^grazing1900AD\.asc$/i] },
  { key: "irrigatedKm2", patterns: [/^tot_irri1900AD\.asc$/i] },
  { key: "landAreaKm2", patterns: [/^maxln_cr\.asc$/i] },
];
/** HYDE headers print the 5-arc-minute cell size rounded to 0.0833333. */
const FIVE_ARC_MINUTES = 1 / 12;

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const inputIndex = argv.indexOf("--input");
const INPUT =
  inputIndex >= 0 && argv[inputIndex + 1] !== undefined
    ? resolve(argv[inputIndex + 1])
    : join(ROOT, ".cache-hyde/hyde-3.3");

function fail(message) {
  console.error(`province geography: ${message}`);
  process.exit(1);
}

if (checkOnly) {
  // The check is structural: the committed file must exist and cover every province.
  if (!existsSync(OUTPUT)) fail(`missing ${OUTPUT}; run without --check after placing the HYDE grids`);
  const committed = JSON.parse(readFileSync(OUTPUT, "utf8"));
  const ids = new Set(committed.provinces.map((record) => record.id));
  for (const file of BUNDLES) {
    for (const province of JSON.parse(readFileSync(join(MAP_DIR, file), "utf8")).provinces) {
      if (!ids.has(province.id)) fail(`province ${province.id} (${province.key}) has no geography record`);
    }
  }
  console.log(`province geography is complete: ${ids.size} provinces`);
  process.exit(0);
}

if (!existsSync(INPUT)) fail(`input folder ${INPUT} does not exist; place the HYDE 3.3 1900 grids there`);
const inputFiles = readdirSync(INPUT);
const layerFiles = LAYERS.map((layer) => {
  for (const pattern of layer.patterns) {
    const found = inputFiles.find((name) => pattern.test(name));
    if (found !== undefined) return { ...layer, file: join(INPUT, found), name: found };
  }
  return fail(`no ${layer.key} grid in ${INPUT} (expected ${layer.patterns.map(String).join(" or ")})`);
});

/** Read an ESRI ASCII grid into a Float32Array, row 0 = northernmost. */
async function readAsciiGrid(path) {
  const header = {};
  let values = null;
  let index = 0;
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (values === null) {
      const [key, value] = line.trim().split(/\s+/);
      if (key !== undefined && /^[a-z_]+$/i.test(key)) {
        header[key.toLowerCase()] = Number(value);
        if (header.ncols !== undefined && header.nrows !== undefined && Object.keys(header).length >= 6) {
          values = new Float32Array(header.ncols * header.nrows);
        }
        continue;
      }
      fail(`${path}: incomplete header`);
    }
    for (const token of line.trim().split(/\s+/)) {
      if (token === "") continue;
      const number = Number(token);
      values[index] = number === header.nodata_value || !Number.isFinite(number) ? 0 : Math.max(0, number);
      index += 1;
    }
  }
  if (values === null || index !== values.length) fail(`${path}: expected ${values?.length} values, read ${index}`);
  const cellsize =
    Math.abs(header.cellsize - FIVE_ARC_MINUTES) < 1e-6 ? FIVE_ARC_MINUTES : header.cellsize;
  const xll = header.xllcorner ?? header.xllcenter - cellsize / 2;
  const yll = header.yllcorner ?? header.yllcenter - cellsize / 2;
  return { ncols: header.ncols, nrows: header.nrows, cellsize, xll, yll, values };
}

function decodeRings(province) {
  return province.rings.map((ring) => {
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
  });
}

const provinces = BUNDLES.flatMap((file) => JSON.parse(readFileSync(join(MAP_DIR, file), "utf8")).provinces)
  .map((province) => ({
    id: province.id,
    key: province.key,
    owner: province.initialOwnerPolityId,
    area: province.area,
    rings: decodeRings(province),
  }))
  .sort((left, right) => left.id - right.id);

const grids = [];
for (const layer of layerFiles) {
  console.log(`reading ${layer.name}`);
  grids.push(await readAsciiGrid(layer.file));
}
const grid = grids[0];
for (const other of grids) {
  if (other.ncols !== grid.ncols || other.nrows !== grid.nrows || other.cellsize !== grid.cellsize) {
    fail("the grids do not share one geometry");
  }
}
const { ncols, nrows, cellsize, xll, yll } = grid;
const yTop = yll + nrows * cellsize;

// Scanline fill: owner[cell] = province index, -1 when uncovered.
const owner = new Int32Array(ncols * nrows).fill(-1);
let overlapCells = 0;
let crossOwnerOverlapCells = 0;
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
        if (current === -1) {
          owner[cell] = provinceIndex;
        } else {
          overlapCells += 1;
          if (provinces[current].owner !== province.owner) crossOwnerOverlapCells += 1;
          // The smaller province is the more specific one (an enclave, island or city
          // inside a coarser outline); equal areas keep the lower id.
          if (province.area < provinces[current].area) owner[cell] = provinceIndex;
        }
      }
    }
  }
});

const totals = provinces.map(() => ({ cells: 0, sums: LAYERS.map(() => 0) }));
const unassigned = LAYERS.map(() => 0);
const reassigned = LAYERS.map(() => 0);
const world = LAYERS.map(() => 0);
for (let cell = 0; cell < owner.length; cell += 1) {
  let any = false;
  for (let layer = 0; layer < grids.length; layer += 1) {
    const value = grids[layer].values[cell];
    world[layer] += value;
    if (value > 0) any = true;
  }
  let target = owner[cell];
  let moved = false;
  if (target === -1 && any) {
    const row = Math.floor(cell / ncols);
    const col = cell % ncols;
    let best = -1;
    let bestDistance = Infinity;
    for (let dr = -NEAREST_RADIUS; dr <= NEAREST_RADIUS; dr += 1) {
      for (let dc = -NEAREST_RADIUS; dc <= NEAREST_RADIUS; dc += 1) {
        const r = row + dr;
        const c = (col + dc + ncols) % ncols;
        if (r < 0 || r >= nrows) continue;
        const candidate = owner[r * ncols + c];
        const distance = dr * dr + dc * dc;
        if (candidate !== -1 && (distance < bestDistance || (distance === bestDistance && candidate < best))) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }
    target = best;
    moved = best !== -1;
  }
  if (target === -1) {
    for (let layer = 0; layer < grids.length; layer += 1) unassigned[layer] += grids[layer].values[cell];
    continue;
  }
  if (owner[cell] !== -1) totals[target].cells += 1;
  for (let layer = 0; layer < grids.length; layer += 1) {
    const value = grids[layer].values[cell];
    totals[target].sums[layer] += value;
    if (moved) reassigned[layer] += value;
  }
}

const round = (value, digits) => Number(value.toFixed(digits));
const output = {
  meta: {
    dataset: "HYDE 3.3 (History Database of the Global Environment), 1900 AD grids",
    publisher: "Utrecht University / PBL Netherlands Environmental Assessment Agency",
    doi: "10.24416/UU01-94FNH0",
    citation: "Klein Goldewijk, K. (2023). History Database of the Global Environment 3.3. Utrecht University.",
    licence: "CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/), per the HYDE 3.3 readme",
    scenario: "hyde33_c7_base_mrt2023 (baseline estimate)",
    accessed: "2026-11-02",
    inputFiles: layerFiles.map((layer) => layer.name),
    grid: { ncols, nrows, cellsizeDegrees: cellsize, xllcorner: xll, yllcorner: yll },
    method:
      "even-odd scanline fill of decoded province rings at row centres; an overlapping cell goes to the smaller province (lower id on equal area); uncovered non-empty cells go to the nearest covered cell within 3 cells",
    use: "within-country shares only; country totals remain the authored OWID/Maddison values (D-121)",
    generatedBy: "scripts/p2/build-province-geography.mjs",
  },
  audit: {
    provinces: provinces.length,
    overlapCells,
    crossOwnerOverlapCells,
    worldTotals: Object.fromEntries(LAYERS.map((layer, index) => [layer.key, round(world[index], 1)])),
    reassignedToNearest: Object.fromEntries(LAYERS.map((layer, index) => [layer.key, round(reassigned[index], 1)])),
    unassigned: Object.fromEntries(LAYERS.map((layer, index) => [layer.key, round(unassigned[index], 1)])),
    emptyProvinces: totals.filter((total) => total.sums.every((value) => value === 0)).length,
  },
  provinces: provinces.map((province, index) => ({
    id: province.id,
    key: province.key,
    ownerPolityId: province.owner,
    cells: totals[index].cells,
    ...Object.fromEntries(LAYERS.map((layer, layerIndex) => [layer.key, round(totals[index].sums[layerIndex], 3)])),
  })),
};
writeFileSync(OUTPUT, `${JSON.stringify(output, null, 1)}\n`);
console.log(`wrote ${OUTPUT}`);
console.log(JSON.stringify(output.audit, null, 2));
