/**
 * Layout audit of every sheet at the phone sizes: opens each of the thirteen
 * screens and reports any element that leaves the sheet sideways, which on a
 * phone is content the player can never reach, and any control under 44 points.
 *
 * Usage: PLAYTEST_GPU=1 node scripts/map/audit-sheets.mjs
 * Requires `pnpm -F @century/app export:web`. Exits non-zero on any finding.
 */
import { boot, sleep } from "../m11d/lib/harness.mjs";

const SIZES = [
  [667, 375],
  [844, 390],
];
const DOMAINS = [
  ["Realm", ["Overview", "Politics"]],
  ["Economy", ["Budget", "Markets", "Industry", "Construction", "Trade", "Labor & health", "Money"]],
  ["Society", ["Population", "Technology"]],
  ["World", ["War & diplomacy", "Ledger"]],
];

const app = await boot({ fresh: true, port: 8883, cdpPort: 9475, profile: ".cache-map/chrome-audit" });
await app.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
await app.navigate("http://127.0.0.1:8883/?country=DEU");
for (let attempt = 0; attempt < 90; attempt += 1) {
  await sleep(1000);
  if ((await app.text()).includes("TREASURY") || (await app.text()).includes("Treasury")) break;
}
await sleep(2000);

const clickText = (text) =>
  app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"], button'));
    const target = nodes.find((node) => (node.textContent ?? '').trim() === ${JSON.stringify(text)} || node.getAttribute('aria-label') === ${JSON.stringify(text)});
    if (target === undefined) return false;
    target.click();
    return true;
  })()`);

const audit = () =>
  app.evaluate(`(() => {
    const sheet = document.querySelector('[data-testid="side-sheet"]');
    if (sheet === null) return { missing: true };
    const bounds = sheet.getBoundingClientRect();
    const out = [];
    const small = [];
    for (const element of sheet.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const own = Array.from(element.childNodes).some((node) => node.nodeType === 3 && node.textContent.trim() !== '');
      if (own && rect.right > bounds.right + 1) out.push(element.textContent.slice(0, 50) + ' +' + Math.round(rect.right - bounds.right));
      const role = element.getAttribute('role');
      if ((role === 'button' || role === 'slider' || role === 'adjustable') && rect.height < 43.5) {
        small.push((element.getAttribute('aria-label') ?? element.textContent ?? '').slice(0, 40) + ' ' + Math.round(rect.height));
      }
    }
    return { height: Math.round(sheet.scrollHeight), overflow: [...new Set(out)].slice(0, 12), small: [...new Set(small)].slice(0, 12) };
  })()`);

let findings = 0;
for (const [width, height] of SIZES) {
  await app.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  for (const [domain, screens] of DOMAINS) {
    await clickText(domain);
    await sleep(500);
    for (const screen of screens) {
      await clickText(screen);
      await sleep(700);
      const result = await audit();
      const bad = (result.overflow?.length ?? 0) + (result.small?.length ?? 0);
      findings += bad;
      console.log(`${String(width)}x${String(height)} ${screen}: height ${String(result.height)}${bad === 0 ? " ok" : ""}`);
      for (const line of result.overflow ?? []) console.log(`   overflow: ${line}`);
      for (const line of result.small ?? []) console.log(`   small: ${line}`);
      if (process.env.AUDIT_SHOTS === "1" && width === 844) await app.screenshot(`sheet-${screen.replace(/[^a-z]/giu, "").toLowerCase()}`);
    }
    await clickText(domain);
    await sleep(300);
  }
}
console.log(findings === 0 ? "no findings" : `${String(findings)} findings`);
await app.close?.();
process.exit(findings === 0 ? 0 : 1);
