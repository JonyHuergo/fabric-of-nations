import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  countryById,
  formatSUSD,
  previewIndustrialPolicy,
  previewPublicEnterpriseSupport,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

export function IndustryScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyAction, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [rateTexts, setRateTexts] = useState<string[]>([]);
  const [supportTexts, setSupportTexts] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    setRateTexts(
      country.industrialPolicy.sectors.map((sector) =>
        (sector.subsidyRate * 100).toFixed(2),
      ),
    );
  }, [countryId, country]);

  if (country === null) {
    return (
      <Section title="Industry">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const isPlayerCountry =
    snapshot.playerCountryId !== null && country.id === snapshot.playerCountryId;
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const rates = country.industrialPolicy.sectors.map((sector, index) => {
    const parsed = Number(rateTexts[index] ?? sector.subsidyRate * 100);
    return Number.isFinite(parsed) ? parsed / 100 : Number.NaN;
  });
  const preview = previewIndustrialPolicy(snapshot, country, rates);

  const applyPolicy = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may set industrial policy.");
      return;
    }
    if (!preview.valid) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-industrial-policy",
      countryId: country.id,
      sectorSubsidyRates: rates,
    });
  };

  return (
    <View>
      <Section
        title="Industry"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · sector subsidies are paid against verified output from actual treasury cash, not capacity or a policy score.`}
      >
        <StatRow
          label="Treasury cash (stock)"
          value={formatSUSD(country.treasuryCashSUSD)}
          detail={`Subsidy requested this month ${formatSUSD(country.industrialPolicy.requestedMonthToDateSUSD)} · paid ${formatSUSD(country.industrialPolicy.paidMonthToDateSUSD)} · shortfall ${formatSUSD(country.industrialPolicy.shortfallMonthToDateSUSD)}`}
        />
        <StatRow
          label="Static daily subsidy estimate"
          value={formatSUSD(preview.estimatedDailySubsidySUSD)}
          detail="Current sector capacity valued at current market prices times the proposed rates. Actual payment uses verified daily output and actual cash."
        />
      </Section>

      <Section
        title="Sector production subsidies"
        subtitle="Rates are ad-valorem percentages of verified gross output value. A subsidy is a treasury expense and taxable enterprise revenue; an unpaid entitlement is a reported shortfall."
      >
        {country.industrialPolicy.sectors.map((sector, index) => (
          <View key={sector.key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>{sector.label}</Text>
              <Text style={styles.detail}>
                Current capacity value {formatSUSD(sector.estimatedDailyOutputValueSUSD)}/day · policy rate{" "}
                {(sector.subsidyRate * 100).toFixed(2)}%
              </Text>
            </View>
            <TextInput
              value={rateTexts[index] ?? ""}
              onChangeText={(text) =>
                setRateTexts((current) => {
                  const next = [...current];
                  next[index] = text;
                  return next;
                })
              }
              keyboardType="decimal-pad"
              editable={canAct}
              style={styles.rateInput}
              accessibilityLabel={`${sector.label} subsidy rate percent`}
            />
            <Text style={styles.unit}>%</Text>
          </View>
        ))}
        {preview.errors.map((error) => (
          <Text key={error} style={styles.error}>
            • {error}
          </Text>
        ))}
        {preview.constraints.map((constraint) => (
          <Text key={constraint} style={styles.note}>
            • {constraint}
          </Text>
        ))}
        {localError === null ? null : <Text style={styles.error}>{localError}</Text>}
        <View style={styles.applyRow}>
          <ActionButton
            label={isPlayerCountry ? "Apply industrial policy" : "AI-controlled country"}
            tone="accent"
            onPress={applyPolicy}
            disabled={!canAct || !preview.valid}
          />
        </View>
      </Section>

      <Section
        title="Public enterprises"
        subtitle="Existing state-owned productive buildings. Capital support changes operating cash and equity; it does not guarantee inputs, sales, or profit, and ordinary wages, upkeep, tax, and state remittance still apply."
      >
        {country.publicEnterprises.length === 0 ? (
          <Text style={styles.empty}>
            No state-owned enterprises in this country. Complete a public construction project
            first.
          </Text>
        ) : (
          country.publicEnterprises.map((enterprise) => {
            const amount = Number(supportTexts[enterprise.buildingId] ?? "");
            const support = previewPublicEnterpriseSupport(
              snapshot,
              country,
              enterprise.buildingId,
              Number.isFinite(amount) ? amount : 0,
            );
            return (
              <View key={enterprise.buildingId} style={styles.enterprise}>
                <Text style={styles.enterpriseTitle}>
                  #{String(enterprise.buildingId)} {enterprise.definitionName} ·{" "}
                  {enterprise.regionName}
                </Text>
                <Text style={styles.detail}>
                  {enterprise.sector} · level {String(enterprise.level)} · condition{" "}
                  {enterprise.condition.toFixed(2)} · operating cash{" "}
                  {formatSUSD(enterprise.operatingCashSUSD)}
                </Text>
                <View style={styles.supportRow}>
                  <TextInput
                    value={supportTexts[enterprise.buildingId] ?? ""}
                    onChangeText={(text) =>
                      setSupportTexts((current) => ({
                        ...current,
                        [enterprise.buildingId]: text,
                      }))
                    }
                    keyboardType="decimal-pad"
                    editable={canAct}
                    placeholder="Support amount SUSD"
                    placeholderTextColor={colors.faint}
                    style={styles.supportInput}
                  />
                  <ActionButton
                    label="Contribute capital"
                    onPress={() => {
                      if (!support.valid) {
                        setLocalError(support.errors.join(" "));
                        return;
                      }
                      setLocalError(null);
                      applyAction({
                        kind: "support-public-enterprise",
                        countryId: country.id,
                        buildingId: enterprise.buildingId,
                        amountSUSD: amount,
                      });
                    }}
                    disabled={!canAct || !support.valid}
                  />
                </View>
              </View>
            );
          })
        )}
        {localError === null ? null : <Text style={styles.error}>{localError}</Text>}
      </Section>

      <Section title="Deliberately not implemented">
        <Text style={styles.note}>
          Private co-financing, subsidies paid to private investors, loans, guarantees,
          procurement contracts beyond construction materials, and public-enterprise expansion or
          discontinuation are not exposed. They require ownership/investment instruments and, for
          guarantees or loans, explicit contingent-liability or credit mechanics. No decorative
          "industrial score" is shown.
        </Text>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowText: { flex: 1 },
  label: { color: colors.text, fontSize: 12, fontWeight: "700" },
  detail: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  unit: { color: colors.muted, fontSize: 12 },
  rateInput: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    color: colors.text,
    minWidth: 86,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textAlign: "right",
  },
  error: { color: colors.red, fontSize: 12, marginTop: spacing.sm },
  note: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 4 },
  applyRow: { marginTop: spacing.md },
  enterprise: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  enterpriseTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
  supportRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  supportInput: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    color: colors.text,
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
