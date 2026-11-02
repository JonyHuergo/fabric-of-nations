/**
 * Loads the atlas page the way a WebView does: from a `file://` address, with the
 * native bridge object present and commands delivered through the injected
 * receiver. It proves the page starts from a file origin under its own security
 * policy, decodes in a worker, draws, and speaks the protocol both ways.
 *
 * Usage: PLAYTEST_GPU=1 PLAYTEST_SHOT_DIR=docs/images/living-atlas node scripts/map/verify-file-origin.mjs
 *
 * This runs in desktop Chrome, not in WKWebView or Android WebView. It removes the
 * biggest unknowns about the page; it does not replace running on a phone.
 * Exits non-zero if any check fails.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { connectChrome, createSession, ROOT, sleep } from "../m11d/lib/harness.mjs";

const SHOTS = resolve(ROOT, "docs/images/living-atlas");
mkdirSync(SHOTS, { recursive: true });

const cdp = await connectChrome({ port: 9476, profile: ".cache-map/chrome-file", fresh: true });
const app = createSession(cdp);
const originalOnMessage = cdp.socket.onmessage;
cdp.socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method !== undefined && cdp.onEvent !== undefined) cdp.onEvent(message);
  originalOnMessage(event);
};
await app.send("Page.enable");
await app.send("Runtime.enable");
await app.send("Log.enable");
await app.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
await app.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__sent = []; window.ReactNativeWebView = { postMessage: (message) => window.__sent.push(JSON.parse(message).body) };`,
});

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` — ${detail}`}`);
}
const evaluate = async (expression) => {
  const reply = await app.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (reply.exceptionDetails !== undefined) throw new Error(JSON.stringify(reply.exceptionDetails));
  return reply.result.value;
};
const sent = () => evaluate(`JSON.stringify(window.__sent)`).then((text) => JSON.parse(text));
const command = (body) =>
  evaluate(`window.__fonMapReceive(${JSON.stringify(JSON.stringify({ v: 1, body }))})`);

try {
  const url = pathToFileURL(resolve(ROOT, "packages/app/public/map/atlas-v1.html")).href;
  await app.send("Page.navigate", { url });
  let ready = false;
  const started = Date.now();
  while (Date.now() - started < 30_000 && !ready) {
    await sleep(100);
    try {
      const events = await sent();
      ready = events.some((event) => event.type === "ready");
      if (events.some((event) => event.type === "unavailable")) throw new Error(JSON.stringify(events));
    } catch (error) {
      if (String(error).includes("unavailable")) throw error;
    }
  }
  check("the page starts from a file origin and reports ready", ready, `${String(Date.now() - started)} ms`);
  check("the origin really is a file", (await evaluate(`location.protocol`)) === "file:");
  check("rendering is WebGL2", await evaluate(`window.__mapEngine.stats().frames > 0`));
  check(
    "fonts load from inside the page",
    await evaluate(`document.fonts.check('13px IBMPlexSansCondensed_600SemiBold')`),
  );
  check("the payload nodes were released", await evaluate(`document.getElementById('fon-bundle') === null`));

  await command({ type: "set-theme", eraId: "cold-war", immediate: true });
  await command({ type: "set-selection", selectedTag: "JPN", playerTag: "JPN", selectedProvinceIndex: null });
  await command({ type: "focus-unit", tag: "JPN", immediate: true });
  await command({ type: "set-lens", lens: "political", highlightMarketId: null });
  await command({ type: "set-insets", left: 60, right: 0, reserved: [] });
  await sleep(600);
  check("a focus command moves the camera", (await evaluate(`window.__mapEngine.cameraState().scale`)) > 3);
  let rejected = false;
  try {
    await evaluate(`window.__fonMapReceive('{"v":1,"body":{"type":"set-lens","lens":"population"}}')`);
  } catch {
    rejected = true;
  }
  check("a malformed command is refused", rejected);

  // An idle map draws nothing, and an era change fades, then stops.
  await sleep(500);
  const idleStart = await evaluate(`window.__mapEngine.stats().frames`);
  await sleep(1000);
  check("an idle map draws no frames", (await evaluate(`window.__mapEngine.stats().frames`)) === idleStart);
  await command({ type: "set-theme", eraId: "digital", immediate: false });
  await sleep(2200);
  const faded = await evaluate(`window.__mapEngine.stats().frames`);
  check("an era change draws a fade", faded - idleStart > 15, `${String(faded - idleStart)} frames`);
  await sleep(600);
  check("the fade stops", (await evaluate(`window.__mapEngine.stats().frames`)) === faded);

  await app.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const point = await evaluate(`window.__mapEngine.screenOf(139.7, 36)`);
  await app.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
  await sleep(30);
  await app.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(250);
  const press = (await sent()).find((event) => event.type === "province-press");
  check("a real touch reaches the host as a press", press !== undefined, JSON.stringify(press ?? null));

  const errors = app.events.exceptions.map((entry) => entry.text);
  const blocked = app.events.logs.filter((entry) => /Content Security Policy/iu.test(entry.text));
  check("no exceptions", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("the page's policy blocked nothing it needs", blocked.length === 0, blocked.map((entry) => entry.text).join(" | "));
  await app.screenshot("file-origin-page");
} catch (error) {
  check("verification script completed", false, String(error));
} finally {
  const failed = results.filter((entry) => !entry.passed);
  console.log(`\n${String(results.length - failed.length)}/${String(results.length)} checks passed`);
  cdp.chrome.kill();
  process.exit(failed.length === 0 ? 0 : 1);
}
