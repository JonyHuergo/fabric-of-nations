import { StyleSheet, Text, View } from "react-native";

import {
  formatPrice,
  formatQuantity,
  marketForCountry,
  sortedMarkets,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Section } from "../components/ui";
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
  return (
    <View>
      <Section
        title="Markets and prices"
        subtitle="Each market clears once per economic day. Prices are bounded daily adjustments, not equilibrium prices."
      >
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
            </View>
            {market.prices.map((price) => (
              <View key={price.goodId} style={styles.tableRow}>
                <View style={styles.goodCell}>
                  <Text style={styles.goodName}>{price.goodName}</Text>
                  <Text style={styles.goodUnit}>per {price.unitLabel}</Text>
                </View>
                <Text style={styles.price}>{formatPrice(price.priceSUSD)} SUSD</Text>
                <Text style={styles.stock}>{formatQuantity(price.stockQuantity)}</Text>
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
  numberCell: { width: 78, textAlign: "right" },
  goodName: { color: colors.text, fontSize: 12 },
  goodUnit: { color: colors.faint, fontSize: 9 },
  price: {
    color: colors.accent,
    fontSize: 11,
    width: 92,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  stock: {
    color: colors.muted,
    fontSize: 11,
    width: 62,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});
