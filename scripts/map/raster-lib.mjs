/**
 * Minimal dependency-free raster helpers for the render-bundle build: read one
 * entry of a zip archive, decode an uncompressed TIFF, scan-convert polygons and
 * grow a nearest-province field. Only the features the pinned Natural Earth
 * files actually use are implemented; anything else throws.
 */
import { inflateRawSync } from "node:zlib";

/** Extract one stored or deflated entry from a zip archive. */
export function unzipEntry(zip, name) {
  const END_SIGNATURE = 0x06054b50;
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== END_SIGNATURE) end -= 1;
  if (end < 0) throw new Error("zip end-of-directory record not found");
  const entries = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index += 1) {
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeader = zip.readUInt32LE(cursor + 42);
    const entryName = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (entryName === name) {
      const localName = zip.readUInt16LE(localHeader + 26);
      const localExtra = zip.readUInt16LE(localHeader + 28);
      const start = localHeader + 30 + localName + localExtra;
      const body = zip.subarray(start, start + compressedSize);
      if (method === 0) return body;
      if (method === 8) return inflateRawSync(body);
      throw new Error(`${name}: unsupported zip method ${String(method)}`);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name}: not present in archive`);
}

/** Decode an 8-bit, chunky, uncompressed, strip-organised little-endian TIFF. */
export function decodeTiff(bytes) {
  if (bytes.toString("latin1", 0, 2) !== "II") throw new Error("expected little-endian TIFF");
  const directory = bytes.readUInt32LE(4);
  const tags = new Map();
  const entryCount = bytes.readUInt16LE(directory);
  for (let index = 0; index < entryCount; index += 1) {
    const at = directory + 2 + index * 12;
    const tag = bytes.readUInt16LE(at);
    const kind = bytes.readUInt16LE(at + 2);
    const count = bytes.readUInt32LE(at + 4);
    const size = kind === 3 ? 2 : kind === 4 ? 4 : 1;
    const read = (offset) =>
      kind === 3 ? bytes.readUInt16LE(offset) : kind === 4 ? bytes.readUInt32LE(offset) : bytes[offset];
    const base = count * size <= 4 ? at + 8 : bytes.readUInt32LE(at + 8);
    const values = [];
    for (let item = 0; item < count; item += 1) values.push(read(base + item * size));
    tags.set(tag, values);
  }
  const width = tags.get(256)[0];
  const height = tags.get(257)[0];
  const samples = tags.get(277)?.[0] ?? 1;
  if ((tags.get(259)?.[0] ?? 1) !== 1) throw new Error("expected an uncompressed TIFF");
  if ((tags.get(258)?.[0] ?? 8) !== 8) throw new Error("expected 8-bit samples");
  const offsets = tags.get(273);
  const counts = tags.get(279);
  const pixels = new Uint8Array(width * height * samples);
  let cursor = 0;
  for (let index = 0; index < offsets.length; index += 1) {
    pixels.set(bytes.subarray(offsets[index], offsets[index] + counts[index]), cursor);
    cursor += counts[index];
  }
  if (cursor !== pixels.length) throw new Error("TIFF strips do not cover the image");
  return { width, height, samples, pixels };
}

/**
 * Even-odd scan conversion of one polygon's rings. `rings` are arrays of
 * [x, y] in raster pixels; `plot(column, row)` receives each covered cell with
 * the column already wrapped horizontally.
 */
export function scanPolygon(rings, width, height, plot) {
  const crossings = new Map();
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const [ax, ay] = ring[index];
      const [bx, by] = ring[(index + 1) % ring.length];
      if (ay === by) continue;
      const top = Math.min(ay, by);
      const bottom = Math.max(ay, by);
      const firstRow = Math.max(0, Math.ceil(top - 0.5));
      const lastRow = Math.min(height - 1, Math.ceil(bottom - 0.5) - 1);
      for (let row = firstRow; row <= lastRow; row += 1) {
        const x = ax + ((row + 0.5 - ay) * (bx - ax)) / (by - ay);
        let list = crossings.get(row);
        if (list === undefined) {
          list = [];
          crossings.set(row, list);
        }
        list.push(x);
      }
    }
  }
  for (const [row, list] of crossings) {
    list.sort((left, right) => left - right);
    for (let index = 0; index + 1 < list.length; index += 2) {
      const first = Math.ceil(list[index] - 0.5);
      const last = Math.ceil(list[index + 1] - 0.5) - 1;
      for (let column = first; column <= last; column += 1) {
        plot(((column % width) + width) % width, row);
      }
    }
  }
}

/**
 * Multi-source breadth-first growth: every unassigned, unblocked cell receives
 * the id of its nearest seeded cell in 4-connected steps, wrapping horizontally.
 */
export function growNearest(ids, width, height, blockedFromRow) {
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < ids.length; cell += 1) {
    if (ids[cell] !== 0) {
      queue[tail] = cell;
      tail += 1;
    }
  }
  while (head < tail) {
    const cell = queue[head];
    head += 1;
    const row = Math.floor(cell / width);
    const column = cell - row * width;
    const id = ids[cell];
    const neighbours = [
      row * width + ((column + 1) % width),
      row * width + ((column + width - 1) % width),
      row > 0 ? cell - width : -1,
      row + 1 < blockedFromRow ? cell + width : -1,
    ];
    for (const next of neighbours) {
      if (next >= 0 && ids[next] === 0) {
        ids[next] = id;
        queue[tail] = next;
        tail += 1;
      }
    }
  }
}
