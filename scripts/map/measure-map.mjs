/**
 * Runtime map measurement and screenshots against the exported web build.
 *
 * Starts a real campaign in headless Chrome and drives the map with trusted
 * input events, so it measures whichever renderer the build selects: the WebGL
 * engine, or the SVG renderer (including older builds, for a baseline).
 *
 *   PLAYTEST_GPU=1            use the machine's GPU instead of SwiftShader
 *   MAP_LABEL=name            output suffix for screenshots and the report
 *   MAP_SKIP_SHOTS=1          performance only
 *
 * Usage: node scripts/map/measure-map.mjs
 * Requires `pnpm -F @century/app export:web` and a Chrome installation.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, boot, sleep } from "../m11d/lib/harness.mjs";

const LABEL = process.env.MAP_LABEL ?? "after";
const OUT = resolve(ROOT, "docs/images/map");
mkdirSync(OUT, { recursive: true });


const app = await boot({ fresh: true, port: 8879, cdpPort: 9471, profile: ".cache-map/chrome" });
await app.send("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

async function waitForText(text, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if ((await app.text()).includes(text)) return;
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

async function enterCampaign() {
  await app.navigate("http://127.0.0.1:8879/");
  await waitForText("FABRIC OF NATIONS");
  await app.clickAria("New campaign");
  await waitForText("The world of 1 January 1900");
  await app.clickAria("Continue to country selection");
  await waitForText("Choose a country");
  await sleep(800);
  await app.focus('input[aria-label="Search historical countries"]');
  await app.typeText("German");
  await sleep(600);
  await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith('German Empire'));
    matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0].click();
  })()`);
  await sleep(1200);
  await app.clickAria("Play as Germany", { exact: false });
  await waitForText("World map");
  await sleep(3000);
}

const mouse = (type, x, y, extra = {}) =>
  app.send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });

const startRecording = () =>
  app.evaluate(`(() => {
    const recorder = { deltas: [], longTasks: 0, running: true, last: performance.now() };
    window.__mapRecorder = recorder;
    try {
      recorder.observer = new PerformanceObserver((list) => { recorder.longTasks += list.getEntries().length; });
      recorder.observer.observe({ entryTypes: ['longtask'] });
    } catch {}
    const loop = (time) => {
      if (!recorder.running) return;
      recorder.deltas.push(time - recorder.last);
      recorder.last = time;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return true;
  })()`);

const stopRecording = () =>
  app.evaluate(`(() => {
    const recorder = window.__mapRecorder;
    recorder.running = false;
    recorder.observer?.disconnect();
    const sorted = recorder.deltas.slice(1).sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return {
      frames: sorted.length,
      p50: Number(at(0.5).toFixed(1)),
      p95: Number(at(0.95).toFixed(1)),
      worst: Number((sorted[sorted.length - 1] ?? 0).toFixed(1)),
      over33ms: sorted.filter((value) => value > 33.4).length,
      longTasks: recorder.longTasks,
    };
  })()`);

async function measure(name, action) {
  await sleep(500);
  await startRecording();
  const started = Date.now();
  await action();
  const inputMs = Date.now() - started;
  await sleep(250);
  const result = await stopRecording();
  console.log(name, JSON.stringify({ ...result, inputMs }));
  return { ...result, inputMs };
}

const report = { label: LABEL, gpu: process.env.PLAYTEST_GPU === "1", viewport: "1600x900" };

try {
  await enterCampaign();
  report.renderer = (await app.evaluate(`document.querySelector('iframe') !== null`)) ? "webgl" : "svg";
  report.gl = await app.evaluate(`(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info === null ? 'unknown' : gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  })()`);
  console.log("renderer", report.renderer, report.gl);

  const box = await app.evaluate(`(() => {
    const node = document.querySelector('iframe') ?? document.querySelector('svg[viewBox]');
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
  const centerX = box.left + box.width * 0.4;
  const centerY = box.top + box.height * 0.45;

  if (process.env.MAP_SKIP_SHOTS !== "1") await app.screenshot(`${LABEL}-initial`);

  report.hover = await measure("hover", async () => {
    for (let index = 0; index < 90; index += 1) {
      await mouse("mouseMoved", centerX + Math.sin(index / 6) * 200, centerY + Math.cos(index / 7) * 120);
    }
  });
  report.pan = await measure("pan", async () => {
    await mouse("mouseMoved", centerX, centerY);
    await mouse("mousePressed", centerX, centerY, { button: "left", buttons: 1, clickCount: 1 });
    for (let index = 1; index <= 60; index += 1) {
      await mouse("mouseMoved", centerX + index * 3, centerY + Math.sin(index / 9) * 40, { button: "left", buttons: 1 });
    }
    await mouse("mouseReleased", centerX + 180, centerY, { button: "left", clickCount: 1 });
  });
  report.zoom = await measure("zoom", async () => {
    for (let index = 0; index < 18; index += 1) {
      await app.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: centerX,
        y: centerY,
        deltaX: 0,
        deltaY: index < 9 ? -120 : 120,
      });
      await sleep(30);
    }
  });

  const views = [
    ["world", null],
    ["world-full", [12, 8, 1.0]],
    ["europe", [14, 50, 4.2]],
    ["low-countries", [5.5, 50.8, 16]],
    ["balkans", [22, 41.5, 9]],
    ["aegean", [24.5, 38, 26]],
    ["britain", [-3.5, 54.5, 12]],
    ["great-lakes", [-83, 45, 7]],
    ["east-indies", [115, -2, 4.5]],
    ["africa", [20, 3, 2.4]],
    ["americas", [-82, 18, 2]],
    ["antimeridian", [179, -14, 8]],
    ["caspian", [52, 42, 7]],
    ["japan", [136, 37, 10]],
    ["norway", [8, 62, 14]],
    ["south-germany", [11, 48.6, 34]],
  ];
  if (process.env.MAP_SKIP_SHOTS !== "1" && report.renderer === "webgl") {
    const engine = `document.querySelector('iframe').contentWindow.__mapEngine`;
    for (const [name, view] of views) {
      await app.evaluate(
        view === null ? `${engine}.resetView()` : `${engine}.setView(${view[0]}, ${view[1]}, ${view[2]})`,
      );
      await sleep(view === null ? 900 : 350);
      await app.screenshot(`${LABEL}-${name}`);
    }
    report.engine = await app.evaluate(`(() => {
      const stats = ${engine}.stats();
      const sorted = [...stats.frameTimes].sort((a, b) => a - b);
      return {
        cpuFrameMsP50: Number((sorted[Math.floor(sorted.length * 0.5)] ?? 0).toFixed(2)),
        cpuFrameMsP95: Number((sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2)),
        picks: stats.pickCount,
        meanPickMs: Number((stats.pickMs / Math.max(stats.pickCount, 1)).toFixed(3)),
        styleUploads: stats.styleUploads,
        labelPlacements: stats.labelPlacements,
        drawCalls: stats.drawCalls,
      };
    })()`);
  }
  const problems = await app.evaluate(`JSON.stringify(window.__m11d)`);
  const parsed = JSON.parse(problems);
  report.pageErrors = parsed.errors;
  report.rejections = parsed.rejections;
  writeFileSync(resolve(ROOT, `.cache-map/report-${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close?.();
  process.exit(0);
}
