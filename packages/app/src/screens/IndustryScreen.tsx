import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatRUSD,
  previewIndustrialPolicy,
  previewPublicEnterpriseSupport,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

/**
 * One enterprise support amount. A child component keeps a stable hook count for
 * the variable-length enterprise list while still coalescing rapid commits.
 */
function EnterpriseSupportField({
  label,
  value,
  max,
  disabled,
  busy,
  onChange,
  onApply,
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly onChange: (value: number) => void;
  readonly onApply: (value: number) => void;
}) {
  const commit = useDeferredCommit((amount) => onApply(amount), busy);
  return (
    <SliderField
      label={label}
      value={value}
      min={0}
      max={max}
      step={Math.max(1, Math.round(max / 100))}
      precision={0}
      unit="RUSD"
      disabled={disabled}
      pending={commit.hasPending}
      onChange={onChange}
      onCommit={(amount) => commit.submit(amount)}
      hint="A positive capital contribution from treasury cash; it is not an expense."
    />
  );
}

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

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;

  const applyIndustrialPolicy = (overrides?: {
    readonly index: number;
    readonly percent: number;
  }): void => {
    if (country === null) return;
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may set industrial policy.");
      return;
    }
    const rates = country.industrialPolicy.sectors.map((sector, index) => {
      const percent =
        overrides !== undefined && overrides.index === index
          ? overrides.percent
          : Number(rateTexts[index] ?? sector.subsidyRate * 100);
      return Number.isFinite(percent) ? percent / 100 : Number.NaN;
    });
    const preview = previewIndustrialPolicy(snapshot, country, rates);
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

  // One coalescing hook per registered sector (the protocol fixes this at five),
  // placed before the country guard so hook order is unconditional.
  const sectorCommits = [
    useDeferredCommit((value) => applyIndustrialPolicy({ index: 0, percent: value }), busy),
    useDeferredCommit((value) => applyIndustrialPolicy({ index: 1, percent: value }), busy),
    useDeferredCommit((value) => applyIndustrialPolicy({ index: 2, percent: value }), busy),
    useDeferredCommit((value) => applyIndustrialPolicy({ index: 3, percent: value }), busy),
    useDeferredCommit((value) => applyIndustrialPolicy({ index: 4, percent: value }), busy),
  ];

  if (country === null) {
    return (
      <Section title="Industry">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const rates = country.industrialPolicy.sectors.map((sector, index) => {
    const parsed = Number(rateTexts[index] ?? sector.subsidyRate * 100);
    return Number.isFinite(parsed) ? parsed / 100 : Number.NaN;
  });
  const preview = previewIndustrialPolicy(snapshot, country, rates);
  const applyEnterpriseSupport = (buildingId: number, amountRUSD: number): void => {
    const support = previewPublicEnterpriseSupport(
      snapshot,
      country,
      buildingId,
      amountRUSD,
    );
    if (!support.valid) {
      setLocalError(support.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "support-public-enterprise",
      countryId: country.id,
      buildingId,
      amountRUSD,
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
          value={formatRUSD(country.treasuryCashRUSD)}
          detail={`Subsidy requested this month ${formatRUSD(country.industrialPolicy.requestedMonthToDateRUSD)} · paid ${formatRUSD(country.industrialPolicy.paidMonthToDateRUSD)} · shortfall ${formatRUSD(country.industrialPolicy.shortfallMonthToDateRUSD)}`}
        />
        <StatRow
          label="Static daily subsidy estimate"
          value={formatRUSD(preview.estimatedDailySubsidyRUSD)}
          detail="Current sector capacity valued at current market prices times the proposed rates. Actual payment uses verified daily output and actual cash."
        />
      </Section>

      <Section
        title="Sector production subsidies"
        subtitle="Rates are ad-valorem percentages of verified gross output value. A subsidy is a treasury expense and taxable enterprise revenue; an unpaid entitlement is a reported shortfall."
      >
        {country.industrialPolicy.sectors.map((sector, index) => {
          const sectorCommit = sectorCommits[index];
          const parsedPercent = Number(
            rateTexts[index] ?? sector.subsidyRate * 100,
          );
          return (
            <View key={sector.key} style={styles.sector}>
              <View style={styles.rowText}>
                <Text style={styles.label}>{sector.label}</Text>
                <Text style={styles.detail}>
                  Current capacity value {formatRUSD(sector.estimatedDailyOutputValueRUSD)}/day · policy rate{" "}
                  {(sector.subsidyRate * 100).toFixed(2)}%
                </Text>
              </View>
              <SliderField
                label={`${sector.label} subsidy rate`}
                value={Number.isFinite(parsedPercent) ? parsedPercent : 0}
                min={0}
                max={100}
                step={0.5}
                precision={1}
                unit="%"
                disabled={!canAct}
                pending={sectorCommit?.hasPending === true}
                onChange={(value) =>
                  setRateTexts((current) => {
                    const next = [...current];
                    next[index] = value.toFixed(2);
                    return next;
                  })
                }
                onCommit={(value) => sectorCommit?.submit(value)}
                hint="Ad-valorem share of verified gross output value."
              />
            </View>
          );
        })}
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
            onPress={() => applyIndustrialPolicy()}
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
            const maxSupport = Math.max(0, Math.floor(country.treasuryCashRUSD));
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
                  {formatRUSD(enterprise.operatingCashRUSD)}
                </Text>
                <EnterpriseSupportField
                  label={`${enterprise.definitionName} capital support`}
                  value={
                    Number.isFinite(amount)
                      ? Math.max(0, Math.min(maxSupport, amount))
                      : 0
                  }
                  max={maxSupport}
                  disabled={!canAct}
                  busy={busy}
                  onChange={(value) =>
                    setSupportTexts((current) => ({
                      ...current,
                      [enterprise.buildingId]: value.toFixed(0),
                    }))
                  }
                  onApply={(value) =>
                    applyEnterpriseSupport(enterprise.buildingId, value)
                  }
                />
                <View style={styles.applyRow}>
                  <ActionButton
                    label="Contribute capital"
                    onPress={() => applyEnterpriseSupport(enterprise.buildingId, amount)}
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
  sector: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1 },
  label: { color: colors.text, fontSize: 12, fontWeight: "700" },
  detail: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
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
});
