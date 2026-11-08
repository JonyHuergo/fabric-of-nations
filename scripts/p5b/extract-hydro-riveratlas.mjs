#!/usr/bin/env node
/**
 * P5b (C-12, D-146 A8, D-148): gross theoretical hydropower potential by 1900 province.
 *
 * Input (not committed; downloaded by hand into a git-ignored cache, because figshare
 * refuses scripted downloads):
 *   .cache-p5b/riveratlas/RiverATLAS_v10_shp/RiverATLAS_v10_{region}.{shp,dbf}
 *       HydroSHEDS RiverATLAS v1.0 (Linke, S., Lehner, B. et al. 2019, "Global
 *       hydro-environmental sub-basin and river reach characteristics at high spatial
 *       resolution", Scientific Data 6: 283, doi:10.1038/s41597-019-0300-6), shapefile
 *       release https://figshare.com/ndownloader/files/20087486 (RiverATLAS_Data_v10_shp.zip,
 *       2,418,581,202 bytes), linked from https://www.hydrosheds.org/hydroatlas.
 *       Licence: Creative Commons Attribution 4.0 International (CC BY 4.0), for the
 *       database and for both attributes used here.
 *       Unpack: tar -xf RiverATLAS_Data_v10_shp.zip "RiverATLAS_v10_shp/*.dbf" "RiverATLAS_v10_shp/*.shp"
 *   packages/data/data/map/provinces_*.json   1900 province polygons (committed)
 *
 * Attributes (RiverATLAS Catalog v1.0; HydroRIVERS fields): `HYRIV_ID` and `NEXT_DOWN`
 * (the downstream reach; ids are a region base + the record number); `dis_m3_pyr`,
 * natural discharge, long-term (1971-2000) annual average at the reach's pour point, m³/s
 * (WaterGAP 2.2, Döll et al. 2003, downscaled to the 15-arc-second network); `ele_mt_cmn`,
 * minimum elevation of the reach's catchment, m (EarthEnv-DEM90, Robinson et al. 2014),
 * i.e. the elevation of the reach's outlet; `sgr_dk_rav`, stream gradient along the
 * reach, decimetres per km (EarthEnv-DEM90; -9999 = no data, all of Greenland);
 * `LENGTH_KM`, reach length, km.
 *
 * Method, per river reach r (gross theoretical potential at mean flow, MWh/year):
 *   into its downstream reach d: 1000 kg/m³ x 9.81 m/s² x Q_r x (ele_cmn(r) - ele_cmn(d))
 *                                x 8,765.82 h / 10^6
 *   a headwater reach (nothing flows into it) adds its own fall at half its outlet flow:
 *                                1000 x 9.81 x Q_r/2 x sgr_dk_rav/10 x LENGTH_KM x 8,765.82 / 10^6
 * where ele_cmn is first made non-increasing downstream (each outlet at least as high as
 * the next outlet down; a DEM pit is lifted to it). Outlet-to-outlet drops then add up
 * along a river to its true fall, so DEM noise cancels instead of accumulating. Two
 * rejected forms: every reach's own gradient x length (15.8 PWh/year for the Arctic region
 * alone) and unconditioned drops clamped at zero (93 PWh/year world-wide; 2.9 PWh/year in
 * the flat Tobolsk province, against roughly 0.16 for the whole Ob-Irtysh fall). Water
 * is credited with the fall of the reach it enters, at the flow it brings (that reach's
 * own local inflow is left out, a small underestimate). A reach goes to the province whose
 * polygon contains its middle vertex (the smaller province on an overlap); a reach outside
 * every polygon (coast, small island) goes to the nearest province label within 0.5°, or
 * is reported unplaced. Missing elevations or gradients and negative discharges are
 * counted and skipped.
 * The simulation turns the gross potential into a cap with HYDRO_TECHNICAL_SHARE.
 *
 * Output (committed): packages/data/data/historical/p5b/hydro_province_1900.json
 * Usage: node scripts/p5b/extract-hydro-riveratlas.mjs [--check]
 */
import { existsSync, openSync, readFileSync, readSync, closeSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bboxOf, inMulti, multiArea, toMultiPolygon } from "../p2/province-geometry-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/data/data");
const CACHE = join(ROOT, ".cache-p5b/riveratlas/RiverATLAS_v10_shp");
const OUT = join(DATA, "historical/p5b/hydro_province_1900.json");
const CHECK = process.argv.includes("--check");
/**
 * River networks, as files. Greenland (`gr`) is left out: RiverATLAS gives it no gradient
 * because the DEM has large outliers over the ice sheet, and its catchment elevations
 * carry the same outliers.
 */
const NETWORKS = [["af"], ["ar"], ["as"], ["au"], ["eu"], ["na"], ["sa_north", "sa_south"], ["si"]];
const REGIONS = NETWORKS.flat();
const MAP_FILES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];
/** Water density, kg/m³. */
const RHO = 1000;
/** Standard gravity, m/s². */
const G = 9.81;
/** Hours in the mean Gregorian year (365.2425 d; the simulation's HYDRO_DAYS_PER_YEAR). */
const HOURS_PER_YEAR = 365.2425 * 24;
/** Nearest-label fallback radius, degrees (as the MRDS extraction). */
const NEAREST_DEG = 0.5;
const NO_DATA = -9999;
/** Elevations at or below this are missing (-9999 in RiverATLAS). */
const ELEVATION_NO_DATA = -9000;

if (CHECK && !existsSync(join(CACHE, `RiverATLAS_v10_${REGIONS[0]}.dbf`))) {
  // The committed table is the output; without the cache --check can only confirm it parses.
  const table = JSON.parse(readFileSync(OUT, "utf8"));
  if (!Array.isArray(table.provinces)) throw new Error(`${OUT} has no provinces`);
  console.log(`hydro table present (${table.provinces.length} provinces); RiverATLAS cache absent, not recomputed`);
  process.exit(0);
}
for (const region of REGIONS) {
  for (const ext of ["dbf", "shp"]) {
    const path = join(CACHE, `RiverATLAS_v10_${region}.${ext}`);
    if (!existsSync(path)) {
      console.error(`missing ${path}; see the header of this script for the download`);
      process.exit(1);
    }
  }
}

// ---- provinces and a 1-degree grid index -------------------------------------------------
const provinces = [];
for (const file of MAP_FILES) {
  for (const province of JSON.parse(readFileSync(join(DATA, "map", file), "utf8")).provinces) {
    const multi = toMultiPolygon(province);
    if (multi.length === 0) continue;
    provinces.push({
      id: province.id,
      key: province.key,
      multi,
      bbox: bboxOf(multi),
      area: multiArea(multi),
      label: province.label ?? [0, 0],
    });
  }
}
provinces.sort((left, right) => left.id - right.id);
provinces.forEach((province, index) => {
  province.index = index;
});
const cellKey = (x, y) => (Math.floor(y) + 90) * 360 + (Math.floor(x) + 180);
const grid = new Map();
for (const province of provinces) {
  const [minX, minY, maxX, maxY] = province.bbox;
  for (let y = Math.floor(minY); y <= Math.floor(maxY); y += 1) {
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x += 1) {
      const key = cellKey(x, y);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(province);
    }
  }
}
// Smaller provinces first, so the first containing polygon is the smaller on an overlap.
for (const list of grid.values()) list.sort((left, right) => left.area - right.area || left.id - right.id);

function locate(lon, lat) {
  for (const province of grid.get(cellKey(lon, lat)) ?? []) {
    const [minX, minY, maxX, maxY] = province.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (inMulti([lon, lat], province.multi)) return { province, how: "inside" };
  }
  let best = null;
  let bestDistance = NEAREST_DEG;
  for (let y = Math.floor(lat - NEAREST_DEG); y <= Math.floor(lat + NEAREST_DEG); y += 1) {
    for (let x = Math.floor(lon - NEAREST_DEG); x <= Math.floor(lon + NEAREST_DEG); x += 1) {
      for (const province of grid.get(cellKey(x, y)) ?? []) {
        const distance = Math.hypot(province.label[0] - lon, province.label[1] - lat);
        if (distance < bestDistance || (distance === bestDistance && best !== null && province.id < best.id)) {
          best = province;
          bestDistance = distance;
        }
      }
    }
  }
  return best === null ? null : { province: best, how: "nearest" };
}

// ---- sequential binary readers -------------------------------------------------------------
class Reader {
  constructor(path, chunk = 64 * 1024 * 1024) {
    this.fd = openSync(path, "r");
    this.chunk = chunk;
    this.buffer = Buffer.alloc(0);
    this.offset = 0;
    this.filePosition = 0;
    this.eof = false;
  }
  /** Make at least `n` bytes available at `this.offset`; false at end of file. */
  ensure(n) {
    while (this.buffer.length - this.offset < n) {
      if (this.eof) return false;
      const rest = this.buffer.subarray(this.offset);
      const fresh = Buffer.alloc(Math.max(this.chunk, n));
      const read = readSync(this.fd, fresh, 0, fresh.length, this.filePosition);
      this.filePosition += read;
      if (read === 0) this.eof = true;
      this.buffer = Buffer.concat([rest, fresh.subarray(0, read)]);
      this.offset = 0;
    }
    return true;
  }
  take(n) {
    if (!this.ensure(n)) throw new Error("unexpected end of file");
    const slice = this.buffer.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }
  close() {
    closeSync(this.fd);
  }
}

function dbfHeader(reader) {
  const head = reader.take(32);
  const records = head.readUInt32LE(4);
  const headerLength = head.readUInt16LE(8);
  const recordLength = head.readUInt16LE(10);
  const fields = [];
  let position = 1; // the deletion flag
  const descriptors = reader.take(headerLength - 32);
  for (let at = 0; at + 32 <= descriptors.length && descriptors[at] !== 0x0d; at += 32) {
    const name = descriptors.subarray(at, at + 11).toString("latin1").replace(/\0.*$/s, "");
    const length = descriptors[at + 16];
    fields.push({ name, type: String.fromCharCode(descriptors[at + 11]), offset: position, length });
    position += length;
  }
  if (position !== recordLength) throw new Error(`dbf field lengths ${position} != record length ${recordLength}`);
  return { records, recordLength, fields };
}

const numberAt = (record, field) => {
  const text = record.toString("latin1", field.offset, field.offset + field.length).trim();
  const value = Number(text);
  if (text === "" || !Number.isFinite(value)) throw new Error(`bad number "${text}" in ${field.name}`);
  return value;
};

/** One polyline record: its middle vertex in degrees. */
function shpMiddle(reader) {
  const header = reader.take(8);
  const contentBytes = header.readInt32BE(4) * 2;
  const content = reader.take(contentBytes);
  const type = content.readInt32LE(0);
  if (type === 0) return null;
  if (type !== 3) throw new Error(`shape type ${type}, expected polyline`);
  const numParts = content.readInt32LE(36);
  const numPoints = content.readInt32LE(40);
  const pointsAt = 44 + numParts * 4;
  const middle = Math.floor(numPoints / 2);
  return [content.readDoubleLE(pointsAt + middle * 16), content.readDoubleLE(pointsAt + middle * 16 + 8)];
}

// ---- the reaches -------------------------------------------------------------------------
const byProvince = new Map();
const counts = {
  reaches: 0,
  withDownstream: 0,
  headwaters: 0,
  noElevation: 0,
  noGradientHeadwater: 0,
  negativeDischarge: 0,
  placedInside: 0,
  placedNearest: 0,
  unplaced: 0,
};
let grossWorld = 0;
let grossUnplaced = 0;
let grossHeadwaters = 0;
const regionTotals = {};
for (const group of NETWORKS) {
  const region = group.join("+");
  // Pass 1: every reach's discharge, outlet elevation, downstream reach and province, over
  // the files of one river network (South America comes in two files whose rivers cross).
  const ids = [];
  const nextIds = [];
  const dischargeList = [];
  const outletList = [];
  const headwaterList = [];
  const provinceList = [];
  for (const file of group) {
    const dbf = new Reader(join(CACHE, `RiverATLAS_v10_${file}.dbf`));
    const shp = new Reader(join(CACHE, `RiverATLAS_v10_${file}.shp`));
    const { records: fileRecords, recordLength, fields } = dbfHeader(dbf);
    const field = (name) => {
      const found = fields.find((entry) => entry.name === name);
      if (found === undefined) throw new Error(`${file}: no field ${name}`);
      return found;
    };
    const fId = field("HYRIV_ID");
    const fNext = field("NEXT_DOWN");
    const fLength = field("LENGTH_KM");
    const fDischarge = field("dis_m3_pyr");
    const fOutletElevation = field("ele_mt_cmn");
    const fGradient = field("sgr_dk_rav");
    shp.take(100);
    for (let index = 0; index < fileRecords; index += 1) {
      const record = dbf.take(recordLength);
      const point = shpMiddle(shp);
      if (record[0] === 0x2a) throw new Error(`${file}: deleted record ${index}`);
      ids.push(numberAt(record, fId));
      nextIds.push(numberAt(record, fNext));
      dischargeList.push(numberAt(record, fDischarge));
      outletList.push(numberAt(record, fOutletElevation));
      const gradient = numberAt(record, fGradient);
      headwaterList.push(gradient === NO_DATA || gradient < 0 ? Number.NaN : (gradient / 10) * numberAt(record, fLength));
      const located = point === null ? null : locate(point[0], point[1]);
      if (located === null) {
        counts.unplaced += 1;
        provinceList.push(-1);
      } else {
        provinceList.push(located.province.index);
        if (located.how === "inside") counts.placedInside += 1;
        else counts.placedNearest += 1;
      }
    }
    if (shp.ensure(1)) throw new Error(`${file}: shapefile has more records than the dbf`);
    dbf.close();
    shp.close();
  }
  const records = ids.length;
  let minId = Infinity;
  let maxId = -Infinity;
  for (const id of ids) {
    if (id < minId) minId = id;
    if (id > maxId) maxId = id;
  }
  const indexOfId = new Int32Array(maxId - minId + 1).fill(-1);
  ids.forEach((id, index) => {
    if (indexOfId[id - minId] !== -1) throw new Error(`${region}: duplicate reach id ${id}`);
    indexOfId[id - minId] = index;
  });
  const discharge = Float64Array.from(dischargeList);
  const outlet = Float64Array.from(outletList);
  const headwaterHead = Float64Array.from(headwaterList);
  const provinceIndex = Int32Array.from(provinceList);
  const next = new Int32Array(records).fill(-1);
  const hasUpstream = new Uint8Array(records);
  for (let index = 0; index < records; index += 1) {
    const nextId = nextIds[index];
    if (nextId === 0) continue;
    const target = nextId >= minId && nextId <= maxId ? indexOfId[nextId - minId] : -1;
    if (target < 0) throw new Error(`${region}: NEXT_DOWN ${nextId} of reach ${ids[index]} is not in the network`);
    next[index] = target;
    hasUpstream[target] = 1;
  }
  // Outlet elevations made non-increasing downstream (a reach's outlet is at least as high
  // as its downstream reach's): a DEM pit below the next outlet is lifted to it. With
  // signed noise clamped at zero, every rise would otherwise count as fall.
  const conditioned = new Float64Array(records).fill(Number.NaN);
  const stack = [];
  for (let start = 0; start < records; start += 1) {
    let at = start;
    while (Number.isNaN(conditioned[at])) {
      stack.push(at);
      if (stack.length > records) throw new Error(`${region}: the NEXT_DOWN links form a cycle`);
      const down = next[at];
      if (down < 0) break;
      at = down;
    }
    while (stack.length > 0) {
      const reach = stack.pop();
      const down = next[reach];
      conditioned[reach] = down < 0 ? outlet[reach] : Math.max(outlet[reach], conditioned[down]);
    }
  }
  // Pass 2: the gross potential of each reach's water.
  let regionGross = 0;
  for (let index = 0; index < records; index += 1) {
    counts.reaches += 1;
    const flow = discharge[index];
    if (flow < 0) {
      counts.negativeDischarge += 1;
      continue;
    }
    let gross = 0;
    const down = next[index];
    if (down >= 0) {
      if (outlet[index] <= ELEVATION_NO_DATA || outlet[down] <= ELEVATION_NO_DATA) counts.noElevation += 1;
      else {
        counts.withDownstream += 1;
        gross += (RHO * G * flow * (conditioned[index] - conditioned[down]) * HOURS_PER_YEAR) / 1e6;
      }
    }
    if (hasUpstream[index] === 0) {
      counts.headwaters += 1;
      if (Number.isNaN(headwaterHead[index])) counts.noGradientHeadwater += 1;
      else {
        const own = (RHO * G * (flow / 2) * headwaterHead[index] * HOURS_PER_YEAR) / 1e6;
        gross += own;
        grossHeadwaters += own;
      }
    }
    if (!(gross > 0)) continue;
    grossWorld += gross;
    regionGross += gross;
    const at = provinceIndex[index];
    if (at < 0) {
      grossUnplaced += gross;
      continue;
    }
    const province = provinces[at];
    const entry = byProvince.get(province.id) ?? { reaches: 0, gross: 0 };
    entry.reaches += 1;
    entry.gross += gross;
    byProvince.set(province.id, entry);
  }
  regionTotals[region] = Math.round(regionGross / 1e6);
  console.log(`${region}: ${records} reaches, ${(regionGross / 1e9).toFixed(2)} PWh/year`);
}

const keyById = new Map(provinces.map((province) => [province.id, province.key]));
const table = {
  meta: {
    dataset: "HydroSHEDS RiverATLAS v1.0 (shapefile release)",
    citation:
      "Linke, S., Lehner, B., Ouellet Dallaire, C., Ariwi, J., Grill, G., Anand, M., Beames, P., Burchard-Levine, V., Maxwell, S., Moidu, H., Tan, F., Thieme, M. (2019). Global hydro-environmental sub-basin and river reach characteristics at high spatial resolution. Scientific Data 6: 283. doi:10.1038/s41597-019-0300-6",
    attributeSources:
      "dis_m3_pyr: WaterGAP 2.2 (Döll, Kaspar & Lehner 2003, Journal of Hydrology 270: 105-134); ele_mt_cmn and sgr_dk_rav: EarthEnv-DEM90 (Robinson, Regetz & Guralnick 2014, ISPRS J. Photogramm. Remote Sens. 87: 57-67); HYRIV_ID, NEXT_DOWN, LENGTH_KM: HydroRIVERS (Lehner & Grill 2013, Hydrological Processes 27(15): 2171-2186)",
    url: "https://www.hydrosheds.org/hydroatlas",
    file: "RiverATLAS_Data_v10_shp.zip (figshare file 20087486, 2,418,581,202 bytes)",
    accessDate: "2026-11-08",
    licence: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
    generator: "scripts/p5b/extract-hydro-riveratlas.mjs",
    method:
      "gross theoretical potential, MWh/year: per reach, 1000 kg/m³ x 9.81 m/s² x dis_m3_pyr x (ele_mt_cmn - ele_mt_cmn of its NEXT_DOWN reach, both made non-increasing downstream) x 8,765.82 h / 10^6; a headwater reach adds 1000 x 9.81 x dis_m3_pyr/2 x sgr_dk_rav/10 x LENGTH_KM x 8,765.82 / 10^6; a reach goes to the province containing its middle vertex (the smaller on an overlap), else the nearest label within 0.5°",
    unit: "MWh/year (gross theoretical; the simulation applies HYDRO_TECHNICAL_SHARE)",
    counts,
    grossWorldPWhPerYear: Number((grossWorld / 1e9).toFixed(3)),
    grossUnplacedPWhPerYear: Number((grossUnplaced / 1e9).toFixed(3)),
    grossHeadwatersPWhPerYear: Number((grossHeadwaters / 1e9).toFixed(3)),
    grossByRegionTWhPerYear: regionTotals,
    limitations: [
      "Gross theoretical potential at long-term mean flow: no seasonal flow, no technical, economic or environmental limits (the simulation applies one provisional technical share).",
      "Discharge is the naturalised 1971-2000 mean at each reach's downstream end; the 1900 climate and any upstream use are not modelled.",
      "Greenland is left out (no gradient data, and DEM outliers over the ice sheet).",
    ],
  },
  provinces: [...byProvince.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([id, entry]) => ({
      provinceId: id,
      key: keyById.get(id),
      grossMWhPerYear: Math.round(entry.gross),
      reaches: entry.reaches,
    })),
};
const text = `${JSON.stringify(table, null, 1)}\n`;
if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error(`${OUT} is stale; run node scripts/p5b/extract-hydro-riveratlas.mjs`);
    process.exit(1);
  }
  console.log("hydro table current");
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${table.provinces.length} provinces, ${table.meta.grossWorldPWhPerYear} PWh/year gross`);
}
console.log(JSON.stringify(counts));
