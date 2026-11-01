/**
 * M12a playtest: open a real exported campaign and screenshot the province map.
 *
 * Usage: node scripts/m12/playtest-screenshot.mjs
 * Requires `pnpm -F @century/app export:web` and a Chrome installation.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { boot, sleep, SHOT_DIR } from "../m11d/lib/harness.mjs";

const country = process.env.PLAYTEST_COUNTRY ?? "German Empire";
const commonName = process.env.PLAYTEST_COMMON ?? "Germany";
const search = process.env.PLAYTEST_SEARCH ?? "German";
const suffix = process.env.PLAYTEST_SHOT ?? "";
const wheelX = Number(process.env.PLAYTEST_WHEEL_X ?? 650);
const wheelY = Number(process.env.PLAYTEST_WHEEL_Y ?? 330);
const wheelSteps = Number(process.env.PLAYTEST_WHEEL_STEPS ?? 13);

const app = await boot({ fresh: true, port: 8877, cdpPort: 9463 });

async function waitForText(text, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await app.text();
    if (body.includes(text)) return true;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

try {
  await app.navigate("http://127.0.0.1:8877/");
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
  await sleep(3500);
  await app.screenshot(`m12a-game-map${suffix}`);
  // Country-level zoom focused on central Europe (the zoom buttons pivot on the
  // map centre in the Atlantic, so use the real wheel handler at Europe).
  await app.evaluate(`(() => {
    const target = document.elementFromPoint(${String(wheelX)}, ${String(wheelY)}) ?? document.querySelector('svg');
    if (target === null) return false;
    for (let index = 0; index < ${String(wheelSteps)}; index += 1) {
      target.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120,
        clientX: ${String(wheelX)},
        clientY: ${String(wheelY)},
        bubbles: true,
        cancelable: true,
      }));
    }
    return true;
  })()`);
  await sleep(1800);
  await app.screenshot(`m12a-game-map-zoom${suffix}`);
  const provinceClicked = await app.evaluate(`(() => {
    const path = Array.from(document.querySelectorAll('svg path[aria-label]')).find((node) =>
      (node.getAttribute('aria-label') ?? '').startsWith('Bavaria'),
    );
    if (path === undefined || path === null) return false;
    path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  await sleep(1200);
  await app.screenshot(`m12a-game-map-province${suffix}`);
  const body = await app.text();
  console.log(
    "game loaded:",
    body.includes("World map"),
    "date:",
    body.includes("1900-01-01"),
    "province clicked:",
    provinceClicked,
    "province panel:",
    body.includes("Province"),
  );
  for (const name of [
    `m12a-game-map${suffix}`,
    `m12a-game-map-zoom${suffix}`,
    `m12a-game-map-province${suffix}`,
  ]) {
    const target = join(SHOT_DIR, `${name}.png`);
    if (existsSync(target)) {
      copyFileSync(target, join(SHOT_DIR, "..", `${name}.png`));
      console.log(`copied docs/images/${name}.png`);
    }
  }
} finally {
  await app.close?.();
}

