/**
 * Pinned, public-domain cartographic inputs of the render bundle.
 *
 * Every file is downloaded once into `.cache-map/` and verified against the
 * SHA-256 below, so a rebuild either reproduces the same inputs or fails loudly.
 * All files are Natural Earth (public domain, https://www.naturalearthdata.com/
 * about/terms-of-use/). Vector layers are pinned to the v5.1.2 repository tag.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..", "..");
export const CACHE = resolve(ROOT, ".cache-map");

const VECTOR_BASE =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson";
const RASTER_BASE = "https://naciscdn.org/naturalearth/50m/raster";

export const SOURCES = {
  land: {
    file: "ne_10m_land.geojson",
    url: `${VECTOR_BASE}/ne_10m_land.geojson`,
    sha256: "1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416",
    title: "Natural Earth 1:10m land",
  },
  minorIslands: {
    file: "ne_10m_minor_islands.geojson",
    url: `${VECTOR_BASE}/ne_10m_minor_islands.geojson`,
    sha256: "8c933ca7a4760256bdc46408355706e39764b0fa01c160c28888b90b4faec29f",
    title: "Natural Earth 1:10m minor islands",
  },
  lakes: {
    file: "ne_10m_lakes.geojson",
    url: `${VECTOR_BASE}/ne_10m_lakes.geojson`,
    sha256: "2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9",
    title: "Natural Earth 1:10m lakes",
  },
  historicLakes: {
    file: "ne_10m_lakes_historic.geojson",
    url: `${VECTOR_BASE}/ne_10m_lakes_historic.geojson`,
    sha256: "43913ce0f5c18fe4d551d628b836af0da59ba193631767b5012a7f97b6a5b615",
    title: "Natural Earth 1:10m historic lakes",
  },
  rivers: {
    file: "ne_10m_rivers_lake_centerlines.geojson",
    url: `${VECTOR_BASE}/ne_10m_rivers_lake_centerlines.geojson`,
    sha256: "bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a",
    title: "Natural Earth 1:10m rivers and lake centerlines",
  },
  shadedRelief: {
    file: "SR_50M.zip",
    url: `${RASTER_BASE}/SR_50M.zip`,
    sha256: "ff810f5f2747463fd8ffa612b23e5f5e5d593a345218976872b6749610976ab7",
    title: "Natural Earth 1:50m shaded relief",
    entry: "SR_50M.tif",
  },
  oceanBottom: {
    file: "OB_50M.zip",
    url: `${RASTER_BASE}/OB_50M.zip`,
    sha256: "7339ee90615232596bbfd67f20c09bbefaef596ab0fdddc45dcb56edc3b98710",
    title: "Natural Earth 1:50m ocean bottom",
    entry: "OB_50M/OB_50M.tif",
  },
};

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Return a verified source file, downloading it into the cache if absent. */
export async function sourceBytes(source) {
  mkdirSync(CACHE, { recursive: true });
  const path = resolve(CACHE, source.file);
  if (!existsSync(path)) {
    console.log(`downloading ${source.url}`);
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`${source.url}: HTTP ${String(response.status)}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  const actual = sha256(bytes);
  if (actual !== source.sha256) {
    throw new Error(`${source.file}: expected sha256 ${source.sha256}, found ${actual}`);
  }
  return bytes;
}

export async function sourceJson(source) {
  return JSON.parse((await sourceBytes(source)).toString("utf8"));
}
