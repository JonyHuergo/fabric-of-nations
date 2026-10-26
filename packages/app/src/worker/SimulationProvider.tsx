import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import {
  PROTOCOL_VERSION,
  type SimulationSnapshot,
  type SpeedDaysPerSecond,
  type WorkerCommand,
  type WorkerEvent,
} from "@century/sim-worker";

import { readSave, storeSave } from "../storage/saveStorage";
import {
  NativeWorkerHost,
  type NativeWorkerHandle,
} from "./NativeWorkerHost";
import {
  INITIAL_REQUEST,
  WebWorkerClient,
  isWebWorkerAvailable,
} from "./webWorkerClient";

export type ConnectionState = "connecting" | "ready" | "error" | "closed";

export interface SimulationContextValue {
  readonly snapshot: SimulationSnapshot | null;
  readonly connection: ConnectionState;
  readonly error: string | null;
  readonly saveStatus: string | null;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  readonly start: () => void;
  readonly pause: () => void;
  readonly step: () => void;
  readonly setSpeed: (speed: SpeedDaysPerSecond) => void;
  readonly applyFiscalPolicy: (
    countryId: number,
    incomeTaxRate: number,
    welfareBudgetSUSDPerYear: number,
  ) => void;
  readonly saveGame: () => void;
  readonly loadGame: () => void;
  readonly clearError: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function useSimulation(): SimulationContextValue {
  const value = useContext(SimulationContext);
  if (value === null) throw new Error("useSimulation must be used inside SimulationProvider");
  return value;
}

export function SimulationProvider({ children }: { readonly children: ReactNode }) {
  const nativeRef = useRef<NativeWorkerHandle | null>(null);
  const webClientRef = useRef<WebWorkerClient | null>(null);
  const commandCounter = useRef(0);
  const actionCounter = useRef(0);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [speedDaysPerSecond, setSpeedDaysPerSecond] =
    useState<SpeedDaysPerSecond>(1);

  const nextCommandId = useCallback((prefix: string): string => {
    commandCounter.current += 1;
    return `${prefix}-${String(commandCounter.current)}`;
  }, []);

  const send = useCallback((command: WorkerCommand) => {
    if (Platform.OS === "web") {
      webClientRef.current?.send(command);
    } else {
      nativeRef.current?.send(command);
    }
  }, []);

  const handleEvent = useCallback(
    (event: WorkerEvent) => {
      switch (event.type) {
        case "READY":
        case "SNAPSHOT":
          setSnapshot(event.snapshot);
          setRunning(event.snapshot.running);
          setSpeedDaysPerSecond(event.snapshot.speedDaysPerSecond as SpeedDaysPerSecond);
          setConnection("ready");
          return;
        case "STATE":
          setRunning(event.running);
          setSpeedDaysPerSecond(event.speedDaysPerSecond as SpeedDaysPerSecond);
          return;
        case "ACTION_RESULT":
          setSnapshot(event.snapshot);
          if (event.accepted) {
            setError(null);
            setSaveStatus("Fiscal policy applied");
          } else {
            setError(event.errors.join("; "));
          }
          return;
        case "SAVE_RESULT":
          setSaveStatus("Compressing save…");
          void storeSave(event.save)
            .then((info) => {
              setSaveStatus(
                `Saved ${(info.saveBytes / 1024).toFixed(0)} KiB as ${(info.compressedBytes / 1024).toFixed(0)} KiB`,
              );
              setError(null);
            })
            .catch((reason: unknown) => {
              setSaveStatus(null);
              setError(reason instanceof Error ? reason.message : String(reason));
            });
          return;
        case "LOAD_RESULT":
          if (event.accepted) {
            setSnapshot(event.snapshot);
            setRunning(false);
            setSaveStatus(`Loaded ${event.snapshot.date.label}`);
            setError(null);
          } else {
            setError(event.errors.join("; "));
            setSaveStatus(null);
          }
          return;
        case "ERROR":
          setError(`${event.code}: ${event.message}`);
          if (event.code === "unsupported_protocol") setConnection("error");
          return;
        case "FATAL":
          setRunning(false);
          setConnection("error");
          setError(event.message);
          return;
        case "SHUTDOWN":
          setConnection("closed");
          setRunning(false);
          return;
        default:
          return;
      }
    },
    [],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !isWebWorkerAvailable()) return undefined;
    const client = new WebWorkerClient();
    webClientRef.current = client;
    const unsubscribe = client.subscribe(handleEvent);
    const unsubscribeErrors = client.subscribeErrors((message) => {
      setError(message);
      setConnection("error");
    });
    client.send(INITIAL_REQUEST);
    return () => {
      unsubscribe();
      unsubscribeErrors();
      client.close();
      webClientRef.current = null;
    };
  }, [handleEvent]);

  const start = useCallback(() => {
    setSaveStatus(null);
    send({ protocolVersion: PROTOCOL_VERSION, type: "START", commandId: nextCommandId("start") });
  }, [nextCommandId, send]);

  const pause = useCallback(() => {
    send({ protocolVersion: PROTOCOL_VERSION, type: "PAUSE", commandId: nextCommandId("pause") });
  }, [nextCommandId, send]);

  const step = useCallback(() => {
    send({
      protocolVersion: PROTOCOL_VERSION,
      type: "STEP",
      commandId: nextCommandId("step"),
      ticks: 1,
    });
  }, [nextCommandId, send]);

  const setSpeed = useCallback(
    (speed: SpeedDaysPerSecond) => {
      setSpeedDaysPerSecond(speed);
      send({
        protocolVersion: PROTOCOL_VERSION,
        type: "SET_SPEED",
        commandId: nextCommandId("speed"),
        daysPerSecond: speed,
      });
    },
    [nextCommandId, send],
  );

  const applyFiscalPolicy = useCallback(
    (countryId: number, incomeTaxRate: number, welfareBudgetSUSDPerYear: number) => {
      actionCounter.current += 1;
      setSaveStatus(null);
      send({
        protocolVersion: PROTOCOL_VERSION,
        type: "APPLY_ACTION",
        commandId: nextCommandId("apply"),
        actionId: `fiscal-${String(actionCounter.current)}`,
        action: {
          kind: "set-fiscal-policy",
          countryId,
          incomeTaxRate,
          welfareBudgetSUSDPerYear,
        },
      });
    },
    [nextCommandId, send],
  );

  const saveGame = useCallback(() => {
    setSaveStatus("Saving…");
    send({ protocolVersion: PROTOCOL_VERSION, type: "SAVE", commandId: nextCommandId("save") });
  }, [nextCommandId, send]);

  const loadGame = useCallback(() => {
    setSaveStatus("Reading save…");
    void readSave()
      .then((save) => {
        if (save === null) {
          setSaveStatus("No saved game found");
          return;
        }
        send({
          protocolVersion: PROTOCOL_VERSION,
          type: "LOAD",
          commandId: nextCommandId("load"),
          save,
        });
      })
      .catch((reason: unknown) => {
        setSaveStatus(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [nextCommandId, send]);

  const value = useMemo<SimulationContextValue>(
    () => ({
      snapshot,
      connection,
      error,
      saveStatus,
      running,
      speedDaysPerSecond,
      start,
      pause,
      step,
      setSpeed,
      applyFiscalPolicy,
      saveGame,
      loadGame,
      clearError: () => {
        setError(null);
      },
    }),
    [
      snapshot,
      connection,
      error,
      saveStatus,
      running,
      speedDaysPerSecond,
      start,
      pause,
      step,
      setSpeed,
      applyFiscalPolicy,
      saveGame,
      loadGame,
    ],
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
      {Platform.OS === "web" ? null : (
        <NativeWorkerHost
          ref={nativeRef}
          onEvent={handleEvent}
          onReady={() => {
            nativeRef.current?.send(INITIAL_REQUEST);
          }}
          onError={(message) => {
            setError(message);
            setConnection("error");
          }}
        />
      )}
    </SimulationContext.Provider>
  );
}
