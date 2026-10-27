import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import {
  SPEED_VALUES,
  formatSpeed,
  type SimulationSnapshot,
  type SpeedDaysPerSecond,
} from "@century/sim-worker";

import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { ActionButton, Pill } from "./src/components/ui";
import { BudgetScreen } from "./src/screens/BudgetScreen";
import { CountryScreen } from "./src/screens/CountryScreen";
import { LedgerScreen } from "./src/screens/LedgerScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { MarketsScreen } from "./src/screens/MarketsScreen";
import { PopulationScreen } from "./src/screens/PopulationScreen";
import { colors, radii, spacing } from "./src/theme";
import {
  SimulationProvider,
  useSimulation,
  type ConnectionState,
} from "./src/worker/SimulationProvider";

type TabId = "map" | "country" | "budget" | "population" | "markets" | "ledger";

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: "map", label: "Map" },
  { id: "country", label: "Country" },
  { id: "budget", label: "Budget" },
  { id: "population", label: "Population" },
  { id: "markets", label: "Markets" },
  { id: "ledger", label: "Ledger" },
];

export default function App() {
  return (
    <SimulationProvider>
      <StatusBar style="light" />
      <CenturyApp />
    </SimulationProvider>
  );
}

function CenturyApp() {
  const {
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
    saveGame,
    loadGame,
    restartWorker,
    clearError,
  } = useSimulation();
  const [tab, setTab] = useState<TabId>("map");
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);

  useEffect(() => {
    if (snapshot !== null && selectedCountryId === null) {
      setSelectedCountryId(
        snapshot.playerCountryId ?? snapshot.countries[0]?.id ?? null,
      );
    }
  }, [snapshot, selectedCountryId]);

  const headerSubtitle = useMemo(() => {
    if (snapshot === null) return "Starting simulation…";
    return `${snapshot.date.label} · ${snapshot.scenarioId} · sim ${snapshot.simVersion}`;
  }, [snapshot]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>CENTURY</Text>
            <Text style={styles.subtitle}>{headerSubtitle}</Text>
          </View>
          <View style={styles.statusDotWrap}>
            <View
              style={[
                styles.statusDot,
                connection === "ready" ? styles.statusReady : styles.statusBusy,
              ]}
            />
            <Text style={styles.statusText}>{connection}</Text>
          </View>
        </View>
        <Controls
          snapshot={snapshot}
          connection={connection}
          running={running}
          speedDaysPerSecond={speedDaysPerSecond}
          achievedDaysPerSecond={achievedDaysPerSecond}
          busy={busy}
          onStart={start}
          onPause={pause}
          onStep={step}
          onSpeed={setSpeed}
          onSave={saveGame}
          onLoad={loadGame}
          onRestart={restartWorker}
        />
        {saveStatus === null ? null : <Text style={styles.saveStatus}>{saveStatus}</Text>}
        {error === null ? null : (
          <Pressable onPress={clearError} style={styles.errorBanner} accessibilityRole="button">
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </Pressable>
        )}
      </View>

      <TabBar tab={tab} onSelect={setTab} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <AppErrorBoundary onRestart={restartWorker}>
          {snapshot === null ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>
                {connection === "error"
                  ? "Simulation host failed to start. Restart the worker and load a saved game."
                  : "Waiting for the first immutable snapshot…"}
              </Text>
            </View>
          ) : (
            <Screen
              tab={tab}
              snapshot={snapshot}
              selectedCountryId={selectedCountryId}
              selectedRegionId={selectedRegionId}
              onSelectCountry={setSelectedCountryId}
              onSelectRegion={(regionId, countryId) => {
                setSelectedRegionId(regionId);
                if (countryId !== null) setSelectedCountryId(countryId);
              }}
            />
          )}
        </AppErrorBoundary>
      </ScrollView>
    </SafeAreaView>
  );
}

function Controls({
  snapshot,
  connection,
  running,
  speedDaysPerSecond,
  achievedDaysPerSecond,
  busy,
  onStart,
  onPause,
  onStep,
  onSpeed,
  onSave,
  onLoad,
  onRestart,
}: {
  readonly snapshot: SimulationSnapshot | null;
  readonly connection: ConnectionState;
  readonly running: boolean;
  readonly speedDaysPerSecond: number;
  readonly achievedDaysPerSecond: number;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onStep: () => void;
  readonly onSpeed: (speed: SpeedDaysPerSecond) => void;
  readonly onSave: () => void;
  readonly onLoad: () => void;
  readonly onRestart: () => void;
}) {
  const achievedLabel =
    running && achievedDaysPerSecond > 0
      ? ` · ~${achievedDaysPerSecond.toFixed(1)} actual`
      : "";
  const controlsDisabled = busy || connection !== "ready";
  return (
    <View style={styles.controls}>
      <View style={styles.controlGroup}>
        {running ? (
          <ActionButton label="Pause" onPress={onPause} disabled={controlsDisabled} />
        ) : (
          <ActionButton
            label="Start"
            tone="accent"
            onPress={onStart}
            disabled={controlsDisabled}
          />
        )}
        <ActionButton label="Step 1 day" onPress={onStep} disabled={controlsDisabled} />
      </View>
      <View style={styles.speedRow}>
        <Text style={styles.controlLabel}>
          Target {formatSpeed(speedDaysPerSecond)}
          {achievedLabel} · best effort
        </Text>
        {SPEED_VALUES.map((speed) => (
          <Pill
            key={speed}
            label={`${String(speed)}x`}
            active={speedDaysPerSecond === speed}
            onPress={() => onSpeed(speed)}
            disabled={controlsDisabled}
          />
        ))}
      </View>
      <View style={styles.controlGroup}>
        <ActionButton
          label="Save"
          onPress={onSave}
          disabled={snapshot === null || controlsDisabled}
        />
        <ActionButton label="Load" onPress={onLoad} disabled={controlsDisabled} />
        {connection === "error" || connection === "closed" ? (
          <ActionButton label="Restart worker" tone="danger" onPress={onRestart} />
        ) : null}
      </View>
    </View>
  );
}

function TabBar({ tab, onSelect }: { readonly tab: TabId; readonly onSelect: (tab: TabId) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabBar}
      contentContainerStyle={styles.tabBarContent}
    >
      {TABS.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === entry.id }}
          onPress={() => onSelect(entry.id)}
          style={[styles.tab, tab === entry.id ? styles.tabActive : null]}
        >
          <Text style={[styles.tabLabel, tab === entry.id ? styles.tabLabelActive : null]}>
            {entry.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Screen({
  tab,
  snapshot,
  selectedCountryId,
  selectedRegionId,
  onSelectCountry,
  onSelectRegion,
}: {
  readonly tab: TabId;
  readonly snapshot: SimulationSnapshot;
  readonly selectedCountryId: number | null;
  readonly selectedRegionId: number | null;
  readonly onSelectCountry: (countryId: number) => void;
  readonly onSelectRegion: (regionId: number, countryId: number | null) => void;
}) {
  switch (tab) {
    case "map":
      return (
        <MapScreen
          snapshot={snapshot}
          selectedCountryId={selectedCountryId}
          selectedRegionId={selectedRegionId}
          onSelectCountry={onSelectCountry}
          onSelectRegion={onSelectRegion}
        />
      );
    case "country":
      return <CountryScreen snapshot={snapshot} countryId={selectedCountryId} />;
    case "budget":
      return <BudgetScreen snapshot={snapshot} countryId={selectedCountryId} />;
    case "population":
      return (
        <PopulationScreen
          snapshot={snapshot}
          countryId={selectedCountryId}
          onSelectCountry={onSelectCountry}
        />
      );
    case "markets":
      return <MarketsScreen snapshot={snapshot} countryId={selectedCountryId} />;
    case "ledger":
      return <LedgerScreen snapshot={snapshot} countryId={selectedCountryId} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 2 },
  statusDotWrap: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  statusReady: { backgroundColor: colors.green },
  statusBusy: { backgroundColor: colors.accent },
  statusText: { color: colors.faint, fontSize: 10, textTransform: "uppercase" },
  controls: { marginTop: spacing.sm, gap: spacing.xs },
  controlGroup: { flexDirection: "row", gap: spacing.sm },
  speedRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  controlLabel: { color: colors.muted, fontSize: 11, marginRight: spacing.xs },
  saveStatus: { color: colors.accent, fontSize: 10, marginTop: spacing.xs },
  errorBanner: {
    backgroundColor: "rgba(216,130,114,0.16)",
    borderColor: colors.red,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: { color: colors.text, fontSize: 11, lineHeight: 16 },
  errorDismiss: { color: colors.red, fontSize: 10, fontWeight: "700", marginTop: 4 },
  tabBar: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 48,
  },
  tabBarContent: { paddingHorizontal: spacing.sm, alignItems: "center" },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.xs,
    borderRadius: radii.sm,
  },
  tabActive: { backgroundColor: colors.surfaceRaised },
  tabLabel: { color: colors.faint, fontSize: 12, fontWeight: "600" },
  tabLabelActive: { color: colors.accent },
  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, width: "100%", maxWidth: 900, alignSelf: "center" },
  loading: { alignItems: "center", paddingVertical: spacing.xxl },
  loadingText: { color: colors.muted, fontSize: 12, marginTop: spacing.md, textAlign: "center" },
});
