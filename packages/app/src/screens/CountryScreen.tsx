import { StyleSheet, Text, View } from "react-native";

import {
  buildEconomicExplanations,
  countryById,
  essentialGoodIds,
  formatCount,
  formatQuantity,
  formatRate,
  formatSUSD,
  latestMonthlyReport,
  marketsForCountry,
  productionCapacityForGood,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Notice, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";

export function CountryScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const country = countryById(snapshot, countryId);
  if (country === null) {
    return (
      <Section title="Economic overview">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const isPlayerCountry = snapshot.playerCountryId === country.id;
  const latest = latestMonthlyReport(country);
  const explanations = buildEconomicExplanations(snapshot, country);
  const markets = marketsForCountry(snapshot, country);
  const essentialGoods = essentialGoodIds(snapshot);
  const capacity = [...country.productionCapacityByGood]
    .filter((entry) => entry.dailyCapacity > 0)
    .sort((left, right) => right.dailyCapacity - left.dailyCapacity);

  return (
    <View>
      <Section
        title="Economic overview"
        subtitle={`${country.name} (${country.tag}) · ${snapshot.date.label} · ${
          isPlayerCountry ? "Player-controlled country" : "AI-controlled country"
        }`}
      >
        <View style={[styles.roleBadge, isPlayerCountry ? styles.playerBadge : styles.aiBadge]}>
          <Text style={styles.roleBadgeText}>
            {isPlayerCountry ? "PLAYER COUNTRY" : "AI-CONTROLLED"}
          </Text>
        </View>
        <StatRow
          label="Population"
          value={formatCount(country.population)}
          detail="people; stock."
        />
        <StatRow
          label="Working-age population"
          value={formatCount(country.workingAgePopulation)}
          detail="people aged 15–64; stock."
        />
        <StatRow
          label="Employed workers"
          value={formatCount(country.employedWorkers)}
          detail={`${formatCount(
            Math.max(0, country.workingAgePopulation - country.employedWorkers),
          )} working-age people are not in modeled employment (not an unemployment rate).`}
        />
        <StatRow
          label="Household hardship"
          value={formatRate(country.hardshipPopulationShare)}
          detail={`${String(country.blocksWithUnmetSubsistence)} blocks with any unmet subsistence day; ${String(
            country.blocksWithUnmetBasic,
          )} with any unmet basic day.`}
        />
        <StatRow
          label="Treasury cash"
          value={formatSUSD(country.treasuryCashSUSD)}
          detail="Country treasury asset balance; stock."
        />
        <StatRow
          label="Public debt"
          value={formatSUSD(country.debtOutstandingPrincipalSUSD)}
          detail={`Principal outstanding. Interest payable ${formatSUSD(country.debtInterestPayableSUSD)}.`}
        />
      </Section>

      <Section
        title="What needs attention"
        subtitle="Evidence from the current snapshot. These are observations and supported contributing constraints, not proof of a single cause."
      >
        {explanations.length === 0 ? (
          <Text style={styles.empty}>
            No major supported problem is flagged by the current E1 rules. Check Markets,
            Population, Budget, and Ledger for details.
          </Text>
        ) : (
          explanations.map((explanation) => (
            <Notice
              key={explanation.id}
              title={explanation.title}
              tone={
                explanation.severity === "critical"
                  ? "critical"
                  : explanation.severity === "warning"
                    ? "warning"
                    : "info"
              }
            >
              {explanation.observation}
              {"\n"}
              {explanation.evidence.join("\n")}
              {"\n"}
              Interpretation: {explanation.caveat}
              {"\n"}
              Look under: {labelForTarget(explanation.target)}.
            </Notice>
          ))
        )}
      </Section>

      <Section
        title="Production capacity by good"
        subtitle="Estimated current daily output at building level, condition, staffing, and productivity. This is capacity, not realized production or demand."
      >
        {capacity.length === 0 ? (
          <Text style={styles.empty}>No operational production capacity is recorded.</Text>
        ) : (
          capacity.slice(0, 8).map((entry) => (
            <StatRow
              key={entry.goodId}
              label={entry.goodName}
              value={`${formatQuantity(entry.dailyCapacity)} ${entry.unitLabel}/day`}
              detail={`${entry.category} · estimated capacity`}
            />
          ))
        )}
        {capacity.length > 8 ? (
          <Text style={styles.note}>
            {String(capacity.length - 8)} more goods with capacity are in the snapshot.
          </Text>
        ) : null}
      </Section>

      <Section
        title="Essential goods now"
        subtitle="Current stock and prices in the country's markets. Stock is a balance; capacity is an estimated daily flow. Historical market series are not retained."
      >
        {essentialGoods.length === 0 ? (
          <Text style={styles.empty}>No subsistence/basic need tiers are exposed.</Text>
        ) : (
          essentialGoods.map((goodId) => {
            const good = snapshot.goods.find((entry) => entry.id === goodId);
            if (good === undefined) return null;
            let stock = 0;
            const prices: number[] = [];
            for (const market of markets) {
              const price = market.prices.find((entry) => entry.goodId === goodId);
              if (price === undefined) continue;
              stock += price.stockQuantity;
              prices.push(price.priceSUSD);
            }
            const minPrice = prices.length === 0 ? null : Math.min(...prices);
            const maxPrice = prices.length === 0 ? null : Math.max(...prices);
            const priceText =
              minPrice === null || maxPrice === null
                ? "no market price"
                : minPrice === maxPrice
                  ? `${minPrice.toFixed(4)} SUSD`
                  : `${minPrice.toFixed(4)}–${maxPrice.toFixed(4)} SUSD`;
            return (
              <View key={goodId} style={styles.goodRow}>
                <View style={styles.goodMain}>
                  <Text style={styles.goodName}>{good.name}</Text>
                  <Text style={styles.goodDetail}>
                    Stock {formatQuantity(stock)} {good.unitLabel} · capacity{" "}
                    {formatQuantity(productionCapacityForGood(country, goodId))} {good.unitLabel}/day
                  </Text>
                </View>
                <Text style={styles.goodPrice}>{priceText}</Text>
              </View>
            );
          })
        )}
      </Section>

      <Section
        title="Latest closed month"
        subtitle={
          latest === null
            ? "No monthly close has run yet."
            : `${latest.periodStartLabel} to ${latest.periodEndLabel}. Flows are closed-period actuals; balances are end-of-close.`
        }
      >
        {latest === null ? (
          <Text style={styles.empty}>Advance to the end of the first civil month.</Text>
        ) : (
          <>
            <StatRow label="Income tax" value={formatSUSD(latest.incomeTaxSUSD)} detail="flow" />
            <StatRow
              label="Welfare expense"
              value={formatSUSD(latest.welfareExpenseSUSD)}
              detail="flow"
            />
            <StatRow
              label="Interest expense"
              value={formatSUSD(latest.interestExpenseSUSD)}
              detail="flow; distinct from principal"
            />
            <StatRow
              label="Net fiscal result"
              value={formatSUSD(latest.netFiscalResultSUSD)}
              detail="revenue minus expense for the closed month"
            />
            <StatRow
              label="Treasury at close"
              value={
                latest.treasuryCash?.endSUSD === undefined
                  ? "Not retained"
                  : formatSUSD(latest.treasuryCash.endSUSD)
              }
              detail={
                latest.treasuryCash?.changeSUSD === undefined ||
                latest.treasuryCash?.changeSUSD === null
                  ? "Balance change not derivable from the retained window"
                  : `Change ${formatSUSD(latest.treasuryCash.changeSUSD)} vs prior close`
              }
            />
            <Text style={styles.note}>
              A closing balance is not a period flow. Older compacted months retain fiscal
              flows but not account-level balances.
            </Text>
          </>
        )}
      </Section>

      <Section title="Where to investigate">
        <Text style={styles.note}>
          Shortages and prices: Markets. Household conditions and wages: Population. Policy
          affordability and debt: Budget. Closed months and action history: Ledger.
        </Text>
      </Section>
    </View>
  );
}

function labelForTarget(target: "markets" | "population" | "budget" | "ledger"): string {
  switch (target) {
    case "markets":
      return "Markets";
    case "population":
      return "Population";
    case "budget":
      return "Budget";
    case "ledger":
      return "Ledger";
  }
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  roleBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  playerBadge: { backgroundColor: colors.accent },
  aiBadge: { backgroundColor: colors.surfaceRaised },
  roleBadgeText: { color: colors.accentText, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  note: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: spacing.sm },
  goodRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.xs,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  goodMain: { flex: 1, paddingRight: spacing.sm },
  goodName: { color: colors.text, fontSize: 12, fontWeight: "600" },
  goodDetail: { color: colors.faint, fontSize: 9, marginTop: 2 },
  goodPrice: {
    color: colors.accent,
    fontSize: 10,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    maxWidth: 130,
  },
});
