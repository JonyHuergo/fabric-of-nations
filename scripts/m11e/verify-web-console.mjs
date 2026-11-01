/**
 * M11e exported-build console verification.
 *
 * Launches the actual exported web application in headless Chrome, waits for the
 * main menu and world map, and fails on any console error/warning, runtime
 * exception, unhandled rejection, worker error or failed request. The expected
 * React DevTools informational message is not an error and is ignored by the
 * harness recorder.
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/m11e/verify-web-console.mjs
 */
import { boot, sleep } from "../m11d/lib/harness.mjs";

const app = await boot({ fresh: true });
let failed = false;
try {
  await app.send("Page.navigate", { url: "http://127.0.0.1:8877/" });
  const started = Date.now();
  for (;;) {
    const ready = await app.evaluate(
      "document.body.innerText.includes('FABRIC OF NATIONS') && document.querySelectorAll('svg path').length >= 260",
    );
    if (ready === true) break;
    if (Date.now() - started > 90_000) throw new Error("timed out waiting for the main menu map");
    await sleep(300);
  }
  await sleep(3000);

  const report = await app.dumpReport();
  const page = await app.evaluate(
    "window.__m11d === undefined ? null : { errors: window.__m11d.errors, rejections: window.__m11d.rejections, workerErrors: window.__m11d.workerErrors, workers: window.__m11d.workers.length }",
  );
  const svg = await app.evaluate(
    "({ svgs: document.querySelectorAll('svg').length, paths: document.querySelectorAll('path').length, circles: document.querySelectorAll('circle').length })",
  );

  const problems = [];
  for (const entry of report.entries) {
    if (entry.kind.startsWith("console.") || entry.kind === "exception") {
      problems.push(`${entry.kind}: ${entry.text}`);
    }
  }
  for (const event of report.events.exceptions) problems.push(`exception: ${event.text}`);
  for (const event of report.events.network) problems.push(`network: ${event.text}`);
  if (page !== null) {
    for (const error of page.errors) problems.push(`page error: ${error}`);
    for (const rejection of page.rejections) problems.push(`unhandled rejection: ${rejection}`);
    for (const error of page.workerErrors) problems.push(`worker error: ${error}`);
  }
  if (svg.svgs !== 1) problems.push(`expected one map SVG, found ${String(svg.svgs)}`);
  if (svg.paths < 267) problems.push(`expected at least 267 map paths, found ${String(svg.paths)}`);
  if (svg.circles < 17) problems.push(`expected at least 17 map markers, found ${String(svg.circles)}`);

  console.log(
    JSON.stringify(
      {
        consoleErrors: report.entries.filter((entry) => entry.kind === "console.error").length,
        consoleWarnings: report.entries.filter((entry) => entry.kind === "console.warning").length,
        exceptions: report.events.exceptions.length,
        networkFailures: report.events.network.length,
        pageErrors: page?.errors.length ?? 0,
        rejections: page?.rejections.length ?? 0,
        workerErrors: page?.workerErrors.length ?? 0,
        workers: page?.workers ?? 0,
        svg,
      },
      null,
      2,
    ),
  );
  if (problems.length > 0) {
    failed = true;
    console.error(`FAIL: ${String(problems.length)} console/runtime problem(s)`);
    for (const problem of problems) console.error(`  ${problem}`);
  } else {
    console.log("PASS: no console errors, warnings, exceptions, rejections or worker errors");
  }
} finally {
  await app.close();
}
process.exitCode = failed ? 1 : 0;
