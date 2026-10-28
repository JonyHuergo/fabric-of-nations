import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  countryById,
  formatSUSD,
  previewMonetaryPolicy,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Notice, Pill, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function rate(value: number | null): string {
  return value === null ? "unavailable" : `${value.toFixed(6)} SUSD/unit`;
}

export function MoneyScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyAction, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [regime, setRegime] = useState<"pegged" | "managed">("pegged");
  const [parityText, setParityText] = useState("");
  const [reserveText, setReserveText] = useState("0");
  const [conversionText, setConversionText] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    setRegime(country.monetary.regime === "managed" ? "managed" : "pegged");
    setParityText(
      country.monetary.paritySusdPerUnit === null
        ? ""
        : country.monetary.paritySusdPerUnit.toFixed(6),
    );
    setReserveText("0");
    setConversionText("0");
    setLocalError(null);
  }, [
    countryId,
    country?.monetary.regime,
    country?.monetary.paritySusdPerUnit,
    country?.monetary.active,
  ]);

  if (country === null) {
    return (
      <Section title="Money & prices">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const isPlayerCountry =
    snapshot.playerCountryId !== null && country.id === snapshot.playerCountryId;
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const parsedParity = parityText.trim() === "" ? null : Number(parityText);
  const parsedReserve = Number(reserveText);
  const parsedConversion = Number(conversionText);
  const inputError =
    (parsedParity !== null && !Number.isFinite(parsedParity)) ||
    !Number.isFinite(parsedReserve) ||
    !Number.isFinite(parsedConversion)
      ? "Enter numeric parity, reserve transfer, and currency conversion values."
      : null;
  const preview = previewMonetaryPolicy(snapshot, country, {
    regime,
    paritySusdPerUnit: parsedParity,
    reserveTransferSUSD: Number.isFinite(parsedReserve) ? parsedReserve : 0,
    currencyConversionSUSD: Number.isFinite(parsedConversion) ? parsedConversion : 0,
  });
  const submit = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may change monetary policy.");
      return;
    }
    if (inputError !== null) {
      setLocalError(inputError);
      return;
    }
    if (preview.errors.length > 0) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-monetary-policy",
      countryId: country.id,
      regime,
      paritySusdPerUnit: parsedParity,
      reserveTransferSUSD: parsedReserve,
      currencyConversionSUSD: parsedConversion,
    });
  };

  const index = country.priceIndex;
  const monetary = country.monetary;

  return (
    <Section title="Money & prices">
      {!isPlayerCountry ? (
        <Notice title="Read-only country" tone="warning">
          These are the observed monetary and price conditions of the selected country.
          Only the player-controlled country can change policy.
        </Notice>
      ) : null}
      {localError !== null ? (
        <Notice title="Action rejected" tone="warning">
          {localError}
        </Notice>
      ) : null}

      <Text style={styles.heading}>Currency and exchange rate</Text>
      {monetary.hasAuthority ? (
        <>
          <StatRow label="Regime" value={monetary.regime} />
          <StatRow label="Status" value={monetary.active ? "established" : "not established"} />
          <StatRow label="Parity" value={rate(monetary.paritySusdPerUnit)} />
          <StatRow label="Valuation" value={rate(monetary.valuationSusdPerUnit)} />
          <StatRow label="Reserves" value={formatSUSD(monetary.reserveCashSUSD)} />
          <StatRow
            label="Currency in circulation"
            value={`${monetary.currencyIssuedUnits.toFixed(2)} units (${formatSUSD(monetary.liabilitySUSD)})`}
          />
          <StatRow
            label="Reserve cover"
            value={
              monetary.reserveCoverMonths === null
                ? "no completed-month imports yet"
                : `${monetary.reserveCoverMonths.toFixed(2)} months of imports`
            }
          />
          <StatRow
            label="Convertibility"
            value={
              monetary.convertibility === "suspended"
                ? "suspended — imports into this market are blocked"
                : monetary.convertibility
            }
          />
          <StatRow
            label="Last parity change"
            value={monetary.lastParityChangeDay === null ? "none" : `day ${monetary.lastParityChangeDay}`}
          />
          <StatRow
            label="Last completed month exports / imports"
            value={`${formatSUSD(monetary.lastMonthExportsSUSD)} / ${formatSUSD(monetary.lastMonthImportsSUSD)}`}
          />
        </>
      ) : (
        <Notice title="No monetary authority" tone="info">
          {monetary.blockedReason === "adopted-or-shared-currency"
            ? "This country adopts or shares another country's currency, so it has no independent monetary authority."
            : monetary.blockedReason === "monetary-system-disabled"
              ? "The monetary system is not enabled in this campaign."
              : "No authority has been established yet. Declare a parity and transfer reserves from the treasury to establish one."}
        </Notice>
      )}
      <Text style={styles.help}>
        SUSD is the fixed unit of measurement and accounting denomination; it is not a
        national currency. The valuation is SUSD per one unit of the country's currency.
        Domestic accounts and trade remain SUSD and are never converted twice.
      </Text>

      <Text style={styles.heading}>Price index (measured, base 100)</Text>
      <StatRow label="Base period" value={`day ${index.baseDayIndex} (scenario start)`} />
      <StatRow label="Index value" value={index.value.toFixed(4)} />
      <StatRow label="Basket coverage" value={percent(index.coverage)} />
      <StatRow
        label="Month-on-month"
        value={index.monthOnMonthInflation === null ? "insufficient history" : percent(index.monthOnMonthInflation)}
      />
      <StatRow
        label="Year-on-year"
        value={index.yearOnYearInflation === null ? "insufficient history" : percent(index.yearOnYearInflation)}
      />
      <Text style={styles.help}>
        The index is a Laspeyres measure of the reference-household needs basket. Missing
        prices are excluded and reduce coverage; new goods not in the basket are excluded.
        It never changes prices, wages, taxes, or accounts.
      </Text>

      <Text style={styles.heading}>World basket ({snapshot.priceIndex.basket.length} goods)</Text>
      {snapshot.priceIndex.basket.map((item) => (
        <StatRow
          key={item.goodId}
          label={item.goodName}
          value={`weight ${item.weight.toFixed(4)} per capita/day`}
        />
      ))}
      <StatRow label="World index" value={snapshot.priceIndex.worldValue.toFixed(4)} />
      <StatRow label="World coverage" value={percent(snapshot.priceIndex.coverage)} />
      <StatRow
        label="World month-on-month"
        value={
          snapshot.priceIndex.monthOnMonthInflation === null
            ? "insufficient history"
            : percent(snapshot.priceIndex.monthOnMonthInflation)
        }
      />
      <StatRow
        label="World year-on-year"
        value={
          snapshot.priceIndex.yearOnYearInflation === null
            ? "insufficient history"
            : percent(snapshot.priceIndex.yearOnYearInflation)
        }
      />
      {snapshot.priceIndex.observations.length === 0 ? (
        <Text style={styles.empty}>No month-end observation has been recorded yet.</Text>
      ) : (
        snapshot.priceIndex.observations.slice(-6).map((observation) => (
          <StatRow
            key={observation.dayIndex}
            label={`${observation.year}-${String(observation.month).padStart(2, "0")}`}
            value={observation.world.toFixed(4)}
          />
        ))
      )}

      <Text style={styles.heading}>Currencies</Text>
      {snapshot.currencies.map((currency) => (
        <StatRow
          key={currency.id}
          label={`${currency.key.toUpperCase()} — ${currency.name}`}
          value={
            currency.valuationStatus === "specified"
              ? `${(currency.susdPerUnit ?? 0).toFixed(6)} SUSD/unit (${currency.valuationSource})`
              : "valuation unavailable (no rate is invented)"
          }
        />
      ))}

      <Text style={styles.heading}>Policy</Text>
      <Text style={styles.help}>
        Establish or operate the reserve-backed authority. A positive reserve transfer
        moves treasury cash into the authority; a negative transfer withdraws reserves. A
        positive currency conversion sells currency to the external counterparty for
        reserves; negative redeems it. The managed regime requires an enacted currency law
        (Politics) and its rate is rule-driven, so the parity field must be blank.
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>Regime</Text>
        <Pill
          label="Pegged"
          active={regime === "pegged"}
          onPress={() => setRegime("pegged")}
          disabled={!canAct}
        />
        <Pill
          label="Managed"
          active={regime === "managed"}
          onPress={() => setRegime("managed")}
          disabled={!canAct}
        />
      </View>
      <Text style={styles.label}>Parity (SUSD per unit; blank = unchanged)</Text>
      <TextInput
        style={styles.input}
        value={parityText}
        onChangeText={setParityText}
        keyboardType="decimal-pad"
        placeholder="e.g. 0.200000"
        placeholderTextColor={colors.faint}
      />
      <Text style={styles.label}>Reserve transfer (SUSD; signed)</Text>
      <TextInput
        style={styles.input}
        value={reserveText}
        onChangeText={setReserveText}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.faint}
      />
      <Text style={styles.label}>Currency conversion (SUSD; signed)</Text>
      <TextInput
        style={styles.input}
        value={conversionText}
        onChangeText={setConversionText}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.faint}
      />

      <View style={styles.estimate}>
        <Text style={styles.estimateTitle}>Estimate (not a forecast)</Text>
        <StatRow
          label="Projected valuation"
          value={rate(preview.projectedValuationSusdPerUnit)}
        />
        <StatRow label="Projected reserves" value={formatSUSD(preview.projectedReservesSUSD)} />
        <StatRow
          label="Projected currency liability"
          value={formatSUSD(preview.projectedLiabilitySUSD)}
        />
        <StatRow
          label="Projected reserve cover"
          value={
            preview.projectedCoverMonths === null
              ? "not available"
              : `${preview.projectedCoverMonths.toFixed(2)} months`
          }
        />
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
      <ActionButton label="Apply monetary policy" disabled={!canAct} onPress={submit} />
      <Text style={styles.help}>
        The worker validates the complete operation at the authoritative boundary and
        posts its balanced entries atomically. No money or currency appears without a
        counterpart, and an invalid operation leaves the world unchanged.
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
  warning: {
    marginTop: 4,
    fontSize: 12,
    color: colors.red,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  label: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.muted,
  },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    color: colors.text,
    backgroundColor: colors.surface,
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
