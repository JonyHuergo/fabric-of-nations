/**
 * P7b (D-170) browser check of saving the 1900 world on the phone reference size (844x390).
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/p7/playtest-saves.mjs
 *
 * Starts a Germany campaign, plays a day, saves with the top-bar button, then pauses after
 * playing so the game autosaves; checks the status line, that the save went to the IndexedDB
 * database `fabric-of-nations-saves` (as chunks) and not to localStorage, then reloads the
 * page and continues the campaign: same country, same date. Records the stored size and the
 * time of each save. No console errors, exceptions or failed loads. Not a substitute for the
 * designer's device test (iOS and Android store the same chunks in SQLite).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/p7";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const PORT = 8890;
const URL = `http://127.0.0.1:${PORT}/`;
const VIEWPORT = "844,390";
const DATABASE = "fabric-of-nations-saves";
const evidence = { startedAt: new Date().toISOString(), viewport: VIEWPORT, checks: [], errors: [], screenshots: [], figures: {} };

function check(name, condition, detail = null) {
  evidence.checks.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail === null ? "" : ` — ${detail}`}`);
  if (!condition) evidence.errors.push(`${name}${detail === null ? "" : `: ${detail}`}`);
}

async function waitForText(app, text, timeout = 240_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await app.text();
    if (typeof text === "string" ? body.includes(text) : text.test(body)) return body;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${String(text)}`);
}

/** Click a button by its aria-label or text once it is enabled. */
async function pressWhenEnabled(app, label, timeout = 60_000, exact = true) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const clicked = await app.evaluate(`(() => {
      const wanted = ${JSON.stringify(label)};
      const exact = ${JSON.stringify(exact)};
      const matches = (text) => (exact ? text === wanted : text.startsWith(wanted));
      const node = Array.from(document.querySelectorAll('[role="button"], button')).find((entry) =>
        matches(entry.getAttribute('aria-label') ?? '') || matches((entry.textContent ?? '').trim()));
      if (!node || node.getAttribute('aria-disabled') === 'true') return false;
      node.click();
      return true;
    })()`);
    if (clicked) return;
    await sleep(300);
  }
  throw new Error(`timed out waiting for an enabled ${label}`);
}

const currentDate = (app) => app.evaluate(`document.body.innerText.match(/\\b\\d{1,2} [A-Z][a-z]{2} \\d{4}\\b/)?.[0] ?? null`);

/** Open the campaign sheet from the country pill (its label ends ", open campaign"). */
const openCampaign = (app) =>
  app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((entry) => (entry.getAttribute('aria-label') ?? '').endsWith(', open campaign'));
    if (!node) return false;
    node.click();
    return true;
  })()`);

/** The save database's keys and total characters, and any save keys left in localStorage. */
const storage = (app) =>
  app.evaluate(`(async () => {
    const databases = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((entry) => entry.name) : [];
    const local = Object.keys(localStorage).filter((key) => key.startsWith('fon.saves'));
    if (!databases.includes(${JSON.stringify(DATABASE)})) return JSON.stringify({ databases, local, keys: 0, chunks: 0, characters: 0 });
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(${JSON.stringify(DATABASE)}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const names = Array.from(db.objectStoreNames);
    const rows = [];
    const keys = [];
    const read = (name, method) => new Promise((resolve, reject) => { const request = db.transaction(name, 'readonly').objectStore(name)[method](); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    for (const name of names) {
      rows.push(...(await read(name, 'getAll')));
      keys.push(...(await read(name, 'getAllKeys')).map(String));
    }
    db.close();
    return JSON.stringify({
      databases, local, stores: names, keys: keys.length,
      chunks: keys.filter((key) => key.includes('#chunk:')).length,
      characters: rows.reduce((total, row) => total + (typeof row === 'string' ? row.length : 0), 0),
    });
  })()`).then((raw) => JSON.parse(raw));

const figure = (body) => body.slice(0, 120).replace(/\s+/gu, " ");

async function shot(app, name) {
  await app.screenshot(name);
  evidence.screenshots.push(`docs/images/p7/${name}.png`);
}

mkdirSync(join(ROOT, "docs/images/p7"), { recursive: true });
const app = await boot({ fresh: true, port: PORT, cdpPort: 9490, windowSize: VIEWPORT });

try {
  await app.step("new Germany campaign");
  await app.navigate(URL);
  await waitForText(app, "NEW CAMPAIGN");
  await sleep(800);
  const before = await storage(app);
  check("no save in storage before the first save", before.keys === 0 && before.local.length === 0, JSON.stringify(before));
  await app.clickAria("New campaign");
  await waitForText(app, "The world of 1 January 1900", 20_000);
  await app.clickAria("Continue to country selection");
  await waitForText(app, "Choose a country", 20_000);
  await sleep(700);
  await app.focus('input[aria-label="Search historical countries"]');
  await app.typeText("German");
  await sleep(700);
  await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith('German Empire'));
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    if (match) { match.scrollIntoView({ block: 'center' }); match.click(); }
  })()`);
  await sleep(1200);
  await app.clickAria("Play as German", { exact: false });
  await waitForText(app, "TREASURY", 240_000);
  await sleep(3000);

  await app.step("manual save");
  await pressWhenEnabled(app, "Advance one day");
  await sleep(4000);
  const savedDate = await currentDate(app);
  check("the date advanced to 2 January 1900", savedDate === "2 Jan 1900", String(savedDate));
  check("the campaign sheet opens from the country pill", await openCampaign(app));
  await sleep(800);
  let started = Date.now();
  await pressWhenEnabled(app, "Save");
  // The status line reads "Saved 1900-01-02 · … KiB canonical · … KiB stored" (the sheet's
  // "Saved game" heading is not a status).
  let body = await waitForText(app, /Saved \d{4}-\d{2}-\d{2}[^\n]*|Save failed[^\n]*/u, 120_000);
  evidence.figures.manualSaveSeconds = Math.round((Date.now() - started) / 100) / 10;
  const status = body.match(/Saved \d{4}-\d{2}-\d{2}[^\n]*|Save failed[^\n]*/u)?.[0] ?? null;
  evidence.figures.manualSaveStatus = status;
  check("the manual save reports Saved, not a failure", status !== null && status.startsWith("Saved"), status);
  const afterSave = await storage(app);
  evidence.figures.afterManualSave = afterSave;
  check("the save is in the IndexedDB save database, as chunks", afterSave.databases.includes(DATABASE) && afterSave.chunks > 1, JSON.stringify(afterSave));
  check("no save keys in localStorage", afterSave.local.length === 0, JSON.stringify(afterSave.local));
  check("the stored save is larger than the old localStorage quota (5.24 M characters)", afterSave.characters > 5_242_880, String(afterSave.characters));
  await shot(app, "p7b-844x390-saved");
  await pressWhenEnabled(app, "Close sheet", 5_000, false).catch(() => undefined);
  await sleep(600);

  await app.step("autosave on pause");
  await pressWhenEnabled(app, "Play");
  await sleep(6000);
  started = Date.now();
  await pressWhenEnabled(app, "Pause");
  body = await waitForText(app, /Autosaved \d{4}-\d{2}-\d{2}[^\n]*|Autosave failed[^\n]*/u, 180_000);
  evidence.figures.autosaveSeconds = Math.round((Date.now() - started) / 100) / 10;
  const autosave = body.match(/Autosaved \d{4}-\d{2}-\d{2}[^\n]*|Autosave failed[^\n]*/u)?.[0] ?? null;
  evidence.figures.autosaveStatus = autosave;
  check("pausing autosaves, without a failure", autosave !== null && autosave.startsWith("Autosaved"), autosave);
  await sleep(1500);
  const autosavedDate = await currentDate(app);
  evidence.figures.dates = { savedDate, autosavedDate };
  const afterAutosave = await storage(app);
  evidence.figures.afterAutosave = afterAutosave;
  check("after the autosave the slot holds the save and its previous copy, as chunks", afterAutosave.chunks > afterSave.chunks, JSON.stringify(afterAutosave));

  await app.step("reload and continue");
  await app.navigate(URL);
  await waitForText(app, "NEW CAMPAIGN");
  // The menu lists the saves after reading the save database.
  body = await waitForText(app, /\bcontinue\b/iu, 30_000).catch(async () => app.text());
  const menuEntries = await app.evaluate(`Array.from(document.querySelectorAll('[role="button"]')).map((node) => (node.textContent ?? '').trim().slice(0, 60)).slice(0, 8)`);
  evidence.figures.menuEntries = menuEntries;
  check("the menu offers Continue after a reload", menuEntries.some((entry) => entry.startsWith("Continue")), JSON.stringify(menuEntries));
  started = Date.now();
  await pressWhenEnabled(app, "Continue", 30_000, false);
  body = await waitForText(app, "TREASURY", 240_000);
  evidence.figures.continueSeconds = Math.round((Date.now() - started) / 100) / 10;
  await sleep(2500);
  body = await app.text();
  const resumedDate = await currentDate(app);
  check("the campaign continues as Germany", body.includes("Germany"), figure(body));
  check("the campaign continues on the autosaved date", resumedDate === autosavedDate, `${String(autosavedDate)} -> ${String(resumedDate)}`);
  await shot(app, "p7b-844x390-continued");

  const report = await app.dumpReport();
  const consoleErrors = report.events.console.filter((entry) => entry.type === "error");
  const failedLoads = report.events.network.filter((entry) => entry.kind === "loadingFailed");
  check("no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));
  check("no uncaught exceptions", report.events.exceptions.length === 0, JSON.stringify(report.events.exceptions.slice(0, 5)));
  check("no failed resource loads", failedLoads.length === 0, JSON.stringify(failedLoads.slice(0, 5)));
} catch (error) {
  evidence.errors.push(String(error?.stack ?? error));
  console.error(error);
} finally {
  evidence.finishedAt = new Date().toISOString();
  writeJson(join(ROOT, "docs/images/p7/playtest-saves.json"), evidence);
  await app.close();
}
console.log(`${String(evidence.checks.filter((entry) => entry.passed).length)}/${String(evidence.checks.length)} checks passed; ${String(evidence.errors.length)} errors`);
process.exit(evidence.errors.length === 0 ? 0 : 1);

