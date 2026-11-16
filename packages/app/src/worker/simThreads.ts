/**
 * D-162: kernel worker threads of the simulation.
 *
 * The simulation can run its demography and household-demand phases on worker threads (the
 * same code on web, iOS and Android; the world is identical at any count). On the reference
 * desktop the threads did not make the day faster (DECISIONS.md D-162), so the shipped setting is
 * 0: every day on the simulation thread. To try threads, set `SIM_KERNEL_WORKERS` to a count or
 * to "auto" (the device's cores less two, at most three) and build; on web,
 * `?simWorkers=N` or `?simWorkers=auto` overrides it for one page load. The campaign panel's
 * speed line then shows the threads the last day used.
 */

export type SimKernelWorkers = number | "auto";

/** The shipped setting (0: single thread). */
export const SIM_KERNEL_WORKERS: SimKernelWorkers = 0;

const MAX_KERNEL_WORKERS = 8;

/** Parse a setting: a whole number 0..8 or "auto"; null when it is neither. */
export function parseSimKernelWorkers(value: string | null | undefined): SimKernelWorkers | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "auto") return "auto";
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  return count <= MAX_KERNEL_WORKERS ? count : null;
}

/** The setting of this page: `?simWorkers=` on web when valid, else the shipped one. */
export function simKernelWorkersSetting(search: string | undefined): SimKernelWorkers {
  if (search === undefined || search.length === 0) return SIM_KERNEL_WORKERS;
  const match = /[?&]simWorkers=([^&]*)/.exec(search);
  return parseSimKernelWorkers(match?.[1] === undefined ? null : decodeURIComponent(match[1])) ?? SIM_KERNEL_WORKERS;
}

/** The statement that hands the setting to the worker script (`__fonSimWorkers`). */
export function simKernelWorkersStatement(setting: SimKernelWorkers): string {
  return `globalThis.__fonSimWorkers=${JSON.stringify(setting)};`;
}
