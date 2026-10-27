import { StyleSheet, Text, View } from "react-native";

import {
  essentialGoodIds,
  formatPrice,
  formatQuantity,
  marketForCountry,
  sortedMarkets,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Notice, Section } from "../components/ui";
import { colors, radii, spacing } from "../theme";

export function MarketsScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const country = snapshot.countries.find((entry) => entry.id === countryId) ?? null;
  const homeMarket = marketForCountry(snapshot, country);
  const essential = new Set(essentialGoodIds(snapshot));
  return (
    <View>
      <Section
        title="Markets and prices"
        subtitle={`${country?.name ?? "No country selected"} · each market clears once per economic day. Prices are bounded daily adjustments, not equilibrium prices.`}
      >
        <Notice title="Stocks, flows, and what is missing">
          Stock is current inventory. Capacity is estimated daily output from buildings in
          that market, not demand or sales. The snapshot does not retain historical prices,
          monthly demand, or a separate unemployment/shortage rate.
        </Notice>
        {sortedMarkets(snapshot).map((market) => (
          <View key={market.id} style={styles.market}>
            <View style={styles.marketHeader}>
              <Text style={styles.marketTitle}>{market.label}</Text>
              <Text style={styles.marketMeta}>
                {market.regionIds.length} regions
                {homeMarket !== null && homeMarket.id === market.id ? " · home" : ""}
              </Text>
            </View>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.goodCell]}>Good</Text>
              <Text style={[styles.headerCell, styles.numberCell]}>Price</Text>
              <Text style={[styles.headerCell, styles.numberCell]}>Stock</Text>
              <Text style={[styles.headerCell, styles.capacityCell]}>Capacity/day</Text>
            </View>
            {market.prices.map((price) => (
              <View key={price.goodId} style={styles.tableRow}>
                <View style={styles.goodCell}>
                  <Text style={styles.goodName}>
                    {price.goodName}
                    {essential.has(price.goodId) ? " · essential" : ""}
                  </Text>
                  <Text style={styles.goodUnit}>per {price.unitLabel}</Text>
                </View>
                <Text style={styles.price}>{formatPrice(price.priceSUSD)} SUSD</Text>
                <Text style={styles.stock}>{formatQuantity(price.stockQuantity)}</Text>
                <Text style={styles.capacity}>
                  {formatQuantity(price.dailyProductionCapacity)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  market: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  marketHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  marketTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  marketMeta: { color: colors.faint, fontSize: 10 },
  tableHeader: { flexDirection: "row", paddingBottom: spacing.xs },
  headerCell: { color: colors.faint, fontSize: 9, textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  goodCell: { flex: 1, paddingRight: spacing.sm },
  numberCell: { width: 72, textAlign: "right" },
  capacityCell: { width: 78, textAlign: "right" },
  goodName: { color: colors.text, fontSize: 12 },
  goodUnit: { color: colors.faint, fontSize: 9 },
  price: {
    color: colors.accent,
    fontSize: 10,
    width: 72,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  stock: {
    color: colors.muted,
    fontSize: 10,
    width: 72,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  capacity: {
    color: colors.muted,
    fontSize: 10,
    width: 78,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});
