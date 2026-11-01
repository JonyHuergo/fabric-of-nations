/**
 * M12e Oceania playtest: open a real exported campaign and screenshot Oceania.
 *
 * Usage: node scripts/m12e/playtest-screenshot-oceania.mjs
 * Requires `pnpm -F @century/app export:web` and a Chrome installation.
 *
 * The script resets the map between regions, zooms with the real wheel handler
 * focused on a representative province, and captures one screenshot per region.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { boot, sleep, SHOT_DIR } from "../m11d/lib/harness.mjs";

const country = process.env.PLAYTEST_COUNTRY ?? "Australian colonies";
const commonName = process.env.PLAYTEST_COMMON ?? "Australian colonies";
const search = process.env.PLAYTEST_SEARCH ?? "Australian";
const suffix = process.env.PLAYTEST_SHOT ?? "";

const REGIONS = [
  { name: "australia", province: "New South Wales", steps: 8 },
  { name: "australia-interior", province: "Northern Territory", steps: 10 },
  { name: "new-zealand", province: "Auckland", steps: 10 },
  { name: "new-guinea", province: "Papua (Central)", steps: 13 },
  { name: "new-guinea-border", province: "Madang", steps: 16 },
  { name: "bismarck", province: "East New Britain", steps: 16 },
  { name: "bougainville", province: "Bougainville", steps: 17 },
  { name: "melanesia-solomons", province: "Solomons (Guadalcanal)", steps: 14 },
  { name: "melanesia-vanuatu", province: "Vanuatu (Shefa)", steps: 16 },
  { name: "new-caledonia", province: "New Caledonia (South Province)", steps: 15 },
  { name: "micronesia", province: "Micronesia (Pohnpei)", steps: 16 },
  { name: "micronesia-marianas", province: "Northern Marianas (Saipan)", steps: 18 },
  { name: "polynesia-samoa", province: "Samoa (Upolu and Savai'i)", steps: 18 },
  { name: "polynesia-tonga", province: "Tongatapu", steps: 20 },
  { name: "fiji", province: "Central Division", steps: 17 },
  { name: "antimeridian", province: "Line Islands", steps: 13 },
  { name: "remotest-pacific", province: "Easter Island (Rapa Nui)", steps: 17 },
  { name: "pitcairn", province: "Pitcairn Islands", steps: 22 },
];

const app = await boot({ fresh: true, port: 8882, cdpPort: 9468 });

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

const VIEW_CENTER = { x: 585, y: 435 };

async function zoomAt(point, steps) {
  // Keep the wheel anchor inside the map SVG. A province whose label sits on the
  // antimeridian can project one pixel outside the viewport, and a wheel event
  // dispatched there would not reach the map's native listener.
  const anchorX = Math.min(Math.max(point.x, 190), 985);
  const anchorY = Math.min(Math.max(point.y, 150), 715);
  await app.evaluate(`(() => {
    const target = document.elementFromPoint(${String(anchorX)}, ${String(anchorY)}) ?? document.querySelector('svg');
    if (target === null) return false;
    for (let index = 0; index < ${String(steps)}; index += 1) {
      target.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120,
        clientX: ${String(anchorX)},
        clientY: ${String(anchorY)},
        bubbles: true,
        cancelable: true,
      }));
    }
    return true;
  })()`);
  await sleep(1800);
}

/**
 * Pan the map so the zoomed province is not stuck against the viewport edge.
 * The Pacific provinces near 180 E are only a few pixels from the left or right
 * edge of the world map at the default view, so a wheel zoom keeps them there.
 */
async function panBy(point, dx, dy) {
  if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return false;
  // Start the drag inside the map frame even when the province itself sits on the
  // viewport edge; the pan delta is what matters, not the grab point.
  const startX = Math.min(Math.max(point.x, 220), 940);
  const startY = Math.min(Math.max(point.y, 200), 680);
  const steps = 8;
  await app.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: startX,
    y: startY,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (let index = 1; index <= steps; index += 1) {
    await app.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: startX + (dx * index) / steps,
      y: startY + (dy * index) / steps,
      button: "left",
      buttons: 1,
    });
    await sleep(40);
  }
  await app.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: startX + dx,
    y: startY + dy,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await sleep(1000);
  return true;
}

/** Bring an edge province toward the centre before zooming. */
async function centreProvince(prefix, point) {
  if (point.x >= 240 && point.x <= 930) return point;
  await panBy(point, VIEW_CENTER.x - point.x, VIEW_CENTER.y - point.y);
  const moved = await screenPointOfProvince(prefix);
  return moved ?? point;
}

async function panToCentre(point) {
  return panBy(point, VIEW_CENTER.x - point.x, VIEW_CENTER.y - point.y);
}

try {
  await app.navigate("http://127.0.0.1:8882/");
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
  await app.screenshot(`m12e-oceania-global${suffix}`);

  const results = [];
  for (const region of REGIONS) {
    await app.clickAria("Reset map view");
    await sleep(800);
    const point = await screenPointOfProvince(region.province);
    if (point === null) {
      results.push(`${region.name}: province ${region.province} not found`);
      continue;
    }
    const centred = await centreProvince(region.province, point);
    await zoomAt(centred, region.steps);
    const panned = await panToCentre(centred);
    await app.screenshot(`m12e-oceania-${region.name}${suffix}`);
    results.push(
      `${region.name}: ${region.province} at ${Math.round(centred.x)},${Math.round(centred.y)}${panned ? " (panned)" : ""}`,
    );
  }

  // Deep-zoom province panel on an Australian colony.
  await app.clickAria("Reset map view");
  await sleep(800);
  const australia = await screenPointOfProvince("New South Wales");
  if (australia !== null) {
    await zoomAt(australia, 20);
    const provinceClicked = await app.evaluate(`(() => {
      const path = Array.from(document.querySelectorAll('svg path[aria-label]')).find((node) =>
        (node.getAttribute('aria-label') ?? '').startsWith('New South Wales'),
      );
      if (path === undefined || path === null) return false;
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    await sleep(1200);
    await app.screenshot(`m12e-oceania-province${suffix}`);
    results.push(`province panel click: ${provinceClicked}`);
  }

  // Reset to the global view for the final coverage check.
  await app.clickAria("Reset map view");
  await sleep(1200);
  await app.screenshot(`m12e-oceania-global-reset${suffix}`);

  const body = await app.text();
  console.log("game loaded:", body.includes("World map"), "date:", body.includes("1900-01-01"));
  for (const line of results) console.log(" ", line);
  console.log("province panel:", body.includes("Province"));

  for (const name of [
    "m12e-oceania-global",
    ...REGIONS.map((region) => `m12e-oceania-${region.name}`),
    "m12e-oceania-province",
    "m12e-oceania-global-reset",
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
