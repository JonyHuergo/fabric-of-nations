/**
 * M11d runtime playtest harness.
 *
 * Serves the exported Expo web build, launches headless Chrome, connects over
 * CDP and exposes the small set of primitives the playtest scenarios need:
 * DOM evaluation, keyboard/mouse input, screenshots and full console/exception
 * capture attributed to the scenario step that was running.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..", "..", "..");
export const WEB_ROOT = resolve(ROOT, "packages/app/dist-web");
export const SHOT_DIR = resolve(ROOT, process.env.PLAYTEST_SHOT_DIR ?? "docs/images/m11d");

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

export function startServer(port) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const path = resolve(WEB_ROOT, `.${pathname}`);
    if (!path.startsWith(WEB_ROOT) || !existsSync(path)) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(readFileSync(path));
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done(server)));
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome not found; set CHROME_PATH");
  return found;
}

export async function connectChrome({ port = 9462, profile = ".cache-m11d/chrome", windowSize = "1400,1000", fresh = false } = {}) {
  const profilePath = resolve(ROOT, profile);
  if (fresh) rmSync(profilePath, { recursive: true, force: true });
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      // The WebGL map needs a GL implementation: the real GPU when asked for,
      // otherwise SwiftShader, which keeps headless runs reproducible.
      ...(process.env.PLAYTEST_GPU === "1"
        ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]
        : ["--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=Translate,BackForwardCache",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profilePath}`,
      `--window-size=${windowSize}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  async function getJson(path) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        return await (await fetch(`http://127.0.0.1:${port}${path}`)).json();
      } catch {
        await sleep(150);
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
  const messages = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined || !pending.has(message.id)) {
      if (message.method !== undefined) messages.push(message);
      return;
    }
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

  return { chrome, socket, send, port };
}

function previewOf(arg) {
  if (arg === null || arg === undefined) return String(arg);
  if (arg.value !== undefined) return String(arg.value);
  if (arg.unserializableValue !== undefined) return String(arg.unserializableValue);
  if (arg.description !== undefined) return arg.description;
  if (arg.preview !== undefined) {
    const properties = (arg.preview.properties ?? [])
      .map((property) => `${property.name}: ${property.value}`)
      .join(", ");
    return `${arg.preview.description ?? ""}${properties === "" ? "" : ` {${properties}}`}`;
  }
  return arg.type;
}

/**
 * Wraps a CDP connection with console recording. Every recorded entry is
 * tagged with the current scenario step so a failure can be attributed to the
 * exact interaction that produced it.
 */
export function createSession(cdp) {
  const { send } = cdp;
  const entries = [];
  const seen = new Set();
  const state = {
    step: "start",
    url: "about:blank",
    consoleOpen: true,
  };

  function record(entry) {
    const key = `${entry.kind}::${entry.text}`;
    // Keep duplicates: a recurring warning is itself evidence. Only collapse
    // repeated identical messages inside the same step.
    const stepKey = `${state.step}::${key}`;
    entry.step = state.step;
    entry.timestamp = Date.now();
    entry.repeat = seen.has(stepKey);
    seen.add(stepKey);
    entries.push(entry);
  }

  const events = { console: [], exceptions: [], logs: [], network: [] };

  cdp.onEvent = (message) => {
    const { method, params } = message;
    if (method === "Runtime.consoleAPICalled") {
      const text = (params.args ?? []).map(previewOf).join(" ");
      const stack =
        params.stackTrace === undefined
          ? null
          : (params.stackTrace.callFrames ?? []).slice(0, 3).map((frame) => `${frame.url}:${String(frame.lineNumber + 1)}`).join(" <- ");
      events.console.push({ type: params.type, text, stack, step: state.step });
      if (params.type === "error" || params.type === "warning" || params.type === "assert") {
        record({
          kind: `console.${params.type}`,
          text,
          stack,
          source: "console",
        });
      }
    } else if (method === "Runtime.exceptionThrown") {
      const details = params.exceptionDetails;
      const description =
        details.exception?.description ??
        details.exception?.value ??
        details.text ??
        "unknown exception";
      events.exceptions.push({ text: description, step: state.step });
      record({
        kind: "exception",
        text: description,
        stack: (details.stackTrace?.callFrames ?? [])
          .slice(0, 6)
          .map((frame) => `${frame.url}:${String(frame.lineNumber + 1)}:${String(frame.columnNumber + 1)}`)
          .join(" <- "),
        source: "exception",
      });
    } else if (method === "Log.entryAdded") {
      const entry = params.entry;
      events.logs.push({ level: entry.level, text: entry.text, source: entry.source, url: entry.url, step: state.step });
      if (entry.level === "error" || entry.level === "warning") {
        record({
          kind: `log.${entry.level}`,
          text: entries.length === 0 ? entry.text : entry.text,
          stack: entry.url === undefined ? null : `${entry.url}:${entry.lineNumber ?? 0}`,
          source: `log:${entry.source}`,
        });
      }
    } else if (method === "Network.loadingFailed") {
      const text = `${params.type} ${params.errorText}${params.blockedReason ? ` (${params.blockedReason})` : ""}`;
      events.network.push({ kind: "loadingFailed", text, step: state.step });
      record({ kind: "network.failed", text, stack: null, source: "network" });
    } else if (method === "Network.responseReceived") {
      const response = params.response;
      if (response.status >= 400) {
        const text = `HTTP ${String(response.status)} ${response.url}`;
        events.network.push({ kind: "httpError", text, step: state.step });
        record({ kind: "network.http", text, stack: null, source: "network" });
      }
    } else if (method === "Inspector.targetCrashed") {
      record({ kind: "targetCrash", text: "renderer target crashed", stack: null, source: "inspector" });
    }
  };

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails !== undefined) {
      const description =
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`evaluate failed: ${description}`);
    }
    return result.result?.value;
  }

  async function step(name) {
    state.step = name;
    console.log(`\n### ${name}`);
  }

  async function screenshot(name) {
    mkdirSync(SHOT_DIR, { recursive: true });
    const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(result.data, "base64"));
    console.log("  shot", name);
  }

  /** Click a rendered button/pressable by its accessible label. */
  async function clickAria(label, { exact = true } = {}) {
    const clicked = await evaluate(`(() => {
      const wanted = ${JSON.stringify(label)};
      const nodes = Array.from(document.querySelectorAll('[aria-label]'));
      const match = nodes.find((node) => {
        const value = node.getAttribute('aria-label');
        if (wanted === null) return false;
        return ${exact ? "value === wanted" : "value.includes(wanted)"};
      });
      if (!match) return { ok: false, labels: nodes.map((n) => n.getAttribute('aria-label')).slice(0, 80) };
      if (match.getAttribute('aria-disabled') === 'true') return { ok: false, disabled: true };
      match.scrollIntoView({ block: 'center' });
      match.click();
      return { ok: true, label: match.getAttribute('aria-label') };
    })()`);
    if (clicked?.ok !== true) {
      throw new Error(`clickAria(${JSON.stringify(label)}) failed: ${JSON.stringify(clicked)}`);
    }
    await sleep(120);
    return clicked;
  }

  /** Click the first element whose visible text starts with / equals the text. */
  async function clickText(text, { exact = true, selector = '[aria-label], [role="button"], div' } = {}) {
    const clicked = await evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const match = nodes.find((node) => {
        const value = (node.textContent ?? '').trim();
        return ${exact ? "value === wanted" : "value.includes(wanted)"};
      });
      if (!match) return { ok: false };
      match.scrollIntoView({ block: 'center' });
      match.click();
      return { ok: true };
    })()`);
    return clicked;
  }

  async function pressKey(key, { code, keyCode, modifiers = 0 } = {}) {
    const base = { key, code: code ?? key, windowsVirtualKeyCode: keyCode ?? 0, nativeVirtualKeyCode: keyCode ?? 0, modifiers };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    if (key.length === 1) {
      await send("Input.dispatchKeyEvent", { type: "char", text: key, ...base });
    }
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(60);
  }

  async function typeText(text) {
    await send("Input.insertText", { text });
    await sleep(80);
  }

  async function focus(selector) {
    const focused = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      node.focus();
      if (node.select) node.select();
      return true;
    })()`);
    return focused;
  }

  async function setInputValue(selector, value) {
    const changed = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(node, ${JSON.stringify(value)});
      node.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    return changed;
  }

  async function text() {
    return evaluate("document.body.innerText");
  }

  async function html(selector) {
    return evaluate(`document.querySelector(${JSON.stringify(selector)})?.outerHTML ?? null`);
  }

  async function exists(selector) {
    return evaluate(`document.querySelector(${JSON.stringify(selector)}) !== null`);
  }

  async function count(selector) {
    return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  async function dumpReport() {
    return { entries, events };
  }

  return {
    cdp,
    send,
    state,
    events,
    entries,
    evaluate,
    step,
    screenshot,
    clickAria,
    clickText,
    pressKey,
    typeText,
    focus,
    setInputValue,
    text,
    html,
    exists,
    count,
    dumpReport,
    sleep,
  };
}

export async function boot({ port = 8877, cdpPort = 9462, profile, fresh = false } = {}) {
  if (!existsSync(join(WEB_ROOT, "index.html"))) {
    throw new Error("missing packages/app/dist-web; run pnpm -F @century/app export:web first");
  }
  const server = await startServer(port);
  const cdp = await connectChrome({ port: cdpPort, profile, fresh });
  const session = createSession(cdp);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Log.enable");
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__m11d = { errors: [], rejections: [], workers: [], commands: [], workerErrors: [] };
      window.addEventListener('error', (event) => {
        window.__m11d.errors.push(String(event.message) + ' @ ' + String(event.filename) + ':' + String(event.lineno));
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.__m11d.rejections.push(String(event.reason && event.reason.stack ? event.reason.stack : event.reason));
      });
      (() => {
        if (typeof window.Worker !== 'function') return;
        const NativeWorker = window.Worker;
        window.Worker = class InstrumentedWorker extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            window.__m11d.workers.push({ at: Date.now(), size: typeof url === 'string' ? url.length : -1 });
            this.addEventListener('error', (event) => {
              window.__m11d.workerErrors.push(String(event.message ?? 'worker error'));
            });
          }
          postMessage(message, transfer) {
            try {
              window.__m11d.commands.push({
                at: Date.now(),
                type: message && message.type ? message.type : null,
                playerCountryId: message && message.playerCountryId !== undefined ? message.playerCountryId : null,
                action: message && message.action ? JSON.stringify(message.action).slice(0, 160) : null,
              });
            } catch (error) {
              // instrumentation must never change application behavior
            }
            return super.postMessage(message, transfer);
          }
        };
      })();`,
  });
  // Route CDP events into the session recorder.
  const originalOnMessage = cdp.socket.onmessage;
  cdp.socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method !== undefined && cdp.onEvent !== undefined) cdp.onEvent(message);
    originalOnMessage(event);
  };

  async function navigate(url) {
    session.state.url = url;
    await session.send("Page.navigate", { url });
  }

  async function close() {
    try {
      cdp.socket.close();
    } catch {
      // ignore
    }
    cdp.chrome.kill();
    server.close();
  }

  return { ...session, navigate, close, server, chrome: cdp.chrome };
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
