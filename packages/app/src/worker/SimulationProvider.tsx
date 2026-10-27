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
import { AppState, Platform } from "react-native";

import {
  PROTOCOL_VERSION,
  WorkerSupervisor,
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
  readonly achievedDaysPerSecond: number;
  /** True while a save, load, or policy action is awaiting a reply. */
  readonly busy: boolean;
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
  readonly restartWorker: () => void;
  readonly clearError: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function useSimulation(): SimulationContextValue {
  const value = useContext(SimulationContext);
  if (value === null) throw new Error("useSimulation must be used inside SimulationProvider");
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SimulationProvider({ children }: { readonly children: ReactNode }) {
  const nativeRef = useRef<NativeWorkerHandle | null>(null);
  const webClientRef = useRef<WebWorkerClient | null>(null);
  const supervisorRef = useRef<WorkerSupervisor | null>(null);
  const commandCounter = useRef(0);
  const actionCounter = useRef(0);
  const runningRef = useRef(false);
  const connectionRef = useRef<ConnectionState>("connecting");
  const resumeOnVisibleRef = useRef(false);
  /** Increments on worker replacement so old async work cannot touch new state. */
  const sessionRef = useRef(0);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [speedDaysPerSecond, setSpeedDaysPerSecond] =
    useState<SpeedDaysPerSecond>(1);
  const [achievedDaysPerSecond, setAchievedDaysPerSecond] = useState(0);
  const [busy, setBusy] = useState(false);
  const [webEpoch, setWebEpoch] = useState(0);
  const [nativeEpoch, setNativeEpoch] = useState(0);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  const nextCommandId = useCallback((prefix: string): string => {
    commandCounter.current += 1;
    return `${prefix}-${String(commandCounter.current)}`;
  }, []);

  const setRunningState = useCallback((value: boolean) => {
    runningRef.current = value;
    setRunning(value);
  }, []);

  const handleSupervisorError = useCallback((message: string) => {
    setError(message);
    setSaveStatus(null);
    setBusy(supervisorRef.current?.hasPendingCritical ?? false);
  }, []);

  const handleTransportError = useCallback((message: string) => {
    // Clear pending replies/timeouts first; otherwise a late timeout could
    // overwrite the transport failure or leave a stale action in flight.
    supervisorRef.current?.fail(message);
    setError(message);
    setSaveStatus(null);
    setConnection("error");
    connectionRef.current = "error";
    setRunningState(false);
    setBusy(false);
  }, [setRunningState]);

  const handleTimeout = useCallback(
    (
      _commandId: string | null,
      _commandType: WorkerCommand["type"] | "READY",
      message: string,
    ) => {
      setError(message);
      setSaveStatus(null);
      setConnection("error");
      connectionRef.current = "error";
      setRunningState(false);
      setBusy(false);
    },
    [setRunningState],
  );

  const handleEvent = useCallback(
    (event: WorkerEvent) => {
      switch (event.type) {
        case "READY":
        case "SNAPSHOT":
          setSnapshot(event.snapshot);
          setRunningState(event.snapshot.running);
          setSpeedDaysPerSecond(event.snapshot.speedDaysPerSecond as SpeedDaysPerSecond);
          setAchievedDaysPerSecond(event.snapshot.achievedDaysPerSecond);
          setConnection("ready");
          connectionRef.current = "ready";
          if (event.type === "READY") setError(null);
          return;
        case "STATE":
          setRunningState(event.running);
          setSpeedDaysPerSecond(event.speedDaysPerSecond as SpeedDaysPerSecond);
          setAchievedDaysPerSecond(event.achievedDaysPerSecond);
          return;
        case "ACTION_RESULT": {
          const supervisor = supervisorRef.current;
          if (
            supervisor === null ||
            supervisor.acceptSnapshotSequence(event.snapshot.sequence)
          ) {
            setSnapshot(event.snapshot);
            setRunningState(event.snapshot.running);
            setAchievedDaysPerSecond(event.snapshot.achievedDaysPerSecond);
          }
          setBusy(false);
          if (event.accepted) {
            setError(null);
            setSaveStatus("Fiscal policy applied");
          } else {
            setError(event.errors.join("; ") || "The fiscal policy action was rejected.");
            setSaveStatus(null);
          }
          return;
        }
        case "SAVE_RESULT": {
          const generation = sessionRef.current;
          // Keep busy through the storage write so a second save cannot race
          // the same storage key.
          void storeSave(event.save)
            .then((info) => {
              if (generation !== sessionRef.current) return;
              setBusy(false);
              setError(null);
              setSaveStatus(
                `Saved ${String(Math.round(info.saveBytes / 1024))} KiB as ${String(
                  Math.round(info.compressedBytes / 1024),
                )} KiB`,
              );
            })
            .catch((saveError: unknown) => {
              if (generation !== sessionRef.current) return;
              setBusy(false);
              setError(messageOf(saveError));
              setSaveStatus(null);
            });
          return;
        }
        case "LOAD_RESULT": {
          if (event.accepted) {
            const supervisor = supervisorRef.current;
            if (
              supervisor === null ||
              supervisor.acceptSnapshotSequence(event.snapshot.sequence)
            ) {
              setSnapshot(event.snapshot);
              setRunningState(event.snapshot.running);
              setSpeedDaysPerSecond(event.snapshot.speedDaysPerSecond as SpeedDaysPerSecond);
              setAchievedDaysPerSecond(event.snapshot.achievedDaysPerSecond);
            }
            setConnection("ready");
            connectionRef.current = "ready";
            setError(null);
            setSaveStatus("Saved game loaded");
          } else {
            setError(event.errors.join("; ") || "The save could not be loaded.");
            setSaveStatus(null);
          }
          setBusy(false);
          return;
        }
        case "ERROR":
          setBusy(supervisorRef.current?.hasPendingCritical ?? false);
          setSaveStatus(null);
          setError(event.message);
          if (event.code === "closed") {
            setConnection("closed");
            connectionRef.current = "closed";
          }
          return;
        case "FATAL":
          setBusy(false);
          setSaveStatus(null);
          setError(event.message);
          setConnection("error");
          connectionRef.current = "error";
          setRunningState(false);
          supervisorRef.current?.fail(event.message);
          return;
        case "SHUTDOWN":
          setBusy(false);
          setSaveStatus(null);
          setConnection("closed");
          connectionRef.current = "closed";
          setRunningState(false);
          return;
        default:
          return;
      }
    },
    [setRunningState],
  );

  const send = useCallback(
    (command: WorkerCommand): boolean => {
      const supervisor = supervisorRef.current;
      if (supervisor === null) {
        setError("The simulation worker is not connected. Restart it and try again.");
        return false;
      }
      const critical =
        command.type === "SAVE" ||
        command.type === "LOAD" ||
        command.type === "APPLY_ACTION";
      const accepted = supervisor.send(command);
      if (accepted && critical) setBusy(true);
      return accepted;
    },
    [],
  );

  const start = useCallback(() => {
    if (
      send({ protocolVersion: PROTOCOL_VERSION, type: "START", commandId: nextCommandId("start") })
    ) {
      // Track the intent immediately so a hide event between send and STATE still pauses.
      runningRef.current = true;
    }
  }, [nextCommandId, send]);

  const pause = useCallback(() => {
    if (
      send({ protocolVersion: PROTOCOL_VERSION, type: "PAUSE", commandId: nextCommandId("pause") })
    ) {
      runningRef.current = false;
    }
  }, [nextCommandId, send]);

  const step = useCallback(() => {
    if (
      send({
        protocolVersion: PROTOCOL_VERSION,
        type: "STEP",
        commandId: nextCommandId("step"),
        ticks: 1,
      })
    ) {
      runningRef.current = false;
    }
  }, [nextCommandId, send]);

  const setSpeed = useCallback(
    (speed: SpeedDaysPerSecond) => {
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
      const accepted = send({
        protocolVersion: PROTOCOL_VERSION,
        type: "APPLY_ACTION",
        commandId: nextCommandId("apply"),
        actionId: `ui-fiscal-${String(actionCounter.current)}`,
        action: { kind: "set-fiscal-policy", countryId, incomeTaxRate, welfareBudgetSUSDPerYear },
      });
      if (accepted) setSaveStatus("Applying fiscal policy…");
    },
    [nextCommandId, send],
  );

  const saveGame = useCallback(() => {
    const accepted = send({
      protocolVersion: PROTOCOL_VERSION,
      type: "SAVE",
      commandId: nextCommandId("save"),
    });
    if (accepted) setSaveStatus("Saving…");
  }, [nextCommandId, send]);

  const loadGame = useCallback(async () => {
    const generation = sessionRef.current;
    setSaveStatus("Reading save…");
    try {
      const save = await readSave();
      if (generation !== sessionRef.current) return;
      if (save === null) {
        setError("No saved game was found.");
        setSaveStatus(null);
        return;
      }
      const accepted = send({
        protocolVersion: PROTOCOL_VERSION,
        type: "LOAD",
        commandId: nextCommandId("load"),
        save,
      });
      setSaveStatus(accepted ? "Loading save…" : null);
    } catch (loadError) {
      setError(messageOf(loadError));
      setSaveStatus(null);
    }
  }, [nextCommandId, send]);

  const restartWorker = useCallback(() => {
    sessionRef.current += 1;
    supervisorRef.current?.dispose();
    supervisorRef.current = null;
    if (Platform.OS === "web") {
      webClientRef.current?.close();
      webClientRef.current = null;
      setWebEpoch((value) => value + 1);
    } else {
      nativeRef.current?.restart();
      setNativeEpoch((value) => value + 1);
    }
    setSnapshot(null);
    setConnection("connecting");
    connectionRef.current = "connecting";
    setError(null);
    setSaveStatus(
      "Worker restarted with a fresh 1900 world. Unsaved progress was lost; load a saved game to continue.",
    );
    setRunningState(false);
    setBusy(false);
    setAchievedDaysPerSecond(0);
    setSpeedDaysPerSecond(1);
  }, [setRunningState]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!isWebWorkerAvailable()) {
      setError("This platform does not provide a Web Worker. The simulation cannot start.");
      setConnection("error");
      connectionRef.current = "error";
      return;
    }
    let client: WebWorkerClient;
    try {
      client = new WebWorkerClient();
    } catch (workerError) {
      setError(messageOf(workerError));
      setConnection("error");
      connectionRef.current = "error";
      return;
    }
    webClientRef.current = client;
    const supervisor = new WorkerSupervisor({
      send: (command) => client.send(command),
      onEvent: handleEvent,
      onError: handleSupervisorError,
      onTimeout: handleTimeout,
    });
    supervisorRef.current = supervisor;
    const unsubscribe = client.subscribe((event) => supervisor.receive(event));
    const unsubscribeErrors = client.subscribeErrors((message) => {
      handleTransportError(message);
    });
    supervisor.startReadiness();
    supervisor.send(INITIAL_REQUEST);
    return () => {
      unsubscribe();
      unsubscribeErrors();
      supervisor.dispose();
      client.close();
      if (webClientRef.current === client) webClientRef.current = null;
      if (supervisorRef.current === supervisor) supervisorRef.current = null;
    };
  }, [webEpoch, handleEvent, handleSupervisorError, handleTimeout, handleTransportError]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const supervisor = new WorkerSupervisor({
      send: (command) => nativeRef.current?.send(command),
      onEvent: handleEvent,
      onError: handleSupervisorError,
      onTimeout: handleTimeout,
    });
    supervisorRef.current = supervisor;
    supervisor.startReadiness();
    return () => {
      supervisor.dispose();
      if (supervisorRef.current === supervisor) supervisorRef.current = null;
    };
  }, [nativeEpoch, handleEvent, handleSupervisorError, handleTimeout]);

  useEffect(() => {
    const hide = (): void => {
      if (!runningRef.current) return;
      resumeOnVisibleRef.current = true;
      pause();
    };
    const show = (): void => {
      if (!resumeOnVisibleRef.current) return;
      resumeOnVisibleRef.current = false;
      if (connectionRef.current === "ready") start();
    };
    if (Platform.OS === "web") {
      const onVisibility = (): void => {
        if (document.visibilityState === "hidden") hide();
        else show();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "background" || status === "inactive") hide();
      else if (status === "active") show();
    });
    return () => subscription.remove();
  }, [pause, start]);

  const value = useMemo<SimulationContextValue>(
    () => ({
      snapshot,
      connection,
      error,
      saveStatus,
      running,
      speedDaysPerSecond,
      achievedDaysPerSecond,
      busy,
      start,
      pause,
      step,
      setSpeed,
      applyFiscalPolicy,
      saveGame,
      loadGame,
      restartWorker,
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
      achievedDaysPerSecond,
      busy,
      start,
      pause,
      step,
      setSpeed,
      applyFiscalPolicy,
      saveGame,
      loadGame,
      restartWorker,
    ],
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
      {Platform.OS === "web" ? null : (
        <NativeWorkerHost
          ref={nativeRef}
          onEvent={(event) => {
            const supervisor = supervisorRef.current;
            if (supervisor === null) handleEvent(event);
            else supervisor.receive(event);
          }}
          onReady={() => {
            const supervisor = supervisorRef.current;
            supervisor?.markReady();
            supervisor?.send(INITIAL_REQUEST);
          }}
          onError={handleTransportError}
        />
      )}
    </SimulationContext.Provider>
  );
}
