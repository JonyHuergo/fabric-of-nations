/**
 * P3 (D-141): the hook every screen formats money with.
 */

import { useMemo } from "react";

import { useSimulation } from "../worker/SimulationProvider";
import { useDisplayCurrency } from "./DisplayCurrency";
import { createMoneyFormat, type MoneyFormat, type MoneySource } from "./money";

/**
 * The money formatter for the live snapshot, or for `source` (a saved world shown on the
 * title or load screen) when given.
 */
export function useMoney(source?: MoneySource | null): MoneyFormat {
  const { snapshot } = useSimulation();
  const { choice } = useDisplayCurrency();
  const shown = source === undefined ? snapshot : source;
  return useMemo(() => createMoneyFormat(shown ?? null, choice), [shown, choice]);
}
