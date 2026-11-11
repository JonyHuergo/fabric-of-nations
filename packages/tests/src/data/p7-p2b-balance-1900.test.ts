/**
 * P7 (D-154 item 5e) regression: the P2b producers of the 1900 world follow modelled demand.
 * Placement scales each P2b producer by new demand ÷ the demand that sized it (the old tiers
 * over the P2b blocks). Step 3 computed that base over the P7 blocks, whose wealth mix lowered
 * it, and placed livestock 1.180, food-products 1.146, fish 1.092 and clothing 1.058 of world
 * demand (grain, whose tier every block reaches, stayed at 0.996).
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(HERE, "../../../data/data");

interface Balance {
  readonly demandPerDay: number;
  readonly outputPerDay: number;
  readonly outputOverDemand: number | null;
}
interface Calibration {
  readonly placement: { readonly worldBalance: Readonly<Record<string, Balance>> };
}

const calibration = JSON.parse(readFileSync(join(DATA_ROOT, "historical/p5b/calibration_1900.json"), "utf8")) as Calibration;

describe("P7 1900 world: P2b producers follow modelled demand (D-154 item 5e)", () => {
  // Before step 3 every scaled P2b good was within 1.5 % of world demand (food-products
  // 1.015); 3 % leaves room for the workforce cap and recipe inputs without hiding a
  // mis-scaled base (the step-3 error was 6-18 %).
  test.each(["grain", "livestock", "fish", "textiles", "clothing", "food-products"])("%s output is within 3 %% of world demand", (good) => {
    const balance = calibration.placement.worldBalance[good];
    expect(balance).toBeDefined();
    expect(balance!.demandPerDay).toBeGreaterThan(0);
    expect(Math.abs(balance!.outputPerDay / balance!.demandPerDay - 1)).toBeLessThan(0.03);
  });
});
