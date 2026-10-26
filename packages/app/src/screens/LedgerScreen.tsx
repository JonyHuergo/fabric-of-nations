import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  fiscalResultLabel,
  formatSUSD,
  latestFinancePeriod,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { MiniBars, Section } from "../components/ui";
import { colors, spacing } from "../theme";

const FLOW_LABELS: Readonly<Record<string, string>> = {
  "goods-purchase": "Household goods",
  "input-purchase": "Production inputs",
  wages: "Wages",
  upkeep: "Upkeep",
};

export function LedgerScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const country = countryById(snapshot, countryId);
  if (country === null) {
    return (
      <Section title="Ledger">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const latest = latestFinancePeriod(country);
  const history = [...country.financeHistory].reverse();
  const netValues = country.financeHistory.map((period) => period.netFiscalResultSUSD);
  return (
    <View>
      <Section
        title="Ledger / financial summary"
        subtitle={`${country.name} · immutable monthly summaries. Closed periods are never rewritten.`}
      >
        {latest === null ? (
          <Text style={styles.empty}>
            No monthly close has run yet. Advance time to the end of the first civil month.
          </Text>
        ) : (
          <>
            <Text style={styles.result}>{fiscalResultLabel(latest.netFiscalResultSUSD)}</Text>
            <Text style={styles.resultDetail}>
              {formatSUSD(latest.netFiscalResultSUSD)} · period ending day{" "}
              {String(latest.periodEndDay)}
            </Text>
            {netValues.length > 1 ? <MiniBars values={netValues} /> : null}
          </>
        )}
      </Section>

      <Section title="Country fiscal lines" subtitle="Nominal SUSD; from the frozen pre-close trial balance.">
        {history.length === 0 ? (
          <Text style={styles.empty}>No closed periods.</Text>
        ) : (
          history.map((period) => (
            <View key={period.periodEndDay} style={styles.periodRow}>
              <Text style={styles.periodDate}>Day {String(period.periodEndDay)}</Text>
              <View style={styles.columns}>
                <Text style={styles.cell}>Tax {formatSUSD(period.incomeTaxSUSD)}</Text>
                <Text style={styles.cell}>Welfare {formatSUSD(period.welfareExpenseSUSD)}</Text>
                <Text style={styles.cell}>Interest {formatSUSD(period.interestExpenseSUSD)}</Text>
              </View>
              <Text
                style={[
                  styles.net,
                  period.netFiscalResultSUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatSUSD(period.netFiscalResultSUSD)}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section
        title="World gross flows"
        subtitle="The four M4b flow kinds; reported for the world, not allocated per country."
      >
        {latest === null ? (
          <Text style={styles.empty}>No closed period.</Text>
        ) : (
          Object.entries(latest.grossFlowTotals).map(([kind, value]) => (
            <View key={kind} style={styles.flowRow}>
              <Text style={styles.flowLabel}>{FLOW_LABELS[kind] ?? kind}</Text>
              <Text style={styles.flowValue}>{formatSUSD(value)}</Text>
            </View>
          ))
        )}
      </Section>

      <Section title="Debug diagnostics" subtitle="Bounded authoritative counters from the world.">
        <View style={styles.flowRow}>
          <Text style={styles.flowLabel}>Rejected player/AI actions</Text>
          <Text style={styles.flowValue}>{String(snapshot.diagnostics.invalidActionCount)}</Text>
        </View>
        <View style={styles.flowRow}>
          <Text style={styles.flowLabel}>Invariant failures</Text>
          <Text style={styles.flowValue}>{String(snapshot.diagnostics.invariantFailureCount)}</Text>
        </View>
        {snapshot.diagnostics.recentWarnings.map((warning, index) => (
          <Text key={`${String(index)}:${warning}`} style={styles.warning}>
            {warning}
          </Text>
        ))}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  result: { color: colors.text, fontSize: 22, fontWeight: "700" },
  resultDetail: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  periodRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  periodDate: { color: colors.text, fontSize: 12, fontWeight: "600" },
  columns: { flexDirection: "row", flexWrap: "wrap", marginTop: 3, columnGap: spacing.sm },
  cell: { color: colors.muted, fontSize: 10 },
  net: { fontSize: 12, fontWeight: "700", marginTop: 3, fontVariant: ["tabular-nums"] },
  positive: { color: colors.green },
  negative: { color: colors.red },
  flowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  flowLabel: { color: colors.muted, fontSize: 12 },
  flowValue: {
    color: colors.text,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  warning: { color: colors.faint, fontSize: 10, marginTop: 4 },
});
