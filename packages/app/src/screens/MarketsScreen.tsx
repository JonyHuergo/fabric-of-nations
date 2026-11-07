import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  essentialGoodIds,
  formatQuantity,
  marketForCountry,
  sortedMarkets,
  type CountrySnapshot,
  type MarketSnapshot,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Badge, Button, Chip, DataRow, Disclosure, Divider, Headline, Notice, Panel } from "../components/ui";
import { TOUCH_TARGET, colors, radii, spacing, themedSheet, type } from "../theme";
import { provinceEconomyRows } from "@century/sim-worker";
import { useMoney } from "../format/useMoney";
import { GOOD_GROUPS, goodsByGroup, makersOf, matchesSearch } from "../format/goods";
import { useSimulation } from "../worker/SimulationProvider";

/** One market's goods: grouped, searchable; goods not traded there fold away (plan section 11.1). */
function MarketGoods({
  snapshot,
  market,
  country,
  query,
  groupKey,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly market: MarketSnapshot;
  readonly country: CountrySnapshot | null;
  readonly query: string;
  readonly groupKey: string;
}) {
  const money = useMoney();
  const [explained, setExplained] = useState<number | null>(null);
  if (market.detail === "summary") {
    return <Text style={styles.loading}>Loading prices for this market...</Text>;
  }
  const essential = new Set(essentialGoodIds(snapshot));
  const rowByGood = new Map(market.prices.map((row) => [row.goodId, row]));
  const groups = goodsByGroup(snapshot.goods).filter((group) => groupKey === "all" || group.key === groupKey);
  const searching = query.trim().length > 0;
  const shown = groups
    .map((group) => ({ ...group, goods: group.goods.filter((good) => matchesSearch(good, query)) }))
    .filter((group) => group.goods.length > 0);
  if (shown.length === 0) return <Text style={styles.loading}>No good matches this search.</Text>;
  return (
    <View>
      {shown.map((group) => {
        const traded = group.goods.filter((good) => rowByGood.has(good.id));
        const absent = group.goods.filter((good) => !rowByGood.has(good.id));
        return (
          <Disclosure
            // Remounted when a search starts or ends, so matches open (initiallyOpen).
            key={`${group.key}:${searching ? "search" : "browse"}:${groupKey}`}
            title={`${group.label} · ${String(traded.length)} traded`}
            initiallyOpen={searching || groupKey !== "all"}
          >
            {traded.map((good) => {
              const row = rowByGood.get(good.id)!;
              return (
                <DataRow
                  key={good.id}
                  title={`${good.name}${essential.has(good.id) ? " · essential" : ""}`}
                  value={money.price(row.priceRUSD)}
                  valueTone="accent"
                  note={`per ${good.unitLabel} · stock ${formatQuantity(row.stockQuantity)} · capacity/day ${formatQuantity(row.dailyProductionCapacity)}`}
                />
              );
            })}
            {absent.length === 0 ? null : (
              <Disclosure
                key={searching ? "search" : "browse"}
                title={`${String(absent.length)} not traded here`}
                initiallyOpen={searching}
              >
                {absent.map((good) => (
                  <Pressable
                    key={good.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${good.name}: what makes it`}
                    onPress={() => setExplained(explained === good.id ? null : good.id)}
                    style={styles.absentRow}
                  >
                    <Text style={styles.absentName}>{good.name}</Text>
                    {explained === good.id ? (
                      <Text style={styles.absentNote}>{makersOf(snapshot, country, good.id)}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </Disclosure>
            )}
          </Disclosure>
        );
      })}
    </View>
  );
}

function marketKindLabel(kind: string): string {
  switch (kind) {
    case "imperial":
      return "Imperial customs area";
    case "shared":
      return "Shared multi-country market";
    case "national":
      return "National market";
    default:
      return "Trade area";
  }
}

export function MarketsScreen({
  snapshot,
  countryId,
  onShowOnMap,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
  readonly onShowOnMap?: (marketId: number) => void;
}) {
  const { setMarketFocus } = useSimulation();
  const [query, setQuery] = useState("");
  const [groupKey, setGroupKey] = useState("all");
  const country = snapshot.countrySummaries.find((entry) => entry.id === countryId) ?? null;
  const countryDetail = snapshot.countries.find((entry) => entry.id === countryId) ?? null;
  const homeMarket = marketForCountry(snapshot, country);
  const countryById = new Map(snapshot.countrySummaries.map((entry) => [entry.id, entry]));
  const provinceById = new Map(provinceEconomyRows(snapshot).map((entry) => [entry.id, entry]));
  const currencyByCountry = new Map(
    snapshot.currencies.map((currency) => [currency.issuerCountryId, currency]),
  );
  // The market the player trades in comes first; the world follows, folded.
  const markets = [...sortedMarkets(snapshot)].sort(
    (left, right) => Number(right.id === homeMarket?.id) - Number(left.id === homeMarket?.id),
  );

  return (
    <View>
      {homeMarket === null ? null : (
        <Headline
          label="Home market"
          value={homeMarket.name}
          detail={`${String(homeMarket.prices.length)} of ${String(snapshot.goods.length)} goods traded · ${String(homeMarket.memberCountryIds.length)} member ${homeMarket.memberCountryIds.length === 1 ? "country" : "countries"}`}
        />
      )}
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search goods"
          placeholderTextColor={colors.faint}
          style={styles.search}
          accessibilityLabel="Search goods"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" active={groupKey === "all"} onPress={() => setGroupKey("all")} />
        {GOOD_GROUPS.map((group) => (
          <Chip key={group.key} label={group.label} active={groupKey === group.key} onPress={() => setGroupKey(group.key)} />
        ))}
      </ScrollView>
      <Panel
        title="Markets and prices"
        subtitle={`${country?.name ?? "No country selected"} · each market clears once per economic day. Prices are bounded daily adjustments, not equilibrium prices.`}
      >
        <Notice title="What a market is here">
          A market is a customs territory: one pool of prices and stock under one tariff
          authority. Every state has its own unless it was in a recorded 1900 customs union;
          colonies and protectorates trade inside their sovereign's territory. Occupation changes
          neither. When a province changes hands by treaty, it joins its new owner's market.
        </Notice>
        {markets.map((market) => {
          const members = market.memberCountryIds
            .map((id) => countryById.get(id))
            .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
          const provinces = market.provinceIds
            .map((id) => provinceById.get(id))
            .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
          const customs =
            market.customsCountryId === null
              ? null
              : (countryById.get(market.customsCountryId) ?? null);
          const currencies = [
            ...new Set(
              members
                .map((member) => {
                  const currency = currencyByCountry.get(member.id);
                  return currency === undefined ? null : `${currency.name} (${currency.key})`;
                })
                .filter((value): value is string => value !== null),
            ),
          ];
          const isHome = homeMarket !== null && homeMarket.id === market.id;
          const card = (
            <View key={market.id} style={[styles.market, isHome ? styles.marketHome : null]}>
              <View style={styles.marketHeader}>
                <View style={styles.marketTitleWrap}>
                  <Text style={styles.marketTitle}>{market.name}</Text>
                  <Text style={styles.marketKind}>
                    {marketKindLabel(market.kind)}
                    {isHome ? " · home market" : ""} · market id {market.id} (diagnostic)
                  </Text>
                </View>
                <Badge label={`${members.length} ${members.length === 1 ? "country" : "countries"}`} tone="accent" />
              </View>
              <Text style={styles.description}>{market.description}</Text>

              <View style={styles.factRow}>
                <View style={styles.fact}>
                  <Text style={type.label}>Customs administration</Text>
                  <Text style={styles.factValue}>
                    {customs === null ? "None" : `${customs.name} (${customs.tag})`}
                  </Text>
                </View>
                <View style={styles.fact}>
                  <Text style={type.label}>Currency context</Text>
                  <Text style={styles.factValue}>
                    {currencies.length === 0
                      ? "No issued currency recorded"
                      : currencies.length <= 2
                        ? currencies.join(" · ")
                        : `${String(currencies.length)} national currencies in use`}
                  </Text>
                </View>
                <View style={styles.fact}>
                  <Text style={type.label}>Provinces</Text>
                  <Text style={styles.factValue}>{provinces.length}</Text>
                </View>
              </View>

              <Text style={[type.label, styles.memberLabel]}>Member countries</Text>
              <View style={styles.memberWrap}>
                {members.map((member) => (
                  <View key={member.id} style={styles.memberChip}>
                    <View style={[styles.memberDot, { backgroundColor: colors.accent }]} />
                    <Text style={styles.memberText}>
                      {member.name} ({member.tag})
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={[type.label, styles.memberLabel]}>Territory</Text>
              <Text style={styles.provinceText}>
                {(() => {
                  const territories = [
                    ...new Set(
                      provinces
                        .map((province) => province.territoryTag)
                        .filter((tag): tag is string => tag !== null),
                    ),
                  ]
                    .map((tag) => snapshot.territories.find((entry) => entry.polityTag === tag)?.historicalName ?? tag)
                    .sort();
                  const home = provinces.filter((province) => province.territoryTag === null).length;
                  return territories.length === 0
                    ? `${String(home)} home provinces`
                    : `${String(home)} home provinces · dependent territories: ${territories.join(" · ")}`;
                })()}
              </Text>

              {onShowOnMap === undefined ? null : (
                <View style={styles.marketActions}>
                  <Button
                    label="Highlight members on the map"
                    size="sm"
                    onPress={() => onShowOnMap(market.id)}
                  />
                  <Text style={styles.actionHint}>
                    Opens the market layer; member territories are coloured by membership.
                  </Text>
                </View>
              )}

              <Divider />
              <MarketGoods snapshot={snapshot} market={market} country={countryDetail} query={query} groupKey={groupKey} />
            </View>
          );
          // Opening another market asks the worker for its prices (protocol 22).
          return isHome ? (
            card
          ) : (
            <Disclosure
              key={market.id}
              title={`${market.name} · ${String(members.length)}`}
              onToggle={(open) => setMarketFocus(open ? market.id : null)}
            >
              {card}
            </Disclosure>
          );
        })}
      </Panel>
    </View>
  );
}

const styles = themedSheet(() => ({
  market: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    gap: 4,
  },
  marketHome: { borderColor: colors.accent },
  marketHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  marketTitleWrap: { flexShrink: 1 },
  marketTitle: { ...type.title, fontSize: 17 },
  marketKind: { ...type.tiny, marginTop: 1 },
  description: { ...type.small, lineHeight: 17 },
  factRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: 4 },
  fact: { minWidth: 170, flexGrow: 1 },
  factValue: { ...type.body, color: colors.textStrong, marginTop: 1 },
  memberLabel: { marginTop: spacing.sm },
  memberWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  memberDot: { width: 5, height: 5, borderRadius: 3 },
  memberText: { ...type.small, color: colors.text },
  provinceText: { ...type.tiny, lineHeight: 15 },
  marketActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  actionHint: { ...type.tiny, flexShrink: 1 },
  searchWrap: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  search: { ...type.body, minHeight: TOUCH_TARGET, color: colors.text },
  chips: { gap: spacing.xs, paddingBottom: spacing.sm },
  loading: { ...type.small, color: colors.muted, paddingVertical: spacing.sm },
  absentRow: { minHeight: TOUCH_TARGET, justifyContent: "center", paddingVertical: 4 },
  absentName: { ...type.body, color: colors.text },
  absentNote: { ...type.tiny, lineHeight: 15, marginTop: 2 },
}));
