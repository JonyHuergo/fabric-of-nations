#!/usr/bin/env node
/**
 * P5b (D-146): USGS Data Series 140 values for 1900 and 1990.
 *
 * Input (not committed; downloaded by hand from usgs.gov, which refuses scripted
 * downloads): .cache-p5b/usgs/ds140-*.xlsx, the supply-demand tables of
 * "Historical statistics for mineral and material commodities in the United States"
 * (USGS Data Series 140, https://pubs.usgs.gov/publication/ds140; public domain).
 *
 * Output (committed): packages/data/data/historical/p5b/ds140_1900_1990.json
 *   Per workbook sheet: the source file name and SHA-256, the unit note, the column
 *   headers, and every column's value in 1900 and in 1990 exactly as published
 *   (numbers as numbers, "NA"/"W"/"E" kept as strings). No value is converted here;
 *   conversions (short tons, troy ounces, CPI) happen in the P5b builder with their
 *   source rows.
 *
 * Usage: node scripts/p5b/extract-ds140.mjs [--check]
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readWorkbook } from "./xlsx-lite.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = join(ROOT, ".cache-p5b/usgs");
const OUT = join(ROOT, "packages/data/data/historical/p5b/ds140_1900_1990.json");
const CHECK = process.argv.includes("--check");
const YEARS = [1900, 1990];
const clean = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value);

function build() {
  if (!existsSync(CACHE)) throw new Error(`missing ${CACHE}; download the DS-140 tables first (docs/P5B_PLAN.md §2)`);
  const files = readdirSync(CACHE).filter((name) => /^ds140-.*\.xlsx$/.test(name)).sort();
  if (files.length === 0) throw new Error("no ds140-*.xlsx files in the cache");
  const tables = [];
  for (const file of files) {
    const bytes = readFileSync(join(CACHE, file));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    for (const sheet of readWorkbook(join(CACHE, file))) {
      const headerIndex = sheet.rows.findIndex((row) => row !== undefined && row[0] === "Year");
      if (headerIndex < 0) continue;
      const header = sheet.rows[headerIndex].map((cell) => (cell == null ? null : clean(String(cell))));
      const width = header.reduce((last, cell, index) => (cell === null ? last : index + 1), 0);
      const years = {};
      for (const row of sheet.rows) {
        if (row === undefined || !YEARS.includes(row[0])) continue;
        const values = {};
        for (let column = 1; column < width; column += 1) {
          if (header[column] === null) continue;
          values[header[column]] = row[column] === undefined ? null : clean(row[column]);
        }
        years[String(row[0])] = values;
      }
      tables.push({
        file,
        sha256,
        sheet: sheet.name,
        title: clean(String(sheet.rows[0]?.[0] ?? "")),
        unitNote: clean(String(sheet.rows[2]?.[0] ?? "")),
        lastModification: clean(String(sheet.rows[3]?.[0] ?? "")),
        values: years,
      });
    }
  }
  return {
    description: "USGS Data Series 140 (historical statistics for mineral and material commodities in the United States): every column of the 1900 and 1990 rows, as published. Extracted by scripts/p5b/extract-ds140.mjs from hand-downloaded workbooks (usgs.gov refuses scripted downloads).",
    decision: "D-146",
    source: { title: "Historical statistics for mineral and material commodities in the United States", series: "U.S. Geological Survey Data Series 140", url: "https://pubs.usgs.gov/publication/ds140", doi: "10.3133/ds140", license: "Public domain (U.S. government work)" },
    years: YEARS,
    tables,
  };
}

const text = `${JSON.stringify(build(), null, 1)}\n`;
if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== text) {
    console.error(`${OUT} is stale; run node scripts/p5b/extract-ds140.mjs`);
    process.exit(1);
  }
  console.log("ds140 extract is current");
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
}
