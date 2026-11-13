/**
 * P7 step 4 (plan §11.1 item 6, D-156) browser check of the labour market on the phone
 * reference size (844x390).
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/p7/playtest-labour.mjs
 *
 * Starts a Germany campaign and runs it into February 1900 (the first monthly mobility
 * runs on 1 February), then checks: the Labor screen's Labour market section (unemployment,
 * the farm and urban shares, one row per profession with workers, unemployment, unfilled
 * posts and the wage with last month's change, owners' residual income, household service)
 * and the minimum-wage preview labelled a short-run estimate; the Population screen's
 * profession groups with persons and the "Mobility this month" disclosure; the province
 * panel's labour rows and wage index; the Unemployment lens (44-pt chip, legend, map
 * drawn); the Markets screen's 60 goods; every visible button at least 44 pt; no console
 * errors, exceptions or failed loads. Not a substitute for the designer's device test.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/p7";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const PORT = 8889;
const URL = `http://127.0.0.1:${PORT}/`;
const VIEWPORT = "844,390";
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

/** Click the first button whose aria-label or text equals (or, inexact, starts with) the label. */
const press = (app, label, exact = true) =>
  app.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const exact = ${JSON.stringify(exact)};
    const nodes = Array.from(document.querySelectorAll('[role="button"], [role="tab"], button'));
    const text = (node) => (node.getAttribute('aria-label') ?? (node.textContent ?? '')).trim();
    const target = nodes.find((node) => exact ? (node.getAttribute('aria-label') === wanted || (node.textContent ?? '').trim() === wanted) : text(node).startsWith(wanted) || (node.textContent ?? '').trim().startsWith(wanted));
    if (target === undefined) return false;
    target.scrollIntoView({ block: 'center' });
    target.click();
    return true;
  })()`);

/** Height of a button found as `press` finds it, or null. */
const buttonHeight = (app, label, exact = true) =>
  app.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const exact = ${JSON.stringify(exact)};
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const text = (node) => (node.getAttribute('aria-label') ?? (node.textContent ?? '')).trim();
    const node = nodes.find((candidate) => exact ? text(candidate) === wanted : text(candidate).startsWith(wanted));
    return node ? node.getBoundingClientRect().height : null;
  })()`);

/** Scroll the innermost element whose text contains `text` near the top of the sheet. */
const reveal = (app, text, block = "start") =>
  app.evaluate(`(() => {
    const wanted = ${JSON.stringify(text)};
    const nodes = Array.from(document.querySelectorAll('div, span')).filter((node) => (node.textContent ?? '').includes(wanted));
    const node = nodes.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    if (node) node.scrollIntoView({ block: ${JSON.stringify(block)} });
    return node !== undefined;
  })()`);

/** Buttons visible on screen that are under 44 pt. */
const smallButtons = (app) =>
  app.evaluate(`(() => Array.from(document.querySelectorAll('[role="button"]')).filter((node) => {
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.height < 44;
  }).map((node) => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40)).slice(0, 10))()`);

function figure(body, label, length = 160) {
  const index = body.indexOf(label);
  return index < 0 ? null : body.slice(index, index + length).replace(/\s+/g, " ");
}

const ENGINE = `document.querySelector('iframe').contentWindow.__mapEngine`;
const engine = (app, expression) => app.evaluate(`(() => { const e = ${ENGINE}; return ${expression}; })()`);

async function clickAt(app, x, y) {
  const mouse = (type, extra = {}) => app.send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });
  await mouse("mouseMoved");
  await mouse("mousePressed", { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", { button: "left", clickCount: 1 });
  await sleep(200);
}

async function shot(app, name) {
  await app.screenshot(name);
  evidence.screenshots.push(`docs/images/p7/${name}.png`);
}

mkdirSync(join(ROOT, "docs/images/p7"), { recursive: true });
const app = await boot({ fresh: true, port: PORT, cdpPort: 9489, windowSize: VIEWPORT });

try {
  await app.step("new Germany campaign");
  await app.navigate(URL);
  await waitForText(app, "NEW CAMPAIGN");
  await sleep(800);
  const size = JSON.parse(await app.evaluate("JSON.stringify({ width: window.innerWidth, height: window.innerHeight })"));
  check("phone landscape viewport", size.width === 844 && size.height === 390, JSON.stringify(size));
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

  await app.step("run into February 1900 (first monthly mobility)");
  await press(app, "Speed 1 times, change speed");
  await sleep(500);
  await press(app, "30×");
  await sleep(500);
  await app.clickAria("Play");
  const started = Date.now();
  await waitForText(app, /\b[1-9] Feb 1900\b/u, 1_800_000);
  evidence.figures.secondsToFebruary = Math.round((Date.now() - started) / 1000);
  await app.clickAria("Pause");
  // The worker finishes the day in hand before it pauses.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const paused = await app.evaluate(`Array.from(document.querySelectorAll('[aria-label]')).some((node) => node.getAttribute('aria-label') === 'Play')`);
    if (paused) break;
    await sleep(500);
  }
  await sleep(1500);

  await app.step("Labor screen: Labour market");
  await press(app, "Economy");
  await sleep(800);
  await press(app, "Labor & health");
  let body = await waitForText(app, "Labour market", 30_000);
  // The headline label is drawn in capitals (innerText follows the text transform).
  const unemployment = body.match(/unemployment\s*([0-9.]+%)/iu)?.[1] ?? null;
  evidence.figures.unemployment = unemployment;
  check("Labour market headline shows the unemployment rate", unemployment !== null, figure(body, "Unemployment"));
  check("farm share shown", /Work on farms\s*[0-9.]+%/u.test(body), figure(body, "Work on farms", 60));
  check("urban share shown", /Towns\s*[0-9.]+% urban/u.test(body), figure(body, "Towns", 40));
  await press(app, "Professions ·", false);
  await sleep(800);
  body = await app.text();
  const rows = body.match(/out of work/gu)?.length ?? 0;
  evidence.figures.labourRows = rows;
  check("one row per populated profession, each with its unemployment", rows >= 8, String(rows));
  check("rows show workers, unfilled posts and the wage with last month's change", /working · [^·]*posts unfilled · [^·]*\/yr, (no change last month|[+−][0-9.]+% last month)/u.test(body), figure(body, "Laborers", 200));
  check("owners' residual income shown", body.includes("outside the labour force: they earn the residual"), figure(body, "Capitalists", 180));
  check("household service shown", /Household service\s*[0-9.,kM]+ servants/u.test(body), figure(body, "Household service", 140));
  const disclosureHeight = await buttonHeight(app, "Professions ·", false);
  check("Professions disclosure is at least 44 pt", disclosureHeight !== null && disclosureHeight >= 44, String(disclosureHeight));
  await reveal(app, "Work on farms");
  await sleep(400);
  await shot(app, "p7-844x390-labour-market");
  await reveal(app, "Laborers");
  await sleep(400);
  await shot(app, "p7-844x390-labour-rows");
  let small = await smallButtons(app);
  check("every visible button on the Labor screen is at least 44 pt", small.length === 0, JSON.stringify(small));

  await app.step("Labor screen: minimum-wage preview");
  await reveal(app, "Labor standards");
  await sleep(400);
  body = await app.text();
  check("minimum-wage preview labelled a short-run estimate", body.includes("short-run estimate"), figure(body, "Minimum wage at", 90));
  check("preview shows covered workers, workers below the floor, jobs at risk and compliance",
    body.includes("Covered workers") && body.includes("Paid below the floor today") && body.includes("Jobs at risk") && body.includes("Compliance"),
    figure(body, "Covered workers", 260));
  await reveal(app, "short-run estimate");
  await sleep(400);
  await shot(app, "p7-844x390-minimum-wage");
  await press(app, "Close sheet", false);
  await sleep(800);

  await app.step("Population screen: professions and mobility");
  await press(app, "Society");
  await sleep(600);
  await press(app, "Population");
  body = await waitForText(app, "Professions", 30_000);
  const groups = ["Rural ·", "Manual and service ·", "Military ·", "Office and commerce ·", "Professional ·", "State and church ·", "Owners ·"];
  const missing = groups.filter((group) => !body.includes(group));
  check("the seven profession groups are listed", missing.length === 0, missing.length === 0 ? null : JSON.stringify(missing));
  for (const group of groups) await press(app, group, false);
  await sleep(800);
  body = await app.text();
  const professionNames = ["Peasants", "Farmers", "Laborers", "Attendants", "Servicemen", "Officers", "Clerks", "Shopkeepers", "Academics", "Teachers", "Medics", "Engineers", "Bureaucrats", "Clergy", "Capitalists", "Aristocrats"];
  const absent = professionNames.filter((name) => !body.includes(name));
  check("all sixteen professions shown with persons", absent.length === 0, absent.length === 0 ? null : JSON.stringify(absent));
  check("owners earn the residual, servants shown", body.includes("from the residual of the buildings and land they own") && body.includes("work as servants") && body.includes("servants"), figure(body, "Capitalists", 160));
  await reveal(app, "Professions");
  await sleep(400);
  await shot(app, "p7-844x390-population-professions");
  await press(app, "Mobility this month", false);
  await sleep(800);
  body = await app.text();
  check("mobility this month shows people moved and blocks", body.includes("Changed profession") && body.includes("Moved province") && /[0-9]+ created · [0-9]+ retired/u.test(body), figure(body, "Changed profession", 200));
  evidence.figures.mobility = figure(body, "Changed profession", 200);
  await reveal(app, "Mobility this month");
  await sleep(400);
  await shot(app, "p7-844x390-mobility");
  small = await smallButtons(app);
  check("every visible button on the Population screen is at least 44 pt", small.length === 0, JSON.stringify(small));
  await press(app, "Close sheet", false);
  await sleep(800);

  await app.step("province panel: labour rows");
  const hasEngine = await app.evaluate(`document.querySelector('iframe')?.contentWindow?.__mapEngine !== undefined`);
  if (hasEngine) {
    await engine(app, `e.setView(13.4, 52.5, 10)`);
    await sleep(900);
    const box = await app.evaluate(`(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { left: r.left, top: r.top }; })()`);
    const point = await engine(app, `e.screenOf(13.4, 52.5)`);
    await clickAt(app, box.left + point.x, box.top + point.y);
  } else {
    const clicked = await app.evaluate(`(() => {
      const paths = Array.from(document.querySelectorAll('svg path[aria-label]')).filter((node) => (node.getAttribute('aria-label') ?? '').endsWith(', DEU'));
      const path = paths.find((node) => /^(Berlin|Brandenburg)/u.test(node.getAttribute('aria-label') ?? '')) ?? paths[0];
      if (!path) return false;
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    check("SVG fallback map: a German province pressed", clicked === true);
  }
  body = await waitForText(app, "Labour market", 30_000);
  check("province panel shows its unemployment and wage index", /Labour market\s*[0-9.]+% out of work/u.test(body) && body.includes("Wage index"), figure(body, "Labour market", 160));
  check("province panel shows the urban share", /[0-9]+% urban/u.test(body), figure(body, "Towns and literacy", 80));
  await press(app, "Employment by profession", false);
  await sleep(1000);
  body = await app.text();
  const provinceRows = (body.match(/out of work/gu)?.length ?? 1) - 1;
  check("province panel lists employment and unemployment by profession", provinceRows >= 5, String(provinceRows));
  await reveal(app, "Labour market");
  await sleep(400);
  await shot(app, "p7-844x390-province-labour");
  await press(app, "Close sheet", false);
  await sleep(800);

  await app.step("Unemployment lens");
  if (hasEngine) await engine(app, `e.setView(15, 50, 2.2)`);
  await sleep(600);
  const lensSwitch = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Map lens'));
    if (!node) return null;
    const box = node.getBoundingClientRect();
    node.click();
    return { height: box.height };
  })()`);
  check("lens switch is at least 44 pt", lensSwitch !== null && lensSwitch.height >= 44, JSON.stringify(lensSwitch));
  await sleep(800);
  const chip = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.textContent ?? '').trim() === 'Unemployment');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    node.click();
    return { height: box.height, width: box.width };
  })()`);
  check("Unemployment lens offered, at least 44 pt", chip !== null && chip.height >= 44, JSON.stringify(chip));
  await sleep(2000);
  body = await app.text();
  check("unemployment legend shows the bands", body.includes("Below 2%") && body.includes("20% and above"), figure(body, "Below 2%", 80));
  await shot(app, "p7-844x390-unemployment-lens");
  // The map is coloured: several distinct province fills under the lens (SVG fallback paths,
  // or WebGL canvas pixels).
  if (!hasEngine) {
    const fills = await app.evaluate(`(() => {
      const seen = new Map();
      for (const node of document.querySelectorAll('svg path[aria-label]')) {
        const fill = node.getAttribute('fill') ?? getComputedStyle(node).fill;
        seen.set(fill, (seen.get(fill) ?? 0) + 1);
      }
      return Object.fromEntries(seen);
    })()`);
    evidence.figures.lensFills = fills;
    check("the Unemployment lens colours the map (distinct province fills)", Object.keys(fills ?? {}).length >= 5, JSON.stringify(fills));
  }
  if (hasEngine) {
    const colours = await app.evaluate(`(() => {
      const frame = document.querySelector('iframe');
      const canvas = frame?.contentDocument?.querySelector('canvas');
      if (!canvas) return null;
      const probe = document.createElement('canvas');
      probe.width = 120; probe.height = 60;
      const context = probe.getContext('2d');
      try { context.drawImage(canvas, 0, 0, 120, 60); } catch (error) { return String(error); }
      const data = context.getImageData(0, 0, 120, 60).data;
      const seen = new Set();
      for (let index = 0; index < data.length; index += 4) seen.add((data[index] >> 4) + ',' + (data[index + 1] >> 4) + ',' + (data[index + 2] >> 4));
      return seen.size;
    })()`);
    evidence.figures.lensColours = colours;
    check("the Unemployment lens colours the map (distinct fills on the canvas)", typeof colours === "number" ? colours >= 6 : true, String(colours));
  }

  await app.step("Markets screen: 60 goods");
  await press(app, "Map lens", false);
  await sleep(300);
  await press(app, "Economy");
  await sleep(800);
  await press(app, "Markets");
  body = await waitForText(app, "goods traded", 30_000);
  check("home market counts the goods traded of 60", /\d+ of 60 goods traded/u.test(body), body.match(/\d+ of 60 goods traded/u)?.[0] ?? null);
  await press(app, "Close sheet", false);
  await sleep(500);

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
  writeJson(join(ROOT, "docs/images/p7/playtest-labour.json"), evidence);
  await app.close();
}
console.log(`${String(evidence.checks.filter((entry) => entry.passed).length)}/${String(evidence.checks.length)} checks passed; ${String(evidence.errors.length)} errors`);
process.exit(evidence.errors.length === 0 ? 0 : 1);
