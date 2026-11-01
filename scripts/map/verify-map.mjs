/**
 * Runtime verification of the WebGL map in a real browser: picking, click versus
 * drag, zoom anchoring, resizing, world wrapping, hover and selection states, map
 * modes, the country-selection flow and responsive layout.
 *
 * Usage: PLAYTEST_GPU=1 node scripts/map/verify-map.mjs
 * Requires `pnpm -F @century/app export:web` and a Chrome with a real GPU; on a
 * software rasteriser the application deliberately uses the SVG map instead.
 * Exits non-zero if any check fails.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, boot, sleep } from "../m11d/lib/harness.mjs";

mkdirSync(resolve(ROOT, "docs/images/map"), { recursive: true });
const LABEL = process.env.MAP_LABEL ?? "after";
const app = await boot({ fresh: true, port: 8881, cdpPort: 9473, profile: ".cache-map/chrome-verify" });
const setViewport = (width, height, mobile = false) =>
  app.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
await setViewport(1600, 900);

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` — ${detail}`}`);
}

async function waitForText(text, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if ((await app.text()).includes(text)) return;
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

const ENGINE = `Array.from(document.querySelectorAll('canvas')).map((c) => c.parentElement.__mapEngine).filter(Boolean).pop()`;
const engine = (expression) => app.evaluate(`(() => { const e = ${ENGINE}; return ${expression}; })()`);
const canvasBox = () =>
  app.evaluate(`(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const rect = canvases[canvases.length - 1].getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
const mouse = (type, x, y, extra = {}) =>
  app.send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });

async function clickAt(x, y) {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", x, y, { button: "left", clickCount: 1 });
  await sleep(150);
}

async function pageGeo(lon, lat) {
  const box = await canvasBox();
  const point = await engine(`e.screenOf(${lon}, ${lat})`);
  return { x: box.left + point.x, y: box.top + point.y };
}

try {
  await app.navigate("http://127.0.0.1:8881/");
  await waitForText("FABRIC OF NATIONS");
  await sleep(1500);
  check("main menu runs the WebGL map", await engine(`e !== undefined`));
  await app.screenshot(`${LABEL}-main-menu`);
  await app.clickAria("New campaign");
  await waitForText("The world of 1 January 1900");
  await app.clickAria("Continue to country selection");
  await waitForText("Choose a country");
  await sleep(1500);
  await app.screenshot(`${LABEL}-country-selection`);

  // Country selection: choose on the map, then from the list.
  await engine(`e.setView(2, 47, 8)`);
  await sleep(300);
  const paris = await pageGeo(2.35, 48.86);
  await clickAt(paris.x, paris.y);
  await sleep(400);
  check("country selection: a map click selects France", (await app.text()).includes("Play as France"));
  await app.focus('input[aria-label="Search historical countries"]');
  await app.typeText("German");
  await sleep(500);
  const before = await engine(`e.cameraState()`);
  await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith('German Empire'));
    matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0].click();
  })()`);
  await sleep(1000);
  const after = await engine(`e.cameraState()`);
  check(
    "country selection: choosing from the list flies the camera to the country",
    before.x !== after.x || before.y !== after.y,
  );
  await app.screenshot(`${LABEL}-country-selected`);
  await app.clickAria("Play as Germany", { exact: false });
  await waitForText("World map");
  await sleep(2500);

  const provinces = [
    ["Paris basin", 2.35, 48.86, 8, /fr|seine|paris/iu],
    ["Bavaria", 11.6, 48.5, 12, /bavaria/iu],
    ["Sicily", 14.2, 37.5, 12, /sicily/iu],
    ["Tasmania", 146.6, -42, 8, /tasmania/iu],
    ["Honshu", 139.7, 36, 10, /jp|jap|kanto|honshu/iu],
    ["Chukotka beyond the antimeridian", -172, 66, 6, /rus|chuk|anadyr|gap/iu],
  ];
  for (const [name, lon, lat, scale, pattern] of provinces) {
    await engine(`e.setView(${lon}, ${lat}, ${scale})`);
    await sleep(120);
    const box = await canvasBox();
    const screen = await engine(`e.screenOf(${lon}, ${lat})`);
    const key = await engine(`e.provinceKeyAt(${screen.x}, ${screen.y})`);
    check(`hit test: ${name}`, key !== null && pattern.test(key), String(key));
    void box;
  }
  await engine(`e.setView(-30, 40, 3)`);
  await sleep(120);
  const open = await engine(`e.screenOf(-30, 40)`);
  check("hit test: the open Atlantic picks nothing", (await engine(`e.provinceKeyAt(${open.x}, ${open.y})`)) === null);

  // Hit testing must not depend on zoom.
  const keysAtScales = [];
  for (const scale of [3, 6, 12, 24, 48]) {
    await engine(`e.setView(11.6, 48.5, ${scale})`);
    const screen = await engine(`e.screenOf(11.6, 48.5)`);
    keysAtScales.push(await engine(`e.provinceKeyAt(${screen.x}, ${screen.y})`));
  }
  check("hit test: identical at every zoom", new Set(keysAtScales).size === 1, keysAtScales[0]);

  // Click selects; the same gesture with travel pans and does not.
  await engine(`e.setView(10, 50, 6)`);
  await sleep(200);
  const munich = await pageGeo(11.6, 48.1);
  await clickAt(munich.x, munich.y);
  await sleep(300);
  const panelAfterClick = await app.text();
  check("click selects the province", /Province \d+/u.test(panelAfterClick));
  const selectionText = panelAfterClick.match(/Province \d+/u)?.[0] ?? "";
  const dragStart = await pageGeo(5, 47);
  const dragCamera = await engine(`e.cameraState()`);
  await mouse("mouseMoved", dragStart.x, dragStart.y);
  await mouse("mousePressed", dragStart.x, dragStart.y, { button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 12; step += 1) {
    await mouse("mouseMoved", dragStart.x + step * 8, dragStart.y + step * 2, { button: "left", buttons: 1 });
  }
  await mouse("mouseReleased", dragStart.x + 96, dragStart.y + 24, { button: "left", clickCount: 1 });
  await sleep(500);
  const afterDrag = await app.text();
  check("drag pans the camera", (await engine(`e.cameraState()`)).x !== dragCamera.x);
  check("drag does not select a province", afterDrag.includes(selectionText));

  // Sub-threshold jitter is still a click.
  await engine(`e.setView(10, 50, 6)`);
  await sleep(150);
  const steady = await engine(`e.cameraState()`);
  const berlin = await pageGeo(13.4, 52.5);
  await mouse("mouseMoved", berlin.x, berlin.y);
  await mouse("mousePressed", berlin.x, berlin.y, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseMoved", berlin.x + 2, berlin.y + 1, { button: "left", buttons: 1 });
  await mouse("mouseReleased", berlin.x + 2, berlin.y + 1, { button: "left", clickCount: 1 });
  await sleep(250);
  const shifted = await engine(`e.cameraState()`);
  check("a small pointer jitter stays a click", steady.x === shifted.x && steady.y === shifted.y);

  // Zoom keeps the point under the cursor fixed.
  await engine(`e.setView(14, 47, 4)`);
  await sleep(200);
  const box = await canvasBox();
  const focus = { x: box.left + 420, y: box.top + 330 };
  const geoBefore = await engine(`e.geoAt(420, 330)`);
  await mouse("mouseMoved", focus.x, focus.y);
  for (let index = 0; index < 6; index += 1) {
    await app.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: focus.x, y: focus.y, deltaX: 0, deltaY: -120 });
    await sleep(40);
  }
  await sleep(700);
  const geoAfter = await engine(`e.geoAt(420, 330)`);
  const drift = Math.hypot(geoBefore.lon - geoAfter.lon, geoBefore.lat - geoAfter.lat);
  check("wheel zoom keeps the cursor's geography fixed", drift < 0.02, `${drift.toFixed(4)} degrees`);

  // Projection round trip through the live camera at several scales.
  let worstRoundTrip = 0;
  for (const scale of [1.6, 5, 20, 60]) {
    await engine(`e.setView(30, 20, ${scale})`);
    for (const [lon, lat] of [[28, 21], [33, 18], [30, 20]]) {
      const screen = await engine(`e.screenOf(${lon}, ${lat})`);
      const geo = await engine(`e.geoAt(${screen.x}, ${screen.y})`);
      worstRoundTrip = Math.max(worstRoundTrip, Math.abs(geo.lon - lon), Math.abs(geo.lat - lat));
    }
  }
  check("screen and geography round-trip at every scale", worstRoundTrip < 1e-3, worstRoundTrip.toExponential(2));

  // World wrap: panning east across the antimeridian continues seamlessly.
  await engine(`e.setView(170, 0, 3)`);
  await sleep(120);
  const startX = (await engine(`e.cameraState()`)).x;
  await mouse("mouseMoved", box.left + 800, box.top + 400);
  await mouse("mousePressed", box.left + 800, box.top + 400, { button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 20; step += 1) {
    await mouse("mouseMoved", box.left + 800 - step * 20, box.top + 400, { button: "left", buttons: 1 });
  }
  await sleep(100);
  await mouse("mouseReleased", box.left + 400, box.top + 400, { button: "left", clickCount: 1 });
  await sleep(500);
  const wrapped = await engine(`e.cameraState()`);
  check("panning across the antimeridian wraps the camera", wrapped.x < startX, `${startX.toFixed(1)} -> ${wrapped.x.toFixed(1)}`);

  // Resize keeps the view centre and stays inside the map.
  await engine(`e.setView(14, 47, 4)`);
  await sleep(120);
  const beforeResize = await engine(`e.cameraState()`);
  await setViewport(1180, 760);
  await sleep(500);
  const afterResize = await engine(`e.cameraState()`);
  const size = await engine(`e.viewportState()`);
  check("resize tracks the container", size.width < 1400, `${size.width}x${size.height}`);
  check("resize keeps the camera centre", Math.abs(beforeResize.x - afterResize.x) < 1e-6);
  await app.screenshot(`${LABEL}-resized-1180`);
  await setViewport(1600, 900);
  await sleep(500);

  // Hover and selection are distinct states.
  await engine(`e.setView(10, 50, 7)`);
  await sleep(300);
  const hoverPoint = await pageGeo(8.5, 50);
  await mouse("mouseMoved", hoverPoint.x, hoverPoint.y);
  await sleep(350);
  const hoverCard = await app.text();
  check("hover shows the province card", /Hesse|Rhine|Palatinate|Nassau|Westphalia/u.test(hoverCard));
  await app.screenshot(`${LABEL}-hover-and-selection`);

  // Map modes change colour without touching geometry.
  await engine(`e.setView(14, 47, 3)`);
  await app.clickAria("Markets", { exact: false }).catch(() => undefined);
  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((n) => (n.textContent ?? '').trim() === 'Markets');
    node?.click();
  })()`);
  await sleep(500);
  await app.screenshot(`${LABEL}-mode-markets`);
  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((n) => (n.textContent ?? '').trim() === 'Control');
    node?.click();
  })()`);
  await sleep(500);
  await app.screenshot(`${LABEL}-mode-control`);
  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((n) => (n.textContent ?? '').trim() === 'Political');
    node?.click();
  })()`);
  await sleep(300);

  // Dock toggle gives the map the whole stage.
  await app.clickAria("Hide details panel");
  await sleep(500);
  await engine(`e.resetView()`);
  await sleep(900);
  await app.screenshot(`${LABEL}-full-stage`);
  await app.clickAria("Show details panel");
  await sleep(300);

  // Narrow screens stack the panels under the map.
  await setViewport(420, 820, true);
  await sleep(900);
  await app.screenshot(`${LABEL}-narrow`);
  await setViewport(1600, 900);
  await sleep(500);

  // Crossing the narrow breakpoint remounts the map; it must come back drawn.
  let stats = await engine(`e.stats()`);
  for (let attempt = 0; attempt < 50 && stats.frames === 0; attempt += 1) {
    await sleep(100);
    stats = await engine(`e.stats()`);
  }
  check("the map redraws after a layout remount", stats.frames > 0, `${stats.frames} frames`);
  await sleep(500);
  await app.screenshot(`${LABEL}-after-remount`);
  const problems = JSON.parse(await app.evaluate(`JSON.stringify(window.__m11d)`));
  check("no page errors", problems.errors.length === 0, problems.errors.join(" | "));
  check("no unhandled rejections", problems.rejections.length === 0, problems.rejections.join(" | "));
} catch (error) {
  check("verification script completed", false, String(error));
} finally {
  const failed = results.filter((entry) => !entry.passed);
  writeFileSync(resolve(ROOT, `.cache-map/verify-${LABEL}.json`), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\n${String(results.length - failed.length)}/${String(results.length)} checks passed`);
  await app.close?.();
  process.exit(failed.length === 0 ? 0 : 1);
}
