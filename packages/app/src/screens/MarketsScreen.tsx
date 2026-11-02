import { StyleSheet, Text, View } from "react-native";

import {
  essentialGoodIds,
  formatPrice,
  formatQuantity,
  marketForCountry,
  sortedMarkets,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Badge, Button, DataRow, Disclosure, Divider, Headline, Notice, Panel } from "../components/ui";
import { colors, radii, spacing, themedSheet, type } from "../theme";

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
  const country = snapshot.countrySummaries.find((entry) => entry.id === countryId) ?? null;
  const homeMarket = marketForCountry(snapshot, country);
  const essential = new Set(essentialGoodIds(snapshot));
  const countryById = new Map(snapshot.countrySummaries.map((entry) => [entry.id, entry]));
  const regionById = new Map(snapshot.regions.map((entry) => [entry.id, entry]));
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
          detail={`${String(homeMarket.prices.length)} goods · ${String(homeMarket.memberCountryIds.length)} member ${homeMarket.memberCountryIds.length === 1 ? "country" : "countries"}`}
        />
      )}
      <Panel
        title="Markets and prices"
        subtitle={`${country?.name ?? "No country selected"} · each market clears once per economic day. Prices are bounded daily adjustments, not equilibrium prices.`}
      >
        <Notice title="What a market is here">
          A market is an economic grouping with its own prices, stock and clearing. It is not the
          same as sovereignty: a dependent territory keeps its own region and market membership,
          and an occupied region keeps its sovereign owner and customs administration. Market names
          below are authored from their actual membership; the numeric id is diagnostic only.
        </Notice>
        {markets.map((market) => {
          const members = market.memberCountryIds
            .map((id) => countryById.get(id))
            .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
          const regions = market.regionIds
            .map((id) => regionById.get(id))
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
                  <Text style={type.label}>Regions</Text>
                  <Text style={styles.factValue}>{regions.length}</Text>
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

              <Text style={[type.label, styles.memberLabel]}>Regions included</Text>
              <Text style={styles.regionText}>
                {regions
                  .map((region) => `${region.name}${region.meta === null ? "" : " (territory)"}`)
                  .join(" · ")}
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
              {market.prices.map((price) => (
                <DataRow
                  key={price.goodId}
                  title={`${price.goodName}${essential.has(price.goodId) ? " · essential" : ""}`}
                  value={`${formatPrice(price.priceRUSD)} RUSD`}
                  valueTone="accent"
                  note={`per ${price.unitLabel} · stock ${formatQuantity(price.stockQuantity)} · capacity/day ${formatQuantity(price.dailyProductionCapacity)}`}
                />
              ))}
            </View>
          );
          return isHome ? (
            card
          ) : (
            <Disclosure key={market.id} title={`${market.name} · ${String(members.length)}`}>
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
  regionText: { ...type.tiny, lineHeight: 15 },
  marketActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  actionHint: { ...type.tiny, flexShrink: 1 },
}));
