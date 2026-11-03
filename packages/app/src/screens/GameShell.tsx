import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SPEED_VALUES,
  formatSpeed,
  type CountrySummarySnapshot,
  type ProvinceOwnershipSnapshot,
  type ProvinceEconomySnapshot,
  type SimulationSnapshot,
  type SpeedDaysPerSecond,
} from "@century/sim-worker";

import { CountryFlag } from "../components/CountryFlag";
import { Icon, type IconName } from "../components/icons";
import { statusLabel } from "../components/WorldMap";
import { Badge, Button, Chip, Divider, Metric, Panel, StatRow } from "../components/ui";
import { shellMetrics, type ShellMetrics } from "../design/tokens";
import { PROVINCE_CATALOG } from "../generated/provinceCatalog";
import { WORLD_CATALOG } from "../generated/worldCatalog";
import type { MapPress } from "../map/host/AtlasMap";
import { useMapStage, useMapView } from "../map/host/MapStage";
import type { ReservedBox } from "../map/labels";
import { availableLenses } from "../map/lenses";
import { MAP_MODES, type MapDataContext, type MapModeId } from "../map/mapModes";
import { rgbToCss } from "../map/politicalPalette";
import type { ProvinceCatalogEntry } from "../provinceCatalogTypes";
import { TOUCH_TARGET, colors, fonts, getActiveTheme, radii, spacing, themedSheet, type } from "../theme";
import type { WorldCatalogEntry } from "../worldCatalogTypes";
import { useSimulation } from "../worker/SimulationProvider";
import { BudgetScreen } from "./BudgetScreen";
import { ConstructionScreen } from "./ConstructionScreen";
import { CountryScreen } from "./CountryScreen";
import { appendDispatches, deriveDispatches, type Dispatch, type DispatchSource } from "./dispatches";
import { IndustryScreen } from "./IndustryScreen";
import { LaborScreen } from "./LaborScreen";
import { LedgerScreen } from "./LedgerScreen";
import { MarketsScreen } from "./MarketsScreen";
import { MoneyScreen } from "./MoneyScreen";
import { DOMAINS, domainOf, type DomainId, type NavDomain, type ScreenId } from "./navigation";
import { PoliticsScreen } from "./PoliticsScreen";
import { PopulationScreen } from "./PopulationScreen";
import { TechnologyScreen } from "./TechnologyScreen";
import { TradeScreen } from "./TradeScreen";
import { WarScreen } from "./WarScreen";
import { provinceEconomyRows } from "@century/sim-worker";

const DOMAIN_ICON: Readonly<Record<DomainId, IconName>> = {
  realm: "realm",
  economy: "economy",
  society: "society",
  world: "world",
};

const SHEET_MS = 240;
const DISPATCH_SHOW_MS = 6_000;
const STATUS_SHOW_MS = 3_500;
/** Keep this much clear water between a tapped place and the sheet's edge. */
const SHEET_CLEARANCE = 28;

type SheetState =
  | { readonly kind: "screen"; readonly screen: ScreenId }
  | { readonly kind: "place" }
  | { readonly kind: "campaign" };

const PROVINCE_BY_ID = new Map(PROVINCE_CATALOG.provinces.map((province) => [province.id, province] as const));
const ENTRY_BY_ID = new Map(WORLD_CATALOG.entries.map((entry) => [entry.id, entry] as const));
const ENTRY_BY_TAG = new Map(WORLD_CATALOG.entries.map((entry) => [entry.tag, entry] as const));
const FUTURE_BY_ID = new Map(PROVINCE_CATALOG.futurePolities.map((polity) => [polity.polityId, polity] as const));

const DISPATCH_NAMES = {
  province: (provinceId: number): string => PROVINCE_BY_ID.get(provinceId)?.displayName ?? `Province ${String(provinceId)}`,
  polity: (polityId: number): string =>
    ENTRY_BY_ID.get(polityId)?.commonName ?? FUTURE_BY_ID.get(polityId)?.commonName ?? `Polity ${String(polityId)}`,
};

function formatRusd(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} bn`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)} k`;
  return value.toFixed(0);
}
function formatPeople(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} bn`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} k`;
  return String(Math.round(value));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function displayDate(date: { readonly year: number; readonly month: number; readonly day: number }): string {
  return `${String(date.day)} ${MONTH_NAMES[date.month - 1] ?? ""} ${String(date.year)}`;
}

/**
 * The player's last closed month. Read from the player's own history because a
 * country summary's result stays null until the worker compacts that month.
 */
function latestClosedResult(snapshot: SimulationSnapshot | null): number | null {
  const player = snapshot?.countries.find((country) => country.id === snapshot.playerCountryId);
  const history = player?.financeHistory ?? [];
  return history[history.length - 1]?.netFiscalResultRUSD ?? null;
}

export function GameShell() {
  const {
    snapshot,
    connection,
    error,
    saveStatus,
    running,
    speedDaysPerSecond,
    achievedDaysPerSecond,
    busy,
    focusCountryId,
    start,
    pause,
    step,
    setSpeed,
    setFocus,
    saveGame,
    loadGame,
    restartWorker,
    clearError,
  } = useSimulation();
  const { width, height } = useWindowDimensions();
  const safe = useSafeAreaInsets();
  const metrics = shellMetrics(width, height);
  const stage = useMapStage();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null);
  const [layer, setLayer] = useState<MapModeId>("political");
  const [highlightMarketId, setHighlightMarketId] = useState<number | null>(null);
  const [shift, setShift] = useState(0);
  const lastPress = useRef<MapPress | null>(null);

  const playerSummary = useMemo(
    () =>
      snapshot === null
        ? null
        : (snapshot.countrySummaries.find((country) => country.id === snapshot.playerCountryId) ?? null),
    [snapshot],
  );
  const playerEntry = useMemo(
    () => WORLD_CATALOG.entries.find((entry) => entry.tag === playerSummary?.tag) ?? null,
    [playerSummary?.tag],
  );

  // Select the player's nation, and select it again when another campaign arrives:
  // Continue opens the shell before the worker answers with the loaded world.
  const seenPlayerTag = useRef<string | null>(null);
  useEffect(() => {
    const tag = playerSummary?.tag ?? null;
    if (tag === null || tag === seenPlayerTag.current) return;
    seenPlayerTag.current = tag;
    setSelectedTag(tag);
  }, [playerSummary?.tag]);

  useEffect(() => {
    const entry = WORLD_CATALOG.entries.find((candidate) => candidate.tag === selectedTag);
    if (entry === undefined || snapshot === null) return;
    // A dependent territory has no country record of its own: focus its
    // sovereign so switching tabs inspects the administering state.
    const targetId =
      entry.kind === "state"
        ? entry.id
        : (WORLD_CATALOG.entries.find((candidate) => candidate.tag === entry.sovereignTag)?.id ??
          null);
    if (targetId !== null && focusCountryId !== targetId) setFocus(targetId);
  }, [selectedTag, focusCountryId, setFocus, snapshot]);

  const selectedEntry = useMemo(
    () => WORLD_CATALOG.entries.find((entry) => entry.tag === selectedTag) ?? null,
    [selectedTag],
  );
  // P2: a catalogue entry is a set of provinces: a state's home provinces or a
  // dependent territory's provinces (D-118).
  const selectedTerritory = useMemo(
    () => (snapshot === null || selectedEntry === null ? null : territoryAggregate(snapshot, selectedEntry)),
    [snapshot, selectedEntry],
  );
  const selectedSummary = useMemo(() => {
    if (snapshot === null || selectedEntry === null) return null;
    const countryId =
      selectedEntry.kind === "state"
        ? selectedEntry.id
        : (WORLD_CATALOG.entries.find((entry) => entry.tag === selectedEntry.sovereignTag)?.id ??
          -1);
    return snapshot.countrySummaries.find((country) => country.id === countryId) ?? null;
  }, [snapshot, selectedEntry]);
  const detailCountryId = useMemo(() => {
    if (selectedEntry === null) return snapshot?.playerCountryId ?? null;
    if (selectedEntry.kind === "state") return selectedEntry.id;
    return (
      WORLD_CATALOG.entries.find((entry) => entry.tag === selectedEntry.sovereignTag)?.id ?? null
    );
  }, [selectedEntry, snapshot]);
  const detailReady =
    detailCountryId !== null &&
    snapshot !== null &&
    snapshot.countries.some((country) => country.id === detailCountryId);
  const focusedCountryId = useMemo(() => {
    if (snapshot === null) return null;
    if (selectedEntry === null) return snapshot.playerCountryId;
    const targetId =
      selectedEntry.kind === "state"
        ? selectedEntry.id
        : (WORLD_CATALOG.entries.find((entry) => entry.tag === selectedEntry.sovereignTag)?.id ??
          snapshot.playerCountryId);
    return snapshot.countries.some((country) => country.id === targetId)
      ? targetId
      : snapshot.playerCountryId;
  }, [selectedEntry, snapshot]);

  const selectedMarket =
    selectedEntry === null
      ? null
      : (snapshot?.markets.find((market) =>
          selectedTerritory !== null && selectedTerritory.marketId !== null
            ? market.id === selectedTerritory.marketId
            : market.memberCountryIds.includes(selectedEntry.id),
        ) ??
        WORLD_CATALOG.markets.find((market) => market.key === selectedEntry.market) ??
        null);

  const controlsDisabled = busy || connection !== "ready";

  // ---- dispatches -----------------------------------------------------------

  const previousFrame = useRef<DispatchSource | null>(null);
  const [dispatches, setDispatches] = useState<readonly Dispatch[]>([]);
  const [shownDispatch, setShownDispatch] = useState<Dispatch | null>(null);
  useEffect(() => {
    if (snapshot === null) return;
    const added = deriveDispatches(previousFrame.current, snapshot, DISPATCH_NAMES);
    previousFrame.current = snapshot;
    const latest = added[added.length - 1];
    if (latest === undefined) return;
    setDispatches((history) => appendDispatches(history, added));
    setShownDispatch(latest);
  }, [snapshot]);
  useEffect(() => {
    if (shownDispatch === null) return;
    const timer = setTimeout(() => setShownDispatch(null), DISPATCH_SHOW_MS);
    return () => clearTimeout(timer);
  }, [shownDispatch]);
  const [statusVisible, setStatusVisible] = useState(false);
  useEffect(() => {
    if (saveStatus === null) {
      setStatusVisible(false);
      return;
    }
    setStatusVisible(true);
    const timer = setTimeout(() => setStatusVisible(false), STATUS_SHOW_MS);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // ---- map and sheet --------------------------------------------------------

  const sheetOpen = sheet !== null;
  const animateShift = useCallback(
    (value: number) => {
      setShift(value);
      Animated.timing(stage.shift, {
        toValue: value,
        duration: SHEET_MS,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    },
    [stage.shift],
  );

  /**
   * The map surface slides aside rather than the camera moving: a selection made
   * on the map keeps its camera, and the place tapped stays clear of the sheet.
   */
  const openSheet = useCallback(
    (next: SheetState, press: MapPress | null) => {
      setSheet(next);
      const edge = width - safe.right - metrics.sheetWidth - SHEET_CLEARANCE;
      const clearance = press === null ? -metrics.sheetWidth / 2 : Math.min(0, edge - press.x);
      animateShift(Math.max(-metrics.sheetWidth, clearance));
    },
    [animateShift, metrics.sheetWidth, safe.right, width],
  );
  const closeSheet = useCallback(() => {
    setSheet(null);
    animateShift(0);
  }, [animateShift]);

  useEffect(() => {
    return () => stage.shift.setValue(0);
  }, [stage.shift]);

  const onSelectProvince = useCallback(
    (provinceId: number | null, press: MapPress | null) => {
      setSelectedProvinceId(provinceId);
      lastPress.current = press;
      if (provinceId !== null) openSheet({ kind: "place" }, press);
    },
    [openSheet],
  );

  const showMarket = useCallback(
    (marketId: number) => {
      setLayer("markets");
      setHighlightMarketId(marketId);
      closeSheet();
    },
    [closeSheet],
  );

  const railRight = safe.left + metrics.gutter + TOUCH_TARGET;
  const surfaceOffset = -shift;
  const insetLeft = railRight + surfaceOffset;
  const insetRight = sheetOpen ? Math.max(0, metrics.sheetWidth - surfaceOffset) : 0;
  const reserved = useMemo<readonly ReservedBox[]>(
    () => hudBoxes(width, height, metrics, safe, surfaceOffset, sheetOpen),
    [height, metrics, safe, sheetOpen, surfaceOffset, width],
  );

  useMapView(
    {
      selectedTag,
      selectedProvinceId,
      playerTag: playerSummary?.tag ?? null,
      lens: layer,
      highlightMarketId,
      insetLeft,
      insetRight,
      reserved,
    },
    {
      onSelect: setSelectedTag,
      onSelectProvince,
      onSeaPress: () => {
        if (sheet?.kind === "place") closeSheet();
      },
    },
  );

  const lenses = useMemo(() => availableLenses(snapshot), [snapshot]);

  const domain = sheet?.kind === "screen" ? domainOf(sheet.screen) : null;
  const sheetTitle =
    sheet === null
      ? ""
      : sheet.kind === "screen"
        ? (domain?.label ?? "")
        : sheet.kind === "campaign"
          ? "Campaign"
          : (selectedEntry?.commonName ?? "Selection");
  const sheetSubtitle =
    sheet?.kind === "screen"
      ? selectedEntry === null
        ? (playerSummary?.name ?? "")
        : `${selectedEntry.name} · ${statusLabel(selectedEntry.status)}`
      : undefined;

  const sideGap = sheetOpen ? metrics.sheetWidth : safe.right;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${playerSummary?.name ?? "No player country"}, open campaign`}
        onPress={() => openSheet({ kind: "campaign" }, null)}
        style={[styles.pill, { top: safe.top + metrics.gutter, left: safe.left + metrics.gutter }]}
      >
        <CountryFlag polityId={playerSummary?.id ?? null} tag={playerSummary?.tag ?? ""} size="topBar" />
        <Text style={styles.pillName} numberOfLines={1}>
          {playerEntry?.commonName ?? playerSummary?.name ?? "No player country"}
        </Text>
      </Pressable>

      <View
        pointerEvents="none"
        style={[
          styles.topCentre,
          {
            top: safe.top + metrics.gutter,
            left: safe.left + metrics.gutter + PILL_MAX_WIDTH + spacing.sm,
            right: sideGap + metrics.gutter,
          },
        ]}
      >
        <View style={styles.readout}>
          <Text style={styles.readoutDate} numberOfLines={1}>
            {snapshot === null ? "—" : displayDate(snapshot.date)}
          </Text>
          {sheetOpen && metrics.compact ? null : (
            <>
              <Readout label="Treasury" value={formatRusd(playerSummary?.treasuryCashRUSD ?? 0)} />
              <Readout label="People" value={formatPeople(playerSummary?.population ?? 0)} />
              <Readout
                label="Hardship"
                value={`${((playerSummary?.hardshipPopulationShare ?? 0) * 100).toFixed(1)}%`}
                tone={(playerSummary?.hardshipPopulationShare ?? 0) > 0.1 ? "negative" : "default"}
              />
            </>
          )}
        </View>
        {error !== null ? null : statusVisible && saveStatus !== null ? (
          <DispatchStrip medium="Status" dateLabel={null} headline={saveStatus} />
        ) : shownDispatch === null ? null : (
          <DispatchStrip
            medium={getActiveTheme().dispatchMedium}
            dateLabel={shownDispatch.dateLabel}
            headline={shownDispatch.headline}
          />
        )}
      </View>

      <View
        style={[
          styles.rail,
          { left: safe.left + metrics.gutter, top: safe.top + metrics.gutter + TOUCH_TARGET + spacing.sm },
        ]}
      >
        {DOMAINS.map((entry) => (
          <DomainButton
            key={entry.id}
            domain={entry}
            active={domain?.id === entry.id}
            onPress={() => {
              if (domain?.id === entry.id) closeSheet();
              else openSheet({ kind: "screen", screen: entry.items[0]?.id ?? "overview" }, null);
            }}
          />
        ))}
      </View>

      <LensSwitch
        lenses={lenses}
        layer={layer}
        highlightMarketId={highlightMarketId}
        marketNames={snapshot?.markets ?? WORLD_CATALOG.markets}
        bottom={safe.bottom + metrics.gutter}
        left={safe.left + metrics.gutter}
        width={metrics.lensPanelWidth}
        onLayer={(next) => {
          setLayer(next);
          if (next === "markets") setHighlightMarketId(null);
        }}
        onClearHighlight={() => setHighlightMarketId(null)}
        onZoom={(direction) => stage.map()?.zoom(direction)}
        onReset={() => stage.map()?.resetView()}
      />

      <TimeControl
        running={running}
        speed={speedDaysPerSecond}
        achieved={achievedDaysPerSecond}
        disabled={controlsDisabled}
        right={sideGap + metrics.gutter}
        bottom={safe.bottom + metrics.gutter}
        playSize={metrics.playButton}
        onStart={start}
        onPause={pause}
        onStep={step}
        onSpeed={(value) => setSpeed(value as SpeedDaysPerSecond)}
      />

      {error === null ? null : (
        <Pressable
          onPress={clearError}
          style={[styles.banner, { left: safe.left + 72, right: sideGap + metrics.gutter, top: safe.top + 58 }]}
          accessibilityRole="button"
        >
          <Text style={styles.bannerText} numberOfLines={3}>
            {error}
          </Text>
          <Text style={styles.bannerDismiss}>Dismiss</Text>
        </Pressable>
      )}

      <SideSheet
        open={sheetOpen}
        width={metrics.sheetWidth}
        safeRight={safe.right}
        safeTop={safe.top}
        safeBottom={safe.bottom}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        onClose={closeSheet}
        tabs={
          domain === null || domain.items.length < 2 || sheet?.kind !== "screen" ? null : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabStrip}
              contentContainerStyle={styles.tabs}
            >
              {domain.items.map((item) => {
                const active = sheet.screen === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    // RNW does not forward `selected` for buttons; aria-current
                    // communicates the active screen to assistive technology.
                    {...(Platform.OS === "web" ? ({ "aria-current": active ? "page" : undefined } as object) : {})}
                    onPress={() => setSheet({ kind: "screen", screen: item.id })}
                    style={[styles.tab, active ? styles.tabActive : null]}
                  >
                    <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )
        }
      >
        {sheet === null ? null : sheet.kind === "campaign" ? (
          <CampaignPanel
            playerName={playerSummary?.name ?? "No player country"}
            playerHistoricalName={playerEntry?.name ?? ""}
            status={playerEntry?.status ?? null}
            capital={playerEntry?.capital.name ?? ""}
            scenarioLine={
              snapshot === null
                ? "Connecting to the simulation…"
                : `${snapshot.date.label} · ${snapshot.scenarioId} · ${connection}`
            }
            netResult={latestClosedResult(snapshot)}
            speedLine={`${formatSpeed(speedDaysPerSecond)}${running && achievedDaysPerSecond > 0 ? ` · ~${achievedDaysPerSecond.toFixed(1)}/s` : ""} · best effort`}
            saveStatus={saveStatus}
            dispatches={dispatches}
            medium={getActiveTheme().dispatchMedium}
            canSave={snapshot !== null}
            controlsDisabled={controlsDisabled}
            saveLabel="Save"
            onSave={saveGame}
            onLoad={loadGame}
            onRestart={restartWorker}
          />
        ) : sheet.kind === "place" ? (
          <>
            {selectedProvinceId === null ? null : (
              <ProvincePanel
                province={PROVINCE_BY_ID.get(selectedProvinceId) ?? null}
                ownership={
                  snapshot?.provinces.find((entry) => entry.provinceId === selectedProvinceId) ?? null
                }
                economy={
                  (snapshot === null ? undefined : provinceEconomyRows(snapshot).find((entry) => entry.id === selectedProvinceId)) ?? null
                }
              />
            )}
            <SelectedPolityPanel
              entry={selectedEntry}
              summary={selectedSummary}
              territory={selectedTerritory}
              market={selectedMarket}
              isPlayer={selectedEntry !== null && selectedEntry.tag === playerSummary?.tag}
              onOpenOverview={() => setSheet({ kind: "screen", screen: "overview" })}
              onShowMarket={showMarket}
            />
          </>
        ) : focusedCountryId === null ? null : detailReady ? (
          <Screen
            tab={sheet.screen}
            countryId={focusedCountryId}
            onSelectCountry={(countryId) => {
              const tag = snapshot?.countrySummaries.find((candidate) => candidate.id === countryId)?.tag;
              if (tag !== undefined) setSelectedTag(tag);
            }}
            onShowMarket={showMarket}
          />
        ) : (
          <Panel title="Loading country detail" subtitle="The worker is preparing this country's full record.">
            <Text style={styles.panelEmpty}>
              Country summaries are already available; the selected country's detailed record arrives in
              the next snapshot.
            </Text>
          </Panel>
        )}
      </SideSheet>
    </View>
  );
}

const PILL_MAX_WIDTH = 196;
const READOUT_WIDTH = 330;
const LENS_BUTTON_WIDTH = 112;
const TIME_CONTROL_WIDTH = 176;

/** Where the controls sit, in map-surface pixels, so labels stay out from under them. */
function hudBoxes(
  width: number,
  height: number,
  metrics: ShellMetrics,
  safe: { readonly top: number; readonly left: number; readonly right: number; readonly bottom: number },
  surfaceOffset: number,
  sheetOpen: boolean,
): readonly ReservedBox[] {
  const top = safe.top + metrics.gutter;
  const left = safe.left + metrics.gutter + surfaceOffset;
  const right = (sheetOpen ? metrics.sheetWidth : safe.right) + metrics.gutter;
  const bottom = safe.bottom + metrics.gutter;
  const usableWidth = width - (sheetOpen ? metrics.sheetWidth : 0);
  return [
    { left, top, width: PILL_MAX_WIDTH, height: TOUCH_TARGET },
    { left: usableWidth / 2 - READOUT_WIDTH / 2 + surfaceOffset, top, width: READOUT_WIDTH, height: TOUCH_TARGET },
    { left, top: height - bottom - TOUCH_TARGET, width: LENS_BUTTON_WIDTH, height: TOUCH_TARGET },
    {
      left: width - right - TIME_CONTROL_WIDTH + surfaceOffset,
      top: height - bottom - metrics.playButton,
      width: TIME_CONTROL_WIDTH,
      height: metrics.playButton,
    },
  ];
}

function Readout({
  label,
  value,
  tone = "default",
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "default" | "negative";
}) {
  return (
    <View style={styles.readoutItem}>
      <Text style={styles.readoutLabel}>{label}</Text>
      <Text style={[styles.readoutValue, tone === "negative" ? { color: colors.red } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** The news strip. It has no touch target, so it can never block the map. */
function DispatchStrip({
  medium,
  dateLabel,
  headline,
}: {
  readonly medium: string;
  readonly dateLabel: string | null;
  readonly headline: string;
}) {
  return (
    <View style={styles.dispatch}>
      <Text style={styles.dispatchMedium} numberOfLines={1}>
        {medium}
        {dateLabel === null ? "" : ` · ${dateLabel}`}
      </Text>
      <Text style={styles.dispatchHeadline} numberOfLines={2}>
        {headline}
      </Text>
    </View>
  );
}

function DomainButton({
  domain,
  active,
  onPress,
}: {
  readonly domain: NavDomain;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={domain.label}
      accessibilityState={{ selected: active }}
      {...(Platform.OS === "web" ? ({ "aria-pressed": active } as object) : {})}
      onPress={onPress}
      style={({ pressed }) => [styles.round, active ? styles.roundActive : null, pressed ? styles.pressed : null]}
    >
      <Icon name={DOMAIN_ICON[domain.id]} color={active ? colors.accentText : colors.textStrong} />
    </Pressable>
  );
}

function LensSwitch({
  lenses,
  layer,
  highlightMarketId,
  marketNames,
  bottom,
  left,
  width,
  onLayer,
  onClearHighlight,
  onZoom,
  onReset,
}: {
  readonly lenses: readonly { readonly id: MapModeId; readonly label: string }[];
  readonly layer: MapModeId;
  readonly highlightMarketId: number | null;
  readonly marketNames: readonly { readonly id: number; readonly name: string }[];
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly onLayer: (layer: MapModeId) => void;
  readonly onClearHighlight: () => void;
  readonly onZoom: (direction: "in" | "out") => void;
  readonly onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mode = MAP_MODES[layer];
  const legend = useMemo(() => {
    const context: Pick<MapDataContext, "entryByTag" | "marketNames" | "highlightMarketId"> = {
      entryByTag: ENTRY_BY_TAG,
      marketNames: new Map(marketNames.map((market) => [market.id, market.name] as const)),
      highlightMarketId,
    };
    return mode.legend(context as MapDataContext);
  }, [highlightMarketId, marketNames, mode]);
  return (
    <View style={[styles.lensWrap, { left, bottom }]} pointerEvents="box-none">
      {open ? (
        <View style={[styles.lensPanel, { width }]}>
          <View style={styles.lensChoices}>
            {lenses.map((lens) => (
              <Chip key={lens.id} label={lens.label} active={layer === lens.id} onPress={() => onLayer(lens.id)} />
            ))}
          </View>
          {highlightMarketId === null ? null : (
            <Chip label="Clear market highlight" active={false} onPress={onClearHighlight} />
          )}
          <View style={styles.legend}>
            {legend.map((entry) => (
              <View key={entry.label} style={styles.legendRow}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: rgbToCss(entry.color) },
                    entry.hatched === true ? styles.swatchHatched : null,
                  ]}
                />
                <Text style={styles.legendText} numberOfLines={1}>
                  {entry.label}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.lensChoices}>
            <MapControl icon="plus" label="Zoom in" onPress={() => onZoom("in")} />
            <MapControl icon="minus" label="Zoom out" onPress={() => onZoom("out")} />
            <MapControl icon="home" label="Reset map view" onPress={onReset} />
          </View>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Map lens: ${mode.label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.lensButton, pressed ? styles.pressed : null]}
      >
        <Icon name="lens" size={20} color={colors.accentStrong} />
        <Text style={styles.lensLabel}>{mode.label}</Text>
      </Pressable>
    </View>
  );
}

function MapControl({
  icon,
  label,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.round, styles.roundFlat, pressed ? styles.pressed : null]}
    >
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

function TimeControl({
  running,
  speed,
  achieved,
  disabled,
  right,
  bottom,
  playSize,
  onStart,
  onPause,
  onStep,
  onSpeed,
}: {
  readonly running: boolean;
  readonly speed: number;
  readonly achieved: number;
  readonly disabled: boolean;
  readonly right: number;
  readonly bottom: number;
  readonly playSize: number;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onStep: () => void;
  readonly onSpeed: (speed: number) => void;
}) {
  const [speedsOpen, setSpeedsOpen] = useState(false);
  return (
    <View style={[styles.timeWrap, { right, bottom }]} pointerEvents="box-none">
      {speedsOpen ? (
        <View style={styles.speedPanel}>
          {SPEED_VALUES.map((value) => (
            <Chip
              key={value}
              label={`${String(value)}×`}
              active={speed === value}
              disabled={disabled}
              onPress={() => {
                onSpeed(value);
                setSpeedsOpen(false);
              }}
            />
          ))}
          <Text style={styles.speedMeta}>
            {formatSpeed(speed)}
            {running && achieved > 0 ? ` · ~${achieved.toFixed(1)}/s` : ""} · best effort
          </Text>
        </View>
      ) : null}
      <View style={styles.timeRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Advance one day"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onStep}
          style={({ pressed }) => [styles.round, disabled ? styles.dimmed : null, pressed ? styles.pressed : null]}
        >
          <Icon name="step" size={20} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Speed ${String(speed)} times, change speed`}
          accessibilityState={{ expanded: speedsOpen }}
          onPress={() => setSpeedsOpen((value) => !value)}
          style={({ pressed }) => [styles.round, pressed ? styles.pressed : null]}
        >
          <Text style={styles.speedLabel}>{`${String(speed)}×`}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={running ? "Pause" : "Play"}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={running ? onPause : onStart}
          style={({ pressed }) => [
            styles.play,
            { width: playSize, height: playSize },
            disabled ? styles.dimmed : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Icon name={running ? "pause" : "play"} size={playSize * 0.5} color={colors.accentText} />
        </Pressable>
      </View>
    </View>
  );
}

/** Slides over the map from the right. Everything except the map lives in one. */
function SideSheet({
  open,
  width,
  safeRight,
  safeTop,
  safeBottom,
  title,
  subtitle,
  tabs,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly width: number;
  readonly safeRight: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly tabs: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const total = width + safeRight;
  const slide = useRef(new Animated.Value(total)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 0 : total,
      duration: SHEET_MS,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [open, slide, total]);
  return (
    <Animated.View
      pointerEvents={open ? "auto" : "none"}
      style={[
        styles.sheet,
        { width: total, paddingRight: safeRight, paddingTop: safeTop, transform: [{ translateX: slide }] },
      ]}
    >
      <View style={styles.sheetHeader}>
        <View style={styles.sheetTitleWrap}>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle === undefined ? null : (
            <Text style={styles.sheetSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          onPress={onClose}
          style={({ pressed }) => [styles.sheetClose, pressed ? styles.pressed : null]}
        >
          <Icon name="close" size={20} />
        </Pressable>
      </View>
      {tabs}
      <ScrollView
        testID="side-sheet"
        style={styles.sheetBody}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: safeBottom + spacing.lg }]}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

function CampaignPanel({
  playerName,
  playerHistoricalName,
  status,
  capital,
  scenarioLine,
  netResult,
  speedLine,
  saveStatus,
  dispatches,
  medium,
  canSave,
  controlsDisabled,
  saveLabel,
  onSave,
  onLoad,
  onRestart,
}: {
  readonly playerName: string;
  readonly playerHistoricalName: string;
  readonly status: string | null;
  readonly capital: string;
  readonly scenarioLine: string;
  readonly netResult: number | null;
  readonly speedLine: string;
  readonly saveStatus: string | null;
  readonly dispatches: readonly Dispatch[];
  readonly medium: string;
  readonly canSave: boolean;
  readonly controlsDisabled: boolean;
  readonly saveLabel: string;
  readonly onSave: () => void;
  readonly onLoad: () => void;
  readonly onRestart: () => void;
}) {
  return (
    <>
      <Panel
        title={playerName}
        subtitle={[
          status === null ? "" : statusLabel(status),
          capital,
          playerHistoricalName !== "" && playerHistoricalName !== playerName ? playerHistoricalName : "",
        ]
          .filter((part) => part !== "")
          .join(" · ")}
      >
        {netResult === null ? null : (
          <Metric
            label="Last month"
            value={`${netResult >= 0 ? "+" : ""}${formatRusd(netResult)} RUSD`}
            tone={netResult >= 0 ? "positive" : "negative"}
          />
        )}
        <Text style={styles.panelEmpty}>{scenarioLine}</Text>
        <Text style={styles.panelEmpty}>{speedLine}</Text>
        {saveStatus === null ? null : <Text style={styles.statusText}>{saveStatus}</Text>}
      </Panel>
      <Panel title="Saved game">
        <View style={styles.panelActions}>
          <Button label={saveLabel} tone="primary" onPress={onSave} disabled={!canSave || controlsDisabled} />
          <Button label="Load last save" onPress={onLoad} disabled={controlsDisabled} />
        </View>
        <Divider />
        <Button label="Restart worker" tone="danger" onPress={onRestart} />
      </Panel>
      <Panel title={`${medium} log`} subtitle="Reports of this session, newest first.">
        {dispatches.length === 0 ? (
          <Text style={styles.panelEmpty}>Nothing has been reported yet.</Text>
        ) : (
          [...dispatches].reverse().map((dispatch) => (
            <StatRow key={dispatch.id} label={dispatch.headline} value="" detail={dispatch.dateLabel} mono={false} />
          ))
        )}
      </Panel>
    </>
  );
}

function Screen({
  tab,
  countryId,
  onSelectCountry,
  onShowMarket,
}: {
  readonly tab: ScreenId;
  readonly countryId: number;
  readonly onSelectCountry: (countryId: number) => void;
  readonly onShowMarket: (marketId: number) => void;
}) {
  const { snapshot } = useSimulation();
  if (snapshot === null) return null;
  switch (tab) {
    case "overview":
      return <CountryScreen snapshot={snapshot} countryId={countryId} />;
    case "budget":
      return <BudgetScreen snapshot={snapshot} countryId={countryId} />;
    case "markets":
      return (
        <MarketsScreen snapshot={snapshot} countryId={countryId} onShowOnMap={onShowMarket} />
      );
    case "industry":
      return <IndustryScreen snapshot={snapshot} countryId={countryId} />;
    case "construction":
      return <ConstructionScreen snapshot={snapshot} countryId={countryId} />;
    case "trade":
      return <TradeScreen snapshot={snapshot} countryId={countryId} />;
    case "labor":
      return <LaborScreen snapshot={snapshot} countryId={countryId} />;
    case "money":
      return <MoneyScreen snapshot={snapshot} countryId={countryId} />;
    case "population":
      return (
        <PopulationScreen
          snapshot={snapshot}
          countryId={countryId}
          onSelectCountry={onSelectCountry}
        />
      );
    case "politics":
      return <PoliticsScreen snapshot={snapshot} countryId={countryId} />;
    case "technology":
      return <TechnologyScreen snapshot={snapshot} countryId={countryId} />;
    case "war":
      return <WarScreen snapshot={snapshot} countryId={countryId} />;
    case "ledger":
      return <LedgerScreen snapshot={snapshot} countryId={countryId} />;
    default:
      return null;
  }
}

/** Live totals of the provinces a catalogue entry stands for. */
interface TerritoryAggregate {
  readonly provinceCount: number;
  readonly population: number;
  readonly buildingCount: number;
  readonly infrastructure: number;
  readonly marketId: number | null;
  readonly controllerCountryId: number | null;
}

function territoryAggregate(snapshot: SimulationSnapshot, entry: WorldCatalogEntry): TerritoryAggregate | null {
  const provinces = provinceEconomyRows(snapshot).filter((province) =>
    entry.kind === "state"
      ? province.countryId === entry.id && province.territoryTag === null
      : province.territoryTag === entry.tag,
  );
  if (provinces.length === 0) return null;
  let population = 0;
  let buildingCount = 0;
  let infrastructureWeighted = 0;
  for (const province of provinces) {
    population += province.population;
    buildingCount += province.buildingCount;
    infrastructureWeighted += province.infrastructure * province.population;
  }
  return {
    provinceCount: provinces.length,
    population,
    buildingCount,
    infrastructure: population > 0 ? infrastructureWeighted / population : (provinces[0]?.infrastructure ?? 0),
    marketId: provinces.find((province) => province.marketId !== null)?.marketId ?? null,
    controllerCountryId: provinces.find((province) => province.controllerCountryId !== null)?.controllerCountryId ?? null,
  };
}

const percentText = (value: number): string => `${(value * 100).toFixed(0)}%`;

/** P2 live population and economy of one province (D-118). */
function ProvinceEconomySection({ economy }: { readonly economy: ProvinceEconomySnapshot }) {
  const { snapshot } = useSimulation();
  const professionName = new Map((snapshot?.professions ?? []).map((profession) => [String(profession.id), profession.name]));
  const marketName = snapshot?.markets.find((market) => market.id === economy.marketId)?.name ?? null;
  const occupations = Object.entries(economy.populationByProfession)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([id, count]) => `${professionName.get(id) ?? `profession ${id}`} ${formatPeople(count)}`)
    .join(" · ");
  return (
    <>
      <Divider />
      <StatRow
        label="Population"
        value={formatPeople(economy.population)}
        detail={occupations.length === 0 ? "No inhabitants recorded" : occupations}
      />
      <StatRow
        label="Towns and literacy"
        value={`${percentText(economy.urbanShare)} urban`}
        detail={`Adult literacy ${percentText(economy.literacy)} · urban share from HYDE 3.3 (1900)`}
      />
      <StatRow
        label="Land"
        value={`${formatPeople(economy.arableLandHa)} ha cropland`}
        detail={`${formatPeople(economy.pastureHa)} ha pasture and rangeland (HYDE 3.3)`}
      />
      <StatRow
        label="Work"
        value={`${formatPeople(economy.employedWorkers)} employed here`}
        detail={`${String(economy.buildingCount)} building${economy.buildingCount === 1 ? "" : "s"}, ${String(economy.buildingLevels)} capacity level${economy.buildingLevels === 1 ? "" : "s"}`}
      />
      <StatRow
        label="Unrest"
        value={percentText(economy.unrest)}
        detail={`Infrastructure ${percentText(economy.infrastructure)}`}
      />
      {marketName === null ? null : (
        <StatRow label="Market" value={marketName} detail="The customs territory this province trades in" />
      )}
    </>
  );
}

function ProvincePanel({
  province,
  ownership,
  economy,
}: {
  readonly province: ProvinceCatalogEntry | null;
  readonly ownership: ProvinceOwnershipSnapshot | null;
  readonly economy: ProvinceEconomySnapshot | null;
}) {
  if (province === null) return null;
  const tagOf = (polityId: number): string =>
    ENTRY_BY_ID.get(polityId)?.tag ?? FUTURE_BY_ID.get(polityId)?.tag ?? `polity ${String(polityId)}`;
  const owner = ownership === null ? province.initialOwnerTag : tagOf(ownership.ownerPolityId);
  const controllerTag =
    ownership === null || ownership.controllerPolityId === ownership.ownerPolityId
      ? null
      : tagOf(ownership.controllerPolityId);
  return (
    <Panel
      title={province.displayName}
      subtitle={`Province ${String(province.id)} · ${province.confidence} confidence`}
    >
      <StatRow label="Current owner" value={owner} detail="Legal territorial ownership" />
      <StatRow
        label="1900 owner"
        value={province.initialOwnerTag}
        detail="Historical owner on 1 January 1900"
      />
      <StatRow
        label="Administrative affiliation"
        value=""
        detail={
          province.historicalGrouping === null
            ? province.historicalAdminAffiliation
            : `${province.historicalAdminAffiliation} · ${province.historicalGrouping}`
        }
      />
      <StatRow
        label="Special status"
        value={(ownership?.specialStatus ?? province.initialSpecialStatus).replace(/-/g, " ")}
      />
      {controllerTag === null ? null : (
        <StatRow
          label="Effective control"
          value={controllerTag}
          detail="Occupation changes control, not legal ownership"
        />
      )}
      {ownership === null || ownership.claimantPolityIds.length === 0 ? null : (
        <StatRow
          label="Claims"
          value={ownership.claimantPolityIds.join(", ")}
          detail="Recorded claims do not imply ownership"
        />
      )}
      {economy === null ? null : <ProvinceEconomySection economy={economy} />}
      <Text style={styles.provinceNote}>{province.notes}</Text>
    </Panel>
  );
}

function SelectedPolityPanel({
  entry,
  summary,
  territory,
  market,
  isPlayer,
  onOpenOverview,
  onShowMarket,
}: {
  readonly entry: WorldCatalogEntry | null;
  readonly summary: CountrySummarySnapshot | null;
  readonly territory: TerritoryAggregate | null;
  readonly market:
    | {
        readonly id: number;
        readonly name: string;
        readonly description: string;
        readonly kind: string;
        readonly memberCountryIds?: readonly number[];
      }
    | null;
  readonly isPlayer: boolean;
  readonly onOpenOverview: () => void;
  readonly onShowMarket: (marketId: number) => void;
}) {
  const { snapshot } = useSimulation();
  if (entry === null) {
    return (
      <Panel title="Inspect" subtitle="Tap a country or territory on the map.">
        <Text style={styles.panelEmpty}>
          Political fill shows sovereignty. The control lens shows military occupation without
          changing ownership; the market lens shows economic membership.
        </Text>
      </Panel>
    );
  }
  const sovereign =
    entry.sovereignTag === null
      ? null
      : (WORLD_CATALOG.entries.find((candidate) => candidate.tag === entry.sovereignTag) ?? null);
  const controllerTag =
    snapshot === null || territory === null || territory.controllerCountryId === null
      ? null
      : (snapshot.countrySummaries.find((country) => country.id === territory.controllerCountryId)?.tag ?? null);
  const playerTag =
    snapshot === null
      ? null
      : (snapshot.countrySummaries.find((country) => country.id === snapshot.playerCountryId)?.tag ?? null);
  const countrySummary = summary;

  return (
    <Panel
      title={entry.name}
      subtitle={`${statusLabel(entry.status)} · ${entry.continent}`}
      actions={<Badge label={entry.tag} tone="muted" />}
    >
      <View style={styles.polityHeader}>
        <CountryFlag
          polityId={entry.id}
          tag={entry.tag}
          monogramTag={entry.sovereignTag ?? entry.tag}
          size="detail"
        />
        <View style={styles.polityHeaderText}>
          <Text style={styles.polityCommon}>{entry.commonName}</Text>
          <Text style={styles.polityMeta}>Capital {entry.capital.name}</Text>
          {entry.kind === "territory" ? (
            <Text style={styles.polityMeta}>
              Territory of {sovereign?.name ?? entry.sovereignTag ?? "a sovereign power"}
            </Text>
          ) : null}
          {controllerTag === null ? null : (
            <Text style={styles.occupied}>Military control: {controllerTag}</Text>
          )}
        </View>
      </View>

      <Divider />
      {territory === null ? null : (
        <>
          <Text style={type.label}>{entry.kind === "state" ? "Home provinces" : "Territory provinces"}</Text>
          <Text style={styles.provinceLine}>
            {String(territory.provinceCount)} province{territory.provinceCount === 1 ? "" : "s"} ·{" "}
            {formatPeople(territory.population)} people · {territory.buildingCount} building
            {territory.buildingCount === 1 ? "" : "s"} · infrastructure{" "}
            {(territory.infrastructure * 100).toFixed(0)}%
          </Text>
        </>
      )}
      {countrySummary === null ? null : (
        <>
          <Text style={[type.label, styles.spacedLabel]}>
            {entry.kind === "territory" ? "Sovereign country indicators" : "Country indicators"}
          </Text>
          <Text style={styles.provinceLine}>
            Population {formatPeople(countrySummary.population)} · Treasury{" "}
            {formatRusd(countrySummary.treasuryCashRUSD)} RUSD · Hardship{" "}
            {(countrySummary.hardshipPopulationShare * 100).toFixed(1)}%
          </Text>
          <Text style={styles.provinceLine}>
            Employed {formatPeople(countrySummary.employedWorkers)} · Literacy{" "}
            {(countrySummary.literacy * 100).toFixed(0)}% · Unrest{" "}
            {(countrySummary.militancy * 100).toFixed(0)}%
          </Text>
        </>
      )}

      {market === null ? null : (
        <>
          <Text style={[type.label, styles.spacedLabel]}>Market</Text>
          <Text style={styles.marketName}>{market.name}</Text>
          <Text style={styles.marketBody}>{market.description}</Text>
          <Text style={styles.marketMeta}>
            {market.kind === "imperial"
              ? "Imperial customs area"
              : market.kind === "shared"
                ? "Shared multi-country market"
                : "National market"}{" "}
            · {market.memberCountryIds?.length ?? 0} member countr
            {(market.memberCountryIds?.length ?? 0) === 1 ? "y" : "ies"}
          </Text>
          <Button
            label="Highlight member territories"
            size="sm"
            onPress={() => onShowMarket(market.id)}
          />
        </>
      )}

      <View style={styles.panelActions}>
        <Button
          label={isPlayer ? "Open overview" : "Inspect country"}
          tone="primary"
          onPress={onOpenOverview}
          disabled={!entry.selectable}
        />
        {entry.selectable ? (
          <Badge label={entry.tag === playerTag ? "Player country" : "Simulated with AI"} tone="accent" />
        ) : (
          <Badge label="Dependent territory" tone="muted" />
        )}
      </View>
    </Panel>
  );
}

const styles = themedSheet(() => ({
  root: { ...StyleSheet.absoluteFill },
  pressed: { opacity: 0.72 },
  dimmed: { opacity: 0.42 },
  provinceNote: { ...type.tiny, marginTop: spacing.sm },
  pill: {
    position: "absolute",
    height: TOUCH_TARGET,
    maxWidth: PILL_MAX_WIDTH,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.chrome,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillName: { ...type.section, flexShrink: 1 },
  topCentre: { position: "absolute", alignItems: "center", gap: spacing.xs },
  readout: {
    height: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.chrome,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  readoutDate: { ...type.section, letterSpacing: 0.4 },
  readoutItem: { alignItems: "flex-start" },
  readoutLabel: { ...type.label, fontSize: 11, lineHeight: 13, letterSpacing: 0.5 },
  readoutValue: { ...type.number, lineHeight: 17 },
  dispatch: {
    maxWidth: 420,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.chrome,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  dispatchMedium: { ...type.eyebrow },
  dispatchHeadline: { ...type.section, fontFamily: fonts.serif },
  rail: { position: "absolute", gap: 6 },
  round: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.chrome,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  roundFlat: { backgroundColor: colors.surfaceRaised },
  roundActive: { backgroundColor: colors.accent, borderColor: colors.accentStrong },
  lensWrap: { position: "absolute", alignItems: "flex-start", gap: spacing.xs },
  lensButton: {
    height: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.chrome,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lensLabel: { ...type.small, color: colors.textStrong, fontFamily: fonts.sansMedium },
  lensPanel: {
    padding: spacing.sm,
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.chrome,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lensChoices: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  legend: { gap: 3, paddingVertical: spacing.xs },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { ...type.tiny, color: colors.muted, flexShrink: 1 },
  swatch: { width: 11, height: 11, borderRadius: 2 },
  swatchHatched: { opacity: 0.7, borderWidth: 1, borderColor: colors.text, borderStyle: "dashed" },
  timeWrap: { position: "absolute", alignItems: "flex-end", gap: spacing.xs },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  play: {
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  speedLabel: { ...type.number, fontFamily: fonts.sansSemiBold },
  speedPanel: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.xs,
    padding: spacing.xs,
    maxWidth: 260,
    borderRadius: radii.lg,
    backgroundColor: colors.chrome,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  speedMeta: { ...type.tiny, paddingHorizontal: spacing.xs },
  banner: {
    position: "absolute",
    backgroundColor: colors.chrome,
    borderLeftColor: colors.red,
    borderLeftWidth: 2,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  bannerText: { ...type.small, color: colors.text, flex: 1, paddingVertical: spacing.xs },
  bannerDismiss: { ...type.small, color: colors.red, fontFamily: fonts.sansSemiBold },
  statusText: { ...type.tiny, color: colors.accentStrong, marginTop: spacing.xs },
  sheet: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.chrome,
    borderLeftWidth: 1,
    borderLeftColor: colors.accentLine,
  },
  sheetHeader: {
    minHeight: TOUCH_TARGET + spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  sheetTitleWrap: { flex: 1, minWidth: 0 },
  sheetTitle: { ...type.title },
  sheetSubtitle: { ...type.tiny },
  sheetClose: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  tabStrip: { flexGrow: 0, flexShrink: 0 },
  tabs: { paddingHorizontal: spacing.sm, gap: spacing.xxs },
  tab: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.accent },
  tabLabel: { ...type.small, fontFamily: fonts.sansMedium },
  tabLabelActive: { color: colors.textStrong },
  sheetBody: { flex: 1 },
  sheetContent: { padding: spacing.sm },
  panelEmpty: { ...type.small },
  polityHeader: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  polityHeaderText: { flex: 1 },
  polityCommon: { ...type.section },
  polityMeta: { ...type.tiny, marginTop: 1 },
  occupied: { ...type.tiny, color: colors.red, marginTop: 2 },
  provinceLine: { ...type.small, marginTop: 2 },
  spacedLabel: { marginTop: spacing.sm },
  marketName: { ...type.body, color: colors.textStrong, fontFamily: fonts.sansSemiBold, marginTop: 1 },
  marketBody: { ...type.small, marginTop: 2 },
  marketMeta: { ...type.tiny, marginVertical: 3 },
  panelActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
}));
