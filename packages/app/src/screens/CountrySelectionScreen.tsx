import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { TOUCH_TARGET, colors, fonts, radii, spacing, themedSheet, type } from "../theme";
import type { WorldCatalogData, WorldCatalogEntry } from "../worldCatalogTypes";
import { statusLabel } from "../components/WorldMap";
import { CountryFlag } from "../components/CountryFlag";
import { EntryPanel, useEntryPanelWidth } from "../components/EntryPanel";
import { Badge, Button, Chip, Disclosure, Divider, Panel } from "../components/ui";
import { useMapView } from "../map/host/MapStage";

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
  onBack,
  onConfirm,
  creating,
}: {
  readonly catalog: WorldCatalogData;
  readonly onBack: () => void;
  readonly onConfirm: (countryId: number) => void;
  readonly creating: boolean;
}) {
  const panelWidth = useEntryPanelWidth();
  const [selectedTag, setSelectedTag] = useState<string>("USA");
  const [query, setQuery] = useState("");
  const [continent, setContinent] = useState<Continent>("All");
  const [playableOnly, setPlayableOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Any status");
  const [pane, setPane] = useState<"list" | "details">("list");
  useMapView(
    { selectedTag, insetRight: panelWidth },
    {
      onSelect: (tag) => {
        setSelectedTag(tag);
        setPane("details");
      },
    },
  );

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
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <Disclosure title={`Filter · ${String(filtered.length)} ${filtered.length === 1 ? "entry" : "entries"}`}>
          <View style={styles.toggleRow}>
            {CONTINENTS.map((entry) => (
              <Chip
                key={entry}
                label={entry}
                active={continent === entry}
                onPress={() => setContinent(entry)}
              />
            ))}
          </View>
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
            {playableOnly ? "Dependencies hidden" : "Selectable states and dependent territories"}
          </Text>
        </Disclosure>
        {filtered.map((entry) => {
          const active = entry.tag === selectedTag;
          return (
            <Pressable
              key={entry.id}
              style={[styles.listRow, active ? styles.listRowActive : null, entry.selectable ? null : styles.listRowMuted]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              {...(Platform.OS === "web" ? ({ "aria-pressed": active } as object) : {})}
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
    <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
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
          {selected.selectable ? null : (
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
    </ScrollView>
  );

  return (
    <EntryPanel
      kicker="New campaign · 1 January 1900"
      title="Choose a country"
      onBack={onBack}
      scroll={false}
      footer={
        selected === null ? undefined : (
          <View style={styles.footerRow}>
            <CountryFlag
              polityId={selected.id}
              tag={selected.tag}
              monogramTag={selected.sovereignTag ?? selected.tag}
              size="topBar"
            />
            <View style={styles.footerAction}>
              {selected.selectable ? (
                <Button
                  label={creating ? "Creating campaign…" : `Play as ${selected.commonName}`}
                  tone="primary"
                  size="lg"
                  disabled={creating}
                  onPress={() => onConfirm(selected.id)}
                />
              ) : (
                <Text style={styles.footerBlocked} numberOfLines={2}>
                  {selected.commonName} is a dependent territory and cannot be played.
                </Text>
              )}
            </View>
          </View>
        )
      }
    >
      <View style={styles.paneToggle}>
        <Chip label="List" active={pane === "list"} onPress={() => setPane("list")} />
        <Chip label="Details" active={pane === "details"} onPress={() => setPane("details")} />
        <Text style={styles.headerMeta} numberOfLines={2}>
          {playableCount} playable states ·{" "}
          {String(catalog.entries.filter((entry) => entry.kind === "territory").length)} dependent
          territories
        </Text>
      </View>
      {pane === "list" ? list : detail}
    </EntryPanel>
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

const styles = themedSheet(() => ({
  listColumn: { flex: 1, gap: spacing.xs, minHeight: 0 },
  searchWrap: {
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  search: { ...type.body, minHeight: TOUCH_TARGET, color: colors.text },
  toggleRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", paddingBottom: spacing.xs },
  listHint: { ...type.tiny },
  list: { flex: 1, minHeight: 0 },
  listContent: { gap: 2, paddingBottom: spacing.md },
  listRow: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  listRowActive: { backgroundColor: colors.surfaceHover },
  listRowMuted: { opacity: 0.75 },
  listText: { flex: 1, minWidth: 0 },
  listName: { ...type.section, fontSize: 15, lineHeight: 19, color: colors.text },
  listNameActive: { color: colors.accentStrong },
  listMeta: { ...type.tiny },
  detailContent: { paddingBottom: spacing.md },
  paneToggle: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  headerMeta: { ...type.tiny, flex: 1 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  detailHeaderText: { flex: 1 },
  detailCommon: { ...type.title, fontSize: 18 },
  detailTag: { ...type.tiny, marginTop: 1 },
  description: { ...type.body, marginTop: spacing.sm },
  factGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm },
  fact: { width: "50%", paddingVertical: 5, paddingRight: spacing.sm },
  factValue: { ...type.body, color: colors.textStrong, marginTop: 1 },
  factDetail: { ...type.tiny },
  notes: { ...type.small, marginTop: spacing.sm },
  marketLabel: { ...type.label, marginBottom: 3 },
  marketBody: { ...type.small },
  marketMeta: { ...type.tiny, marginTop: 3 },
  blocked: {
    gap: 4,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.redSoft,
  },
  blockedText: { ...type.small },
  sourceNote: { ...type.tiny, marginTop: spacing.sm },
  empty: { ...type.body, color: colors.muted, paddingVertical: spacing.sm },
  footerRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footerAction: { flex: 1 },
  footerBlocked: { ...type.small, fontFamily: fonts.sansMedium },
}));
