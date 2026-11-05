/**
 * P4 (D-142): per-country annual demographic record.
 *
 * Reporting state only: realised births and deaths of the current civil year are
 * accumulated daily from the demography phase by the block's owner country, and on
 * 1 January the closed year is recorded with its population and the indicators of
 * the state at the turn of the year. No simulation decision reads it. Countries with
 * no record yet (new or empty) start one at the next accumulation.
 */

import { demographicIndicators } from "../population/indicators.js";
import type { DemographyCountryFactors } from "../population/demographicLevels.js";
import { populationTotal } from "../population/state.js";
import type { DemographyDayResult, PopBlock, PopulationDefinitions } from "../population/types.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import { buildProvinceOwnerMap } from "./country.js";
import type { CountryDemographyRunning } from "./demographyReportState.js";
export * from "./demographyReportState.js";

function countryPopulations(world: World, owners: ReadonlyMap<Id, Id>): Map<Id, number> {
  const result = new Map<Id, number>();
  for (const block of world.popBlocks) {
    const owner = owners.get(block.provinceId);
    if (owner === undefined) continue;
    result.set(owner, (result.get(owner) ?? 0) + populationTotal(block));
  }
  return result;
}

/**
 * 1 January (not the start day): record the closed year of every country with its
 * end population and the indicators of today's state, then open the new year.
 * Called before the day's ageing and demography.
 */
export function closeDemographyYear(
  world: World,
  definitions: PopulationDefinitions,
  factorsOf: (block: PopBlock) => DemographyCountryFactors,
): void {
  const report = world.demography;
  if (report.currentYear === null) return;
  const owners = buildProvinceOwnerMap(world);
  const blocksByCountry = new Map<Id, PopBlock[]>();
  for (const block of world.popBlocks) {
    const owner = owners.get(block.provinceId);
    if (owner === undefined) continue;
    const list = blocksByCountry.get(owner);
    if (list === undefined) blocksByCountry.set(owner, [block]);
    else list.push(block);
  }
  const populations = countryPopulations(world, owners);
  for (const running of report.current) {
    const indicators = demographicIndicators(
      blocksByCountry.get(running.countryId) ?? [],
      definitions,
      factorsOf,
    );
    report.years.push({
      countryId: running.countryId,
      year: report.currentYear,
      populationStart: running.populationStart,
      births: running.births,
      deaths: running.deaths,
      populationEnd: populations.get(running.countryId) ?? 0,
      days: running.days,
      totalFertility: indicators.totalFertility,
      lifeExpectancy: indicators.lifeExpectancy,
      under5MortalityPer1000: indicators.under5MortalityPer1000,
      urbanShare: indicators.urbanShare,
    });
  }
  report.current = [];
  report.currentYear = null;
}

/** Add one day's births and deaths to the owner countries' running totals. */
export function accumulateDemography(
  world: World,
  year: number,
  populationsAtDayStart: ReadonlyMap<Id, number>,
  result: DemographyDayResult,
): void {
  const report = world.demography;
  if (world.countries.length === 0) return;
  if (report.currentYear === null) report.currentYear = year;
  if (report.currentYear !== year) {
    throw new RangeError(`demography report is open for ${String(report.currentYear)}, not ${String(year)}`);
  }
  const owners = buildProvinceOwnerMap(world);
  const byCountry = new Map<Id, CountryDemographyRunning>();
  for (const running of report.current) byCountry.set(running.countryId, running);
  if (result.blocks.length !== world.popBlocks.length) {
    throw new RangeError("demography result does not cover every population block");
  }
  const touched = new Set<Id>();
  for (let index = 0; index < result.blocks.length; index += 1) {
    const entry = result.blocks[index] as DemographyDayResult["blocks"][number];
    const block = world.popBlocks[index] as PopBlock;
    if (block.id !== entry.popBlockId) throw new RangeError("demography result is not in block order");
    const owner = owners.get(block.provinceId);
    if (owner === undefined) continue;
    let running = byCountry.get(owner);
    if (running === undefined) {
      running = {
        countryId: owner,
        populationStart: populationsAtDayStart.get(owner) ?? 0,
        births: 0,
        deaths: 0,
        days: 0,
      };
      byCountry.set(owner, running);
    }
    running.births += entry.births;
    running.deaths += entry.deaths;
    touched.add(owner);
  }
  for (const id of touched) (byCountry.get(id) as CountryDemographyRunning).days += 1;
  report.current = [...byCountry.values()].sort((left, right) => left.countryId - right.countryId);
}

/** Populations by owner country at this moment (for a day's opening figures). */
export function populationsByCountry(world: World): Map<Id, number> {
  return countryPopulations(world, buildProvinceOwnerMap(world));
}
