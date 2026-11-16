/**
 * D-162: the kernels a worker thread runs, by name. A worker (and the sim thread for its own
 * lane) calls `runKernel` with a job built by `ParallelRequest.job`; the kernel is the same
 * function the inline path uses, over the job's arrays. `allocator`, when given (the sim
 * thread's own lane), supplies the kernel's working and output arrays from reusable buffers;
 * without it (a worker) they are new arrays.
 */

import { runHouseholdDemandKernel } from "./economy/householdDemand.js";
import type { KernelAllocator, KernelJob, KernelOutput } from "./parallel.js";
import { runDemographyKernel } from "./population/demography.js";

export function runKernel(job: KernelJob, allocator?: KernelAllocator): KernelOutput {
  switch (job.kernel) {
    case "demography":
      return runDemographyKernel(job.params, job.arrays, allocator);
    case "household-demand":
      return runHouseholdDemandKernel(job.params, job.arrays, allocator);
    default: {
      const unknown: never = job.kernel;
      throw new RangeError(`unknown kernel ${String(unknown)}`);
    }
  }
}
