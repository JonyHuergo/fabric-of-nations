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
  appendPlayerAction,
  describePlayerAction,
  type CountryActionDto,
  type CountrySnapshot,
  type PlayerActionRecord,
  type PlayerActionRequest,
  type SimulationSnapshot,
  type SpeedDaysPerSecond,
  type WorkerCommand,
  type WorkerEvent,
} from "@century/sim-worker";

import { useDisplayCurrency } from "../format/DisplayCurrency";
import { createMoneyFormat, type MoneyFormat } from "../format/money";

import {
  deleteSave as deleteStoredSave,
  listSaves,
  readStoredCampaign,
  recordSaveNation,
  storeSave,
  type SaveSlot,
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
export type CampaignStartup = "checking" | "menu" | "playing";

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
  /** Every saved campaign, most recently saved first. */
  readonly saves: readonly SaveSlot[];
  /**
   * A saved campaign's world as the worker reads it, for the title and load
   * screens. Display only: the live world is not replaced. Undefined until it has
   * been read, null when it could not be read.
   */
  readonly savedWorldOf: (slot: SaveSlot) => SimulationSnapshot | null | undefined;
  /** Ask the worker to read a saved campaign for display; each save is read once. */
  readonly previewSave: (slot: SaveSlot) => void;
  /** Presentation focus whose full country record is in the snapshot. */
  readonly focusCountryId: number | null;
  /** Continue the most recently saved campaign. */
  readonly resumeSavedGame: () => void;
  /** Load one saved campaign and play it. */
  readonly loadSave: (slotId: string) => void;
  /** Delete one saved campaign and its recovery copies. */
  readonly deleteSave: (slotId: string) => Promise<void>;
  /** Create a fresh 1900 world with an explicitly selected player country. */
  readonly createGame: (playerCountryId: number) => void;
  /** Ask the worker to include another country's full record in snapshots. */
  readonly setFocus: (countryId: number) => void;
  readonly start: () => void;
  readonly pause: () => void;
  readonly step: () => void;
  readonly setSpeed: (speed: SpeedDaysPerSecond) => void;
  readonly applyFiscalPolicy: (
    countryId: number,
    incomeTaxRate: number,
    welfareBudgetRUSDPerYear: number,
    schedule?: {
      readonly incomeTaxAllowanceRUSDPerYear: number;
      readonly welfareMaxWealthLevel: number;
      readonly businessProfitTaxRate: number;
      readonly reserveTargetRUSD: number;
    },
  ) => void;
  /** Send any supported E2 action through the shared validated action path. */
  readonly applyAction: (action: CountryActionDto) => void;
  /** Confirmed fiscal and financing actions for the session, oldest first. */
  readonly actionHistory: readonly PlayerActionRecord[];
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

/** Saved worlds kept in memory for the title and load screens. */
const MAX_SAVED_WORLD_PREVIEWS = 6;

/** A preview belongs to one save of a slot; a newer save of the slot is read again. */
function previewKey(slot: SaveSlot): string {
  return `${slot.id}#${String(slot.order)}`;
}

function slotIdOfPreview(key: string): string {
  return key.slice(0, key.lastIndexOf("#"));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Build the confirmed applied values from the authoritative post-action
 * snapshot. Policy values come from the country record; debt movements use the
 * request amount because the snapshot confirms the action but does not echo the
 * command. A rejected action never produces applied values.
 */
function appliedActionFromSnapshot(
  request: PlayerActionRequest,
  country: CountrySnapshot,
): PlayerActionRequest {
  switch (request.kind) {
    case "set-fiscal-policy":
      return {
        kind: "set-fiscal-policy",
        incomeTaxRate: country.fiscal.incomeTaxRate,
        incomeTaxAllowanceRUSDPerYear: country.fiscal.incomeTaxAllowanceRUSDPerYear,
        welfareBudgetRUSDPerYear: country.fiscal.welfareBudgetRUSDPerYear,
        welfareMaxWealthLevel: country.fiscal.welfareMaxWealthLevel,
        businessProfitTaxRate: country.fiscal.businessProfitTaxRate,
        reserveTargetRUSD: country.fiscal.reserveTargetRUSD,
      };
    case "set-debt-policy":
      return {
        kind: "set-debt-policy",
        refinanceOnMaturity: country.debtPolicy.refinanceOnMaturity,
        maxOutstandingPrincipalRUSD: country.debtPolicy.maxOutstandingPrincipalRUSD,
      };
    case "start-research":
      return {
        kind: "start-research",
        technologyId:
          country.technology.activeProjectTechnologyId ?? request.technologyId,
      };
    case "set-education-funding":
      return {
        kind: "set-education-funding",
        annualRUSD: country.education.fundedAnnualRUSD,
      };
    case "set-research-staff-share":
      return {
        kind: "set-research-staff-share",
        share: country.education.researchStaffShare,
      };
    case "set-training-budget":
      return {
        kind: "set-training-budget",
        annualRUSD: country.labor.trainingBudgetRUSDPerYear,
      };
    case "set-training-stipend":
      return {
        kind: "set-training-stipend",
        annualRUSD: country.labor.trainingStipendPerTraineeRUSDPerYear,
      };
    case "set-training-staff-share":
      return {
        kind: "set-training-staff-share",
        share: country.labor.trainingStaffShare,
      };
    case "set-health-staff-share":
      return {
        kind: "set-health-staff-share",
        share: country.labor.healthStaffShare,
      };
    default:
      return { ...request };
  }
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
  /**
   * Set when the stored campaign could not be read. Kept separate from the
   * transient worker errors because initial READY clears those, and a silently
   * cleared storage error would present an unreadable save as "no save".
   */
  const startupStorageErrorRef = useRef<string | null>(null);
  const autosaveRequestRef = useRef<() => void>(() => {});
  const focusRequestRef = useRef<number | null>(null);
  const activePlayerCountryIdRef = useRef<number | null>(null);
  const pendingActionsRef = useRef(
    new Map<
      string,
      {
        readonly countryId: number;
        readonly request: PlayerActionRequest;
      }
    >(),
  );
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  // P3: status messages name amounts in the player's display currency (D-141).
  const { choice: displayCurrency } = useDisplayCurrency();
  const moneyRef = useRef<MoneyFormat>(createMoneyFormat(null, displayCurrency));
  moneyRef.current = createMoneyFormat(snapshot, displayCurrency);
  const [actionHistory, setActionHistory] = useState<readonly PlayerActionRecord[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [speedDaysPerSecond, setSpeedDaysPerSecond] =
    useState<SpeedDaysPerSecond>(1);
  const [achievedDaysPerSecond, setAchievedDaysPerSecond] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startup, setStartup] = useState<CampaignStartup>("checking");
  const [saves, setSaves] = useState<readonly SaveSlot[]>([]);
  /** Saved worlds read for display, by `previewKey`; null when unreadable. */
  const [previews, setPreviews] = useState<ReadonlyMap<string, SimulationSnapshot | null>>(new Map());
  /** Preview keys already asked for, and the preview each command answers. */
  const previewRequestsRef = useRef(new Set<string>());
  const pendingPreviewsRef = useRef(new Map<string, string>());
  /** The slot the campaign in play saves to; null until a new campaign first saves. */
  const activeSlotIdRef = useRef<string | null>(null);
  /** The slot a LOAD in flight came from, adopted only when the worker accepts it. */
  const pendingLoadSlotRef = useRef<string | null>(null);
  /** Storage writes run one after another, so each sees the slot the last one made. */
  const storeChainRef = useRef<Promise<void>>(Promise.resolve());
  const [webEpoch, setWebEpoch] = useState(0);
  const [nativeEpoch, setNativeEpoch] = useState(0);

  /**
   * The saved games are also mirrored into a ref because the worker event handler
   * must read their current value without becoming a dependency of the
   * worker-lifecycle effect. Re-creating the worker when a save completes would
   * silently rebuild the campaign and reset the simulated date.
   */
  const savesRef = useRef<readonly SaveSlot[]>([]);
  const updateSaves = useCallback((next: readonly SaveSlot[]) => {
    savesRef.current = next;
    setSaves(next);
  }, []);

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
    void listSaves()
      .then((stored) => {
        if (cancelled) return;
        updateSaves(stored);
        setStartup("menu");
        startupRef.current = "menu";
        autosaveArmedRef.current = false;
      })
      .catch((storageError: unknown) => {
        if (cancelled) return;
        const message = `Saved game could not be read: ${messageOf(storageError)}`;
        startupStorageErrorRef.current = message;
        setError(message);
        setStartup("menu");
        startupRef.current = "menu";
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
          // A startup storage failure must survive the worker's initial READY;
          // otherwise an unreadable save looks like "no save" with no reason.
          if (event.type === "READY" && startupStorageErrorRef.current === null) setError(null);
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
          const pending = pendingActionsRef.current.get(event.actionId) ?? null;
          pendingActionsRef.current.delete(event.actionId);
          const supervisor = supervisorRef.current;
          if (
            supervisor === null ||
            supervisor.acceptSnapshotSequence(event.snapshot.sequence)
          ) {
            setSnapshot(event.snapshot);
            setRunningState(event.snapshot.running);
            setAchievedDaysPerSecond(event.snapshot.achievedDaysPerSecond);
          }
          const country =
            pending === null
              ? null
              : (event.snapshot.countries.find((entry) => entry.id === pending.countryId) ??
                null);
          if (pending !== null) {
            const applied =
              event.accepted && country !== null
                ? appliedActionFromSnapshot(pending.request, country)
                : null;
            setActionHistory((history) =>
              appendPlayerAction(history, {
                actionId: event.actionId,
                kind: pending.request.kind,
                countryId: pending.countryId,
                countryTag: country?.tag ?? null,
                dayIndex: event.snapshot.dayIndex,
                dateLabel: event.snapshot.date.label,
                requested: pending.request,
                accepted: event.accepted,
                applied,
                errors: [...event.errors],
              }),
            );
          }
          setBusy(false);
          if (event.accepted) {
            setError(null);
            setSaveStatus(
              pending === null
                ? "Action applied"
                : `Applied: ${describePlayerAction(pending.request, moneyRef.current)}`,
            );
          } else {
            setError(event.errors.join("; ") || "The action was rejected.");
            setSaveStatus(null);
          }
          return;
        }
        case "SAVE_RESULT": {
          const generation = sessionRef.current;
          const kind = saveKindRef.current ?? "manual";
          saveKindRef.current = null;
          // Keep busy through the storage write, and chain the writes, so a second
          // save cannot race the first or start a second slot for one campaign.
          storeChainRef.current = storeChainRef.current
            .then(() =>
              storeSave(event.save, {
                slotId: activeSlotIdRef.current,
                playerCountryId: activePlayerCountryIdRef.current,
              }),
            )
            .then((info) => {
              if (generation !== sessionRef.current) return;
              setBusy(false);
              setError(null);
              autosaveArmedRef.current = true;
              activeSlotIdRef.current = info.slot.id;
              updateSaves([info.slot, ...savesRef.current.filter((slot) => slot.id !== info.slot.id)]);
              setSaveStatus(
                `${kind === "autosave" ? "Autosaved" : "Saved"} ${info.metadata.dateLabel} · ${String(
                  Math.round(info.saveBytes / 1024),
                )} KiB canonical · ${String(Math.round(info.compressedBytes / 1024))} KiB stored`,
              );
            })
            .catch((saveError: unknown) => {
              if (generation !== sessionRef.current) return;
              // The chain stays usable for the next save.
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
            activeSlotIdRef.current = pendingLoadSlotRef.current;
            pendingLoadSlotRef.current = null;
            activePlayerCountryIdRef.current = event.snapshot.playerCountryId;
            focusRequestRef.current = null;
            // A successful load replaces the unreadable-save diagnosis.
            startupStorageErrorRef.current = null;
            setError(null);
            setSaveStatus("Saved game loaded");
            setActionHistory([]);
            pendingActionsRef.current.clear();
          } else {
            setError(event.errors.join("; ") || "The save could not be loaded.");
            setSaveStatus(null);
            pendingLoadSlotRef.current = null;
            // Do not silently overwrite a save that this build could not load.
            autosaveArmedRef.current = false;
          }
          saveKindRef.current = null;
          setBusy(false);
          return;
        }
        case "SAVE_PREVIEW": {
          // A save the worker will not read is shown as unreadable; loading it reports why.
          const key = pendingPreviewsRef.current.get(event.commandId);
          if (key === undefined) return;
          pendingPreviewsRef.current.delete(event.commandId);
          rememberPreview(key, event.accepted ? event.snapshot : null);
          // An adopted save did not record its nation; the world it holds does.
          const slotId = slotIdOfPreview(key);
          const playerCountryId = event.snapshot?.playerCountryId ?? null;
          const slot = savesRef.current.find((candidate) => candidate.id === slotId);
          if (slot !== undefined && slot.playerCountryId === null && playerCountryId !== null) {
            void recordSaveNation(slot.id, playerCountryId)
              .then((updated) => {
                if (updated === null) return;
                updateSaves(savesRef.current.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
              })
              .catch(() => undefined);
          }
          return;
        }
        case "NEW_GAME_RESULT": {
          if (event.accepted) {
            const supervisor = supervisorRef.current;
            if (
              supervisor === null ||
              supervisor.acceptSnapshotSequence(event.snapshot.sequence)
            ) {
              setSnapshot(event.snapshot);
            }
            setRunningState(false);
            setSpeedDaysPerSecond(event.snapshot.speedDaysPerSecond as SpeedDaysPerSecond);
            setAchievedDaysPerSecond(event.snapshot.achievedDaysPerSecond);
            setConnection("ready");
            connectionRef.current = "ready";
            setStartup("playing");
            startupRef.current = "playing";
            setActionHistory([]);
            pendingActionsRef.current.clear();
            focusRequestRef.current = null;
            activePlayerCountryIdRef.current = event.snapshot.playerCountryId;
            startupStorageErrorRef.current = null;
            // A new campaign saves to a slot of its own: no other save is at risk.
            activeSlotIdRef.current = null;
            autosaveArmedRef.current = true;
            setSaveStatus(
              savesRef.current.length === 0
                ? "New 1900 campaign started."
                : "New 1900 campaign started. It saves as a new campaign; your other saves are kept.",
            );
            setError(null);
          } else {
            setError(event.errors.join("; ") || "The campaign could not be created.");
            setSaveStatus(null);
          }
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
        command.type === "APPLY_ACTION" ||
        command.type === "CREATE_GAME";
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

  const applyAction = useCallback(
    (action: CountryActionDto) => {
      actionCounter.current += 1;
      const actionId = `ui-action-${String(actionCounter.current)}`;
      const request: PlayerActionRequest = action;
      pendingActionsRef.current.set(actionId, { countryId: action.countryId, request });
      const accepted = send({
        protocolVersion: PROTOCOL_VERSION,
        type: "APPLY_ACTION",
        commandId: nextCommandId("apply"),
        actionId,
        action,
      });
      if (accepted) {
        setBusy(true);
        setSaveStatus(`Applying: ${describePlayerAction(request, moneyRef.current)}…`);
      } else {
        pendingActionsRef.current.delete(actionId);
      }
    },
    [nextCommandId, send],
  );

  const applyFiscalPolicy = useCallback(
    (
      countryId: number,
      incomeTaxRate: number,
      welfareBudgetRUSDPerYear: number,
      schedule?: {
        readonly incomeTaxAllowanceRUSDPerYear: number;
        readonly welfareMaxWealthLevel: number;
        readonly businessProfitTaxRate: number;
        readonly reserveTargetRUSD: number;
      },
    ) => {
      applyAction({
        kind: "set-fiscal-policy",
        countryId,
        incomeTaxRate,
        incomeTaxAllowanceRUSDPerYear: schedule?.incomeTaxAllowanceRUSDPerYear ?? 0,
        welfareBudgetRUSDPerYear,
        welfareMaxWealthLevel: schedule?.welfareMaxWealthLevel ?? 99,
        businessProfitTaxRate: schedule?.businessProfitTaxRate ?? 0,
        reserveTargetRUSD: schedule?.reserveTargetRUSD ?? 0,
      });
    },
    [applyAction],
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
    doSave("manual");
  }, [doSave]);

  /**
   * Read a slot and LOAD it. The menu stays up until the worker accepts the save,
   * so the game opens on the loaded world and a refused save leaves the player on
   * the screen they loaded from.
   */
  const loadSave = useCallback(
    (slotId: string) => {
      const generation = sessionRef.current;
      setSaveStatus("Reading save…");
      void readStoredCampaign(slotId)
        .then((campaign) => {
          if (generation !== sessionRef.current) return;
          if (campaign === null) {
            setError("That saved game no longer exists.");
            setSaveStatus(null);
            return;
          }
          pendingLoadSlotRef.current = slotId;
          const accepted = send({
            protocolVersion: PROTOCOL_VERSION,
            type: "LOAD",
            commandId: nextCommandId("load"),
            save: campaign.save,
          });
          if (!accepted) pendingLoadSlotRef.current = null;
          setSaveStatus(
            accepted
              ? campaign.source === "primary"
                ? "Loading saved game…"
                : "Loading the recovery copy of this saved game…"
              : null,
          );
        })
        .catch((loadError: unknown) => {
          if (generation !== sessionRef.current) return;
          setError(`Saved game could not be read: ${messageOf(loadError)}`);
          setSaveStatus(null);
        });
    },
    [nextCommandId, send],
  );

  const resumeSavedGame = useCallback(() => {
    const latest = savesRef.current[0];
    if (latest === undefined) {
      setError("No saved game is available to continue.");
      return;
    }
    loadSave(latest.id);
  }, [loadSave]);

  const deleteSave = useCallback(
    async (slotId: string) => {
      try {
        await deleteStoredSave(slotId);
        if (activeSlotIdRef.current === slotId) activeSlotIdRef.current = null;
        updateSaves(savesRef.current.filter((slot) => slot.id !== slotId));
        setSaveStatus("Saved game deleted.");
      } catch (deleteError) {
        setError(`Saved game could not be deleted: ${messageOf(deleteError)}`);
      }
    },
    [updateSaves],
  );

  const createGame = useCallback(
    (playerCountryId: number) => {
      const accepted = send({
        protocolVersion: PROTOCOL_VERSION,
        type: "CREATE_GAME",
        commandId: nextCommandId("new-game"),
        playerCountryId,
      });
      if (accepted) {
        setSaveStatus("Preparing the 1900 world…");
      } else {
        setError("The simulation worker is not connected. Restart it and try again.");
      }
    },
    [nextCommandId, send],
  );

  const setFocus = useCallback(
    (countryId: number) => {
      if (focusRequestRef.current === countryId) return;
      focusRequestRef.current = countryId;
      send({
        protocolVersion: PROTOCOL_VERSION,
        type: "SET_FOCUS",
        commandId: nextCommandId("focus"),
        countryId,
      });
    },
    [nextCommandId, send],
  );

  /** Return the campaign in play to its last save. */
  const loadGame = useCallback(() => {
    const slotId = activeSlotIdRef.current;
    if (slotId === null) {
      setError("This campaign has not been saved yet.");
      return;
    }
    loadSave(slotId);
  }, [loadSave]);

  const rememberPreview = useCallback((key: string, world: SimulationSnapshot | null) => {
    setPreviews((current) => {
      const next = new Map(current);
      next.set(key, world);
      // A handful of saved worlds is plenty for the screens that show them.
      while (next.size > MAX_SAVED_WORLD_PREVIEWS) {
        const oldest = next.keys().next().value;
        if (oldest === undefined) break;
        next.delete(oldest);
        previewRequestsRef.current.delete(oldest);
      }
      return next;
    });
  }, []);

  const previewSave = useCallback(
    (slot: SaveSlot) => {
      const key = previewKey(slot);
      if (connectionRef.current !== "ready" || previewRequestsRef.current.has(key)) return;
      previewRequestsRef.current.add(key);
      const generation = sessionRef.current;
      void readStoredCampaign(slot.id)
        .then((campaign) => {
          if (generation !== sessionRef.current) return;
          if (campaign === null) {
            rememberPreview(key, null);
            return;
          }
          const commandId = nextCommandId("preview");
          pendingPreviewsRef.current.set(commandId, key);
          if (
            !send({
              protocolVersion: PROTOCOL_VERSION,
              type: "PREVIEW_SAVE",
              commandId,
              save: campaign.save,
            })
          ) {
            pendingPreviewsRef.current.delete(commandId);
            previewRequestsRef.current.delete(key);
          }
        })
        .catch(() => {
          if (generation === sessionRef.current) rememberPreview(key, null);
        });
    },
    [nextCommandId, rememberPreview, send],
  );

  const savedWorldOf = useCallback(
    (slot: SaveSlot) => previews.get(previewKey(slot)),
    [previews],
  );

  // Re-create the remembered campaign after a worker restart. Player identity is
  // never silently replaced by the scenario's default country.
  const recreateGuardRef = useRef(false);
  useEffect(() => {
    if (connection !== "ready" || startup !== "playing") return;
    const desired = activePlayerCountryIdRef.current;
    if (desired === null) return;
    if (snapshot !== null && snapshot.playerCountryId === desired) {
      recreateGuardRef.current = false;
      return;
    }
    if (recreateGuardRef.current) return;
    recreateGuardRef.current = true;
    send({
      protocolVersion: PROTOCOL_VERSION,
      type: "CREATE_GAME",
      commandId: nextCommandId("restore-country"),
      playerCountryId: desired,
    });
  }, [connection, startup, snapshot, send, nextCommandId]);

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
    setActionHistory([]);
    pendingActionsRef.current.clear();
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

  /**
   * Worker lifecycle must depend only on the explicit restart epoch. Handler
   * identities change whenever provider state changes; tearing the worker down
   * in response would silently rebuild the campaign and discard the simulated
   * date. The supervisor always calls the latest handler through these refs.
   */
  const handleEventRef = useRef(handleEvent);
  const handleSupervisorErrorRef = useRef(handleSupervisorError);
  const handleTimeoutRef = useRef(handleTimeout);
  const handleTransportErrorRef = useRef(handleTransportError);
  useEffect(() => {
    handleEventRef.current = handleEvent;
    handleSupervisorErrorRef.current = handleSupervisorError;
    handleTimeoutRef.current = handleTimeout;
    handleTransportErrorRef.current = handleTransportError;
  }, [handleEvent, handleSupervisorError, handleTimeout, handleTransportError]);

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
      onEvent: (event) => handleEventRef.current(event),
      onError: (message) => handleSupervisorErrorRef.current(message),
      onTimeout: (commandId, commandType, message) =>
        handleTimeoutRef.current(commandId, commandType, message),
    });
    supervisorRef.current = supervisor;
    const unsubscribe = client.subscribe((event) => supervisor.receive(event));
    const unsubscribeErrors = client.subscribeErrors((message) => {
      handleTransportErrorRef.current(message);
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
  }, [webEpoch]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const supervisor = new WorkerSupervisor({
      send: (command) => nativeRef.current?.send(command),
      onEvent: (event) => handleEventRef.current(event),
      onError: (message) => handleSupervisorErrorRef.current(message),
      onTimeout: (commandId, commandType, message) =>
        handleTimeoutRef.current(commandId, commandType, message),
    });
    supervisorRef.current = supervisor;
    supervisor.startReadiness();
    return () => {
      supervisor.dispose();
      if (supervisorRef.current === supervisor) supervisorRef.current = null;
    };
  }, [nativeEpoch]);

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
      saves,
      savedWorldOf,
      previewSave,
      focusCountryId: snapshot?.focusCountryId ?? null,
      resumeSavedGame,
      loadSave,
      deleteSave,
      createGame,
      setFocus,
      start,
      pause,
      step,
      setSpeed,
      applyFiscalPolicy,
      applyAction,
      actionHistory,
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
      saves,
      savedWorldOf,
      previewSave,
      resumeSavedGame,
      loadSave,
      deleteSave,
      createGame,
      setFocus,
      start,
      pause,
      step,
      setSpeed,
      applyFiscalPolicy,
      applyAction,
      actionHistory,
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
            // Every transport event must pass through the supervisor so stale
            // READY/SNAPSHOT sequences and late command replies are gated in one
            // place. During teardown there is no live supervisor; drop the event
            // rather than letting it bypass sequencing.
            supervisorRef.current?.receive(event);
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
