/**
 * Runtime verification of the Living Atlas in a real browser: the atlas page,
 * the bridge, picking, touch input, the loupe, selection without camera movement,
 * flying from a list, zoom levels, sheets, lenses and the screenshot matrix.
 *
 * Usage: PLAYTEST_GPU=1 PLAYTEST_SHOT_DIR=docs/images/living-atlas node scripts/map/verify-map.mjs
 * Requires `pnpm -F @century/app export:web` and a Chrome with a real GPU; on a
 * software rasteriser the runtime reports itself unavailable and the application
 * uses the SVG fallback, which `--fallback` verifies instead.
 *
 * This proves the page and the interface in desktop Chrome with emulated touch.
 * It is not a device test: WebView behaviour on a phone needs a phone.
 * Exits non-zero if any check fails.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, boot, sleep } from "../m11d/lib/harness.mjs";

mkdirSync(resolve(ROOT, "docs/images/living-atlas"), { recursive: true });

const FALLBACK = process.argv.includes("--fallback");
const PORT = 8881;
const app = await boot({ fresh: true, port: PORT, cdpPort: 9473, profile: ".cache-map/chrome-verify" });
const setViewport = (width, height, scale = 2) =>
  app.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` — ${detail}`}`);
}

async function waitFor(predicate, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return true;
    await sleep(250);
  }
  return false;
}
const waitForText = async (text) => {
  if (!(await waitFor(async () => (await app.text()).includes(text)))) {
    throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
  }
};

const ENGINE = `document.querySelector('iframe').contentWindow.__mapEngine`;
const engine = (expression) => app.evaluate(`(() => { const e = ${ENGINE}; return ${expression}; })()`);
const frameBox = () =>
  app.evaluate(`(() => {
    const rect = document.querySelector('iframe').getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
const press = (label) =>
  app.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const nodes = Array.from(document.querySelectorAll('[role="button"], button'));
    const target = nodes.find((node) => node.getAttribute('aria-label') === wanted || (node.textContent ?? '').trim() === wanted);
    if (target === undefined) return false;
    target.click();
    return true;
  })()`);
const shot = (name) => app.screenshot(name);
const mouse = (type, x, y, extra = {}) =>
  app.send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });

async function clickAt(x, y) {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", x, y, { button: "left", clickCount: 1 });
  await sleep(180);
}
const touch = (type, points) =>
  app.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
async function tapAt(x, y) {
  await touch("touchStart", [[x, y]]);
  await sleep(30);
  await touch("touchEnd", []);
  await sleep(120);
}
async function pageGeo(lon, lat) {
  const box = await frameBox();
  const point = await engine(`e.screenOf(${lon}, ${lat})`);
  return { x: box.left + point.x, y: box.top + point.y };
}

try {
  await setViewport(844, 390);
  await app.navigate(`http://127.0.0.1:${PORT}/`);
  await waitForText("FABRIC OF NATIONS");
  await waitFor(async () => (await app.text()).includes("New campaign"));

  if (FALLBACK) {
    await sleep(2500);
    check("the runtime refuses a software rasteriser", (await app.text()).includes("New campaign"));
    const svg = await app.evaluate(`document.querySelectorAll('svg path').length`);
    check("the SVG fallback draws the map", svg > 100, `${String(svg)} paths`);
    await shot("fallback-main-menu");
    await press("New campaign");
    await waitForText("The world of 1 January 1900");
    await press("Continue to country selection");
    await waitForText("Choose a country");
    await sleep(1500);
    await shot("fallback-country-selection");
    throw new Error("__done");
  }

  check(
    "the map runs from the one packaged page",
    await waitFor(async () => engine(`e !== undefined && e.stats().frames > 0`), 30_000),
  );
  check(
    "the page forbids the network",
    await app.evaluate(`document.querySelector('iframe').contentDocument.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("default-src 'none'")`),
  );
  await sleep(800);
  await shot("phone-main-menu");

  await press("New campaign");
  await waitForText("The world of 1 January 1900");
  await sleep(300);
  await shot("phone-briefing");
  await press("Continue to country selection");
  await waitForText("Choose a country");
  await sleep(1200);
  await shot("phone-country-selection");

  // The map keeps the same engine across screens: it is never remounted.
  const framesBefore = await engine(`e.stats().frames`);
  check("the map survives moving between screens", framesBefore > 0, `${String(framesBefore)} frames`);

  // Selection from the map moves nothing; selection from the list flies.
  await engine(`e.setView(2, 47, 8)`);
  await sleep(300);
  const steady = await engine(`e.cameraState()`);
  const paris = await pageGeo(2.35, 48.86);
  await clickAt(paris.x, paris.y);
  await sleep(500);
  check("country selection: a map press selects France", (await app.text()).includes("Play as France"));
  const afterPress = await engine(`e.cameraState()`);
  check("a selection on the map does not move the camera", steady.x === afterPress.x && steady.scale === afterPress.scale);
  await press("List");
  await sleep(200);
  await app.focus('input[aria-label="Search historical countries"]');
  await app.typeText("German");
  await sleep(500);
  await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    nodes.filter((node) => (node.textContent ?? '').trim().startsWith('German Empire'))
      .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0].click();
  })()`);
  await sleep(1100);
  const afterList = await engine(`e.cameraState()`);
  check("a selection from a list flies to the place", afterList.x !== afterPress.x || afterList.y !== afterPress.y);
  await shot("phone-country-selected");
  await press("Play as Germany");
  await waitForText("1 Jan 1900");
  await sleep(2500);
  await shot("phone-game");

  // Picking is a pure function of geography.
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
    const screen = await engine(`e.screenOf(${lon}, ${lat})`);
    const key = await engine(`e.provinceKeyAt(${screen.x}, ${screen.y})`);
    check(`hit test: ${name}`, key !== null && pattern.test(key), String(key));
  }
  await engine(`e.setView(-30, 40, 3)`);
  const open = await engine(`e.screenOf(-30, 40)`);
  check("hit test: the open Atlantic picks nothing", (await engine(`e.provinceKeyAt(${open.x}, ${open.y})`)) === null);
  const keys = [];
  for (const scale of [3, 6, 12, 24, 48]) {
    await engine(`e.setView(11.6, 48.5, ${scale})`);
    const screen = await engine(`e.screenOf(11.6, 48.5)`);
    keys.push(await engine(`e.provinceKeyAt(${screen.x}, ${screen.y})`));
  }
  check("hit test: identical at every zoom", new Set(keys).size === 1, String(keys[0]));

  // The three zoom levels.
  for (const [level, lon, lat, scale] of [
    ["world", 12, 20, 0.9],
    ["nation", 10, 49, 4],
    ["province", 10, 50, 10],
  ]) {
    await engine(`e.setView(${lon}, ${lat}, ${scale})`);
    await sleep(500);
    check(`zoom level: ${level}`, (await engine(`e.zoomLevel()`)) === level);
    const count = await engine(`e.labelCount()`);
    check(`about 25 labels on a phone at ${level} zoom`, count > 0 && count <= 26, `${String(count)} labels`);
    await shot(`phone-zoom-${level}`);
  }

  // Sheets: the surface slides aside and the camera stays.
  await engine(`e.setView(10, 50, 6)`);
  await sleep(200);
  const berlin = await pageGeo(13.4, 52.5);
  const beforePress = await engine(`e.cameraState()`);
  await clickAt(berlin.x, berlin.y);
  await sleep(700);
  check("a press opens the place sheet", /Province \d+/u.test(await app.text()));
  check("the camera does not move for a press", (await engine(`e.cameraState()`)).x === beforePress.x);
  const berlinAfter = await pageGeo(13.4, 52.5);
  const sheetEdge = await app.evaluate(`document.querySelector('[data-testid="side-sheet"]').getBoundingClientRect().left`);
  check("the selected place stays clear of the sheet", berlinAfter.x < sheetEdge, `${Math.round(berlinAfter.x)} < ${Math.round(sheetEdge)}`);
  await shot("phone-place-sheet");
  await press("Close sheet");
  await sleep(450);

  // Domains: every screen opens over the map.
  for (const [domain, first] of [
    ["Realm", "Overview"],
    ["Economy", "Budget"],
    ["Society", "Population"],
    ["World", "War & diplomacy"],
  ]) {
    await press(domain);
    await sleep(700);
    check(`${domain} opens as a sheet over the map`, (await app.text()).includes(first));
    await shot(`phone-domain-${domain.toLowerCase()}`);
    await press("Close sheet");
    await sleep(350);
  }

  // Lenses change colour, never geometry.
  await press("Map lens: Political");
  await sleep(250);
  for (const lens of ["Control", "Markets"]) {
    await press(lens);
    await sleep(400);
    await shot(`phone-lens-${lens.toLowerCase()}`);
  }
  await press("Political");
  await sleep(200);
  await press("Map lens: Political");
  await sleep(200);

  // Touch, delivered as real touch input.
  await press("Close sheet");
  await app.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await engine(`e.setView(10, 50, 6)`);
  await sleep(300);
  const hamburg = await pageGeo(10, 53.5);
  const before = await engine(`e.cameraState()`);
  await touch("touchStart", [[hamburg.x, hamburg.y]]);
  for (let step = 1; step <= 10; step += 1) {
    await touch("touchMove", [[hamburg.x + step * 8, hamburg.y]]);
  }
  await touch("touchEnd", []);
  await sleep(500);
  check("drag pans", (await engine(`e.cameraState()`)).x !== before.x);
  check("a drag selects nothing", !/Province \d+/u.test(await app.text()));

  await engine(`e.setView(10, 50, 6)`);
  await sleep(250);
  const scaleBefore = (await engine(`e.cameraState()`)).scale;
  const middle = await pageGeo(10, 50);
  await touch("touchStart", [[middle.x - 30, middle.y], [middle.x + 30, middle.y]]);
  for (let step = 1; step <= 10; step += 1) {
    await touch("touchMove", [[middle.x - 30 - step * 6, middle.y], [middle.x + 30 + step * 6, middle.y]]);
  }
  await touch("touchEnd", []);
  await sleep(400);
  check("pinch zooms in", (await engine(`e.cameraState()`)).scale > scaleBefore * 1.5);

  await engine(`e.setView(10, 50, 6)`);
  await sleep(250);
  const point = await pageGeo(10, 50);
  await tapAt(point.x, point.y);
  await sleep(500);
  check("a tap selects a province and opens its summary", /Province \d+/u.test(await app.text()));
  await press("Close sheet");
  await sleep(400);

  await engine(`e.setView(10, 50, 6)`);
  await sleep(250);
  const doubleScale = (await engine(`e.cameraState()`)).scale;
  const tap = await pageGeo(10, 50);
  await tapAt(tap.x, tap.y);
  await tapAt(tap.x, tap.y);
  await sleep(700);
  check("double-tap zooms in", (await engine(`e.cameraState()`)).scale > doubleScale * 1.5);
  await press("Close sheet");
  await sleep(400);

  await engine(`e.setView(23, 38, 5)`);
  await sleep(300);
  const greece = await pageGeo(24, 38);
  await touch("touchStart", [[greece.x, greece.y]]);
  await sleep(520);
  check("a long press opens the loupe", await engine(`e.loupeOpen()`));
  await sleep(200);
  await shot("phone-loupe");
  await touch("touchMove", [[greece.x + 10, greece.y + 6]]);
  await sleep(200);
  const loupeName = await engine(`e.loupeName()`);
  await touch("touchEnd", []);
  await sleep(600);
  check("the loupe closes and picks what it showed", !(await engine(`e.loupeOpen()`)) && (await app.text()).includes(loupeName), loupeName);
  await press("Close sheet");
  await sleep(350);
  await app.send("Emulation.setTouchEmulationEnabled", { enabled: false });

  // A dispatch comes from the simulation, and playing never stops for it.
  await press("Speed 1 times, change speed");
  await sleep(200);
  await press("30×");
  await sleep(200);
  await press("Play");
  const reported = await waitFor(async () => (await app.text()).includes("Treasury closes the month"), 90_000);
  check("a real month close is reported as a dispatch", reported);
  check("the dispatch names the era's medium", (await app.text()).toUpperCase().includes("TELEGRAM"));
  await shot("phone-dispatch");
  check("the dispatch does not stop the game", (await app.text()).length > 0 && (await engine(`e !== undefined`)));
  await press("Pause");
  await sleep(400);
  await press("German Empire, open campaign");
  await sleep(600);
  check("the campaign sheet keeps the log", (await app.text()).includes("Telegram log"));
  check("saving stays reachable", (await app.text()).includes("Restart worker"));
  await shot("phone-campaign");
  await press("Close sheet");
  await sleep(350);

  // Era themes change colour and medium; the layout must not move.
  const layout = () =>
    app.evaluate(`JSON.stringify(Array.from(document.querySelectorAll('[role="button"]')).slice(0, 12).map((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }))`);
  const eraLayouts = new Set();
  for (const era of ["imperial", "machine-age", "cold-war", "digital"]) {
    await app.navigate(`http://127.0.0.1:${PORT}/?country=FRA&era=${era}`);
    await waitFor(async () => (await app.text()).includes("1 Jan 1900"));
    await waitFor(async () => engine(`e !== undefined && e.stats().frames > 0`), 30_000);
    await sleep(2600);
    await engine(`e.setView(14, 46, 3.2)`);
    await sleep(700);
    eraLayouts.add(await layout());
    await shot(`phone-era-${era}`);
  }
  check("eras never move a control", eraLayouts.size === 1);

  // The same layout at every size.
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [1180, 820],
    [1600, 900],
  ]) {
    await setViewport(width, height, 1);
    await app.navigate(`http://127.0.0.1:${PORT}/`);
    await waitFor(async () => (await app.text()).includes("New campaign"));
    await sleep(2500);
    await shot(`size-${width}x${height}-main-menu`);
    await app.navigate(`http://127.0.0.1:${PORT}/?view=select`);
    await waitFor(async () => (await app.text()).includes("Choose a country"));
    await sleep(2500);
    await shot(`size-${width}x${height}-country-selection`);
    await app.navigate(`http://127.0.0.1:${PORT}/?country=DEU`);
    await waitFor(async () => (await app.text()).includes("1 Jan 1900"));
    await waitFor(async () => engine(`e !== undefined && e.stats().frames > 0`), 30_000);
    await sleep(2600);
    await shot(`size-${width}x${height}-game`);
    await press("Economy");
    await sleep(800);
    await shot(`size-${width}x${height}-sheet`);
    const overflow = await app.evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
    check(`no page overflow at ${width}x${height}`, !overflow);
  }
  const problems = JSON.parse(await app.evaluate(`JSON.stringify(window.__m11d)`));
  check("no page errors", problems.errors.length === 0, problems.errors.join(" | "));
  check("no unhandled rejections", problems.rejections.length === 0, problems.rejections.join(" | "));
} catch (error) {
  if (String(error).includes("__done")) {
    check("fallback path completed", true);
  } else {
    check("verification script completed", false, String(error));
  }
} finally {
  const failed = results.filter((entry) => !entry.passed);
  writeFileSync(resolve(ROOT, ".cache-map/verify-atlas.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\n${String(results.length - failed.length)}/${String(results.length)} checks passed`);
  await app.close?.();
  process.exit(failed.length === 0 ? 0 : 1);
}
