import { boot, sleep } from "./lib/harness.mjs";

const app = await boot({ fresh: true });

async function geo(lon, lat) {
  return app.evaluate(`(() => {
    const svg = document.querySelector('svg'); const group = document.querySelector('svg g');
    const point = svg.createSVGPoint();
    const max = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * 89.9 * Math.PI / 180));
    const miller = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * (${lat}) * Math.PI / 180));
    point.x = ((${lon}) + 180) / 360 * 1000; point.y = (max - miller) / (2 * max) * 500;
    const s = point.matrixTransform(group.getScreenCTM()); return { x: s.x, y: s.y };
  })()`);
}
async function scale() {
  const t = await app.evaluate(`document.querySelector('svg g')?.getAttribute('transform') ?? null`);
  return Number(/scale\(([^)]+)\)/.exec(t ?? "")?.[1] ?? "0");
}
async function reset() {
  await app.evaluate(`document.querySelector('[aria-label="Reset map view"]')?.click()`);
  await sleep(500);
}
async function zoomAt(lon, lat, target) {
  for (let i = 0; i < 100 && (await scale()) < target - 0.01; i += 1) {
    const p = await geo(lon, lat);
    await app.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Math.round(p.x), y: Math.round(p.y), deltaX: 0, deltaY: -90 });
    await sleep(90);
  }
  await sleep(500);
}
try {
  await app.navigate("http://127.0.0.1:8877/?country=DEU");
  for (let i = 0; i < 300; i += 1) {
    if ((await app.text()).includes("World map")) break;
    await sleep(300);
  }
  await sleep(1500);
  await app.screenshot("fix-world");
  await zoomAt(17, 21.3, 4);
  console.log("libya scale", await scale());
  await app.screenshot("fix-libya-border");
  await reset();
  await zoomAt(77.25, 35.4, 6);
  console.log("siachen scale", await scale());
  await app.screenshot("fix-india-border");
  await reset();
  await zoomAt(20.5, 54.2, 7);
  console.log("prussia scale", await scale());
  await app.screenshot("fix-east-prussia");
  await reset();
  await zoomAt(10, 51, 5);
  console.log("germany scale", await scale());
  await app.screenshot("fix-germany");
  const report = await app.dumpReport();
  console.log("console errors:", report.entries.length);
} finally {
  await app.close();
}
