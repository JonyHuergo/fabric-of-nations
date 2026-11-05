import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import {
  RUSD_UNIT_NAME,
  countryById,
  previewMonetaryPolicy,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, Disclosure, Headline, Notice, Pill, Section, StatRow } from "../components/ui";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { useMoney } from "../format/useMoney";

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function rate(value: number | null): string {
  return value === null ? "unavailable" : `${value.toFixed(6)} RUSD/unit`;
}

export function MoneyScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const money = useMoney();
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
    // The slider is always numeric; when no reference rate exists use the
    // documented placeholder default so both the slider and Apply agree.
    setParityText(
      (
        country.monetary.parityRusdPerUnit ??
        country.monetary.valuationRusdPerUnit ??
        0.2
      ).toFixed(6),
    );
    setReserveText("0");
    setConversionText("0");
    setLocalError(null);
  }, [
    countryId,
    country?.monetary.regime,
    country?.monetary.parityRusdPerUnit,
    country?.monetary.active,
  ]);

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;

  const applyMonetaryPolicy = (overrides?: {
    readonly parity?: number | null;
    readonly reserve?: number;
    readonly conversion?: number;
  }): void => {
    if (country === null) return;
    const parsedParity =
      overrides?.parity !== undefined
        ? overrides.parity
        : parityText.trim() === ""
          ? null
          : Number(parityText);
    const reserve = overrides?.reserve ?? Number(reserveText);
    // The player types the conversion in the display currency; the command carries RUSD.
    const conversion = overrides?.conversion ?? money.fromDisplay(Number(conversionText));
    // A managed regime's rate is rule-driven, so parity must be sent as unchanged.
    const parity = regime === "managed" ? null : parsedParity;
    const preview = previewMonetaryPolicy(snapshot, country, {
      regime,
      parityRusdPerUnit: parity,
      reserveTransferRUSD: Number.isFinite(reserve) ? reserve : 0,
      currencyConversionRUSD: Number.isFinite(conversion) ? conversion : 0,
    });
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may change monetary policy.");
      return;
    }
    const inputError =
      (parity !== null && !Number.isFinite(parity)) ||
      !Number.isFinite(reserve) ||
      !Number.isFinite(conversion)
        ? "Enter numeric parity, reserve transfer, and currency conversion values."
        : null;
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
      parityRusdPerUnit: parity,
      reserveTransferRUSD: reserve,
      currencyConversionRUSD: conversion,
    });
  };

  // Unconditional hooks before the country guard. The parity hook is disabled in
  // the managed regime, where the worker requires a null parity.
  const parityCommit = useDeferredCommit(
    (value) => applyMonetaryPolicy({ parity: value }),
    busy,
  );
  const reserveCommit = useDeferredCommit(
    (value) => applyMonetaryPolicy({ reserve: value }),
    busy,
  );

  if (country === null) {
    return (
      <Section title="Money & prices">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const parsedParity = parityText.trim() === "" ? null : Number(parityText);
  const parsedReserve = Number(reserveText);
  const parsedConversion = money.fromDisplay(Number(conversionText));
  const previewParity = regime === "managed" ? null : parsedParity;
  const preview = previewMonetaryPolicy(snapshot, country, {
    regime,
    parityRusdPerUnit: previewParity,
    reserveTransferRUSD: Number.isFinite(parsedReserve) ? parsedReserve : 0,
    currencyConversionRUSD: Number.isFinite(parsedConversion) ? parsedConversion : 0,
  });

  // The authoritative parity move is limited to 50% of the current parity, so the
  // slider spans half to one-and-a-half times the reference rate.
  const referenceParity =
    country.monetary.parityRusdPerUnit ??
    country.monetary.valuationRusdPerUnit ??
    0.2;
  const parityMin = Math.max(0.000001, referenceParity * 0.5);
  const parityMax = Math.max(parityMin, referenceParity * 1.5);
  const parityStep = Math.max(0.000001, referenceParity * 0.01);
  const paritySliderValue =
    parsedParity !== null && Number.isFinite(parsedParity)
      ? parsedParity
      : referenceParity;
  // Reserve transfers are bounded by treasury cash (deposit) and authority
  // reserves (withdrawal), the limits enforced by the worker.
  const reserveCeiling = Math.max(0, Math.floor(country.treasuryCashRUSD));
  const reserveFloor = country.monetary.active
    ? -Math.max(0, Math.floor(country.monetary.reserveCashRUSD))
    : 0;
  const reserveStep = Math.max(
    1,
    Math.round(Math.max(Math.abs(reserveFloor), reserveCeiling) / 100),
  );

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

      <Headline
        label="Price index, base 100"
        value={index.value.toFixed(2)}
        trend={snapshot.priceIndex.observations.map((observation) => observation.world - 100)}
        detail={`Year on year ${index.yearOnYearInflation === null ? "insufficient history" : percent(index.yearOnYearInflation)}`}
      />

      <Text style={styles.heading}>Currency and exchange rate</Text>
      {monetary.hasAuthority ? (
        <>
          <StatRow label="Regime" value={monetary.regime} />
          <StatRow label="Status" value={monetary.active ? "established" : "not established"} />
          <StatRow label="Parity" value={rate(monetary.parityRusdPerUnit)} />
          <StatRow label="Valuation" value={rate(monetary.valuationRusdPerUnit)} />
          <StatRow label="Reserves" value={money.format(monetary.reserveCashRUSD)} />
          <StatRow
            label="Currency in circulation"
            value={`${monetary.currencyIssuedUnits.toFixed(2)} units (${money.format(monetary.liabilityRUSD)})`}
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
            value={`${money.format(monetary.lastMonthExportsRUSD)} / ${money.format(monetary.lastMonthImportsRUSD)}`}
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
      <Notice title={`RUSD — ${RUSD_UNIT_NAME}`} tone="info">
        RUSD is Fabric of Nations' standard unit of economic measurement: one RUSD has
        the purchasing power of one US dollar of 1990. It allows currencies, prices,
        wages and other economic values to be compared across countries and years. It
        is not an actual national currency or legal tender, is not issued or adopted by
        any country, and is not the simulated US dollar, whose value moves. Amounts are
        shown in your display currency ({money.name}), converted from RUSD when shown;
        choose another in Settings.
      </Notice>
      <Text style={styles.help}>
        The valuation is RUSD per one unit of the country's currency. Domestic accounts
        and trade remain RUSD and are never converted twice.
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

      <Disclosure title={`World basket · ${String(snapshot.priceIndex.basket.length)} goods`}>
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

      </Disclosure>

      <Disclosure title={`Currencies · ${String(snapshot.currencies.length)}`}>
      {snapshot.currencies.map((currency) => (
        <StatRow
          key={currency.id}
          label={`${currency.key.toUpperCase()} — ${currency.name}`}
          value={
            currency.valuationStatus === "specified"
              ? `${(currency.rusdPerUnit ?? 0).toFixed(6)} RUSD/unit (${currency.valuationSource})`
              : "valuation unavailable (no rate is invented)"
          }
        />
      ))}
      </Disclosure>

      <Text style={styles.heading}>Policy</Text>
      <Text style={styles.help}>
        Establish or operate the reserve-backed authority. A positive reserve transfer
        moves treasury cash into the authority; a negative transfer withdraws reserves. A
        positive currency conversion sells currency to the external counterparty for
        reserves; negative redeems it. The managed regime requires an enacted currency law
        (Politics) and its rate is rule-driven, so parity is sent as unchanged.
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
      <SliderField
        label="Parity"
        value={paritySliderValue}
        min={parityMin}
        max={parityMax}
        step={parityStep}
        precision={6}
        unit="RUSD/unit"
        disabled={!canAct || regime === "managed"}
        pending={parityCommit.hasPending}
        onChange={(value) => setParityText(value.toFixed(6))}
        onCommit={(value) => parityCommit.submit(value)}
        hint={
          regime === "managed"
            ? "Managed rates are rule-driven; parity is sent as unchanged."
            : "RUSD per unit. A change may move at most 50% from the current parity."
        }
      />
      <SliderField
        label="Reserve transfer"
        value={Number.isFinite(parsedReserve) ? parsedReserve : 0}
        min={reserveFloor}
        max={reserveCeiling}
        step={reserveStep}
        precision={0}
        money={money}
        disabled={!canAct}
        pending={reserveCommit.hasPending}
        onChange={(value) => setReserveText(value.toFixed(0))}
        onCommit={(value) => reserveCommit.submit(value)}
        hint={
          country.monetary.active
            ? "Signed: positive deposits treasury cash into reserves; negative withdraws reserves."
            : "A positive transfer is required to establish the authority."
        }
      />
      <Text style={styles.label}>Currency conversion ({money.code}; signed)</Text>
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
          value={rate(preview.projectedValuationRusdPerUnit)}
        />
        <StatRow label="Projected reserves" value={money.format(preview.projectedReservesRUSD)} />
        <StatRow
          label="Projected currency liability"
          value={money.format(preview.projectedLiabilityRUSD)}
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
      <ActionButton
        label="Apply monetary policy"
        disabled={!canAct}
        onPress={() => applyMonetaryPolicy()}
      />
      <Text style={styles.help}>
        The worker validates the complete operation at the authoritative boundary and
        posts its balanced entries atomically. No money or currency appears without a
        counterpart, and an invalid operation leaves the world unchanged.
      </Text>
    </Section>
  );
}

const styles = themedSheet(() => ({
  empty: {
    color: colors.muted,
  },
  heading: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
  },
  help: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  warning: {
    marginTop: 4,
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.muted,
    marginBottom: 4,
  },
}));
