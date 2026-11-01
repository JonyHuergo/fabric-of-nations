/**
 * M12d Americas playtest: open a real exported campaign and screenshot the
 * Americas.
 *
 * Usage: node scripts/m12d/playtest-screenshot-americas.mjs
 * Requires `pnpm -F @century/app export:web` and a Chrome installation.
 *
 * The script resets the map between regions, zooms with the real wheel handler
 * focused on a representative province, and captures one screenshot per region.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { boot, sleep, SHOT_DIR } from "../m11d/lib/harness.mjs";

const country = process.env.PLAYTEST_COUNTRY ?? "United States of America";
const commonName = process.env.PLAYTEST_COMMON ?? "United States";
const search = process.env.PLAYTEST_SEARCH ?? "United States";
const suffix = process.env.PLAYTEST_SHOT ?? "";

const REGIONS = [
  { name: "north-america", province: "Ontario", steps: 9 },
  { name: "united-states", province: "New York", steps: 10 },
  { name: "alaska", province: "Alaska", steps: 9 },
  { name: "greenland", province: "South Greenland", steps: 8 },
  { name: "mexico-central-america", province: "Yucatán", steps: 12 },
  { name: "panama-isthmus", province: "Panama", steps: 18 },
  { name: "caribbean-cuba", province: "La Habana", steps: 16 },
  { name: "caribbean-greater-antilles", province: "El Seibo", steps: 17 },
  { name: "caribbean-lesser-antilles", province: "Trinidad", steps: 19 },
  { name: "caribbean-guadeloupe", province: "Guadeloupe (Basse-Terre)", steps: 21 },
  { name: "caribbean-barbados", province: "Barbados", steps: 24 },
  { name: "guianas", province: "Demerara", steps: 15 },
  { name: "andes", province: "Lima and Callao", steps: 12 },
  { name: "brazil-amazon", province: "Mato Grosso", steps: 11 },
  { name: "southern-cone", province: "Buenos Aires (Federal Capital)", steps: 13 },
  { name: "patagonia", province: "Tierra del Fuego", steps: 10 },
  { name: "falklands", province: "Falkland Islands", steps: 18 },
  { name: "pacific-coast", province: "Valparaíso", steps: 14 },
];

const app = await boot({ fresh: true, port: 8881, cdpPort: 9467 });

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
  await app.navigate("http://127.0.0.1:8881/");
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
    const matches = nodes.filter((node) => (node.textContent ?? '').includes(${JSON.stringify(country)}));
    if (matches.length === 0) return false;
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`${country} row not found`);
  await sleep(1800);
  const playClicked = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const match = nodes.find((node) => (node.textContent ?? '').trim().startsWith('Play as '));
    if (match === undefined) return false;
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  if (!playClicked) {
    await app.clickAria(`Play as ${commonName}`, { exact: false });
  }
  await waitForText("World map");
  await sleep(4000);
  await app.screenshot(`m12d-americas-global${suffix}`);

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
    await app.screenshot(`m12d-americas-${region.name}${suffix}`);
    results.push(
      `${region.name}: ${region.province} at ${Math.round(point.x)},${Math.round(point.y)}`,
    );
  }

  // Deep-zoom province panel on the isthmus.
  await app.clickAria("Reset map view");
  await sleep(800);
  const panama = await screenPointOfProvince("Panama");
  if (panama !== null) {
    await zoomAt(panama, 20);
    const provinceClicked = await app.evaluate(`(() => {
      const path = Array.from(document.querySelectorAll('svg path[aria-label]')).find((node) =>
        (node.getAttribute('aria-label') ?? '').startsWith('Panama'),
      );
      if (path === undefined || path === null) return false;
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    await sleep(1200);
    await app.screenshot(`m12d-americas-province${suffix}`);
    results.push(`province panel click: ${provinceClicked}`);
  }

  const body = await app.text();
  console.log("game loaded:", body.includes("World map"), "date:", body.includes("1900-01-01"));
  for (const line of results) console.log(" ", line);
  console.log("province panel:", body.includes("Province"));

  for (const name of [
    "m12d-americas-global",
    ...REGIONS.map((region) => `m12d-americas-${region.name}`),
    "m12d-americas-province",
  ]) {
    const target = join(SHOT_DIR, `${name}${suffix}.png`);
    if (existsSync(target)) {
      copyFileSync(target, join(SHOT_DIR, "..", `${name}${suffix}.png`));
      console.log(`copied docs/images/${name}${suffix}.png`);
    }
  }
} finally {
  await app.close?.();
}
