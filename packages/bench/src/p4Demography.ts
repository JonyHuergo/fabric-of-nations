/**
 * P4 demography probe and century report (`node packages/bench/dist/p4Demography.js`).
 *
 *   start                 day-0 indicators of every 1900 country against its sources
 *   run <days> [--out f]  no-input run of the 1900 world (country AI on, as in the
 *                         game; no player actions) printing world and regional
 *                         demography at each year end, and writing yearly regional
 *                         indicators to `f` (JSON) for the WPP comparison report
 *
 * Regions are the UN continental regions of each province's modern country
 * (historical/p4/province_modern_country_1900.json). Node diagnostic; nothing here is
 * read by the simulation.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDemography1900, loadM11World } from "@century/data";
import {
  createEconomyWorld,
  createRollbackRunner,
  dayIndexToCivilDate,
  demographicIndicators,
  demographyFactorsByCountry,
  demographyFactorsOfBlock,
  runTicksWithRollback,
  type DemographicIndicators,
  type PopBlock,
  type TickContext,
  type World,
} from "@century/sim";

const SEED = 20_261_023;
const DATA_ROOT = fileURLToPath(new URL("../../data/data/", import.meta.url));

function regionOfProvince(): Map<number, string> {
  const crosswalk = JSON.parse(
    readFileSync(`${DATA_ROOT}historical/p4/province_modern_country_1900.json`, "utf8"),
  ) as { provinces: { provinceId: number; region: string }[] };
  return new Map(crosswalk.provinces.map((row) => [row.provinceId, row.region]));
}

function indicatorsBy(
  world: World,
  scenario: ReturnType<typeof loadM11World>,
  key: (block: PopBlock) => string | number | undefined,
): Map<string | number, DemographicIndicators> {
  const factorsOf = demographyFactorsOfBlock(world, demographyFactorsByCountry(world, scenario.definitions));
  const groups = new Map<string | number, PopBlock[]>();
  for (const block of world.popBlocks) {
    const group = key(block);
    if (group === undefined) continue;
    const list = groups.get(group);
    if (list === undefined) groups.set(group, [block]);
    else list.push(block);
  }
  const result = new Map<string | number, DemographicIndicators>();
  for (const [group, blocks] of groups) {
    result.set(group, demographicIndicators(blocks, scenario.population.definitions, factorsOf));
  }
  result.set("world", demographicIndicators(world.popBlocks, scenario.population.definitions, factorsOf));
  return result;
}

function ownerOf(world: World): (block: PopBlock) => number | undefined {
  const owner = new Map(world.provinces.ownership.map((row) => [row.provinceId, row.ownerPolityId]));
  return (block) => owner.get(block.provinceId);
}

function fmt(value: number, digits = 1): string {
  return value.toFixed(digits).padStart(7);
}

function start(): void {
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const sources = loadDemography1900("historical/p4/demography_1900.json");
  const tolerance = sources.meta.acceptanceTolerances;
  const byCountry = indicatorsBy(world, scenario, ownerOf(world));
  console.log("tag      pop(M)   CBR src  CBR game   TFR src TFR game    e0 src  e0 game  u5 src  u5 game   CDR game  CDR stable");
  let failures = 0;
  for (const country of sources.countries) {
    if (country.source === undefined || country.stable === undefined) continue;
    const game = byCountry.get(country.countryId);
    if (game === undefined) continue;
    const cbrOk =
      country.source.crudeBirthRate === null ||
      Math.abs(game.crudeBirthRate - country.source.crudeBirthRate) <= tolerance.crudeBirthRateRelative * country.source.crudeBirthRate;
    const e0Ok = Math.abs(game.lifeExpectancy - country.source.lifeExpectancy) <= tolerance.lifeExpectancyYears;
    const u5Ok =
      Math.abs(game.under5MortalityPer1000 - country.source.under5MortalityPer1000) <=
      tolerance.under5MortalityRelative * country.source.under5MortalityPer1000;
    const tfrOk =
      Math.abs(game.totalFertility - country.source.totalFertility) <= tolerance.totalFertilityRelative * country.source.totalFertility;
    const cdrOk = Math.abs(game.crudeDeathRate - country.stable.crudeDeathRate) <= 0.15 * country.stable.crudeDeathRate;
    // Acceptance per country is the crude birth and death rate (D-142 §8). Life
    // expectancy, under-5 mortality and TFR are checked per source geo by the tests: an
    // empire's figure from pooled death rates is not the mean of its territories' values.
    void e0Ok;
    void u5Ok;
    void tfrOk;
    const ok = cbrOk && cdrOk;
    if (!ok) failures += 1;
    console.log(
      `${country.tag.padEnd(5)} ${fmt(game.population / 1e6, 2)} ${fmt(country.source.crudeBirthRate ?? Number.NaN)} ${fmt(game.crudeBirthRate)} ${fmt(country.source.totalFertility, 2)} ${fmt(game.totalFertility, 2)} ${fmt(country.source.lifeExpectancy)} ${fmt(game.lifeExpectancy)} ${fmt(country.source.under5MortalityPer1000, 0)} ${fmt(game.under5MortalityPer1000, 0)} ${fmt(game.crudeDeathRate)} ${fmt(country.stable.crudeDeathRate)}${ok ? "" : "  <-- outside tolerance"}`,
    );
  }
  const worldRow = byCountry.get("world");
  if (worldRow !== undefined) {
    console.log(
      `world ${fmt(worldRow.population / 1e6, 1)} CBR ${fmt(worldRow.crudeBirthRate)} CDR ${fmt(worldRow.crudeDeathRate)} TFR ${fmt(worldRow.totalFertility, 2)} e0 ${fmt(worldRow.lifeExpectancy)} urban ${fmt(worldRow.urbanShare * 100)}%`,
    );
  }
  console.log(`${String(failures)} countries outside the crude-rate tolerance (Greece and Crete are the documented exceptions)`);
}

interface YearRow {
  readonly year: number;
  readonly region: string;
  readonly population: number;
  readonly crudeBirthRate: number;
  readonly crudeDeathRate: number;
  readonly totalFertility: number;
  readonly lifeExpectancy: number;
  readonly urbanShare: number;
  readonly femaleLiteracy: number;
  readonly foodSufficiency: number;
}

function run(days: number, out: string | undefined): void {
  const scenario = loadM11World();
  const world = createEconomyWorld(scenario, { seed: SEED });
  const runner = createRollbackRunner(world, { worldJustValidated: true });
  const context: TickContext = {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
    detail: "summary",
  };
  const regions = regionOfProvince();
  const rows: YearRow[] = [];
  const record = (year: number): void => {
    const current = runner.world;
    const byRegion = indicatorsBy(current, scenario, (block) => regions.get(block.provinceId));
    for (const [region, value] of [...byRegion].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      rows.push({
        year,
        region: String(region),
        population: value.population,
        crudeBirthRate: value.crudeBirthRate,
        crudeDeathRate: value.crudeDeathRate,
        totalFertility: value.totalFertility,
        lifeExpectancy: value.lifeExpectancy,
        urbanShare: value.urbanShare,
        femaleLiteracy: value.femaleLiteracy,
        foodSufficiency: value.foodSufficiency,
      });
      if (region === "world") {
        console.log(
          `${String(year)} pop ${fmt(value.population / 1e6, 1)}M CBR ${fmt(value.crudeBirthRate)} CDR ${fmt(value.crudeDeathRate)} TFR ${fmt(value.totalFertility, 2)} e0 ${fmt(value.lifeExpectancy)} lit ${fmt(value.femaleLiteracy * 100)}% food ${fmt(value.foodSufficiency * 100)}%`,
        );
      }
    }
    if (out !== undefined) writeFileSync(out, `${JSON.stringify({ seed: SEED, rows }, null, 1)}\n`);
  };
  record(1900);
  const startedAt = Date.now();
  for (let day = 0; day < days; day += 1) {
    runTicksWithRollback(runner, 1, context);
    const date = dayIndexToCivilDate(runner.world.dayIndex);
    if (date.month === 1 && date.day === 1) {
      record(date.year);
      console.log(`  (${((Date.now() - startedAt) / 1000).toFixed(0)} s elapsed)`);
    }
  }
}

const mode = process.argv[2] ?? "start";
if (mode === "start") start();
else if (mode === "run") {
  const outIndex = process.argv.indexOf("--out");
  run(Number(process.argv[3] ?? "365"), outIndex > 0 ? process.argv[outIndex + 1] : undefined);
} else {
  throw new Error(`unknown mode ${mode}`);
}
