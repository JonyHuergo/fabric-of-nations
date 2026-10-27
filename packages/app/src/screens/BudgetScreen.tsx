import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  countryById,
  fiscalResultLabel,
  formatRate,
  formatSUSD,
  latestFinancePeriod,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, MiniBars, Pill, Section, StatRow } from "../components/ui";
import { colors, radii, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

export function BudgetScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyFiscalPolicy, running, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [taxText, setTaxText] = useState("0.05");
  const [welfareText, setWelfareText] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;
  const fiscalTax = country?.fiscal.incomeTaxRate ?? 0;
  const fiscalWelfare = country?.fiscal.welfareBudgetSUSDPerYear ?? 0;
  useEffect(() => {
    setTaxText((fiscalTax * 100).toFixed(2));
    setWelfareText(fiscalWelfare.toFixed(0));
  }, [countryId, fiscalTax, fiscalWelfare]);

  if (country === null) {
    return (
      <Section title="Budget">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const latest = latestFinancePeriod(country);
  const historyValues = country.financeHistory.map((period) => period.netFiscalResultSUSD);

  const apply = () => {
    if (!isPlayerCountry) {
      setLocalError(
        "This is an AI-controlled country. Fiscal policy can only be changed for the player country.",
      );
      return;
    }
    const taxPercent = Number.parseFloat(taxText);
    const welfare = Number.parseFloat(welfareText);
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
      setLocalError("Income tax must be between 0% and 100%.");
      return;
    }
    if (!Number.isFinite(welfare) || welfare < 0) {
      setLocalError("Welfare budget must be a non-negative annual SUSD amount.");
      return;
    }
    setLocalError(null);
    applyFiscalPolicy(country.id, taxPercent / 100, welfare);
  };

  return (
    <View>
      <Section
        title="Budget"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · changes apply at the next command boundary through the shared player/AI validator.`}
      >
        <StatRow label="Treasury cash" value={formatSUSD(country.treasuryCashSUSD)} />
        <StatRow label="Income tax" value={formatRate(fiscalTax)} detail="flat rate on actual wages" />
        <StatRow
          label="Welfare budget"
          value={`${formatSUSD(fiscalWelfare)}/yr`}
          detail="paid daily in proportion to population"
        />
        <StatRow
          label="Latest result"
          value={latest === null ? "Awaiting first close" : fiscalResultLabel(latest.netFiscalResultSUSD)}
          detail={latest === null ? "No closed period yet" : formatSUSD(latest.netFiscalResultSUSD)}
        />
      </Section>

      <Section title="Change fiscal policy" subtitle="The only M6/M7 economic policy action currently implemented.">
        <Text style={styles.inputLabel}>Income tax rate (%)</Text>
        <TextInput
          value={taxText}
          onChangeText={setTaxText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Income tax rate percent"
        />
        <View style={styles.quickRow}>
          {[0, 5, 10, 15, 25].map((value) => (
            <Pill
              key={value}
              label={`${String(value)}%`}
              active={Math.abs(Number.parseFloat(taxText) - value) < 0.001}
              onPress={() => {
                setTaxText(String(value));
              }}
            />
          ))}
        </View>
        <Text style={styles.inputLabel}>Welfare budget (SUSD per year)</Text>
        <TextInput
          value={welfareText}
          onChangeText={setWelfareText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Annual welfare budget in SUSD"
        />
        <View style={styles.quickRow}>
          {[0, 1_000_000, 10_000_000].map((value) => (
            <Pill
              key={value}
              label={value === 0 ? "0" : formatSUSD(value)}
              active={Math.abs(Number.parseFloat(welfareText) - value) < 0.5}
              onPress={() => {
                setWelfareText(String(value));
              }}
            />
          ))}
        </View>
        {localError === null ? null : <Text style={styles.error}>{localError}</Text>}
        <View style={styles.applyRow}>
          <ActionButton
            label={isPlayerCountry ? "Apply fiscal policy" : "AI-controlled country"}
            tone="accent"
            onPress={apply}
            disabled={!isPlayerCountry || busy || connection !== "ready"}
          />
        </View>
        {isPlayerCountry ? null : (
          <Text style={styles.note}>
            This country is governed by the AI. Select the player country (shown as
            &quot;Player country&quot; on Budget/Country) to change fiscal policy.
          </Text>
        )}
        {running ? (
          <Text style={styles.note}>
            Simulation is running. Actions are accepted between ticks; pause for a predictable
            day.
          </Text>
        ) : null}
      </Section>

      <Section title="Net fiscal history" subtitle="Last closed months; bars show surplus or deficit.">
        {historyValues.length === 0 ? (
          <Text style={styles.empty}>No monthly close has run yet.</Text>
        ) : (
          <>
            <MiniBars values={historyValues} />
            {country.financeHistory
              .slice()
              .reverse()
              .slice(0, 6)
              .map((period) => (
                <StatRow
                  key={period.periodEndDay}
                  label={`Period ending day ${String(period.periodEndDay)}`}
                  value={formatSUSD(period.netFiscalResultSUSD)}
                  detail={`Tax ${formatSUSD(period.incomeTaxSUSD)} · welfare ${formatSUSD(period.welfareExpenseSUSD)}`}
                />
              ))}
          </>
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  inputLabel: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, rowGap: spacing.xs },
  applyRow: { marginTop: spacing.md },
  error: { color: colors.red, fontSize: 12, marginTop: spacing.sm },
  note: { color: colors.faint, fontSize: 11, marginTop: spacing.sm, lineHeight: 16 },
});
