/**
 * P7 (D-156): the labour market's rows, shared by the Labour screen, the Population screen
 * and the province panel. Presentation only: every figure comes from the snapshot.
 */

import {
  formatCount,
  formatRate,
  type LabourProfessionRowSnapshot,
  type LabourTerritorySnapshot,
  type ProfessionSnapshot,
} from "@century/sim-worker";

import type { MoneyFormat } from "../format/money";
import { DataRow } from "./ui";

/** "+1.2 %" for a wage change at the last monthly update; "no change" below 0.05 %. */
export function wageChangeText(change: number): string {
  if (Math.abs(change) < 0.0005) return "no change last month";
  return `${change > 0 ? "+" : "−"}${(Math.abs(change) * 100).toFixed(1)}% last month`;
}

/** Country rows: territories merged per profession, wages weighted by the labour force. */
export function mergeTerritoryRows(territories: readonly LabourTerritorySnapshot[]): readonly LabourProfessionRowSnapshot[] {
  const byProfession = new Map<number, LabourProfessionRowSnapshot[]>();
  for (const territory of territories) {
    for (const row of territory.rows) {
      const list = byProfession.get(row.professionId);
      if (list === undefined) byProfession.set(row.professionId, [row]);
      else list.push(row);
    }
  }
  return [...byProfession]
    .sort((left, right) => left[0] - right[0])
    .map(([professionId, rows]) => {
      const labourForce = rows.reduce((sum, row) => sum + row.labourForce, 0);
      const employed = rows.reduce((sum, row) => sum + row.employed, 0);
      const weight = (row: LabourProfessionRowSnapshot): number => (labourForce > 0 ? row.labourForce / labourForce : 1 / rows.length);
      return {
        professionId,
        labourForce,
        employed,
        unemploymentRate: labourForce > 0 ? Math.max(0, (labourForce - employed) / labourForce) : 0,
        vacancies: rows.reduce((sum, row) => sum + row.vacancies, 0),
        wageRUSDPerYear: rows.reduce((sum, row) => sum + row.wageRUSDPerYear * weight(row), 0),
        wageChange: rows.reduce((sum, row) => sum + row.wageChange * weight(row), 0),
        inHouseholdService: rows.reduce((sum, row) => sum + row.inHouseholdService, 0),
      };
    });
}

/** One row per profession: unemployment as the value, then workers, vacancies and the wage. */
export function LabourRows({
  rows,
  professions,
  money,
}: {
  readonly rows: readonly LabourProfessionRowSnapshot[];
  readonly professions: readonly ProfessionSnapshot[];
  readonly money: MoneyFormat;
}) {
  const nameOf = new Map(professions.map((profession) => [profession.id, profession.name]));
  return (
    <>
      {rows.map((row) => (
        <DataRow
          key={row.professionId}
          title={nameOf.get(row.professionId) ?? `Profession ${String(row.professionId)}`}
          value={`${formatRate(row.unemploymentRate)} out of work`}
          valueTone={row.unemploymentRate >= 0.1 ? "accent" : "default"}
          note={[
            `${formatCount(row.employed)} of ${formatCount(row.labourForce)} working`,
            row.vacancies > 0 ? `${formatCount(row.vacancies)} posts unfilled` : "no posts unfilled",
            `${money.format(row.wageRUSDPerYear)}/yr, ${wageChangeText(row.wageChange)}`,
            row.inHouseholdService > 0 ? `${formatCount(row.inHouseholdService)} in household service` : null,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        />
      ))}
    </>
  );
}
