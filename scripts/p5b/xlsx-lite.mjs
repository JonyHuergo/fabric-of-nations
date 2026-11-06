/**
 * P5b: a minimal, dependency-free reader for the cell values of an .xlsx workbook
 * (Office Open XML in a zip container). It reads the zip central directory, inflates
 * the shared-string table and each worksheet with node:zlib, and returns every sheet
 * as a sparse grid of strings and numbers. Formulas are read as their cached values.
 * Enough for the USGS DS-140 tables; not a general spreadsheet library.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

function unzip(buffer) {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("not a zip file (no end of central directory)");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("bad central directory entry");
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localName = buffer.readUInt16LE(local + 26);
    const localExtra = buffer.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    const data = buffer.subarray(start, start + compressed);
    files.set(name, method === 0 ? data : method === 8 ? inflateRawSync(data) : null);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decode = (text) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)[0];
  let value = 0;
  for (const letter of letters) value = value * 26 + (letter.charCodeAt(0) - 64);
  return value - 1;
}

/** Read every worksheet: [{ name, rows: (string|number|null)[][] }]. */
export function readWorkbook(path) {
  const files = unzip(readFileSync(path));
  const text = (name) => {
    const data = files.get(name);
    return data == null ? null : data.toString("utf8");
  };
  const shared = [];
  const sst = text("xl/sharedStrings.xml");
  if (sst !== null) {
    for (const item of sst.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(decode((item.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
    }
  }
  const workbook = text("xl/workbook.xml");
  const rels = text("xl/_rels/workbook.xml.rels");
  const target = new Map([...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = [];
  for (const m of workbook.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const file = "xl/" + target.get(m[2]).replace(/^\/?xl\//, "");
    const xml = text(file) ?? "";
    const rows = [];
    for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
      const r = Number(/ r="(\d+)"/.exec(row)[1]) - 1;
      const cells = [];
      for (const cell of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = / r="([A-Z]+\d+)"/.exec(cell)[1];
        const type = / t="([^"]+)"/.exec(cell)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
        const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cell)?.[1];
        let value = null;
        if (type === "s" && raw !== undefined) value = shared[Number(raw)];
        else if (type === "inlineStr" && inline !== undefined) value = decode(inline);
        else if (type === "str" && raw !== undefined) value = decode(raw);
        else if (raw !== undefined) value = Number(raw);
        cells[columnIndex(ref)] = value;
      }
      rows[r] = cells;
    }
    sheets.push({ name: decode(m[1]), rows });
  }
  return sheets;
}
