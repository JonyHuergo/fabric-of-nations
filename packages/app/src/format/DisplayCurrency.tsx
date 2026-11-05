/**
 * P3 (D-141) display-currency preference (the `useMoney` hook is in `useMoney.ts`).
 *
 * The preference is a per-device setting kept in AsyncStorage. It is never part of a save
 * or of the simulated world, and changing it sends nothing to the worker: it only changes
 * how `format/money.ts` converts the snapshot's RUSD figures.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_DISPLAY_CURRENCY,
  parseDisplayCurrencyChoice,
  type DisplayCurrencyChoice,
} from "./money";

export const DISPLAY_CURRENCY_STORAGE_KEY = "fabric-of-nations.display-currency.v1";

interface DisplayCurrencyContextValue {
  readonly choice: DisplayCurrencyChoice;
  readonly setChoice: (choice: DisplayCurrencyChoice) => void;
}

const DisplayCurrencyContext = createContext<DisplayCurrencyContextValue | null>(null);

export function DisplayCurrencyProvider({ children }: { readonly children: ReactNode }) {
  const [choice, setChoiceState] = useState<DisplayCurrencyChoice>(DEFAULT_DISPLAY_CURRENCY);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored !== null) setChoiceState(parseDisplayCurrencyChoice(stored));
      })
      .catch(() => {
        // Storage can be unavailable (private browsing); the default stands.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setChoice = useCallback((next: DisplayCurrencyChoice) => {
    setChoiceState(next);
    AsyncStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, next).catch(() => {
      // A preference that cannot be stored still applies for this session.
    });
  }, []);

  const value = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);
  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

export function useDisplayCurrency(): DisplayCurrencyContextValue {
  const value = useContext(DisplayCurrencyContext);
  if (value === null) throw new Error("useDisplayCurrency must be used inside DisplayCurrencyProvider");
  return value;
}
