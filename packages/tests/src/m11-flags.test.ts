/**
 * M11 historical flags: catalog coverage, dependency policy, licensing,
 * offline assets, stable-ID mapping, PNG integrity and pipeline reproducibility.
 *
 * The React Native renderer is not part of this test environment, so rendering
 * is covered by exercising the same pure layout function the `CountryFlag`
 * component uses, plus source-level smoke checks that the component wires the
 * asset, the 32 px box and the monogram fallback correctly.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fitFlagInBox } from "../../app/src/flags/flagLayout.js";
import { resolveBundledFlagId } from "../../app/src/flags/flagMapping.js";
import { COUNTRY_FLAG_SIZES, SMALLEST_COUNTRY_FLAG_BOX } from "../../app/src/flags/flagSizes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const DATA = join(ROOT, "packages/data/data/historical/m11");
const APP = join(ROOT, "packages/app");
const ASSET_DIR = join(APP, "assets/flags");
const SCRIPT = join(ROOT, "scripts/m11/build-flags.mjs");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const manifest = JSON.parse(readFileSync(join(DATA, "flags_1900.json"), "utf8")) as {
  meta: {
    version: string;
    referenceDate: string;
    retrievalDate: string;
    rasterWidth: number;
    licensePolicy: string;
    flagKinds?: Record<string, string>;
  };
  flags: Record<
    string,
    {
      id: string;
      description: string;
      sourceTitle: string;
      sourcePageUrl: string;
      sourceFileUrl: string;
      sourceSha1: string | null;
      sourceWidth: number;
      sourceHeight: number;
      sourceType: "commons" | "project";
      flagKind: string;
      project?: {
        design: string;
        width: number;
        height: number;
        components?: readonly {
          role: string;
          path: string;
          sha256: string;
          sourcePageUrl: string;
          license: string;
          licenseCode: string;
          author: string;
        }[];
      };
      license: string;
      licenseCode: string;
      licenseUrl: string;
      author: string;
      validFrom: string;
      validTo: string | null;
      retrievedAt: string;
      historicalNotes: string;
    }
  >;
  polities: Record<
    string,
    {
      tag: string;
      flag: string | null;
      basis: string;
      sovereignTag?: string;
      fallbackReason?: string;
      exceptionReason?: string;
    }
  >;
};

const catalog = JSON.parse(readFileSync(join(DATA, "polities_1900.json"), "utf8")) as {
  states: {
    id: number;
    tag: string;
    name: string;
    kind: string;
    status: string;
    sovereignTag: string | null;
  }[];
  territories: {
    id: number;
    tag: string;
    name: string;
    kind: string;
    status: string;
    sovereignTag: string | null;
  }[];
};

const ledger = JSON.parse(readFileSync(join(ASSET_DIR, "ledger.json"), "utf8")) as {
  rasterWidth: number;
  assets: Record<
    string,
    {
      file: string;
      sha256: string;
      bytes: number;
      width: number;
      height: number;
      aspectRatio: number;
    }
  >;
};

const mappingSource = readFileSync(join(APP, "src/generated/flagAssets.ts"), "utf8");
const provenanceSource = readFileSync(join(APP, "src/generated/flagProvenance.ts"), "utf8");
const doc = readFileSync(join(ROOT, "docs/FLAG_PROVENANCE.md"), "utf8");
const allPolities = [...catalog.states, ...catalog.territories];
const catalogById = new Map(allPolities.map((polity) => [polity.id, polity]));
const catalogByTag = new Map(allPolities.map((polity) => [polity.tag, polity]));

function appSource(relativePath: string): string {
  return readFileSync(join(APP, relativePath), "utf8");
}

function readPng(path: string): {
  width: number;
  height: number;
  bytes: number;
  sha256: string;
} {
  const buffer = readFileSync(path);
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(buffer.toString("ascii", 12, 16)).toBe("IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function mappingPairs(): { polityId: number; flagId: string }[] {
  const pairs: { polityId: number; flagId: string }[] = [];
  for (const match of mappingSource.matchAll(/^\s{2}(\d+): "([^"]+)",$/gm)) {
    pairs.push({ polityId: Number(match[1]), flagId: match[2] ?? "" });
  }
  return pairs;
}

function importedAssets(): string[] {
  return [...mappingSource.matchAll(/^import flagAsset\d+ from "\.\.\/\.\.\/assets\/flags\/([^"]+)\.png";$/gm)].map(
    (match) => match[1] ?? "",
  );
}

function bundledAssetIds(): string[] {
  return [...mappingSource.matchAll(/^\s{2}"([^"]+)": \{ id: "/gm)].map((match) => match[1] ?? "");
}

function runPipeline(args: readonly string[]): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

describe("M11 historical flags — catalog coverage", () => {
  test("every polity in the 1900 catalog has a flag or an explicit fallback reason", () => {
    expect(allPolities).toHaveLength(133);
    expect(Object.keys(manifest.polities)).toHaveLength(133);

    for (const polity of allPolities) {
      const entry = manifest.polities[String(polity.id)];
      expect(entry).toBeDefined();
      expect(entry?.tag).toBe(polity.tag);
      if (entry?.flag === null) {
        expect(entry.basis).toBe("fallback");
        expect(entry.fallbackReason?.length ?? 0).toBeGreaterThan(40);
      } else {
        expect(typeof entry?.flag).toBe("string");
        expect(manifest.flags[entry?.flag ?? ""]).toBeDefined();
      }
    }
  });

  test("no monogram fallbacks remain; Wadai and Darfur use user-selected representative flags", () => {
    const fallbacks = Object.entries(manifest.polities)
      .filter(([, entry]) => entry.flag === null)
      .map(([id, entry]) => `${id}:${entry.tag}`)
      .sort();
    expect(fallbacks).toEqual([]);
    expect(manifest.polities["63"]?.flag).toBe("wadai-user-selected");
    expect(manifest.polities["64"]?.flag).toBe("darfur-user-selected");
    expect(manifest.polities["63"]?.basis).toBe("user-selected-representative");
    expect(manifest.polities["64"]?.basis).toBe("user-selected-representative");
  });

  test("the verification-target flags are the period designs", () => {
    const flagForTag = (tag: string) => {
      const polity = catalogByTag.get(tag);
      const entry = polity === undefined ? undefined : manifest.polities[String(polity.id)];
      return entry?.flag === null || entry === undefined ? null : manifest.flags[entry.flag];
    };
    expect(flagForTag("USA")?.description).toMatch(/45 stars/);
    expect(flagForTag("USA")?.validFrom).toBe("1896-07-04");
    expect(flagForTag("DEU")?.description).toMatch(/Black-white-red/);
    expect(flagForTag("RUS")?.description).toMatch(/White-blue-red/);
    expect(flagForTag("THA")?.description).toMatch(/white elephant/i);
    expect(flagForTag("CHN")?.description).toMatch(/Yellow dragon/);
    expect(flagForTag("OTT")?.description).toMatch(/crescent and star/i);
    expect(flagForTag("CAN")?.description).toMatch(/Red Ensign/);
    expect(flagForTag("AUS")?.description).toMatch(/Union Flag/);
    expect(flagForTag("ORF")?.description).toMatch(/Orange Free State/);
    expect(flagForTag("ZAR")?.description).toMatch(/Vierkleur/);
    expect(flagForTag("ESP")?.description).toMatch(/Restoration-era Spanish/);
    expect(flagForTag("MNT")?.description).toMatch(/Montenegrin/);
    expect(flagForTag("AUT")?.description).toMatch(/Austria-Hungary/);
    expect(flagForTag("TON")?.description).toMatch(/Tonga/);
    expect(flagForTag("CRT")?.description).toMatch(/Cretan/);
    expect(flagForTag("SOK")?.description).toMatch(/Sokoto/);
    expect(flagForTag("SHM")?.description).toMatch(/Ha'il/);
    expect(flagForTag("USA")?.historicalNotes).toMatch(/50-star/);
    expect(flagForTag("CAN")?.historicalNotes).toMatch(/Union Jack remained/);
    expect(flagForTag("AUT")?.historicalNotes).toMatch(/no single unified national flag/i);
  });
});

describe("M11 historical flags — dependency policy", () => {
  test("every dependency uses the sovereign flag plus status badge, or documents an exception", () => {
    const exceptions: string[] = [];
    for (const polity of catalog.territories) {
      const entry = manifest.polities[String(polity.id)];
      if (entry === undefined) throw new Error(`missing mapping for ${polity.tag}`);
      expect(entry).toBeDefined();
      if (entry.basis === "sovereign-flag") {
        expect(polity.sovereignTag).not.toBeNull();
        const sovereign = catalogByTag.get(polity.sovereignTag ?? "");
        if (sovereign === undefined) throw new Error(`unknown sovereign for ${polity.tag}`);
        const sovereignEntry = manifest.polities[String(sovereign.id)];
        if (sovereignEntry === undefined) {
          throw new Error(`missing sovereign mapping for ${sovereign.tag}`);
        }
        expect(entry.flag).toBe(sovereignEntry.flag);
        expect(entry.flag).not.toBeNull();
      } else if (entry.basis === "documented-exception") {
        exceptions.push(entry.tag);
        expect(entry.exceptionReason?.length ?? 0).toBeGreaterThan(60);
      } else if (entry.basis === "fallback") {
        expect(entry.fallbackReason?.length ?? 0).toBeGreaterThan(40);
      } else {
        throw new Error(`${entry.tag}: unexpected dependency basis ${entry.basis}`);
      }
    }
    expect(exceptions).toEqual(["EGY"]);
    expect(manifest.polities[String(catalogByTag.get("EGY")?.id)]?.flag).toBe("egypt-1882");
  });

  test("the existing political-status badges remain in the flag-bearing surfaces", () => {
    const selection = appSource("src/screens/CountrySelectionScreen.tsx");
    expect(selection).toContain("<CountryFlag");
    expect(selection).toContain("size=\"picker\"");
    expect(selection).toContain("size=\"detail\"");
    expect(selection).toContain("<Badge label={selected.status}");

    const country = appSource("src/screens/CountryScreen.tsx");
    expect(country).toContain("<CountryFlag");
    expect(country).toContain("<Badge label={meta.status}");

    const shell = appSource("src/screens/GameShell.tsx");
    expect(shell.match(/<CountryFlag/g)?.length).toBe(2);
    expect(shell).toContain("size=\"topBar\"");
    expect(shell).toContain("size=\"detail\"");
    expect(shell).toContain("statusLabel(status)");
    expect(shell).toContain("statusLabel(entry.status)");

    const app = readFileSync(join(APP, "App.tsx"), "utf8");
    expect(app).toContain("BRIEFING_FLAG_POLITIES");
    expect(app).toContain("<CountryFlag");
    expect(app).toContain("<Badge label={flag.license}");

    // Map visualisation is unchanged: no flags are drawn over the map.
    const map = appSource("src/components/WorldMap.tsx");
    expect(map).not.toContain("CountryFlag");
    expect(map).not.toContain("flagAssets");
  });
});

describe("M11 historical flags — bundled assets and stable mapping", () => {
  test("all bundled assets exist, are valid PNGs and match the ledger", () => {
    const assetIds = Object.keys(manifest.flags).sort();
    expect(importedAssets().sort()).toEqual(assetIds);
    expect(bundledAssetIds().sort()).toEqual(assetIds);
    expect(Object.keys(ledger.assets).sort()).toEqual(assetIds);

    let totalBytes = 0;
    for (const id of assetIds) {
      const record = ledger.assets[id];
      expect(record).toBeDefined();
      expect(record?.file).toBe(`${id}.png`);
      const path = join(ASSET_DIR, `${id}.png`);
      expect(existsSync(path)).toBe(true);
      const png = readPng(path);
      expect(png.width).toBe(record?.width);
      expect(png.height).toBe(record?.height);
      expect(png.bytes).toBe(record?.bytes);
      expect(png.sha256).toBe(record?.sha256);
      expect(png.width).toBe(manifest.meta.rasterWidth);
      expect(png.width).toBeGreaterThanOrEqual(32);
      expect(png.height).toBeGreaterThanOrEqual(32);
      const sourceAspect = (manifest.flags[id]?.sourceWidth ?? 1) / (manifest.flags[id]?.sourceHeight ?? 1);
      expect(Math.abs(png.width / png.height - sourceAspect)).toBeLessThan(0.01);
      expect(png.bytes).toBeLessThanOrEqual(512 * 1024);
      totalBytes += png.bytes;
    }
    expect(totalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);

    const directoryFiles = readdirSync(ASSET_DIR).sort();
    expect(directoryFiles).toEqual(
      [...assetIds.map((id) => `${id}.png`), "ledger.json", "source"].sort(),
    );
    expect(readFileSync(join(ASSET_DIR, "ledger.json"), "utf8")).toContain('"generatedBy": "scripts/m11/build-flags.mjs"');
  });

  test("the mapping uses stable numeric polity IDs only", () => {
    const pairs = mappingPairs();
    expect(pairs.length).toBeGreaterThan(100);
    for (const pair of pairs) {
      expect(Number.isInteger(pair.polityId)).toBe(true);
      expect(catalogById.has(pair.polityId)).toBe(true);
      expect(manifest.polities[String(pair.polityId)]?.flag).toBe(pair.flagId);
      expect(manifest.flags[pair.flagId]).toBeDefined();
    }
    for (const key of Object.keys(manifest.polities)) {
      expect(/^\d+$/.test(key)).toBe(true);
    }

    // The scenario's runtime country IDs are the same stable IDs the picker
    // and the snapshot use, so a snapshot country always resolves its flag.
    const scenario = JSON.parse(
      readFileSync(join(DATA, "../../scenarios/m11_world_1900.json"), "utf8"),
    ) as { meta: { countryMeta: { countryId: number }[] } };
    const scenarioIds = scenario.meta.countryMeta
      .map((entry) => entry.countryId)
      .sort((left, right) => left - right);
    const stateIds = catalog.states.map((entry) => entry.id).sort((left, right) => left - right);
    expect(scenarioIds).toEqual(stateIds);
    for (const id of scenarioIds) {
      expect(manifest.polities[String(id)]).toBeDefined();
      if (manifest.polities[String(id)]?.flag !== null) {
        expect(mappingSource).toContain(`  ${String(id)}: "`);
      }
    }

    // Fallbacks must not get an asset entry.
    for (const [id, entry] of Object.entries(manifest.polities)) {
      if (entry.flag === null) {
        expect(mappingSource).not.toContain(`  ${id}: "`);
      }
    }

    expect(mappingSource).not.toMatch(/\.name\b|commonName|displayName/);
    const registry = appSource("src/flags/flagRegistry.ts");
    expect(registry).toContain("resolveBundledFlagId(polityId, POLITY_FLAG)");
    expect(registry).not.toMatch(/\.name\b|commonName/);
  });

  test("no SVG source is retained; any future SVG must be script-free", () => {
    const svgs = readdirSync(ASSET_DIR).filter((file) => file.endsWith(".svg"));
    expect(svgs).toEqual([]);
    for (const file of svgs) {
      const text = readFileSync(join(ASSET_DIR, file), "utf8");
      expect(text).not.toMatch(/<script|onload\s*=|onerror\s*=|xlink:href\s*=\s*"https?:|href\s*=\s*"https?:|<!ENTITY/i);
    }
  });

  test("no runtime network request is needed to display a flag", () => {
    for (const path of [
      "src/components/CountryFlag.tsx",
      "src/flags/flagRegistry.ts",
      "src/flags/flagMapping.ts",
      "src/flags/flagSizes.ts",
      "src/flags/flagLayout.ts",
      "src/generated/flagAssets.ts",
    ]) {
      const text = appSource(path);
      expect(text).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
    }
    // Provenance URLs are display data, not requests.
    expect(provenanceSource).toContain("https://commons.wikimedia.org/wiki/File:");
    expect(provenanceSource).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
    expect(mappingSource).toMatch(/from "\.\.\/\.\.\/assets\/flags\//);
  });
});

describe("M11 historical flags — rendering at the smallest size", () => {
  test("the specified display boxes are used", () => {
    expect(COUNTRY_FLAG_SIZES.topBar).toEqual({ width: 32, height: 22 });
    expect(COUNTRY_FLAG_SIZES.picker).toEqual({ width: 48, height: 32 });
    expect(COUNTRY_FLAG_SIZES.detail).toEqual({ width: 96, height: 64 });
    expect(SMALLEST_COUNTRY_FLAG_BOX).toEqual({ width: 32, height: 22 });
  });

  test("every bundled flag fits the 32 x 22 box without distortion", () => {
    for (const id of Object.keys(ledger.assets)) {
      const asset = ledger.assets[id];
      const layout = fitFlagInBox(SMALLEST_COUNTRY_FLAG_BOX, asset?.aspectRatio ?? 1.5);
      expect(layout.width).toBeGreaterThanOrEqual(1);
      expect(layout.height).toBeGreaterThanOrEqual(1);
      expect(layout.width).toBeLessThanOrEqual(32);
      expect(layout.height).toBeLessThanOrEqual(22);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.left + layout.width).toBeLessThanOrEqual(32);
      expect(layout.top + layout.height).toBeLessThanOrEqual(22);
      const renderedAspect = layout.width / layout.height;
      expect(Math.abs(renderedAspect - (asset?.aspectRatio ?? 1.5))).toBeLessThan(0.15);
    }
  });

  test("the CountryFlag component contains the image, the contain fit and the monogram fallback", () => {
    const component = appSource("src/components/CountryFlag.tsx");
    expect(component).toContain("flagAssetForPolity");
    expect(component).toContain("fitFlagInBox");
    expect(component).toContain("resizeMode=\"contain\"");
    expect(component).toContain("COUNTRY_FLAG_SIZES[size]");
    expect(component).toContain("asset === null");
    expect(component).toContain("nationColor(monogramTag ?? tag)");
    expect(component).toContain("monogramTag");
    expect(component).toContain("<Image");
    expect(component).toContain("<Text");
  });
});

describe("M11 historical flags — fallback behaviour", () => {
  test("unknown and fallback polities resolve to no asset", () => {
    expect(resolveBundledFlagId(0, { 0: "usa-45-star" })).toBe("usa-45-star");
    expect(resolveBundledFlagId(null, { 0: "usa-45-star" })).toBeNull();
    expect(resolveBundledFlagId(undefined, {})).toBeNull();
    expect(resolveBundledFlagId(7, { 0: "usa-45-star" })).toBeNull();
    expect(resolveBundledFlagId(9999, { 0: "usa-45-star" })).toBeNull();
    expect(resolveBundledFlagId(Number.NaN, { 0: "usa-45-star" })).toBeNull();
    expect(resolveBundledFlagId(-1, { 0: "usa-45-star" })).toBeNull();
    const mapping = Object.fromEntries(
      mappingPairs().map((pair) => [pair.polityId, pair.flagId]),
    ) as Readonly<Record<number, string>>;
    expect(resolveBundledFlagId(63, mapping)).toBe("wadai-user-selected");
    expect(resolveBundledFlagId(64, mapping)).toBe("darfur-user-selected");
  });
});

describe("M11 historical flags — licensing and provenance audit", () => {
  test("only individually verified Public Domain or CC0 files and documented project reconstructions are bundled", () => {
    expect(Object.keys(manifest.flags)).toHaveLength(66);
    for (const [id, flag] of Object.entries(manifest.flags)) {
      if (flag.sourceType === "project") {
        expect(flag.licenseCode).toBe("project");
        expect(flag.license).toMatch(/Project-authored/);
        expect(flag.sourcePageUrl).toMatch(/^internal:/);
        expect(["project-reconstruction", "user-selected-representative"]).toContain(
          flag.flagKind ?? manifest.meta.flagKinds?.[id],
        );
        expect(flag.project?.components?.length ?? 0).toBeGreaterThanOrEqual(0);
      } else {
        expect(["pd", "cc0"]).toContain(flag.licenseCode);
        expect(flag.license).not.toMatch(/CC BY|GFDL|share-alike/i);
        expect(flag.sourcePageUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
        expect(flag.sourceFileUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
        expect(flag.sourceSha1).toMatch(/^[0-9a-f]{40}$/);
      }
      expect(flag.author.length).toBeGreaterThan(0);
      expect(flag.retrievedAt).toBe("2026-10-30");
      expect(flag.validFrom).toMatch(/^\d{4}(-\d{2}(-\d{2})?)?$/);
      expect(flag.historicalNotes.length).toBeGreaterThan(40);
      expect(doc).toContain(`\`${id}\``);
      if (flag.sourceType === "project") {
        expect(doc).toContain("project-authored reconstruction");
      } else {
        expect(doc).toContain(flag.sourcePageUrl);
      }
      expect(provenanceSource).toContain(`id: "${id}"`);
    }
    expect(doc).toContain("Austria-Hungary");
    expect(doc).toContain("civil ensign");
    expect(doc).toContain("CC BY-SA");
    expect(doc).toContain("Wadai");
    expect(doc).toContain("Darfur");
    expect(provenanceSource).toContain("FLAG_FALLBACKS");
  });
});

describe("M11 historical flags — reproducible asset pipeline", () => {
  test("the committed assets and generated outputs are current (offline check)", () => {
    const output = runPipeline(["--check"]);
    expect(output).toMatch(/flag assets are current/);
    expect(output).toMatch(/66 flags/);
  }, 60_000);

  test("two independent offline emissions are byte-identical and match the committed outputs", () => {
    const directory = mkdtempSync(join(tmpdir(), "century-flags-"));
    try {
      const first = join(directory, "first");
      const second = join(directory, "second");
      runPipeline(["--emit", first]);
      runPipeline(["--emit", second]);
      for (const file of ["flagAssets.ts", "flagProvenance.ts", "FLAG_PROVENANCE.md"]) {
        const firstBytes = readFileSync(join(first, file));
        expect(firstBytes).toEqual(readFileSync(join(second, file)));
      }
      expect(readFileSync(join(first, "flagAssets.ts"), "utf8")).toBe(mappingSource);
      expect(readFileSync(join(first, "flagProvenance.ts"), "utf8")).toBe(provenanceSource);
      expect(readFileSync(join(first, "FLAG_PROVENANCE.md"), "utf8")).toBe(doc);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
