import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { WORLD_CATALOG } from "./src/generated/worldCatalog";
import { WORLD_MAP_1900 } from "./src/generated/worldMap1900";
import { FLAG_FALLBACKS, FLAG_PROVENANCE } from "./src/generated/flagProvenance";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { CountryFlag } from "./src/components/CountryFlag";
import { BRIEFING_FLAG_POLITIES } from "./src/flags/flagRegistry";
import { Badge, Button, Divider, Panel } from "./src/components/ui";
import { GameShell } from "./src/screens/GameShell";
import { CountrySelectionScreen } from "./src/screens/CountrySelectionScreen";
import { MainMenuScreen } from "./src/screens/MainMenuScreen";
import { colors, spacing, type } from "./src/theme";
import { WorldMap } from "./src/components/WorldMap";
import { SimulationProvider, useSimulation } from "./src/worker/SimulationProvider";

type ViewState = "menu" | "brief" | "select" | "game";

export default function App() {
  return (
    <SimulationProvider>
      <StatusBar style="light" />
      <CenturyRoot />
    </SimulationProvider>
  );
}

function CenturyRoot() {
  const {
    error,
    busy,
    startup,
    savedCampaign,
    overwritePrompt,
    resumeSavedGame,
    createGame,
    confirmOverwrite,
    cancelOverwrite,
    restartWorker,
    clearError,
  } = useSimulation();
  // Web-only smoke-test entry points. They are development aids, not a way to
  // bypass validation: a country still goes through CREATE_GAME.
  const initialView = (): ViewState => {
    if (Platform.OS !== "web" || typeof window === "undefined") return "menu";
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested === "brief" || requested === "select" ? requested : "menu";
  };
  const requestedCountryTag = (() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("country");
  })();
  const [view, setView] = useState<ViewState>(initialView);
  const autoAttemptedRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [provenance, setProvenance] = useState(false);
  const { width } = useWindowDimensions();

  // A campaign only enters the game view after the worker confirms it.
  useEffect(() => {
    if (startup === "playing") {
      setCreating(false);
      setView("game");
    }
  }, [startup]);

  useEffect(() => {
    if (creating && error !== null) setCreating(false);
  }, [creating, error]);

  // Optional web smoke-test entry point: ?country=JPN creates that campaign
  // through the same validated CREATE_GAME path.
  useEffect(() => {
    if (Platform.OS !== "web" || requestedCountryTag === null) return;
    if (autoAttemptedRef.current) return;
    if (startup !== "menu" || creating) return;
    autoAttemptedRef.current = true;
    const entry = WORLD_CATALOG.entries.find(
      (candidate) => candidate.tag === requestedCountryTag && candidate.selectable,
    );
    if (entry === undefined) return;
    setCreating(true);
    createGame(entry.id);
  }, [creating, createGame, requestedCountryTag, startup]);

  if (startup === "checking") return <SplashScreen />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppErrorBoundary onRestart={restartWorker}>
        {view === "game" ? (
          <GameShell />
        ) : view === "select" ? (
          <CountrySelectionScreen
            catalog={WORLD_CATALOG}
            map={WORLD_MAP_1900}
            onBack={() => setView("brief")}
            onConfirm={(countryId) => {
              setCreating(true);
              createGame(countryId);
            }}
            creating={creating}
          />
        ) : view === "brief" ? (
          <NewGameBriefScreen
            narrow={width < 820}
            onBack={() => setView("menu")}
            onContinue={() => setView("select")}
          />
        ) : (
          <MainMenuScreen
            savedCampaign={savedCampaign}
            onContinue={() => {
              resumeSavedGame();
            }}
            onNewGame={() => setView("brief")}
            onShowProvenance={() => setProvenance(true)}
          />
        )}

        {error === null || view === "game" ? null : (
          <Pressable style={styles.errorBanner} onPress={clearError} accessibilityRole="button">
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </Pressable>
        )}

        <Modal visible={creating} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.modalTitle}>Preparing the 1900 world</Text>
              <Text style={styles.modalBody}>
                Building the initial population, production, treasury, government and market state
                for the selected country. The first world creation can take a moment.
              </Text>
              {busy ? null : (
                <Text style={styles.modalBody}>
                  The worker is still starting. If this takes too long, restart it below.
                </Text>
              )}
              <View style={styles.modalActions}>
                <Button label="Restart worker" tone="danger" onPress={restartWorker} />
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={overwritePrompt}
          transparent
          animationType="fade"
          onRequestClose={cancelOverwrite}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Replace the saved campaign?</Text>
              <Text style={styles.modalBody}>
                Saving now replaces the previous campaign
                {savedCampaign === null ? "" : ` (${savedCampaign.metadata.dateLabel})`}. The
                immediately previous valid save is kept as a recovery copy, but this overwrite is
                deliberate.
              </Text>
              <View style={styles.modalActions}>
                <Button label="Save and replace" tone="danger" onPress={confirmOverwrite} />
                <Button label="Cancel" onPress={cancelOverwrite} />
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={provenance} transparent animationType="fade" onRequestClose={() => setProvenance(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, styles.provenanceCard]}>
              <ScrollView contentContainerStyle={styles.provenanceContent}>
                <Text style={styles.modalTitle}>Sources, classification and licensing</Text>
                <Text style={styles.modalBody}>
                  Classification: {WORLD_CATALOG.meta.classification.source}. Selectable statuses:{" "}
                  {WORLD_CATALOG.meta.classification.selectableStatuses.join(", ")}.
                </Text>
                <Text style={styles.modalBody}>{WORLD_CATALOG.meta.classification.description}</Text>
                <Divider />
                {WORLD_CATALOG.meta.sources.map((source) => (
                  <View key={source.id} style={styles.sourceRow}>
                    <Text style={styles.sourceTitle}>{source.title}</Text>
                    <Badge label={source.license} tone={source.license.includes("NC") ? "danger" : "muted"} />
                    <Text style={styles.sourceNote}>{source.notes}</Text>
                  </View>
                ))}
                <Divider />
                <Text style={styles.sourceTitle}>Map geometry</Text>
                <Text style={styles.sourceNote}>{WORLD_CATALOG.meta.geometry.dataset}</Text>
                <Text style={styles.sourceNote}>{WORLD_CATALOG.meta.geometry.note}</Text>
                <Text style={styles.sourceNote}>
                  World-atlas topology: {WORLD_MAP_1900.meta.topologyLicense}; Natural Earth:{" "}
                  {WORLD_MAP_1900.meta.naturalEarthLicense}. Geometry is bundled and the game never
                  fetches map data at runtime.
                </Text>
                <Text style={styles.sourceNote}>
                  CShapes 2.0 is CC BY-NC-SA 4.0 and is cited only as a classification reference; it
                  is not redistributed. historical-basemaps (GPL-3.0) was reviewed and not used.
                </Text>
                <Divider />
                <Text style={styles.sourceTitle}>Historical flags of 1 January 1900</Text>
                <Text style={styles.sourceNote}>
                  {String(FLAG_PROVENANCE.filter((flag) => flag.sourceType === "commons").length)}{" "}
                  flag images come from Wikimedia Commons and were individually verified as Public
                  Domain or CC0 through the Commons API.{" "}
                  {String(FLAG_PROVENANCE.filter((flag) => flag.sourceType === "project").length)}{" "}
                  are original Century reconstructions from documented designs. No CC BY-SA or
                  other share-alike artwork is bundled. Flag type, author, licence, validity dates,
                  retrieval date and historical caveats are recorded for every file below and in
                  docs/FLAG_PROVENANCE.md. The game reads only the bundled PNG assets; it makes no
                  network request to display a flag.
                </Text>
                <Text style={styles.sourceNote}>
                  Monogram fallbacks (no verified PD/CC0 1900 artwork):{" "}
                  {FLAG_FALLBACKS.map((entry) => entry.tag).join(", ")}.
                </Text>
                {FLAG_PROVENANCE.map((flag) => (
                  <View key={flag.id} style={styles.sourceRow}>
                    <Text style={styles.sourceTitle}>
                      {flag.description} · {flag.polityTags.join(", ")}
                    </Text>
                    <Badge label={flag.license} tone="muted" />
                    <Text style={styles.sourceNote}>
                      {flag.flagKind.replaceAll("-", " ")} · {flag.author} · {flag.validFrom}–
                      {flag.validTo ?? "no end date recorded"} · retrieved {flag.retrievedAt}
                    </Text>
                    <Text style={styles.sourceNote}>
                      {flag.sourceType === "project"
                        ? "Project-authored reconstruction; see docs/FLAG_PROVENANCE.md"
                        : flag.sourcePageUrl}
                    </Text>
                  </View>
                ))}
                <View style={styles.modalActions}>
                  <Button label="Close" onPress={() => setProvenance(false)} />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </AppErrorBoundary>
    </SafeAreaView>
  );
}

function SplashScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.splashTitle}>CENTURY</Text>
        <Text style={styles.splashBody}>Reading the saved world and starting the simulation…</Text>
      </View>
    </SafeAreaView>
  );
}

function NewGameBriefScreen({
  narrow,
  onBack,
  onContinue,
}: {
  readonly narrow: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}) {
  const playable = WORLD_CATALOG.entries.filter((entry) => entry.selectable).length;
  const territories = WORLD_CATALOG.entries.filter((entry) => entry.kind === "territory").length;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.briefContent}>
      <View style={styles.briefHeader}>
        <Button label="← Main menu" tone="ghost" size="sm" onPress={onBack} />
        <Text style={styles.briefStep}>NEW CAMPAIGN · STEP 1 OF 2</Text>
      </View>
      <Text style={styles.briefTitle}>The world of 1 January 1900</Text>
      <Text style={styles.briefLead}>
        You will choose one country to govern for the next hundred years. The other polities are
        simulated by the existing country AI and the same authoritative world.
      </Text>

      <View style={[styles.briefGrid, narrow ? styles.briefGridNarrow : null]}>
        <View style={styles.briefMain}>
          <Panel title="Scenario" subtitle="Confirmed before any country is selected.">
            <BriefFact label="Campaign start" value="1 January 1900" detail="Day 0 of the 1900–2000 campaign" />
            <BriefFact label="Simulation resolution" value="One civil day per tick" />
            <BriefFact label="World size" value={`${playable} playable states`} detail={`${territories} dependent territories, ${String(WORLD_CATALOG.markets.length)} markets`} />
            <BriefFact label="Player control" value="One country, chosen next" detail="All other countries are AI-controlled" />
            <BriefFact label="Determinism" value="Fixed seed, ordered actions" detail="Identical inputs produce identical worlds" />
          </Panel>

          <Panel title="What is modelled" subtitle="Every selectable country starts as a valid simulation entity.">
            <Text style={styles.briefBody}>
              Regions, population age cohorts and professions, buildings and employment, treasury
              and debt policy, government and laws, technology and education, market membership,
              currency, and AI control. Colonies and protectorates are modelled as dependent
              territories of their sovereign power: their people, production and market membership
              are simulated, but their government is not separately playable.
            </Text>
            <Divider />
            <Text style={styles.briefBody}>
              Historical population totals are rounded estimates. Occupation structure, literacy,
              building levels, fiscal settings and market grouping are documented provisional
              calibrations. No synthetic economic value is presented as a measured historical fact.
            </Text>
          </Panel>
        </View>
        <View style={narrow ? styles.briefSideNarrow : styles.briefSide}>
          <WorldMap
            catalog={WORLD_CATALOG}
            map={WORLD_MAP_1900}
            snapshot={null}
            selectedTag={null}
            onSelect={() => undefined}
            height={narrow ? 220 : 340}
            showLegend={false}
          />
          <Text style={styles.briefCaption}>
            Political geography around 1900: sovereign states, empires and their dependent
            territories. The next step lets you inspect and choose any playable state.
          </Text>
          <View style={styles.briefFlagPanel}>
            <Text style={type.label}>Historical flags · 1 January 1900</Text>
            <View style={styles.briefFlagRow}>
              {BRIEFING_FLAG_POLITIES.map((entry) => (
                <CountryFlag
                  key={entry.polityId}
                  polityId={entry.polityId}
                  tag={entry.tag}
                  size="briefing"
                  accessibilityLabel={`${entry.tag} historical flag of 1900`}
                />
              ))}
            </View>
            <Text style={styles.briefCaption}>
              Bundled Wikimedia Commons artwork, Public Domain or CC0 only. A monogram is used where
              no historically verified 1900 flag is available.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.briefActions}>
        <Button label="Continue to country selection" tone="primary" size="lg" onPress={onContinue} />
        <Button label="Back" onPress={onBack} />
      </View>
    </ScrollView>
  );
}

function BriefFact({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}) {
  return (
    <View style={styles.briefFact}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.briefFactValue}>{value}</Text>
      {detail === undefined ? null : <Text style={styles.briefFactDetail}>{detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  splashTitle: { ...type.display, letterSpacing: 8 },
  splashBody: { ...type.small },
  screen: { flex: 1, backgroundColor: colors.background },
  briefContent: { padding: spacing.lg, paddingBottom: spacing.xxxl, maxWidth: 1200, width: "100%", alignSelf: "center" },
  briefHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  briefStep: { ...type.label, color: colors.accentStrong },
  briefTitle: { ...type.display, fontSize: 34, marginBottom: spacing.xs },
  briefLead: { ...type.body, color: colors.muted, maxWidth: 760, marginBottom: spacing.lg },
  briefGrid: { flexDirection: "row", gap: spacing.md },
  briefGridNarrow: { flexDirection: "column" },
  briefMain: { flex: 1 },
  briefSide: { width: 460 },
  briefSideNarrow: { width: "100%" },
  briefCaption: { ...type.tiny, marginTop: 4 },
  briefFlagPanel: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    backgroundColor: colors.backgroundAlt,
    gap: 5,
  },
  briefFlagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  briefFact: { paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  briefFactValue: { ...type.body, color: colors.textStrong, marginTop: 1 },
  briefFactDetail: { ...type.tiny },
  briefBody: { ...type.small, lineHeight: 18, marginBottom: spacing.sm },
  briefActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, flexWrap: "wrap" },
  errorBanner: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: "rgba(60, 24, 20, 0.96)",
    borderColor: colors.red,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    padding: spacing.md,
    gap: 2,
  },
  errorText: { ...type.small, color: colors.text },
  errorDismiss: { ...type.tiny, color: colors.red, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(4, 7, 9, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: { ...type.title, fontSize: 18 },
  modalBody: { ...type.small, lineHeight: 17 },
  modalActions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.sm },
  provenanceCard: { maxWidth: 680, maxHeight: "82%" },
  provenanceContent: { gap: 6, paddingBottom: spacing.md },
  sourceRow: { gap: 2, paddingVertical: 4, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  sourceTitle: { ...type.body, color: colors.textStrong, fontWeight: "700" },
  sourceNote: { ...type.tiny, lineHeight: 15 },
});
