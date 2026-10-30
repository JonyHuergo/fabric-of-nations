import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import {
  SPEED_VALUES,
  formatSpeed,
  type CountrySummarySnapshot,
  type RegionSnapshot,
  type SpeedDaysPerSecond,
} from "@century/sim-worker";

import { WORLD_CATALOG } from "../generated/worldCatalog";
import { WORLD_MAP_1900 } from "../generated/worldMap1900";
import { colors, radii, spacing, type } from "../theme";
import type { WorldCatalogEntry } from "../worldCatalogTypes";
import { CountryFlag } from "../components/CountryFlag";
import { statusLabel, WorldMap, type MapLayer } from "../components/WorldMap";
import { Badge, Button, Chip, Divider, Metric, Panel } from "../components/ui";
import { useSimulation } from "../worker/SimulationProvider";
import { BudgetScreen } from "./BudgetScreen";
import { ConstructionScreen } from "./ConstructionScreen";
import { CountryScreen } from "./CountryScreen";
import { IndustryScreen } from "./IndustryScreen";
import { LaborScreen } from "./LaborScreen";
import { LedgerScreen } from "./LedgerScreen";
import { MarketsScreen } from "./MarketsScreen";
import { MoneyScreen } from "./MoneyScreen";
import { PoliticsScreen } from "./PoliticsScreen";
import { PopulationScreen } from "./PopulationScreen";
import { TechnologyScreen } from "./TechnologyScreen";
import { TradeScreen } from "./TradeScreen";
import { WarScreen } from "./WarScreen";

type TabId =
  | "world"
  | "overview"
  | "budget"
  | "markets"
  | "industry"
  | "construction"
  | "trade"
  | "labor"
  | "money"
  | "population"
  | "politics"
  | "technology"
  | "war"
  | "ledger";

interface NavGroup {
  readonly title: string;
  readonly items: readonly { readonly id: TabId; readonly label: string; readonly glyph: string }[];
}

const NAV: readonly NavGroup[] = [
  {
    title: "Realm",
    items: [
      { id: "world", label: "World", glyph: "◍" },
      { id: "overview", label: "Overview", glyph: "▤" },
    ],
  },
  {
    title: "Economy",
    items: [
      { id: "budget", label: "Budget", glyph: "◫" },
      { id: "markets", label: "Markets", glyph: "⇄" },
      { id: "industry", label: "Industry", glyph: "▦" },
      { id: "construction", label: "Construction", glyph: "⌂" },
      { id: "trade", label: "Trade", glyph: "⛴" },
      { id: "labor", label: "Labor & health", glyph: "⚒" },
      { id: "money", label: "Money", glyph: "◉" },
    ],
  },
  {
    title: "Society",
    items: [
      { id: "population", label: "Population", glyph: "☰" },
      { id: "politics", label: "Politics", glyph: "⚖" },
      { id: "technology", label: "Technology", glyph: "✦" },
    ],
  },
  {
    title: "World",
    items: [
      { id: "war", label: "War & diplomacy", glyph: "⚔" },
      { id: "ledger", label: "Ledger", glyph: "☰" },
    ],
  },
];

const TAB_LABEL = new Map<TabId, string>();
for (const group of NAV) for (const item of group.items) TAB_LABEL.set(item.id, item.label);

function formatSusd(value: number): string {
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
    savedCampaign,
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
  const { width } = useWindowDimensions();
  const narrow = width < 900;
  const [tab, setTab] = useState<TabId>("world");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [layer, setLayer] = useState<MapLayer>("political");
  const [highlightMarketId, setHighlightMarketId] = useState<number | null>(null);

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

  useEffect(() => {
    if (selectedTag === null && playerSummary !== null) setSelectedTag(playerSummary.tag);
  }, [playerSummary, selectedTag]);

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
  const selectedRegion = useMemo(
    () =>
      snapshot === null || selectedEntry === null
        ? null
        : (snapshot.regions.find((region) => region.id === selectedEntry.id) ?? null),
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
          selectedRegion !== null
            ? market.id === selectedRegion.marketId
            : market.memberCountryIds.includes(selectedEntry.id),
        ) ??
        WORLD_CATALOG.markets.find((market) => market.key === selectedEntry.market) ??
        null);

  const controlsDisabled = busy || connection !== "ready";
  const headerSubtitle =
    snapshot === null
      ? "Connecting to the simulation…"
      : `${snapshot.date.label} · ${snapshot.scenarioId} · ${connection}`;

  const nav = (
    <View style={narrow ? styles.mobileNav : styles.rail}>
      <ScrollView
        horizontal={narrow}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={narrow ? styles.mobileNavContent : styles.railContent}
      >
        {NAV.map((group) => (
          <View key={group.title} style={narrow ? styles.mobileNavGroup : styles.railGroup}>
            {narrow ? null : <Text style={styles.railGroupTitle}>{group.title}</Text>}
            {group.items.map((item) => {
              const active = tab === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  // RNW does not forward `selected` for buttons; aria-current
                  // communicates the active screen to assistive technology.
                  {...(Platform.OS === "web" ? ({ "aria-current": active ? "page" : undefined } as object) : {})}
                  onPress={() => setTab(item.id)}
                  style={[narrow ? styles.mobileNavItem : styles.railItem, active ? styles.navItemActive : null]}
                >
                  <Text style={[styles.navGlyph, active ? styles.navGlyphActive : null]}>{item.glyph}</Text>
                  <Text style={[styles.navLabel, active ? styles.navLabelActive : null]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.root}>
      <TopBar
        playerName={playerSummary?.name ?? "No player country"}
        playerHistoricalName={playerEntry?.name ?? ""}
        playerTag={playerSummary?.tag ?? ""}
        playerId={playerSummary?.id ?? null}
        status={playerEntry?.status ?? null}
        capital={playerEntry?.capital.name ?? ""}
        subtitle={headerSubtitle}
        dateLabel={snapshot?.date.label ?? "—"}
        running={running}
        speed={speedDaysPerSecond}
        achieved={achievedDaysPerSecond}
        controlsDisabled={controlsDisabled}
        treasury={playerSummary?.treasuryCashSUSD ?? 0}
        population={playerSummary?.population ?? 0}
        hardship={playerSummary?.hardshipPopulationShare ?? 0}
        netResult={playerSummary?.latestNetFiscalResultSUSD ?? null}
        onStart={start}
        onPause={pause}
        onStep={step}
        onSpeed={(speedValue) => setSpeed(speedValue as SpeedDaysPerSecond)}
        onSave={saveGame}
        onLoad={loadGame}
        onRestart={restartWorker}
        canSave={snapshot !== null}
        saveLabel={savedCampaign === null ? "Save" : "Save / replace"}
      />

      {error === null ? null : (
        <Pressable onPress={clearError} style={styles.banner} accessibilityRole="button">
          <Text style={styles.bannerText}>{error}</Text>
          <Text style={styles.bannerDismiss}>Dismiss</Text>
        </Pressable>
      )}
      {saveStatus === null ? null : (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{saveStatus}</Text>
        </View>
      )}

      <View style={[styles.shell, narrow ? styles.shellNarrow : null]}>
        {nav}
        <View style={styles.main}>
          {tab === "world" ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.worldContent}>
              <View style={[styles.worldGrid, narrow ? styles.worldGridNarrow : null]}>
                <View style={styles.mapColumn}>
                  <View style={styles.mapToolbar}>
                    <Text style={styles.mapTitle}>World map</Text>
                    <View style={styles.layerChips}>
                      <Chip label="Political" active={layer === "political"} onPress={() => setLayer("political")} />
                      <Chip label="Control" active={layer === "control"} onPress={() => setLayer("control")} />
                      <Chip
                        label="Markets"
                        active={layer === "markets"}
                        onPress={() => {
                          setLayer("markets");
                          setHighlightMarketId(null);
                        }}
                      />
                      {highlightMarketId === null ? null : (
                        <Chip
                          label="Clear market highlight"
                          active={false}
                          onPress={() => setHighlightMarketId(null)}
                        />
                      )}
                    </View>
                  </View>
                  <WorldMap
                    catalog={WORLD_CATALOG}
                    map={WORLD_MAP_1900}
                    snapshot={snapshot}
                    selectedTag={selectedTag}
                    onSelect={setSelectedTag}
                    layer={layer}
                    playerTag={playerSummary?.tag ?? null}
                    height={narrow ? 320 : 600}
                    highlightMarketId={highlightMarketId}
                  />
                </View>
                <View style={narrow ? styles.contextColumnNarrow : styles.contextColumn}>
                  <SelectedPolityPanel
                    entry={selectedEntry}
                    summary={selectedSummary}
                    region={selectedRegion}
                    market={selectedMarket}
                    isPlayer={selectedEntry !== null && selectedEntry.tag === playerSummary?.tag}
                    onOpenOverview={() => setTab("overview")}
                    onShowMarket={(marketId) => {
                      setLayer("markets");
                      setHighlightMarketId(marketId);
                    }}
                  />
                </View>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.screenContent}>
              <View style={styles.screenHeader}>
                <Text style={styles.screenTitle}>{TAB_LABEL.get(tab) ?? ""}</Text>
                <Text style={styles.screenSubtitle}>
                  {selectedEntry === null
                    ? playerSummary?.name ?? ""
                    : `${selectedEntry.name} · ${statusLabel(selectedEntry.status)}`}
                </Text>
              </View>
              {focusedCountryId === null ? null : detailReady ? (
                <Screen
                  tab={tab}
                  countryId={focusedCountryId}
                  onSelectCountry={(countryId) => {
                    const tag = snapshot?.countrySummaries.find(
                      (candidate) => candidate.id === countryId,
                    )?.tag;
                    if (tag !== undefined) setSelectedTag(tag);
                  }}
                  onShowMarket={(marketId) => {
                    setLayer("markets");
                    setHighlightMarketId(marketId);
                    setTab("world");
                  }}
                />
              ) : (
                <Panel title="Loading country detail" subtitle="The worker is preparing this country's full record.">
                  <Text style={styles.panelEmpty}>
                    Country summaries are already available; the selected country's detailed
                    record arrives in the next snapshot.
                  </Text>
                </Panel>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

function Screen({
  tab,
  countryId,
  onSelectCountry,
  onShowMarket,
}: {
  readonly tab: TabId;
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

function SelectedPolityPanel({
  entry,
  summary,
  region,
  market,
  isPlayer,
  onOpenOverview,
  onShowMarket,
}: {
  readonly entry: WorldCatalogEntry | null;
  readonly summary: CountrySummarySnapshot | null;
  readonly region: RegionSnapshot | null;
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
      <Panel title="Inspect" subtitle="Select a country or territory on the map.">
        <Text style={styles.panelEmpty}>
          Political fill shows sovereignty. The control layer shows military occupation without
          changing ownership; the market layer shows economic membership.
        </Text>
      </Panel>
    );
  }
  const sovereign =
    entry.sovereignTag === null
      ? null
      : (WORLD_CATALOG.entries.find((candidate) => candidate.tag === entry.sovereignTag) ?? null);
  const controllerTag =
    snapshot === null || region === null || region.controllerCountryId === null
      ? null
      : (snapshot.countrySummaries.find((country) => country.id === region.controllerCountryId)?.tag ?? null);
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
      {region === null ? null : (
        <>
          <Text style={type.label}>Region simulation</Text>
          <Text style={styles.regionLine}>
            {formatPeople(region.population)} people · {region.buildingCount} building
            {region.buildingCount === 1 ? "" : "s"} · infrastructure{" "}
            {(region.infrastructure * 100).toFixed(0)}%
          </Text>
        </>
      )}
      {countrySummary === null ? null : (
        <>
          <Text style={[type.label, styles.spacedLabel]}>
            {entry.kind === "territory" ? "Sovereign country indicators" : "Country indicators"}
          </Text>
          <Text style={styles.regionLine}>
            Population {formatPeople(countrySummary.population)} · Treasury{" "}
            {formatSusd(countrySummary.treasuryCashSUSD)} SUSD · Hardship{" "}
            {(countrySummary.hardshipPopulationShare * 100).toFixed(1)}%
          </Text>
          <Text style={styles.regionLine}>
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

function TopBar({
  playerName,
  playerHistoricalName,
  playerTag,
  playerId,
  status,
  capital,
  subtitle,
  dateLabel,
  running,
  speed,
  achieved,
  controlsDisabled,
  treasury,
  population,
  hardship,
  netResult,
  onStart,
  onPause,
  onStep,
  onSpeed,
  onSave,
  onLoad,
  onRestart,
  canSave,
  saveLabel,
}: {
  readonly playerName: string;
  readonly playerHistoricalName: string;
  readonly playerTag: string;
  readonly playerId: number | null;
  readonly status: string | null;
  readonly capital: string;
  readonly subtitle: string;
  readonly dateLabel: string;
  readonly running: boolean;
  readonly speed: number;
  readonly achieved: number;
  readonly controlsDisabled: boolean;
  readonly treasury: number;
  readonly population: number;
  readonly hardship: number;
  readonly netResult: number | null;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onStep: () => void;
  readonly onSpeed: (speed: number) => void;
  readonly onSave: () => void;
  readonly onLoad: () => void;
  readonly onRestart: () => void;
  readonly canSave: boolean;
  readonly saveLabel: string;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topIdentity}>
        <CountryFlag polityId={playerId} tag={playerTag} size="topBar" />
        <View style={styles.topIdentityText}>
          <Text style={styles.playerName} numberOfLines={1}>
            {playerName}
          </Text>
          <Text style={styles.playerMeta} numberOfLines={1}>
            {status === null ? "" : `${statusLabel(status)} · `}
            {capital}
            {playerHistoricalName !== "" && playerHistoricalName !== playerName
              ? ` · ${playerHistoricalName}`
              : ""}
          </Text>
        </View>
      </View>

      <View style={styles.topMetrics}>
        <Metric label="Date" value={dateLabel} detail={subtitle} />
        <Metric label="Treasury" value={`${formatSusd(treasury)} SUSD`} />
        <Metric label="Population" value={formatPeople(population)} />
        <Metric
          label="Hardship"
          value={`${(hardship * 100).toFixed(1)}%`}
          tone={hardship > 0.1 ? "negative" : "default"}
        />
        {netResult === null ? null : (
          <Metric
            label="Last month"
            value={`${netResult >= 0 ? "+" : ""}${formatSusd(netResult)}`}
            tone={netResult >= 0 ? "positive" : "negative"}
          />
        )}
      </View>

      <View style={styles.topControls}>
        <View style={styles.speedRow}>
          <Button
            label={running ? "Pause" : "Play"}
            tone={running ? "default" : "primary"}
            size="sm"
            disabled={controlsDisabled}
            onPress={running ? onPause : onStart}
          />
          <Button label="+1 day" size="sm" disabled={controlsDisabled} onPress={onStep} />
          {SPEED_VALUES.map((value) => (
            <Chip
              key={value}
              label={`${String(value)}×`}
              active={speed === value}
              disabled={controlsDisabled}
              onPress={() => onSpeed(value)}
            />
          ))}
          <Text style={styles.speedMeta}>
            {formatSpeed(speed)}
            {running && achieved > 0 ? ` · ~${achieved.toFixed(1)}/s` : ""} · best effort
          </Text>
        </View>
        <View style={styles.saveRow}>
          <Button label={saveLabel} size="sm" onPress={onSave} disabled={!canSave || controlsDisabled} />
          <Button label="Load" size="sm" onPress={onLoad} disabled={controlsDisabled} />
          <Button label="Restart worker" size="sm" tone="danger" onPress={onRestart} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.backgroundAlt,
  },
  topIdentity: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 240 },
  topIdentityText: { flexShrink: 1 },
  playerName: { ...type.title, fontSize: 16, lineHeight: 20 },
  playerMeta: { ...type.tiny },
  topMetrics: { flexDirection: "row", flexWrap: "wrap", flex: 1, gap: spacing.sm },
  topControls: { gap: 4 },
  speedRow: { flexDirection: "row", alignItems: "center", gap: 3, flexWrap: "wrap" },
  saveRow: { flexDirection: "row", gap: 4, justifyContent: "flex-end" },
  speedMeta: { ...type.tiny, marginLeft: 4 },
  banner: {
    backgroundColor: "rgba(197,122,107,0.12)",
    borderBottomColor: colors.red,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  bannerText: { ...type.small, flex: 1 },
  bannerDismiss: { ...type.tiny, color: colors.red, fontWeight: "700" },
  statusBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusText: { ...type.tiny, color: colors.accentStrong },
  shell: { flex: 1, flexDirection: "row" },
  shellNarrow: { flexDirection: "column" },
  rail: {
    width: 158,
    borderRightColor: colors.border,
    borderRightWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.backgroundAlt,
  },
  railContent: { paddingVertical: spacing.sm, gap: spacing.sm },
  railGroup: { paddingHorizontal: 4 },
  railGroupTitle: {
    ...type.label,
    color: colors.faint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  railItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  mobileNav: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.backgroundAlt,
    maxHeight: 46,
  },
  mobileNavContent: { paddingHorizontal: spacing.xs, alignItems: "center" },
  mobileNavGroup: { flexDirection: "row" },
  mobileNavItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  navItemActive: { backgroundColor: colors.surfaceRaised },
  navGlyph: { color: colors.faint, fontSize: 12 },
  navGlyphActive: { color: colors.accentStrong },
  navLabel: { ...type.small, color: colors.muted },
  navLabelActive: { color: colors.accentStrong, fontWeight: "700" },
  main: { flex: 1 },
  scroll: { flex: 1 },
  screenContent: { padding: spacing.md, paddingBottom: spacing.xxl, maxWidth: 1180, width: "100%", alignSelf: "center" },
  screenHeader: { marginBottom: spacing.sm },
  screenTitle: { ...type.title },
  screenSubtitle: { ...type.small, marginTop: 1 },
  worldContent: { padding: spacing.sm, paddingBottom: spacing.xxl },
  worldGrid: { flexDirection: "row", gap: spacing.md },
  worldGridNarrow: { flexDirection: "column" },
  mapColumn: { flex: 1, gap: 4 },
  mapToolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  mapTitle: { ...type.section },
  layerChips: { flexDirection: "row", gap: 3 },
  contextColumn: { width: 360 },
  contextColumnNarrow: { width: "100%" },
  panelEmpty: { ...type.small },
  polityHeader: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  polityHeaderText: { flex: 1 },
  polityCommon: { ...type.title, fontSize: 17 },
  polityMeta: { ...type.tiny, marginTop: 1 },
  occupied: { ...type.tiny, color: colors.red, marginTop: 2 },
  regionLine: { ...type.small, marginTop: 2 },
  spacedLabel: { marginTop: spacing.sm },
  marketName: { ...type.body, color: colors.textStrong, fontWeight: "700", marginTop: 1 },
  marketBody: { ...type.small, marginTop: 2 },
  marketMeta: { ...type.tiny, marginVertical: 3 },
  panelActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
});
