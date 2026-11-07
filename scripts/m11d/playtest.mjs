/**
 * M11d playtest driver.
 *
 * Usage:
 *   node scripts/m11d/playtest.mjs --only=startup
 *   node scripts/m11d/playtest.mjs --fresh          # full run, empty browser profile
 *
 * Every scenario interacts with the real exported web application through
 * Chrome DevTools Protocol and records console output, exceptions, log entries,
 * failed network requests and screenshots.
 */
import { boot, writeJson, sleep, ROOT } from "./lib/harness.mjs";
import { compressSaveForStorage } from "../../packages/sim-worker/dist/persistence.js";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const onlyArg = argv.find((arg) => arg.startsWith("--only="));
const only = onlyArg === undefined ? null : onlyArg.slice("--only=".length);
const runAll = only === null;
const APP_URL = "http://127.0.0.1:8877/";

const results = [];
function mark(name, ok, detail = null) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === null ? "" : ` — ${detail}`}`);
  if (!ok) process.exitCode = 1;
}

const app = await boot({ fresh: runAll || argv.includes("--fresh") });

async function waitFor(expression, { timeout = 60000, interval = 200, label = expression } = {}) {
  const started = Date.now();
  for (;;) {
    let value = false;
    try {
      value = await app.evaluate(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`);
    } catch {
      value = false;
    }
    if (value) return true;
    if (Date.now() - started > timeout) throw new Error(`timeout waiting for ${label}`);
    await sleep(interval);
  }
}

const scenario = (name) => runAll || only === name;

/**
 * Click a control once it is no longer disabled. Saves, loads and actions set
 * `busy`, and the UI deliberately disables simulation controls until the worker
 * replies, so a playtest must wait instead of racing the reply.
 */
async function clickWhenEnabled(label, { timeout = 30000 } = {}) {
  await waitFor(
    `(() => {
      const node = Array.from(document.querySelectorAll('[aria-label]')).find((entry) => entry.getAttribute('aria-label') === ${JSON.stringify(label)});
      return node !== undefined && node.getAttribute('aria-disabled') !== 'true';
    })()`,
    { timeout, label: `${label} enabled` },
  );
  await app.clickAria(label);
}

/** Click the top-bar save button, waiting for a pending save to settle first. */
async function clickSaveButton() {
  await waitFor(
    `(() => {
      const node = Array.from(document.querySelectorAll('[role="button"]')).find((entry) => ['Save', 'Save / replace'].includes((entry.textContent ?? '').trim()));
      return node !== undefined && node.getAttribute('aria-disabled') !== 'true';
    })()`,
    { timeout: 30000, label: "save button enabled" },
  );
  return app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((entry) => ['Save', 'Save / replace'].includes((entry.textContent ?? '').trim()));
    if (!node) return null;
    node.click();
    return (node.textContent ?? '').trim();
  })()`);
}

/** Accept the deliberate overwrite prompt when it appears. */
async function confirmOverwriteIfPrompted() {
  await sleep(800);
  if (await app.evaluate(`document.body.innerText.includes('Replace the saved campaign?')`)) {
    await app.clickAria("Save and replace");
    await sleep(400);
    return true;
  }
  return false;
}

/**
 * Pause and wait for the worker to acknowledge it.
 *
 * The host applies commands only between completed ticks, and one pump may run
 * up to four ticks. On the full 1900 world a tick costs ~650 ms, so the Pause
 * acknowledgement can arrive a few seconds (and a few simulated days) later.
 * Reading the date immediately after the click races that pump.
 */
async function pauseAndWait() {
  if (await app.evaluate(`document.querySelector('[aria-label="Pause"]') !== null`)) {
    await clickWhenEnabled("Pause");
  }
  await waitFor(`document.querySelector('[aria-label="Play"]') !== null`, {
    timeout: 120000,
    label: "pause acknowledged",
  });
  let previous = await currentDate();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await sleep(400);
    const current = await currentDate();
    if (current === previous) return current;
    previous = current;
  }
  throw new Error("simulated date did not stabilise after pause");
}

async function gotoApp() {
  await app.navigate(APP_URL);
  await waitFor(`document.body.innerText.includes('FABRIC OF NATIONS')`, { timeout: 90000, label: "app shell" });
  await sleep(2500);
}

function escapeText(value) {
  return JSON.stringify(value);
}

async function clickNavTab(label) {
  const clicked = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const match = nodes.find((node) => {
      const text = (node.textContent ?? '').trim();
      return text.endsWith(${escapeText(label)}) && text.length <= ${label.length + 2};
    });
    if (!match) return false;
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`nav tab not found: ${label}`);
  await sleep(700);
}

async function selectCountryByName(name) {
  const clicked = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith(${escapeText(name)}));
    if (matches.length === 0) return false;
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  await sleep(500);
  return clicked;
}

async function searchCountries(needle) {
  const selector = 'input[aria-label="Search historical countries"]';
  const focused = await app.focus(selector);
  if (!focused) throw new Error("country search input not found");
  await app.evaluate(`(() => {
    const node = document.querySelector(${escapeText(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, '');
    node.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  if (needle !== "") await app.typeText(needle);
  await sleep(500);
}

/** Reload the app, go through the menu, and create a campaign for `tag`. */
async function ensureCampaign({ tag, name }) {
  await gotoApp();
  await app.clickAria("New campaign");
  await waitFor(`document.body.innerText.includes('The world of 1 January 1900')`, { timeout: 30000 });
  await sleep(400);
  await app.clickAria("Continue to country selection");
  await waitFor(`document.body.innerText.includes('Choose a country')`, { timeout: 30000 });
  await sleep(800);
  await searchCountries(tag);
  const rowClicked = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith(${escapeText(name)}));
    if (matches.length === 0) return false;
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  if (!rowClicked) throw new Error(`country row not found for ${name}`);
  await sleep(500);
  const creationStarted = Date.now();
  const playButton = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const match = nodes.find((node) => (node.textContent ?? '').trim().startsWith('Play as '));
    if (!match) return null;
    match.click();
    return (match.textContent ?? '').trim();
  })()`);
  if (playButton === null) throw new Error(`Play button missing for ${name}`);
  await waitFor(`document.body.innerText.includes('World map') && document.body.innerText.includes('+1 day')`, { timeout: 180000 });
  await sleep(2500);
  return { playButton, creationMs: Date.now() - creationStarted };
}

async function currentDate() {
  return app.evaluate(`document.body.innerText.match(/\\b\\d{4}-\\d{2}-\\d{2}\\b/)?.[0] ?? null`);
}

async function clickMapPath(name) {
  return app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('svg [aria-label]'));
    const match = nodes.find((node) => node.getAttribute('aria-label') === ${escapeText(name)});
    if (!match) return false;
    match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  })()`);
}

/** Dispatch a real pointer click at a viewport coordinate. */
async function clickPoint(x, y) {
  await app.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(x), y: Math.round(y) });
  await app.send("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(x), y: Math.round(y), button: "left", buttons: 1, clickCount: 1 });
  await app.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(x), y: Math.round(y), button: "left", buttons: 0, clickCount: 1 });
  await sleep(500);
}

/** Screen point of a map path's bounding-box centre. */
async function pathCenter(name) {
  return app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('svg [aria-label]')).find((n) => n.getAttribute('aria-label') === ${escapeText(name)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
}

/** Screen point of a longitude/latitude under the current map transform. */
async function mapGeoPoint(lon, lat) {
  return app.evaluate(`(() => {
    const svg = document.querySelector('svg');
    const group = document.querySelector('svg g');
    if (!svg || !group || !svg.createSVGPoint) return null;
    const point = svg.createSVGPoint();
    const max = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * 89.9 * Math.PI / 180));
    const miller = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * (${lat}) * Math.PI / 180));
    point.x = ((${lon}) + 180) / 360 * 1000;
    point.y = (max - miller) / (2 * max) * 500;
    const screen = point.matrixTransform(group.getScreenCTM());
    return { x: screen.x, y: screen.y };
  })()`);
}

async function mapTransform() {
  return app.evaluate(`document.querySelector('svg g')?.getAttribute('transform') ?? null`);
}

try {
  if (scenario("startup")) {
    await app.step("startup: first load, no save");
    await gotoApp();
    const body = await app.text();
    await app.screenshot("01-main-menu");
    mark("startup: main menu renders", body.includes("FABRIC OF NATIONS") && body.includes("New campaign"));
    mark("startup: no saved campaign yet", body.includes("No saved campaign yet"));
    mark("startup: playable state count shown", body.includes("66 playable states"), body.match(/\d+ playable states/)?.[0] ?? "missing");
    const assetState = await app.evaluate(`({
      svg: document.querySelectorAll('svg').length,
      paths: document.querySelectorAll('svg path').length,
      images: Array.from(document.querySelectorAll('img')).map((img) => ({ src: img.getAttribute('src'), w: img.naturalWidth })),
    })`);
    mark("startup: map SVG rendered", assetState.svg > 0 && assetState.paths > 100, JSON.stringify({ svg: assetState.svg, paths: assetState.paths }));
    mark("startup: no broken images on menu", assetState.images.every((image) => image.w > 0), JSON.stringify(assetState.images));

    await app.step("startup: sources and licensing dialog");
    await app.clickAria("Sources and licensing");
    await sleep(600);
    await app.screenshot("02-provenance");
    const provenance = await app.text();
    mark("provenance: opens", provenance.includes("Sources, classification and licensing"));
    mark("provenance: lists flags", provenance.includes("Historical flags of 1 January 1900"));
    await app.clickAria("Close");
    await sleep(500);
    mark("provenance: closes", !(await app.text()).includes("Sources, classification and licensing"));
  }

  if (scenario("menu-to-game")) {
    await app.step("new campaign: brief");
    await gotoApp();
    await app.clickAria("New campaign");
    await waitFor(`document.body.innerText.includes('The world of 1 January 1900')`);
    await sleep(800);
    await app.screenshot("03-brief");
    const brief = await app.text();
    mark("brief: shows scenario facts", brief.includes("CAMPAIGN START") && brief.includes("1 January 1900"));
    const briefImages = await app.evaluate(`Array.from(document.querySelectorAll('img')).map((img) => ({ src: img.getAttribute('src'), w: img.naturalWidth }))`);
    mark("brief: flags load", briefImages.length > 0 && briefImages.every((image) => image.w > 0), `${String(briefImages.length)} images, ${String(briefImages.filter((i) => i.w === 0).length)} broken`);

    await app.step("new campaign: country selection");
    await app.clickAria("Continue to country selection");
    await waitFor(`document.body.innerText.includes('Choose a country')`);
    await sleep(1500);
    await app.screenshot("04-selection");
    const selection = await app.text();
    mark("selection: shows playable count", selection.includes("66 playable states"));
    mark("selection: shows dependent count", selection.includes("66 dependent"), selection.match(/\d+ dependent/)?.[0] ?? "missing");

    await app.step("selection: search and Austria-Hungary");
    await searchCountries("Austria");
    const searchBody = await app.text();
    mark(
      "selection: search narrows list",
      searchBody.includes("Austro-Hungarian Monarchy") && searchBody.includes("1 entry"),
      searchBody.match(/\d+ entr\w+/)?.[0] ?? "",
    );
    await app.screenshot("05-selection-search");

    mark("selection: Austria-Hungary row clickable", (await selectCountryByName("Austro-Hungarian Monarchy")) === true);
    await app.screenshot("06-selection-austria-hungary");
    const austria = await app.text();
    mark("selection: Austria-Hungary status shown", austria.includes("Independent state"));
    mark("selection: Austria-Hungary playable", austria.includes("Play as Austria-Hungary"));

    await app.step("new campaign: create Austria-Hungary");
    const creationStarted = Date.now();
    await app.clickAria("Play as Austria-Hungary");
    await waitFor(`document.body.innerText.includes('World map') && document.body.innerText.includes('+1 day')`, { timeout: 180000 });
    await sleep(2500);
    const creationMs = Date.now() - creationStarted;
    const game = await app.text();
    await app.screenshot("07-game-austria-hungary");
    mark("game: top bar shows Austria-Hungary", game.includes("Austria-Hungary"), `created in ${(creationMs / 1000).toFixed(1)} s`);
    mark("game: date is 1900-01-01", game.includes("1900-01-01"));
    mark("game: simulation controls present", game.includes("+1 day") && game.includes("Play"));
    mark("game: no startup error banner", !/Dismiss/.test(game), game.includes("Dismiss") ? "banner visible" : "");
    mark("game: creation under 60 s", creationMs < 60000, `${(creationMs / 1000).toFixed(1)} s`);
  }

  if (scenario("selection")) {
    await app.step("selection: browse the complete catalog");
    await gotoApp();
    await app.clickAria("New campaign");
    await waitFor(`document.body.innerText.includes('The world of 1 January 1900')`);
    await app.clickAria("Continue to country selection");
    await waitFor(`document.body.innerText.includes('Choose a country')`);
    await sleep(1200);
    let body = await app.text();
    mark("selection: playable-only list is complete", body.includes("Playable only · 66") && body.includes("66 playable states"));
    await app.evaluate(`(() => { const n = Array.from(document.querySelectorAll('[role="button"]')).find((x) => (x.textContent ?? '').trim() === 'All territories'); n?.click(); })()`);
    await sleep(900);
    body = await app.text();
    mark("selection: all-territories view includes dependencies", body.includes("133 entries"), body.match(/\d+ entries/)?.[0] ?? "missing");
    const flagState = await app.evaluate(`(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return { count: images.length, broken: images.filter((img) => img.naturalWidth === 0).map((img) => img.getAttribute('src')) };
    })()`);
    mark("selection: every flag image loads", flagState.count > 100 && flagState.broken.length === 0, `${String(flagState.count)} images, ${String(flagState.broken.length)} broken`);
    await app.screenshot("08-selection-all-territories");

    await app.step("selection: dependent territory cannot be played");
    await searchCountries("British India");
    await selectCountryByName("British India");
    body = await app.text();
    mark("selection: dependency detail explains status", body.includes("NOT SELECTABLE") && body.includes("administered by"));
    mark("selection: dependency has no play button", !body.includes("Play as British India"));
    await app.screenshot("09-selection-british-india");

    await app.step("selection: small states and special polities");
    const smallStates = [
      { query: "Wadai", name: "Sultanate of Wadai" },
      { query: "Darfur", name: "Sultanate of Darfur" },
      { query: "Andorra", name: "Co-Principality of Andorra" },
      { query: "Liechtenstein", name: "Principality of Liechtenstein" },
      { query: "San Marino", name: "Most Serene Republic of San Marino" },
      { query: "Tonga", name: "Kingdom of Tonga" },
    ];
    for (const state of smallStates) {
      await searchCountries(state.query);
      const clicked = await selectCountryByName(state.name);
      await sleep(400);
      body = await app.text();
      const playable = body.includes("Play as ");
      mark(`selection: ${state.name} selectable`, clicked === true && body.includes(state.name) && playable, playable ? "playable" : "detail shown");
    }
    await searchCountries("Wadai");
    await selectCountryByName("Sultanate of Wadai");
    await sleep(500);
    await app.screenshot("10-selection-wadai");
    body = await app.text();
    mark("selection: Wadai detail opens", body.includes("Sultanate of Wadai") && body.includes("Play as Wadai"));
    mark("selection: Wadai is a playable state", body.includes("PLAYABLE") && !body.includes("NOT SELECTABLE"));

    await app.step("selection: rapid selection changes agree with the detail panel");
    await searchCountries("");
    const rows = await app.evaluate(`(() => {
      const chips = new Set(['← Back','All','Europe','Asia','Africa','Americas','Oceania','Any status','Independent','Semi-sovereign','Dependencies','All territories']);
      return Array.from(document.querySelectorAll('[role="button"]'))
        .map((node) => (node.innerText ?? '').trim())
        .filter((text) => !chips.has(text) && !text.startsWith('Playable only') && text.includes(' · '))
        .slice(0, 8)
        .map((text) => ({ text, name: (text.split('\\n')[0] ?? '').trim() }));
    })()`);
    const inSync = [];
    for (const row of rows) {
      await app.evaluate(`(() => { const n = Array.from(document.querySelectorAll('[role="button"]')).find((x) => (x.innerText ?? '').trim() === ${JSON.stringify(row.text)}); n?.click(); })()`);
      await sleep(200);
      const after = await app.text();
      inSync.push(after.includes(row.name));
    }
    const lastRow = rows[rows.length - 1] ?? { name: "" };
    body = await app.text();
    mark(
      "selection: rapid selection keeps the detail panel in sync",
      rows.length > 3 && inSync.every(Boolean) && body.includes(lastRow.name),
      `${String(inSync.filter(Boolean).length)}/${String(rows.length)} in sync; last ${lastRow.name}`,
    );
    await app.screenshot("11-selection-rapid");

    await app.step("selection: start a campaign as San Marino");
    await app.evaluate(`(() => {
      for (const label of ['Any status', 'Playable only · 66']) {
        const node = Array.from(document.querySelectorAll('[role="button"]')).find((x) => (x.textContent ?? '').trim() === label);
        node?.click();
      }
    })()`);
    await sleep(500);
    await searchCountries("San Marino");
    await selectCountryByName("Most Serene Republic of San Marino");
    await sleep(500);
    await app.clickAria("Play as San Marino");
    await waitFor(`document.body.innerText.includes('World map') && document.body.innerText.includes('+1 day')`, { timeout: 180000 });
    await sleep(2000);
    body = await app.text();
    mark("selection: small country campaign loads the selected country", body.includes("San Marino"));
    await app.screenshot("12-game-san-marino");
  }

  if (scenario("tabs")) {
    await app.step("tabs: create campaign");
    const creation = await ensureCampaign({ tag: "USA", name: "United States of America" });
    mark("tabs: campaign created", true, `${creation.playButton} in ${(creation.creationMs / 1000).toFixed(1)} s`);
    const tabs = [
      "Overview",
      "Budget",
      "Markets",
      "Industry",
      "Construction",
      "Trade",
      "Labor & health",
      "Money",
      "Population",
      "Politics",
      "Technology",
      "War & diplomacy",
      "Ledger",
      "World",
    ];
    for (const tab of tabs) {
      await app.step(`tabs: ${tab}`);
      await clickNavTab(tab);
      const body = await app.text();
      const slug = tab.toLowerCase().replace(/[^a-z]+/g, "-");
      await app.screenshot(`10-tab-${slug}`);
      mark(`tab: ${tab} renders`, body.includes(tab) && body.length > 400, `${String(body.length)} chars`);
      const currentNav = await app.evaluate(`(() => {
        const node = Array.from(document.querySelectorAll('[role="button"]')).find((entry) => {
          const text = (entry.textContent ?? '').trim();
          return text.endsWith(${JSON.stringify(tab)}) && text.length <= ${tab.length + 2};
        });
        return node ? node.getAttribute('aria-current') : null;
      })()`);
      mark(`tab: ${tab} exposes the active navigation state`, currentNav === "page", `aria-current=${String(currentNav)}`);
      if (tab !== "World") {
        const detail = await app.evaluate(`document.body.innerText.includes('Loading country detail')`);
        mark(`tab: ${tab} has country detail`, detail === false);
      }
    }

    await app.step("tabs: Markets highlight opens the world market layer");
    await clickNavTab("Markets");
    const highlightOpened = await app.evaluate(`(() => {
      const node = Array.from(document.querySelectorAll('[role="button"]')).find((entry) => (entry.textContent ?? '').trim() === 'Highlight members on the map');
      if (!node) return false;
      node.click();
      return true;
    })()`);
    await sleep(900);
    const highlightView = await app.text();
    mark(
      "tabs: market highlight opens the world map",
      highlightOpened === true && highlightView.includes("World map") && highlightView.includes("Clear market highlight"),
      highlightOpened ? "world map with market layer" : "highlight button missing",
    );
    await app.screenshot("10-markets-highlight-map");
  }

  if (scenario("simulation")) {
    await app.step("simulation: create campaign");
    await ensureCampaign({ tag: "JPN", name: "Empire of Japan" });
    await clickNavTab("World");
    await sleep(500);
    const before = await currentDate();
    for (let index = 0; index < 5; index += 1) await clickWhenEnabled("+1 day");
    await sleep(2500);
    const after = await currentDate();
    mark("simulation: +1 day advances the date", before !== after, `${String(before)} -> ${String(after)}`);

    await app.step("simulation: play at 30x for 8 seconds");
    await app.clickAria("30×");
    await clickWhenEnabled("Play");
    await sleep(8000);
    const runningBody = await app.text();
    const played = await pauseAndWait();
    await app.screenshot("20-play-30x");
    const commandsAfterPlay = await app.evaluate(`window.__m11d ? { commands: window.__m11d.commands.slice(-40), workers: window.__m11d.workers, errors: window.__m11d.errors } : null`);
    mark("simulation: running advances the date", typeof played === "string" && played > after, `${String(after)} -> ${String(played)}`);
    mark("simulation: running does not reset the campaign", typeof played === "string" && played >= after, `${String(after)} -> ${String(played)}`);
    mark(
      "simulation: no worker replacement while running",
      commandsAfterPlay !== null && commandsAfterPlay.workers.length === 1,
      `${String(commandsAfterPlay?.workers.length)} workers; commands ${(commandsAfterPlay?.commands ?? []).map((entry) => entry.type).join(",")}`,
    );
    mark("simulation: pause returns to Play", /(^|\n)Play(\n|$)/.test(await app.text()));
    mark("simulation: no error banner after running", !runningBody.includes("Dismiss"));

    await app.step("simulation: quickly toggle speed while running");
    for (const speed of ["30×", "10×", "3×", "1×"]) {
      // Pausing autosaves; controls are intentionally disabled while the save
      // is in flight, so wait for the chip to become interactive again.
      await waitFor(
        `(() => { const node = Array.from(document.querySelectorAll('[aria-label]')).find((n) => n.getAttribute('aria-label') === ${JSON.stringify(speed)}); return node !== undefined && node.getAttribute('aria-disabled') !== 'true'; })()`,
        { timeout: 20000, label: `speed chip ${speed} enabled` },
      );
      await app.clickAria(speed);
      await sleep(150);
    }
    await clickWhenEnabled("Play");
    await sleep(2500);
    await pauseAndWait();
    mark("simulation: speed switching keeps the UI usable", (await app.text()).includes("+1 day"));
    await app.screenshot("21-speed-switch");
  }

  if (scenario("map")) {
    await app.step("map: create campaign");
    await ensureCampaign({ tag: "DEU", name: "German Empire" });
    await clickNavTab("World");
    await sleep(600);
    await app.evaluate(`document.querySelector('[aria-label="Reset map view"]')?.click()`);
    await sleep(400);
    for (let index = 0; index < 9; index += 1) await app.clickAria("Zoom in");
    await sleep(600);
    const transform = await mapTransform();
    const zoomScale = Number(/scale\(([^)]+)\)/.exec(transform ?? "")?.[1] ?? "0");
    await app.screenshot("30-map-zoom-in");
    mark("map: zoom changes transform", typeof transform === "string" && !transform.endsWith("scale(1)"), String(transform));
    mark("map: zoom reaches the documented maximum", zoomScale === 18, `scale ${String(zoomScale)}`);
    await app.clickAria("Zoom out");
    await sleep(400);
    const zoomedOut = Number(/scale\(([^)]+)\)/.exec((await mapTransform()) ?? "")?.[1] ?? "0");
    mark("map: zoom out lowers the scale", zoomedOut < zoomScale, `scale ${String(zoomScale)} -> ${String(zoomedOut)}`);

    const box = await app.evaluate(`(() => { const node = document.querySelector('svg'); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }; })()`);

    await app.step("map: hover several regions");
    await app.evaluate(`document.querySelector('[aria-label="Reset map view"]')?.click()`);
    await sleep(400);
    let previousText = await app.text();
    for (const [lon, lat, label] of [
      [10, 50, "Europe"],
      [20, 5, "Africa"],
      [-60, -15, "South America"],
      [70, 45, "Central Asia"],
    ]) {
      const point = await mapGeoPoint(lon, lat);
      if (point === null) {
        mark(`map: hover ${label}`, false, "geo projection unavailable");
        continue;
      }
      await app.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(point.x), y: Math.round(point.y) });
      await sleep(500);
      const current = await app.text();
      const tooltipChanged = current !== previousText;
      mark(`map: hover ${label} shows a tooltip`, tooltipChanged, tooltipChanged ? "hover text updated" : "no tooltip");
      previousText = current;
    }
    await app.screenshot("31-map-hover");

    await app.step("map: select Germany on the map");
    await app.evaluate(`document.querySelector('[aria-label="Reset map view"]')?.click()`);
    await sleep(400);
    const germanyCenter = await pathCenter("German Empire");
    if (germanyCenter === null) {
      mark("map: select Germany on the map", false, "path not found");
    } else {
      await clickPoint(germanyCenter.x, germanyCenter.y);
      const body = await app.text();
      mark("map: select Germany on the map", body.includes("German Empire"), body.match(/German Empire[^\n]*/)?.[0] ?? "panel unchanged");
      await app.screenshot("32-map-germany");

      await app.step("map: open the selected country overview");
      await app.clickAria("Open overview");
      await sleep(900);
      const overview = await app.text();
      mark("map: Open overview navigates to the country screen", overview.includes("Overview") && overview.includes("Economic overview"));
      await app.screenshot("32b-overview-from-map");
      await clickNavTab("World");
      await sleep(500);
    }

    await app.step("map: select Libya (Ottoman Tripolitania) on the map");
    const libyaPoint = await mapGeoPoint(17, 27);
    if (libyaPoint === null) {
      mark("map: select Libya on the map", false, "geo projection unavailable");
    } else {
      await clickPoint(libyaPoint.x, libyaPoint.y);
      const body = await app.text();
      mark("map: select Libya on the map", body.includes("Ottoman Empire") || body.includes("Tripoli"), body.match(/(Ottoman Empire|French Republic|Kingdom of Italy)[^\n]*/)?.[0] ?? "no selection");
      await app.screenshot("32-map-libya");
    }

    await app.step("map: inspect a dependent territory in game");
    const indiaPoint = await mapGeoPoint(78, 22);
    if (indiaPoint === null) {
      mark("map: dependent territory is inspectable", false, "geo projection unavailable");
    } else {
      await clickPoint(indiaPoint.x, indiaPoint.y);
      const body = await app.text();
      mark(
        "map: dependent territory is inspectable",
        body.includes("British India") && body.includes("Territory of"),
        body.match(/British India[^\n]*/)?.[0] ?? "not selected",
      );
      const inspectDisabled = await app.evaluate(`(() => {
        const node = Array.from(document.querySelectorAll('[aria-label]')).find((entry) => entry.getAttribute('aria-label') === 'Inspect country');
        return node ? node.getAttribute('aria-disabled') : null;
      })()`);
      mark("map: dependent territory cannot open a country screen", inspectDisabled === "true", `inspect button aria-disabled=${String(inspectDisabled)}`);
      await app.screenshot("32c-map-british-india");
    }

    await app.step("map: layer chips");
    const layerStates = [];
    for (const chip of ["Control", "Markets", "Political"]) {
      await app.evaluate(`(() => { const node = Array.from(document.querySelectorAll('[aria-label]')).find((n) => n.getAttribute('aria-label') === ${JSON.stringify(chip)}); node?.click(); })()`);
      await sleep(500);
      const state = await app.evaluate(`(() => { const node = Array.from(document.querySelectorAll('[aria-label]')).find((n) => n.getAttribute('aria-label') === ${JSON.stringify(chip)}); return { selected: node?.getAttribute('aria-pressed'), legend: document.body.innerText.match(/POLITICAL LAYER|CONTROL LAYER|MARKET LAYER/i)?.[0] ?? null }; })()`);
      layerStates.push({ chip, ...state });
      await app.screenshot(`33-map-layer-${chip.toLowerCase()}`);
    }
    mark(
      "map: every layer chip activates",
      layerStates.every((entry) => entry.selected === "true") &&
        layerStates[0].legend?.toUpperCase() === "CONTROL LAYER" &&
        layerStates[1].legend?.toUpperCase() === "MARKET LAYER" &&
        layerStates[2].legend?.toUpperCase() === "POLITICAL LAYER",
      JSON.stringify(layerStates),
    );

    await app.step("map: highlight market members");
    const highlightButton = await app.evaluate(`(() => {
      const node = Array.from(document.querySelectorAll('[role="button"]')).find((n) => (n.textContent ?? '').trim() === 'Highlight member territories');
      if (!node) return false;
      node.click();
      return true;
    })()`);
    await sleep(800);
    const highlightBody = await app.text();
    mark("map: market highlight control works", highlightButton === true && highlightBody.includes("Clear market highlight"));
    await app.screenshot("34-map-market-highlight");

    await app.step("map: rapid wheel zoom keeps the page still");
    await app.evaluate(`document.querySelector('[aria-label="Reset map view"]')?.click()`);
    await sleep(300);
    const centerX = Math.round(box.x + box.w / 2);
    const centerY = Math.round(box.y + box.h / 2);
    const scrollBefore = await app.evaluate(`({ page: document.scrollingElement?.scrollTop ?? 0, inner: window.scrollY })`);
    for (let index = 0; index < 10; index += 1) {
      await app.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: centerX, y: centerY, deltaX: 0, deltaY: index % 2 === 0 ? -240 : 120 });
      await sleep(80);
    }
    await sleep(500);
    const wheelTransform = await mapTransform();
    const scrollAfter = await app.evaluate(`({ page: document.scrollingElement?.scrollTop ?? 0, inner: window.scrollY })`);
    await app.screenshot("35-map-wheel");
    mark("map: wheel zooms", typeof wheelTransform === "string" && wheelTransform.includes("scale(") && !wheelTransform.endsWith("scale(1)"), String(wheelTransform));
    mark("map: wheel does not scroll the page", scrollBefore.page === scrollAfter.page, JSON.stringify({ scrollBefore, scrollAfter }));

    await app.send("Input.dispatchMouseEvent", { type: "mousePressed", x: centerX, y: centerY, button: "left", clickCount: 1 });
    for (let step = 1; step <= 12; step += 1) {
      await app.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: centerX - step * 16, y: centerY - step * 4, button: "left" });
      await sleep(30);
    }
    await app.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: centerX - 192, y: centerY - 48, button: "left", clickCount: 1 });
    await sleep(600);
    const panTransform = await mapTransform();
    await app.screenshot("36-map-pan");
    mark("map: pan changes transform", panTransform !== wheelTransform, String(panTransform));
    await app.evaluate(`document.querySelector('[aria-label="Reset map view"]')?.click()`);
    await sleep(400);
    mark("map: reset restores global view", (await mapTransform())?.endsWith("scale(1)"), String(await mapTransform()));
    await app.screenshot("37-map-reset");
  }

  if (scenario("economy")) {
    await app.step("economy: budget screen and sliders");
    await ensureCampaign({ tag: "GBR", name: "United Kingdom of Great Britain and Ireland" });
    await clickNavTab("Budget");
    const budget = await app.text();
    mark("economy: budget screen content", budget.includes("Budget") && budget.includes("Treasury"));
    const sliderInfo = await app.evaluate(`(() => {
      const sliders = Array.from(document.querySelectorAll('[aria-label]')).filter((node) => node.querySelector('[role="adjustable"], [aria-valuenow]') !== null);
      return { count: document.querySelectorAll('[aria-valuenow]').length, labels: Array.from(document.querySelectorAll('[aria-valuenow]')).map((n) => n.getAttribute('aria-label')) };
    })()`);
    mark("economy: budget has adjustable values", sliderInfo.count > 0, JSON.stringify(sliderInfo).slice(0, 300));
    await app.screenshot("40-budget");

    if (sliderInfo.labels.length > 0) {
      const label = sliderInfo.labels[0];
      await app.step(`economy: change slider "${label}"`);
      const before = await app.evaluate(`(() => { const node = Array.from(document.querySelectorAll('[aria-valuenow]')).find((n) => n.getAttribute('aria-label') === ${escapeText(label)}); return node?.getAttribute('aria-valuenow') ?? null; })()`);
      const increased = await app.evaluate(`(() => { const node = Array.from(document.querySelectorAll('[aria-label]')).find((n) => n.getAttribute('aria-label') === 'Increase ' + ${escapeText(label)}); if (!node) return false; node.click(); return true; })()`);
      await sleep(1800);
      const after = await app.evaluate(`(() => { const node = Array.from(document.querySelectorAll('[aria-valuenow]')).find((n) => n.getAttribute('aria-label') === ${escapeText(label)}); return node?.getAttribute('aria-valuenow') ?? null; })()`);
      const body = await app.text();
      mark("economy: slider step button works", increased === true && before !== after, `${String(before)} -> ${String(after)}`);
      mark("economy: slider action confirmed", body.includes("Applied:") || body.includes("Pending"), body.match(/Applied:[^\n]*/)?.[0] ?? "no status");
      await app.screenshot("41-budget-slider");

      await app.step("economy: type an out-of-range value");
      const numericSelector = `input[aria-label="${label} value"]`;
      const numericExists = await app.exists(numericSelector) || await app.exists(`input[aria-label="${label} value in %"]`);
      const selector = (await app.exists(numericSelector)) ? numericSelector : `input[aria-label="${label} value in %"]`;
      mark("economy: slider numeric field present", numericExists);
      if (numericExists) {
        await app.focus(selector);
        await app.typeText("999999");
        await app.pressKey("Enter", { keyCode: 13 });
        await sleep(2000);
        const clamped = await app.evaluate(`(() => { const node = document.querySelector(${escapeText(selector)}); return node?.value ?? null; })()`);
        mark("economy: out-of-range value clamps without crashing", clamped !== null && Number.parseFloat(clamped) <= 100, String(clamped));
        await app.screenshot("42-budget-out-of-range");

        await app.step("economy: non-numeric input is rejected without an action");
        const beforeInvalid = await app.evaluate(`(() => { const node = document.querySelector(${escapeText(selector)}); return node?.value ?? null; })()`);
        await app.focus(selector);
        await app.typeText("abc");
        await app.pressKey("Enter", { keyCode: 13 });
        await sleep(1200);
        const afterInvalid = await app.evaluate(`(() => { const node = document.querySelector(${escapeText(selector)}); return node?.value ?? null; })()`);
        const invalidBody = await app.text();
        mark(
          "economy: non-numeric input leaves the value intact",
          afterInvalid === beforeInvalid,
          `${String(beforeInvalid)} -> ${String(afterInvalid)}`,
        );
        mark("economy: non-numeric input does not raise an error", !invalidBody.includes("Dismiss"));
      }

      await app.step("economy: drag the slider track");
      const track = await app.evaluate(`(() => {
        const node = Array.from(document.querySelectorAll('[role="slider"]')).find((n) => n.getAttribute('aria-label') === ${escapeText(label)});
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, now: node.getAttribute('aria-valuenow') };
      })()`);
      if (track !== null) {
        const y = Math.round(track.y + track.h / 2);
        const startX = Math.round(track.x + track.w * 0.15);
        const endX = Math.round(track.x + track.w * 0.65);
        await app.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y, button: "left", buttons: 1, clickCount: 1 });
        for (let step = 1; step <= 8; step += 1) {
          await app.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(startX + ((endX - startX) * step) / 8), y, button: "left", buttons: 1 });
          await sleep(60);
        }
        await app.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y, button: "left", buttons: 0, clickCount: 1 });
        await sleep(2500);
        const dragged = await app.evaluate(`(() => { const node = Array.from(document.querySelectorAll('[role="slider"]')).find((n) => n.getAttribute('aria-label') === ${escapeText(label)}); return node?.getAttribute('aria-valuenow') ?? null; })()`);
        const dragBody = await app.text();
        mark(
          "economy: dragging the track changes the committed value",
          dragged !== null && Math.abs(Number.parseFloat(dragged) - Number.parseFloat(track.now ?? "0")) > 0.5 && dragBody.includes("Applied:"),
          `${String(track.now)} -> ${String(dragged)}${dragBody.includes("Applied:") ? " (applied)" : " (not applied)"}`,
        );
        await app.screenshot("43-budget-drag");
      } else {
        mark("economy: dragging the track changes the committed value", false, "slider track not found");
      }
    }
  }

  if (scenario("save")) {
    await app.step("save: create campaign and advance");
    await ensureCampaign({ tag: "BRA", name: "Republic of the United States of Brazil" });
    for (let index = 0; index < 3; index += 1) await clickWhenEnabled("+1 day");
    await sleep(2000);
    const savedDate = await currentDate();
    // A campaign created while an older save exists requires the explicit
    // replace confirmation; both paths are part of the save flow.
    const saveButtonSeen = await clickSaveButton();
    const promptVisible = await confirmOverwriteIfPrompted();
    await sleep(3000);
    let body = await app.text();
    const saveStatus = body.match(/(Saved|Autosaved)[^\n]*/)?.[0] ?? null;
    mark("save: reports saved", saveStatus !== null, `${saveStatus ?? "no status"} (button ${String(saveButtonSeen)}, prompt ${String(promptVisible)})`);
    await app.screenshot("50-saved");

    await app.step("save: reload application");
    await gotoApp();
    body = await app.text();
    mark("save: existing save offered on menu", body.includes("Continue campaign"));
    await app.screenshot("51-menu-with-save");

    await app.step("save: continue campaign");
    await app.clickAria("Continue campaign");
    await waitFor(`document.body.innerText.includes('World map')`, { timeout: 120000 });
    await sleep(2500);
    body = await app.text();
    const resumedDate = await currentDate();
    mark("save: continues the same country", body.includes("Brazil"));
    mark("save: preserves the simulated date", resumedDate === savedDate, `${String(savedDate)} -> ${String(resumedDate)}`);
    await app.screenshot("52-continued");

    await app.step("save: advance after load and save again");
    await clickWhenEnabled("+1 day");
    await sleep(1500);
    await clickSaveButton();
    await confirmOverwriteIfPrompted();
    await sleep(3000);
    body = await app.text();
    mark("save: second save reports status", /Saved/.test(body), body.match(/Saved[^\n]*/)?.[0] ?? "no status");
  }

  if (scenario("worker")) {
    await app.step("worker: restart worker keeps the player country");
    await ensureCampaign({ tag: "ETH", name: "Ethiopian Empire" });
    const before = await currentDate();
    await app.clickAria("Restart worker");
    await sleep(1000);
    await waitFor(`document.body.innerText.includes('World map') && document.body.innerText.includes('+1 day')`, { timeout: 180000 });
    await sleep(2000);
    const body = await app.text();
    mark("worker: restarted world keeps player country", body.includes("Ethiopia"));
    mark("worker: restart resets to the campaign start", (await currentDate()) === "1900-01-01", `${String(before)} -> ${String(await currentDate())}`);
    await app.screenshot("60-worker-restart");

    await app.step("worker: repeated restart");
    for (let index = 0; index < 2; index += 1) {
      await app.clickAria("Restart worker");
      await sleep(800);
      await waitFor(`document.body.innerText.includes('World map') && document.body.innerText.includes('+1 day')`, { timeout: 180000 });
      await sleep(1500);
    }
    mark("worker: repeated restarts stay usable", (await app.text()).includes("Ethiopia"));
  }

  if (scenario("persistence")) {
    await app.step("persistence: reject an older save schema with an actionable error");
    await gotoApp();
    const clearStoredSaves = () =>
      app.evaluate(`["century.m7.save.v1", "century.m7.save.v1.previous", "century.m7.save.v1.staging"].forEach((key) => localStorage.removeItem(key))`);
    // Earlier scenarios leave a valid primary/previous save. Clear every
    // candidate so this scenario observes only the payload under test; the
    // recovery-copy behaviour itself is covered by the save scenario.
    await clearStoredSaves();
    const legacySave = JSON.stringify({
      format: "century-save",
      formatVersion: 1,
      schemaVersion: 25,
      dayIndex: 5,
      seed: 1,
      simVersion: "0.27.0",
      dataVersion: "m3-economy-v13",
      scenarioId: "m11-world-1900",
      checksum: "00000000",
    });
    const storedLegacy = compressSaveForStorage(legacySave);
    await clearStoredSaves();
    await app.evaluate(`localStorage.setItem("century.m7.save.v1", ${JSON.stringify(storedLegacy)})`);
    await gotoApp();
    let body = await app.text();
    mark(
      "persistence: older schema is reported clearly",
      body.includes("schema 25") && body.includes("supports 26"),
      body.match(/Saved game could not be read:[^\n]*/)?.[0] ?? "no error banner",
    );
    mark("persistence: incompatible save is not offered as Continue", !body.includes("Continue campaign"));
    await app.screenshot("90-legacy-schema");

    await app.step("persistence: reject a corrupt stored save");
    await clearStoredSaves();
    await app.evaluate(`localStorage.setItem("century.m7.save.v1", "not-a-save")`);
    await gotoApp();
    body = await app.text();
    mark(
      "persistence: corrupt save is reported",
      body.includes("century-save-gzip1") && !body.includes("Continue campaign"),
      body.match(/Saved game could not be read:[^\n]*/)?.[0] ?? "no error banner",
    );
    await app.screenshot("91-corrupt-save");

    await app.step("persistence: clearing storage restores a clean first run");
    await clearStoredSaves();
    await gotoApp();
    body = await app.text();
    mark("persistence: clean start after clearing storage", body.includes("No saved campaign yet") && !body.includes("Saved game could not be read"));
    await app.screenshot("92-clean-start");

    await app.step("persistence: Load with no stored save reports a clear message");
    await clearStoredSaves();
    await app.navigate(`${APP_URL}?country=USA`);
    await waitFor(`document.body.innerText.includes('World map') && document.body.innerText.includes('+1 day')`, { timeout: 180000 });
    await sleep(1500);
    await clickWhenEnabled("Load");
    await sleep(2000);
    body = await app.text();
    mark("persistence: Load without a save reports the missing save", body.includes("No saved game was found"), body.match(/No saved game was found/)?.[0] ?? "no message");
    await app.screenshot("93-load-without-save");
  }

  if (scenario("stress")) {
    await app.step("stress: create a large campaign");
    await ensureCampaign({ tag: "RUS", name: "Russian Empire" });
    await clickNavTab("World");
    const heapBefore = await app.evaluate(`performance.memory ? performance.memory.usedJSHeapSize : null`);
    const tabs = ["Overview", "Budget", "Markets", "Industry", "Construction", "Trade", "Labor & health", "Money", "Population", "Politics", "Technology", "War & diplomacy", "Ledger", "World"];
    const switchStarted = Date.now();
    for (let round = 0; round < 3; round += 1) {
      for (const tab of tabs) {
        await app.evaluate(`(() => {
          const nodes = Array.from(document.querySelectorAll('[role="button"]'));
          const match = nodes.find((node) => { const text = (node.textContent ?? '').trim(); return text.endsWith(${JSON.stringify(tab)}) && text.length <= ${tab.length + 2}; });
          match?.click();
        })()`);
        await sleep(60);
      }
    }
    mark("stress: 42 navigation switches stay responsive", Date.now() - switchStarted < 60000, `${((Date.now() - switchStarted) / 1000).toFixed(1)} s`);
    await app.screenshot("80-stress-tabs");

    await app.step("stress: run at 30x for 20 seconds");
    await clickNavTab("World");
    const beforeRun = await currentDate();
    await app.clickAria("30×");
    await clickWhenEnabled("Play");
    await sleep(20000);
    const afterRun = await pauseAndWait();
    const dayDelta = (Date.parse(`${afterRun}T00:00:00Z`) - Date.parse(`${beforeRun}T00:00:00Z`)) / 86400000;
    mark("stress: 20 s at 30x advances simulated time", Number.isFinite(dayDelta) && dayDelta > 5, `${String(beforeRun)} -> ${String(afterRun)} (${String(dayDelta)} days)`);
    await app.screenshot("81-stress-30x");

    await app.step("stress: repeated save and load cycles");
    const savedAt = await currentDate();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await clickSaveButton();
      await confirmOverwriteIfPrompted();
      await sleep(2200);
      const cycleSaved = await currentDate();
      await clickWhenEnabled("+1 day");
      await sleep(900);
      const cycleStepped = await currentDate();
      await clickWhenEnabled("Load");
      await sleep(2500);
      const cycleLoaded = await currentDate();
      console.log(`  cycle ${String(cycle + 1)}: saved ${String(cycleSaved)} -> stepped ${String(cycleStepped)} -> loaded ${String(cycleLoaded)}`);
    }
    const afterLoad = await currentDate();
    mark("stress: repeated save/load returns to the saved date", afterLoad === savedAt, `${String(savedAt)} -> ${String(afterLoad)}`);
    const workerCount = await app.evaluate(`window.__m11d ? window.__m11d.workers.length : -1`);
    mark("stress: no worker replacement during save/load cycles", workerCount === 1, `${String(workerCount)} workers`);
    const heapAfter = await app.evaluate(`performance.memory ? performance.memory.usedJSHeapSize : null`);
    const growthMb = heapBefore !== null && heapAfter !== null ? (heapAfter - heapBefore) / (1024 * 1024) : null;
    mark("stress: JS heap growth stays bounded", growthMb === null ? true : growthMb < 200, growthMb === null ? "performance.memory unavailable" : `${growthMb.toFixed(1)} MB`);
    await app.screenshot("82-stress-save-load");
  }

  if (scenario("responsive")) {
    await app.step("responsive: narrow viewport");
    await ensureCampaign({ tag: "NLD", name: "Kingdom of the Netherlands" });
    await app.send("Emulation.setDeviceMetricsOverride", {
      width: 480,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1200);
    await app.screenshot("70-narrow-world");
    const narrow = await app.text();
    mark("responsive: narrow layout keeps map and controls", narrow.includes("World map") && narrow.includes("+1 day"));
    await clickNavTab("Budget");
    await sleep(800);
    await app.screenshot("71-narrow-budget");
    mark("responsive: narrow budget renders", (await app.text()).includes("Budget"));
    const overflow = await app.evaluate(`({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })`);
    mark("responsive: no horizontal page overflow", overflow.scrollW <= overflow.clientW + 2, JSON.stringify(overflow));
    await app.send("Emulation.clearDeviceMetricsOverride");
    await sleep(600);
    await app.screenshot("72-restored");
  }
} catch (error) {
  console.error("PLAYTEST ERROR:", error);
  try {
    await app.screenshot("99-failure");
  } catch {
    // ignore
  }
  mark("playtest completed without harness error", false, error instanceof Error ? error.message : String(error));
} finally {
  const report = await app.dumpReport();
  const pageErrors = await app.evaluate("window.__m11d ?? null").catch(() => null);
  writeJson(resolve(ROOT, "docs/images/m11d/console-log.json"), {
    results,
    entries: report.entries,
    events: {
      exceptions: report.events.exceptions,
      logs: report.events.logs,
      network: report.events.network,
      consoleWarningsAndErrors: report.events.console.filter((entry) => entry.type === "error" || entry.type === "warning"),
    },
    pageErrors,
  });
  console.log("\n=== console errors/warnings ===");
  for (const entry of report.entries) {
    console.log(`[${entry.step}] ${entry.kind}: ${entry.text.slice(0, 400)}`);
  }
  console.log(`\n=== page errors ===`);
  console.log(JSON.stringify(pageErrors, null, 2));
  console.log(`\n=== results ===`);
  for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  await app.close();
}
