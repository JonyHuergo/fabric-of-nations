import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { colors, radii, spacing, type } from "../theme";
import type { WorldCatalogData, WorldCatalogEntry, WorldMapData } from "../worldCatalogTypes";
import { WorldMap, statusLabel } from "../components/WorldMap";
import { CountryFlag } from "../components/CountryFlag";
import { Badge, Button, Chip, Divider, Panel } from "../components/ui";

const CONTINENTS = ["All", "Europe", "Asia", "Africa", "Americas", "Oceania"] as const;
type Continent = (typeof CONTINENTS)[number];
const STATUS_FILTERS = ["Any status", "Independent", "Semi-sovereign", "Dependencies"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const SEMI_STATUSES = new Set(["personal-union", "autonomous-vassal", "dominion"]);
const DEPENDENCY_STATUSES = new Set([
  "colony",
  "protectorate",
  "occupation",
  "autonomous-province",
  "dependency",
  "self-governing-colony",
]);

function formatPopulation(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} bn`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} k`;
  return String(value);
}

function marketFor(entry: WorldCatalogEntry, catalog: WorldCatalogData) {
  const key =
    entry.market ??
    catalog.entries.find((candidate) => candidate.tag === entry.sovereignTag)?.market ??
    null;
  if (key === null) return null;
  return catalog.markets.find((market) => market.key === key) ?? null;
}

function statusTone(entry: WorldCatalogEntry): "positive" | "accent" | "muted" | "danger" {
  switch (entry.status) {
    case "independent":
      return "positive";
    case "dominion":
    case "personal-union":
    case "autonomous-vassal":
      return "accent";
    case "occupation":
      return "danger";
    default:
      return "muted";
  }
}

export function CountrySelectionScreen({
  catalog,
  map,
  onBack,
  onConfirm,
  creating,
}: {
  readonly catalog: WorldCatalogData;
  readonly map: WorldMapData;
  readonly onBack: () => void;
  readonly onConfirm: (countryId: number) => void;
  readonly creating: boolean;
}) {
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  const medium = width >= 760 && width < 1080;
  const [selectedTag, setSelectedTag] = useState<string>("USA");
  const [query, setQuery] = useState("");
  const [continent, setContinent] = useState<Continent>("All");
  const [playableOnly, setPlayableOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Any status");
  const [mobilePane, setMobilePane] = useState<"map" | "list">("map");

  const selected = useMemo(
    () => catalog.entries.find((entry) => entry.tag === selectedTag) ?? null,
    [catalog.entries, selectedTag],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.entries
      .filter((entry) => (playableOnly ? entry.selectable : true))
      .filter((entry) => continent === "All" || entry.continent === continent)
      .filter((entry) => {
        if (statusFilter === "Any status") return true;
        if (statusFilter === "Independent") return entry.status === "independent";
        if (statusFilter === "Semi-sovereign") return SEMI_STATUSES.has(entry.status);
        return DEPENDENCY_STATUSES.has(entry.status);
      })
      .filter((entry) => {
        if (needle === "") return true;
        return (
          entry.name.toLowerCase().includes(needle) ||
          entry.commonName.toLowerCase().includes(needle) ||
          entry.capital.name.toLowerCase().includes(needle) ||
          entry.tag.toLowerCase().includes(needle)
        );
      })
      .sort((left, right) => {
        if (left.selectable !== right.selectable) return left.selectable ? -1 : 1;
        if (left.population1900 !== right.population1900) {
          return right.population1900 - left.population1900;
        }
        return left.name.localeCompare(right.name);
      });
  }, [catalog.entries, continent, playableOnly, query, statusFilter]);

  const playableCount = catalog.entries.filter((entry) => entry.selectable).length;
  const selectedMarket = selected === null ? null : marketFor(selected, catalog);
  const sovereign =
    selected?.sovereignTag === null || selected === null
      ? null
      : (catalog.entries.find((entry) => entry.tag === selected.sovereignTag) ?? null);

  const list = (
    <View style={styles.listColumn}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search country, capital or tag…"
          placeholderTextColor={colors.faint}
          style={styles.search}
          accessibilityLabel="Search historical countries"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {CONTINENTS.map((entry) => (
          <Chip
            key={entry}
            label={entry}
            active={continent === entry}
            onPress={() => setContinent(entry)}
          />
        ))}
      </ScrollView>
      <View style={styles.toggleRow}>
        {STATUS_FILTERS.map((entry) => (
          <Chip
            key={entry}
            label={entry}
            active={statusFilter === entry}
            onPress={() => {
              setStatusFilter(entry);
              if (entry === "Dependencies") setPlayableOnly(false);
              if (entry === "Independent" || entry === "Semi-sovereign") setPlayableOnly(true);
            }}
          />
        ))}
      </View>
      <View style={styles.toggleRow}>
        <Chip
          label={`Playable only · ${String(playableCount)}`}
          active={playableOnly}
          onPress={() => setPlayableOnly(true)}
        />
        <Chip
          label="All territories"
          active={!playableOnly}
          onPress={() => setPlayableOnly(false)}
        />
      </View>
      <Text style={styles.listHint}>
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        {playableOnly ? " · dependencies hidden" : " · selectable states and dependent territories"}
      </Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.map((entry) => {
          const active = entry.tag === selectedTag;
          return (
            <Pressable
              key={entry.id}
              style={[styles.listRow, active ? styles.listRowActive : null, entry.selectable ? null : styles.listRowMuted]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSelectedTag(entry.tag)}
            >
              <CountryFlag
                polityId={entry.id}
                tag={entry.tag}
                monogramTag={entry.sovereignTag ?? entry.tag}
                size="picker"
              />
              <View style={styles.listText}>
                <Text style={[styles.listName, active ? styles.listNameActive : null]} numberOfLines={1}>
                  {entry.name}
                </Text>
                <Text style={styles.listMeta} numberOfLines={1}>
                  {entry.kind === "territory" ? "Territory · " : ""}
                  {entry.capital.name} · {formatPopulation(entry.population1900)}
                </Text>
              </View>
              {entry.selectable ? (
                <Badge label={entry.status === "independent" ? "State" : "Playable"} tone="accent" />
              ) : (
                <Badge label="Inspect" tone="muted" />
              )}
            </Pressable>
          );
        })}
        {filtered.length === 0 ? (
          <Text style={styles.empty}>No polity matches this search and filter.</Text>
        ) : null}
      </ScrollView>
    </View>
  );

  const detail = (
    <View style={styles.detailColumn}>
      {selected === null ? (
        <Panel title="Selection">
          <Text style={styles.empty}>Choose a country on the map or in the list.</Text>
        </Panel>
      ) : (
        <Panel
          title={selected.name}
          subtitle={`${statusLabel(selected.status)} · capital ${selected.capital.name}`}
          actions={<Badge label={selected.status} tone={statusTone(selected)} />}
        >
          <View style={styles.detailHeader}>
            <CountryFlag
              polityId={selected.id}
              tag={selected.tag}
              monogramTag={selected.sovereignTag ?? selected.tag}
              size="detail"
            />
            <View style={styles.detailHeaderText}>
              <Text style={styles.detailCommon}>{selected.commonName}</Text>
              <Text style={styles.detailTag}>
                {selected.tag} · {selected.continent}
              </Text>
            </View>
          </View>
          <Text style={styles.description}>{selected.description}</Text>

          <View style={styles.factGrid}>
            <Fact
              label={selected.kind === "state" ? "Home population 1900" : "Population 1900"}
              value={formatPopulation(selected.population1900)}
              detail={
                selected.kind === "state"
                  ? `${String(selected.confidence)} confidence · excludes dependent territories`
                  : `${String(selected.confidence)} confidence`
              }
            />
            <Fact label="Political status" value={statusLabel(selected.status)} />
            <Fact label="Capital" value={selected.capital.name} />
            <Fact
              label="Sovereign power"
              value={sovereign === null ? "Itself" : sovereign.name}
            />
            <Fact label="Market" value={selectedMarket?.name ?? "Not in a market"} />
            <Fact
              label="Playable"
              value={selected.selectable ? "Yes" : "No"}
              detail={selected.selectable ? undefined : "Dependent territory"}
            />
          </View>

          {selected.notes === "" ? null : <Text style={styles.notes}>{selected.notes}</Text>}

          {selectedMarket === null ? null : (
            <>
              <Divider />
              <Text style={styles.marketLabel}>Market membership</Text>
              <Text style={styles.marketBody}>{selectedMarket.description}</Text>
              <Text style={styles.marketMeta}>
                {selectedMarket.kind === "imperial"
                  ? "Imperial customs area"
                  : selectedMarket.kind === "shared"
                    ? "Shared multi-country market"
                    : "National market"}{" "}
                · customs administration:{" "}
                {catalog.entries.find((entry) => entry.tag === selectedMarket.customsTag)?.commonName ??
                  selectedMarket.customsTag}
              </Text>
            </>
          )}

          <Divider />
          {selected.selectable ? (
            <Button
              label={creating ? "Creating campaign…" : `Play as ${selected.commonName}`}
              tone="primary"
              size="lg"
              disabled={creating}
              onPress={() => onConfirm(selected.id)}
            />
          ) : (
            <View style={styles.blocked}>
              <Badge label="Not selectable" tone="danger" />
              <Text style={styles.blockedText}>
                This territory was a {selected.status.replaceAll("-", " ")} in 1900 and is
                administered by {sovereign?.name ?? "its sovereign power"}. Its population,
                production and market membership are simulated, but it cannot be the player
                country. Select the sovereign state to play its government.
              </Text>
            </View>
          )}
          <Text style={styles.sourceNote}>
            Population is a rounded historical estimate; occupation, literacy and all economic
            starting values are documented approximations. See Sources and licensing.
          </Text>
        </Panel>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Button label="← Back" tone="ghost" size="sm" onPress={onBack} />
          <View>
            <Text style={styles.kicker}>NEW CAMPAIGN · 1 JANUARY 1900</Text>
            <Text style={styles.title}>Choose a country</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerMeta}>{playableCount} playable states</Text>
          <Text style={styles.headerMeta}>
            {String(catalog.entries.filter((entry) => entry.kind === "territory").length)} dependent
            territories shown
          </Text>
        </View>
      </View>

      {narrow ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.narrowContent}>
          <View style={styles.paneToggle}>
            <Chip label="Map" active={mobilePane === "map"} onPress={() => setMobilePane("map")} />
            <Chip label="List" active={mobilePane === "list"} onPress={() => setMobilePane("list")} />
          </View>
          {mobilePane === "map" ? (
            <WorldMap
              catalog={catalog}
              map={map}
              snapshot={null}
              selectedTag={selectedTag}
              onSelect={setSelectedTag}
              height={300}
              showLegend
            />
          ) : (
            list
          )}
          {detail}
        </ScrollView>
      ) : (
        <View style={styles.columns}>
          {list}
          <View style={styles.mapColumn}>
            <WorldMap
              catalog={catalog}
              map={map}
              snapshot={null}
              selectedTag={selectedTag}
              onSelect={setSelectedTag}
              height={medium ? 480 : 620}
              showLegend
            />
            <Text style={styles.mapHint}>
              Click a territory to select it. Small states appear as markers at world zoom; use the
              list or zoom controls to reach them.
            </Text>
          </View>
          {medium ? null : detail}
        </View>
      )}
      {medium ? <View style={styles.mediumDetail}>{detail}</View> : null}
    </View>
  );
}

function Fact({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string | undefined;
}) {
  return (
    <View style={styles.fact}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
      {detail === undefined ? null : <Text style={styles.factDetail}>{detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
  headerRight: { alignItems: "flex-end", gap: 1 },
  kicker: { ...type.label, color: colors.accentStrong },
  title: { ...type.title, fontSize: 24 },
  headerMeta: { ...type.tiny },
  columns: { flex: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  listColumn: {
    width: 320,
    borderRightColor: colors.border,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  searchWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  search: { ...type.body, paddingVertical: spacing.sm, color: colors.text },
  chipRow: { gap: spacing.xs, paddingVertical: 2 },
  toggleRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  listHint: { ...type.tiny },
  list: { flex: 1 },
  listContent: { gap: 2, paddingBottom: spacing.xl },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  listRowActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
  listRowMuted: { opacity: 0.75 },
  listText: { flex: 1 },
  listName: { ...type.body, color: colors.text },
  listNameActive: { color: colors.accentStrong, fontWeight: "700" },
  listMeta: { ...type.tiny },
  mapColumn: { flex: 1, gap: 4 },
  mapHint: { ...type.tiny, paddingHorizontal: 2 },
  detailColumn: { width: 360 },
  mediumDetail: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  narrowContent: { padding: spacing.sm, gap: spacing.sm },
  paneToggle: { flexDirection: "row", gap: spacing.xs },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  detailHeaderText: { flex: 1 },
  detailCommon: { ...type.title, fontSize: 18, color: colors.textStrong },
  detailTag: { ...type.tiny, marginTop: 1 },
  description: { ...type.body, marginTop: spacing.sm },
  factGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm },
  fact: { width: "50%", paddingVertical: 5, paddingRight: spacing.sm },
  factValue: { ...type.body, color: colors.textStrong, marginTop: 1 },
  factDetail: { ...type.tiny },
  notes: { ...type.small, color: colors.muted, marginTop: spacing.sm, lineHeight: 17 },
  marketLabel: { ...type.label, marginBottom: 3 },
  marketBody: { ...type.small, lineHeight: 17 },
  marketMeta: { ...type.tiny, marginTop: 3 },
  blocked: {
    gap: 4,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.red,
    borderRadius: radii.sm,
    backgroundColor: "rgba(197,122,107,0.08)",
  },
  blockedText: { ...type.small, lineHeight: 16 },
  sourceNote: { ...type.tiny, marginTop: spacing.sm, lineHeight: 14 },
  empty: { ...type.body, color: colors.muted, paddingVertical: spacing.sm },
  scroll: { flex: 1 },
});
