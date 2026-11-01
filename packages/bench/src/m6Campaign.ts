/**
 * Opt-in M6 full-campaign benchmark entry point (`pnpm run bench:campaign`).
 *
 * This executes all 36,524 daily ticks with country AI enabled. It is separate
 * from the default CI benchmark because it takes roughly an hour on the recorded
 * Node machine.
 */

import { cpus, totalmem } from "node:os";
import { DATA_PACKAGE_VERSION } from "@century/data";
import { SIM_VERSION } from "@century/sim";

import { runM6FullCampaignBenchmark } from "./m6Bench.js";

function main(): void {
  const cpuList = cpus();
  const firstCpu = cpuList[0];
  console.log("Fabric of Nations M6 full-campaign country-AI benchmark");
  console.log(`node: ${process.version} (${process.platform} ${process.arch})`);
  console.log(`cpu: ${firstCpu?.model ?? "unknown"} (${String(cpuList.length)} logical processors)`);
  console.log(`memory: ${(totalmem() / 1024 ** 3).toFixed(2)} GiB total`);
  console.log(`sim version: ${SIM_VERSION}; data version: ${DATA_PACKAGE_VERSION}`);
  console.log("procedure: execute every daily tick; AI enabled; per-tick wall-clock sampling only");
  const valid = runM6FullCampaignBenchmark();
  if (!valid) process.exitCode = 1;
}

main();
