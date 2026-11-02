import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { WORLD_CATALOG } from "./src/generated/worldCatalog";
import { WORLD_MAP_1900 } from "./src/generated/worldMap1900";
import { FLAG_FALLBACKS, FLAG_PROVENANCE } from "./src/generated/flagProvenance";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { CountryFlag } from "./src/components/CountryFlag";
import { Dialog } from "./src/components/Dialog";
import { Vignette } from "./src/components/Vignette";
import { EntryPanel, useEntryPanelWidth } from "./src/components/EntryPanel";
import { FONT_ASSETS } from "./src/design/fontAssets";
import { ERA_THEMES, eraForDate, type EraId } from "./src/design/tokens";
import { useEraTheme } from "./src/design/useEraTheme";
import { BRIEFING_FLAG_POLITIES } from "./src/flags/flagRegistry";
import { Badge, Button, Disclosure, Divider, Ornament, Panel } from "./src/components/ui";
import { MapStageProvider, useMapView } from "./src/map/host/MapStage";
import { GameShell } from "./src/screens/GameShell";
import { CountrySelectionScreen } from "./src/screens/CountrySelectionScreen";
import { LoadGameScreen } from "./src/screens/LoadGameScreen";
import { MainMenuScreen } from "./src/screens/MainMenuScreen";
import { saveEra } from "./src/screens/saveDisplay";
import { colors, fonts, radii, spacing, themedSheet, type } from "./src/theme";
import { SimulationProvider, useSimulation } from "./src/worker/SimulationProvider";

type ViewState = "menu" | "load" | "brief" | "select" | "game";

export default function App() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  return (
    <SafeAreaProvider>
      <SimulationProvider>
        <StatusBar style="light" hidden />
        {fontsLoaded || fontError !== null ? <CenturyRoot /> : null}
      </SimulationProvider>
    </SafeAreaProvider>
  );
}

function CenturyRoot() {
  const {
    snapshot,
    error,
    busy,
    startup,
    connection,
    saves,
    savedWorldOf,
    previewSave,
    resumeSavedGame,
    loadSave,
    deleteSave,
    createGame,
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
  // Display only: lets the verification scripts see an era without playing to it.
  const requestedEra = (() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return null;
    const era = new URLSearchParams(window.location.search).get("era");
    return era !== null && era in ERA_THEMES ? ERA_THEMES[era as EraId] : null;
  })();
  const requestedCountryTag = (() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("country");
  })();
  const [view, setView] = useState<ViewState>(initialView);
  const autoAttemptedRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [provenance, setProvenance] = useState(false);
  const [browsedSlotId, setBrowsedSlotId] = useState<string | null>(null);

  // The map shows the campaign in play, the latest save behind the title screen,
  // the chosen save on the load screen, and 1900 while a new campaign is being
  // chosen. The era, and with it every accent of the interface and the map's
  // outline of the player's nation, follows the date of the save shown; it is
  // read from the save envelope, so it changes before the world itself is read.
  const inGame = view === "game";
  const latestSave = saves[0] ?? null;
  const browsedSlot = saves.find((slot) => slot.id === browsedSlotId) ?? latestSave;
  const shownSlot = view === "menu" ? latestSave : view === "load" ? browsedSlot : null;
  const shownSave = shownSlot === null ? undefined : savedWorldOf(shownSlot);
  const shownWorld = inGame ? snapshot : (shownSave ?? null);
  const era = useMemo(
    () =>
      requestedEra ??
      (inGame || shownSlot === null ? eraForDate(shownWorld?.date ?? null) : (saveEra(shownSlot) ?? eraForDate(null))),
    [inGame, requestedEra, shownSlot, shownWorld?.date],
  );
  useEraTheme(era);

  useEffect(() => {
    if (shownSlot !== null && connection === "ready") previewSave(shownSlot);
  }, [connection, previewSave, shownSlot]);

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

  return (
    <View style={styles.root}>
      <MapStageProvider snapshot={shownWorld} eraId={era.id}>
      <AppErrorBoundary onRestart={restartWorker}>
        {startup === "checking" ? (
          <SplashScreen />
        ) : view === "game" ? (
          <GameShell />
        ) : view === "select" ? (
          <CountrySelectionScreen
            catalog={WORLD_CATALOG}
            onBack={() => setView("brief")}
            onConfirm={(countryId) => {
              setCreating(true);
              createGame(countryId);
            }}
            creating={creating}
          />
        ) : view === "brief" ? (
          <NewGameBriefScreen
            onBack={() => setView("menu")}
            onContinue={() => setView("select")}
          />
        ) : view === "load" ? (
          <LoadGameScreen
            saves={saves}
            selected={browsedSlot}
            selectedWorld={shownSave}
            loading={busy}
            onSelect={setBrowsedSlotId}
            onLoad={loadSave}
            onDelete={deleteSave}
            onBack={() => setView("menu")}
          />
        ) : (
          <MainMenuScreen
            latestSave={latestSave}
            savedWorld={shownSave}
            loading={busy}
            onContinue={() => {
              resumeSavedGame();
            }}
            onLoadGame={() => {
              setBrowsedSlotId(latestSave?.id ?? null);
              setView("load");
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

        <Dialog
          visible={creating}
          kicker="New campaign"
          title="Preparing the 1900 world"
          actions={<Button label="Restart worker" tone="danger" onPress={restartWorker} />}
        >
          <View style={styles.preparing}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.modalBody, styles.preparingText]}>
              Building the initial population, production, treasury, government and market state
              for the selected country. The first world creation can take a moment.
            </Text>
          </View>
          {busy ? null : (
            <Text style={styles.modalBody}>
              The worker is still starting. If this takes too long, restart it below.
            </Text>
          )}
        </Dialog>

        <Dialog
          visible={provenance}
          kicker="Sources"
          title="Sources, classification and licensing"
          onRequestClose={() => setProvenance(false)}
          wide
          scroll
          actions={<Button label="Close" onPress={() => setProvenance(false)} />}
        >
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
            Typefaces: Newsreader, copyright The Newsreader Project Authors, and IBM Plex Sans
            Condensed, copyright IBM Corp., both under the SIL Open Font License 1.1 and bundled
            with the application. See docs/FONT_PROVENANCE.md.
          </Text>
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
            are original Fabric of Nations reconstructions from documented designs. No CC BY-SA or
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
        </Dialog>
      </AppErrorBoundary>
      </MapStageProvider>
    </View>
  );
}

function SplashScreen() {
  return (
    <View style={styles.splash} pointerEvents="none">
      <Text style={styles.splashKicker}>Grand strategy · 1900 – 2000</Text>
      <Text style={styles.splashTitle}>FABRIC OF NATIONS</Text>
      <Ornament align="center" width={180} />
      <View style={styles.splashStatus}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.splashBody}>Reading the saved world…</Text>
      </View>
    </View>
  );
}

function NewGameBriefScreen({
  onBack,
  onContinue,
}: {
  readonly onBack: () => void;
  readonly onContinue: () => void;
}) {
  const panelWidth = useEntryPanelWidth();
  const safe = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Map labels stay clear of the caption over the map.
  const captionBox = useMemo(
    () => [{ left: 0, top: height - 110, width: width - panelWidth, height: 110 }],
    [height, panelWidth, width],
  );
  useMapView({ insetRight: panelWidth, reserved: captionBox }, {});
  const playable = WORLD_CATALOG.entries.filter((entry) => entry.selectable).length;
  const territories = WORLD_CATALOG.entries.filter((entry) => entry.kind === "territory").length;
  return (
    <View style={styles.fill} pointerEvents="box-none">
      <Vignette variant="caption" />
      <View
        pointerEvents="none"
        style={[
          styles.briefCaptionWrap,
          { left: safe.left + spacing.xl, right: panelWidth + spacing.lg, bottom: safe.bottom + spacing.lg },
        ]}
      >
        <Text style={styles.briefCaption}>
          Political geography around 1900: sovereign states, empires and their dependent
          territories. The next step lets you inspect and choose any playable state.
        </Text>
      </View>
      <EntryPanel
        kicker="New campaign · Step 1 of 2"
        title="The world of 1 January 1900"
        onBack={onBack}
        backLabel="Main menu"
        footer={
          <>
            <Button label="Continue to country selection" tone="primary" size="lg" onPress={onContinue} />
          </>
        }
      >
        <Text style={styles.briefLead}>
          You will choose one country to govern for the next hundred years. The other polities are
          simulated by the existing country AI and the same authoritative world.
        </Text>
        <Panel title="Scenario" subtitle="Confirmed before any country is selected.">
          <BriefFact label="Campaign start" value="1 January 1900" detail="Day 0 of the 1900–2000 campaign" />
          <BriefFact label="Simulation resolution" value="One civil day per tick" />
          <BriefFact label="World size" value={`${playable} playable states`} detail={`${territories} dependent territories, ${String(WORLD_CATALOG.markets.length)} markets`} />
          <BriefFact label="Player control" value="One country, chosen next" detail="All other countries are AI-controlled" />
          <BriefFact label="Determinism" value="Fixed seed, ordered actions" detail="Identical inputs produce identical worlds" />
        </Panel>
        <Disclosure title="What is modelled">
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
        </Disclosure>
        <Disclosure title="Historical flags · 1 January 1900">
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
          <Text style={styles.briefFlagNote}>
            Bundled Wikimedia Commons artwork, Public Domain or CC0 only. A monogram is used where
            no historically verified 1900 flag is available.
          </Text>
        </Disclosure>
      </EntryPanel>
    </View>
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

const styles = themedSheet(() => ({
  root: { flex: 1, backgroundColor: colors.mapOcean },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  splash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.overlay,
  },
  splashKicker: { ...type.eyebrow, textAlign: "center" },
  splashTitle: { ...type.hero, fontSize: 34, lineHeight: 40, letterSpacing: 4, textAlign: "center" },
  splashStatus: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  splashBody: { ...type.small },
  briefCaptionWrap: { position: "absolute" },
  briefCaption: { ...type.small, color: colors.textStrong, maxWidth: 420 },
  briefLead: { ...type.body, color: colors.muted },
  briefFlagNote: { ...type.tiny, marginTop: spacing.xs },
  briefFlagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  briefFact: { paddingVertical: 6 },
  briefFactValue: { ...type.body, color: colors.textStrong, marginTop: 1 },
  briefFactDetail: { ...type.tiny },
  briefBody: { ...type.small, marginBottom: spacing.xs },
  errorBanner: {
    position: "absolute",
    left: spacing.md,
    bottom: spacing.md,
    maxWidth: 420,
    backgroundColor: colors.chrome,
    borderLeftColor: colors.red,
    borderLeftWidth: 2,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  errorText: { ...type.small, color: colors.text },
  errorDismiss: { ...type.small, color: colors.red, fontFamily: fonts.sansSemiBold },
  modalBody: { ...type.small },
  preparing: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  preparingText: { flex: 1 },
  sourceRow: { gap: 2, paddingVertical: 4, borderBottomColor: colors.border, borderBottomWidth: 1 },
  sourceTitle: { ...type.body, color: colors.textStrong, fontFamily: fonts.sansSemiBold },
  sourceNote: { ...type.tiny },
}));
