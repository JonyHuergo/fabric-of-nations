/**
 * P7 (D-154 step 3) regression: professionals in the generated 1900 world. Medical practices
 * belong to medics and professional practices to academics; R9's institution function shares
 * are the 1902 all-government spending rows (HSUS Y 533-566); Mexico is a census territory
 * (Resumen 1900); and the day-1 rule leaves no profession of teachers, medics or engineers
 * mostly idle (before the job-mix steps (d)-(e) and the medical practice: 28 %, 72 %, 88 %).
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(HERE, "../../../data/data");
const read = <T>(path: string): T => JSON.parse(readFileSync(join(DATA_ROOT, path), "utf8")) as T;

interface BuildingRow {
  readonly key: string;
  readonly definitionKey: string;
  readonly ownerProfessionKey: string;
  readonly level: number;
  readonly technique?: number;
  readonly jobMix?: readonly { readonly professionId: number; readonly workersPerThroughputUnit: number }[] | null;
}
interface SourceRow {
  readonly id: string;
  readonly key?: string;
  readonly subject: string;
  readonly census?: string;
  readonly group?: string;
  readonly sourceId: string;
  readonly value: number;
}
interface TerritoryAfter {
  readonly eligible: Readonly<Record<string, number>>;
  readonly employed: Readonly<Record<string, number>>;
}
interface Calibration {
  readonly p7: {
    readonly institutionFunctionShares: { readonly healthOfAdministration: number; readonly researchOfEducation: number; readonly trainingOfEducation: number };
    readonly shares: Readonly<Record<string, { readonly method: string }>>;
    readonly after: { readonly byTerritory: Readonly<Record<string, TerritoryAfter>> };
  };
}

const buildingsFile = read<{ buildings?: BuildingRow[] } | BuildingRow[]>("historical/p5b/buildings_1900.json");
const buildings: BuildingRow[] = Array.isArray(buildingsFile) ? buildingsFile : (buildingsFile.buildings ?? []);
const sources = read<{ occupationRows: SourceRow[]; distributionRows: SourceRow[] }>("historical/p7/sources_1900.json");
const calibration = read<Calibration>("historical/p5b/calibration_1900.json");
const distribution = (key: string): number => {
  const row = sources.distributionRows.find((entry) => entry.key === key);
  if (row === undefined) throw new Error(`missing distribution row ${key}`);
  return row.value;
};

describe("P7 professionals in the 1900 world (D-154 step 3)", () => {
  it("medical practices belong to medics and professional practices to academics", () => {
    const medical = buildings.filter((row) => row.definitionKey === "medical-practice");
    const practices = buildings.filter((row) => row.definitionKey === "professional-practice");
    expect(medical.length).toBeGreaterThan(0);
    expect(practices.length).toBeGreaterThan(0);
    expect(medical.every((row) => row.ownerProfessionKey === "medics")).toBe(true);
    expect(practices.every((row) => row.ownerProfessionKey === "academics")).toBe(true);
    expect([...medical, ...practices].every((row) => Number.isInteger(row.level) && row.level > 0)).toBe(true);
  });

  it("gives every job of every building job mix a positive number of workers", () => {
    const bad = buildings.filter((row) => (row.jobMix ?? []).some((job) => !(job.workersPerThroughputUnit > 0)));
    expect(bad.map((row) => row.key)).toEqual([]);
  });

  it("takes R9's health and research shares from the 1902 spending rows", () => {
    const civil =
      distribution("usa-1902-gov-general") -
      distribution("usa-1902-gov-defence") -
      distribution("usa-1902-gov-postal") -
      distribution("usa-1902-gov-education") -
      distribution("usa-1902-gov-highways") -
      distribution("usa-1902-gov-air-water-transport") -
      distribution("usa-1902-gov-veterans") -
      distribution("usa-1902-gov-interest");
    expect(civil).toBe(594);
    const shares = calibration.p7.institutionFunctionShares;
    expect(shares.healthOfAdministration).toBeCloseTo((distribution("usa-1902-gov-hospitals") + distribution("usa-1902-gov-health")) / civil, 5);
    expect(shares.researchOfEducation).toBeCloseTo(distribution("usa-1902-gov-higher-education") / distribution("usa-1902-gov-education"), 5);
    expect(shares.trainingOfEducation).toBe(0.06);
  });

  it("reads Mexico's occupations from the 1900 census summary", () => {
    const rows = sources.occupationRows.filter((row) => row.subject === "MEX" && row.census === "1900");
    expect(rows.every((row) => row.sourceId === "mex-censo-1900")).toBe(true);
    const value = (group: string): number => rows.find((row) => row.group === group)?.value ?? Number.NaN;
    expect(value("agriculture")).toBe(3_157_487);
    expect(value("manufacturing")).toBe(757_754);
    expect(value("professions")).toBe(62_207);
    expect(calibration.p7.shares["mex-home"]?.method.startsWith("census MEX 1900")).toBe(true);
  });

  it("gives the United Kingdom's medical professions their medics", () => {
    expect(calibration.p7.after.byTerritory["gbr-home"]?.eligible.medics ?? 0).toBeGreaterThan(0);
  });

  it("leaves teachers, medics and engineers mostly employed on day 1", () => {
    for (const profession of ["teachers", "medics", "engineers"]) {
      let eligible = 0;
      let employed = 0;
      for (const territory of Object.values(calibration.p7.after.byTerritory)) {
        eligible += territory.eligible[profession] ?? 0;
        employed += territory.employed[profession] ?? 0;
      }
      expect(eligible).toBeGreaterThan(0);
      expect(1 - employed / eligible).toBeLessThan(0.15);
    }
  });
});
