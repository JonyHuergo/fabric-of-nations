import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  countryById,
  formatSUSD,
  previewTradePolicy,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Notice, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function marketLabel(snapshot: SimulationSnapshot, marketId: number): string {
  return snapshot.markets.find((market) => market.id === marketId)?.label ?? `Market ${marketId}`;
}

function goodLabel(snapshot: SimulationSnapshot, goodId: number): string {
  return snapshot.goods.find((good) => good.id === goodId)?.name ?? `Good ${goodId}`;
}

export function TradeScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyAction, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const goods = snapshot.goods;
  const [tariffs, setTariffs] = useState<string[]>([]);
  const [quotas, setQuotas] = useState<string[]>([]);
  const [bans, setBans] = useState<boolean[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    setTariffs(
      country.trade.tariffRates.map((rate) => (rate * 100).toFixed(1)),
    );
    setQuotas(
      country.trade.importQuotaQuantity.map((quota) =>
        quota === null ? "" : quota.toFixed(0),
      ),
    );
    setBans([...country.trade.exportRestricted]);
    setLocalError(null);
  }, [
    countryId,
    country?.trade.tariffRates,
    country?.trade.importQuotaQuantity,
    country?.trade.exportRestricted,
  ]);

  if (country === null) {
    return (
      <Section title="Trade & transport">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const isPlayerCountry =
    snapshot.playerCountryId !== null && country.id === snapshot.playerCountryId;
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const parsedTariffs = tariffs.map((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric / 100 : Number.NaN;
  });
  const parsedQuotas = quotas.map((value) => {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "-") return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  });
  const policyError =
    parsedTariffs.some((rate) => Number.isNaN(rate)) ||
    parsedQuotas.some((quota) => quota !== null && Number.isNaN(quota))
      ? "Enter numeric tariff percentages and quota quantities (blank means no quota)."
      : null;
  const preview = previewTradePolicy(snapshot, country, {
    tariffRates: parsedTariffs.map((rate) => (Number.isNaN(rate) ? 0 : rate)),
    importQuotaQuantity: parsedQuotas.map((quota) =>
      quota === null || Number.isNaN(quota) ? null : quota,
    ),
    exportRestricted: bans,
  });
  const submit = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may change trade policy.");
      return;
    }
    if (policyError !== null) {
      setLocalError(policyError);
      return;
    }
    if (preview.errors.length > 0) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-trade-policy",
      countryId: country.id,
      tariffRates: parsedTariffs,
      importQuotaQuantity: parsedQuotas.map((quota) =>
        quota === null || Number.isNaN(quota) ? null : quota,
      ),
      exportRestricted: bans,
    });
  };

  const lastDay = snapshot.trade.lastDay;

  return (
    <Section title="Trade & transport">
      {!isPlayerCountry ? (
        <Notice title="Read-only country" tone="warning">
          These are the observed trade flows and policy of the selected country. Only the
          player-controlled country can change policy.
        </Notice>
      ) : null}
      {localError !== null ? (
        <Notice title="Action rejected" tone="warning">
          {localError}
        </Notice>
      ) : null}

      <Text style={styles.heading}>Observed trade network</Text>
      <StatRow
        label="Inter-market trade"
        value={snapshot.trade.enabled ? "Enabled (authored routes)" : "No authored routes"}
      />
      <StatRow
        label="Consignments in transit"
        value={`${snapshot.trade.inTransitShipmentCount}`}
      />
      <Text style={styles.help}>
        Goods move between markets only over an authored route, in proportion to the
        infrastructure quality of both markets, and only when the destination price covers
        origin value plus freight, duty, and a provisional margin. Transit takes days; goods
        in transit are in no market's stock.
      </Text>
      {snapshot.trade.routes.map((route) => (
        <StatRow
          key={route.id}
          label={`${marketLabel(snapshot, route.marketAId)} ↔ ${marketLabel(snapshot, route.marketBId)}`}
          value={`dist ${route.distanceUnits.toFixed(1)} · ${route.transitDays}d · ${formatSUSD(route.capacitySUSDPerDay)}/day each way`}
        />
      ))}
      {snapshot.markets.map((market) => (
        <StatRow
          key={market.id}
          label={market.label}
          value={`infrastructure ${percent(market.infrastructure)} · customs ${
            market.customsCountryId === null
              ? "none"
              : (snapshot.countries.find((entry) => entry.id === market.customsCountryId)?.tag ??
                String(market.customsCountryId))
          }`}
        />
      ))}

      <Text style={styles.heading}>Last processed day</Text>
      {lastDay === null ? (
        <Text style={styles.empty}>No processed day yet.</Text>
      ) : (
        <>
          <StatRow label="Dispatched" value={`${lastDay.dispatchedShipments} shipment(s)`} />
          <StatRow label="Arrived" value={`${lastDay.arrivedShipments} shipment(s)`} />
          <StatRow label="Freight paid" value={formatSUSD(lastDay.freightPaidSUSD)} />
          <StatRow label="Duty paid to customs" value={formatSUSD(lastDay.dutyPaidSUSD)} />
          <StatRow
            label="Owner-funded working capital"
            value={formatSUSD(lastDay.ownerFundedSUSD)}
          />
          {lastDay.blocked.length === 0 ? (
            <Text style={styles.help}>No blocked shipment was recorded for that day.</Text>
          ) : (
            lastDay.blocked.map((entry, index) => (
              <Text key={`${String(index)}`} style={styles.warning}>
                {goodLabel(snapshot, entry.goodId)} {marketLabel(snapshot, entry.originMarketId)} →{" "}
                {marketLabel(snapshot, entry.destinationMarketId)}: {entry.reason}
              </Text>
            ))
          )}
          {lastDay.blockedTruncated ? (
            <Text style={styles.help}>
              Further blocked reasons were omitted; the list is bounded.
            </Text>
          ) : null}
        </>
      )}

      <Text style={styles.heading}>In transit</Text>
      {snapshot.trade.shipments.length === 0 ? (
        <Text style={styles.empty}>No consignments are in transit.</Text>
      ) : (
        snapshot.trade.shipments.map((shipment) => (
          <Text key={shipment.id} style={styles.shipment}>
            {goodLabel(snapshot, shipment.goodId)} {shipment.quantity.toFixed(0)} units ·{" "}
            {marketLabel(snapshot, shipment.originMarketId)} →{" "}
            {marketLabel(snapshot, shipment.destinationMarketId)} · arrives day{" "}
            {shipment.arrivalDay} · freight {formatSUSD(shipment.freightCostSUSD)} · duty{" "}
            {formatSUSD(shipment.dutySUSD)}
          </Text>
        ))
      )}
      {snapshot.trade.shipmentsTruncated ? (
        <Text style={styles.help}>Older consignments are omitted; the list is bounded.</Text>
      ) : null}

      <Text style={styles.heading}>Your customs frontier</Text>
      <StatRow
        label="Markets administered"
        value={
          country.trade.customsMarketIds.length === 0
            ? "None (customs-union member)"
            : country.trade.customsMarketIds.map((id) => marketLabel(snapshot, id)).join(", ")
        }
      />
      <StatRow
        label="Duty received this month"
        value={formatSUSD(country.trade.dutyReceivedMonthToDateSUSD)}
      />
      <StatRow
        label="Duty paid this month (as exporter)"
        value={formatSUSD(country.trade.dutyPaidMonthToDateSUSD)}
      />
      <StatRow
        label="Freight paid this month"
        value={formatSUSD(country.trade.freightPaidMonthToDateSUSD)}
      />
      <StatRow
        label="Exports this month (cargo value)"
        value={formatSUSD(country.trade.exportsValueMonthToDateSUSD)}
      />
      <StatRow
        label="Imports this month (cargo value)"
        value={formatSUSD(country.trade.importsValueMonthToDateSUSD)}
      />
      {preview.tariffInert ? (
        <Notice title="Tariff frontier" tone="warning">
          This country administers no customs market in this campaign, so its tariff schedule
          cannot be collected on any import. Export restrictions still apply to its own
          exporters.
        </Notice>
      ) : null}

      <Text style={styles.heading}>Policy (per good)</Text>
      <Text style={styles.help}>
        Tariff is an ad-valorem duty on the origin-market cargo value of imports entering a
        market you administer. Quota is a monthly physical import ceiling; blank means no
        quota. Export ban stops your own buildings exporting that good.
      </Text>
      {goods.map((good, index) => (
        <View key={good.id} style={styles.goodRow}>
          <Text style={styles.goodName}>{good.name}</Text>
          <View style={styles.goodInputs}>
            <TextInput
              style={styles.input}
              value={tariffs[index] ?? "0"}
              onChangeText={(value) =>
                setTariffs((current) => {
                  const next = [...current];
                  next[index] = value;
                  return next;
                })
              }
              keyboardType="decimal-pad"
              placeholder="tariff %"
              placeholderTextColor={colors.faint}
            />
            <TextInput
              style={styles.input}
              value={quotas[index] ?? ""}
              onChangeText={(value) =>
                setQuotas((current) => {
                  const next = [...current];
                  next[index] = value;
                  return next;
                })
              }
              keyboardType="decimal-pad"
              placeholder="quota"
              placeholderTextColor={colors.faint}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setBans((current) => {
                  const next = [...current];
                  next[index] = !next[index];
                  return next;
                })
              }
              style={[styles.banButton, bans[index] ? styles.banButtonActive : null]}
            >
              <Text style={styles.banText}>{bans[index] ? "Export banned" : "Export allowed"}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={styles.estimate}>
        <Text style={styles.estimateTitle}>Estimate (not a delivery promise)</Text>
        <StatRow
          label="Export-banned goods"
          value={`${preview.exportBannedGoodCount}`}
        />
        {preview.estimatedDutyPerUnitSUSD.map((duty, goodId) => (
          <StatRow
            key={goodId}
            label={`Estimated duty per ${goodLabel(snapshot, goodId)} unit`}
            value={formatSUSD(duty)}
          />
        ))}
        {preview.notes.map((note) => (
          <Text key={note} style={styles.help}>
            {note}
          </Text>
        ))}
        {preview.errors.map((error) => (
          <Text key={error} style={styles.warning}>
            {error}
          </Text>
        ))}
      </View>
      <ActionButton label="Apply trade policy" disabled={!canAct} onPress={submit} />
      <Text style={styles.help}>
        The worker validates the complete policy and recomputes trade from live stock,
        capacity, quota, and cash. Nothing here guarantees that a shipment will be dispatched
        or delivered.
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.muted,
  },
  heading: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  help: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  shipment: {
    fontSize: 12,
    color: colors.text,
    marginTop: spacing.xs,
  },
  warning: {
    marginTop: 4,
    fontSize: 12,
    color: colors.red,
  },
  goodRow: {
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  goodName: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
  goodInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  banButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  banButtonActive: {
    borderColor: colors.red,
    backgroundColor: colors.surfaceRaised,
  },
  banText: {
    fontSize: 12,
    color: colors.text,
  },
  estimate: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  estimateTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 4,
  },
});
