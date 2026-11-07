/**
 * D-140 / D-150 (plan section 11, Money screen): adopting another currency or
 * establishing an own one. Player country only; the worker validates and applies the
 * action atomically; the previews here are estimates from the snapshot.
 */

import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  formatQuantity,
  previewAdoptCurrency,
  previewEstablishCurrency,
  type CountrySnapshot,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Disclosure, Pill, StatRow } from "../components/ui";
import { TOUCH_TARGET, colors, radii, spacing, themedSheet, type } from "../theme";
import { useMoney } from "../format/useMoney";
import { useSimulation } from "../worker/SimulationProvider";

const STANDARDS = ["gold", "silver", "paper"] as const;

export function CurrencyChange({
  snapshot,
  country,
  canAct,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly country: CountrySnapshot;
  readonly canAct: boolean;
}) {
  const money = useMoney();
  const { applyAction } = useSimulation();
  const [target, setTarget] = useState<number | null>(null);
  const [standard, setStandard] = useState<(typeof STANDARDS)[number]>("gold");
  const [name, setName] = useState("");
  const [fundingText, setFundingText] = useState("0");

  if (country.monetaryArrangement === "own") {
    // Every valued currency other than ours; the worker refuses one no longer issued.
    const candidates = snapshot.currencies.filter(
      (currency) => currency.id !== country.currencyId && currency.rusdPerUnit !== null,
    );
    const preview = target === null ? null : previewAdoptCurrency(snapshot, country, target);
    return (
      <Disclosure title="Adopt another currency">
        <Text style={styles.help}>
          Giving up your currency redeems its circulation at today's value and closes the
          mint. Choose the currency you will use instead.
        </Text>
        <View style={styles.pills}>
          {candidates.map((currency) => (
            <Pill
              key={currency.id}
              label={currency.name}
              active={target === currency.id}
              onPress={() => setTarget(currency.id)}
              disabled={!canAct}
            />
          ))}
        </View>
        {preview === null ? null : (
          <View>
            <StatRow label="Circulation redeemed (estimate)" value={money.format(preview.redeemedRUSD)} />
            <StatRow label="Reserve cash to the treasury" value={money.format(preview.reserveCashToTreasuryRUSD)} />
            {preview.metalToSellKg > 0 ? (
              <StatRow label="Metal to sell in the home market" value={`${formatQuantity(preview.metalToSellKg)} kg`} />
            ) : null}
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
            <ActionButton
              label="Adopt this currency"
              disabled={!canAct || !preview.valid}
              onPress={() => applyAction({ kind: "adopt-currency", countryId: country.id, currencyId: target! })}
            />
          </View>
        )}
      </Disclosure>
    );
  }

  const funding = money.fromDisplay(Number(fundingText));
  const preview = previewEstablishCurrency(snapshot, country, {
    standard,
    reserveFundingRUSD: Number.isFinite(funding) ? funding : -1,
  });
  return (
    <Disclosure title="Establish an own currency">
      <Text style={styles.help}>
        An independent country may issue its own currency. It starts at the value of the
        currency you use now; the treasury funds the mint's reserve.
      </Text>
      <View style={styles.pills}>
        {STANDARDS.map((entry) => (
          <Pill
            key={entry}
            label={`${entry[0]!.toUpperCase()}${entry.slice(1)} standard`}
            active={standard === entry}
            onPress={() => setStandard(entry)}
            disabled={!canAct}
          />
        ))}
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name (optional)"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="New currency name"
          maxLength={64}
        />
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          value={fundingText}
          onChangeText={setFundingText}
          placeholder={`Reserve funding (${money.name})`}
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="Reserve funding from the treasury"
          keyboardType="numeric"
        />
      </View>
      <StatRow label="Treasury after funding" value={money.format(preview.treasuryAfterRUSD)} />
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
      <ActionButton
        label="Establish the currency"
        disabled={!canAct || !preview.valid}
        onPress={() =>
          applyAction({
            kind: "establish-currency",
            countryId: country.id,
            standard,
            name: name.trim().length === 0 ? null : name.trim(),
            reserveFundingRUSD: funding,
          })
        }
      />
    </Disclosure>
  );
}

const styles = themedSheet(() => ({
  help: { ...type.small, lineHeight: 17, marginTop: 4 },
  warning: { ...type.small, color: colors.red, marginTop: 4 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginVertical: spacing.xs },
  inputWrap: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
  },
  input: { ...type.body, minHeight: TOUCH_TARGET, color: colors.text },
}));
