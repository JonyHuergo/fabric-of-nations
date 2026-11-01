/**
 * M12b Asia playtest: open a real exported campaign and screenshot Asia.
 *
 * Usage: node scripts/m12b/playtest-screenshot-asia.mjs
 * Requires `pnpm -F @century/app export:web` and a Chrome installation.
 *
 * The script resets the map between regions, zooms with the real wheel handler
 * focused on a representative province, and captures one screenshot per region.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { boot, sleep, SHOT_DIR } from "../m11d/lib/harness.mjs";

const country = process.env.PLAYTEST_COUNTRY ?? "German Empire";
const commonName = process.env.PLAYTEST_COMMON ?? "Germany";
const search = process.env.PLAYTEST_SEARCH ?? "German";
const suffix = process.env.PLAYTEST_SHOT ?? "";

const REGIONS = [
  { name: "anatolia-levant", province: "Aleppo", steps: 10 },
  { name: "levant-split", province: "Lebanon", steps: 16 },
  { name: "punjab-kashmir", province: "West Punjab", steps: 12 },
  { name: "persia", province: "Tehran", steps: 10 },
  { name: "india", province: "Bengal", steps: 10 },
  { name: "china", province: "Zhili", steps: 10 },
  { name: "manchuria", province: "Rehe", steps: 12 },
  { name: "japan-korea", province: "Kanto", steps: 12 },
  { name: "korea-split", province: "Gangwon", steps: 16 },
  { name: "indochina", province: "Tonkin", steps: 12 },
  { name: "indonesia", province: "West Java", steps: 12 },
  { name: "siberia", province: "Tobolsk", steps: 10 },
];

const app = await boot({ fresh: true, port: 8878, cdpPort: 9464 });

async function waitForText(text, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await app.text();
    if (body.includes(text)) return true;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

async function screenPointOfProvince(prefix) {
  return app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('svg path[aria-label]')).find((candidate) =>
      (candidate.getAttribute('aria-label') ?? '').startsWith(${JSON.stringify(prefix)}),
    );
    if (node === undefined) return null;
    // Province paths carry three antimeridian copies (-360, 0, +360 degrees), so
    // the element bounding box is the whole world. Sample the path and keep the
    // copy that lies on the central map, then map it through the live CTM.
    const length = node.getTotalLength();
    const ctm = node.getScreenCTM();
    if (ctm === null || length <= 0) return null;
    const point = node.ownerSVGElement.createSVGPoint();
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let index = 0; index <= 240; index += 1) {
      const sample = node.getPointAtLength((length * index) / 240);
      if (sample.x < -2 || sample.x > 1002 || sample.y < -2 || sample.y > 502) continue;
      sumX += sample.x;
      sumY += sample.y;
      count += 1;
    }
    if (count === 0) return null;
    point.x = sumX / count;
    point.y = sumY / count;
    const screen = point.matrixTransform(ctm);
    return { x: screen.x, y: screen.y };
  })()`);
}

async function zoomAt(point, steps) {
  await app.evaluate(`(() => {
    const target = document.elementFromPoint(${String(point.x)}, ${String(point.y)}) ?? document.querySelector('svg');
    if (target === null) return false;
    for (let index = 0; index < ${String(steps)}; index += 1) {
      target.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120,
        clientX: ${String(point.x)},
        clientY: ${String(point.y)},
        bubbles: true,
        cancelable: true,
      }));
    }
    return true;
  })()`);
  await sleep(1800);
}

try {
  await app.navigate("http://127.0.0.1:8878/");
  await waitForText("FABRIC OF NATIONS");
  await app.clickAria("New campaign");
  await waitForText("The world of 1 January 1900");
  await app.clickAria("Continue to country selection");
  await waitForText("Choose a country");
  await sleep(1000);
  const focused = await app.focus('input[aria-label="Search historical countries"]');
  if (!focused) throw new Error("country search input not found");
  await app.typeText(search);
  await sleep(700);
  const clicked = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith(${JSON.stringify(country)}));
    if (matches.length === 0) return false;
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`${country} row not found`);
  await sleep(1500);
  await app.clickAria(`Play as ${commonName}`, { exact: false });
  await waitForText("World map");
  await sleep(4000);
  await app.screenshot(`m12b-asia-global${suffix}`);

  const results = [];
  for (const region of REGIONS) {
    await app.clickAria("Reset map view");
    await sleep(800);
    const point = await screenPointOfProvince(region.province);
    if (point === null) {
      results.push(`${region.name}: province ${region.province} not found`);
      continue;
    }
    await zoomAt(point, region.steps);
    await app.screenshot(`m12b-asia-${region.name}${suffix}`);
    results.push(
      `${region.name}: ${region.province} at ${Math.round(point.x)},${Math.round(point.y)}`,
    );
  }

  // Deep-zoom province panel on the Indian subcontinent.
  await app.clickAria("Reset map view");
  await sleep(800);
  const bengal = await screenPointOfProvince("Bengal");
  if (bengal !== null) {
    await zoomAt(bengal, 18);
    const provinceClicked = await app.evaluate(`(() => {
      const path = Array.from(document.querySelectorAll('svg path[aria-label]')).find((node) =>
        (node.getAttribute('aria-label') ?? '').startsWith('Bengal'),
      );
      if (path === undefined || path === null) return false;
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    await sleep(1200);
    await app.screenshot(`m12b-asia-province${suffix}`);
    results.push(`province panel click: ${provinceClicked}`);
  }

  const body = await app.text();
  console.log("game loaded:", body.includes("World map"), "date:", body.includes("1900-01-01"));
  for (const line of results) console.log(" ", line);
  console.log("province panel:", body.includes("Province"));

  for (const name of ["m12b-asia-global", ...REGIONS.map((region) => `m12b-asia-${region.name}`), "m12b-asia-province"]) {
    const target = join(SHOT_DIR, `${name}${suffix}.png`);
    if (existsSync(target)) {
      copyFileSync(target, join(SHOT_DIR, "..", `${name}${suffix}.png`));
      console.log(`copied docs/images/${name}${suffix}.png`);
    }
  }
} finally {
  await app.close?.();
}


