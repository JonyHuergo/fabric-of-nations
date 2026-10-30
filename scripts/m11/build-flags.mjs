#!/usr/bin/env node
/**
 * Historical flag asset pipeline for the 1900 Century catalog.
 *
 * The authored approval list lives in
 * `packages/data/data/historical/m11/flags_1900.json`. Every entry records the
 * Wikimedia Commons file, the licence returned by the Commons API, the author,
 * the validity window and historical notes. This script:
 *
 *   1. validates the approval list against the 1900 polity catalog;
 *   2. resolves each approved Commons file through the MediaWiki API and
 *      re-verifies its licence (Public Domain or CC0 only), SHA-1, author and
 *      dimensions;
 *   3. downloads the Commons PNG rendition at a fixed width (preserving the
 *      flag's own proportions), or converts a JPEG rendition to PNG;
 *   4. validates the PNG structure (signature, chunk CRCs, IHDR, IDAT size) and
 *      rejects malformed or oversized files;
 *   5. writes the bundled assets, the deterministic asset ledger, the generated
 *      polity-ID mapping, the generated provenance module and
 *      `docs/FLAG_PROVENANCE.md`.
 *
 * Modes:
 *   (default)        network build: retrieve, verify, convert, write everything.
 *   --check          offline: verify committed assets and generated files.
 *   --audit          network audit: re-verify source licences and metadata.
 *   --update         network build that explicitly accepts a changed rendition
 *                    and rewrites the committed ledger (deliberate source change).
 *   --emit <dir>     offline: write only the generated text outputs to <dir>,
 *                    for reproducibility tests. Never touches the repository.
 *
 * The normal game build never runs this script, so the app remains fully offline.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import Jimp from "jimp-compact";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const MANIFEST_PATH = join(ROOT, "packages/data/data/historical/m11/flags_1900.json");
const CATALOG_PATH = join(ROOT, "packages/data/data/historical/m11/polities_1900.json");
const ASSET_DIR = join(ROOT, "packages/app/assets/flags");
const LEDGER_PATH = join(ASSET_DIR, "ledger.json");
const MAPPING_PATH = join(ROOT, "packages/app/src/generated/flagAssets.ts");
const PROVENANCE_PATH = join(ROOT, "packages/app/src/generated/flagProvenance.ts");
const DOC_PATH = join(ROOT, "docs/FLAG_PROVENANCE.md");

const API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "CenturyGameFlagAudit/0.1 (https://github.com/century-game; offline 1900 flag asset pipeline)";
const ALLOWED_LICENSE_CODES = new Set(["pd", "cc0"]);
const PROJECT_LICENSE_CODE = "project";
const PROJECT_FLAG_WIDTH = 1000;
const PROJECT_FLAG_HEIGHT = 667;
const PROJECT_RENDERERS = new Set(["spain-restoration", "transvaal-vierkleur"]);
const ALLOWED_FLAG_KINDS = new Set([
  "exact-national",
  "de-facto-national",
  "civil-national",
  "national-plain",
  "national-form",
  "national-with-union-badge",
  "imperial-state-standard",
  "pre-standardization-representative",
  "civil-ensign",
  "national-under-occupation",
  "provincial-national",
  "representative-common-ensign",
  "autonomous-state-flag",
  "national-variant-representative",
  "project-reconstruction",
]);
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_RASTER_EDGE = 4096;
const MIN_RASTER_EDGE = 32;
const TARGET_RASTER_WIDTH = 500;
const MIN_PNG_WIDTH = 32;
const MAX_PNG_WIDTH = 2048;
const MAX_BUNDLED_BYTES = 512 * 1024;
const FALLBACK_STATUSES = new Set([
  "colony",
  "protectorate",
  "occupation",
  "autonomous-province",
  "dependency",
  "self-governing-colony",
  "dominion",
  "autonomous-vassal",
]);

const args = process.argv.slice(2);
const mode = args.includes("--check")
  ? "check"
  : args.includes("--audit")
    ? "audit"
    : args.includes("--emit")
      ? "emit"
      : "build";
const emitIndex = args.indexOf("--emit");
const emitDir = emitIndex === -1 ? null : args[emitIndex + 1];
const allowLedgerUpdate = args.includes("--update");
if (mode === "emit" && (emitDir === undefined || emitDir === null || emitDir.startsWith("--"))) {
  fail("--emit requires an output directory");
}

function fail(message) {
  process.stderr.write(`build-flags: ${message}\n`);
  process.exit(1);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/* ------------------------------------------------------------------ */
/* PNG validation                                                      */
/* ------------------------------------------------------------------ */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CHANNELS_BY_COLOR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);
const VALID_BIT_DEPTHS = new Map([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);

/**
 * Strict PNG structure validation. Returns the image dimensions and palette
 * presence. Rejects bad signatures, bad chunk CRCs, truncated data, extra
 * bytes after IEND and impossible IHDR combinations.
 */
function inspectPng(buffer, label) {
  if (buffer.length < PNG_SIGNATURE.length + 25) {
    throw new Error(`${label}: file is too small to be a PNG`);
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${label}: missing PNG signature`);
  }
  let offset = 8;
  let header = null;
  let paletteSeen = false;
  const idat = [];
  let sawEnd = false;
  let chunkCount = 0;

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      throw new Error(`${label}: truncated PNG chunk header`);
    }
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buffer.length) {
      throw new Error(`${label}: truncated PNG chunk ${type}`);
    }
    if (!/^[A-Za-z]{4}$/.test(type)) {
      throw new Error(`${label}: invalid PNG chunk type`);
    }
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(buffer.subarray(offset + 4, dataEnd));
    if (expectedCrc !== actualCrc) {
      throw new Error(`${label}: PNG chunk ${type} has a bad CRC`);
    }
    chunkCount += 1;
    if (chunkCount === 1 && type !== "IHDR") {
      throw new Error(`${label}: first PNG chunk is not IHDR`);
    }
    if (type === "IHDR") {
      if (header !== null) throw new Error(`${label}: duplicate IHDR`);
      if (length !== 13) throw new Error(`${label}: invalid IHDR length`);
      header = {
        width: buffer.readUInt32BE(dataStart),
        height: buffer.readUInt32BE(dataStart + 4),
        bitDepth: buffer[dataStart + 8],
        colorType: buffer[dataStart + 9],
        compression: buffer[dataStart + 10],
        filter: buffer[dataStart + 11],
        interlace: buffer[dataStart + 12],
      };
    } else if (type === "PLTE") {
      paletteSeen = true;
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (length !== 0) throw new Error(`${label}: IEND must be empty`);
      sawEnd = true;
      offset = crcEnd;
      break;
    }
    offset = crcEnd;
  }

  if (header === null) throw new Error(`${label}: missing IHDR`);
  if (!sawEnd) throw new Error(`${label}: missing IEND`);
  if (offset !== buffer.length) throw new Error(`${label}: trailing bytes after IEND`);
  if (header.compression !== 0) throw new Error(`${label}: unsupported PNG compression`);
  if (header.filter !== 0) throw new Error(`${label}: unsupported PNG filter method`);
  if (header.interlace !== 0 && header.interlace !== 1) {
    throw new Error(`${label}: invalid PNG interlace method`);
  }
  const depths = VALID_BIT_DEPTHS.get(header.colorType);
  if (depths === undefined || !depths.has(header.bitDepth)) {
    throw new Error(`${label}: invalid PNG colour type / bit depth combination`);
  }
  if (header.colorType === 3 && !paletteSeen) {
    throw new Error(`${label}: indexed PNG has no palette`);
  }
  if (header.width < MIN_PNG_WIDTH || header.height < MIN_PNG_WIDTH) {
    throw new Error(`${label}: PNG is smaller than ${MIN_PNG_WIDTH}px`);
  }
  if (header.width > MAX_PNG_WIDTH || header.height > MAX_PNG_WIDTH) {
    throw new Error(`${label}: PNG exceeds the ${MAX_PNG_WIDTH}px limit`);
  }
  if (header.interlace === 0) {
    const channels = CHANNELS_BY_COLOR_TYPE.get(header.colorType);
    const rowBytes = Math.ceil((header.width * channels * header.bitDepth) / 8);
    const expected = header.height * (rowBytes + 1);
    let inflated;
    try {
      inflated = inflateSync(Buffer.concat(idat));
    } catch {
      throw new Error(`${label}: IDAT stream does not inflate`);
    }
    if (inflated.length !== expected) {
      throw new Error(`${label}: IDAT size does not match IHDR dimensions`);
    }
  }
  return {
    width: header.width,
    height: header.height,
    bitDepth: header.bitDepth,
    colorType: header.colorType,
    interlaced: header.interlace === 1,
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}

/* ------------------------------------------------------------------ */
/* Project-authored flag reconstructions                               */
/* ------------------------------------------------------------------ */

function flagKindOf(manifest, id) {
  return manifest.flags[id].flagKind ?? manifest.meta.flagKinds?.[id] ?? "exact-national";
}

function hexToInt(hex) {
  const value = hex.replace("#", "");
  return Jimp.rgbaToInt(
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  );
}

function solidImage(width, height, hex) {
  return new Jimp(width, height, hexToInt(hex));
}

function validateProjectComponents(flag) {
  const problems = [];
  const project = flag.project;
  if (project === undefined || !PROJECT_RENDERERS.has(project.design)) {
    return [`${flag.id}: unknown or missing project design`];
  }
  if (project.width !== PROJECT_FLAG_WIDTH || project.height !== PROJECT_FLAG_HEIGHT) {
    problems.push(`${flag.id}: project canvas must be ${PROJECT_FLAG_WIDTH}x${PROJECT_FLAG_HEIGHT}`);
  }
  for (const component of project.components ?? []) {
    const path = resolve(ROOT, component.path);
    if (!existsSync(path)) {
      problems.push(`${flag.id}: missing project component ${component.path}`);
      continue;
    }
    const buffer = readFileSync(path);
    const actual = sha256(buffer);
    if (actual !== component.sha256) {
      problems.push(`${flag.id}: project component hash mismatch for ${component.path}`);
    }
  }
  return problems;
}

function clearOuterWhite(image) {
  const { data, width, height } = image.bitmap;
  const visited = new Uint8Array(width * height);
  const stack = [];
  const isOuterWhite = (x, y) => {
    const index = y * width + x;
    if (visited[index] === 1) return false;
    const offset = index * 4;
    return data[offset] > 235 && data[offset + 1] > 235 && data[offset + 2] > 235;
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (!isOuterWhite(x, y)) return;
    const index = y * width + x;
    visited[index] = 1;
    data[index * 4 + 3] = 0;
    stack.push([x, y]);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

async function renderProjectSource(flag) {
  const project = flag.project;
  const width = project.width;
  const height = project.height;
  const canvas = new Jimp(width, height, hexToInt("#ffffff"));

  if (project.design === "transvaal-vierkleur") {
    const greenWidth = Math.round(width / 3);
    const flyWidth = width - greenWidth;
    canvas.composite(solidImage(greenWidth, height, "#007a4d"), 0, 0);
    const stripeHeight = Math.round(height / 3);
    const colors = ["#de3831", "#ffffff", "#002395"];
    let y = 0;
    for (let index = 0; index < colors.length; index += 1) {
      const stripe = index === colors.length - 1 ? height - y : stripeHeight;
      canvas.composite(solidImage(flyWidth, stripe, colors[index]), greenWidth, y);
      y += stripe;
    }
  } else if (project.design === "spain-restoration") {
    const redHeight = Math.round(height / 4);
    const yellowHeight = height - redHeight * 2;
    canvas.composite(solidImage(width, redHeight, "#c60b1e"), 0, 0);
    canvas.composite(solidImage(width, yellowHeight, "#ffc400"), 0, redHeight);
    canvas.composite(solidImage(width, redHeight, "#c60b1e"), 0, redHeight + yellowHeight);
    const component = (project.components ?? []).find((entry) => entry.role === "coat-of-arms");
    if (component === undefined) throw new Error(`${flag.id}: missing coat-of-arms component`);
    const arms = await Jimp.read(resolve(ROOT, component.path));
    clearOuterWhite(arms);
    const targetHeight = Math.round(height * 0.42);
    const targetWidth = Math.round((arms.bitmap.width * targetHeight) / arms.bitmap.height);
    arms.resize(targetWidth, targetHeight);
    canvas.composite(arms, Math.round((width - targetWidth) / 2), Math.round((height - targetHeight) / 2));
  } else {
    throw new Error(`${flag.id}: unsupported project design ${String(project.design)}`);
  }

  const sourceBuffer = await canvas.getBufferAsync(Jimp.MIME_PNG);
  const image = await Jimp.read(sourceBuffer);
  image.resize(TARGET_RASTER_WIDTH, Math.round((TARGET_RASTER_WIDTH * height) / width));
  const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
  const png = inspectPng(buffer, flag.id);
  if (png.width !== TARGET_RASTER_WIDTH) {
    throw new Error(`${flag.id}: project render width ${String(png.width)} is not normalized`);
  }
  return { buffer, png, convertedFrom: "project" };
}

function loadInputs() {
  if (!existsSync(MANIFEST_PATH)) fail(`missing manifest: ${MANIFEST_PATH}`);
  if (!existsSync(CATALOG_PATH)) fail(`missing catalog: ${CATALOG_PATH}`);
  const manifest = readJson(MANIFEST_PATH);
  const catalog = readJson(CATALOG_PATH);
  return { manifest, catalog };
}

function validateManifest(manifest, catalog) {
  const problems = [];
  const flags = manifest.flags;
  const polities = manifest.polities;
  if (typeof flags !== "object" || flags === null) problems.push("manifest.flags missing");
  if (typeof polities !== "object" || polities === null) problems.push("manifest.polities missing");

  const allPolities = [...catalog.states, ...catalog.territories];
  const byTag = new Map(allPolities.map((polity) => [polity.tag, polity]));

  const requiredFlagFields = [
    "id",
    "description",
    "sourceTitle",
    "sourcePageUrl",
    "sourceFileUrl",
    "license",
    "licenseCode",
    "licenseUrl",
    "author",
    "validFrom",
    "retrievedAt",
    "historicalNotes",
  ];
  for (const [id, entry] of Object.entries(flags)) {
    if (entry.id !== id) problems.push(`flag ${id}: id mismatch`);
    for (const field of requiredFlagFields) {
      if (typeof entry[field] !== "string" || entry[field].length === 0) {
        problems.push(`flag ${id}: missing ${field}`);
      }
    }
    const sourceType = entry.sourceType ?? "commons";
    const kind = flagKindOf(manifest, id);
    if (!ALLOWED_FLAG_KINDS.has(kind)) {
      problems.push(`flag ${id}: unknown flagKind ${kind}`);
    }
    if (sourceType === "commons") {
      if (!ALLOWED_LICENSE_CODES.has(entry.licenseCode)) {
        problems.push(`flag ${id}: licence ${entry.licenseCode} is not PD/CC0`);
      }
      if (!entry.sourceTitle.startsWith("File:")) {
        problems.push(`flag ${id}: sourceTitle must be a Commons File: title`);
      }
      if (!entry.sourcePageUrl.includes("commons.wikimedia.org/wiki/File:")) {
        problems.push(`flag ${id}: sourcePageUrl is not a Commons file page`);
      }
      if (!/^https:\/\/upload\.wikimedia\.org\//.test(entry.sourceFileUrl)) {
        problems.push(`flag ${id}: sourceFileUrl is not an upload.wikimedia.org URL`);
      }
      if (!/^[0-9a-f]{40}$/.test(entry.sourceSha1)) {
        problems.push(`flag ${id}: sourceSha1 must be a 40-character SHA-1`);
      }
    } else if (sourceType === "project") {
      if (entry.licenseCode !== PROJECT_LICENSE_CODE) {
        problems.push(`flag ${id}: project licence code must be "${PROJECT_LICENSE_CODE}"`);
      }
      if (!entry.sourcePageUrl.startsWith("internal:")) {
        problems.push(`flag ${id}: project sourcePageUrl must be internal:`);
      }
      if (!entry.sourceFileUrl.startsWith("internal:")) {
        problems.push(`flag ${id}: project sourceFileUrl must be internal:`);
      }
      if (entry.sourceSha1 !== null) {
        problems.push(`flag ${id}: project sourceSha1 must be null`);
      }
      problems.push(...validateProjectComponents(entry));
      if (
        entry.sourceWidth !== PROJECT_FLAG_WIDTH ||
        entry.sourceHeight !== PROJECT_FLAG_HEIGHT
      ) {
        problems.push(`flag ${id}: project source dimensions must be 1000x667`);
      }
    } else {
      problems.push(`flag ${id}: unknown sourceType ${String(sourceType)}`);
    }
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(entry.validFrom)) {
      problems.push(`flag ${id}: validFrom must be an ISO date or year`);
    }
    if (entry.validTo !== null && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(entry.validTo)) {
      problems.push(`flag ${id}: validTo must be null, an ISO date or a year`);
    }
    if (
      entry.validTo !== null &&
      entry.validTo < entry.validFrom
    ) {
      problems.push(`flag ${id}: validTo precedes validFrom`);
    }
    if (!Number.isInteger(entry.sourceWidth) || !Number.isInteger(entry.sourceHeight)) {
      problems.push(`flag ${id}: source dimensions must be integers`);
    }
  }

  if (Object.keys(polities).length !== allPolities.length) {
    problems.push(
      `manifest covers ${Object.keys(polities).length} polities but the catalog has ${allPolities.length}`,
    );
  }

  for (const polity of allPolities) {
    const entry = polities[polity.id];
    if (entry === undefined) {
      problems.push(`missing polity mapping for ${polity.tag} (${polity.id})`);
      continue;
    }
    if (entry.tag !== polity.tag) {
      problems.push(`polity ${polity.id}: tag ${entry.tag} does not match catalog ${polity.tag}`);
    }
    if (entry.flag === null) {
      if (typeof entry.fallbackReason !== "string" || entry.fallbackReason.length < 20) {
        problems.push(`polity ${polity.tag}: fallback without a documented reason`);
      }
      if (entry.basis !== "fallback") {
        problems.push(`polity ${polity.tag}: null flag must use basis "fallback"`);
      }
    } else {
      if (!Object.hasOwn(flags, entry.flag)) {
        problems.push(`polity ${polity.tag}: references unknown flag ${entry.flag}`);
      }
      if (entry.basis === "fallback") {
        problems.push(`polity ${polity.tag}: has a flag but basis "fallback"`);
      }
    }
    if (polity.kind === "territory") {
      if (!FALLBACK_STATUSES.has(polity.status)) {
        problems.push(`territory ${polity.tag}: unexpected status ${polity.status}`);
      }
      if (entry.basis === "sovereign-flag") {
        const sovereign = byTag.get(polity.sovereignTag);
        if (sovereign === undefined) {
          problems.push(`territory ${polity.tag}: unknown sovereign ${polity.sovereignTag}`);
        } else {
          const sovereignEntry = polities[sovereign.id];
          if (sovereignEntry === undefined || sovereignEntry.flag !== entry.flag) {
            problems.push(
              `territory ${polity.tag}: flag ${entry.flag} is not the sovereign flag of ${sovereign.tag}`,
            );
          }
        }
      } else if (entry.basis === "documented-exception") {
        if (
          typeof entry.exceptionReason !== "string" ||
          entry.exceptionReason.length < 40
        ) {
          problems.push(`territory ${polity.tag}: exception without a documented reason`);
        }
      } else if (entry.basis === "fallback") {
        if (!entry.fallbackReason) {
          problems.push(`territory ${polity.tag}: fallback without a reason`);
        }
      } else {
        problems.push(`territory ${polity.tag}: invalid basis ${String(entry.basis)}`);
      }
    } else if (polity.status === "independent" || polity.status === "personal-union") {
      if (entry.basis === "sovereign-flag") {
        problems.push(`state ${polity.tag}: independent state cannot use a sovereign-flag basis`);
      }
    }
  }

  // Every flag must be used by at least one polity, so no orphan artwork ships.
  const used = new Set(
    Object.values(polities)
      .map((entry) => entry.flag)
      .filter((flag) => typeof flag === "string"),
  );
  for (const id of Object.keys(flags)) {
    if (!used.has(id)) problems.push(`flag ${id}: not referenced by any polity`);
  }

  // Stable-ID rule: mapping keys must be the catalog's numeric IDs.
  for (const key of Object.keys(polities)) {
    if (!/^\d+$/.test(key)) problems.push(`polity key ${key} is not a numeric polity ID`);
  }
  const tags = new Map();
  for (const entry of Object.values(polities)) {
    if (tags.has(entry.tag)) problems.push(`duplicate polity tag ${entry.tag}`);
    tags.set(entry.tag, true);
  }

  if (manifest.meta?.referenceDate !== "1900-01-01") {
    problems.push("manifest.meta.referenceDate must be 1900-01-01");
  }
  if (manifest.meta?.retrievalDate === undefined) {
    problems.push("manifest.meta.retrievalDate missing");
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* Commons verification                                                */
/* ------------------------------------------------------------------ */

function normalizeArtist(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function apiQuery(params) {
  const url = new URL(API);
  for (const [key, value] of Object.entries({
    format: "json",
    formatversion: "2",
    ...params,
  })) {
    url.searchParams.set(key, String(value));
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.status === 429) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`Commons API returned ${response.status}`);
    return response.json();
  }
  throw new Error("Commons API rate limit persisted");
}

async function fetchSourceInfo(flag) {
  const data = await apiQuery({
    action: "query",
    titles: flag.sourceTitle,
    prop: "imageinfo",
    iiprop: "url|size|sha1|extmetadata",
    iiurlwidth: String(TARGET_RASTER_WIDTH),
  });
  const page = data.query?.pages?.[0];
  if (page === undefined || page.missing === true) {
    throw new Error(`Commons file not found: ${flag.sourceTitle}`);
  }
  const info = page.imageinfo?.[0];
  if (info === undefined) throw new Error(`Commons file has no imageinfo: ${flag.sourceTitle}`);
  const metadata = info.extmetadata ?? {};
  const licenseCode = metadata.License?.value ?? null;
  const licenseShort = metadata.LicenseShortName?.value ?? null;
  const artist = normalizeArtist(metadata.Artist?.value);
  return {
    title: page.title,
    width: info.width,
    height: info.height,
    sha1: info.sha1,
    originalUrl: String(info.url).replace(/\?utm_[^#]*$/, ""),
    descriptionUrl: info.descriptionurl,
    thumbUrl: info.thumburl ?? null,
    thumbWidth: info.thumbwidth ?? null,
    thumbHeight: info.thumbheight ?? null,
    licenseCode,
    licenseShort,
    artist,
  };
}

function coreAuthor(value) {
  return normalizeArtist(value)
    .replace(/^No machine-readable author provided\.\s*/i, "")
    .replace(/\s+assumed \(based on copyright claims\)\.?$/i, "")
    .replace(/\s+The source code of this SVG is valid.*$/i, "")
    .replace(/\s+This vector image was created with Inkscape.*$/i, "")
    .replace(/\s*\(\s*talk\s*\)\.?\s*$/i, "")
    .replace(/^See file history below.*$/i, "")
    .replace(/\s+\(per the file description;.*$/i, "")
    .replace(/\s+\(Commons author field;.*$/i, "")
    .replace(/\s+\(public-domain flag design\)$/i, "")
    .replace(/^Unknown author( Unknown author)?$/i, "Unknown author")
    .trim();
}

function verifySourceInfo(flag, info, { allowArtistDrift = false } = {}) {
  const problems = [];
  if (info.sha1 !== flag.sourceSha1) {
    problems.push(`source SHA-1 changed (was ${flag.sourceSha1}, now ${info.sha1})`);
  }
  if (info.width !== flag.sourceWidth || info.height !== flag.sourceHeight) {
    problems.push(
      `source dimensions changed (was ${flag.sourceWidth}x${flag.sourceHeight}, now ${info.width}x${info.height})`,
    );
  }
  if (!ALLOWED_LICENSE_CODES.has(info.licenseCode)) {
    problems.push(`licence is ${info.licenseShort} (${info.licenseCode}), not PD/CC0`);
  }
  if (info.licenseCode !== flag.licenseCode) {
    problems.push(`licence code changed (was ${flag.licenseCode}, now ${info.licenseCode})`);
  }
  if (info.licenseShort !== flag.license) {
    problems.push(`licence label changed (was ${flag.license}, now ${info.licenseShort})`);
  }
  if (!allowArtistDrift) {
    const expected = coreAuthor(flag.author);
    const actual = coreAuthor(info.artist);
    if (actual !== "" && expected !== "" && actual !== expected) {
      problems.push(`author changed (was "${expected}", now "${actual}")`);
    }
  }
  if (info.descriptionUrl !== flag.sourcePageUrl) {
    problems.push(`source page changed (${info.descriptionUrl})`);
  }
  return problems;
}

async function fetchRendition(info, flag) {
  if (info.thumbUrl === null || info.thumbWidth === null || info.thumbHeight === null) {
    throw new Error(`${flag.id}: Commons did not return a raster rendition`);
  }
  if (
    info.thumbWidth < MIN_RASTER_EDGE ||
    info.thumbHeight < MIN_RASTER_EDGE ||
    info.thumbWidth > MAX_RASTER_EDGE ||
    info.thumbHeight > MAX_RASTER_EDGE
  ) {
    throw new Error(`${flag.id}: unsafe rendition dimensions ${info.thumbWidth}x${info.thumbHeight}`);
  }
  let response = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    response = await fetch(info.thumbUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/jpeg,*/*" },
    });
    if (response.status === 429) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(4000 * (attempt + 1));
      response = null;
      continue;
    }
    break;
  }
  if (response === null || !response.ok) {
    throw new Error(`${flag.id}: rendition download failed (${response?.status ?? "rate limit"})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_SOURCE_BYTES) {
    throw new Error(`${flag.id}: rendition is ${buffer.length} bytes (limit ${MAX_SOURCE_BYTES})`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const isPng = buffer.subarray(0, 8).equals(PNG_SIGNATURE);
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const expectedAspect = flag.sourceWidth / flag.sourceHeight;
  const checkNormalized = (png) => {
    if (png.width !== TARGET_RASTER_WIDTH) {
      throw new Error(
        `${flag.id}: PNG width is ${String(png.width)}, expected the normalized ${String(
          TARGET_RASTER_WIDTH,
        )}px`,
      );
    }
    const aspect = png.width / png.height;
    if (Math.abs(aspect - expectedAspect) > 0.01) {
      throw new Error(
        `${flag.id}: PNG aspect ${aspect.toFixed(4)} does not match the source ${expectedAspect.toFixed(4)}`,
      );
    }
  };
  if (isPng) {
    const png = inspectPng(buffer, flag.id);
    checkNormalized(png);
    return { buffer, png, convertedFrom: null };
  }
  if (isJpeg) {
    if (!contentType.includes("jpeg")) {
      throw new Error(`${flag.id}: JPEG bytes with unexpected content-type ${contentType}`);
    }
    if (buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) {
      throw new Error(`${flag.id}: JPEG rendition is truncated`);
    }
    const image = await Jimp.read(buffer);
    const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const png = inspectPng(pngBuffer, flag.id);
    checkNormalized(png);
    return { buffer: pngBuffer, png, convertedFrom: "jpeg" };
  }
  throw new Error(`${flag.id}: rendition is neither PNG nor JPEG`);
}

/* ------------------------------------------------------------------ */
/* Generated outputs                                                   */
/* ------------------------------------------------------------------ */

function buildLedger(manifest, assets) {
  const entries = {};
  for (const id of Object.keys(manifest.flags).sort()) {
    const asset = assets[id];
    if (asset === undefined) throw new Error(`no built asset for ${id}`);
    entries[id] = {
      file: asset.file,
      sha256: asset.sha256,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      aspectRatio: Number((asset.width / asset.height).toFixed(6)),
    };
  }
  return {
    generatedBy: "scripts/m11/build-flags.mjs",
    rasterWidth: TARGET_RASTER_WIDTH,
    note: "SHA-256 hashes pin the committed PNG renditions. Run `pnpm flags:check` offline; `pnpm flags:audit` re-verifies the Commons licences.",
    assets: entries,
  };
}

function buildMapping(manifest, ledger) {
  const ids = Object.keys(manifest.flags).sort();
  const lines = [];
  lines.push("/**");
  lines.push(" * Generated by scripts/m11/build-flags.mjs. Do not edit by hand.");
  lines.push(" *");
  lines.push(" * Bundled historical flag assets for the 1 January 1900 catalog.");
  lines.push(" * Keyed by stable numeric polity ID; display names are never used.");
  lines.push(" */");
  lines.push('import type { ImageSourcePropType } from "react-native";');
  lines.push("");
  ids.forEach((id, index) => {
    lines.push(`import flagAsset${String(index)} from "../../assets/flags/${id}.png";`);
  });
  lines.push("");
  lines.push("export interface BundledFlagAsset {");
  lines.push("  readonly id: string;");
  lines.push("  readonly source: ImageSourcePropType;");
  lines.push("  readonly aspectRatio: number;");
  lines.push("}");
  lines.push("");
  lines.push("export const BUNDLED_FLAGS: Readonly<Record<string, BundledFlagAsset>> = {");
  ids.forEach((id, index) => {
    const entry = ledger.assets[id];
    lines.push(
      `  ${JSON.stringify(id)}: { id: ${JSON.stringify(id)}, source: flagAsset${String(
        index,
      )}, aspectRatio: ${String(entry.aspectRatio)} },`,
    );
  });
  lines.push("};");
  lines.push("");
  lines.push("export const FLAG_ASSET_IDS: readonly string[] = [");
  for (const id of ids) lines.push(`  ${JSON.stringify(id)},`);
  lines.push("];");
  lines.push("");
  lines.push("export const POLITY_FLAG: Readonly<Record<number, string>> = {");
  const polityIds = Object.keys(manifest.polities)
    .map(Number)
    .sort((left, right) => left - right);
  for (const polityId of polityIds) {
    const entry = manifest.polities[String(polityId)];
    if (typeof entry.flag !== "string") continue;
    lines.push(`  ${String(polityId)}: ${JSON.stringify(entry.flag)},`);
  }
  lines.push("};");
  lines.push("");
  return `${lines.join("\n")}`;
}

function polityTagsForFlag(manifest, flagId) {
  return Object.keys(manifest.polities)
    .map(Number)
    .sort((left, right) => left - right)
    .filter((id) => manifest.polities[String(id)].flag === flagId)
    .map((id) => manifest.polities[String(id)].tag);
}

function buildProvenanceModule(manifest) {
  const ids = Object.keys(manifest.flags).sort();
  const lines = [];
  lines.push("/**");
  lines.push(" * Generated by scripts/m11/build-flags.mjs. Do not edit by hand.");
  lines.push(" *");
  lines.push(" * Licence and attribution metadata for the bundled historical flags,");
  lines.push(" * shown in the in-game Sources and Licensing dialog.");
  lines.push(" */");
  lines.push("");
  lines.push("export interface FlagProvenanceEntry {");
  lines.push("  readonly id: string;");
  lines.push("  readonly description: string;");
  lines.push("  readonly flagKind: string;");
  lines.push("  readonly sourceType: string;");
  lines.push("  readonly sourcePageUrl: string;");
  lines.push("  readonly license: string;");
  lines.push("  readonly licenseCode: string;");
  lines.push("  readonly author: string;");
  lines.push("  readonly validFrom: string;");
  lines.push("  readonly validTo: string | null;");
  lines.push("  readonly retrievedAt: string;");
  lines.push("  readonly polityTags: readonly string[];");
  lines.push("}");
  lines.push("");
  lines.push("export const FLAG_PROVENANCE: readonly FlagProvenanceEntry[] = [");
  for (const id of ids) {
    const entry = manifest.flags[id];
    lines.push("  {");
    lines.push(`    id: ${JSON.stringify(id)},`);
    lines.push(`    description: ${JSON.stringify(entry.description)},`);
    lines.push(`    flagKind: ${JSON.stringify(flagKindOf(manifest, id))},`);
    lines.push(`    sourceType: ${JSON.stringify(entry.sourceType ?? "commons")},`);
    lines.push(`    sourcePageUrl: ${JSON.stringify(entry.sourcePageUrl)},`);
    lines.push(`    license: ${JSON.stringify(entry.license)},`);
    lines.push(`    licenseCode: ${JSON.stringify(entry.licenseCode)},`);
    lines.push(`    author: ${JSON.stringify(entry.author)},`);
    lines.push(`    validFrom: ${JSON.stringify(entry.validFrom)},`);
    lines.push(`    validTo: ${entry.validTo === null ? "null" : JSON.stringify(entry.validTo)},`);
    lines.push(`    retrievedAt: ${JSON.stringify(entry.retrievedAt)},`);
    lines.push(
      `    polityTags: [${polityTagsForFlag(manifest, id)
        .map((tag) => JSON.stringify(tag))
        .join(", ")}],`,
    );
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  lines.push("export const FLAG_FALLBACKS: readonly { polityId: number; tag: string; reason: string }[] = [");
  const polityIds = Object.keys(manifest.polities)
    .map(Number)
    .sort((left, right) => left - right);
  for (const polityId of polityIds) {
    const entry = manifest.polities[String(polityId)];
    if (typeof entry.flag === "string") continue;
    lines.push("  {");
    lines.push(`    polityId: ${String(polityId)},`);
    lines.push(`    tag: ${JSON.stringify(entry.tag)},`);
    lines.push(`    reason: ${JSON.stringify(entry.fallbackReason)},`);
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  return `${lines.join("\n")}`;
}

function mdEscape(text) {
  return String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildDoc(manifest, catalog) {
  const allPolities = [...catalog.states, ...catalog.territories];
  const byId = new Map(allPolities.map((polity) => [polity.id, polity]));
  const ids = Object.keys(manifest.flags).sort();
  const fallbackIds = Object.keys(manifest.polities)
    .map(Number)
    .sort((left, right) => left - right)
    .filter((id) => manifest.polities[String(id)].flag === null);
  const bundledPolityCount = allPolities.length - fallbackIds.length;
  const projectIds = ids.filter((id) => (manifest.flags[id].sourceType ?? "commons") === "project");
  const externalCount = ids.length - projectIds.length;
  const flagKindCounts = {};
  for (const id of ids) {
    const kind = flagKindOf(manifest, id);
    flagKindCounts[kind] = (flagKindCounts[kind] ?? 0) + 1;
  }
  const statusCounts = {};
  for (const polity of allPolities) {
    const key = `${polity.status}|${manifest.polities[String(polity.id)].basis}`;
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  const lines = [];
  lines.push("# Historical flag provenance — Century 1900");
  lines.push("");
  lines.push(
    "This document records every historical flag bundled for the Century 1900 catalog. The reference date is **1 January 1900**. It is generated from",
  );
  lines.push(
    "`packages/data/data/historical/m11/flags_1900.json` by `scripts/m11/build-flags.mjs`; edit the manifest, not this file.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Polities in the 1900 catalog: **${String(allPolities.length)}**`);
  lines.push(
    `- Bundled flag images: **${String(ids.length)}** (${String(externalCount)} externally sourced, ${String(
      projectIds.length,
    )} project-authored reconstructions)`,
  );
  lines.push(`- Polities displaying a bundled historical flag: **${String(bundledPolityCount)}**`);
  lines.push(`- Polities using the monogram fallback: **${String(fallbackIds.length)}**`);
  lines.push(`- Reference date: **1 January 1900**; assets retrieved **${manifest.meta.retrievalDate}**`);
  lines.push(
    `- Artwork source: **Wikimedia Commons plus project-authored reconstructions**; licence policy: ${manifest.meta.licensePolicy}`,
  );
  lines.push("");
  lines.push("### Flag-kind counts");
  lines.push("");
  lines.push("| Flag kind | Count |");
  lines.push("| --- | ---: |");
  for (const kind of Object.keys(flagKindCounts).sort()) {
    lines.push(`| ${mdEscape(kind)} | ${String(flagKindCounts[kind])} |`);
  }
  lines.push("");
  lines.push("### Polity basis counts");
  lines.push("");
  lines.push("| Status | Basis | Polities |");
  lines.push("| --- | --- | ---: |");
  for (const key of Object.keys(statusCounts).sort()) {
    const [status, basis] = key.split("|");
    lines.push(`| ${mdEscape(status)} | ${mdEscape(basis)} | ${String(statusCounts[key])} |`);
  }
  lines.push("");
  lines.push("## Licensing and verification method");
  lines.push("");
  lines.push(
    "Each file was checked individually through the Wikimedia Commons API (`prop=imageinfo`, `iiprop=extmetadata`). A file is bundled only when the API reports licence code `pd` (Public domain, including PD-old, PD-self and PD-ineligible) or `cc0` (Creative Commons Zero). The script aborts if the reported licence, source SHA-1, author or file page changes. Category-wide assumptions are never used.",
  );
  lines.push("");
  lines.push(
    "The pipeline downloads Wikimedia's PNG rendition of each approved file at a normalized 500 px width, preserving the flag's own aspect ratio, and validates the PNG signature, chunk CRCs, IHDR dimensions, IDAT length and trailing bytes. One approved source is a JPEG (the CC0 1886 Qajar flag); the pipeline converts it to PNG locally with `jimp-compact`, a build-time-only dependency that is already present in the Expo dependency graph. No runtime image library or network access is added to the game.",
  );
  lines.push("");
  lines.push("## Project-authored reconstructions");
  lines.push("");
  lines.push(
    "Two flags are original Century reconstructions rather than externally sourced files. They are rendered deterministically at build time from documented designs and are dedicated to the public domain by the project. Their historical sources are recorded separately from Century's authorship; no share-alike or restricted artwork was traced or copied.",
  );
  lines.push("");
  for (const id of projectIds) {
    const flag = manifest.flags[id];
    lines.push(`- **\`${id}\`** — ${mdEscape(flag.description)}. ${mdEscape(flag.historicalNotes)}`);
    for (const component of flag.project.components ?? []) {
      lines.push(
        `  - Component: ${mdEscape(component.role)} — [${component.sourceTitle}](${component.sourcePageUrl}); ${component.license} (${component.licenseCode}); author ${mdEscape(component.author)}.`,
      );
    }
  }
  lines.push("");
  lines.push("## Bundled flags");
  lines.push("");
  for (const id of ids) {
    const flag = manifest.flags[id];
    const polityRefs = Object.keys(manifest.polities)
      .map(Number)
      .sort((left, right) => left - right)
      .filter((polityId) => manifest.polities[String(polityId)].flag === id)
      .map(
        (polityId) =>
          `\`${manifest.polities[String(polityId)].tag}\` (ID ${String(polityId)})`,
      );
    lines.push(`### \`${id}\` — ${mdEscape(flag.description)}`);
    lines.push("");
    lines.push(`- **Flag kind:** ${mdEscape(flagKindOf(manifest, id))}`);
    lines.push(`- **Polities:** ${polityRefs.join(", ")}`);
    lines.push(
      `- **Validity:** ${flag.validFrom}${flag.validTo === null ? " – no end date recorded (in use on 1 January 1900)" : ` – ${flag.validTo}`}`,
    );
    if ((flag.sourceType ?? "commons") === "project") {
      lines.push(
        `- **Source:** project-authored reconstruction (design \`${flag.project.design}\`), not an externally sourced image.`,
      );
      lines.push(`- **License:** ${flag.license} (${flag.licenseCode}) — ${flag.licenseUrl}`);
      lines.push(`- **Author:** ${mdEscape(flag.author)}`);
      lines.push(`- **Retrieved:** ${flag.retrievedAt}`);
      for (const component of flag.project.components ?? []) {
        lines.push(
          `- **Component:** ${mdEscape(component.role)} — [${component.sourceTitle}](${component.sourcePageUrl}); ${component.license} (${component.licenseCode}); author ${mdEscape(component.author)}; SHA-256 \`${component.sha256}\`.`,
        );
      }
      lines.push(
        `- **Source file:** built by \`scripts/m11/build-flags.mjs\` at ${String(flag.sourceWidth)}×${String(flag.sourceHeight)}; no external flag file is redistributed.`,
      );
    } else {
      lines.push(`- **Source:** [${flag.sourceTitle}](${flag.sourcePageUrl})`);
      lines.push(`- **License:** ${flag.license} (${flag.licenseCode}) — ${flag.licenseUrl}`);
      lines.push(`- **Author:** ${mdEscape(flag.author)}`);
      lines.push(`- **Retrieved:** ${flag.retrievedAt}`);
      lines.push(
        `- **Source file:** [original](${flag.sourceFileUrl}) (${String(flag.sourceWidth)}×${String(flag.sourceHeight)}; SHA-1 \`${flag.sourceSha1}\`)`,
      );
    }
    lines.push(`- **Historical accuracy:** ${mdEscape(flag.historicalNotes)}`);
    lines.push("");
  }
  lines.push("## Monogram fallbacks");
  lines.push("");
  lines.push(
    "A monogram is retained when no historically correct flag artwork can be established from verified PD/CC0 files or a documented project-authored reconstruction. The existing political-status badges remain visible, and the monogram uses the polity's existing national colour.",
  );
  lines.push("");
  lines.push("| Polity | ID | Status | Reason |");
  lines.push("| --- | ---: | --- | --- |");
  for (const id of fallbackIds) {
    const entry = manifest.polities[String(id)];
    const polity = byId.get(id);
    lines.push(
      `| ${mdEscape(polity?.name ?? entry.tag)} (\`${entry.tag}\`) | ${String(id)} | ${mdEscape(
        polity?.status ?? "?",
      )} | ${mdEscape(entry.fallbackReason)} |`,
    );
  }
  lines.push("");
  lines.push("## Dependencies: sovereign flag plus status badge");
  lines.push("");
  lines.push(
    "Dependent territories do not receive invented national flags. By default they display the historically appropriate flag of the sovereign power together with the existing political-status badge (colony, protectorate, occupation, autonomous province, dependency, dominion). The table below records every dependency and any documented exception.",
  );
  lines.push("");
  lines.push("| Polity | ID | Status | Sovereign | Flag | Basis |");
  lines.push("| --- | ---: | --- | --- | --- | --- |");
  for (const polity of allPolities) {
    if (polity.kind !== "territory") continue;
    const entry = manifest.polities[String(polity.id)];
    const flag = entry.flag === null ? "monogram fallback" : `\`${entry.flag}\``;
    const sovereign = entry.sovereignTag ?? polity.sovereignTag ?? "—";
    lines.push(
      `| ${mdEscape(polity.name)} (\`${entry.tag}\`) | ${String(polity.id)} | ${mdEscape(
        polity.status,
      )} | ${mdEscape(sovereign)} | ${flag} | ${mdEscape(entry.basis)} |`,
    );
  }
  lines.push("");
  lines.push("## Verification targets");
  lines.push("");
  lines.push(
    "- **United States** — `usa-45-star`: 45 stars, in use 4 July 1896 – 3 July 1908. The 50-star flag is not used.",
  );
  lines.push(
    "- **German Empire** — `germany-1867`: black-white-red (1867–1918), not the modern black-red-gold.",
  );
  lines.push(
    "- **Russian Empire** — `russia-1896`: white-blue-red, confirmed by the 1896 imperial decree.",
  );
  lines.push(
    "- **Siam** — `siam-1855`: red field with the white elephant, in use 1855–1916.",
  );
  lines.push(
    "- **Qing Empire** — `qing-1889`: yellow dragon flag, in use 1889–1912.",
  );
  lines.push(
    "- **Ottoman Empire** — `ottoman-1844`: red field with white crescent and five-pointed star, the 1844–1922 design.",
  );
  lines.push(
    "- **Canada** — `canada-red-ensign-1868`: the Red Ensign with the 1868 shield, used unofficially from 1870 and approved for use at sea in 1892; the Union Jack remained the official national flag, and the modern maple-leaf flag is not used.",
  );
  lines.push(
    "- **Australia** — `uk-union-1801`: the Union Jack. Australian federation took effect on 1 January 1901, and the Commonwealth blue ensign first flew on 3 September 1901.",
  );
  lines.push(
    "- **Transvaal / South African Republic** — `transvaal-vierkleur`: an original Century reconstruction of the 1857–1902 Vierkleur, built from the documented design. The Commons Vierkleur file is CC BY-SA and was neither used nor traced.",
  );
  lines.push(
    "- **Orange Free State** — `orange-free-state`: the 1857–1902 Orange Free State flag (orange and white stripes with the Netherlands flag in the canton).",
  );
  lines.push(
    "- **Austria-Hungary** — `austria-hungary-civil-ensign`: the common civil ensign of 1869–1918, combining the Austrian red-white-red and Hungarian red-white-green halves with both coats of arms. The dual monarchy had no single unified national flag; the manifest and this document record that distinction. The polity is a single catalog state, not two independent countries.",
  );
  lines.push(
    "- **Spain** — `spain-restoration`: a project-authored red–yellow–red reconstruction with the individually verified PD Restoration-era coat of arms. The Spanish colonies SAH and SGG use the same sovereign flag with their colony status badges.",
  );
  lines.push(
    "- **Montenegro** — `montenegro-1881`: the verified PD red–blue–white national flag with the princely monogram, documented 1881–1905. The 1878 war ensign is not used as the national flag.",
  );
  lines.push(
    "- **Tonga, Sokoto, Ha'il, Crete** — period flags verified on Commons (PD) and recorded with exact/representative flag-kind metadata.",
  );
  lines.push("");
  lines.push("## Offline and runtime guarantees");
  lines.push("");
  lines.push(
    "All PNGs are committed under `packages/app/assets/flags/` and referenced through static imports in `packages/app/src/generated/flagAssets.ts`. The normal game build and `pnpm flags:check` do not access the network. The mapping is keyed by stable numeric polity IDs from `polities_1900.json`; renaming a polity cannot change its flag.",
  );
  lines.push("");
  lines.push("## Reproducing and verifying the assets");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm flags:build    # network: retrieve, verify, convert and rewrite assets, ledger and generated files");
  lines.push("pnpm flags:check    # offline: verify committed assets, hashes and generated outputs");
  lines.push("pnpm flags:audit    # network: re-verify every Commons licence, author and source SHA-1");
  lines.push("pnpm flags:update   # network: deliberately accept a changed rendition and rewrite the ledger");
  lines.push("```");
  lines.push("");
  lines.push("## Remaining limitations and unresolved questions");
  lines.push("");
  lines.push(
    "- Wadai (WAD) and Darfur (DAR) remain documented monogram exceptions: no verified historical national/state flag design could be established from the available sources, and no PD/CC0 artwork documents one. Their independence and marker locations are still represented.",
  );
  lines.push(
    "- Austria-Hungary's map geometry covers the core modern units (Austria, Hungary, Czechia, Slovakia, Slovenia, Croatia, Bosnia and Herzegovina). Galicia, Transylvania, Vojvodina and South Tyrol are not separable at Natural Earth 1:50m admin-0 resolution; the limitation is recorded in the catalog notes.",
  );
  lines.push(
    "- Sokoto, Wadai, Darfur, Ha'il, Crete, Tonga, Tibet, Khiva, Bukhara and Sarawak use marker-only map integration because reliable 1900 polygon boundaries are not available at the map source. Their capitals, labels, statuses and picker entries are fully integrated; the marker approximation is recorded in the map data and the coverage audit.",
  );
  lines.push(
    "- Several states used a plain civil/national tricolour while the state flag carried a coat of arms available only under CC BY-SA on Commons (Serbia, Romania, Bulgaria, Greece). The plain national flag is bundled with a note; the state-flag variant is deliberately not bundled.",
  );
  lines.push(
    "- Ecuador's plain tricolour is shown because the coat of arms became mandatory for the state flag only on 5 December 1900, after the reference date.",
  );
  lines.push(
    "- Brazil's star field changed as states were admitted; the bundled 1889–1960 rendition follows the period design rather than a star-by-star 1900 reconstruction.",
  );
  lines.push(
    "- Persia's Qajar lion-and-sun tricolour was not legally standardised until 1905–1907; the bundled CC0 1886 artwork is period-appropriate, and the note records the lack of a detailed 1900 specification.",
  );
  lines.push(
    "- Canada's Red Ensign was the distinctive de facto flag, while the Union Jack remained the official national flag in 1900; both facts are recorded.",
  );
  lines.push("");
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/* ------------------------------------------------------------------ */
/* Offline checks                                                      */
/* ------------------------------------------------------------------ */

function loadLedger() {
  if (!existsSync(LEDGER_PATH)) fail(`missing ledger: ${LEDGER_PATH} (run pnpm flags:build)`);
  return readJson(LEDGER_PATH);
}

function verifyCommittedAssets(manifest, ledger) {
  const problems = [];
  const assetIds = Object.keys(manifest.flags).sort();
  const ledgerIds = Object.keys(ledger.assets ?? {}).sort();
  if (assetIds.join(",") !== ledgerIds.join(",")) {
    problems.push("ledger asset IDs do not match the manifest flag IDs");
  }
  let totalBytes = 0;
  for (const id of assetIds) {
    const path = join(ASSET_DIR, `${id}.png`);
    const record = ledger.assets?.[id];
    if (record === undefined) {
      problems.push(`${id}: missing ledger entry`);
      continue;
    }
    if (!existsSync(path)) {
      problems.push(`${id}: missing bundled asset ${path}`);
      continue;
    }
    const buffer = readFileSync(path);
    totalBytes += buffer.length;
    const info = inspectPng(buffer, id);
    if (info.sha256 !== record.sha256) problems.push(`${id}: SHA-256 does not match the ledger`);
    if (info.bytes !== record.bytes) problems.push(`${id}: byte size does not match the ledger`);
    if (info.width !== record.width || info.height !== record.height) {
      problems.push(`${id}: dimensions do not match the ledger`);
    }
    if (info.bytes > MAX_BUNDLED_BYTES) {
      problems.push(`${id}: bundled PNG is ${info.bytes} bytes (limit ${MAX_BUNDLED_BYTES})`);
    }
    if (record.file !== `${id}.png`) problems.push(`${id}: unexpected ledger file name`);
    const expectedAspect = Number((info.width / info.height).toFixed(6));
    if (record.aspectRatio !== expectedAspect) problems.push(`${id}: aspect ratio mismatch`);
  }
  const assetsInDirectory = existsSync(ASSET_DIR)
    ? readdirSync(ASSET_DIR)
        .filter((entry) => entry.endsWith(".png"))
        .sort()
    : [];
  const expectedFiles = assetIds.map((id) => `${id}.png`).sort();
  if (assetsInDirectory.join(",") !== expectedFiles.join(",")) {
    problems.push("asset directory contains missing or unreferenced PNG files");
  }
  if (totalBytes > 8 * 1024 * 1024) {
    problems.push(`total bundled flag size ${totalBytes} exceeds 8 MiB`);
  }
  return { problems, totalBytes };
}

function compareGenerated(label, expected, path) {
  if (!existsSync(path)) return [`${label}: generated file is missing (${path})`];
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) return [`${label}: committed output is stale`];
  return [];
}

function runCheck(manifest, catalog, ledger) {
  const problems = [
    ...validateManifest(manifest, catalog),
    ...verifyCommittedAssets(manifest, ledger).problems,
  ];
  problems.push(...compareGenerated("mapping", buildMapping(manifest, ledger), MAPPING_PATH));
  problems.push(...compareGenerated("provenance", buildProvenanceModule(manifest), PROVENANCE_PATH));
  problems.push(...compareGenerated("documentation", buildDoc(manifest, catalog), DOC_PATH));
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    fail(`flag assets are stale or invalid (${String(problems.length)} problem(s))`);
  }
  const totalBytes = verifyCommittedAssets(manifest, ledger).totalBytes;
  process.stdout.write(
    `flag assets are current: ${String(Object.keys(manifest.flags).length)} flags, ${String(
      Object.keys(manifest.polities).length,
    )} polities, ${String(totalBytes)} bytes (offline check)\n`,
  );
}

/* ------------------------------------------------------------------ */
/* Network build / audit                                               */
/* ------------------------------------------------------------------ */

async function runBuild(manifest, catalog, { auditOnly = false } = {}) {
  const problems = validateManifest(manifest, catalog);
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    fail("manifest validation failed");
  }

  // Group identical sources so a flag asset is downloaded and verified once.
  const ids = Object.keys(manifest.flags).sort();
  const built = {};
  for (const id of ids) {
    const flag = manifest.flags[id];
    const sourceType = flag.sourceType ?? "commons";
    let rendition;
    if (sourceType === "project") {
      const componentProblems = validateProjectComponents(flag);
      if (componentProblems.length > 0) {
        for (const problem of componentProblems) process.stderr.write(`  - ${problem}\n`);
        fail("project component verification failed");
      }
      if (auditOnly) {
        for (const component of flag.project.components ?? []) {
          if (!String(component.sourcePageUrl).includes("commons.wikimedia.org/wiki/File:")) continue;
          const data = await apiQuery({
            action: "query",
            titles: component.sourceTitle,
            prop: "imageinfo",
            iiprop: "url|size|sha1|extmetadata",
          });
          const info = data.query?.pages?.[0]?.imageinfo?.[0];
          if (info === undefined) {
            fail(`${id}: component source not found: ${component.sourceTitle}`);
          }
          const licenseCode = info.extmetadata?.License?.value ?? null;
          if (!ALLOWED_LICENSE_CODES.has(licenseCode)) {
            fail(`${id}: component ${component.sourceTitle} is not PD/CC0 (${String(licenseCode)})`);
          }
          if (component.sourceSha1 !== undefined && info.sha1 !== component.sourceSha1) {
            fail(`${id}: component source SHA-1 changed for ${component.sourceTitle}`);
          }
        }
        process.stdout.write(
          `verified ${id}: project-authored reconstruction (${flag.project.design}) with ${
            String(flag.project.components?.length ?? 0)
          } audited component(s)\n`,
        );
        continue;
      }
      rendition = await renderProjectSource(flag);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const info = await fetchSourceInfo(flag);
      const sourceProblems = verifySourceInfo(flag, info);
      if (sourceProblems.length > 0) {
        for (const problem of sourceProblems) process.stderr.write(`  - ${id}: ${problem}\n`);
        fail("source verification failed; review the licence and update the manifest deliberately");
      }
      if (auditOnly) {
        process.stdout.write(
          `verified ${id}: ${info.licenseShort} / ${info.artist || "author not stated"}\n`,
        );
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      rendition = await fetchRendition(info, flag);
      await sleep(1200);
    }
    const png = rendition.png;
    if (png.bytes > MAX_BUNDLED_BYTES) {
      fail(`${id}: bundled PNG is ${png.bytes} bytes (limit ${MAX_BUNDLED_BYTES})`);
    }
    mkdirSync(ASSET_DIR, { recursive: true });
    const path = join(ASSET_DIR, `${id}.png`);
    const previous = existsSync(path) ? readFileSync(path) : null;
    if (previous === null || !previous.equals(rendition.buffer)) {
      writeFileSync(path, rendition.buffer);
    }
    built[id] = {
      file: `${id}.png`,
      sha256: png.sha256,
      bytes: png.bytes,
      width: png.width,
      height: png.height,
    };
    process.stdout.write(
      `bundled ${id}: ${String(png.width)}x${String(png.height)}, ${String(png.bytes)} bytes${
        rendition.convertedFrom === null ? "" : ` (${rendition.convertedFrom})`
      }\n`,
    );
  }
  if (auditOnly) {
    process.stdout.write(
      `licence audit passed for ${String(ids.length)} files (no images written)\n`,
    );
    return;
  }

  // The ledger must be stable: fail if an existing ledger would change.
  const ledger = buildLedger(manifest, built);
  if (existsSync(LEDGER_PATH) && !allowLedgerUpdate) {
    const previous = readJson(LEDGER_PATH);
    const previousAssets = JSON.stringify(previous.assets);
    const nextAssets = JSON.stringify(ledger.assets);
    if (previousAssets !== nextAssets) {
      fail(
        "the downloaded renditions differ from the committed ledger; review the source change and update the ledger deliberately",
      );
    }
  }
  const ledgerText = `${JSON.stringify(ledger, null, 2)}\n`;
  writeIfChanged(LEDGER_PATH, ledgerText);
  writeIfChanged(MAPPING_PATH, buildMapping(manifest, ledger));
  writeIfChanged(PROVENANCE_PATH, buildProvenanceModule(manifest));
  writeIfChanged(DOC_PATH, buildDoc(manifest, catalog));
  const totalBytes = Object.values(ledger.assets).reduce((sum, asset) => sum + asset.bytes, 0);
  process.stdout.write(
    `wrote ${String(ids.length)} flag assets, mapping, provenance module and docs (${String(
      totalBytes,
    )} bytes)\n`,
  );
}

function writeIfChanged(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, "utf8") === content) return;
  writeFileSync(path, content, "utf8");
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

const { manifest, catalog } = loadInputs();

if (mode === "check") {
  runCheck(manifest, catalog, loadLedger());
} else if (mode === "emit") {
  const problems = [
    ...validateManifest(manifest, catalog),
    ...verifyCommittedAssets(manifest, loadLedger()).problems,
  ];
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    fail("manifest or committed assets are invalid");
  }
  const ledger = loadLedger();
  mkdirSync(emitDir, { recursive: true });
  writeFileSync(join(emitDir, "flagAssets.ts"), buildMapping(manifest, ledger), "utf8");
  writeFileSync(join(emitDir, "flagProvenance.ts"), buildProvenanceModule(manifest), "utf8");
  writeFileSync(join(emitDir, "FLAG_PROVENANCE.md"), buildDoc(manifest, catalog), "utf8");
  process.stdout.write(`emitted generated outputs to ${emitDir}\n`);
} else {
  const auditOnly = mode === "audit";
  runBuild(manifest, catalog, { auditOnly }).catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
