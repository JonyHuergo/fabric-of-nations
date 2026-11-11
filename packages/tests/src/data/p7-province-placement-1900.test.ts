/**
 * P7 (D-154 item 5f, docs/P7_PROVINCE_PLACEMENT_PROPOSAL.md) regression: the 1900 farms, mines
 * and forests stand where they stood in 1900, inside each territory. The designer's principle:
 * the availability of a resource decides only whether a province can host a producer, never
 * how much it gets. Before item 5f placement took the four provinces with the largest deposit
 * or land, so US logging stood in Alaska, US coal equally in Wyoming and Pennsylvania, Dutch
 * East Indies sugar in Sumatra, and 13.2 % of these producers' jobs had no eligible worker in
 * their province.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(HERE, "../../../data/data");
const read = <T>(path: string): T => JSON.parse(readFileSync(join(DATA_ROOT, path), "utf8")) as T;

interface Job {
  readonly professionId: number;
  readonly workersPerThroughputUnit: number;
}
interface BuildingRow {
  readonly provinceId: number;
  readonly definitionKey: string;
  readonly level: number;
  readonly technique?: number;
  readonly jobMix?: readonly Job[] | null;
}
interface Definition {
  readonly key: string;
  readonly referenceThroughputPerDayAtLevelOne: number;
  readonly jobs: readonly Job[];
  readonly extracts?: string;
  readonly landUse?: string;
  readonly maxAbsLatitudeDeg?: number;
}
interface Province {
  readonly id: number;
  readonly name: string;
  readonly territoryKey: string;
}
interface Pop {
  readonly provinceId: number;
  readonly professionKey: string;
  readonly population: number;
}
interface Profession {
  readonly id: number;
  readonly key: string;
  readonly participationRate: number;
}
interface ShareRow {
  readonly territory: string;
  readonly definitionKeys: readonly string[];
  readonly provinces: readonly string[];
  readonly sourceId: string;
}

const list = <T>(value: unknown, key: string): T[] => (Array.isArray(value) ? value : (value as Record<string, T[]>)[key]) as T[];
const rows = list<BuildingRow>(read("historical/p5b/buildings_1900.json"), "buildings");
const definitions = new Map(list<Definition>(read("historical/p5b/buildings_definitions_1900.json"), "definitions").map((definition) => [definition.key, definition]));
const provinces = list<Province>(read("historical/p5b/provinces_1900.json"), "provinces");
const provinceById = new Map(provinces.map((province) => [province.id, province]));
const pops = list<Pop>(read("historical/p7/pops_1900.json"), "pops");
const professions = list<Profession>(read("historical/p7/professions_1900.json"), "professions");
const workingAgeShare = read<{ workingAgeShare: number }>("historical/p2b/calibration_1900.json").workingAgeShare;
const sources = read<{ provinceShareRows: ShareRow[] }>("historical/p7/sources_1900.json");

const FIELD_PROFESSIONS = new Set(["laborers", "peasants", "farmers"]);
/** The P2b producers keep their P2b rows (out of scope of item 5f). */
const P2B_FARMS = new Set(["subsistence-farm", "commercial-farm", "commercial-farm-peasant", "ranch"]);
const isSpread = (definition: Definition): boolean =>
  !P2B_FARMS.has(definition.key) && (definition.extracts !== undefined || definition.landUse !== undefined || definition.maxAbsLatitudeDeg !== undefined);

/** Output capacity (level x technique) of a definition by province name, in one territory. */
const capacityByProvince = (definitionKey: string, territory: string): Map<string, number> => {
  const out = new Map<string, number>();
  for (const row of rows) {
    const province = provinceById.get(row.provinceId)!;
    if (row.definitionKey !== definitionKey || province.territoryKey !== territory) continue;
    out.set(province.name, (out.get(province.name) ?? 0) + row.level * (row.technique ?? 1));
  }
  return out;
};
const leader = (capacity: Map<string, number>): string => [...capacity].sort((left, right) => right[1] - left[1])[0]![0];
const share = (capacity: Map<string, number>, names: readonly string[]): number => {
  const total = [...capacity.values()].reduce((acc, value) => acc + value, 0);
  return names.reduce((acc, name) => acc + (capacity.get(name) ?? 0), 0) / total;
};

describe("P7 1900 world: producers stand where they stood in 1900 (D-154 item 5f)", () => {
  test("the jobs of farms, mines and forests fit their provinces' eligible workers (was 13.2 % beyond)", () => {
    const professionById = new Map(professions.map((profession) => [profession.id, profession]));
    const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
    const eligible = new Map<number, number>();
    for (const pop of pops) {
      if (!FIELD_PROFESSIONS.has(pop.professionKey)) continue;
      eligible.set(pop.provinceId, (eligible.get(pop.provinceId) ?? 0) + pop.population * workingAgeShare * professionByKey.get(pop.professionKey)!.participationRate);
    }
    const jobs = new Map<number, number>();
    for (const row of rows) {
      const definition = definitions.get(row.definitionKey)!;
      if (!isSpread(definition)) continue;
      const perUnit = (row.jobMix ?? definition.jobs)
        .filter((job) => FIELD_PROFESSIONS.has(professionById.get(job.professionId)?.key ?? ""))
        .reduce((acc, job) => acc + job.workersPerThroughputUnit, 0);
      jobs.set(row.provinceId, (jobs.get(row.provinceId) ?? 0) + perUnit * definition.referenceThroughputPerDayAtLevelOne * row.level);
    }
    const total = [...jobs.values()].reduce((acc, value) => acc + value, 0);
    const beyond = [...jobs].reduce((acc, [id, value]) => acc + Math.max(0, value - (eligible.get(id) ?? 0)), 0);
    expect(total).toBeGreaterThan(0);
    // 0.3 % after item 5f: Chile's nitrate provinces, the French Antilles' sugar and one-level
    // minimums on small islands, where the industry stood with few residents.
    expect(beyond / total).toBeLessThan(0.01);
  });

  test("sourced leaders: US cotton, coal, gold and cane sugar; Indian tea and cotton; Java sugar; Brazilian coffee", () => {
    expect(leader(capacityByProvince("cotton-farm", "usa-home"))).toBe("Texas");
    expect(leader(capacityByProvince("coal-mine", "usa-home"))).toBe("Pennsylvania");
    expect(leader(capacityByProvince("gold-mine", "usa-home"))).toBe("Colorado");
    expect(share(capacityByProvince("sugar-estate", "usa-home"), ["Louisiana", "Hawaii"])).toBeCloseTo(1, 6);
    expect(leader(capacityByProvince("plantation", "bin"))).toBe("Assam");
    expect(leader(capacityByProvince("cotton-farm", "bin"))).toBe("Bombay");
    expect(share(capacityByProvince("sugar-estate", "dei"), ["West Java", "Central Java", "East Java"])).toBeCloseTo(1, 6);
    expect(leader(capacityByProvince("sugar-estate", "dei"))).toBe("East Java");
    expect(leader(capacityByProvince("plantation", "bra-home"))).toBe("São Paulo");
  });

  test("reserves place nothing: Alaska, Yakutsk and Kamchatka are not logging centres", () => {
    expect(share(capacityByProvince("logging-camp", "usa-home"), ["Alaska"])).toBeLessThan(0.01);
    expect(share(capacityByProvince("logging-camp", "rus-home"), ["Yakutsk", "Kamchatka"])).toBeLessThan(0.01);
  });

  test("every sourced share row names provinces of its own territory", () => {
    expect(sources.provinceShareRows.length).toBeGreaterThan(0);
    for (const row of sources.provinceShareRows) {
      for (const name of row.provinces) {
        expect(provinces.filter((province) => province.territoryKey === row.territory && province.name === name)).toHaveLength(1);
      }
      for (const key of row.definitionKeys) expect(definitions.has(key)).toBe(true);
    }
  });
});
