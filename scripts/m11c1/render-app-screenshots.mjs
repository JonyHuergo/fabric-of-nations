/**
 * Repeatable M11c.1 rendering smoke test using headless Chrome + CDP.
 *
 * Prerequisite: pnpm -F @century/app export:web
 * Run: node scripts/m11c1/render-app-screenshots.mjs
 *
 * It serves packages/app/dist-web locally, opens the real app, exercises the
 * zoom/pan/reset controls, and writes PNGs to docs/images/m11c1/.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const WEB_ROOT = resolve(ROOT, "packages/app/dist-web");
const OUT = resolve(ROOT, "docs/images/m11c1");
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(WEB_ROOT, "index.html"))) {
  throw new Error("missing packages/app/dist-web; run pnpm -F @century/app export:web first");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = resolve(WEB_ROOT, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
  if (!path.startsWith(WEB_ROOT) || !existsSync(path)) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" });
  response.end(readFileSync(path));
});
await new Promise((resolveServer) => server.listen(8877, "127.0.0.1", resolveServer));

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chromePath = candidates.find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error("Chrome not found; set CHROME_PATH");

const port = 9461;
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${resolve(ROOT, ".cache-m11/chrome-m11c1")}`,
    "--window-size=1400,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function getJson(path) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await (await fetch(`http://127.0.0.1:${port}${path}`)).json();
    } catch {
      await sleep(200);
    }
  }
  throw new Error("CDP did not start");
}
const pages = await getJson("/json");
const page = pages.find((target) => target.type === "page");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveSocket, reject) => {
  socket.onopen = resolveSocket;
  socket.onerror = reject;
});
let nextId = 1;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined || !pending.has(message.id)) return;
  const callbacks = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) callbacks.reject(new Error(JSON.stringify(message.error)));
  else callbacks.resolve(message.result);
};
const send = (method, params = {}) =>
  new Promise((resolveSend, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolveSend, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))
    .result?.value;
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(result.data, "base64"));
  console.log("wrote", name);
}
async function click(label) {
  return evaluate(
    `(()=>{const b=Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')==='${label}');if(!b)return false;b.click();return true;})()`,
  );
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: "http://127.0.0.1:8877" });
await sleep(8000);
await screenshot("world-global");

// Wheel-zoom on Europe to demonstrate focal-point zoom and clean ocean/land
// rendering at a regional scale.
const europe = await evaluate(`(()=>{
  const svg=document.querySelector('svg');
  const p=svg.createSVGPoint();
  p.x=((10+180)/360)*1000;
  const lat=50*Math.PI/180;
  const y=1.25*Math.log(Math.tan(Math.PI/4+0.4*lat));
  const max=1.25*Math.log(Math.tan(Math.PI/4+0.4*89.9*Math.PI/180));
  p.y=((max-y)/(2*max))*500;
  const s=p.matrixTransform(svg.getScreenCTM());
  return {x:s.x,y:s.y};
})()`);
await send("Input.dispatchMouseEvent", {
  type: "mouseWheel",
  x: europe.x,
  y: europe.y,
  deltaX: 0,
  deltaY: -1200,
});
await sleep(600);
await screenshot("europe-wheel-zoom");
await click("Reset map view");
await sleep(400);

for (let i = 1; i <= 5; i += 1) {
  await click("Zoom in");
  await sleep(350);
}
await screenshot("world-prev-max");
await sleep(200);
for (let i = 1; i <= 3; i += 1) {
  await click("Zoom in");
  await sleep(350);
}
await screenshot("world-new-max");

// Drag at max zoom to verify no stale layer survives a viewport change.
await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: 700,
  y: 180,
  button: "left",
  clickCount: 1,
});
for (let step = 1; step <= 12; step += 1) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 700 - step * 18,
    y: 180 - step * 5,
    button: "left",
  });
  await sleep(30);
}
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: 484,
  y: 120,
  button: "left",
  clickCount: 1,
});
await sleep(500);
await screenshot("zoom-pan-new-max");

await click("Reset map view");
await sleep(500);
await screenshot("zoom-reset");

console.log("zoom transforms:", await evaluate(`document.querySelector('svg g')?.getAttribute('transform')`));
socket.close();
chrome.kill();
server.close();

