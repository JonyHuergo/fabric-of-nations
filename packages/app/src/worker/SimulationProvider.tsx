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
  AutosaveScheduler,
  PROTOCOL_VERSION,
  WorkerSupervisor,
  type SimulationSnapshot,
  type SpeedDaysPerSecond,
  type WorkerCommand,
  type WorkerEvent,
} from "@century/sim-worker";

import {
  readStoredCampaign,
  storeSave,
  type StoredCampaign,
} from "../storage/saveStorage";
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
export type CampaignStartup = "checking" | "choice" | "playing";

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
  readonly startup: CampaignStartup;
  readonly savedCampaign: StoredCampaign | null;
  readonly overwritePrompt: boolean;
  readonly resumeSavedGame: () => void;
  readonly startNewGame: () => void;
  readonly confirmOverwrite: () => void;
  readonly cancelOverwrite: () => void;
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
  const autosaveArmedRef = useRef(false);
  const autosaveOnPauseRef = useRef(false);
  const autosaveSchedulerRef = useRef<AutosaveScheduler | null>(null);
  const saveKindRef = useRef<"manual" | "autosave" | null>(null);
  const startupRef = useRef<CampaignStartup>("checking");
  const autosaveRequestRef = useRef<() => void>(() => {});
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [speedDaysPerSecond, setSpeedDaysPerSecond] =
    useState<SpeedDaysPerSecond>(1);
  const [achievedDaysPerSecond, setAchievedDaysPerSecond] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startup, setStartup] = useState<CampaignStartup>("checking");
  const [savedCampaign, setSavedCampaign] = useState<StoredCampaign | null>(null);
  const [overwritePrompt, setOverwritePrompt] = useState(false);
  const [webEpoch, setWebEpoch] = useState(0);
  const [nativeEpoch, setNativeEpoch] = useState(0);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);
  useEffect(() => {
    startupRef.current = startup;
  }, [startup]);

  const nextCommandId = useCallback((prefix: string): string => {
    commandCounter.current += 1;
    return `${prefix}-${String(commandCounter.current)}`;
  }, []);

  const setRunningState = useCallback((value: boolean) => {
    runningRef.current = value;
    setRunning(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readStoredCampaign()
      .then((campaign) => {
        if (cancelled) return;
        if (campaign === null) {
          setSavedCampaign(null);
          setStartup("playing");
          startupRef.current = "playing";
          autosaveArmedRef.current = true;
          return;
        }
        setSavedCampaign(campaign);
        setStartup("choice");
        startupRef.current = "choice";
        autosaveArmedRef.current = false;
      })
      .catch((storageError: unknown) => {
        if (cancelled) return;
        setError(`Saved game could not be read: ${messageOf(storageError)}`);
        setStartup("playing");
        startupRef.current = "playing";
        // Preserve any existing file; a fresh autosave must not replace it.
        autosaveArmedRef.current = false;
      });
    return () => {
      cancelled = true;
    };
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
    autosaveSchedulerRef.current?.cancel();
    saveKindRef.current = null;
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
      autosaveSchedulerRef.current?.cancel();
      saveKindRef.current = null;
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
          if (!event.running && autosaveOnPauseRef.current) {
            autosaveOnPauseRef.current = false;
            autosaveRequestRef.current();
          }
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
          const kind = saveKindRef.current ?? "manual";
          saveKindRef.current = null;
          // Keep busy through the storage write so a second save cannot race
          // the same storage key.
          void storeSave(event.save)
            .then((info) => {
              if (generation !== sessionRef.current) return;
              setBusy(false);
              setError(null);
              autosaveArmedRef.current = true;
              setSavedCampaign({
                save: event.save,
                metadata: info.metadata,
                source: "primary",
                storedBytes: info.compressedBytes,
              });
              setSaveStatus(
                `${kind === "autosave" ? "Autosaved" : "Saved"} ${info.metadata.dateLabel} · ${String(
                  Math.round(info.saveBytes / 1024),
                )} KiB canonical · ${String(Math.round(info.compressedBytes / 1024))} KiB stored`,
              );
            })
            .catch((saveError: unknown) => {
              if (generation !== sessionRef.current) return;
              setBusy(false);
              setError(
                `${kind === "autosave" ? "Autosave failed" : "Save failed"}: ${messageOf(saveError)}`,
              );
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
            setStartup("playing");
            startupRef.current = "playing";
            autosaveArmedRef.current = true;
            setError(null);
            setSaveStatus("Saved game loaded");
          } else {
            setError(event.errors.join("; ") || "The save could not be loaded.");
            setSaveStatus(null);
            // Do not silently overwrite a save that this build could not load.
            autosaveArmedRef.current = false;
          }
          saveKindRef.current = null;
          setBusy(false);
          return;
        }
        case "ERROR":
          setBusy(supervisorRef.current?.hasPendingCritical ?? false);
          setSaveStatus(null);
          setError(
            saveKindRef.current === "autosave"
              ? `Autosave failed: ${event.message}`
              : saveKindRef.current === "manual"
                ? `Save failed: ${event.message}`
                : event.message,
          );
          saveKindRef.current = null;
          if (event.code === "closed") {
            setConnection("closed");
            connectionRef.current = "closed";
          }
          return;
        case "FATAL":
          saveKindRef.current = null;
          autosaveSchedulerRef.current?.cancel();
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
    autosaveOnPauseRef.current = false;
    autosaveSchedulerRef.current?.cancel();
    if (
      send({ protocolVersion: PROTOCOL_VERSION, type: "START", commandId: nextCommandId("start") })
    ) {
      // Track the intent immediately so a hide event between send and STATE still pauses.
      runningRef.current = true;
    }
  }, [nextCommandId, send]);

  const pause = useCallback(() => {
    autosaveOnPauseRef.current = autosaveArmedRef.current;
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

  const doSave = useCallback(
    (kind: "manual" | "autosave") => {
      const accepted = send({
        protocolVersion: PROTOCOL_VERSION,
        type: "SAVE",
        commandId: nextCommandId("save"),
      });
      if (accepted) {
        saveKindRef.current = kind;
        setSaveStatus(kind === "autosave" ? "Autosaving…" : "Saving…");
      }
    },
    [nextCommandId, send],
  );

  const requestAutosave = useCallback(() => {
    if (!autosaveArmedRef.current || startupRef.current !== "playing") return;
    autosaveSchedulerRef.current?.request();
  }, []);

  useEffect(() => {
    const scheduler = new AutosaveScheduler({
      delayMs: 500,
      canSave: () =>
        autosaveArmedRef.current &&
        startupRef.current === "playing" &&
        !(supervisorRef.current?.hasPendingCritical ?? false),
      save: () => doSave("autosave"),
    });
    autosaveSchedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      if (autosaveSchedulerRef.current === scheduler) autosaveSchedulerRef.current = null;
    };
  }, [doSave]);

  useEffect(() => {
    autosaveRequestRef.current = requestAutosave;
  }, [requestAutosave]);

  const saveGame = useCallback(() => {
    if (savedCampaign !== null && !autosaveArmedRef.current) {
      setOverwritePrompt(true);
      return;
    }
    doSave("manual");
  }, [doSave, savedCampaign]);

  const confirmOverwrite = useCallback(() => {
    setOverwritePrompt(false);
    // Arm only after the replacement is verified; a failed overwrite must not
    // enable autosave over the still-valid old campaign.
    autosaveArmedRef.current = false;
    doSave("manual");
  }, [doSave]);

  const cancelOverwrite = useCallback(() => {
    setOverwritePrompt(false);
  }, []);

  const resumeSavedGame = useCallback(() => {
    if (savedCampaign === null) {
      setError("No saved game is available to continue.");
      return;
    }
    setStartup("playing");
    startupRef.current = "playing";
    autosaveArmedRef.current = true;
    const accepted = send({
      protocolVersion: PROTOCOL_VERSION,
      type: "LOAD",
      commandId: nextCommandId("load"),
      save: savedCampaign.save,
    });
    setSaveStatus(accepted ? "Loading saved game…" : null);
  }, [nextCommandId, savedCampaign, send]);

  const startNewGame = useCallback(() => {
    setStartup("playing");
    startupRef.current = "playing";
    if (savedCampaign === null) {
      autosaveArmedRef.current = true;
      return;
    }
    // Do not silently overwrite the existing campaign with a fresh world. The
    // player must explicitly confirm a later save.
    autosaveArmedRef.current = false;
    setSaveStatus(
      "New campaign started. The previous saved game is preserved until you explicitly save.",
    );
  }, [savedCampaign]);

  const loadGame = useCallback(async () => {
    const generation = sessionRef.current;
    setSaveStatus("Reading save…");
    try {
      const campaign = await readStoredCampaign();
      if (generation !== sessionRef.current) return;
      if (campaign === null) {
        setError("No saved game was found.");
        setSaveStatus(null);
        return;
      }
      setSavedCampaign(campaign);
      setStartup("playing");
      startupRef.current = "playing";
      autosaveArmedRef.current = true;
      const accepted = send({
        protocolVersion: PROTOCOL_VERSION,
        type: "LOAD",
        commandId: nextCommandId("load"),
        save: campaign.save,
      });
      setSaveStatus(accepted ? "Loading saved game…" : null);
    } catch (loadError) {
      setError(messageOf(loadError));
      setSaveStatus(null);
    }
  }, [nextCommandId, send]);

  const restartWorker = useCallback(() => {
    sessionRef.current += 1;
    autosaveArmedRef.current = false;
    autosaveOnPauseRef.current = false;
    autosaveSchedulerRef.current?.cancel();
    saveKindRef.current = null;
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
      if (runningRef.current) {
        resumeOnVisibleRef.current = true;
        pause();
        return;
      }
      // Already paused: backgrounding is still a safe autosave point.
      if (autosaveArmedRef.current) requestAutosave();
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
  }, [pause, requestAutosave, start]);

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
      startup,
      savedCampaign,
      overwritePrompt,
      resumeSavedGame,
      startNewGame,
      confirmOverwrite,
      cancelOverwrite,
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
      startup,
      savedCampaign,
      overwritePrompt,
      resumeSavedGame,
      startNewGame,
      confirmOverwrite,
      cancelOverwrite,
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
