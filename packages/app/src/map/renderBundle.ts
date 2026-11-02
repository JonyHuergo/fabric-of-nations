/**
 * Decoder for the compiled render bundle `public/map/world-render-v1.bin`.
 *
 * The bundle is a display artifact of `scripts/map/build-render-bundle.mjs`:
 * meshes, polylines and rasters derived from the authoritative province data.
 * Geographic integers are projected here, by the one projection module, so the
 * build never has to ship projected coordinates. Validation is strict: a wrong
 * format, projection or province count throws, and the host falls back to the
 * SVG renderer rather than drawing a mismatched map. This module is pure, so the
 * map runtime can run it in a worker, off the page's main thread.
 */

import { MAP_HEIGHT, MAP_NORTH_LAT, MAP_SOUTH_LAT, MAP_WIDTH, projectLat, projectLon } from "./projection";

/** One culling chunk: [start, count, minX, minY, maxX, maxY]. */
export type RenderChunk = readonly [number, number, number, number, number, number];

export interface MeshLayer {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly chunks: readonly RenderChunk[];
}

export interface LineLayer {
  /** Per segment: x0, y0, x1, y1 in map units. */
  readonly segments: Float32Array;
  /** Per segment: bundle index + 1 of the two sides; 0 is "no province". */
  readonly ids: Uint16Array;
  readonly chunks: readonly RenderChunk[];
}

export interface ProvinceRaster {
  readonly width: number;
  readonly height: number;
  /** Bundle index + 1 per cell; 0 is unclaimed. Bit 15 marks land. */
  readonly cells: Uint16Array;
}

export interface RenderBundle {
  readonly provinceCount: number;
  readonly provinceSourceHash: string;
  /** Authoritative province id per bundle index, in catalogue order. */
  readonly provinceIds: Int32Array;
  readonly fill: MeshLayer;
  /** Bundle index + 1 per fill vertex. */
  readonly fillProvince: Uint16Array;
  readonly land: readonly MeshLayer[];
  readonly lakes: readonly MeshLayer[];
  readonly coast: readonly LineLayer[];
  readonly borders: readonly LineLayer[];
  readonly rivers: readonly LineLayer[];
  /** Six values per province: area, centroid x, y, central moments xx, xy, yy. */
  readonly stats: Float32Array;
  readonly raster: ProvinceRaster;
  /** Horizontal extent of all drawn geometry, for seam-crossing copies. */
  readonly extentMinX: number;
  readonly extentMaxX: number;
  readonly lodTolerance: readonly number[];
}

export const LAND_MASK = 0x8000;
export const PROVINCE_ID_MASK = 0x7fff;

interface SectionRef {
  readonly offset: number;
  readonly length: number;
  readonly count: number;
}

interface MeshHeader {
  readonly vertices: SectionRef;
  readonly indices: SectionRef;
  readonly chunks: readonly RenderChunk[];
}

interface LineHeader {
  readonly segments: number;
  readonly coordinates: SectionRef;
  readonly lengths: SectionRef;
  readonly idsA: SectionRef;
  readonly idsB: SectionRef;
  readonly chunks: readonly RenderChunk[];
}

interface BundleHeader {
  readonly format: number;
  readonly projection: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly northLat: number;
    readonly southLat: number;
  };
  readonly provinceSourceHash: string;
  readonly provinceCount: number;
  readonly provinceIds: SectionRef;
  readonly provinceVertexCounts: SectionRef;
  readonly provinceStats: SectionRef;
  readonly raster: { readonly width: number; readonly height: number; readonly rle: SectionRef };
  readonly fill: MeshHeader;
  readonly land: readonly MeshHeader[];
  readonly lakes: readonly MeshHeader[];
  readonly coast: readonly LineHeader[];
  readonly borders: readonly LineHeader[];
  readonly rivers: readonly LineHeader[];
  readonly lodTolerance: readonly number[];
}

/** Stateful reader of zigzag-free unsigned varints. */
function readVarints(bytes: Uint8Array, count: number, emit: (value: number, index: number) => void): void {
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    let value = 0;
    let multiplier = 1;
    let byte = bytes[cursor] ?? 0;
    cursor += 1;
    while (byte >= 128) {
      value += (byte & 127) * multiplier;
      multiplier *= 128;
      byte = bytes[cursor] ?? 0;
      cursor += 1;
    }
    emit(value + byte * multiplier, index);
  }
}

const unzigzag = (value: number): number => (value % 2 === 0 ? value / 2 : -(value + 1) / 2);

function decodeDeltas(bytes: Uint8Array, count: number): Int32Array {
  const output = new Int32Array(count);
  let last = 0;
  readVarints(bytes, count, (value, index) => {
    last += unzigzag(value);
    output[index] = last;
  });
  return output;
}

function decodeCoordinates(bytes: Uint8Array, pointCount: number): Int32Array {
  const output = new Int32Array(pointCount * 2);
  let last = [0, 0];
  readVarints(bytes, pointCount * 2, (value, index) => {
    const axis = index % 2;
    const next = (last[axis] ?? 0) + unzigzag(value);
    last[axis] = next;
    output[index] = next;
  });
  return output;
}

function projectCoordinates(coordinates: Int32Array): Float32Array {
  const positions = new Float32Array(coordinates.length);
  for (let index = 0; index < coordinates.length; index += 2) {
    positions[index] = projectLon((coordinates[index] ?? 0) / 1000);
    positions[index + 1] = projectLat((coordinates[index + 1] ?? 0) / 1000);
  }
  return positions;
}

/** Parse the inflated bundle bytes. */
export function parseRenderBundle(bytes: Uint8Array): RenderBundle {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic !== "FONM") throw new Error("render bundle: bad magic");
  const headerLength = view.getUint32(4, true);
  const headerBytes = bytes.subarray(8, 8 + headerLength);
  const header = JSON.parse(new TextDecoder().decode(headerBytes)) as BundleHeader;
  if (header.format !== 1) throw new Error(`render bundle: format ${String(header.format)}`);
  const { projection } = header;
  if (
    projection.id !== "gall-stereographic" ||
    projection.width !== MAP_WIDTH ||
    Math.abs(projection.height - MAP_HEIGHT) > 1e-6 ||
    projection.northLat !== MAP_NORTH_LAT ||
    projection.southLat !== MAP_SOUTH_LAT
  ) {
    throw new Error("render bundle: projection does not match the application");
  }
  const payload = 8 + headerLength;
  const section = (ref: SectionRef): Uint8Array =>
    bytes.subarray(payload + ref.offset, payload + ref.offset + ref.length);

  const mesh = (entry: MeshHeader): MeshLayer => {
    const indices = decodeDeltas(section(entry.indices), entry.indices.count);
    return {
      positions: projectCoordinates(decodeCoordinates(section(entry.vertices), entry.vertices.count)),
      indices: new Uint32Array(indices.buffer),
      chunks: entry.chunks,
    };
  };

  const lines = (entry: LineHeader): LineLayer => {
    const points = projectCoordinates(decodeCoordinates(section(entry.coordinates), entry.coordinates.count));
    const lengths = decodeDeltas(section(entry.lengths), entry.lengths.count);
    const idsA = decodeDeltas(section(entry.idsA), entry.idsA.count);
    const idsB = decodeDeltas(section(entry.idsB), entry.idsB.count);
    const segments = new Float32Array(entry.segments * 4);
    const ids = new Uint16Array(entry.segments * 2);
    let point = 0;
    let segment = 0;
    for (let piece = 0; piece < lengths.length; piece += 1) {
      const pieceLength = lengths[piece] ?? 0;
      for (let index = 0; index + 1 < pieceLength; index += 1) {
        segments[segment * 4] = points[point * 2] ?? 0;
        segments[segment * 4 + 1] = points[point * 2 + 1] ?? 0;
        segments[segment * 4 + 2] = points[point * 2 + 2] ?? 0;
        segments[segment * 4 + 3] = points[point * 2 + 3] ?? 0;
        ids[segment * 2] = idsA[piece] ?? 0;
        ids[segment * 2 + 1] = idsB[piece] ?? 0;
        segment += 1;
        point += 1;
      }
      point += 1;
    }
    if (segment !== entry.segments) throw new Error("render bundle: line segment count mismatch");
    return { segments, ids, chunks: entry.chunks };
  };

  const provinceIds = decodeDeltas(section(header.provinceIds), header.provinceCount);
  const vertexCounts = decodeDeltas(section(header.provinceVertexCounts), header.provinceCount);
  const fill = mesh(header.fill);
  const fillProvince = new Uint16Array(fill.positions.length / 2);
  let vertex = 0;
  for (let province = 0; province < header.provinceCount; province += 1) {
    fillProvince.fill(province + 1, vertex, vertex + (vertexCounts[province] ?? 0));
    vertex += vertexCounts[province] ?? 0;
  }
  if (vertex !== fillProvince.length) throw new Error("render bundle: vertex run mismatch");
  let extentMinX = 0;
  let extentMaxX = MAP_WIDTH;
  for (let index = 0; index < fill.positions.length; index += 2) {
    const x = fill.positions[index] ?? 0;
    if (x < extentMinX) extentMinX = x;
    if (x > extentMaxX) extentMaxX = x;
  }

  const statsBytes = section(header.provinceStats);
  const stats = new Float32Array(header.provinceStats.count);
  new Uint8Array(stats.buffer).set(statsBytes);

  const cells = new Uint16Array(header.raster.width * header.raster.height);
  let cursor = 0;
  let pending = -1;
  readVarints(section(header.raster.rle), header.raster.rle.count * 2, (value, index) => {
    if (index % 2 === 0) {
      pending = value;
    } else {
      cells.fill(pending, cursor, cursor + value);
      cursor += value;
    }
  });
  if (cursor !== cells.length) throw new Error("render bundle: raster run mismatch");

  return {
    provinceCount: header.provinceCount,
    provinceSourceHash: header.provinceSourceHash,
    provinceIds,
    fill,
    fillProvince,
    land: header.land.map(mesh),
    lakes: header.lakes.map(mesh),
    coast: header.coast.map(lines),
    borders: header.borders.map(lines),
    rivers: header.rivers.map(lines),
    stats,
    raster: { width: header.raster.width, height: header.raster.height, cells },
    extentMinX,
    extentMaxX,
    lodTolerance: header.lodTolerance,
  };
}

/** The typed arrays of a bundle, so a worker can transfer them instead of copying. */
export function bundleTransferList(bundle: RenderBundle): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (array: { readonly buffer: ArrayBufferLike }): void => {
    buffers.add(array.buffer as ArrayBuffer);
  };
  add(bundle.provinceIds);
  add(bundle.fillProvince);
  add(bundle.stats);
  add(bundle.raster.cells);
  for (const layer of [bundle.fill, ...bundle.land, ...bundle.lakes]) {
    add(layer.positions);
    add(layer.indices);
  }
  for (const layer of [...bundle.coast, ...bundle.borders, ...bundle.rivers]) {
    add(layer.segments);
    add(layer.ids);
  }
  return [...buffers];
}
