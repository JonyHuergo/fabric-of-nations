/**
 * P7 (D-154, R8 of docs/P7_DAY1_LABOUR_PROPOSAL.md): a building's own job mix.
 *
 * The 1900 generator gives some buildings a job mix that differs from their definition's:
 * the territory's clerk share, hired hands on peasant farms, the territory's farm
 * profession. The mix replaces the definition's jobs for that building; its total workers
 * per throughput unit equal the definition's, so the building's labour need and its output
 * per worker are unchanged. Leaf module (types only), so every subsystem can import it.
 */
import type { Id } from "../types.js";
import type { BuildingDef, ProfessionJobDef } from "./types.js";

/** Relative tolerance of a job mix's total workers against its definition's. */
export const JOB_MIX_TOTAL_TOLERANCE = 1e-6;

/** The jobs a building offers: its own job mix when set, else the definition's jobs. */
export function buildingJobs(
  definition: BuildingDef,
  building: { readonly jobMix?: readonly ProfessionJobDef[] | null },
): readonly ProfessionJobDef[] {
  return building.jobMix ?? definition.jobs;
}

/**
 * Validates a building job mix: known professions in strictly increasing id order,
 * finite non-negative workers, and the definition's total workers per throughput unit.
 */
export function assertValidJobMix(
  definition: BuildingDef,
  mix: readonly ProfessionJobDef[],
  professionIds: ReadonlySet<Id>,
  path: string,
): void {
  if (mix.length === 0) throw new RangeError(`${path} must not be empty`);
  let previous = -1;
  let total = 0;
  mix.forEach((job, index) => {
    if (!Number.isInteger(job.professionId) || !professionIds.has(job.professionId)) {
      throw new RangeError(`${path}[${String(index)}].professionId references an unknown profession`);
    }
    if (job.professionId <= previous) throw new RangeError(`${path} must list professions in increasing id order`);
    previous = job.professionId;
    if (!Number.isFinite(job.workersPerThroughputUnit) || job.workersPerThroughputUnit < 0) {
      throw new RangeError(`${path}[${String(index)}].workersPerThroughputUnit must be finite and non-negative`);
    }
    total += job.workersPerThroughputUnit;
  });
  const expected = definition.jobs.reduce((sum, job) => sum + job.workersPerThroughputUnit, 0);
  if (Math.abs(total - expected) > JOB_MIX_TOTAL_TOLERANCE * Math.max(1, expected)) {
    throw new RangeError(`${path} must keep the definition's total workers per throughput unit`);
  }
}
