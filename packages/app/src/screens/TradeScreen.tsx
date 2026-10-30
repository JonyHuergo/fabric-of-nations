import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatSUSD,
  previewTradePolicy,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { SliderField } from "../components/Slider";
import { ActionButton, Chip, Notice, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

/** Mirrors the simulation's numeric-safety bound for a monthly import quota. */
const MAX_TRADE_QUOTA_QUANTITY = 1e15;

/**
 * A practical per-good ceiling for the quota slider, derived from observed market
 * stock plus one month of production capacity. The authoritative bound is
 * MAX_TRADE_QUOTA_QUANTITY; this only keeps the control in a useful observed range.
 */
function quotaCeiling(
  snapshot: SimulationSnapshot,
  customsMarketIds: readonly number[],
  goodId: number,
  currentQuota: number | null,
): number {
  const administered = new Set(customsMarketIds);
  let observed = 0;
  for (const market of snapshot.markets) {
    if (administered.size > 0 && !administered.has(market.id)) continue;
    const price = market.prices.find((entry) => entry.goodId === goodId);
    if (price === undefined) continue;
    observed +=
      Math.max(0, price.stockQuantity) + Math.max(0, price.dailyProductionCapacity) * 30;
  }
  return Math.min(
    MAX_TRADE_QUOTA_QUANTITY,
    Math.max(100, observed, currentQuota ?? 0),
  );
}

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

  // The snapshot rebuilds the policy arrays every tick. Key the draft-reset effect on
  // the policy contents rather than array identity so a running simulation does not
  // erase an in-progress slider drag.
  const policySignature =
    country === null
      ? ""
      : country.trade.tariffRates
          .map((rate) => rate.toFixed(6))
          .concat(
            country.trade.importQuotaQuantity.map((quota) =>
              quota === null ? "none" : quota.toFixed(6),
            ),
            country.trade.exportRestricted.map((restricted) =>
              restricted ? "1" : "0",
            ),
          )
          .join("|");

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
    // `policySignature` captures the contents of all three authoritative arrays.
  }, [countryId, policySignature]);

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
  // Align the drafts with the snapshot's good list even on the first render, before
  // the effect above has filled the arrays.
  const parsedTariffs = goods.map((_good, index) => {
    const numeric = Number(tariffs[index] ?? "0");
    return Number.isFinite(numeric) ? numeric / 100 : Number.NaN;
  });
  const parsedQuotas = goods.map((_good, index) => {
    const trimmed = (quotas[index] ?? "").trim();
    if (trimmed === "" || trimmed === "-") return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  });
  const parsedBans = goods.map((_good, index) => bans[index] ?? false);
  const preview = previewTradePolicy(snapshot, country, {
    tariffRates: parsedTariffs.map((rate) => (Number.isNaN(rate) ? 0 : rate)),
    importQuotaQuantity: parsedQuotas.map((quota) =>
      quota === null || Number.isNaN(quota) ? null : quota,
    ),
    exportRestricted: parsedBans,
  });
  const applyPolicy = (overrides?: {
    readonly tariffs?: readonly number[];
    readonly quotas?: readonly (number | null)[];
  }): void => {
    const rates = overrides?.tariffs ?? parsedTariffs;
    const quotaValues = overrides?.quotas ?? parsedQuotas;
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may change trade policy.");
      return;
    }
    if (
      rates.some((rate) => Number.isNaN(rate)) ||
      quotaValues.some((quota) => quota !== null && Number.isNaN(quota))
    ) {
      setLocalError(
        "Enter numeric tariff percentages and quota quantities (unset means no quota).",
      );
      return;
    }
    const validated = previewTradePolicy(snapshot, country, {
      tariffRates: rates.map((rate) => (Number.isNaN(rate) ? 0 : rate)),
      importQuotaQuantity: quotaValues.map((quota) =>
        quota === null || Number.isNaN(quota) ? null : quota,
      ),
      exportRestricted: parsedBans,
    });
    if (validated.errors.length > 0) {
      setLocalError(validated.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-trade-policy",
      countryId: country.id,
      tariffRates: rates,
      importQuotaQuantity: quotaValues.map((quota) =>
        quota === null || Number.isNaN(quota) ? null : quota,
      ),
      exportRestricted: parsedBans,
    });
  };
  const setQuotaDraft = (index: number, value: string): void => {
    setQuotas((current) => {
      const next = [...current];
      next[index] = value;
      return next;
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
              : (snapshot.countrySummaries.find((entry) => entry.id === market.customsCountryId)?.tag ??
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
        market you administer. Quota is a monthly physical import ceiling; the No quota control
        leaves it uncapped. Export ban stops your own buildings exporting that good.
      </Text>
      {/*
        Trade slider commits go straight through applyPolicy rather than a deferred
        hook: this screen has one numeric pair per good, so a single coalescing slot
        cannot identify which good changed. `canAct` includes `!busy`, and the worker
        supervisor allows only one critical action at a time, so a second commit is
        impossible while an action is in flight. The Apply button remains for edits
        that span several goods.
      */}
      {goods.map((good, index) => {
        const tariffRate = parsedTariffs[index];
        const tariffPercent =
          tariffRate !== undefined && Number.isFinite(tariffRate)
            ? Math.min(100, Math.max(0, tariffRate * 100))
            : 0;
        const quotaDraft = parsedQuotas[index];
        const quota =
          typeof quotaDraft === "number" && Number.isFinite(quotaDraft)
            ? quotaDraft
            : null;
        const quotaValue = quota === null ? 0 : Math.max(0, quota);
        const quotaLimit = quotaCeiling(
          snapshot,
          country.trade.customsMarketIds,
          good.id,
          quota,
        );
        const quotaStep = Math.max(1, Math.round(quotaLimit / 100));
        return (
          <View key={good.id} style={styles.goodRow}>
            <Text style={styles.goodName}>{good.name}</Text>
            <SliderField
              label={`${good.name} tariff rate`}
              value={tariffPercent}
              min={0}
              max={100}
              step={0.5}
              precision={1}
              unit="%"
              disabled={!canAct}
              onChange={(value) =>
                setTariffs((current) => {
                  const next = [...current];
                  next[index] = value.toFixed(1);
                  return next;
                })
              }
              onCommit={(value) =>
                applyPolicy({
                  tariffs: parsedTariffs.map((rate, entryIndex) =>
                    entryIndex === index ? value / 100 : rate,
                  ),
                })
              }
              hint="Ad-valorem duty on the origin-market cargo value of imports entering a market this country administers."
            />
            <SliderField
              label={`${good.name} monthly import quota`}
              value={quotaValue}
              min={0}
              max={quotaLimit}
              step={quotaStep}
              precision={0}
              unit={good.unitLabel}
              disabled={!canAct || quota === null}
              onChange={(value) => setQuotaDraft(index, value.toFixed(0))}
              onCommit={(value) =>
                applyPolicy({
                  quotas: parsedQuotas.map((entry, entryIndex) =>
                    entryIndex === index ? value : entry,
                  ),
                })
              }
              hint={
                quota === null
                  ? "No quota is set. Toggle No quota off to enter a monthly ceiling."
                  : "Monthly physical ceiling on imports of this good into markets this country administers."
              }
            />
            <View style={styles.goodToggles}>
              <Chip
                label="No quota"
                active={quota === null}
                onPress={() => {
                  if (quota === null) {
                    // Enable a draft quota at the observed scale; the player must
                    // still choose a value, so nothing is sent yet.
                    setQuotaDraft(index, String(Math.round(quotaLimit)));
                    return;
                  }
                  setQuotaDraft(index, "");
                  // Removing a cap is a discrete policy change; send it at once.
                  applyPolicy({
                    quotas: parsedQuotas.map((entry, entryIndex) =>
                      entryIndex === index ? null : entry,
                    ),
                  });
                }}
                disabled={!canAct}
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
                style={[styles.banButton, parsedBans[index] ? styles.banButtonActive : null]}
              >
                <Text style={styles.banText}>
                  {parsedBans[index] ? "Export banned" : "Export allowed"}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

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
      <ActionButton
        label="Apply trade policy"
        disabled={!canAct}
        onPress={() => applyPolicy()}
      />
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
  goodToggles: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
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
